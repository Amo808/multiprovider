import os
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Response, Cookie
from pydantic import BaseModel
from google.oauth2 import id_token
from google.auth.transport import requests
from jose import jwt, JWTError

DEV_MODE = os.getenv("DEV_MODE", "0") == "1"
STATIC_DEV_USER = os.getenv("DEV_STATIC_USER", "dev@example.com")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
JWT_SECRET = os.getenv("JWT_SECRET", "change_me_secret")
JWT_ALGORITHM = "HS256"
# Separate expirations for access & refresh
JWT_ACCESS_EXPIRES_MINUTES = int(os.getenv("JWT_ACCESS_EXPIRES", "60"))  # 60m default
JWT_REFRESH_EXPIRES_MINUTES = int(os.getenv("JWT_REFRESH_EXPIRES", "43200"))  # 30 days
JWT_CLOCK_SKEW_LEEWAY = int(os.getenv("JWT_LEEWAY", "30"))  # seconds of leeway for exp
SECURE_COOKIE = os.getenv("COOKIE_SECURE", "1") == "1"

router = APIRouter(prefix="/auth", tags=["auth"])

class GoogleTokenIn(BaseModel):
    id_token: str

class TokenOut(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int | None = None  # seconds for access token

class RefreshIn(BaseModel):
    refresh_token: str | None = None

# --- Token helpers ---

def _create_token(sub: str, minutes: int, ttype: str) -> str:
    now = datetime.utcnow()
    expire = now + timedelta(minutes=minutes)
    to_encode = {"sub": sub, "exp": expire, "iat": now, "type": ttype}
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_access_token(sub: str) -> str:
    return _create_token(sub, JWT_ACCESS_EXPIRES_MINUTES, "access")

def create_refresh_token(sub: str) -> str:
    return _create_token(sub, JWT_REFRESH_EXPIRES_MINUTES, "refresh")

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Security, Header

security = HTTPBearer(auto_error=False)

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
    authorization: str = Header(None)
) -> str:
    if DEV_MODE:
        return STATIC_DEV_USER
    token = None
    print(f"[AUTH] credentials present: {credentials is not None}")
    print(f"[AUTH] authorization header present: {authorization is not None}")
    if authorization:
        print(f"[AUTH] authorization header length: {len(authorization)}")

    if credentials is not None:
        token = credentials.credentials
        print(f"[AUTH] token from credentials, length: {len(token) if token else 0}")
    elif authorization is not None:
        if authorization.startswith("Bearer "):
            token = authorization.split(" ", 1)[1]
            print(f"[AUTH] token from Bearer header, length: {len(token) if token else 0}")
        else:
            token = authorization
            print(f"[AUTH] token from raw header, length: {len(token) if token else 0}")

    if not token:
        # Local dev fallback even if DEV_MODE env не выставлен
        if os.getenv('ALLOW_DEV_FALLBACK', '1') == '1':
            return STATIC_DEV_USER
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={"verify_aud": False},
            leeway=JWT_CLOCK_SKEW_LEEWAY
        )
        if payload.get("type") != "access":
            print(f"[AUTH] Token type invalid: {payload.get('type')}")
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_email = payload.get("sub")
        if not user_email:
            print(f"[AUTH] JWT payload missing 'sub' field: {payload}")
            raise HTTPException(status_code=401, detail="Invalid token payload")
        print(f"[AUTH] Successfully authenticated user: {user_email}")
        return user_email
    except JWTError as e:
        error_msg = str(e)
        print(f"[AUTH] JWT decode error: {error_msg}")
        # If expired, attempt to parse without exp to debug
        if "expired" in error_msg.lower():
            try:
                raw_payload = jwt.get_unverified_claims(token)
                exp_claim = raw_payload.get("exp")
                now_ts = int(datetime.utcnow().timestamp())
                print(f"[AUTH][EXPIRED] exp={exp_claim} now={now_ts} delta={now_ts - exp_claim if exp_claim else 'n/a'}s")
            except Exception as ie:
                print(f"[AUTH][EXPIRED] Failed to inspect claims: {ie}")
            raise HTTPException(status_code=401, detail="Token has expired")
        raise HTTPException(status_code=401, detail="Invalid token")

# --- Auth Endpoints ---
@router.post("/google", response_model=TokenOut)
async def google_login(payload: GoogleTokenIn, response: Response):
    if DEV_MODE:
        return TokenOut(access_token="dev", refresh_token=None, expires_in=3600)

    print(f"Google login attempt - client_id set: {bool(GOOGLE_CLIENT_ID)}, length: {len(GOOGLE_CLIENT_ID)}")
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Server not configured for Google OAuth")
    try:
        print(f"Verifying token with Google...")
        info = id_token.verify_oauth2_token(payload.id_token, requests.Request(), GOOGLE_CLIENT_ID)
        print(f"Token verified successfully, info: {info}")
    except ValueError as e:
        print(f"Google token verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid Google token")
    email = info.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="No email in Google token")
    print(f"Creating JWT pair for user: {email}")
    access_token = create_access_token(email)
    refresh_token = create_refresh_token(email)
    # Set refresh token cookie (HttpOnly)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=SECURE_COOKIE,
        samesite="lax",
        max_age=JWT_REFRESH_EXPIRES_MINUTES * 60,
        path="/auth"
    )
    print(f"JWT pair created successfully")
    return TokenOut(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=JWT_ACCESS_EXPIRES_MINUTES * 60
    )

@router.post("/refresh", response_model=TokenOut)
async def refresh_token_endpoint(data: RefreshIn, response: Response, refresh_cookie: str | None = Cookie(default=None, alias="refresh_token")):
    raw_refresh = data.refresh_token or refresh_cookie
    if not raw_refresh:
        raise HTTPException(status_code=401, detail="No refresh token provided")
    try:
        payload = jwt.decode(
            raw_refresh,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={"verify_aud": False},
            leeway=JWT_CLOCK_SKEW_LEEWAY
        )
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token type")
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status_code=401, detail="Invalid refresh token payload")
    except JWTError as e:
        print(f"[AUTH][REFRESH] Invalid refresh token: {e}")
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    # Rotate refresh token (best practice)
    new_refresh = create_refresh_token(sub)
    new_access = create_access_token(sub)
    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=SECURE_COOKIE,
        samesite="lax",
        max_age=JWT_REFRESH_EXPIRES_MINUTES * 60,
        path="/auth"
    )
    return TokenOut(
        access_token=new_access,
        refresh_token=new_refresh,
        expires_in=JWT_ACCESS_EXPIRES_MINUTES * 60
    )

# Current user endpoint
@router.get("/me")
async def get_me(user: str = Depends(get_current_user)):
    return {"email": user}
