"""AI Provider Adapters Package."""

from .base_provider import (
    BaseAdapter,
    ModelProvider,
    ModelType,
    ModelInfo,
    Message,
    GenerationParams,
    ChatResponse,
    Usage,
    ProviderConfig,
    ProviderRegistry,
    registry
)

from .deepseek_provider import DeepSeekAdapter
from .openai_provider import OpenAIAdapter
from .anthropic_provider import AnthropicAdapter
from .provider_manager import ProviderManager, ProviderStatus, provider_manager

# Legacy imports for backward compatibility
from .base import ProviderAdapter
from .deepseek import DeepSeekAdapter as LegacyDeepSeekAdapter

__all__ = [
    # Base classes
    'BaseAdapter',
    'ModelProvider', 
    'ModelType',
    'ModelInfo',
    'Message',
    'GenerationParams', 
    'ChatResponse',
    'Usage',
    'ProviderConfig',
    'ProviderRegistry',
    'registry',
    
    # Provider adapters
    'DeepSeekAdapter',
    'OpenAIAdapter',
    'AnthropicAdapter',
    
    # Management
    'ProviderManager',
    'ProviderStatus',
    'provider_manager',
    
    # Legacy
    'ProviderAdapter',
    'LegacyDeepSeekAdapter'
]
