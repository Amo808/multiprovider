import asyncio
import logging
from typing import Dict, Any, Optional, List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import uuid
from datetime import datetime
import os
from dotenv import load_dotenv

# Import our custom modules
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from adapters import (
    provider_manager, 
    ModelProvider, 
    Message, 
    GenerationParams, 
    ProviderStatus
)
from storage import HistoryStore, PromptBuilder

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

# Initialize FastAPI app
app = FastAPI(
    title="AI Chat API",
    description="Multi-provider AI chat interface",
    version="2.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://192.168.110.143:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
history_store = None
prompt_builder = None
app_config = None

@app.on_event("startup")
async def startup_event():
    """Initialize on startup."""
    global history_store, prompt_builder, app_config
    
    try:
        # Initialize provider manager
        await provider_manager.initialize()
        
        # Initialize history store
        history_path = Path(__file__).parent.parent / "data" / "history.jsonl"
        history_store = HistoryStore(str(history_path))
        
        # Initialize prompt builder (with default adapter)
        enabled_providers = provider_manager.get_enabled_providers()
        if enabled_providers:
            default_adapter = provider_manager.registry.get(enabled_providers[0].id)
            prompt_builder = PromptBuilder(
                adapter=default_adapter,
                max_tokens=8192
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
                    "max_tokens": 8192,
                    "top_p": 1.0,
                    "stream": True
                },
                "system": {
                    "max_context_tokens": 8192,
                    "auto_save": True
                }
            }
            
        logger.info(f"Initialized with {len(provider_manager.get_enabled_providers())} enabled providers")
        
    except Exception as e:
        logger.error(f"Failed to initialize: {e}")
        raise


@app.get("/health")
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

@app.get("/providers")
async def get_providers():
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

@app.post("/providers/{provider_id}/toggle")
async def toggle_provider(provider_id: str, enabled: bool = True):
    """Enable or disable a provider."""
    try:
        await provider_manager.enable_provider(provider_id, enabled)
        return {"success": True, "message": f"Provider {provider_id} {'enabled' if enabled else 'disabled'}"}
    except Exception as e:
        logger.error(f"Failed to toggle provider {provider_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/providers/{provider_id}/config")
async def update_provider_config(provider_id: str, config_update: ProviderConfigUpdate):
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

@app.post("/providers/{provider_id}/models/refresh")
async def refresh_provider_models(provider_id: str):
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

@app.post("/providers/{provider_id}/test")
async def test_provider_connection(provider_id: str):
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

@app.get("/history")
async def get_history():
    """Get chat history."""
    try:
        messages = history_store.load_history()
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


@app.post("/chat/send")
async def send_message(request: ChatRequest):
    """Send a chat message and get streaming response."""
    
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
             adapter.config.api_key == 'your_anthropic_api_key_here')):
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
                "conversation_id": request.conversation_id
            }
        )
        
        # Save user message
        history_store.save_message(user_message)
        
        # Load history and build context
        history = history_store.load_history()
        
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
            max_tokens=generation_config.get("max_tokens", 8192),
            top_p=generation_config.get("top_p", 1.0),
            frequency_penalty=generation_config.get("frequency_penalty", 0.0),
            presence_penalty=generation_config.get("presence_penalty", 0.0),
            stream=request.stream
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
                "conversation_id": request.conversation_id
            }
        )
        
        async def generate_response():
            """Generate streaming response."""
            full_content = ""
            total_tokens_in = 0
            total_tokens_out = 0
            
            try:
                async for response in provider_manager.chat_completion(
                    history, provider_id, model_id, params
                ):
                    if response.error:
                        # Check if this is an authentication error (401)
                        if ("401" in response.error and "authentication" in response.error.lower()) or \
                           ("Authentication Fails" in response.error) or \
                           ("invalid" in response.error and "api key" in response.error.lower()):
                            logger.warning(f"Authentication error detected for {provider_id}: {response.error}")
                            yield f"data: {json.dumps({'error': f'API key for {provider_id} is invalid. Please check your API key in settings.', 'type': 'API_KEY_MISSING', 'done': True})}\n\n"
                        else:
                            yield f"data: {json.dumps({'error': response.error, 'done': True})}\n\n"
                        break
                        
                    if response.content:
                        full_content += response.content
                        yield f"data: {json.dumps({'content': response.content, 'id': assistant_message.id, 'done': False, 'provider': provider_id, 'model': model_id})}\n\n"
                    
                    if response.meta:
                        total_tokens_in = response.meta.get("tokens_in", 0)
                        total_tokens_out = response.meta.get("tokens_out", 0)
                    
                    if response.done:
                        # Save complete assistant message
                        assistant_message.content = full_content
                        assistant_message.meta.update({
                            "tokens_in": total_tokens_in,
                            "tokens_out": total_tokens_out,
                            "total_tokens": total_tokens_in + total_tokens_out,
                            "estimated_cost": response.usage.estimated_cost if response.usage else None
                        })
                        history_store.save_message(assistant_message)
                        
                        # Prepare usage data for response
                        usage_data = {}
                        if response.usage:
                            usage_data = {
                                "prompt_tokens": response.usage.prompt_tokens,
                                "completion_tokens": response.usage.completion_tokens,
                                "total_tokens": response.usage.total_tokens,
                                "estimated_cost": response.usage.estimated_cost
                            }
                        
                        # Send completion signal with usage
                        final_response = {
                            'done': True, 
                            'id': assistant_message.id, 
                            'provider': provider_id, 
                            'model': model_id, 
                            'meta': {
                                'tokens_in': total_tokens_in, 
                                'tokens_out': total_tokens_out, 
                                'total_tokens': total_tokens_in + total_tokens_out,
                                'estimated_cost': response.usage.estimated_cost if response.usage else None
                            }
                        }
                        if usage_data:
                            final_response['usage'] = usage_data
                            
                        yield f"data: {json.dumps(final_response)}\n\n"
                        break
                
            except Exception as e:
                logger.error(f"Streaming error: {e}")
                yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"

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

