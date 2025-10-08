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

# Import our custom modules
import sys
from pathlib import Path
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
from auth_google import router as google_auth_router, get_current_user as original_get_current_user

# --- Dev Auth Bypass Setup ---------------------------------------------------
# We want local development to ALWAYS work without Google OAuth / JWT.
# Conditions for bypass:
# 1. Explicit DEV_MODE=1 OR
# 2. Running locally (no RENDER env var) AND FORCE_DEV_AUTH not disabled
# You can disable bypass by setting FORCE_DEV_AUTH=0 (even if running locally).
DEV_MODE_FLAG = os.getenv("DEV_MODE", "0") == "1"
LOCAL_ENV = not os.getenv("RENDER")
FORCE_DEV_AUTH = os.getenv("FORCE_DEV_AUTH", "1") == "1"
DEV_STATIC_USER = os.getenv("DEV_STATIC_USER", "dev@example.com")
DEV_AUTH_ACTIVE = DEV_MODE_FLAG or (LOCAL_ENV and FORCE_DEV_AUTH)

if DEV_AUTH_ACTIVE:
    # Override dependency so every endpoint treats requests as authenticated.
    def get_current_user():  # type: ignore
        return DEV_STATIC_USER
    logging.getLogger(__name__).info(
        f"[DEV-AUTH] Bypass ACTIVE (user={DEV_STATIC_USER}) | DEV_MODE_FLAG={DEV_MODE_FLAG} LOCAL_ENV={LOCAL_ENV} FORCE_DEV_AUTH={FORCE_DEV_AUTH}" 
    )
else:
    # Use the real auth dependency
    get_current_user = original_get_current_user  # type: ignore
    logging.getLogger(__name__).info(
        f"[DEV-AUTH] Bypass DISABLED | DEV_MODE_FLAG={DEV_MODE_FLAG} LOCAL_ENV={LOCAL_ENV} FORCE_DEV_AUTH={FORCE_DEV_AUTH}"
    )
# ----------------------------------------------------------------------------

# Load environment variables
load_dotenv()

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

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan."""
    global conversation_store, prompt_builder, app_config
    
    try:
        # Startup
        # Initialize provider manager
        await provider_manager.initialize()
        
        # Initialize conversation store (database-backed)
        storage_path = Path(__file__).parent.parent / "data"
        logger.info(f"[STARTUP] Initializing DatabaseConversationStore with path: {storage_path}")
        logger.info(f"[STARTUP] Storage path exists: {storage_path.exists()}")
        logger.info(f"[STARTUP] Current working directory: {Path.cwd()}")
        
        # Use database store for reliable persistence
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
        conversation_store.save_message(conversation_id, user_message, user_email=user_email)
        
        # Load history and build context
        history = conversation_store.load_conversation_history(conversation_id, user_email=user_email)
        logger.info(f"[CHAT] Loaded {len(history)} messages from history for {conversation_id}")
        
        # Add system prompt if provided
        if request.system_prompt:
            system_msg = Message(
                id=str(uuid.uuid4()),
                role="system",
                content=request.system_prompt,
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
            """
            logger.info(f"🔍 [STREAM] generate_response() started: provider={provider_id}, model={model_id}")
            full_content = ""
            total_tokens_in = 0
            total_tokens_out = 0
            import time, asyncio as _asyncio
            start_ts = time.time()
            first_chunk_ts = None
            last_emit_ts = time.time()
            HEARTBEAT_INTERVAL = 10  # seconds
            
            # Увеличенный таймаут для reasoning моделей
            if hasattr(params, 'reasoning_effort') and params.reasoning_effort in ['medium', 'high']:
                PROVIDER_TIMEOUT = 1200  # 20 минут для reasoning
            else:
                PROVIDER_TIMEOUT = 300    # 5 минут для обычных моделей

            async def heartbeat():
                nonlocal last_emit_ts
                now = time.time()
                if now - last_emit_ts >= HEARTBEAT_INTERVAL:
                    hb = {"ping": True, "uptime": int(now - start_ts), "done": False}
                    yield f"data: {json.dumps(hb)}\n\n"
                    last_emit_ts = now

            try:
                logger.info(f"🔍 [STREAM] About to call provider_manager.chat_completion: provider={provider_id}, model={model_id}")
                # Wrapped async generator with timeout
                async def provider_stream():
                    logger.info(f"🔍 [STREAM] Inside provider_stream(), calling chat_completion...")
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
                        return

                    if response.error:
                        logger.warning(f"[CHAT] Provider error: {response.error}")
                        yield f"data: {json.dumps({'error': response.error, 'done': True})}\n\n"
                        break

                    if response.content:
                        if first_chunk_ts is None:
                            first_chunk_ts = time.time()
                            logger.info(f"[CHAT] First token latency {first_chunk_ts - start_ts:.2f}s conversation={conversation_id}")
                        full_content += response.content
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
                        assistant_message.meta.update({
                            'tokens_in': final_tokens_in,
                            'tokens_out': final_tokens_out,
                            'total_tokens': final_tokens_in + final_tokens_out,
                            'estimated_cost': estimated_cost,
                            'user_email': user_email,
                            'first_token_latency': (first_chunk_ts - start_ts) if first_chunk_ts else None,
                            'total_latency': time.time() - start_ts
                        })
                        logger.info(f"[CHAT] Saving assistant message conversation={conversation_id} total_latency={time.time()-start_ts:.2f}s")
                        conversation_store.save_message(conversation_id, assistant_message, user_email=user_email)
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
                                'total_latency': time.time() - start_ts
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
                yield f"data: {json.dumps({'error': 'Request cancelled', 'cancelled': True, 'done': True})}\n\n"
            except Exception as e:
                logger.error(f"Streaming error: {e}")
                yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"

        logger.info(f"🔍 [STREAM] About to create StreamingResponse for conversation {conversation_id}")
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
    """Create a new conversation for current user."""
    try:
        conversation_id = conversation_data.get("id")
        title = conversation_data.get("title")
        if not conversation_id:
            raise HTTPException(status_code=400, detail="conversation_id is required")
        conversation_store.create_conversation(conversation_id, title, user_email=user_email)
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
async def update_config(config_data: dict, _: str = Depends(get_current_user)):
    """Update application configuration."""
    try:
        global app_config
        
        # Update configuration
        for key, value in config_data.items():
            if key in app_config:
                if isinstance(app_config[key], dict) and isinstance(value, dict):
                    app_config[key].update(value)
                else:
                    app_config[key] = value
        
        # Save updated config to file
        config_path = Path(__file__).parent.parent / "data" / "config.json"
        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        with open(config_path, "w") as f:
            json.dump(app_config, f, indent=2)
        
        return {"message": "Configuration updated successfully", "config": app_config}
        
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

# Register API router
app.include_router(api_router)
app.include_router(google_auth_router)

# Serve static files (frontend) at root - AFTER API router registration
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")

# Add Gunicorn-compatible server config for production
# Support for longer timeouts for GPT-5 and large input handling
if __name__ == "__main__":
    import uvicorn
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--timeout", type=int, default=300, help="Request timeout in seconds for large GPT-5 requests")
    parser.add_argument("--workers", type=int, default=1)
    args = parser.parse_args()
    
    # Configure for production with large input support
    uvicorn.run(
        "main:app",
        host=args.host,
        port=args.port,
        timeout_keep_alive=120,  # Keep connections alive for heartbeat
        timeout_graceful_shutdown=30,
        limit_concurrency=50,  # Allow some concurrent GPT-5 requests
        log_level="info"
    )
