import logging
import asyncio
from typing import Dict, List, Optional, AsyncGenerator, Any, Union
from dataclasses import dataclass, field
import json
import os
from pathlib import Path

from .base_provider import (
    BaseAdapter, 
    ProviderRegistry, 
    registry,
    ModelProvider, 
    ProviderConfig, 
    ModelInfo, 
    Message, 
    GenerationParams, 
    ChatResponse
)
from .deepseek_provider import DeepSeekAdapter
from .openai_provider import OpenAIAdapter
from .anthropic_provider import AnthropicAdapter
from .gemini_provider import GeminiAdapter

logger = logging.getLogger(__name__)

@dataclass
class ProviderStatus:
    """Status of a provider"""
    id: ModelProvider
    name: str
    enabled: bool
    connected: bool = False
    loading: bool = False
    error: Optional[str] = None
    last_check: Optional[str] = None
    models_count: int = 0
    config_valid: bool = False
    has_api_key: bool = False

class ProviderManager:
    """Manages all AI providers and their configurations"""
    
    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path or "data/providers_config.json"
        self.registry = registry
        self.provider_configs: Dict[ModelProvider, ProviderConfig] = {}
        self.provider_status: Dict[ModelProvider, ProviderStatus] = {}
        self.logger = logging.getLogger(f"{__name__}.Manager")
        
    async def initialize(self):
        """Initialize the provider manager"""
        self.logger.info("Initializing Provider Manager...")
        
        # Load configurations
        await self.load_configurations()
        
        # Register all available providers
        await self.register_providers()
        
        # Validate all providers
        await self.validate_providers()
        
        self.logger.info(f"Provider Manager initialized with {len(self.registry.get_enabled())} enabled providers")

    async def load_configurations(self):
        """Load provider configurations from file"""
        try:
            if os.path.exists(self.config_path):
                self.logger.info(f"Loading provider configs from: {self.config_path}")
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    config_data = json.load(f)
                    providers_dict = config_data.get("providers", {})
                    
                for provider_id, config in providers_dict.items():
                    try:
                        provider_enum = ModelProvider(provider_id)
                        self.logger.info(f"Successfully mapped '{provider_id}' to {provider_enum}")
                        self.provider_configs[provider_enum] = ProviderConfig(
                            id=provider_enum,
                            name=config.get("name", provider_id),
                            enabled=config.get("enabled", False),
                            api_key=config.get("api_key") or os.getenv(config.get("api_key_env", "")),
                            base_url=config.get("base_url"),
                            endpoint=config.get("endpoint"),
                            region=config.get("region"),
                            api_version=config.get("api_version"),
                            extra_params=config.get("extra_params", {})
                        )
                        self.logger.info(f"Config successfully created for {provider_enum}, enabled={config.get('enabled', False)}")
                    except ValueError as e:
                        self.logger.warning(f"Failed to map provider '{provider_id}': {e}")
                        self.logger.warning(f"Unknown provider: {provider_id}")
            else:
                # Create default configurations
                await self.create_default_configurations()
                
        except Exception as e:
            self.logger.error(f"Failed to load configurations: {e}")
            await self.create_default_configurations()

    async def create_default_configurations(self):
        """Create default provider configurations"""
        self.logger.info("DEBUG: Creating default configurations")
        defaults = {
            ModelProvider.DEEPSEEK: ProviderConfig(
                id=ModelProvider.DEEPSEEK,
                name="DeepSeek",
                enabled=bool(os.getenv("DEEPSEEK_API_KEY")),
                api_key=os.getenv("DEEPSEEK_API_KEY"),
                base_url="https://api.deepseek.com"
            ),
            ModelProvider.OPENAI: ProviderConfig(
                id=ModelProvider.OPENAI,
                name="OpenAI",
                enabled=bool(os.getenv("OPENAI_API_KEY")),
                api_key=os.getenv("OPENAI_API_KEY"),
                base_url="https://api.openai.com/v1"
            ),
            ModelProvider.ANTHROPIC: ProviderConfig(
                id=ModelProvider.ANTHROPIC,
                name="Anthropic",
                enabled=bool(os.getenv("ANTHROPIC_API_KEY")),
                api_key=os.getenv("ANTHROPIC_API_KEY"),
                base_url="https://api.anthropic.com"
            ),
            ModelProvider.GEMINI: ProviderConfig(
                id=ModelProvider.GEMINI,
                name="Google Gemini",
                enabled=False,  # Will be set from config file
                api_key=None,   # Will be set from config file or environment
                base_url="https://generativelanguage.googleapis.com"
            ),
            ModelProvider.OLLAMA: ProviderConfig(
                id=ModelProvider.OLLAMA,
                name="Ollama",
                enabled=bool(os.getenv("OLLAMA_BASE_URL")),
                base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
            ),
            ModelProvider.GROQ: ProviderConfig(
                id=ModelProvider.GROQ,
                name="Groq",
                enabled=bool(os.getenv("GROQ_API_KEY")),
                api_key=os.getenv("GROQ_API_KEY"),
                base_url="https://api.groq.com/openai/v1"
            ),
            ModelProvider.MISTRAL: ProviderConfig(
                id=ModelProvider.MISTRAL,
                name="Mistral AI",
                enabled=bool(os.getenv("MISTRAL_API_KEY")),
                api_key=os.getenv("MISTRAL_API_KEY"),
                base_url="https://api.mistral.ai/v1"
            )
        }
        
        self.provider_configs = defaults
        self.logger.info(f"DEBUG: Created {len(defaults)} default configurations")
        for provider, config in defaults.items():
            self.logger.info(f"DEBUG: {provider} -> enabled={config.enabled}, has_api_key={bool(config.api_key)}")
        await self.save_configurations()

    async def save_configurations(self):
        """Save provider configurations to file"""
        try:
            config_data = {
                "providers": {}
            }
            
            for provider, config in self.provider_configs.items():
                config_data["providers"][provider.value] = {
                    "name": config.name,
                    "enabled": config.enabled,
                    "base_url": config.base_url,
                    "endpoint": config.endpoint,
                    "region": config.region,
                    "api_version": config.api_version,
                    "extra_params": config.extra_params,
                    # Don't save actual API keys, save env var names instead
                    "api_key_env": f"{provider.value.upper()}_API_KEY"
                }
            
            os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
            with open(self.config_path, 'w') as f:
                json.dump(config_data, f, indent=2)
                
        except Exception as e:
            self.logger.error(f"Failed to save configurations: {e}")

    async def register_providers(self):
        """Register all available provider adapters"""
        
        available_adapters = {
            ModelProvider.DEEPSEEK: DeepSeekAdapter,
            ModelProvider.OPENAI: OpenAIAdapter,
            ModelProvider.ANTHROPIC: AnthropicAdapter,
            ModelProvider.GEMINI: GeminiAdapter,
            # TODO: Add more providers
        }
        
        for provider_id, adapter_class in available_adapters.items():
            self.logger.info(f"Trying to register {provider_id}")
            config = self.provider_configs.get(provider_id)
            if config:
                self.logger.info(f"Config found for {provider_id}, enabled={config.enabled}")
                try:
                    adapter = adapter_class(config)
                    self.registry.register(adapter)
                    
                    # Initialize status
                    self.provider_status[provider_id] = ProviderStatus(
                        id=provider_id,
                        name=config.name,
                        enabled=config.enabled,
                        config_valid=bool(config.api_key or config.base_url),
                        has_api_key=bool(config.api_key)
                    )
                    
                    self.logger.info(f"Registered provider: {config.name}")
                except Exception as e:
                    self.logger.error(f"Failed to register {provider_id}: {e}")
            else:
                self.logger.warning(f"DEBUG: No config found for {provider_id}")

    async def validate_providers(self):
        """Validate all registered providers"""
        self.logger.info("Validating providers...")
        
        validation_tasks = []
        for provider_id, adapter in self.registry.get_all().items():
            if adapter.config.enabled:
                validation_tasks.append(self._validate_provider(provider_id, adapter))
        
        if validation_tasks:
            await asyncio.gather(*validation_tasks, return_exceptions=True)

    async def _validate_provider(self, provider_id: ModelProvider, adapter: BaseAdapter):
        """Validate a single provider"""
        status = self.provider_status.get(provider_id)
        if not status:
            return
            
        status.loading = True
        # Update API key status
        status.has_api_key = bool(adapter.config.api_key)
        
        try:
            is_valid, error = await adapter.validate_connection()
            status.connected = is_valid
            status.error = error
            
            if is_valid:
                models = await adapter.get_available_models()
                status.models_count = len(models)
                self.logger.info(f"Provider {adapter.name}: [OK] Connected, {len(models)} models")
            else:
                self.logger.warning(f"Provider {adapter.name}: [ERROR] {error}")
                
        except Exception as e:
            status.connected = False
            status.error = str(e)
            self.logger.error(f"Provider {adapter.name}: [ERROR] {e}")
        finally:
            status.loading = False

    # Provider Management
    async def enable_provider(self, provider_id: Union[str, ModelProvider], enabled: bool = True):
        """Enable or disable a provider"""
        if isinstance(provider_id, str):
            provider_id = ModelProvider(provider_id)
        
        config = self.provider_configs.get(provider_id)
        if config:
            config.enabled = enabled
            
            # Update registry
            adapter = self.registry.get(provider_id)
            if adapter:
                adapter.config.enabled = enabled
                
            # Update status
            status = self.provider_status.get(provider_id)
            if status:
                status.enabled = enabled
                
            await self.save_configurations()
            
            if enabled:
                await self._validate_provider(provider_id, adapter)
                
            self.logger.info(f"Provider {config.name} {'enabled' if enabled else 'disabled'}")

    async def update_provider_config(self, provider_id: Union[str, ModelProvider], updates: Dict[str, Any]):
        """Update provider configuration"""
        if isinstance(provider_id, str):
            provider_id = ModelProvider(provider_id)
            
        config = self.provider_configs.get(provider_id)
        if not config:
            return False
            
        # Special handling for API key - update config object only, not .env file
        if 'api_key' in updates:
            api_key = updates['api_key']
            # Update the config object
            if hasattr(config, 'api_key'):
                config.api_key = api_key
            # Update status to reflect API key presence
            if provider_id in self.provider_status:
                self.provider_status[provider_id].has_api_key = bool(api_key)
        
        # Update other configuration
        for key, value in updates.items():
            if key != 'api_key' and hasattr(config, key):
                setattr(config, key, value)
        
        # Re-register with new config
        adapter_classes = {
            ModelProvider.DEEPSEEK: DeepSeekAdapter,
            ModelProvider.OPENAI: OpenAIAdapter,
            ModelProvider.ANTHROPIC: AnthropicAdapter,
            ModelProvider.GEMINI: GeminiAdapter,
        }
        
        adapter_class = adapter_classes.get(provider_id)
        if adapter_class:
            try:
                adapter = adapter_class(config)
                self.registry.register(adapter)
                
                # Revalidate
                if config.enabled:
                    await self._validate_provider(provider_id, adapter)
                    
                await self.save_configurations()
                return True
            except Exception as e:
                self.logger.error(f"Failed to update provider {provider_id}: {e}")
                return False
        
        return False

    async def update_env_file(self, provider_id: ModelProvider, api_key: str):
        """Update .env file with new API key"""
        try:
            env_path = os.path.join(os.path.dirname(self.config_path), '..', '.env')
            env_var_name = f"{provider_id.value.upper()}_API_KEY"
            
            # Read existing .env file
            env_lines = []
            if os.path.exists(env_path):
                with open(env_path, 'r') as f:
                    env_lines = f.readlines()
            
            # Update or add the API key line
            updated = False
            for i, line in enumerate(env_lines):
                if line.startswith(f"{env_var_name}="):
                    env_lines[i] = f"{env_var_name}={api_key}\n"
                    updated = True
                    break
            
            if not updated:
                env_lines.append(f"{env_var_name}={api_key}\n")
            
            # Write back to .env file
            with open(env_path, 'w') as f:
                f.writelines(env_lines)
                
            self.logger.info(f"Updated .env file with {env_var_name}")
            
            # Also update the environment variable for current session
            os.environ[env_var_name] = api_key
            
        except Exception as e:
            self.logger.error(f"Failed to update .env file: {e}")
            raise

    # Model and Chat Operations
    def get_all_models(self) -> List[ModelInfo]:
        """Get all available models from enabled providers"""
        return self.registry.get_all_models()

    def get_models_by_provider(self, provider_id: Union[str, ModelProvider]) -> List[ModelInfo]:
        """Get models from specific provider"""
        if isinstance(provider_id, str):
            provider_id = ModelProvider(provider_id)
            
        adapter = self.registry.get(provider_id)
        return adapter.supported_models if adapter else []

    def get_enabled_providers(self) -> List[ProviderStatus]:
        """Get all enabled providers with their status"""
        return [
            status for status in self.provider_status.values() 
            if status.enabled
        ]

    def get_provider_status(self, provider_id: Union[str, ModelProvider]) -> Optional[ProviderStatus]:
        """Get status of specific provider"""
        if isinstance(provider_id, str):
            provider_id = ModelProvider(provider_id)
        return self.provider_status.get(provider_id)

    async def chat_completion(
        self,
        messages: List[Message],
        provider_id: Union[str, ModelProvider],
        model: str,
        params: GenerationParams = None
    ) -> AsyncGenerator[ChatResponse, None]:
        """Generate chat completion using specified provider"""
        if isinstance(provider_id, str):
            provider_id = ModelProvider(provider_id)
            
        adapter = self.registry.get(provider_id)
        if not adapter:
            yield ChatResponse(
                error=f"Provider {provider_id} not found",
                meta={"provider": provider_id, "model": model}
            )
            return
            
        if not adapter.config.enabled:
            yield ChatResponse(
                error=f"Provider {provider_id} is disabled",
                meta={"provider": provider_id, "model": model}
            )
            return
        
        async for response in adapter.chat_completion(messages, model, params):
            yield response

    async def continue_gpt5_response(
        self,
        original_messages: List[Message],
        partial_content: str,
        model: str
    ) -> AsyncGenerator[ChatResponse, None]:
        """Continue a GPT-5 response that was cut off due to timeout"""
        # GPT-5 is always OpenAI
        adapter = self.registry.get(ModelProvider.OPENAI)
        if not adapter:
            yield ChatResponse(
                error="OpenAI provider not found for GPT-5 continuation",
                meta={"provider": ModelProvider.OPENAI, "model": model}
            )
            return
            
        if not adapter.config.enabled:
            yield ChatResponse(
                error="OpenAI provider is disabled",
                meta={"provider": ModelProvider.OPENAI, "model": model}
            )
            return
        
        # Check if adapter has continue_response method (only OpenAI should have it)
        if hasattr(adapter, 'continue_response'):
            async for response in adapter.continue_response(original_messages, partial_content, model):
                yield response
        else:
            yield ChatResponse(
                error="Provider does not support response continuation",
                meta={"provider": ModelProvider.OPENAI, "model": model}
            )

# Global provider manager instance
provider_manager = ProviderManager()
