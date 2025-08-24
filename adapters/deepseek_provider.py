import asyncio
import json
import logging
from typing import Dict, List, Optional, AsyncGenerator, Any
import aiohttp
import tiktoken
from .base_provider import BaseAdapter, Message, GenerationParams, ChatResponse, ModelInfo, ModelProvider, ModelType, ProviderConfig, Usage

logger = logging.getLogger(__name__)


class DeepSeekAdapter(BaseAdapter):
    """DeepSeek AI Provider Adapter"""
    
    def __init__(self, config: ProviderConfig):
        super().__init__(config)
        self.api_key = config.api_key
        self.base_url = config.base_url or "https://api.deepseek.com"
        self.base_url = self.base_url.rstrip("/")
        self.session = None
        
        # Initialize tokenizer for DeepSeek (using GPT-4 tokenizer as approximation)
        try:
            self.tokenizer = tiktoken.encoding_for_model("gpt-4")
        except Exception:
            self.logger.warning("Failed to load GPT-4 tokenizer, using cl100k_base")
            self.tokenizer = tiktoken.get_encoding("cl100k_base")

    @property
    def name(self) -> str:
        return "DeepSeek"

    @property
    def supported_models(self) -> List[ModelInfo]:
        return [
            ModelInfo(
                id="deepseek-chat",
                name="deepseek-chat",
                display_name="DeepSeek V3.1 Chat (Non-thinking Mode)",
                provider=ModelProvider.DEEPSEEK,
                context_length=128000,  # 128K context
                supports_streaming=True,
                supports_functions=True,  # Now supports function calling
                supports_vision=False,
                type=ModelType.CHAT,
                pricing={"input_tokens": 0.27, "output_tokens": 1.10}  # Current pricing (cache miss)
            ),
            ModelInfo(
                id="deepseek-reasoner",
                name="deepseek-reasoner", 
                display_name="DeepSeek V3.1 Reasoner (Thinking Mode)",
                provider=ModelProvider.DEEPSEEK,
                context_length=128000,  # 128K context
                supports_streaming=True,
                supports_functions=False,  # No function calling in thinking mode
                supports_vision=False,
                type=ModelType.CHAT,
                pricing={"input_tokens": 0.55, "output_tokens": 2.19}  # Current pricing (cache miss)
            )
        ]

    async def _ensure_session(self):
        if self.session is None or self.session.closed:
            connector = aiohttp.TCPConnector(limit=100, limit_per_host=30)
            timeout = aiohttp.ClientTimeout(total=60, connect=10)
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
        model: str = "deepseek-chat",
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

        self.logger.info(f"Sending request to DeepSeek API: {model}, temp={params.temperature}")

        accumulated_content = ""
        output_tokens = 0
        
        try:
            url = f"{self.base_url}/chat/completions"
            async with self.session.post(url, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    self.logger.error(f"DeepSeek API error: {response.status} - {error_text}")
                    yield ChatResponse(
                        error=f"API Error {response.status}: {error_text}",
                        meta={"provider": ModelProvider.DEEPSEEK, "model": model}
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
                            "provider": ModelProvider.DEEPSEEK,
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
                                        "provider": ModelProvider.DEEPSEEK,
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
            self.logger.error("Request to DeepSeek API timed out")
            yield ChatResponse(
                error="Request timed out",
                meta={"provider": ModelProvider.DEEPSEEK, "model": model}
            )
        except Exception as e:
            self.logger.error(f"Error in DeepSeek API call: {e}")
            yield ChatResponse(
                error=f"API Error: {str(e)}",
                meta={"provider": ModelProvider.DEEPSEEK, "model": model}
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
                "provider": ModelProvider.DEEPSEEK,
                "model": model
            }
        )

    async def get_available_models(self) -> List[ModelInfo]:
        """Get list of available models from DeepSeek"""
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
                        if "chat" in model_id.lower() or "coder" in model_id.lower() or "reasoner" in model_id.lower():
                            models.append(ModelInfo(
                                id=model_id,
                                name=model_id,
                                display_name=model_data.get("display_name", model_id),
                                provider=ModelProvider.DEEPSEEK,
                                context_length=model_data.get("context_length", 32768),
                                supports_streaming=True,
                                type=ModelType.CHAT
                            ))
                    
                    return models if models else self.supported_models
                else:
                    self.logger.error(f"Failed to fetch models: {response.status}")
                    return self.supported_models
        except Exception as e:
            self.logger.error(f"Error fetching models: {e}")
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
