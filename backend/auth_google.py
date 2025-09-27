import os
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from google.oauth2 import id_token
from google.auth.transport import requests
from jose import jwt, JWTError

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
JWT_SECRET = os.getenv("JWT_SECRET", "change_me_secret")
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES", "60"))

router = APIRouter(prefix="/auth", tags=["auth"])

class GoogleTokenIn(BaseModel):
    id_token: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


def create_access_token(sub: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=JWT_EXPIRES_MINUTES)
    to_encode = {"sub": sub, "exp": expire}
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

@router.post("/google", response_model=TokenOut)
async def google_login(payload: GoogleTokenIn):
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
    print(f"Creating JWT for user: {email}")
    token = create_access_token(email)
    print(f"JWT created successfully")
    return TokenOut(access_token=token)

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Security, Header

security = HTTPBearer(auto_error=False)

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
    authorization: str = Header(None)
) -> str:
    # Try to get token from Security first, then from Header
    token = None
    
    if credentials is not None:
        token = credentials.credentials
    elif authorization is not None:
        # Handle "Bearer TOKEN" format
        if authorization.startswith("Bearer "):
            token = authorization.split(" ", 1)[1]
        else:
            token = authorization
    
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_email = payload.get("sub")
        if not user_email:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return user_email
    except JWTError as e:
        print(f"JWT decode error: {e}")  # Add debug logging
        raise HTTPException(status_code=401, detail="Invalid token")

# New endpoint to retrieve current authenticated user email
@router.get("/me")
async def get_me(user: str = Depends(get_current_user)):
    return {"email": user}
