import asyncio
import json
import logging
from typing import Dict, List, Optional, AsyncGenerator, Any
import aiohttp
import tiktoken
from .base_provider import BaseAdapter, Message, GenerationParams, ChatResponse, ModelInfo, ModelProvider, ModelType, ProviderConfig, Usage

logger = logging.getLogger(__name__)


class OpenAIAdapter(BaseAdapter):
    """OpenAI Provider Adapter"""
    
    def __init__(self, config: ProviderConfig):
        super().__init__(config)
        self.api_key = config.api_key
        self.base_url = config.base_url or "https://api.openai.com/v1"
        self.base_url = self.base_url.rstrip("/")
        self.session = None
        
        # Initialize tokenizer for OpenAI models
        try:
            self.tokenizer = tiktoken.encoding_for_model("gpt-4")
        except Exception:
            self.logger.warning("Failed to load GPT-4 tokenizer, using cl100k_base")
            self.tokenizer = tiktoken.get_encoding("cl100k_base")

    @property
    def name(self) -> str:
        return "OpenAI"

    @property
    def supported_models(self) -> List[ModelInfo]:
        return [
            # Latest GPT-4o models
            ModelInfo(
                id="gpt-4o",
                name="gpt-4o",
                display_name="GPT-4o",
                provider=ModelProvider.OPENAI,
                context_length=128000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                pricing={"input_tokens": 2.50, "output_tokens": 10.00},  # Current pricing
                max_output_tokens=16384,  # GPT-4o max output
                recommended_max_tokens=8192  # Recommended for quality
            ),
            ModelInfo(
                id="gpt-4o-mini",
                name="gpt-4o-mini",
                display_name="GPT-4o Mini",
                provider=ModelProvider.OPENAI,
                context_length=128000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                pricing={"input_tokens": 0.15, "output_tokens": 0.60},  # Current pricing
                max_output_tokens=16384,  # GPT-4o mini max output
                recommended_max_tokens=8192  # Recommended for quality
            ),
            # Newer GPT-5 models (when available)
            ModelInfo(
                id="gpt-5",
                name="gpt-5",
                display_name="GPT-5",
                provider=ModelProvider.OPENAI, 
                context_length=200000,  # Estimated
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                pricing={"input_tokens": 1.25, "output_tokens": 10.00},  # New pricing
                max_output_tokens=32768,  # Estimated GPT-5 max output
                recommended_max_tokens=16384  # Recommended for quality
            ),
            ModelInfo(
                id="gpt-5-mini",
                name="gpt-5-mini",
                display_name="GPT-5 Mini",
                provider=ModelProvider.OPENAI,
                context_length=200000,  # Estimated
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                pricing={"input_tokens": 0.25, "output_tokens": 2.00},  # New pricing
                max_output_tokens=16384,  # GPT-5 Mini max output
                recommended_max_tokens=8192  # Recommended for quality
            ),
            ModelInfo(
                id="gpt-5-nano",
                name="gpt-5-nano",
                display_name="GPT-5 Nano",
                provider=ModelProvider.OPENAI,
                context_length=128000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=False,
                type=ModelType.CHAT,
                pricing={"input_tokens": 0.05, "output_tokens": 0.40},  # New pricing
                max_output_tokens=8192,  # GPT-5 Nano max output
                recommended_max_tokens=4096  # Recommended for quality
            ),
            # Reasoning models
            ModelInfo(
                id="o4-mini",
                name="o4-mini", 
                display_name="o4-mini",
                provider=ModelProvider.OPENAI,
                context_length=128000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=False,
                type=ModelType.CHAT,
                pricing={"input_tokens": 4.00, "output_tokens": 16.00},  # Reasoning model pricing
                max_output_tokens=65536,  # o4 reasoning models have higher limits
                recommended_max_tokens=32768  # Recommended for reasoning tasks
            ),
            ModelInfo(
                id="gpt-4-turbo",
                name="gpt-4-turbo",
                display_name="GPT-4 Turbo",
                provider=ModelProvider.OPENAI,
                context_length=128000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                pricing={"input_tokens": 10.00, "output_tokens": 30.00},  # per 1M tokens
                max_output_tokens=4096,
                recommended_max_tokens=2048
            ),
            # Legacy models for compatibility
            ModelInfo(
                id="gpt-3.5-turbo",
                name="gpt-3.5-turbo",
                display_name="GPT-3.5 Turbo (Legacy)",
                provider=ModelProvider.OPENAI,
                context_length=16384,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=False,
                type=ModelType.CHAT,
                pricing={"input_tokens": 0.50, "output_tokens": 1.50},  # Legacy pricing
                max_output_tokens=4096,  # Legacy model limit
                recommended_max_tokens=2048  # Conservative for legacy model
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
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "AI-Chat/1.0"
                }
            )

    async def chat_completion(
        self,
        messages: List[Message],
        model: str = "gpt-4o-mini",
        params: GenerationParams = None,
        **kwargs
    ) -> AsyncGenerator[ChatResponse, None]:
        if params is None:
            params = GenerationParams()

        await self._ensure_session()
        
        # Convert messages to API format
        api_messages = []
        for msg in messages:
            api_messages.append({
                "role": msg.role,
                "content": msg.content
            })

        # Calculate input tokens
        input_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in api_messages])
        input_tokens = self.estimate_tokens(input_text)

        payload = {
            "model": model,
            "messages": api_messages,
            "stream": params.stream,
            "temperature": params.temperature,
            "max_tokens": params.max_tokens,
            "top_p": params.top_p,
            "frequency_penalty": params.frequency_penalty,
            "presence_penalty": params.presence_penalty,
        }

        if params.stop_sequences:
            payload["stop"] = params.stop_sequences

        self.logger.info(f"Sending request to OpenAI API: {model}, temp={params.temperature}")

        accumulated_content = ""
        output_tokens = 0
        
        try:
            url = f"{self.base_url}/chat/completions"
            async with self.session.post(url, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    self.logger.error(f"OpenAI API error: {response.status} - {error_text}")
                    yield ChatResponse(
                        error=f"API Error {response.status}: {error_text}",
                        meta={"provider": ModelProvider.OPENAI, "model": model}
                    )
                    return

                if not params.stream:
                    # Handle non-streaming response
                    data = await response.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    usage = data.get("usage", {})
                    
                    yield ChatResponse(
                        content=content,
                        id=data.get("id"),
                        done=True,
                        meta={
                            "tokens_in": usage.get("prompt_tokens", input_tokens),
                            "tokens_out": usage.get("completion_tokens", self.estimate_tokens(content)),
                            "provider": ModelProvider.OPENAI,
                            "model": model
                        }
                    )
                    return

                # Handle streaming response
                async for line in response.content:
                    line = line.decode('utf-8').strip()
                    
                    if not line or line == "data: [DONE]":
                        continue
                        
                    if line.startswith("data: "):
                        try:
                            json_data = json.loads(line[6:])
                            choices = json_data.get("choices", [])
                            
                            if not choices:
                                continue
                                
                            choice = choices[0]
                            delta = choice.get("delta", {})
                            content = delta.get("content", "")
                            
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
                                        "provider": ModelProvider.OPENAI,
                                        "model": model
                                    }
                                )
                            
                            # Check if finished
                            if choice.get("finish_reason"):
                                break
                                
                        except json.JSONDecodeError as e:
                            self.logger.error(f"Failed to parse JSON: {line} - {e}")
                            continue

        except asyncio.TimeoutError:
            self.logger.error("Request to OpenAI API timed out")
            yield ChatResponse(
                error="Request timed out",
                meta={"provider": ModelProvider.OPENAI, "model": model}
            )
        except Exception as e:
            self.logger.error(f"Error in OpenAI API call: {e}")
            yield ChatResponse(
                error=f"API Error: {str(e)}",
                meta={"provider": ModelProvider.OPENAI, "model": model}
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
                "provider": ModelProvider.OPENAI,
                "model": model
            }
        )

    async def get_available_models(self) -> List[ModelInfo]:
        """Get list of available models from OpenAI"""
        await self._ensure_session()
        
        try:
            url = f"{self.base_url}/models"
            async with self.session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    models_data = data.get("data", [])
                    
                    # Convert API models to ModelInfo format
                    models = []
                    for model_data in models_data:
                        model_id = model_data.get("id", "")
                        if "gpt" in model_id.lower() and not model_id.endswith(":ft"):
                            models.append(ModelInfo(
                                id=model_id,
                                name=model_id,
                                display_name=model_id.upper().replace("-", " "),
                                provider=ModelProvider.OPENAI,
                                context_length=self._get_context_length(model_id),
                                supports_streaming=True,
                                supports_functions="gpt-3.5" in model_id or "gpt-4" in model_id,
                                supports_vision="gpt-4" in model_id and "vision" in model_id.lower(),
                                type=ModelType.CHAT
                            ))
                    
                    return models if models else self.supported_models
                elif response.status == 401:
                    raise Exception("API key is invalid or missing")
                elif response.status == 403:
                    raise Exception("API key does not have permission to access models")
                else:
                    raise Exception(f"Failed to fetch models: HTTP {response.status}")
        except Exception as e:
            self.logger.error(f"Error fetching models: {e}")
            # Don't return fallback models on error - let validation know we failed
            raise e

    def _get_context_length(self, model_id: str) -> int:
        """Get context length for OpenAI models"""
        if "gpt-4o" in model_id or "gpt-4-turbo" in model_id:
            return 128000
        elif "gpt-4" in model_id:
            return 8192
        elif "gpt-3.5-turbo" in model_id:
            if "16k" in model_id:
                return 16384
            return 4096
        else:
            return 4096

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
