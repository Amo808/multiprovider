import asyncio
import logging
from typing import Dict, Any, Optional, List
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, APIRouter, Depends, status, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import json
import uuid
from datetime import datetime
import os
from dotenv import load_dotenv
from pathlib import Path

# ============================================================================
# CRITICAL: Load environment variables BEFORE any other imports that might
# need API keys (like adapters module which creates provider_manager)
# ============================================================================

# First, load from backend/.env (primary source with real keys)
backend_env = Path(__file__).parent / ".env"
if backend_env.exists():
    load_dotenv(backend_env, override=True)
    print(f"[ENV] Loaded environment from: {backend_env}")

# Also try project root .env as fallback
project_root_env = Path(__file__).parent.parent / ".env"
if project_root_env.exists():
    load_dotenv(project_root_env, override=False)  # Don't override existing keys
    print(f"[ENV] Also loaded from: {project_root_env}")

# Log loaded API keys status (without exposing actual keys)
print(f"[ENV] DEEPSEEK_API_KEY loaded: {bool(os.getenv('DEEPSEEK_API_KEY'))}")
print(f"[ENV] OPENAI_API_KEY loaded: {bool(os.getenv('OPENAI_API_KEY'))}")
print(f"[ENV] ANTHROPIC_API_KEY loaded: {bool(os.getenv('ANTHROPIC_API_KEY'))}")
print(f"[ENV] GEMINI_API_KEY loaded: {bool(os.getenv('GEMINI_API_KEY'))}")
print(f"[ENV] SUPABASE_URL loaded: {bool(os.getenv('SUPABASE_URL'))}")
print(f"[ENV] SUPABASE_KEY loaded: {bool(os.getenv('SUPABASE_KEY') or os.getenv('SUPABASE_ANON_KEY'))}")

# ============================================================================
# Now import our custom modules (they will have access to env variables)
# ============================================================================

import sys
# Ensure backend directory itself is on sys.path for direct module imports when running via `py -m uvicorn backend.main:app`
backend_dir = Path(__file__).parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))
# Ensure project root on path for adapters package
project_root = backend_dir.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from adapters import (
    provider_manager, 
    ModelProvider, 
    Message, 
    GenerationParams, 
    ProviderStatus
)
from storage import HistoryStore, PromptBuilder
from storage.database_store import DatabaseConversationStore
from storage.message_store import MessageDatabaseStore, get_message_store
from storage.mem0_store import get_mem0_store, add_conversation_to_memory, get_memory_context
from auth_google import router as google_auth_router, get_current_user as original_get_current_user

# Supabase integration
from supabase_client import (
    get_supabase_conversation_store,
    is_supabase_configured
)
from supabase_client.api import router as rag_router
from process_events import (
    process_emitter, ProcessType, ProcessStatus, ProcessContext,
    stream_process_events, track_compression, track_multi_model
)
from multi_model import (
    MultiModelOrchestrator, ModelConfig, MultiModelMode, 
    MULTI_MODEL_PRESETS
)
from services.model_discovery import auto_discover_models, get_discovery_service

# --- Dev Auth Bypass Setup ---------------------------------------------------
# We want local development to ALWAYS work without Google OAuth / JWT.
# Conditions for bypass:
# 1. Explicit DEV_MODE=1 OR
# 2. Running locally (no RENDER env var) AND FORCE_DEV_AUTH not disabled
# 3. FORCE production dev mode if needed
# You can disable bypass by setting FORCE_DEV_AUTH=0 (even if running locally).
DEV_MODE_FLAG = os.getenv("DEV_MODE", "0") == "1"
LOCAL_ENV = not os.getenv("RENDER")
FORCE_DEV_AUTH = os.getenv("FORCE_DEV_AUTH", "1") == "1"
DEV_STATIC_USER = os.getenv("DEV_STATIC_USER", "dev@example.com")
# TEMPORARY: Force dev auth for this deployment until we configure OAuth
PRODUCTION_DEV_MODE = os.getenv("BYPASS_GOOGLE_AUTH", "0") == "1"
# HOTFIX: Force dev mode for this specific deployment
FORCE_PRODUCTION_DEV = True  # Change to False when OAuth is properly configured
DEV_AUTH_ACTIVE = DEV_MODE_FLAG or (LOCAL_ENV and FORCE_DEV_AUTH) or PRODUCTION_DEV_MODE or FORCE_PRODUCTION_DEV

if DEV_AUTH_ACTIVE:
    # Override dependency so every endpoint treats requests as authenticated.
    def get_current_user():  # type: ignore
        return DEV_STATIC_USER
    logging.getLogger(__name__).info(
        f"[DEV-AUTH] Bypass ACTIVE (user={DEV_STATIC_USER}) | DEV_MODE_FLAG={DEV_MODE_FLAG} LOCAL_ENV={LOCAL_ENV} FORCE_DEV_AUTH={FORCE_DEV_AUTH} PRODUCTION_DEV_MODE={PRODUCTION_DEV_MODE} FORCE_PRODUCTION_DEV={FORCE_PRODUCTION_DEV}" 
    )
else:
    # Use the real auth dependency
    get_current_user = original_get_current_user  # type: ignore
    logging.getLogger(__name__).info(
        f"[DEV-AUTH] Bypass DISABLED | DEV_MODE_FLAG={DEV_MODE_FLAG} LOCAL_ENV={LOCAL_ENV} FORCE_DEV_AUTH={FORCE_DEV_AUTH} PRODUCTION_DEV_MODE={PRODUCTION_DEV_MODE} FORCE_PRODUCTION_DEV={FORCE_PRODUCTION_DEV}"
    )
# ----------------------------------------------------------------------------

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(Path(__file__).parent.parent / 'logs' / 'app.log')
    ]
)
logger = logging.getLogger(__name__)

