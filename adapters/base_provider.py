from abc import ABC, abstractmethod
from typing import Dict, List, Optional, AsyncGenerator, Any, Union
from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger(__name__)

class ModelProvider(str, Enum):
    """Supported AI model providers"""
    DEEPSEEK = "deepseek"
    OPENAI = "openai"
    ANTHROPIC = "anthropic" 
    GEMINI = "gemini"
    OLLAMA = "ollama"
    GROQ = "groq"
    MISTRAL = "mistral"

class ModelType(str, Enum):
    """Types of AI models"""
    CHAT = "chat"
    EMBEDDING = "embedding"
    IMAGE = "image"
    AUDIO = "audio"

@dataclass
class Message:
    """Chat message structure"""
    role: str  # 'user', 'assistant', 'system'
    content: str
    id: Optional[str] = None
    timestamp: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None

@dataclass
class ModelInfo:
    """Information about a model"""
    id: str
    name: str
    display_name: str
    provider: ModelProvider
    context_length: int
    supports_streaming: bool
    supports_functions: bool = False
    supports_vision: bool = False
    type: ModelType = ModelType.CHAT
    enabled: bool = True
    pricing: Optional[Dict[str, float]] = None
    max_output_tokens: int = 32768  # Max output tokens per model
    recommended_max_tokens: int = 4096  # Recommended max for quality
    description: Optional[str] = None  # Model description

@dataclass
class GenerationParams:
    """Parameters for text generation"""
    temperature: float = 0.7
    max_tokens: int = 32768
    top_p: float = 1.0
    top_k: Optional[int] = None
    frequency_penalty: float = 0.0
    presence_penalty: float = 0.0
    stop_sequences: Optional[List[str]] = None
    stream: bool = True

@dataclass
class ProviderConfig:
    """Configuration for a provider"""
    id: ModelProvider
    name: str
    enabled: bool
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    endpoint: Optional[str] = None
    # Provider-specific settings
    region: Optional[str] = None
    api_version: Optional[str] = None
    extra_params: Optional[Dict[str, Any]] = None

@dataclass
class ChatResponse:
    """Response from chat completion"""
    content: str = ""
    id: Optional[str] = None
    done: bool = False
    error: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
    stage_message: Optional[str] = None  # For Deep Research stages
    heartbeat: Optional[str] = None  # For heartbeat/keepalive messages
    streaming_ready: Optional[bool] = None  # Backend ready to stream
    first_content: Optional[bool] = None  # First content chunk signal

@dataclass
class Usage:
    """Token usage information"""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    estimated_cost: Optional[float] = None

class BaseAdapter(ABC):
    """Base class for all AI provider adapters"""
    
    def __init__(self, config: ProviderConfig):
        self.config = config
        self.provider = config.id
        self.logger = logging.getLogger(f"{__name__}.{self.provider}")
        self._models: Optional[List[ModelInfo]] = None
    
    @property
    @abstractmethod 
    def name(self) -> str:
        """Human-readable name of the provider"""
        pass
    
    @property
    @abstractmethod
    def supported_models(self) -> List[ModelInfo]:
        """List of supported models"""
        pass
    
    @abstractmethod
    async def chat_completion(
        self,
        messages: List[Message],
        model: str,
        params: GenerationParams,
        **kwargs
    ) -> AsyncGenerator[ChatResponse, None]:
        """Generate chat completion with streaming support"""
        pass
    
    @abstractmethod
    async def get_available_models(self) -> List[ModelInfo]:
        """Fetch available models from provider"""
        pass
    
    async def validate_connection(self) -> tuple[bool, Optional[str]]:
        """Validate connection to provider"""
        try:
            # Check if API key is configured
            if not hasattr(self.config, 'api_key') or not self.config.api_key:
                return False, "API key is not configured"
            
            # Check for placeholder/test keys
            if (self.config.api_key.startswith(('your_', 'sk-test-')) or
                'your_api_key_here' in self.config.api_key):
                return False, "API key is not configured (placeholder value)"
            
            models = await self.get_available_models()
            if models:
                return True, None
            return False, "No models available"
        except Exception as e:
            self.logger.error(f"Connection validation failed: {e}")
            error_msg = str(e)
            
            # Handle common authentication errors
            if any(keyword in error_msg.lower() for keyword in ['401', '403', 'unauthorized', 'authentication', 'invalid api key', 'api key']):
                return False, "Invalid or unauthorized API key"
            elif 'network' in error_msg.lower() or 'connection' in error_msg.lower():
                return False, f"Connection error: {error_msg}"
            else:
                return False, error_msg
    
    def estimate_tokens(self, text: str) -> int:
        """Estimate token count for text (rough approximation)"""
        # Simple estimation: ~4 characters per token on average
        return max(1, len(text) // 4)
    
    def calculate_cost(self, usage: Usage, model: str) -> Optional[float]:
        """Calculate estimated cost for usage"""
        model_info = next(
            (m for m in self.supported_models if m.id == model), 
            None
        )
        if not model_info or not model_info.pricing:
            return None
        
        input_cost = usage.prompt_tokens * model_info.pricing.get("input_tokens", 0) / 1000000
        output_cost = usage.completion_tokens * model_info.pricing.get("output_tokens", 0) / 1000000
        
        return input_cost + output_cost
    
    def supports_streaming(self, model: str) -> bool:
        """Check if model supports streaming"""
        model_info = next(
            (m for m in self.supported_models if m.id == model),
            None
        )
        return model_info.supports_streaming if model_info else False
    
    def get_context_length(self, model: str) -> int:
        """Get context length for model"""
        model_info = next(
            (m for m in self.supported_models if m.id == model),
            None
        )
        return model_info.context_length if model_info else 4096

class ProviderRegistry:
    """Registry for managing AI providers"""
    
    def __init__(self):
        self._providers: Dict[ModelProvider, BaseAdapter] = {}
        self.logger = logging.getLogger(f"{__name__}.Registry")
    
    def register(self, provider: BaseAdapter):
        """Register a provider adapter"""
        self._providers[provider.provider] = provider
        self.logger.info(f"Registered provider: {provider.name}")
    
    def get(self, provider_id: Union[str, ModelProvider]) -> Optional[BaseAdapter]:
        """Get provider adapter by ID"""
        if isinstance(provider_id, str):
            provider_id = ModelProvider(provider_id)
        return self._providers.get(provider_id)
    
    def get_all(self) -> Dict[ModelProvider, BaseAdapter]:
        """Get all registered providers"""
        return self._providers.copy()
    
    def get_enabled(self) -> Dict[ModelProvider, BaseAdapter]:
        """Get all enabled providers"""
        return {
            provider_id: adapter 
            for provider_id, adapter in self._providers.items()
            if adapter.config.enabled
        }
    
    async def validate_all(self) -> Dict[ModelProvider, tuple[bool, Optional[str]]]:
        """Validate all registered providers"""
        results = {}
        for provider_id, adapter in self._providers.items():
            results[provider_id] = await adapter.validate_connection()
        return results
    
    def get_all_models(self) -> List[ModelInfo]:
        """Get all models from all providers"""
        all_models = []
        for adapter in self._providers.values():
            if adapter.config.enabled:
                all_models.extend(adapter.supported_models)
        return all_models

# Global registry instance
registry = ProviderRegistry()
