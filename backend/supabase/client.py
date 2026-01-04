"""
Supabase Client Configuration for MULTECH AI
Handles connections, authentication, and client management
"""
import os
import logging
from typing import Optional
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from multiple locations
env_files = [
    Path(__file__).parent.parent / ".env",  # backend/.env
    Path(__file__).parent.parent.parent / ".env.supabase",  # project root/.env.supabase
    Path(__file__).parent.parent.parent / ".env",  # project root/.env
]

for env_file in env_files:
    if env_file.exists():
        load_dotenv(env_file, override=False)

logger = logging.getLogger(__name__)

# Supabase configuration (with fallbacks for different naming conventions)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# Validate configuration
if not SUPABASE_URL:
    logger.warning("SUPABASE_URL not set - Supabase features will be disabled")
if not SUPABASE_ANON_KEY:
    logger.warning("SUPABASE_ANON_KEY/SUPABASE_KEY not set - Supabase features will be disabled")
if not SUPABASE_SERVICE_KEY:
    logger.warning("SUPABASE_SERVICE_KEY not set - Service client will be unavailable")

_client = None
_service_client = None


def is_supabase_configured() -> bool:
    """Check if Supabase is properly configured"""
    return bool(SUPABASE_URL and SUPABASE_ANON_KEY)


def get_supabase_client():
    """Get Supabase client with anon key (for frontend operations with RLS)"""
    global _client
    if _client is None:
        if not is_supabase_configured():
            raise ValueError("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY")
        
        from supabase import create_client, Client
        _client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        logger.info("Supabase anon client initialized")
    return _client


def get_supabase_service_client():
    """Get Supabase client with service key (bypasses RLS - use carefully!)"""
    global _service_client
    if _service_client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set for service client")
        
        from supabase import create_client, Client
        _service_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        logger.info("Supabase service client initialized")
    return _service_client


def get_authenticated_client(access_token: str):
    """Get Supabase client authenticated with user's JWT token"""
    if not is_supabase_configured():
        raise ValueError("Supabase is not configured")
    
    from supabase import create_client, Client
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.auth.set_session(access_token, "")
    return client


# ==================== USER MANAGEMENT ====================

def get_or_create_user(email: str, display_name: Optional[str] = None) -> dict:
    """
    Get existing user or create new one (for dev/local mode without Supabase Auth)
    This is used when we don't have real Supabase Auth but need user records
    """
    client = get_supabase_service_client()
    
    # Try to find existing user by email
    result = client.table("users").select("*").eq("email", email).execute()
    
    if result.data:
        return result.data[0]
    
    # Create new user
    user_data = {
        "email": email,
        "display_name": display_name or email.split("@")[0],
        "preferences": {}
    }
    
    result = client.table("users").insert(user_data).execute()
    logger.info(f"Created new user: {result.data[0]['id']} for email {email}")
    return result.data[0]


def get_user_by_auth_id(auth_id: str) -> Optional[dict]:
    """Get user by Supabase Auth ID"""
    client = get_supabase_service_client()
    result = client.table("users").select("*").eq("auth_id", auth_id).single().execute()
    return result.data if result.data else None


def update_user_preferences(user_id: str, preferences: dict) -> dict:
    """Update user preferences"""
    client = get_supabase_service_client()
    result = client.table("users").update({"preferences": preferences}).eq("id", user_id).execute()
    return result.data[0] if result.data else None
