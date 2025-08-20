import aiohttp
import json
import logging
from typing import List, AsyncIterator, Optional
from .base import ProviderAdapter, ModelInfo, Message, GenerationParams
import tiktoken


logger = logging.getLogger(__name__)


class DeepSeekAdapter(ProviderAdapter):
    """DeepSeek AI provider adapter."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.deepseek.com"
        self.models = [
            ModelInfo(
                name="deepseek-chat",
                display_name="DeepSeek Chat",
                context_length=32768,
                supports_streaming=True
            )
        ]
        # Use GPT tokenizer for estimation (close enough for most cases)
        try:
            self.tokenizer = tiktoken.encoding_for_model("gpt-3.5-turbo")
        except:
            self.tokenizer = tiktoken.get_encoding("cl100k_base")

    def list_models(self) -> List[ModelInfo]:
        """Return list of available DeepSeek models."""
        return self.models

    def estimate_tokens(self, messages: List[Message]) -> int:
        """Estimate token count for messages using tiktoken."""
        try:
            total_tokens = 0
            for message in messages:
                # Format: role + content + message overhead
                message_text = f"{message.role}: {message.content}"
                tokens = len(self.tokenizer.encode(message_text))
                total_tokens += tokens + 4  # Message overhead
            return total_tokens + 3  # Conversation overhead
        except Exception as e:
            logger.warning(f"Token estimation failed: {e}")
            # Fallback: rough estimation (4 chars = 1 token)
            total_chars = sum(len(msg.content) for msg in messages)
            return total_chars // 4

    async def stream_chat(
        self,
        messages: List[Message],
        params: GenerationParams
    ) -> AsyncIterator[str]:
        """Stream chat completion from DeepSeek API."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        # Convert messages to API format
        api_messages = []
        for msg in messages:
            api_messages.append({
                "role": msg.role,
                "content": msg.content
            })

        payload = {
            "model": "deepseek-chat",
            "messages": api_messages,
            "temperature": params.temperature,
            "max_tokens": params.max_tokens,
            "top_p": params.top_p,
            "stream": params.stream
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"DeepSeek API error: {response.status} - {error_text}")
                        raise Exception(f"API Error: {response.status}")

                    if params.stream:
                        async for line in response.content:
                            line = line.decode('utf-8').strip()
                            if line.startswith('data: '):
                                data = line[6:]  # Remove 'data: ' prefix
                                if data == '[DONE]':
                                    break
                                try:
                                    chunk = json.loads(data)
                                    if 'choices' in chunk and len(chunk['choices']) > 0:
                                        delta = chunk['choices'][0].get('delta', {})
                                        if 'content' in delta:
                                            yield delta['content']
                                except json.JSONDecodeError:
                                    continue
                    else:
                        data = await response.json()
                        if 'choices' in data and len(data['choices']) > 0:
                            content = data['choices'][0]['message']['content']
                            yield content

        except aiohttp.ClientError as e:
            logger.error(f"Network error: {e}")
            raise Exception(f"Network error: {str(e)}")
        except Exception as e:
            logger.error(f"DeepSeek streaming error: {e}")
            raise

    def usage_supported(self) -> bool:
        """DeepSeek supports usage tracking."""
        return True

    def get_model_info(self, model_name: str) -> Optional[ModelInfo]:
        """Get info for a specific model."""
        for model in self.models:
            if model.name == model_name:
                return model
        return None
