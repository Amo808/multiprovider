from typing import List
import logging
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))
from adapters.base import Message, ProviderAdapter


logger = logging.getLogger(__name__)


class PromptBuilder:
    """Builds prompts with context clipping based on token limits."""

    def __init__(self, adapter: ProviderAdapter, max_tokens: int = 32768):
        self.adapter = adapter
        self.max_tokens = max_tokens

    def build_context(
        self, 
        messages: List[Message], 
        system_prompt: str = None
    ) -> List[Message]:
        """Build context with token-based clipping."""
        context_messages = []
        
        # Add system prompt if provided
        if system_prompt:
            system_msg = Message(
                id="system",
                role="system",
                content=system_prompt,
                timestamp=messages[0].timestamp if messages else None
            )
            context_messages.append(system_msg)

        # Always include the last user message (if exists)
        if messages and messages[-1].role == "user":
            context_messages.append(messages[-1])
            messages = messages[:-1]

        # Add messages from newest to oldest until token limit
        remaining_messages = list(reversed(messages))
        
        for msg in remaining_messages:
            # Test if adding this message exceeds token limit
            test_context = [msg] + context_messages
            token_count = self.adapter.estimate_tokens(test_context)
            
            if token_count > self.max_tokens:
                logger.info(f"Context clipped at {len(context_messages)} messages ({token_count} tokens)")
                break
                
            context_messages.insert(-1 if system_prompt else 0, msg)

        # Ensure proper order (system -> oldest -> newest)
        if system_prompt:
            final_context = [context_messages[0]]  # system
            final_context.extend(reversed(context_messages[1:-1]))  # history
            final_context.append(context_messages[-1])  # latest user
        else:
            final_context = list(reversed(context_messages))

        token_count = self.adapter.estimate_tokens(final_context)
        logger.info(f"Final context: {len(final_context)} messages, ~{token_count} tokens")
        
        return final_context


class TokenEstimator:
    """Token estimation utilities."""

    @staticmethod
    def estimate_response_tokens(prompt_tokens: int, max_tokens: int) -> int:
        """Estimate response tokens based on prompt."""
        # Leave some buffer for response
        available_tokens = max_tokens - prompt_tokens
        return min(available_tokens - 100, max_tokens // 2)  # Conservative estimate