# Global variables
conversation_store = None
prompt_builder = None
app_config = None
USE_SUPABASE = os.getenv("USE_SUPABASE", "1") == "1"

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan."""
    global conversation_store, prompt_builder, app_config
    
    try:
        # Startup
        # Initialize provider manager
        await provider_manager.initialize()
        
        # Initialize conversation store
        storage_path = Path(__file__).parent.parent / "data"
        
        # Try Supabase first, fall back to SQLite
        logger.info(f"[STARTUP] USE_SUPABASE={USE_SUPABASE}, is_supabase_configured()={is_supabase_configured()}")
        if USE_SUPABASE and is_supabase_configured():
            logger.info("[STARTUP] ✅ Using SUPABASE for conversation storage")
            conversation_store = get_supabase_conversation_store()
            logger.info(f"[STARTUP] conversation_store type: {type(conversation_store).__name__}")
        else:
            logger.warning(f"[STARTUP] ⚠️ Using SQLite for conversation storage (Supabase configured: {is_supabase_configured()})")
            logger.info(f"[STARTUP] Storage path: {storage_path}")
            db_path = str(storage_path / "conversations.db")
            conversation_store = DatabaseConversationStore(db_path=db_path)
        
        # Initialize prompt builder (with default adapter)
        enabled_providers = provider_manager.get_enabled_providers()
        if enabled_providers:
            default_adapter = provider_manager.registry.get(enabled_providers[0].id)
            prompt_builder = PromptBuilder(
                adapter=default_adapter,
                max_tokens=32768  # Increased to 32K tokens
            )
        
        # Load app configuration
        config_path = Path(__file__).parent.parent / "data" / "config.json"
        if config_path.exists():
            with open(config_path, "r") as f:
                app_config = json.load(f)
        else:
            # Create default config
            app_config = {
                "activeProvider": "deepseek",
                "activeModel": "deepseek-chat",
                "generation": {
                    "temperature": 0.7,
                    "max_tokens": 32768,  # Increased to 32K tokens
                    "top_p": 1.0,
                    "stream": True
                },
                "system": {
                    "max_context_tokens": 32768,  # Increased to 32K tokens
                    "auto_save": True
                }
            }
            
        logger.info(f"Initialized with {len(provider_manager.get_enabled_providers())} enabled providers")
        
        yield  # Application runs here
        
    except Exception as e:
        logger.error(f"Failed to initialize: {e}")
        raise
    
    # Shutdown (if needed)
    logger.info("Application shutdown")

# Initialize FastAPI app with lifespan
app = FastAPI(
    title="AI Chat API",
    description="Multi-provider AI chat interface", 
    version="2.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://192.168.110.143:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create API router with /api prefix
api_router = APIRouter(prefix="/api")

# Public debug endpoint (no auth required)
@app.get("/debug/auth")
async def debug_auth_public():
    """Public debug endpoint to check auth configuration."""
    import os
    return {
        "google_client_id_set": bool(os.getenv("GOOGLE_CLIENT_ID")),
        "google_client_id_length": len(os.getenv("GOOGLE_CLIENT_ID", "")),
        "jwt_secret_set": bool(os.getenv("JWT_SECRET")),
        "cors_origins": os.getenv("CORS_ORIGINS", "default"),
        "environment": os.getenv("RENDER") or "local",
        "vite_google_client_id_set": bool(os.getenv("VITE_GOOGLE_CLIENT_ID")),
        "vite_google_client_id_length": len(os.getenv("VITE_GOOGLE_CLIENT_ID", ""))
    }

# Pydantic models
class ChatRequest(BaseModel):
    message: str
    provider: str = "deepseek"  # Default provider
    model: str = "deepseek-chat"  # Default model
    conversation_id: Optional[str] = None
    stream: bool = True
    config: Optional[Dict[str, Any]] = None
    system_prompt: Optional[str] = None

class ChatResponse(BaseModel):
    id: str
    role: str
    content: str
    timestamp: str
    provider: str
    model: str
    meta: Optional[Dict[str, Any]] = None
    usage: Optional[Dict[str, Any]] = None  # Token usage information

class ProviderConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    
class ModelRequest(BaseModel):
    provider: str

# === Multi-Model Request Models ===
class MultiModelConfigRequest(BaseModel):
    provider: str
    model: str
    display_name: Optional[str] = None
    weight: float = 1.0
    timeout: float = 60.0
    enabled: bool = True
    params: Optional[Dict[str, Any]] = None

class MultiModelChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    models: List[MultiModelConfigRequest]
    mode: str = "parallel"  # parallel, fastest, consensus, comparison, fallback
    stream: bool = True
    config: Optional[Dict[str, Any]] = None
    system_prompt: Optional[str] = None

class ProcessEventFilter(BaseModel):
    conversation_id: Optional[str] = None
    process_types: Optional[List[str]] = None

# Global components
conversation_store = None
prompt_builder = None
app_config = None

@api_router.get("/health")
async def health_check():
    """Health check endpoint."""
    provider_status = {}
    for provider in provider_manager.get_enabled_providers():
        provider_status[provider.id.value] = provider.connected
        
    return {
        "status": "healthy",
        "version": "2.0.0",
        "providers": provider_status,
        "uptime": "unknown",  # TODO: Track uptime
        "timestamp": datetime.now().isoformat()
    }

@api_router.get("/debug/auth")
async def debug_auth():
    """Debug endpoint to check auth configuration."""
    import os
    return {
        "google_client_id_set": bool(os.getenv("GOOGLE_CLIENT_ID")),
        "google_client_id_length": len(os.getenv("GOOGLE_CLIENT_ID", "")),
        "jwt_secret_set": bool(os.getenv("JWT_SECRET")),
        "cors_origins": os.getenv("CORS_ORIGINS", "default"),
        "environment": os.getenv("RENDER") or "local"
    }

@api_router.get("/providers")
async def get_providers(_: str = Depends(get_current_user)):
    """Get all providers and their status."""
    providers = []
    for status in provider_manager.provider_status.values():
        providers.append({
            "id": status.id.value,
            "name": status.name,
            "enabled": status.enabled,
            "connected": status.connected,
            "loading": status.loading,
            "error": status.error,
            "models_count": status.models_count,
            "config_valid": status.config_valid,
            "hasApiKey": status.has_api_key
        })
    return {"providers": providers}

@api_router.post("/providers/{provider_id}/toggle")
async def toggle_provider(provider_id: str, enabled: bool = True, _: str = Depends(get_current_user)):
    """Enable or disable a provider."""
    try:
        await provider_manager.enable_provider(provider_id, enabled)
        return {"success": True, "message": f"Provider {provider_id} {'enabled' if enabled else 'disabled'}"}
    except Exception as e:
        logger.error(f"Failed to toggle provider {provider_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

class SetApiKeyRequest(BaseModel):
    api_key: str

@api_router.post("/providers/{provider_id}/api-key")
async def set_provider_api_key(provider_id: str, request: SetApiKeyRequest, _: str = Depends(get_current_user)):
    """Set API key for a provider (saves to secrets.json)."""
    try:
        success = await provider_manager.save_api_key(provider_id, request.api_key)
        if success:
            # Re-validate the provider after setting key
            adapter = provider_manager.registry.get(provider_id)
            if adapter:
                is_valid, error = await adapter.validate_connection()
                return {
                    "success": True, 
                    "message": f"API key saved for {provider_id}",
                    "connected": is_valid,
                    "error": error
                }
            return {"success": True, "message": f"API key saved for {provider_id}"}
        else:
            raise HTTPException(status_code=400, detail="Failed to save API key")
    except Exception as e:
        logger.error(f"Failed to set API key for {provider_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/providers/api-keys/status")
async def get_api_keys_status(_: str = Depends(get_current_user)):
    """Get the status of API keys for all providers."""
    try:
        status = await provider_manager.get_api_keys_status()
        return {"success": True, "status": status}
    except Exception as e:
        logger.error(f"Failed to get API keys status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/providers/{provider_id}/config")
async def update_provider_config(provider_id: str, config_update: ProviderConfigUpdate, _: str = Depends(get_current_user)):
    """Update provider configuration."""
    try:
        updates = config_update.dict(exclude_unset=True)
        
        # Special handling for API key
        if 'api_key' in updates:
            adapter = provider_manager.registry.get(provider_id)
            if adapter:
                # Update the adapter's config
                if hasattr(adapter.config, 'api_key'):
                    adapter.config.api_key = updates['api_key']
                    logger.info(f"Updated API key for provider {provider_id}")
        
        success = await provider_manager.update_provider_config(provider_id, updates)
        if success:
            return {"success": True, "message": f"Provider {provider_id} configuration updated"}
        else:
            raise HTTPException(status_code=400, detail="Failed to update configuration")
    except Exception as e:
        logger.error(f"Failed to update provider config {provider_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/providers/{provider_id}/models/refresh")
async def refresh_provider_models(provider_id: str, _: str = Depends(get_current_user)):
    """Refresh models for a specific provider."""
    try:
        adapter = provider_manager.registry.get(provider_id)
        if not adapter:
            raise HTTPException(status_code=404, detail=f"Provider {provider_id} not found")
        
        if not adapter.config.enabled:
            raise HTTPException(status_code=400, detail=f"Provider {provider_id} is disabled")
            
        # Check API key
        if not adapter.config.api_key or adapter.config.api_key.startswith(('your_', 'sk-test-')):
            raise HTTPException(status_code=400, detail=f"API key for {provider_id} is not configured")
        
        # Fetch models from provider
        models = await adapter.get_available_models()
        
        # Update status
        status = provider_manager.provider_status.get(adapter.provider)
        if status:
            status.models_count = len(models)
            status.connected = True
            status.error = None
            
        logger.info(f"Refreshed {len(models)} models for provider {provider_id}")
        
        return {
            "success": True,
            "provider": provider_id,
            "models_count": len(models),
            "models": [
                {
                    "id": model.id,
                    "name": model.name,
                    "display_name": model.display_name,
                    "context_length": model.context_length,
                    "supports_streaming": model.supports_streaming,
                    "supports_functions": model.supports_functions,
                    "supports_vision": model.supports_vision,
                    "type": model.type.value
                }
                for model in models
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to refresh models for provider {provider_id}: {e}")
        
        # Update status with error
        status = provider_manager.provider_status.get(ModelProvider(provider_id))
        if status:
            status.connected = False
            status.error = str(e)
            
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/providers/{provider_id}/test")
async def test_provider_connection(provider_id: str, _: str = Depends(get_current_user)):
    """Test connection to a specific provider."""
    try:
        adapter = provider_manager.registry.get(provider_id)
        if not adapter:
            raise HTTPException(status_code=404, detail=f"Provider {provider_id} not found")
        
        if not adapter.config.enabled:
            raise HTTPException(status_code=400, detail=f"Provider {provider_id} is disabled")
            
        # Check API key
        if not adapter.config.api_key or adapter.config.api_key.startswith(('your_', 'sk-test-')):
            return {
                "success": False,
                "error": f"API key for {provider_id} is not configured"
            }
        
        # Test connection using validate_connection
        is_valid, error = await adapter.validate_connection()
        
        # Update status
        status = provider_manager.provider_status.get(adapter.provider)
        if status:
            status.connected = is_valid
            status.error = error if not is_valid else None
            status.loading = False
            
        logger.info(f"Connection test for provider {provider_id}: {'✓' if is_valid else '✗'} {error or 'Success'}")
        
        return {
            "success": is_valid,
            "provider": provider_id,
            "error": error if not is_valid else None,
            "connected": is_valid
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to test provider connection {provider_id}: {e}")
        
        # Update status with error
        status = provider_manager.provider_status.get(ModelProvider(provider_id))
        if status:
            status.connected = False
            status.error = str(e)
            status.loading = False
            
        return {
            "success": False,
            "provider": provider_id,
            "error": str(e),
            "connected": False
        }

@api_router.get("/history")
async def get_history(user_email: str = Depends(get_current_user)):
    """Get chat history for default conversation (scoped to user)."""
    try:
        messages = conversation_store.load_conversation_history("default", user_email=user_email)
        return [
            {
                "id": msg.id,
                "role": msg.role,
                "content": msg.content,
                "timestamp": msg.timestamp.isoformat(),
                "provider": getattr(msg.meta, "provider", None) if msg.meta else None,
                "model": getattr(msg.meta, "model", None) if msg.meta else None,
                "meta": msg.meta
            }
            for msg in messages
        ]
    except Exception as e:
        logger.error(f"Failed to get history: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve history")


@api_router.post("/chat/send")
async def send_message(request: ChatRequest, http_request: Request, user_email: str = Depends(get_current_user)):
    """Send a chat message and get streaming response (scoped to user)."""
    
    def generate_error_stream(error_message: str, error_type: str = "error"):
        """Generate SSE stream with error message."""
        yield f"data: {json.dumps({'error': error_message, 'type': error_type, 'done': True})}\n\n"
    
    try:
        # Get provider and model
        provider_id = request.provider
        model_id = request.model
        
        # Validate provider exists
        adapter = provider_manager.registry.get(provider_id)
        if not adapter:
            return StreamingResponse(
                generate_error_stream(f"Provider '{provider_id}' not found"),
                media_type="text/plain",
                headers={"X-Error-Type": "PROVIDER_NOT_FOUND"}
            )
        
        # Check if provider is enabled
        if not adapter.config.enabled:
            return StreamingResponse(
                generate_error_stream(f"Provider '{provider_id}' is disabled"),
                media_type="text/plain",
                headers={"X-Error-Type": "PROVIDER_DISABLED"}
            )
        
        # Check if API key is configured for this provider
        if (hasattr(adapter.config, 'api_key') and 
            (not adapter.config.api_key or 
             adapter.config.api_key.startswith('your_') or 
             adapter.config.api_key.startswith('sk-test-') or  # Add test key detection
             adapter.config.api_key == 'your_deepseek_api_key_here' or
             adapter.config.api_key == 'your_openai_api_key_here' or
             adapter.config.api_key == 'your_anthropic_api_key_here' )):
            return StreamingResponse(
                generate_error_stream(f"API key for {provider_id} is not configured. Please add your API key in settings.", "API_KEY_MISSING"),
                media_type="text/plain",
                headers={"X-Error-Type": "API_KEY_MISSING"}
            )
        
        # Create user message
        user_message = Message(
            id=str(uuid.uuid4()),
            role="user",
            content=request.message,
            timestamp=datetime.now(),
            meta={
                "provider": provider_id,
                "model": model_id,
                "conversation_id": request.conversation_id,
                "user_email": user_email
            }
        )
        
        # Save user message
        conversation_id = request.conversation_id or "default"
        logger.info(f"[CHAT] Processing message for conversation_id: {conversation_id} user={user_email}")
        try:
            conversation_store.save_message(conversation_id, user_message, user_email=user_email)
        except Exception as save_err:
            logger.error(f"[CHAT] Failed to save user message: {save_err}")
        
        # Load history and build context
        try:
            history = conversation_store.load_conversation_history(conversation_id, user_email=user_email)
            logger.info(f"[CHAT] Loaded {len(history)} messages from history for {conversation_id}")
        except Exception as load_err:
            logger.error(f"[CHAT] Failed to load history: {load_err}")
            history = []
        
        # === AUTO CONTEXT COMPRESSION (RAG-based) ===
        compression_stats = None
        try:
            from storage.context_compressor import ContextCompressor
            
            # Get max context tokens based on model (use reasonable defaults)
            model_context_limits = {
                "deepseek-chat": 32000,
                "deepseek-reasoner": 64000,
                "gpt-4": 8000,
                "gpt-4-turbo": 128000,
                "gpt-4o": 128000,
                "claude-3-opus": 200000,
                "claude-3-sonnet": 200000,
                "claude-3-haiku": 200000,
                "gemini-pro": 32000,
                "gemini-1.5-pro": 1000000,
            }
            # Use 70% of model limit for safety margin
            max_tokens = int(model_context_limits.get(model_id, 8000) * 0.7)
            
            compressor = ContextCompressor(
                max_context_tokens=max_tokens,
                keep_recent_messages=4,  # Always keep last 4 messages uncompressed
                enable_embeddings=True
            )
            
            # Add messages to compressor
            for msg in history:
                compressor.add_message(
                    role=msg.role,
                    content=msg.content,
                    message_id=msg.id,
                    timestamp=msg.timestamp.isoformat() if hasattr(msg.timestamp, 'isoformat') else str(msg.timestamp),
                    metadata=msg.meta if hasattr(msg, 'meta') else {}
                )
            
            # Build compressed context
            compressed_result = compressor.build_context(request.message)
            
            # Get formatted messages from the context
            formatted_messages = compressor.get_formatted_messages(compressed_result)
            
            # Log compression details including chunks
            stats = compressed_result.get('stats', {})
            logger.info(f"[CHAT] Compression result: {len(formatted_messages)} formatted messages, "
                       f"recent: {stats.get('recent_count', 0)}, "
                       f"context: {stats.get('context_count', 0)}, "
                       f"chunks: {stats.get('chunks_count', 0)}, "
                       f"indexed_chunks: {stats.get('total_chunks_indexed', 0)}")
            
            # Convert back to Message objects for the provider
            compressed_history = []
            for msg_dict in formatted_messages:
                # Skip system messages as they're handled separately
                if msg_dict.get('role') == 'system':
                    continue
                compressed_history.append(Message(
                    id=msg_dict.get('id', str(uuid.uuid4())),
                    role=msg_dict['role'],
                    content=msg_dict['content'],
                    timestamp=datetime.now()
                ))
            
            # Use compressed history if we got results
            if compressed_history:
                original_count = len(history)
                history = compressed_history
                compression_stats = compressed_result.get('stats', {})
                compression_stats['original_messages'] = original_count
                compression_stats['compressed_messages'] = len(history)
                logger.info(f"[CHAT] Context compressed: {original_count} -> {len(history)} messages, "
                           f"tokens: ~{compression_stats.get('total_tokens_estimate', '?')}, "
                           f"utilization: {compression_stats.get('utilization', '?')}%")
            else:
                logger.info(f"[CHAT] No compression applied (empty result or few messages)")
                
        except ImportError as e:
            logger.warning(f"[CHAT] Context compression not available: {e}")
        except Exception as e:
            logger.warning(f"[CHAT] Context compression failed, using full history: {e}")
        # === END AUTO CONTEXT COMPRESSION ===
        
        # === MEM0 MEMORY CONTEXT ===
        # Get relevant memories for personalization (if Mem0 is enabled)
        memory_context = ""
        try:
            mem0_store = get_mem0_store()
            if mem0_store.is_enabled() and user_email:
                # Get the last user message for context search
                last_user_msg = request.message
                memory_context = await get_memory_context(user_email, last_user_msg)
                if memory_context:
                    logger.info(f"[MEM0] Retrieved memory context for user {user_email}")
        except Exception as e:
            logger.warning(f"[MEM0] Failed to get memory context: {e}")
        # === END MEM0 MEMORY CONTEXT ===
        
        # Add system prompt if provided
        system_prompt_content = request.system_prompt or ""
        
        # Inject memory context into system prompt if available
        if memory_context:
            if system_prompt_content:
                system_prompt_content = f"{system_prompt_content}\n\n{memory_context}"
            else:
                system_prompt_content = f"You are a helpful AI assistant.\n\n{memory_context}"
        
        if system_prompt_content:
            system_msg = Message(
                id=str(uuid.uuid4()),
                role="system",
                content=system_prompt_content,
                timestamp=datetime.now()
            )
            history = [system_msg] + history
        
        # Generation parameters
        generation_config = request.config or app_config.get("generation", {})
        params = GenerationParams(
            temperature=generation_config.get("temperature", 0.7),
            max_tokens=generation_config.get("max_tokens", 8192),  # Default for DeepSeek
            top_p=generation_config.get("top_p", 1.0),
            frequency_penalty=generation_config.get("frequency_penalty", 0.0),
            presence_penalty=generation_config.get("presence_penalty", 0.0),
            stream=request.stream,
            thinking_budget=generation_config.get("thinking_budget"),
            include_thoughts=generation_config.get("include_thoughts", False),
            # New GPT-5 params passthrough
            verbosity=generation_config.get("verbosity"),
            reasoning_effort=generation_config.get("reasoning_effort"),
            cfg_scale=generation_config.get("cfg_scale"),
            free_tool_calling=generation_config.get("free_tool_calling", False),
            grammar_definition=generation_config.get("grammar_definition"),
            tools=generation_config.get("tools"),
        )
        
        # Create assistant message for response
        assistant_message = Message(
            id=str(uuid.uuid4()),
            role="assistant",
            content="",
            timestamp=datetime.now(),
            meta={
                "provider": provider_id,
                "model": model_id,
                "conversation_id": request.conversation_id,
                "user_email": user_email
            }
        )
        
        async def generate_response():
            """Generate streaming response with cancellation support.
            Added: heartbeat every 10s, provider call global timeout, first token latency logging.
            Integrated: Process tracking for thinking/streaming visualization.
            """
            logger.info(f"[STREAM] generate_response() started: provider={provider_id}, model={model_id}")
            full_content = ""
            total_tokens_in = 0
            total_tokens_out = 0
            thought_content = ""  # For reasoning/thinking models
            import time, asyncio as _asyncio
            start_ts = time.time()
            first_chunk_ts = None
            last_emit_ts = time.time()
            HEARTBEAT_INTERVAL = 10  # seconds
            
            # Увеличенный таймаут для reasoning моделей
            is_reasoning_model = (
                model_id in ['deepseek-reasoner', 'o1', 'o1-preview', 'o1-mini', 'o3', 'o3-mini'] or
                (hasattr(params, 'reasoning_effort') and params.reasoning_effort in ['medium', 'high'])
            )
            if is_reasoning_model:
                PROVIDER_TIMEOUT = 1200  # 20 минут для reasoning
            else:
                PROVIDER_TIMEOUT = 300    # 5 минут для обычных моделей
            
            # Create process for tracking
            process = process_emitter.create_process(
                process_type=ProcessType.THINKING if is_reasoning_model else ProcessType.STREAMING,
                name=f"{'Reasoning' if is_reasoning_model else 'Generating'}: {model_id}",
                conversation_id=conversation_id,
                message_id=assistant_message.id,
                steps=["Initializing", "Processing", "Generating response", "Finalizing"] if is_reasoning_model else ["Generating"],
                metadata={
                    "provider": provider_id,
                    "model": model_id,
                    "is_reasoning": is_reasoning_model
                }
            )
            await process_emitter.start_process(process)

            async def heartbeat():
                nonlocal last_emit_ts
                now = time.time()
                if now - last_emit_ts >= HEARTBEAT_INTERVAL:
                    hb = {"ping": True, "uptime": int(now - start_ts), "done": False}
                    yield f"data: {json.dumps(hb)}\n\n"
                    last_emit_ts = now

            try:
                logger.info(f"[STREAM] About to call provider_manager.chat_completion: provider={provider_id}, model={model_id}")
                # Wrapped async generator with timeout
                async def provider_stream():
                    logger.info(f"[STREAM] Inside provider_stream(), calling chat_completion...")
                    async for response in provider_manager.chat_completion(
                        history, provider_id, model_id, params
                    ):
                        yield response

                async def stream_with_timeout():
                    # Implement manual timeout for first and overall inactivity
                    OVERALL_TIMEOUT = PROVIDER_TIMEOUT
                    last_activity = time.time()

                    async for r in provider_stream():
                        last_activity = time.time()
                        yield r
                        if time.time() - start_ts > OVERALL_TIMEOUT:
                            yield type('R', (), { 'error': f'Provider timeout after {OVERALL_TIMEOUT}s', 'content': None, 'done': True, 'meta': None })()
                            return
                        # Heartbeat handled outside
                    # After stream ends naturally
                    return

                async for response in stream_with_timeout():
                    # Heartbeat before processing (in case of long gaps)
                    async for hb_chunk in heartbeat():
                        yield hb_chunk

                    if await http_request.is_disconnected():
                        logger.info(f"[CHAT] Client disconnected during streaming for {conversation_id}")
                        await process_emitter.fail_process(process, "Client disconnected")
                        return

                    if response.error:
                        logger.warning(f"[CHAT] Provider error: {response.error}")
                        await process_emitter.fail_process(process, response.error)
                        yield f"data: {json.dumps({'error': response.error, 'done': True})}\n\n"
                        break
                    
                    # Check for thinking/reasoning content
                    if response.meta:
                        # Get reasoning content from response object or meta
                        # Note: 'thinking' in meta might be bool flag, use reasoning_content for actual text
                        thought = None
                        if response.reasoning_content:
                            thought = response.reasoning_content
                        elif isinstance(response.meta.get('reasoning_content'), str):
                            thought = response.meta.get('reasoning_content')
                        elif isinstance(response.meta.get('thinking'), str):
                            thought = response.meta.get('thinking')
                        
                        if thought:
                            thought_content += thought
                            # Emit thinking event via process events (for ProcessViewer)
                            await process_emitter.emit_thinking(
                                process,
                                thought=thought,
                                stage="reasoning"
                            )
                            
                            # ALSO emit thinking content via main chat SSE stream
                            # This is needed for MessageBubble to show reasoning content
                            thinking_chunk = {
                                'content': '',  # No visible content yet
                                'id': assistant_message.id,
                                'done': False,
                                'provider': provider_id,
                                'model': model_id,
                                'meta': {
                                    'thinking': thought,
                                    'reasoning_content': thought,
                                    'thought_tokens': response.meta.get('thought_tokens', len(thought_content) // 4),
                                    'reasoning': True,  # Flag for frontend
                                    'provider': provider_id,
                                    'model': model_id
                                }
                            }
                            yield f"data: {json.dumps(thinking_chunk)}\n\n"
                            logger.info(f"[CHAT] Emitted thinking chunk: {len(thought)} chars, total: {len(thought_content)} chars")

                    if response.content:
                        if first_chunk_ts is None:
                            first_chunk_ts = time.time()
                            logger.info(f"[CHAT] First token latency {first_chunk_ts - start_ts:.2f}s conversation={conversation_id}")
                            # Move to generating step
                            if is_reasoning_model and len(process.steps) > 2:
                                await process_emitter.complete_step(process, 0, "Initialized")
                                await process_emitter.start_step(process, 1)
                        
                        full_content += response.content
                        
                        # Update process progress
                        process.progress = min(90, process.progress + 1)
                        
                        chunk_data = {
                            'content': response.content,
                            'id': assistant_message.id,
                            'done': False,
                            'provider': provider_id,
                            'model': model_id
                        }
                        if response.meta:
                            chunk_data['meta'] = {
                                'tokens_in': response.meta.get('tokens_in', total_tokens_in),
                                'tokens_out': response.meta.get('tokens_out', total_tokens_out),
                                'provider': provider_id,
                                'model': model_id,
                                'estimated_cost': response.meta.get('estimated_cost')
                            }
                        yield f"data: {json.dumps(chunk_data)}\n\n"
                        last_emit_ts = time.time()

                    if response.meta:
                        total_tokens_in = response.meta.get("tokens_in", total_tokens_in)
                        total_tokens_out = response.meta.get("tokens_out", total_tokens_out)

                    if response.done:
                        assistant_message.content = full_content
                        response_meta = response.meta or {}
                        final_tokens_in = response_meta.get("tokens_in", total_tokens_in)
                        final_tokens_out = response_meta.get("tokens_out", total_tokens_out)
                        estimated_cost = response_meta.get("estimated_cost")
                        thought_tokens = response_meta.get("thought_tokens", 0) or response_meta.get("thinking_tokens_used", 0)
                        
                        assistant_message.meta.update({
                            'tokens_in': final_tokens_in,
                            'tokens_out': final_tokens_out,
                            'total_tokens': final_tokens_in + final_tokens_out,
                            'estimated_cost': estimated_cost,
                            'user_email': user_email,
                            'first_token_latency': (first_chunk_ts - start_ts) if first_chunk_ts else None,
                            'total_latency': time.time() - start_ts,
                            'thought_tokens': thought_tokens,
                            'thought_content': thought_content if thought_content else None
                        })
                        logger.info(f"[CHAT] Saving assistant message conversation={conversation_id} total_latency={time.time()-start_ts:.2f}s")
                        try:
                            conversation_store.save_message(conversation_id, assistant_message, user_email=user_email)
                        except Exception as save_err:
                            logger.error(f"[CHAT] Failed to save assistant message: {save_err}")
                        
                        # Complete process
                        await process_emitter.complete_process(process, metadata={
                            "tokens_in": final_tokens_in,
                            "tokens_out": final_tokens_out,
                            "thought_tokens": thought_tokens,
                            "total_latency_ms": int((time.time() - start_ts) * 1000)
                        })
                        
                        final_response = {
                            'done': True,
                            'id': assistant_message.id,
                            'provider': provider_id,
                            'model': model_id,
                            'meta': {
                                'tokens_in': final_tokens_in,
                                'tokens_out': final_tokens_out,
                                'total_tokens': final_tokens_in + final_tokens_out,
                                'estimated_cost': estimated_cost,
                                'first_token_latency': (first_chunk_ts - start_ts) if first_chunk_ts else None,
                                'total_latency': time.time() - start_ts,
                                'thought_tokens': thought_tokens,
                                # Include the full thought content for frontend to display
                                'thought_content': thought_content if thought_content else None,
                                'reasoning_content': thought_content if thought_content else None
                            }
                        }
                        yield f"data: {json.dumps(final_response)}\n\n"
                        break

                    # Heartbeat after processing too (covers branches with no new content)
                    async for hb_chunk in heartbeat():
                        yield hb_chunk

                # Final heartbeat if nothing was ever sent
                if first_chunk_ts is None:
                    async for hb_chunk in heartbeat():
                        yield hb_chunk

            except asyncio.CancelledError:
                logger.info(f"[CHAT] Request cancelled for conversation {conversation_id}")
                await process_emitter.fail_process(process, "Request cancelled")
                yield f"data: {json.dumps({'error': 'Request cancelled', 'cancelled': True, 'done': True})}\n\n"
            except Exception as e:
                logger.error(f"Streaming error: {e}")
                await process_emitter.fail_process(process, str(e))
                yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"

        logger.info(f"[STREAM] About to create StreamingResponse for conversation {conversation_id}")
        return StreamingResponse(
            generate_response(),
            media_type="text/plain",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive"
            }
        )
        
    except Exception as e:
        logger.error(f"Chat request failed: {e}")
        return StreamingResponse(
            generate_error_stream(f"Internal server error: {str(e)}"),
            media_type="text/plain",
            headers={"X-Error-Type": "INTERNAL_ERROR"}
        )

@api_router.delete("/history")
async def clear_history(user_email: str = Depends(get_current_user)):
    """Clear default conversation history for user."""
    try:
        conversation_store.clear_conversation("default", user_email=user_email)
        return {"message": "History cleared successfully"}
    except Exception as e:
        logger.error(f"Failed to clear history: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear history")

@api_router.get("/conversations")
async def get_conversations(user_email: str = Depends(get_current_user)):
    """Get list of all conversations for current user."""
    try:
        conversations = conversation_store.get_conversations(user_email=user_email)
        return {"conversations": conversations}
    except Exception as e:
        logger.error(f"Failed to get conversations: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve conversations")

@api_router.post("/conversations")
async def create_conversation(conversation_data: dict, user_email: str = Depends(get_current_user)):
    """Create a new conversation for current user, optionally with initial messages (for branching)."""
    try:
        conversation_id = conversation_data.get("id")
        title = conversation_data.get("title")
        messages = conversation_data.get("messages", [])  # Optional: messages for branching
        
        if not conversation_id:
            raise HTTPException(status_code=400, detail="conversation_id is required")
        
        # Create the conversation
        conversation_store.create_conversation(conversation_id, title, user_email=user_email)
        
        # If messages provided (branching), save them
        if messages:
            logger.info(f"[BRANCH] Creating conversation {conversation_id} with {len(messages)} branched messages")
            for msg_data in messages:
                from storage.message_store import Message
                msg = Message(
                    id=msg_data.get("id", str(uuid.uuid4())),
                    role=msg_data.get("role", "user"),
                    content=msg_data.get("content", ""),
                    timestamp=msg_data.get("timestamp", datetime.now().isoformat()),
                    meta=msg_data.get("meta", {})
                )
                conversation_store.add_message(conversation_id, msg, user_email=user_email)
        
        return {"message": "Conversation created successfully", "id": conversation_id}
    except Exception as e:
        logger.error(f"Failed to create conversation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/history/{conversation_id}")
async def get_conversation_history(conversation_id: str, user_email: str = Depends(get_current_user)):
    """Get chat history for a specific conversation (scoped to user)."""
    try:
        logger.info(f"[HISTORY] Request for conversation_id: {conversation_id} user={user_email}")
        messages = conversation_store.load_conversation_history(conversation_id, user_email=user_email)
        logger.info(f"[HISTORY] Returning {len(messages)} messages for conversation_id: {conversation_id} user={user_email}")
        return {
            "conversation_id": conversation_id,
            "messages": [
                {
                    "id": msg.id,
                    "role": msg.role,
                    "content": msg.content,
                    "timestamp": msg.timestamp.isoformat() if hasattr(msg.timestamp, 'isoformat') else str(msg.timestamp),
                    "provider": msg.meta.get("provider") if msg.meta else None,
                    "model": msg.meta.get("model") if msg.meta else None,
                    "meta": msg.meta
                }
                for msg in messages
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get conversation history {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve conversation history")

@api_router.delete("/history/{conversation_id}")
async def clear_conversation_history(conversation_id: str, user_email: str = Depends(get_current_user)):
    """Clear chat history for a specific conversation (scoped to user)."""
    try:
        conversation_store.clear_conversation(conversation_id, user_email=user_email)
        return {"message": f"Conversation {conversation_id} cleared successfully"}
    except Exception as e:
        logger.error(f"Failed to clear conversation {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear conversation history")

@api_router.put("/conversations/{conversation_id}/title")
async def update_conversation_title(conversation_id: str, title_data: dict, user_email: str = Depends(get_current_user)):
    """Update conversation title (scoped to user)."""
    try:
        title = title_data.get("title")
        if not title:
            raise HTTPException(status_code=400, detail="title is required")
        conversation_store.update_conversation_title(conversation_id, title, user_email=user_email)
        return {"message": "Conversation title updated successfully"}
    except Exception as e:
        logger.error(f"Failed to update conversation title {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, user_email: str = Depends(get_current_user)):
    """Delete a conversation and all its messages (scoped to user)."""
    try:
        conversation_store.delete_conversation(conversation_id, user_email=user_email)
        logger.info(f"[DELETE] Deleted conversation: {conversation_id} user={user_email}")
        return {"success": True, "message": f"Conversation {conversation_id} deleted successfully"}
    except Exception as e:
        logger.error(f"Failed to delete conversation {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete conversation: {str(e)}")

@api_router.get("/models")
async def get_all_models(_: str = Depends(get_current_user)):
    """Get all available models from all providers."""
    try:
        all_models = provider_manager.get_all_models()
        return {
            "models": [
                {
                    "id": model.id,
                    "name": model.name,
                    "display_name": model.display_name,
                    "provider": model.provider.value,
                    "context_length": model.context_length,
                    "supports_streaming": model.supports_streaming,
                    "supports_functions": model.supports_functions,
                    "supports_vision": model.supports_vision,
                    "type": model.type.value,
                    "enabled": model.enabled,
                    "pricing": model.pricing
                }
                for model in all_models
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get models: {e}")
        raise HTTPException(status_code=500, detail="Failed to get models")

@api_router.get("/config")
async def get_config(_: str = Depends(get_current_user)):
    """Get current application configuration."""
    try:
        # Load fresh config from file
        config_path = Path(__file__).parent.parent / "data" / "config.json"
        if config_path.exists():
            with open(config_path, 'r') as f:
                current_app_config = json.load(f)
        else:
            current_app_config = {}
            
        # Get enabled providers from provider manager
        enabled_providers = provider_manager.get_enabled_providers()
        
        # Build full provider configs with models
        provider_configs = {}
        for status in enabled_providers:
            provider_id = status.id.value  # Convert enum to string
            
            # Get models for this provider
            models = provider_manager.get_models_by_provider(status.id)
            
            provider_configs[provider_id] = {
                "id": provider_id,
                "name": status.name,
                "enabled": status.enabled,
                "logo": f"/logos/{provider_id}.png",
                "description": f"{status.name} AI models",
                "keyVaults": {
                    "apiKey": None  # Don't expose actual keys
                },
                "settings": {
                    "showApiKey": True,
                    "showModelFetcher": True,
                    "disableBrowserRequest": False,
                    "supportResponsesApi": True
                },
                "fetchOnClient": False,
                "models": [
                    {
                        "id": model.id,
                        "name": model.name,
                        "display_name": model.display_name,
                        "provider": provider_id,
                        "context_length": model.context_length,
                        "supports_streaming": model.supports_streaming,
                        "supports_functions": model.supports_functions,
                        "supports_vision": model.supports_vision,
                        "type": model.type.value,
                        "enabled": model.enabled,
                        "pricing": model.pricing
                    }
                    for model in models
                ]
            }
        
        # Build complete config
        full_config = {
            "activeProvider": current_app_config.get("activeProvider", "deepseek"),
            "activeModel": current_app_config.get("activeModel", "deepseek-chat"),
            "providers": provider_configs,
            "generation": {
                **{  # Default values first
                    "temperature": 0.7,
                    "max_tokens": 8192,  # Default for DeepSeek  
                    "top_p": 0.9,
                    "frequency_penalty": 0.0,
                    "presence_penalty": 0.0,
                    "stream": True,
                },
                **current_app_config.get("generation", {})  # Override with saved values
            },
            "ui": current_app_config.get("ui", {
                "theme": "light",
                "fontSize": 14,
                "language": "en",
                "enableMarkdown": True,
                "enableLatex": True,
                "compactMode": False
            }),
            "system": current_app_config.get("system", {
                "system_prompt": "You are a helpful AI assistant.",
                "max_context_tokens": 32768,  # Increased to 32K tokens
                "auto_save": True,
                "conversations_limit": 100
            })
        }
        
        return {"config": full_config}
    except Exception as e:
        logger.error(f"Failed to get config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/config")
async def update_config(config_data: dict, user: str = Depends(get_current_user)):
    """Update application configuration."""
    try:
        global app_config
        
        # Load existing config from file to preserve model_settings
        config_path = Path(__file__).parent.parent / "data" / "config.json"
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                file_config = json.load(f)
        else:
            file_config = {}
        
        # Update in-memory configuration
        for key, value in config_data.items():
            if key in app_config:
                if isinstance(app_config[key], dict) and isinstance(value, dict):
                    app_config[key].update(value)
                else:
                    app_config[key] = value
        
        # Merge with file config (to preserve model_settings and other sections)
        merged_config = {**file_config, **app_config}
        
        # Ensure model_settings is preserved from file if it exists
        if 'model_settings' in file_config and 'model_settings' not in app_config:
            merged_config['model_settings'] = file_config['model_settings']
        
        # Save merged config to file
        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        with open(config_path, "w") as f:
            json.dump(merged_config, f, indent=2)
        
        # Update in-memory config with merged result
        app_config = merged_config
        
        # Return full config with providers and models (same as GET /config)
        return await get_config(user)
        
    except Exception as e:
        logger.error(f"Failed to update config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/config/generation")
async def update_generation_config(generation_config: dict, _: str = Depends(get_current_user)):
    """Update generation configuration (includes Gemini thinking parameters)."""
    try:
        logger.info(f"[CONFIG] Updating generation config: {generation_config}")
        # Load current config file
        config_path = Path(__file__).parent.parent / "data" / "config.json"
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                current = json.load(f)
        else:
            current = {}
        if "generation" not in current:
            current["generation"] = {}
        gen = current["generation"]
        # Allowed keys
        allowed = {
            "temperature", "max_tokens", "top_p", "top_k", "frequency_penalty", "presence_penalty",
            "stop_sequences", "stream", "thinking_budget", "include_thoughts",
            # New GPT-5 params
            "verbosity", "reasoning_effort", "cfg_scale", "free_tool_calling", "grammar_definition", "tools"
        }
        for k, v in generation_config.items():
            if k in allowed:
                # Basic normalization
                if k == "verbosity" and v not in (None, "low", "medium", "high"):
                    continue
                if k == "reasoning_effort" and v not in (None, "minimal", "medium", "high"):
                    continue
                if k == "cfg_scale":
                    try:
                        v = float(v)
                    except Exception:
                        continue
                if k == "tools" and not isinstance(v, list):
                    continue
                gen[k] = v
        # Normalize thinking_budget: if provided as string, cast
        if "thinking_budget" in gen and isinstance(gen["thinking_budget"], str):
            try:
                gen["thinking_budget"] = int(gen["thinking_budget"])
            except ValueError:
                logger.warning(f"[CONFIG] Invalid thinking_budget value ignored: {gen['thinking_budget']}")
                gen.pop("thinking_budget")
        # Save
        with open(config_path, 'w') as f:
            json.dump(current, f, indent=2)
        logger.info("[CONFIG] Generation config updated successfully")
        return gen
    except Exception as e:
        logger.error(f"Failed to update generation config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# MODEL AUTO-DISCOVERY ENDPOINT
# ============================================================================

@api_router.post("/config/discover-models")
async def discover_models(force: bool = False, _: str = Depends(get_current_user)):
    """
    Auto-discover available models from all providers.
    
    This fetches the latest model list from each provider's API
    and updates the config with newly discovered models.
    
    Args:
        force: If True, bypass cache and fetch fresh data
    """
    try:
        logger.info(f"[DISCOVERY] Starting model auto-discovery (force={force})")
        
        # Collect API keys from environment and config
        api_keys = {
            "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY", ""),
            "ANTHROPIC_API_KEY": os.getenv("ANTHROPIC_API_KEY", ""),
            "GEMINI_API_KEY": os.getenv("GEMINI_API_KEY", ""),
            "DEEPSEEK_API_KEY": os.getenv("DEEPSEEK_API_KEY", ""),
            "GROQ_API_KEY": os.getenv("GROQ_API_KEY", ""),
        }
        
        # Also check secrets.json
        secrets_path = Path(__file__).parent.parent / "data" / "secrets.json"
        if secrets_path.exists():
            with open(secrets_path, 'r') as f:
                secrets = json.load(f)
                for key in api_keys:
                    if not api_keys[key] and key in secrets.get("apiKeys", {}):
                        api_keys[key] = secrets["apiKeys"][key]
        
        # Discover models
        discovered = await auto_discover_models(api_keys, force=force)
        
        # Load current config
        config_path = Path(__file__).parent.parent / "data" / "config.json"
        if config_path.exists():
            with open(config_path, 'r') as f:
                current_config = json.load(f)
        else:
            current_config = {}
        
        if "providers" not in current_config:
            current_config["providers"] = {}
        
        # Merge discovered models with existing config
        new_models_count = 0
        updated_models_count = 0
        
        for provider, models in discovered.items():
            if not models:
                continue
            
            if provider not in current_config["providers"]:
                current_config["providers"][provider] = {
                    "enabled": True,
                    "models": []
                }
            
            existing_ids = {m["id"] for m in current_config["providers"][provider].get("models", [])}
            
            for model in models:
                if model["id"] not in existing_ids:
                    current_config["providers"][provider].setdefault("models", []).append(model)
                    new_models_count += 1
                    logger.info(f"[DISCOVERY] New model found: {provider}/{model['id']}")
                else:
                    # Update existing model with new info (except user-modified fields)
                    for existing in current_config["providers"][provider]["models"]:
                        if existing["id"] == model["id"]:
                            # Preserve user settings
                            user_fields = {"enabled", "display_name"}
                            for key, value in model.items():
                                if key not in user_fields:
                                    existing[key] = value
                            existing["last_updated"] = datetime.utcnow().isoformat()
                            updated_models_count += 1
                            break
        
        # Save updated config
        with open(config_path, 'w') as f:
            json.dump(current_config, f, indent=2)
        
        # Summary
        summary = {
            "providers_checked": len(discovered),
            "new_models_found": new_models_count,
            "models_updated": updated_models_count,
            "providers": {
                provider: len(models) for provider, models in discovered.items()
            }
        }
        
        logger.info(f"[DISCOVERY] Complete: {new_models_count} new, {updated_models_count} updated")
        
        return {
            "message": "Model discovery complete",
            "summary": summary,
            "discovered": discovered
        }
        
    except Exception as e:
        logger.error(f"Model discovery failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# PER-MODEL SETTINGS ENDPOINTS
# ============================================================================

def get_model_settings_key(provider: str, model_id: str) -> str:
    """Generate unique key for model-specific settings."""
    return f"{provider}:{model_id}"

@api_router.get("/config/model-settings/{provider}/{model_id}")
async def get_model_settings(provider: str, model_id: str, _: str = Depends(get_current_user)):
    """Get settings for a specific model."""
    try:
        config_path = Path(__file__).parent.parent / "data" / "config.json"
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                current = json.load(f)
        else:
            current = {}
        
        model_settings = current.get("model_settings", {})
        key = get_model_settings_key(provider, model_id)
        
        # Return model-specific settings or defaults
        default_settings = {
            "temperature": 0.7,
            "max_tokens": 8192,
            "top_p": 1.0,
            "frequency_penalty": 0.0,
            "presence_penalty": 0.0,
            "stream": True,
            "system_prompt": "",
            "thinking_budget": None,
            "include_thoughts": False,
            "verbosity": None,
            "reasoning_effort": None,
            "cfg_scale": None,
            "free_tool_calling": False
        }
        
        settings = {**default_settings, **model_settings.get(key, {})}
        logger.info(f"[CONFIG] Getting model settings for {key}: {settings}")
        return {"settings": settings, "provider": provider, "model_id": model_id}
        
    except Exception as e:
        logger.error(f"Failed to get model settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/config/model-settings/{provider}/{model_id}")
async def update_model_settings(provider: str, model_id: str, settings: dict, _: str = Depends(get_current_user)):
    """Update settings for a specific model. Stores generation params + system_prompt per model."""
    try:
        logger.info(f"[CONFIG] Updating model settings for {provider}:{model_id}: {settings}")
        
        config_path = Path(__file__).parent.parent / "data" / "config.json"
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                current = json.load(f)
        else:
            current = {}
        
        if "model_settings" not in current:
            current["model_settings"] = {}
        
        key = get_model_settings_key(provider, model_id)
        
        # Merge with existing settings
        existing = current["model_settings"].get(key, {})
        
        # Allowed keys for per-model settings
        allowed = {
            "temperature", "max_tokens", "top_p", "top_k", "frequency_penalty", "presence_penalty",
            "stop_sequences", "stream", "thinking_budget", "include_thoughts",
            "verbosity", "reasoning_effort", "cfg_scale", "free_tool_calling", 
            "grammar_definition", "tools", "system_prompt"
        }
        
        for k, v in settings.items():
            if k in allowed:
                # Validation
                if k == "verbosity" and v not in (None, "low", "medium", "high"):
                    continue
                if k == "reasoning_effort" and v not in (None, "minimal", "medium", "high"):
                    continue
                if k == "cfg_scale" and v is not None:
                    try:
                        v = float(v)
                    except Exception:
                        continue
                if k == "tools" and v is not None and not isinstance(v, list):
                    continue
                if k == "thinking_budget" and isinstance(v, str):
                    try:
                        v = int(v)
                    except ValueError:
                        continue
                existing[k] = v
        
        current["model_settings"][key] = existing
        
        # Save
        with open(config_path, 'w') as f:
            json.dump(current, f, indent=2)
        
        logger.info(f"[CONFIG] Model settings updated for {key}")
        return {"message": "Model settings updated", "settings": existing, "provider": provider, "model_id": model_id}
        
    except Exception as e:
        logger.error(f"Failed to update model settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/config/model-settings")
async def get_all_model_settings(_: str = Depends(get_current_user)):
    """Get all per-model settings."""
    try:
        config_path = Path(__file__).parent.parent / "data" / "config.json"
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                current = json.load(f)
        else:
            current = {}
        
        model_settings = current.get("model_settings", {})
        return {"model_settings": model_settings}
        
    except Exception as e:
        logger.error(f"Failed to get all model settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# CONTEXT COMPRESSION & MESSAGE REORDERING ENDPOINTS
# ============================================================================

# Pydantic models for new endpoints
class CompressContextRequest(BaseModel):
    """Request for context compression."""
    conversation_id: str = "default"
    current_query: str
    system_prompt: Optional[str] = None
    max_tokens: Optional[int] = 4000
    keep_recent: Optional[int] = 4

class ReorderMessagesRequest(BaseModel):
    """Request for reordering messages."""
    conversation_id: str = "default"
    operation: str  # swap, move_up, move_down, move_to, reverse, sort_time, sort_role, interleave
    index: Optional[int] = None
    index1: Optional[int] = None
    index2: Optional[int] = None
    from_index: Optional[int] = None
    to_index: Optional[int] = None
    ascending: Optional[bool] = True

class CompressStatsResponse(BaseModel):
    """Response with compression statistics."""
    total_tokens_estimate: int
    max_tokens: int
    recent_count: int
    context_count: int
    within_budget: bool
    utilization: float

# Global context compressors (per conversation)
_context_compressors: Dict[str, Any] = {}

def _get_compressor(conversation_id: str, user_email: str, max_tokens: int = 4000, keep_recent: int = 4):
    """Get or create context compressor for a conversation."""
    from storage.context_compressor import ContextCompressor
    
    key = f"{user_email}:{conversation_id}"
    if key not in _context_compressors:
        _context_compressors[key] = ContextCompressor(
            max_context_tokens=max_tokens,
            keep_recent_messages=keep_recent,
            enable_embeddings=True  # Enable RAG-based retrieval
        )
    return _context_compressors[key]


@api_router.post("/context/compress")
async def compress_context(request: CompressContextRequest, user_email: str = Depends(get_current_user)):
    """
    Build compressed context for a conversation using RAG.
    
    This endpoint:
    1. Loads conversation history
    2. Keeps recent messages uncompressed
    3. Uses RAG to find relevant old messages
    4. Compresses old messages to fit token budget
    5. Returns optimized context for LLM
    """
    try:
        from storage.context_compressor import ContextCompressor
        
        # Load conversation history
        messages = conversation_store.load_conversation_history(
            request.conversation_id, 
            user_email=user_email
        )
        
        # Create compressor with requested settings
        compressor = ContextCompressor(
            max_context_tokens=request.max_tokens or 4000,
            keep_recent_messages=request.keep_recent or 4,
            enable_embeddings=True
        )
        
        # Add all messages to compressor
        for msg in messages:
            compressor.add_message(
                role=msg.role,
                content=msg.content,
                message_id=msg.id,
                metadata=msg.meta if hasattr(msg, 'meta') else {}
            )
        
        # Build compressed context
        context = compressor.build_context(
            current_query=request.current_query,
            system_prompt=request.system_prompt
        )
        
        # Get formatted messages for API
        formatted_messages = compressor.get_formatted_messages(context)
        
        logger.info(f"[COMPRESS] Built context: {context['stats']}")
        
        return {
            "success": True,
            "formatted_messages": formatted_messages,
            "recent_messages": context["recent_messages"],
            "context_messages": context["context_messages"],
            "stats": context["stats"],
            "compressor_stats": compressor.get_stats()
        }
        
    except ImportError as e:
        logger.warning(f"Context compression dependencies not installed: {e}")
        return {
            "success": False,
            "error": "Context compression requires additional dependencies: numpy, nltk, sentence-transformers",
            "install_command": "pip install numpy nltk sentence-transformers"
        }
    except Exception as e:
        logger.error(f"Failed to compress context: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/messages/reorder")
async def reorder_messages(request: ReorderMessagesRequest, user_email: str = Depends(get_current_user)):
    """
    Reorder messages in a conversation.
    
    Supported operations:
    - swap: Exchange positions of two messages (index1, index2)
    - move_up: Move message one position up (index)
    - move_down: Move message one position down (index)
    - move_to: Move message to specific position (from_index, to_index)
    - reverse: Reverse all messages order
    - sort_time: Sort by timestamp (ascending)
    - sort_role: Sort by role (system -> user -> assistant)
    - interleave: Interleave user/assistant messages
    """
    try:
        from storage.context_compressor import ChatMessageManager
        
        # Load conversation history
        messages = conversation_store.load_conversation_history(
            request.conversation_id,
            user_email=user_email
        )
        
        # Convert to dict format
        messages_dict = [
            {
                "id": msg.id,
                "role": msg.role,
                "content": msg.content,
                "timestamp": msg.timestamp.isoformat() if hasattr(msg.timestamp, 'isoformat') else str(msg.timestamp),
                "meta": msg.meta if hasattr(msg, 'meta') else {}
            }
            for msg in messages
        ]
        
        # Create manager and apply operation
        manager = ChatMessageManager(messages_dict)
        
        # Prepare kwargs based on operation
        kwargs = {}
        if request.index is not None:
            kwargs['index'] = request.index
        if request.index1 is not None:
            kwargs['index1'] = request.index1
        if request.index2 is not None:
            kwargs['index2'] = request.index2
        if request.from_index is not None:
            kwargs['from_index'] = request.from_index
        if request.to_index is not None:
            kwargs['to_index'] = request.to_index
        if request.ascending is not None:
            kwargs['ascending'] = request.ascending
        
        result = manager.apply_operation(request.operation, **kwargs)
        
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'Unknown error'))
        
        # Get preview of new order
        preview = manager.get_preview(max_content_len=60)
        
        logger.info(f"[REORDER] Applied {request.operation} to conversation {request.conversation_id}")
        
        return {
            "success": True,
            "operation": request.operation,
            "message_count": len(manager.messages),
            "preview": preview,
            "messages": manager.to_list()
        }
        
    except ImportError as e:
        logger.warning(f"Message manager not available: {e}")
        return {
            "success": False,
            "error": "Message reordering module not available"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to reorder messages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/messages/preview/{conversation_id}")
async def preview_messages(conversation_id: str, user_email: str = Depends(get_current_user)):
    """Get a preview of messages in conversation with reordering info."""
    try:
        from storage.context_compressor import ChatMessageManager
        
        messages = conversation_store.load_conversation_history(
            conversation_id,
            user_email=user_email
        )
        
        messages_dict = [
            {
                "id": msg.id,
                "role": msg.role,
                "content": msg.content,
                "timestamp": msg.timestamp.isoformat() if hasattr(msg.timestamp, 'isoformat') else str(msg.timestamp),
            }
            for msg in messages
        ]
        
        manager = ChatMessageManager(messages_dict)
        preview = manager.get_preview(max_content_len=80)
        
        return {
            "conversation_id": conversation_id,
            "message_count": len(messages),
            "preview": preview
        }
        
    except Exception as e:
        logger.error(f"Failed to get message preview: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/context/stats")
async def get_compression_stats(user_email: str = Depends(get_current_user)):
    """Get global compression statistics for user's sessions."""
    try:
        user_compressors = {
            k: v.get_stats() 
            for k, v in _context_compressors.items() 
            if k.startswith(f"{user_email}:")
        }
        
        total_stats = {
            "active_sessions": len(user_compressors),
            "total_messages": sum(s.get("total_messages", 0) for s in user_compressors.values()),
            "total_compressed": sum(s.get("total_compressed", 0) for s in user_compressors.values()),
            "tokens_saved": sum(s.get("tokens_saved", 0) for s in user_compressors.values()),
            "sessions": user_compressors
        };
        
        return total_stats;
        
    except Exception as e:
        logger.error(f"Failed to get compression stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# === PROCESS EVENTS ENDPOINTS ===

@api_router.get("/processes/stream")
async def stream_processes(
    conversation_id: Optional[str] = None,
    _: str = Depends(get_current_user)
):
    """Stream process events via SSE."""
    return StreamingResponse(
        stream_process_events(conversation_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@api_router.get("/processes/{conversation_id}")
async def get_processes(conversation_id: str, _: str = Depends(get_current_user)):
    """Get all processes for a conversation."""
    processes = process_emitter.get_processes_for_conversation(conversation_id)
    return {
        "conversation_id": conversation_id,
        "processes": [p.to_dict() for p in processes]
    }


@api_router.get("/processes/{process_id}/details")
async def get_process_details(process_id: str, _: str = Depends(get_current_user)):
    """Get details of a specific process."""
    process = process_emitter.get_process(process_id)
    if not process:
        raise HTTPException(status_code=404, detail="Process not found")
    return process.to_dict()


# === MULTI-MODEL ENDPOINTS ===

# Global multi-model orchestrator
_multi_model_orchestrator = None

def get_multi_model_orchestrator() -> MultiModelOrchestrator:
    global _multi_model_orchestrator
    if _multi_model_orchestrator is None:
        _multi_model_orchestrator = MultiModelOrchestrator(provider_manager)
    return _multi_model_orchestrator


@api_router.get("/multi-model/presets")
async def get_multi_model_presets(_: str = Depends(get_current_user)):
    """Get available multi-model presets."""
    presets = {}
    for key, preset in MULTI_MODEL_PRESETS.items():
        presets[key] = {
            "name": preset["name"],
            "description": preset["description"],
            "mode": preset["mode"].value,
            "models": [m.to_dict() for m in preset["models"]]
        }
    return {"presets": presets}


@api_router.post("/multi-model/chat")
async def multi_model_chat(
    request: MultiModelChatRequest,
    http_request: Request,
    user_email: str = Depends(get_current_user)
):
    """Send message to multiple models simultaneously."""
    
    orchestrator = get_multi_model_orchestrator()
    conversation_id = request.conversation_id or str(uuid.uuid4())
    
    # Parse mode
    try:
        mode = MultiModelMode(request.mode)
    except ValueError:
        mode = MultiModelMode.PARALLEL
    
    # Build model configs
    model_configs = [
        ModelConfig(
            provider=m.provider,
            model=m.model,
            display_name=m.display_name,
            weight=m.weight,
            timeout=m.timeout,
            enabled=m.enabled,
            params=m.params or {}
        )
        for m in request.models
    ]
    
    # Load conversation history
    history = conversation_store.load_conversation_history(
        conversation_id, user_email=user_email
    )
    
    # Build messages list
    messages = []
    if request.system_prompt:
        messages.append({"role": "system", "content": request.system_prompt})
    
    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})
    
    messages.append({"role": "user", "content": request.message})
    
    # Save user message
    user_message = Message(
        id=str(uuid.uuid4()),
        role="user",
        content=request.message,
        timestamp=datetime.now(),
        meta={
            "conversation_id": conversation_id,
            "multi_model": True,
            "models": [m.model for m in model_configs]
        }
    )
    try:
        conversation_store.save_message(conversation_id, user_message, user_email=user_email)
    except Exception as save_err:
        logger.error(f"[MULTI-MODEL] Failed to save user message: {save_err}")
    
    # Create process tracking
    process = process_emitter.create_process(
        process_type=ProcessType.MULTI_MODEL,
        name=f"Multi-Model: {mode.value}",
        conversation_id=conversation_id,
        steps=[f"Query {m.display_name or m.model}" for m in model_configs] + ["Aggregate results"],
        metadata={
            "mode": mode.value,
            "model_count": len(model_configs)
        }
    )
    
    generation_config = request.config or {}
    
    if request.stream:
        async def generate_multi_stream():
            import asyncio
            message_queue = asyncio.Queue()
            execution_done = asyncio.Event()
            final_result = {"result": None, "error": None}
            
            await process_emitter.start_process(process)
            
            current_responses = {m.model: "" for m in model_configs}
            
            async def on_stream(model_config, chunk):
                current_responses[model_config.model] += chunk
                await message_queue.put(f"data: {json.dumps({'type': 'chunk', 'model': model_config.model, 'provider': model_config.provider, 'content': chunk})}\n\n")
            
            async def on_model_complete(response):
                # Find step index for this model
                for i, step in enumerate(process.steps):
                    if response.model_config.model in step.name:
                        await process_emitter.complete_step(process, i, 
                            metadata={"latency_ms": response.latency_ms})
                        break
                
                await message_queue.put(f"data: {json.dumps({'type': 'model_complete', 'model': response.model_config.model, 'content': response.content, 'latency_ms': response.latency_ms, 'success': response.success, 'error': response.error})}\n\n")
            
            async def run_orchestrator():
                try:
                    result = await orchestrator.execute(
                        models=model_configs,
                        messages=messages,
                        mode=mode,
                        generation_params=generation_config,
                        on_stream=on_stream,
                        on_model_complete=on_model_complete
                    )
                    
                    await process_emitter.complete_process(process, metadata={
                        "total_latency_ms": result.total_latency_ms,
                        "responses_count": len(result.responses)
                    })
                    
                    # Save assistant responses
                    for resp in result.responses:
                        if resp.success:
                            assistant_message = Message(
                                id=str(uuid.uuid4()),
                                role="assistant",
                                content=resp.content,
                                timestamp=datetime.now(),
                                meta={
                                    "provider": resp.model_config.provider,
                                    "model": resp.model_config.model,
                                    "multi_model": True,
                                    "latency_ms": resp.latency_ms,
                                    "usage": resp.tokens_used
                                }
                            )
                            try:
                                conversation_store.save_message(
                                    conversation_id, assistant_message, user_email=user_email
                                )
                            except Exception as save_err:
                                logger.error(f"[MULTI-MODEL] Failed to save assistant message: {save_err}")
                    
                    final_result["result"] = result
                except Exception as e:
                    await process_emitter.fail_process(process, str(e))
                    final_result["error"] = str(e)
                finally:
                    execution_done.set()
            
            # Start orchestrator in background
            asyncio.create_task(run_orchestrator())
            
            # Yield messages from queue until done
            while not execution_done.is_set() or not message_queue.empty():
                try:
                    msg = await asyncio.wait_for(message_queue.get(), timeout=0.1)
                    yield msg
                except asyncio.TimeoutError:
                    continue
            
            # Send final result
            if final_result["error"]:
                yield f"data: {json.dumps({'type': 'error', 'error': final_result['error']})}\n\n"
            elif final_result["result"]:
                yield f"data: {json.dumps({'type': 'done', 'result': final_result['result'].to_dict()})}\n\n"
        
        return StreamingResponse(
            generate_multi_stream(),
            media_type="text/event-stream"
        )
    else:
        # Non-streaming mode
        await process_emitter.start_process(process)
        
        try:
            result = await orchestrator.execute(
                models=model_configs,
                messages=messages,
                mode=mode,
                generation_params=generation_config
            )
            
            await process_emitter.complete_process(process)
            
            # Save responses
            for resp in result.responses:
                if resp.success:
                    assistant_message = Message(
                        id=str(uuid.uuid4()),
                        role="assistant",
                        content=resp.content,
                        timestamp=datetime.now(),
                        meta={
                            "provider": resp.model_config.provider,
                            "model": resp.model_config.model,
                            "multi_model": True,
                            "latency_ms": resp.latency_ms
                        }
                    )
                    try:
                        conversation_store.save_message(
                            conversation_id, assistant_message, user_email=user_email
                        )
                    except Exception as save_err:
                        logger.error(f"[MULTI-MODEL] Failed to save message: {save_err}")
            
            return result.to_dict()
            
        except Exception as e:
            await process_emitter.fail_process(process, str(e))
            raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/multi-model/cancel/{execution_id}")
async def cancel_multi_model(execution_id: str, _: str = Depends(get_current_user)):
    """Cancel an active multi-model execution."""
    orchestrator = get_multi_model_orchestrator()
    success = orchestrator.cancel_execution(execution_id)
    return {"success": success, "execution_id": execution_id}


# === MESSAGE STORE ENDPOINTS ===

@api_router.get("/messages/search")
async def search_messages(
    q: str,
    conversation_id: Optional[str] = None,
    limit: int = 50,
    user_email: str = Depends(get_current_user)
):
    """Search messages using full-text search."""
    try:
        message_store = get_message_store()
        results = message_store.search_messages(
            query=q,
            conversation_id=conversation_id,
            user_email=user_email,
            limit=limit
        )
        return {"results": results, "count": len(results)}
    except Exception as e:
        logger.error(f"Message search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/messages/{conversation_id}/history")
async def get_message_history(
    conversation_id: str,
    limit: Optional[int] = None,
    offset: int = 0,
    include_deleted: bool = False,
    user_email: str = Depends(get_current_user)
):
    """Get messages from the message database."""
    try:
        message_store = get_message_store()
        messages = message_store.get_messages(
            conversation_id=conversation_id,
            user_email=user_email,
            limit=limit,
            offset=offset,
            include_deleted=include_deleted
        )
        return {"messages": messages, "count": len(messages)}
    except Exception as e:
        logger.error(f"Failed to get message history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/messages/{message_id}/thinking")
async def get_thinking_steps(message_id: str, _: str = Depends(get_current_user)):
    """Get thinking/reasoning steps for a message."""
    try:
        message_store = get_message_store()
        steps = message_store.get_thinking_steps(message_id)
        return {"message_id": message_id, "steps": steps}
    except Exception as e:
        logger.error(f"Failed to get thinking steps: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/messages/{message_id}/multi-model")
async def get_multi_model_responses(message_id: str, _: str = Depends(get_current_user)):
    """Get all multi-model responses for a message."""
    try:
        message_store = get_message_store()
        responses = message_store.get_multi_model_responses(message_id)
        return {"message_id": message_id, "responses": responses}
    except Exception as e:
        logger.error(f"Failed to get multi-model responses: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class MessageFeedbackRequest(BaseModel):
    feedback_type: str  # like, dislike, flag, regenerate
    comment: Optional[str] = None


@api_router.post("/messages/{message_id}/feedback")
async def add_message_feedback(
    message_id: str,
    request: MessageFeedbackRequest,
    user_email: str = Depends(get_current_user)
):
    """Add feedback to a message."""
    try:
        message_store = get_message_store()
        success = message_store.add_feedback(
            message_id=message_id,
            feedback_type=request.feedback_type,
            user_email=user_email,
            comment=request.comment
        )
        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to add feedback: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/messages/{message_id}")
async def delete_message(message_id: str, _: str = Depends(get_current_user)):
    """Soft delete a message."""
    try:
        message_store = get_message_store()
        success = message_store.soft_delete_message(message_id)
        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to delete message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/messages/stats")
async def get_message_stats(
    conversation_id: Optional[str] = None,
    user_email: str = Depends(get_current_user)
):
    """Get message statistics."""
    try:
        message_store = get_message_store()
        stats = message_store.get_stats(
            conversation_id=conversation_id,
            user_email=user_email
        )
        return stats
    except Exception as e:
        logger.error(f"Failed to get message stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Register API router
app.include_router(api_router)
app.include_router(google_auth_router)

# Register RAG router under /api prefix
app.include_router(rag_router, prefix="/api")

# Serve static files (frontend) at root - AFTER API router registration
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    debug = os.getenv("DEBUG", "False").lower() == "true"  # Изменено на False по умолчанию
    
    uvicorn.run(
        "main:app", 
        host=host, 
        port=port, 
        reload=debug,  # Только если DEBUG=True
        log_level="info",
        timeout_keep_alive=600,  # 10 minutes keep-alive for long requests
        timeout_graceful_shutdown=60
    )
