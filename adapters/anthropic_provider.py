import asyncio
import json
import logging
from typing import Dict, List, Optional, AsyncGenerator, Any
import aiohttp
import tiktoken
from .base_provider import BaseAdapter, Message, GenerationParams, ChatResponse, ModelInfo, ModelProvider, ModelType, ProviderConfig, Usage

logger = logging.getLogger(__name__)


class AnthropicAdapter(BaseAdapter):
    """Anthropic Claude Provider Adapter"""
    
    def __init__(self, config: ProviderConfig):
        super().__init__(config)
        self.api_key = config.api_key
        self.base_url = config.base_url or "https://api.anthropic.com"
        self.base_url = self.base_url.rstrip("/")
        self.session = None
        
        # Initialize tokenizer (using GPT tokenizer as approximation)
        try:
            self.tokenizer = tiktoken.encoding_for_model("gpt-4")
        except Exception:
            self.logger.warning("Failed to load GPT-4 tokenizer, using cl100k_base")
            self.tokenizer = tiktoken.get_encoding("cl100k_base")

    @property
    def name(self) -> str:
        return "Anthropic"

    @property
    def supported_models(self) -> List[ModelInfo]:
        return [
            ModelInfo(
                id="claude-3-5-sonnet-20241022",
                name="claude-3-5-sonnet-20241022",
                display_name="Claude 3.5 Sonnet",
                provider=ModelProvider.ANTHROPIC,
                context_length=200000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                pricing={"input_tokens": 3.00, "output_tokens": 15.00}  # per 1M tokens
            ),
            ModelInfo(
                id="claude-3-opus-20240229",
                name="claude-3-opus-20240229",
                display_name="Claude 3 Opus",
                provider=ModelProvider.ANTHROPIC,
                context_length=200000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                pricing={"input_tokens": 15.00, "output_tokens": 75.00}  # per 1M tokens
            ),
            ModelInfo(
                id="claude-3-haiku-20240307",
                name="claude-3-haiku-20240307",
                display_name="Claude 3 Haiku",
                provider=ModelProvider.ANTHROPIC,
                context_length=200000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                pricing={"input_tokens": 0.25, "output_tokens": 1.25}  # per 1M tokens
            ),
            ModelInfo(
                id="claude-3-5-haiku-20241022",
                name="claude-3-5-haiku-20241022",
                display_name="Claude 3.5 Haiku",
                provider=ModelProvider.ANTHROPIC,
                context_length=200000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=False,
                type=ModelType.CHAT,
                pricing={"input_tokens": 1.00, "output_tokens": 5.00}  # per 1M tokens
            )
        ]

    async def _ensure_session(self):
        if self.session is None or self.session.closed:
            connector = aiohttp.TCPConnector(limit=100, limit_per_host=30)
            # No timeout - allow unlimited response time
            timeout = aiohttp.ClientTimeout(total=None, connect=30)  # Only connection timeout
            self.session = aiohttp.ClientSession(
                connector=connector,
                timeout=timeout,
                headers={
                    "x-api-key": self.api_key,
                    "Content-Type": "application/json",
                    "anthropic-version": "2023-06-01",
                    "User-Agent": "AI-Chat/1.0"
                }
            )

    async def chat_completion(
        self,
        messages: List[Message],
        model: str = "claude-3-5-sonnet-20241022",
        params: GenerationParams = None,
        **kwargs
    ) -> AsyncGenerator[ChatResponse, None]:
        if params is None:
            params = GenerationParams()

        await self._ensure_session()
        
        # Convert messages to Anthropic format
        api_messages = []
        system_message = ""
        
        for msg in messages:
            if msg.role == "system":
                system_message = msg.content
            else:
                api_messages.append({
                    "role": msg.role,
                    "content": msg.content
                })
        
        # Ensure we have at least one message
        if not api_messages:
            yield ChatResponse(
                error="No messages to process",
                meta={"provider": ModelProvider.ANTHROPIC, "model": model}
            )
            return

        # Calculate input tokens
        input_text = system_message + "\n".join([f"{msg['role']}: {msg['content']}" for msg in api_messages])
        input_tokens = self.estimate_tokens(input_text)

        payload = {
            "model": model,
            "messages": api_messages,
            "stream": params.stream,
            "temperature": params.temperature,
            "max_tokens": params.max_tokens,
            "top_p": params.top_p,
        }

        if system_message:
            payload["system"] = system_message

        if params.stop_sequences:
            payload["stop_sequences"] = params.stop_sequences

        self.logger.info(f"Sending request to Anthropic API: {model}, temp={params.temperature}")

        accumulated_content = ""
        output_tokens = 0
        
        try:
            url = f"{self.base_url}/v1/messages"
            async with self.session.post(url, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    self.logger.error(f"Anthropic API error: {response.status} - {error_text}")
                    yield ChatResponse(
                        error=f"API Error {response.status}: {error_text}",
                        meta={"provider": ModelProvider.ANTHROPIC, "model": model}
                    )
                    return

                if not params.stream:
                    # Handle non-streaming response
                    data = await response.json()
                    content = ""
                    for content_block in data.get("content", []):
                        if content_block.get("type") == "text":
                            content += content_block.get("text", "")
                    
                    usage = data.get("usage", {})
                    
                    yield ChatResponse(
                        content=content,
                        id=data.get("id"),
                        done=True,
                        meta={
                            "tokens_in": usage.get("input_tokens", input_tokens),
                            "tokens_out": usage.get("output_tokens", self.estimate_tokens(content)),
                            "provider": ModelProvider.ANTHROPIC,
                            "model": model
                        }
                    )
                    return

                # Handle streaming response
                async for line in response.content:
                    line = line.decode('utf-8').strip()
                    
                    if not line:
                        continue
                        
                    if line.startswith("data: "):
                        try:
                            json_data = json.loads(line[6:])
                            event_type = json_data.get("type")
                            
                            if event_type == "content_block_delta":
                                delta = json_data.get("delta", {})
                                content = delta.get("text", "")
                                
                                if content:
                                    accumulated_content += content
                                    output_tokens = self.estimate_tokens(accumulated_content)
                                    
                                    yield ChatResponse(
                                        content=content,
                                        id=json_data.get("id"),
                                        done=False,
                                        meta={
                                            "tokens_in": input_tokens,
                                            "tokens_out": output_tokens,
                                            "provider": ModelProvider.ANTHROPIC,
                                            "model": model
                                        }
                                    )
                            
                            elif event_type == "message_stop":
                                break
                                
                        except json.JSONDecodeError as e:
                            self.logger.error(f"Failed to parse JSON: {line} - {e}")
                            continue

        except asyncio.TimeoutError:
            self.logger.error("Request to Anthropic API timed out")
            yield ChatResponse(
                error="Request timed out",
                meta={"provider": ModelProvider.ANTHROPIC, "model": model}
            )
        except Exception as e:
            self.logger.error(f"Error in Anthropic API call: {e}")
            yield ChatResponse(
                error=f"API Error: {str(e)}",
                meta={"provider": ModelProvider.ANTHROPIC, "model": model}
            )

        # Final response with complete usage
        final_output_tokens = self.estimate_tokens(accumulated_content) if accumulated_content else output_tokens
        
        yield ChatResponse(
            content="",
            done=True,
            meta={
                "tokens_in": input_tokens,
                "tokens_out": final_output_tokens,
                "total_tokens": input_tokens + final_output_tokens,
                "provider": ModelProvider.ANTHROPIC,
                "model": model
            }
        )

    async def get_available_models(self) -> List[ModelInfo]:
        """Get list of available models (static for Anthropic)"""
        # Anthropic doesn't have a models endpoint, return supported models
        return self.supported_models

    def estimate_tokens(self, text: str) -> int:
        """Estimate token count using tiktoken"""
        try:
            return len(self.tokenizer.encode(text))
        except Exception:
            # Fallback to character-based estimation
            return super().estimate_tokens(text)

    async def close(self):
        """Clean up session"""
        if self.session and not self.session.closed:
            await self.session.close()
