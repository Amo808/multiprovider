"""
Model Auto-Discovery Service
Automatically fetches and updates available models from all providers.
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import json
import os
import httpx

logger = logging.getLogger(__name__)

# Cache for discovered models
_model_cache: Dict[str, Any] = {}
_last_update: Dict[str, datetime] = {}
CACHE_TTL = timedelta(hours=1)  # Refresh every hour


class ModelDiscovery:
    """Auto-discover models from all providers"""
    
    def __init__(self):
        self.http_client = httpx.AsyncClient(timeout=30.0)
    
    async def close(self):
        await self.http_client.aclose()
    
    # ========================= OpenAI =========================
    async def discover_openai_models(self, api_key: str) -> List[Dict]:
        """Fetch available models from OpenAI API"""
        try:
            response = await self.http_client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {api_key}"}
            )
            response.raise_for_status()
            data = response.json()
            
            models = []
            for m in data.get("data", []):
                model_id = m["id"]
                # Filter only chat models
                if any(x in model_id for x in ["gpt-4", "gpt-3.5", "o1", "o3", "chatgpt"]):
                    models.append(self._parse_openai_model(m))
            
            logger.info(f"Discovered {len(models)} OpenAI models")
            return models
        except Exception as e:
            logger.error(f"Failed to discover OpenAI models: {e}")
            return []
    
    def _parse_openai_model(self, m: Dict) -> Dict:
        model_id = m["id"]
        
        # Determine capabilities based on model name
        supports_vision = "vision" in model_id or "gpt-4o" in model_id or "gpt-4-turbo" in model_id
        supports_functions = "gpt-4" in model_id or "gpt-3.5-turbo" in model_id
        
        # Context lengths (known values)
        context_map = {
            "gpt-4o": 128000,
            "gpt-4o-mini": 128000,
            "gpt-4-turbo": 128000,
            "gpt-4": 8192,
            "gpt-4-32k": 32768,
            "gpt-3.5-turbo": 16385,
            "o1": 200000,
            "o1-mini": 128000,
            "o1-preview": 128000,
            "o3-mini": 200000,
        }
        
        context_length = 8192
        for key, val in context_map.items():
            if key in model_id:
                context_length = val
                break
        
        return {
            "id": model_id,
            "name": model_id,
            "display_name": self._format_display_name(model_id),
            "provider": "openai",
            "type": "chat",
            "context_length": context_length,
            "max_output_tokens": min(context_length // 2, 16384),
            "supports_streaming": True,
            "supports_vision": supports_vision,
            "supports_functions": supports_functions,
            "enabled": True,
            "discovered_at": datetime.utcnow().isoformat(),
        }
    
    # ========================= Anthropic =========================
    async def discover_anthropic_models(self, api_key: str) -> List[Dict]:
        """Anthropic doesn't have a models list API, so we use known models"""
        # Anthropic models are manually curated but we can check which are available
        known_models = [
            {
                "id": "claude-sonnet-4-20250514",
                "display_name": "Claude Sonnet 4",
                "context_length": 200000,
                "max_output_tokens": 64000,
                "supports_vision": True,
            },
            {
                "id": "claude-3-5-sonnet-20241022",
                "display_name": "Claude 3.5 Sonnet",
                "context_length": 200000,
                "max_output_tokens": 8192,
                "supports_vision": True,
            },
            {
                "id": "claude-3-5-haiku-20241022",
                "display_name": "Claude 3.5 Haiku",
                "context_length": 200000,
                "max_output_tokens": 8192,
                "supports_vision": True,
            },
            {
                "id": "claude-3-opus-20240229",
                "display_name": "Claude 3 Opus",
                "context_length": 200000,
                "max_output_tokens": 4096,
                "supports_vision": True,
            },
        ]
        
        # Verify API key works
        try:
            response = await self.http_client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-3-5-haiku-20241022",
                    "max_tokens": 1,
                    "messages": [{"role": "user", "content": "hi"}]
                }
            )
            # If we get a response (even error about content), API key works
            if response.status_code in [200, 400, 429]:
                logger.info(f"Anthropic API key valid, returning {len(known_models)} known models")
                return [self._format_anthropic_model(m) for m in known_models]
        except Exception as e:
            logger.error(f"Failed to verify Anthropic API: {e}")
        
        return []
    
    def _format_anthropic_model(self, m: Dict) -> Dict:
        return {
            "id": m["id"],
            "name": m["id"],
            "display_name": m["display_name"],
            "provider": "anthropic",
            "type": "chat",
            "context_length": m["context_length"],
            "max_output_tokens": m["max_output_tokens"],
            "supports_streaming": True,
            "supports_vision": m.get("supports_vision", False),
            "supports_functions": True,
            "enabled": True,
            "discovered_at": datetime.utcnow().isoformat(),
        }
    
    # ========================= Google Gemini =========================
    async def discover_gemini_models(self, api_key: str) -> List[Dict]:
        """Fetch available models from Google Gemini API"""
        try:
            response = await self.http_client.get(
                f"https://generativelanguage.googleapis.com/v1/models?key={api_key}"
            )
            response.raise_for_status()
            data = response.json()
            
            models = []
            for m in data.get("models", []):
                name = m.get("name", "")
                # Filter only generateContent models (chat capable)
                if "generateContent" in m.get("supportedGenerationMethods", []):
                    models.append(self._parse_gemini_model(m))
            
            logger.info(f"Discovered {len(models)} Gemini models")
            return models
        except Exception as e:
            logger.error(f"Failed to discover Gemini models: {e}")
            return []
    
    def _parse_gemini_model(self, m: Dict) -> Dict:
        name = m.get("name", "").replace("models/", "")
        display_name = m.get("displayName", name)
        
        return {
            "id": name,
            "name": name,
            "display_name": display_name,
            "provider": "gemini",
            "type": "chat",
            "context_length": m.get("inputTokenLimit", 32000),
            "max_output_tokens": m.get("outputTokenLimit", 8192),
            "supports_streaming": True,
            "supports_vision": "vision" in name.lower() or "gemini-1.5" in name or "gemini-2" in name,
            "supports_functions": True,
            "enabled": True,
            "discovered_at": datetime.utcnow().isoformat(),
        }
    
    # ========================= DeepSeek =========================
    async def discover_deepseek_models(self, api_key: str) -> List[Dict]:
        """Fetch available models from DeepSeek API"""
        try:
            response = await self.http_client.get(
                "https://api.deepseek.com/models",
                headers={"Authorization": f"Bearer {api_key}"}
            )
            response.raise_for_status()
            data = response.json()
            
            models = []
            for m in data.get("data", []):
                models.append(self._parse_deepseek_model(m))
            
            logger.info(f"Discovered {len(models)} DeepSeek models")
            return models
        except Exception as e:
            logger.error(f"Failed to discover DeepSeek models: {e}")
            # Return known models as fallback
            return self._get_known_deepseek_models()
    
    def _parse_deepseek_model(self, m: Dict) -> Dict:
        model_id = m.get("id", "")
        
        context_map = {
            "deepseek-chat": 64000,
            "deepseek-coder": 64000,
            "deepseek-reasoner": 64000,
        }
        
        return {
            "id": model_id,
            "name": model_id,
            "display_name": self._format_display_name(model_id),
            "provider": "deepseek",
            "type": "chat",
            "context_length": context_map.get(model_id, 64000),
            "max_output_tokens": 8192,
            "supports_streaming": True,
            "supports_vision": False,
            "supports_functions": True,
            "enabled": True,
            "discovered_at": datetime.utcnow().isoformat(),
        }
    
    def _get_known_deepseek_models(self) -> List[Dict]:
        return [
            {
                "id": "deepseek-chat",
                "name": "deepseek-chat",
                "display_name": "DeepSeek Chat",
                "provider": "deepseek",
                "type": "chat",
                "context_length": 64000,
                "max_output_tokens": 8192,
                "supports_streaming": True,
                "supports_vision": False,
                "supports_functions": True,
                "enabled": True,
            },
            {
                "id": "deepseek-reasoner",
                "name": "deepseek-reasoner",
                "display_name": "DeepSeek Reasoner",
                "provider": "deepseek",
                "type": "chat",
                "context_length": 64000,
                "max_output_tokens": 8192,
                "supports_streaming": True,
                "supports_vision": False,
                "supports_functions": True,
                "enabled": True,
            },
        ]
    
    # ========================= Ollama (Local) =========================
    async def discover_ollama_models(self, base_url: str = "http://localhost:11434") -> List[Dict]:
        """Fetch available models from local Ollama instance"""
        try:
            response = await self.http_client.get(f"{base_url}/api/tags")
            response.raise_for_status()
            data = response.json()
            
            models = []
            for m in data.get("models", []):
                models.append(self._parse_ollama_model(m))
            
            logger.info(f"Discovered {len(models)} Ollama models")
            return models
        except Exception as e:
            logger.warning(f"Ollama not available: {e}")
            return []
    
    def _parse_ollama_model(self, m: Dict) -> Dict:
        name = m.get("name", "")
        
        return {
            "id": name,
            "name": name,
            "display_name": name.replace(":", " ").title(),
            "provider": "ollama",
            "type": "chat",
            "context_length": 8192,  # Default, varies by model
            "max_output_tokens": 4096,
            "supports_streaming": True,
            "supports_vision": "vision" in name.lower() or "llava" in name.lower(),
            "supports_functions": False,
            "enabled": True,
            "discovered_at": datetime.utcnow().isoformat(),
        }
    
    # ========================= Groq =========================
    async def discover_groq_models(self, api_key: str) -> List[Dict]:
        """Fetch available models from Groq API"""
        try:
            response = await self.http_client.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {api_key}"}
            )
            response.raise_for_status()
            data = response.json()
            
            models = []
            for m in data.get("data", []):
                if m.get("id") and "whisper" not in m["id"]:  # Skip audio models
                    models.append(self._parse_groq_model(m))
            
            logger.info(f"Discovered {len(models)} Groq models")
            return models
        except Exception as e:
            logger.error(f"Failed to discover Groq models: {e}")
            return []
    
    def _parse_groq_model(self, m: Dict) -> Dict:
        model_id = m.get("id", "")
        
        return {
            "id": model_id,
            "name": model_id,
            "display_name": self._format_display_name(model_id),
            "provider": "groq",
            "type": "chat",
            "context_length": m.get("context_window", 8192),
            "max_output_tokens": 8192,
            "supports_streaming": True,
            "supports_vision": "vision" in model_id.lower(),
            "supports_functions": True,
            "enabled": True,
            "discovered_at": datetime.utcnow().isoformat(),
        }
    
    # ========================= Helpers =========================
    def _format_display_name(self, model_id: str) -> str:
        """Convert model ID to human-readable name"""
        name = model_id.replace("-", " ").replace("_", " ")
        # Capitalize each word
        words = name.split()
        formatted = []
        for w in words:
            if w.lower() in ["gpt", "ai", "api", "llm"]:
                formatted.append(w.upper())
            elif w.isdigit() or (len(w) <= 3 and w.isalnum()):
                formatted.append(w)
            else:
                formatted.append(w.capitalize())
        return " ".join(formatted)
    
    # ========================= Main Discovery =========================
    async def discover_all(self, api_keys: Dict[str, str]) -> Dict[str, List[Dict]]:
        """Discover models from all providers with valid API keys"""
        results = {}
        
        tasks = []
        providers = []
        
        if api_keys.get("OPENAI_API_KEY"):
            tasks.append(self.discover_openai_models(api_keys["OPENAI_API_KEY"]))
            providers.append("openai")
        
        if api_keys.get("ANTHROPIC_API_KEY"):
            tasks.append(self.discover_anthropic_models(api_keys["ANTHROPIC_API_KEY"]))
            providers.append("anthropic")
        
        if api_keys.get("GEMINI_API_KEY"):
            tasks.append(self.discover_gemini_models(api_keys["GEMINI_API_KEY"]))
            providers.append("gemini")
        
        if api_keys.get("DEEPSEEK_API_KEY"):
            tasks.append(self.discover_deepseek_models(api_keys["DEEPSEEK_API_KEY"]))
            providers.append("deepseek")
        
        if api_keys.get("GROQ_API_KEY"):
            tasks.append(self.discover_groq_models(api_keys["GROQ_API_KEY"]))
            providers.append("groq")
        
        # Always try Ollama (local)
        tasks.append(self.discover_ollama_models())
        providers.append("ollama")
        
        # Run all discoveries in parallel
        discoveries = await asyncio.gather(*tasks, return_exceptions=True)
        
        for provider, models in zip(providers, discoveries):
            if isinstance(models, Exception):
                logger.error(f"Discovery failed for {provider}: {models}")
                results[provider] = []
            else:
                results[provider] = models
        
        return results


# Global instance
_discovery_service: Optional[ModelDiscovery] = None


def get_discovery_service() -> ModelDiscovery:
    global _discovery_service
    if _discovery_service is None:
        _discovery_service = ModelDiscovery()
    return _discovery_service


async def auto_discover_models(api_keys: Dict[str, str], force: bool = False) -> Dict[str, List[Dict]]:
    """
    Auto-discover models with caching.
    
    Args:
        api_keys: Dict of provider API keys
        force: If True, bypass cache and fetch fresh data
    
    Returns:
        Dict mapping provider names to lists of model configs
    """
    global _model_cache, _last_update
    
    now = datetime.utcnow()
    
    # Check cache
    if not force and _model_cache and _last_update:
        oldest = min(_last_update.values()) if _last_update else datetime.min
        if now - oldest < CACHE_TTL:
            logger.info("Returning cached model discovery results")
            return _model_cache
    
    # Fetch fresh data
    service = get_discovery_service()
    results = await service.discover_all(api_keys)
    
    # Update cache
    _model_cache = results
    for provider in results:
        _last_update[provider] = now
    
    return results
