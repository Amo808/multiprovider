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
            # DeepSeek V3.2 - Updated December 2025 from official API docs
            # https://api-docs.deepseek.com/quick_start/pricing
            ModelInfo(
                id="deepseek-chat",
                name="deepseek-chat",
                display_name="DeepSeek V3.2 Chat (Non-thinking Mode)",
                provider=ModelProvider.DEEPSEEK,
                context_length=128000,  # 128K context
                supports_streaming=True,
                supports_functions=True,  # Supports Tool Calls & JSON Output
                supports_vision=False,
                type=ModelType.CHAT,
                pricing={"input_tokens": 0.28, "output_tokens": 0.42},  # Cache miss pricing
                max_output_tokens=8000,  # API: DEFAULT 4K, MAX 8K
                recommended_max_tokens=4000  # Default setting
            ),
            ModelInfo(
                id="deepseek-reasoner",
                name="deepseek-reasoner", 
                display_name="DeepSeek V3.2 Reasoner (Thinking Mode)",
                provider=ModelProvider.DEEPSEEK,
                context_length=128000,  # 128K context
                supports_streaming=True,
                supports_functions=True,  # Supports Tool Calls in V3.2
                supports_vision=False,
                type=ModelType.CHAT,
                pricing={"input_tokens": 0.28, "output_tokens": 0.42},  # Same pricing
                max_output_tokens=64000,  # API: DEFAULT 32K, MAX 64K
                recommended_max_tokens=32000  # Default setting for reasoning
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
        
        # Ensure we have at least one message
        if not api_messages:
            yield ChatResponse(
                error="No messages to process",
                meta={"provider": ModelProvider.DEEPSEEK, "model": model}
            )
            return

        # Calculate input tokens
        input_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in api_messages])
        input_tokens = self.estimate_tokens(input_text)

        # Validate and clamp max_tokens to API limits based on model
        # DeepSeek V3.2 API limits:
        # - deepseek-chat: max_tokens in [1, 8000] (default 4000)
        # - deepseek-reasoner: max_tokens in [1, 64000] (default 32000)
        max_tokens = params.max_tokens
        
        # Determine max limit based on model
        if model == "deepseek-reasoner":
            max_limit = 64000
            default_tokens = 32000
        else:  # deepseek-chat
            max_limit = 8000
            default_tokens = 4000
        
        if max_tokens is None or max_tokens < 1:
            max_tokens = default_tokens
        elif max_tokens > max_limit:
            self.logger.warning(f"max_tokens clamped from {params.max_tokens} to {max_limit} (API limit for {model})")
            max_tokens = max_limit

        # Clamp temperature to valid range [0, 2]
        temperature = params.temperature
        if temperature is None or temperature < 0:
            temperature = 1.0
        elif temperature > 2.0:
            temperature = 2.0
            self.logger.warning(f"temperature clamped from {params.temperature} to 2.0 (API limit)")

        payload = {
            "model": model,
            "messages": api_messages,
            "stream": params.stream,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "top_p": params.top_p,
            "frequency_penalty": params.frequency_penalty,
            "presence_penalty": params.presence_penalty,
        }

        if params.stop_sequences:
            payload["stop"] = params.stop_sequences

        self.logger.info(f"Sending request to DeepSeek API: {model}, temp={params.temperature}")

        accumulated_content = ""
        accumulated_reasoning = ""  # For deepseek-reasoner thinking content
        output_tokens = 0
        reasoning_tokens = 0
        
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
                    message = data.get("choices", [{}])[0].get("message", {})
                    content = message.get("content", "")
                    reasoning_content = message.get("reasoning_content", "")
                    usage = data.get("usage", {})
                    
                    yield ChatResponse(
                        content=content,
                        id=data.get("id"),
                        done=True,
                        meta={
                            "tokens_in": usage.get("prompt_tokens", input_tokens),
                            "tokens_out": usage.get("completion_tokens", self.estimate_tokens(content)),
                            "reasoning_content": reasoning_content,
                            "thought_tokens": usage.get("reasoning_tokens", 0),
                            "provider": ModelProvider.DEEPSEEK,
                            "model": model
                        }
                    )
                    return

                # Handle streaming response
                self.logger.info(f"[DeepSeek] Starting SSE stream processing...")
                chunk_count = 0
                async for line in response.content:
                    line = line.decode('utf-8').strip()
                    
                    if not line or line == "data: [DONE]":
                        continue
                        
                    if line.startswith("data: "):
                        chunk_count += 1
                        try:
                            json_data = json.loads(line[6:])
                            choices = json_data.get("choices", [])
                            
                            # DEBUG: Log EVERY SSE chunk 
                            self.logger.info(f"[DeepSeek] SSE chunk #{chunk_count}: {line[:200]}")
                            
                            if not choices:
                                continue
                                
                            choice = choices[0]
                            delta = choice.get("delta", {})
                            content = delta.get("content", "")
                            reasoning_content = delta.get("reasoning_content", "")
                            
                            # Also check for thinking in other possible fields
                            if not reasoning_content:
                                # Try alternative field names
                                reasoning_content = delta.get("thinking", "") or delta.get("thought", "") or choice.get("reasoning_content", "")
                            
                            # DEBUG: Log delta contents
                            self.logger.info(f"[DeepSeek] Delta keys: {list(delta.keys())}, choice keys: {list(choice.keys())}")
                            
                            # Handle reasoning/thinking content for deepseek-reasoner
                            if reasoning_content:
                                accumulated_reasoning += reasoning_content
                                reasoning_tokens = self.estimate_tokens(accumulated_reasoning)
                                self.logger.info(f"[DeepSeek] Reasoning chunk received: {len(reasoning_content)} chars, total: {len(accumulated_reasoning)} chars")
                                
                                # Emit thinking event to frontend
                                yield ChatResponse(
                                    content="",  # No visible content yet
                                    id=json_data.get("id"),
                                    done=False,
                                    meta={
                                        "tokens_in": input_tokens,
                                        "tokens_out": output_tokens,
                                        "thinking": reasoning_content,  # Send thinking chunk
                                        "reasoning_content": reasoning_content,
                                        "thought_tokens": reasoning_tokens,
                                        "provider": ModelProvider.DEEPSEEK,
                                        "model": model,
                                        "reasoning": True  # Flag to indicate reasoning mode
                                    }
                                )
                            
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
                                        "thought_tokens": reasoning_tokens,
                                        "provider": ModelProvider.DEEPSEEK,
                                        "model": model
                                    }
                                )
                            
                            # Check if finished
                            finish_reason = choice.get("finish_reason")
                            if finish_reason:
                                self.logger.info(f"DeepSeek response finished with reason: {finish_reason}")
                                if finish_reason == "length":
                                    self.logger.warning(f"Response was truncated due to max_tokens limit. Consider increasing max_tokens for longer responses.")
                                    # Include finish_reason in final meta for UI indication
                                    accumulated_content += "\n\n⚠️ *Response was truncated due to token limit. You can increase max_tokens in settings for longer responses.*"
                                break
                                
                        except json.JSONDecodeError as e:
                            self.logger.error(f"Failed to parse JSON: {line} - {e}")
                            continue

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
                "total_tokens": input_tokens + final_output_tokens + reasoning_tokens,
                "thought_tokens": reasoning_tokens,
                "reasoning_content": accumulated_reasoning if accumulated_reasoning else None,
                "provider": ModelProvider.DEEPSEEK,
                "model": model,
                "estimated_cost": self._calculate_cost(input_tokens, final_output_tokens, model)
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
                    
                    result = models if models else self.supported_models
                    # Cache the models for sync access
                    self._models = result
                    return result
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

    def _calculate_cost(self, input_tokens: int, output_tokens: int, model: str) -> float:
        """Calculate estimated cost based on model pricing"""
        # DeepSeek V3.1 pricing (per million tokens)
        if model == "deepseek-chat":
            input_cost_per_million = 0.27  # $0.27 per 1M input tokens
            output_cost_per_million = 1.10  # $1.10 per 1M output tokens
        elif model == "deepseek-reasoner":
            input_cost_per_million = 0.55  # $0.55 per 1M input tokens
            output_cost_per_million = 2.19  # $2.19 per 1M output tokens
        else:
            # Default to chat model pricing
            input_cost_per_million = 0.27
            output_cost_per_million = 1.10
            
        input_cost = (input_tokens / 1_000_000) * input_cost_per_million
        output_cost = (output_tokens / 1_000_000) * output_cost_per_million
        
        return round(input_cost + output_cost, 6)

    async def close(self):
        """Clean up session"""
        if self.session and not self.session.closed:
            await self.session.close()