@app.delete("/history")
async def clear_history():
    """Clear chat history."""
    try:
        history_store.clear_history()
        return {"message": "History cleared successfully"}
    except Exception as e:
        logger.error(f"Failed to clear history: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear history")
    except Exception as e:
        logger.error(f"Failed to clear history: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear history")


@app.get("/models")
async def get_all_models():
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

@app.get("/models/{provider_id}")
async def get_provider_models(provider_id: str):
    """Get models for specific provider."""
    try:
        models = provider_manager.get_models_by_provider(provider_id)
        return {
            "provider": provider_id,
            "models": [
                {
                    "id": model.id,
                    "name": model.name,
                    "display_name": model.display_name,
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
    except Exception as e:
        logger.error(f"Failed to get models for provider {provider_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get provider models")

@app.post("/config")
async def update_config(config_data: dict):
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

@app.get("/config")
async def get_config():
    """Get current application configuration."""
    try:
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
            "activeProvider": app_config.get("activeProvider", "deepseek"),
            "activeModel": app_config.get("activeModel", "deepseek-chat"),
            "providers": provider_configs,
            "generation": app_config.get("generation", {
                "temperature": 0.7,
                "max_tokens": 8192,
                "top_p": 0.9,
                "frequency_penalty": 0.0,
                "presence_penalty": 0.0,
                "stream": True
            }),
            "ui": app_config.get("ui", {
                "theme": "light",
                "fontSize": 14,
                "language": "en",
                "enableMarkdown": True,
                "enableLatex": True,
                "compactMode": False
            }),
            "system": app_config.get("system", {
                "system_prompt": "You are a helpful AI assistant.",
                "max_context_tokens": 8192,
                "auto_save": True,
                "conversations_limit": 100
            })
        }
        
        return {"config": full_config}
    except Exception as e:
        logger.error(f"Failed to get config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/history/{conversation_id}")
async def get_conversation_history(conversation_id: str):
    """Get chat history for a specific conversation."""
    try:
        # For now, return empty history for new conversations
        # In a real implementation, you'd filter by conversation_id
        logger.info(f"Getting history for conversation: {conversation_id}")
        
        # Since the current history store doesn't support conversation filtering,
        # we'll return an empty list for now and let the frontend manage state
        return []
        
    except Exception as e:
        logger.error(f"Failed to get conversation history for {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve conversation history")

@app.delete("/history/{conversation_id}")
async def clear_conversation_history(conversation_id: str):
    """Clear chat history for a specific conversation."""
    try:
        logger.info(f"Clearing history for conversation: {conversation_id}")
        
        # For now, just return success
        # In a real implementation, you'd clear only this conversation's history
        return {"message": f"History cleared for conversation {conversation_id}"}
        
    except Exception as e:
        logger.error(f"Failed to clear conversation history for {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear conversation history")


if __name__ == "__main__":
    import uvicorn
    
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    debug = os.getenv("DEBUG", "True").lower() == "true"
    
    uvicorn.run(
        "main:app", 
        host=host, 
        port=port, 
        reload=debug,
        log_level="info"
    )
