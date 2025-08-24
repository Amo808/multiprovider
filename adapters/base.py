from abc import ABC, abstractmethod
from typing import List, Dict, Any, AsyncIterator, Optional
from dataclasses import dataclass
from datetime import datetime
import uuid


@dataclass
class ModelInfo:
    """Information about an AI model."""
    name: str
    display_name: str
    context_length: int
    supports_streaming: bool = True


@dataclass
class Message:
    """Chat message structure."""
    id: str
    role: str  # "user", "assistant", "system"
    content: str
    timestamp: datetime
    meta: Dict[str, Any] = None

    def __post_init__(self):
        if self.meta is None:
            self.meta = {}


@dataclass
class GenerationParams:
    """Parameters for text generation."""
    temperature: float = 0.7
    max_tokens: int = 8192
    top_p: float = 0.9
    stream: bool = True


class ProviderAdapter(ABC):
    """Abstract base class for AI provider adapters."""

    @abstractmethod
    def list_models(self) -> List[ModelInfo]:
        """Return list of available models."""
        pass

    @abstractmethod
    def estimate_tokens(self, messages: List[Message]) -> int:
        """Estimate token count for messages."""
        pass

    @abstractmethod
    async def stream_chat(
        self, 
        messages: List[Message], 
        params: GenerationParams
    ) -> AsyncIterator[str]:
        """Stream chat completion responses."""
        pass

    @abstractmethod
    def usage_supported(self) -> bool:
        """Check if provider supports usage tracking."""
        pass

    @abstractmethod
    def get_model_info(self, model_name: str) -> Optional[ModelInfo]:
        """Get information about a specific model."""
        pass
