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

    # --- Added helper to detect models enforcing single sampling param ---
    def _single_sampling_model(self, model_id: str) -> bool:
        """Return True if Anthropic model requires only one of temperature OR top_p.
        Claude 4.x / 4.5 (opus/sonnet/haiku) enforce mutual exclusivity.
        We detect by substrings to cover snapshot IDs (e.g. claude-haiku-4-5-20251001)."""
        patterns = [
            "claude-opus-4", "claude-sonnet-4", "claude-haiku-4",  # generic 4.x
            "claude-opus-4-1", "claude-sonnet-4-1", "claude-haiku-4-1",  # 4.1
            "claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"  # 4.5
        ]
        return any(p in model_id for p in patterns)

    @property
    def name(self) -> str:
        return "Anthropic"

    @property
    def supported_models(self) -> List[ModelInfo]:
        return [
            # === Claude 4.5 Models (Latest - December 2025) ===
            # From official Anthropic docs: https://docs.anthropic.com/en/docs/about-claude/models
            # Context: 200K (1M with beta header for Sonnet), Max Output: 64K
            ModelInfo(
                id="claude-opus-4-5-20251101",
                name="claude-opus-4-5-20251101",
                display_name="Claude Opus 4.5 (Premium Intelligence)",
                provider=ModelProvider.ANTHROPIC,
                context_length=200000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=64000,  # 64K max output
                recommended_max_tokens=16384,
                pricing={"input_tokens": 5.00, "output_tokens": 25.00}  # per 1M tokens
            ),
            ModelInfo(
                id="claude-sonnet-4-5-20250929",
                name="claude-sonnet-4-5-20250929",
                display_name="Claude Sonnet 4.5 (Best for Agents & Coding)",
                provider=ModelProvider.ANTHROPIC,
                context_length=200000,  # 1M with beta header
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=64000,  # 64K max output
                recommended_max_tokens=16384,
                pricing={"input_tokens": 3.00, "output_tokens": 15.00}
            ),
            ModelInfo(
                id="claude-haiku-4-5-20251001",
                name="claude-haiku-4-5-20251001", 
                display_name="Claude Haiku 4.5 (Fastest)",
                provider=ModelProvider.ANTHROPIC,
                context_length=200000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=64000,  # 64K max output
                recommended_max_tokens=8192,  # Faster responses
                pricing={"input_tokens": 1.00, "output_tokens": 5.00}
            ),
            # === Claude 4.1 Models ===
            ModelInfo(
                id="claude-opus-4-1-20250805",
                name="claude-opus-4-1-20250805",
                display_name="Claude Opus 4.1",
                provider=ModelProvider.ANTHROPIC,
                context_length=200000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=64000,  # 64K max
                recommended_max_tokens=16384,
                pricing={"input_tokens": 15.00, "output_tokens": 75.00}
            ),
            # === Claude 4 Models ===
            ModelInfo(
                id="claude-sonnet-4-20250514",
                name="claude-sonnet-4-20250514",
                display_name="Claude Sonnet 4",
                provider=ModelProvider.ANTHROPIC,
                context_length=200000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=64000,
                recommended_max_tokens=16384,
                pricing={"input_tokens": 3.00, "output_tokens": 15.00}
            ),
            # === Claude 3.5 Models (Legacy) ===
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
                max_output_tokens=8192,
                recommended_max_tokens=4096,
                pricing={"input_tokens": 0.80, "output_tokens": 4.00}
            ),
            # === Claude 3 Models (Legacy) ===
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
                max_output_tokens=4096,
                recommended_max_tokens=4096,
                pricing={"input_tokens": 0.25, "output_tokens": 1.25}
            ),
            # === Aliases (point to latest snapshots) ===
            ModelInfo(
                id="claude-opus-4-5",
                name="claude-opus-4-5",
                display_name="Claude Opus 4.5 (Latest)",
                provider=ModelProvider.ANTHROPIC,
                context_length=200000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=64000,
                recommended_max_tokens=16384,
                pricing={"input_tokens": 5.00, "output_tokens": 25.00}
            ),
            ModelInfo(
                id="claude-sonnet-4-5",
                name="claude-sonnet-4-5",
                display_name="Claude Sonnet 4.5 (Latest)",
                provider=ModelProvider.ANTHROPIC,
                context_length=200000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=64000,
                recommended_max_tokens=16384,
                pricing={"input_tokens": 3.00, "output_tokens": 15.00}
            ),
            ModelInfo(
                id="claude-haiku-4-5",
                name="claude-haiku-4-5",
                display_name="Claude Haiku 4.5 (Latest)",
                provider=ModelProvider.ANTHROPIC,
                context_length=200000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=64000,
                recommended_max_tokens=8192,
                pricing={"input_tokens": 1.00, "output_tokens": 5.00}
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
        model: str = "claude-sonnet-4-5-20250929",
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

        # Validate and clamp max_tokens for Anthropic
        # Claude 4.x/4.5 support up to 64K output, Claude 3.5 8K, Claude 3 4K
        max_tokens = params.max_tokens
        
        # Model-specific max output token limits (from official Anthropic docs December 2025)
        model_limits = {
            # Claude 4.5 series - 64K max output
            'claude-opus-4-5': 64000,
            'claude-sonnet-4-5': 64000,
            'claude-haiku-4-5': 64000,
            # Claude 4.1 series - 64K max output
            'claude-opus-4-1': 64000,
            # Claude 4 series - 64K max output
            'claude-sonnet-4': 64000,
            'claude-opus-4': 64000,
            # Claude 3.7 series - 64K max output
            'claude-3-7': 64000,
            # Claude 3.5 series - 8K max output
            'claude-3-5': 8192,
            # Claude 3 series - 4K max output
            'claude-3-opus': 4096,
            'claude-3-haiku': 4096,
            'claude-3-sonnet': 4096,
        }
        
        # Find limit for model
        limit = 8192  # default for unknown models
        for model_prefix, model_limit in model_limits.items():
            if model.startswith(model_prefix):
                limit = model_limit
                break
        
        if max_tokens is None or max_tokens < 1:
            max_tokens = 4096  # Default
        elif max_tokens > limit:
            self.logger.warning(f"max_tokens clamped from {params.max_tokens} to {limit} for Anthropic model {model}")
            max_tokens = limit

        # Clamp temperature for Anthropic (0-1 range)
        temperature = params.temperature
        if temperature is None or temperature < 0:
            temperature = 0.7
        elif temperature > 1.0:
            temperature = 1.0
            self.logger.warning(f"temperature clamped from {params.temperature} to 1.0 for Anthropic")

        payload = {
            "model": model,
            "messages": api_messages,
            "stream": params.stream,
            "max_tokens": max_tokens,
        }

        # === Extended Thinking support for Claude ===
        # Check if thinking/extended thinking is requested
        # Models that support extended thinking: Claude 3.5 Sonnet, Claude 3.7, Claude 4+
        thinking_models = [
            'claude-3-5-sonnet', 'claude-3-7', 
            'claude-sonnet-4', 'claude-opus-4', 'claude-haiku-4',
            'claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5',
            'claude-opus-4-1', 'claude-sonnet-4-1', 'claude-haiku-4-1'
        ]
        model_supports_thinking = any(model.startswith(prefix) for prefix in thinking_models)
        
        # Enable thinking if include_thoughts is True or thinking_budget is set
        should_enable_thinking = params.include_thoughts or (params.thinking_budget is not None and params.thinking_budget != 0)
        
        if should_enable_thinking and model_supports_thinking:
            # Anthropic Extended Thinking API format
            thinking_config = {"type": "enabled"}
            
            # Set budget_tokens if provided (must be >= 1024 for Anthropic)
            if params.thinking_budget is not None and params.thinking_budget > 0:
                thinking_budget = max(1024, params.thinking_budget)
            else:
                # Default thinking budget for extended thinking
                thinking_budget = 10000
            
            thinking_config["budget_tokens"] = thinking_budget
            
            # IMPORTANT: max_tokens must be greater than budget_tokens
            # Ensure max_tokens is at least budget_tokens + 1000 for response
            if max_tokens <= thinking_budget:
                max_tokens = thinking_budget + 4000  # Add 4000 for actual response
                self.logger.info(f"Increased max_tokens to {max_tokens} (must be > budget_tokens={thinking_budget})")
            
            payload["max_tokens"] = max_tokens  # Update payload
            payload["thinking"] = thinking_config
            
            # Extended thinking requires temperature = 1 for Anthropic
            temperature = 1.0
            self.logger.info(f"Extended Thinking enabled for {model} with budget={thinking_budget}, max_tokens={max_tokens}")

        # For newer Claude models (Claude 4 series), use only temperature OR top_p, not both
        is_claude_4_series = self._single_sampling_model(model)
        
        if is_claude_4_series:
            # If user supplied both, choose temperature (higher control) and drop top_p
            user_set_temperature = params.temperature is not None
            user_set_top_p = params.top_p is not None
            if user_set_temperature and user_set_top_p:
                self.logger.warning(
                    f"Anthropic: both temperature and top_p provided for {model}. Sending only temperature per API requirements."
                )
            if user_set_temperature:
                payload["temperature"] = temperature
                # Ensure top_p not present
                payload.pop("top_p", None)
            elif user_set_top_p:
                payload["top_p"] = params.top_p
            else:
                # Default to temperature when neither explicitly set
                payload["temperature"] = temperature
        else:
            # For older Claude models: can use both parameters
            if params.temperature is not None:
                payload["temperature"] = temperature
            if params.top_p is not None:
                payload["top_p"] = params.top_p

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
                accumulated_thinking = ""  # For extended thinking content
                current_block_type = None
                
                async for line in response.content:
                    line = line.decode('utf-8').strip()
                    
                    if not line:
                        continue
                        
                    if line.startswith("data: "):
                        try:
                            json_data = json.loads(line[6:])
                            event_type = json_data.get("type")
                            
                            # Track content block type (thinking vs text)
                            if event_type == "content_block_start":
                                content_block = json_data.get("content_block", {})
                                current_block_type = content_block.get("type")
                                self.logger.debug(f"Content block started: {current_block_type}")
                            
                            elif event_type == "content_block_delta":
                                delta = json_data.get("delta", {})
                                delta_type = delta.get("type", "")
                                
                                # Handle thinking delta (extended thinking)
                                if delta_type == "thinking_delta":
                                    thinking_text = delta.get("thinking", "")
                                    if thinking_text:
                                        accumulated_thinking += thinking_text
                                        # Emit thinking content with special marker
                                        yield ChatResponse(
                                            content="",
                                            reasoning_content=thinking_text,
                                            id=json_data.get("id"),
                                            done=False,
                                            meta={
                                                "tokens_in": input_tokens,
                                                "tokens_out": output_tokens,
                                                "is_thinking": True,  # Flag, not content
                                                "reasoning_content": thinking_text,  # The actual content
                                                "provider": ModelProvider.ANTHROPIC,
                                                "model": model
                                            }
                                        )
                                
                                # Handle regular text delta
                                elif delta_type == "text_delta":
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
                                
                                # Fallback for old format without delta type
                                else:
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
                            
                            elif event_type == "content_block_stop":
                                current_block_type = None
                            
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
        except aiohttp.ClientPayloadError as e:
            # Handle incomplete response (TransferEncodingError)
            self.logger.warning(f"Anthropic stream interrupted: {e}")
            # If we have accumulated content, consider it a partial success
            if accumulated_content:
                self.logger.info(f"Returning partial response ({len(accumulated_content)} chars)")
                # Don't yield error, just finalize with what we have
            else:
                yield ChatResponse(
                    error=f"Stream interrupted: {str(e)}",
                    meta={"provider": ModelProvider.ANTHROPIC, "model": model}
                )
        except aiohttp.ClientError as e:
            self.logger.error(f"Network error in Anthropic API call: {e}")
            if accumulated_content:
                self.logger.info(f"Returning partial response after network error ({len(accumulated_content)} chars)")
            else:
                yield ChatResponse(
                    error=f"Network error: {str(e)}",
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
        thinking_tokens = self.estimate_tokens(accumulated_thinking) if accumulated_thinking else 0
        
        yield ChatResponse(
            content="",
            reasoning_content=accumulated_thinking if accumulated_thinking else None,
            done=True,
            meta={
                "tokens_in": input_tokens,
                "tokens_out": final_output_tokens,
                "thinking_tokens": thinking_tokens,
                "total_tokens": input_tokens + final_output_tokens + thinking_tokens,
                "estimated_cost": self._calculate_cost(input_tokens, final_output_tokens, model),
                "provider": ModelProvider.ANTHROPIC,
                "model": model
            }
        )

    async def get_available_models(self) -> List[ModelInfo]:
        """Get list of available models (static for Anthropic)"""
        # Anthropic doesn't have a models endpoint, return supported models
        # Cache for sync access
        self._models = self.supported_models
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
        # Find pricing for this model
        model_pricing = None
        for model_info in self.supported_models:
            if model_info.id == model:
                model_pricing = model_info.pricing
                break
        
        if not model_pricing:
            # Fallback pricing for unknown models (Claude 3.5 Sonnet pricing)
            model_pricing = {"input_tokens": 3.00, "output_tokens": 15.00}
            
        # Calculate cost per million tokens
        input_cost_per_million = model_pricing["input_tokens"]
        output_cost_per_million = model_pricing["output_tokens"]
        
        input_cost = (input_tokens / 1_000_000) * input_cost_per_million
        output_cost = (output_tokens / 1_000_000) * output_cost_per_million
        
        return round(input_cost + output_cost, 6)

    async def close(self):
        """Clean up session"""
        if self.session and not self.session.closed:
            await self.session.close()
