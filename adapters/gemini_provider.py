import asyncio
import json
import logging
from typing import Dict, List, Optional, AsyncGenerator, Any
import aiohttp
from .base_provider import BaseAdapter, Message, GenerationParams, ChatResponse, ModelInfo, ModelProvider, ModelType, ProviderConfig

logger = logging.getLogger(__name__)


class GeminiAdapter(BaseAdapter):
    """Google Gemini AI Provider Adapter with streaming support"""
    
    def __init__(self, config: ProviderConfig):
        super().__init__(config)
        self.api_key = config.api_key
        self.base_url = config.base_url or "https://generativelanguage.googleapis.com"
        self.base_url = self.base_url.rstrip("/")
        self.session = None
        
        # Debug: Check if API key is available
        if self.api_key:
            self.logger.info(f"Gemini API key loaded successfully (length: {len(self.api_key)})")
        else:
            self.logger.error("Gemini API key not found in environment variables!")

    @property
    def name(self) -> str:
        return "Google Gemini"

    @property
    def supported_models(self) -> List[ModelInfo]:
        return [
            # Latest Gemini 2.5 models (November 2025)
            ModelInfo(
                id="gemini-2.5-flash",
                name="gemini-2.5-flash",
                display_name="Gemini 2.5 Flash",
                provider=ModelProvider.GEMINI,
                context_length=1000000,  # 1M context window
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=32768,
                recommended_max_tokens=8192,
                description="Best price-performance model with comprehensive capabilities and reasoning",
                pricing={"input_tokens": 0.30, "output_tokens": 2.50}
            ),
            ModelInfo(
                id="gemini-2.5-flash-lite",
                name="gemini-2.5-flash-lite", 
                display_name="Gemini 2.5 Flash Lite",
                provider=ModelProvider.GEMINI,
                context_length=1000000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=32768,
                recommended_max_tokens=4096,
                description="Fastest and most cost-effective model optimized for high throughput",
                pricing={"input_tokens": 0.10, "output_tokens": 0.40}
            ),
            # Gemini 2.0 models (second generation)
            ModelInfo(
                id="gemini-2.0-flash-exp",
                name="gemini-2.0-flash-exp",
                display_name="Gemini 2.0 Flash (Experimental)",
                provider=ModelProvider.GEMINI,
                context_length=1000000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=8192,
                recommended_max_tokens=4096,
                description="Experimental second-generation workhorse model",
                pricing={"input_tokens": 0.10, "output_tokens": 0.40}
            ),
            # Legacy Gemini 1.5 models (still supported)
            ModelInfo(
                id="gemini-1.5-pro",
                name="gemini-1.5-pro",
                display_name="Gemini 1.5 Pro",
                provider=ModelProvider.GEMINI,
                context_length=2097152,  # 2M context window
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=8192,
                recommended_max_tokens=4096,
                description="Legacy Pro model with large context window",
                pricing={"input_tokens": 1.25, "output_tokens": 5.00}
            ),
            ModelInfo(
                id="gemini-1.5-flash",
                name="gemini-1.5-flash",
                display_name="Gemini 1.5 Flash",
                provider=ModelProvider.GEMINI,
                context_length=1048576,  # 1M context window
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=8192,
                recommended_max_tokens=4096,
                description="Legacy Flash model with good balance of speed and capability",
                pricing={"input_tokens": 0.075, "output_tokens": 0.30}
            ),
            ModelInfo(
                id="gemini-1.0-pro",
                name="gemini-1.0-pro", 
                display_name="Gemini 1.0 Pro",
                provider=ModelProvider.GEMINI,
                context_length=32768,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=False,
                type=ModelType.CHAT,
                max_output_tokens=2048,
                recommended_max_tokens=1024,
                description="Original Gemini model for basic tasks",
                pricing={"input_tokens": 0.50, "output_tokens": 1.50}
            )
        ]

    async def _ensure_session(self):
        if self.session is None or self.session.closed:
            connector = aiohttp.TCPConnector(
                limit=100,
                limit_per_host=10,
                ttl_dns_cache=300,
                use_dns_cache=True,
                keepalive_timeout=300,
                enable_cleanup_closed=True,
                force_close=False
            )
            # NO TIMEOUTS - allow unlimited response time like DeepSeek
            timeout = aiohttp.ClientTimeout(
                total=None,      # No total timeout
                connect=60,      # 60s to establish connection
                sock_read=None,  # NO read timeout - unlimited time between chunks
                sock_connect=60  # 60s socket connect timeout
            )
            self.session = aiohttp.ClientSession(
                connector=connector,
                timeout=timeout,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "AI-Chat/2.0-Unlimited",
                    "Connection": "keep-alive",
                    "Keep-Alive": "timeout=300, max=1000"
                }
            )

    async def chat_completion(
        self,
        messages: List[Message],
        model: str = "gemini-2.5-flash",
        params: GenerationParams = None,
        **kwargs
    ) -> AsyncGenerator[ChatResponse, None]:
        if params is None:
            params = GenerationParams()

        await self._ensure_session()
        
        # Convert messages to Gemini API format
        contents = []
        for msg in messages:
            if msg.role == "system":
                # Gemini doesn't have system role, add as instruction to first user message
                if not contents:
                    contents.append({
                        "role": "user",
                        "parts": [{"text": f"System instruction: {msg.content}"}]
                    })
                else:
                    # Prepend to first user message
                    for content in contents:
                        if content["role"] == "user":
                            content["parts"][0]["text"] = f"System instruction: {msg.content}\n\n{content['parts'][0]['text']}"
                            break
            else:
                role = "model" if msg.role == "assistant" else "user"
                contents.append({
                    "role": role,
                    "parts": [{"text": msg.content}]
                })
        
        # Ensure we have at least one message
        if not contents:
            yield ChatResponse(
                error="No messages to process",
                meta={"provider": ModelProvider.GEMINI, "model": model}
            )
            return

        # Calculate input tokens (rough estimation)
        input_text = "\n".join([f"{msg.get('role', 'user')}: {msg.get('parts', [{}])[0].get('text', '')}" for msg in contents])
        input_tokens = self.estimate_tokens(input_text)

        # Warn user about potentially long requests
        is_reasoning_request = (params.thinking_budget is not None and params.thinking_budget != 0) or params.include_thoughts
        if is_reasoning_request:
            yield ChatResponse(
                content=" (Reasoning mode enabled - this may take several minutes to complete)",
                done=False,
                meta={
                    "tokens_in": input_tokens,
                    "tokens_out": 0,
                    "provider": ModelProvider.GEMINI,
                    "model": model,
                    "warning": True
                }
            )
        
        # Warn for large inputs that may cause longer processing times
        if input_tokens > 50000:
            yield ChatResponse(
                content=" (Large input detected - processing may take extra time)",
                done=False,
                meta={
                    "tokens_in": input_tokens,
                    "tokens_out": 0,
                    "provider": ModelProvider.GEMINI,
                    "model": model,
                    "warning": True
                }
            )

        # Gemini API payload
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": params.temperature,
                "maxOutputTokens": params.max_tokens,
                "topP": params.top_p,
            }
        }
        # Inject thinking config INSIDE generationConfig per latest docs
        if params.thinking_budget is not None or params.include_thoughts:
            thinking_cfg = {}
            if params.thinking_budget is not None:
                thinking_cfg["thinkingBudget"] = params.thinking_budget  # -1 dynamic, 0 off, >0 fixed
            if params.include_thoughts:
                thinking_cfg["includeThoughts"] = True
            if thinking_cfg:
                payload["generationConfig"]["thinkingConfig"] = thinking_cfg
                self.logger.info(f"[Gemini] thinkingConfig injected: {thinking_cfg}")

        if params.stop_sequences:
            payload["generationConfig"]["stopSequences"] = params.stop_sequences

        self.logger.info(f"Sending request to Gemini API: {model}, temp={params.temperature}")

        accumulated_content = ""
        output_tokens = 0
        
        # Check if API key is available
        if not self.api_key:
            self.logger.error("Gemini API key not configured")
            yield ChatResponse(
                error="Gemini API key not configured. Please add your API key in settings.",
                meta={"provider": ModelProvider.GEMINI, "model": model}
            )
            return

        try:
            # Use streaming or non-streaming endpoint
            if params.stream:
                url = f"{self.base_url}/v1beta/models/{model}:streamGenerateContent?key={self.api_key}"
            else:
                url = f"{self.base_url}/v1beta/models/{model}:generateContent?key={self.api_key}"
            
            # Log URL for debugging (hide API key)
            safe_url = url.replace(self.api_key, "***API_KEY***") if self.api_key else url
            self.logger.info(f"Making request to: {safe_url}")
            
            # Prepare retry mechanism if 'thinking' not yet supported
            for attempt in range(2):
                safe_url = url.replace(self.api_key, "***API_KEY***") if self.api_key else url
                self.logger.info(f"Making request to: {safe_url} (attempt {attempt+1}) payloadKeys={list(payload.keys())} genKeys={list(payload['generationConfig'].keys())}")
                async with self.session.post(url, json=payload) as response:
                    if response.status == 400:
                        err_txt = await response.text()
                        if attempt == 0 and ("Unknown name \"thinkingConfig\"" in err_txt or "Unknown name \"thinkingBudget\"" in err_txt):
                            # Remove thinkingConfig and retry once
                            if "thinkingConfig" in payload.get("generationConfig", {}):
                                self.logger.warning("[Gemini] thinkingConfig rejected by API, retrying without it")
                                del payload["generationConfig"]["thinkingConfig"]
                                continue
                    # Normal processing continues below
                    if response.status != 200:
                        error_text = await response.text()
                        self.logger.error(f"Gemini API error: {response.status} - {error_text}")
                        yield ChatResponse(
                            error=f"API Error {response.status}: {error_text}",
                            meta={"provider": ModelProvider.GEMINI, "model": model}
                        )
                        return

                    if not params.stream:
                        # Handle non-streaming response
                        data = await response.json()
                        candidates = data.get("candidates", [])
                        usage_metadata = data.get("usageMetadata", {})
                        # Extract thought token counts if present
                        thoughts_tokens = usage_metadata.get("thoughtTokens") or usage_metadata.get("thought_token_count") or usage_metadata.get("thoughtsTokenCount")
                        thought_budget_used = usage_metadata.get("thinkingTokenCount") or usage_metadata.get("thinking_token_count")
                        if candidates and candidates[0].get("content"):
                            content = candidates[0]["content"]["parts"][0]["text"]
                            tokens_in = usage_metadata.get("promptTokenCount", input_tokens)
                            tokens_out = usage_metadata.get("candidatesTokenCount", self.estimate_tokens(content))
                            meta_extra = {
                                "tokens_in": tokens_in,
                                "tokens_out": tokens_out,
                                "estimated_cost": self._calculate_cost(tokens_in, tokens_out, model),
                                "provider": ModelProvider.GEMINI,
                                "model": model,
                                "thinking_budget": params.thinking_budget,
                                "dynamic_thinking": params.thinking_budget == -1 if params.thinking_budget is not None else None
                            }
                            if thoughts_tokens is not None:
                                meta_extra["thought_tokens"] = thoughts_tokens
                            if thought_budget_used is not None:
                                meta_extra["thinking_tokens_used"] = thought_budget_used
                            yield ChatResponse(
                                content=content,
                                done=True,
                                meta=meta_extra
                            )
                        else:
                            yield ChatResponse(
                                error="No valid response from Gemini",
                                meta={"provider": ModelProvider.GEMINI, "model": model}
                            )
                        return

                    # Streaming branch with infinite patience for Gemini responses
                    text_buffer = ""
                    json_buffer = ""
                    bracket_count = 0
                    in_json = False
                    last_activity = asyncio.get_event_loop().time()
                    heartbeat_counter = 0
                    empty_chunks_count = 0
                    heartbeat_interval = 15  # Send heartbeat every 15 seconds
                    
                    # Check if this is a reasoning request that may take longer
                    is_reasoning_request = (params.thinking_budget is not None and params.thinking_budget != 0) or params.include_thoughts
                    if is_reasoning_request:
                        self.logger.info(f"[Gemini] Reasoning request detected, will wait as long as needed")
                    
                    async for chunk in response.content.iter_chunked(1024):
                        current_time = asyncio.get_event_loop().time()
                        
                        # Handle empty chunks - never give up, just track and send heartbeats
                        if not chunk:
                            empty_chunks_count += 1
                            
                            # Send heartbeat every 15 seconds of no data, but never stop waiting
                            if current_time - last_activity > heartbeat_interval:
                                heartbeat_counter += 1
                                silence_duration = current_time - last_activity
                                
                                if silence_duration < 60:
                                    heartbeat_msg = f" (Model thinking... {silence_duration:.0f}s)"
                                elif silence_duration < 300:  # 5 minutes
                                    heartbeat_msg = f" (Deep reasoning in progress... {silence_duration:.0f}s)"
                                elif silence_duration < 900:  # 15 minutes  
                                    heartbeat_msg = f" (Complex reasoning... {silence_duration:.0f}s - still waiting)"
                                else:  # 15+ minutes
                                    heartbeat_msg = f" (Extensive reasoning... {silence_duration:.0f}s - we will wait as long as needed)"
                                
                                yield ChatResponse(
                                    content="",
                                    done=False,
                                    heartbeat="Processing... connection active",
                                    meta={
                                        "tokens_in": input_tokens,
                                        "tokens_out": self.estimate_tokens(accumulated_content),
                                        "provider": ModelProvider.GEMINI,
                                        "model": model,
                                        "silence_duration": silence_duration,
                                        "empty_chunks": empty_chunks_count
                                    },
                                    stage_message=heartbeat_msg
                                )
                                last_activity = current_time
                            continue
                        
                        # Reset counters on receiving data
                        empty_chunks_count = 0
                        last_activity = current_time
                        
                        text_buffer += chunk.decode('utf-8', errors='ignore')
                        i = 0
                        while i < len(text_buffer):
                            char = text_buffer[i]
                            if char == '{' and not in_json:
                                in_json = True
                                bracket_count = 1
                                json_buffer = char
                            elif in_json:
                                json_buffer += char
                                if char == '{':
                                    bracket_count += 1
                                elif char == '}':
                                    bracket_count -= 1
                                    if bracket_count == 0:
                                        try:
                                            json_response = json.loads(json_buffer)
                                            candidates = json_response.get("candidates", [])
                                            if candidates:
                                                candidate = candidates[0]
                                                content_part = candidate.get("content", {})
                                                parts = content_part.get("parts", [])
                                                if parts and "text" in parts[0]:
                                                    content = parts[0]["text"]
                                                    accumulated_content += content
                                                    tokens_out = self.estimate_tokens(accumulated_content)
                                                    yield ChatResponse(
                                                        content=content,
                                                        done=False,
                                                        meta={
                                                            "tokens_in": input_tokens,
                                                            "tokens_out": tokens_out,
                                                            "estimated_cost": self._calculate_cost(input_tokens, tokens_out, model),
                                                            "provider": ModelProvider.GEMINI,
                                                            "model": model,
                                                            "thinking_budget": params.thinking_budget,
                                                            "dynamic_thinking": params.thinking_budget == -1 if params.thinking_budget is not None else None
                                                        }
                                                    )
                                                finish_reason = candidate.get("finishReason")
                                                if finish_reason:
                                                    self.logger.info(f"Gemini response finished with reason: {finish_reason}")
                                                    final_output_tokens = self.estimate_tokens(accumulated_content)
                                                    # Extract usage metadata if present in streaming chunk
                                                    usage_meta_stream = json_response.get("usageMetadata", {})
                                                    thoughts_tokens_s = usage_meta_stream.get("thoughtTokens") or usage_meta_stream.get("thought_token_count") or usage_meta_stream.get("thoughtsTokenCount")
                                                    thought_budget_used_s = usage_meta_stream.get("thinkingTokenCount") or usage_meta_stream.get("thinking_token_count")
                                                    final_meta = {
                                                        "tokens_in": input_tokens,
                                                        "tokens_out": final_output_tokens,
                                                        "total_tokens": input_tokens + final_output_tokens,
                                                        "estimated_cost": self._calculate_cost(input_tokens, final_output_tokens, model),
                                                        "provider": ModelProvider.GEMINI,
                                                        "model": model,
                                                        "thinking_budget": params.thinking_budget,
                                                        "dynamic_thinking": params.thinking_budget == -1 if params.thinking_budget is not None else None
                                                    }
                                                    if thoughts_tokens_s is not None:
                                                        final_meta["thought_tokens"] = thoughts_tokens_s
                                                    if thought_budget_used_s is not None:
                                                        final_meta["thinking_tokens_used"] = thought_budget_used_s
                                                    yield ChatResponse(
                                                        content="",
                                                        done=True,
                                                        meta=final_meta
                                                    )
                                                    return
                                        except json.JSONDecodeError as e:
                                            self.logger.warning(f"Failed to parse JSON object: {json_buffer[:100]}... - {e}")
                                        except Exception as e:
                                            self.logger.error(f"Error processing streaming response: {e}")
                                        in_json = False
                                        json_buffer = ""
                                        bracket_count = 0
                            i += 1
                        if in_json:
                            text_buffer = ""
                        else:
                            text_buffer = text_buffer[i:]
                # End attempt loop
                break  # only reach here if no retry condition triggered
        except Exception as e:
            self.logger.error(f"Error in Gemini API call: {e}")
            yield ChatResponse(
                error=f"API Error: {str(e)}",
                meta={"provider": ModelProvider.GEMINI, "model": model}
            )
            return

        # If we reach here, send a final response to ensure completion
        final_output_tokens = self.estimate_tokens(accumulated_content) if accumulated_content else output_tokens
        yield ChatResponse(
            content="",
            done=True,
            meta={
                "tokens_in": input_tokens,
                "tokens_out": final_output_tokens,
                "total_tokens": input_tokens + final_output_tokens,
                "estimated_cost": self._calculate_cost(input_tokens, final_output_tokens, model),
                "provider": ModelProvider.GEMINI,
                "model": model,
                "thinking_budget": params.thinking_budget,
                "dynamic_thinking": params.thinking_budget == -1 if params.thinking_budget is not None else None
            }
        )

    def _process_gemini_candidate(self, candidate, accumulated_content, input_tokens, model):
        """Process a single Gemini candidate and return the content"""
        content_part = candidate.get("content", {})
        parts = content_part.get("parts", [])
        
        if parts and "text" in parts[0]:
            content = parts[0]["text"]
            return content
        return None

    async def get_available_models(self) -> List[ModelInfo]:
        """Get list of available models from Gemini"""
        return self.supported_models

    def _calculate_cost(self, input_tokens: int, output_tokens: int, model: str) -> float:
        """Calculate estimated cost based on Gemini model pricing"""
        # Find pricing for this model
        model_pricing = None
        for model_info in self.supported_models:
            if model_info.id == model:
                model_pricing = getattr(model_info, 'pricing', None)
                break
        
        if not model_pricing:
            # Fallback pricing for unknown models (use Flash pricing)
            model_pricing = {"input_tokens": 0.30, "output_tokens": 2.50}
            
        # Calculate cost per million tokens
        input_cost_per_million = model_pricing["input_tokens"]
        output_cost_per_million = model_pricing["output_tokens"]
        
        input_cost = (input_tokens / 1_000_000) * input_cost_per_million
        output_cost = (output_tokens / 1_000_000) * output_cost_per_million
        
        return round(input_cost + output_cost, 6)

    def estimate_tokens(self, text: str) -> int:
        """Estimate token count (rough approximation for Gemini)"""
        # Gemini uses different tokenization, rough estimate: 1 token ≈ 4 characters
        return len(text) // 4

    async def close(self):
        """Clean up session"""
        if self.session and not self.session.closed:
            await self.session.close()