import asyncio
import json
import logging
import time
from typing import Dict, List, Optional, AsyncGenerator, Any
import aiohttp
from .base_provider import BaseAdapter, Message, GenerationParams, ChatResponse, ModelInfo, ModelProvider, ModelType, ProviderConfig

logger = logging.getLogger(__name__)


class GeminiAdapter(BaseAdapter):
    """Google Gemini AI Provider Adapter with streaming support"""
    
    # Global rate limiter - track last request time per model
    _last_request_time: Dict[str, float] = {}
    _min_request_interval = 2.0  # Minimum 2 seconds between requests to same model
    
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
            # ============================================================
            # GEMINI 3 SERIES (Preview - January 2026)
            # Official docs: https://ai.google.dev/gemini-api/docs/gemini-3
            # All Gemini 3 models: 1M context input, 64K max output
            # ============================================================
            ModelInfo(
                id="gemini-3-pro-preview",
                name="gemini-3-pro-preview",
                display_name="Gemini 3 Pro (Most Intelligent - Preview)",
                provider=ModelProvider.GEMINI,
                context_length=1000000,  # 1M context window (official)
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=65536,  # 64K max output (official)
                recommended_max_tokens=8192,
                description="Best model for multimodal understanding, agentic workflows and vibe-coding. State-of-the-art reasoning.",
                pricing={"input_tokens": 2.00, "output_tokens": 12.00}  # Per million tokens (<200k), $4/$18 (>200k)
            ),
            ModelInfo(
                id="gemini-3-flash-preview",
                name="gemini-3-flash-preview",
                display_name="Gemini 3 Flash (Balanced Intelligence - Preview)",
                provider=ModelProvider.GEMINI,
                context_length=1000000,  # 1M context window (official)
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=65536,  # 64K max output (official)
                recommended_max_tokens=8192,
                description="Pro-level intelligence at Flash speed and pricing. Best balanced model for scale.",
                pricing={"input_tokens": 0.50, "output_tokens": 3.00}  # Per million tokens
            ),
            # ============================================================
            # GEMINI 2.5 SERIES (Generally Available)
            # Official docs: https://ai.google.dev/gemini-api/docs/models
            # All Gemini 2.5 models: 1M context, 64K max output
            # ============================================================
            ModelInfo(
                id="gemini-2.5-pro",
                name="gemini-2.5-pro",
                display_name="Gemini 2.5 Pro (Advanced Thinking)",
                provider=ModelProvider.GEMINI,
                context_length=1000000,  # 1M context window (official)
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=65536,  # 64K max output
                recommended_max_tokens=8192,
                description="State-of-the-art thinking model for complex problems in code, math, and STEM",
                pricing={"input_tokens": 1.25, "output_tokens": 10.00}  # (<200k), $2.50/$15 (>200k)
            ),
            ModelInfo(
                id="gemini-2.5-flash",
                name="gemini-2.5-flash",
                display_name="Gemini 2.5 Flash (Best Value + Thinking)",
                provider=ModelProvider.GEMINI,
                context_length=1000000,  # 1M context window (official)
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=65536,  # 64K max output
                recommended_max_tokens=8192,
                description="Best price-performance model with thinking capabilities and 1M context",
                pricing={"input_tokens": 0.30, "output_tokens": 2.50}  # Text output including reasoning
            ),
            ModelInfo(
                id="gemini-2.5-flash-lite",
                name="gemini-2.5-flash-lite", 
                display_name="Gemini 2.5 Flash-Lite (Fastest & Cheapest)",
                provider=ModelProvider.GEMINI,
                context_length=1000000,  # 1M context window (official)
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=65536,  # 64K max output
                recommended_max_tokens=8192,
                description="Fastest model optimized for cost-efficiency and high throughput",
                pricing={"input_tokens": 0.10, "output_tokens": 0.40}
            ),
            # ============================================================
            # GEMINI 2.0 SERIES (Previous Generation)
            # All Gemini 2.0 models: 1M context, 8K max output
            # ============================================================
            ModelInfo(
                id="gemini-2.0-flash",
                name="gemini-2.0-flash",
                display_name="Gemini 2.0 Flash",
                provider=ModelProvider.GEMINI,
                context_length=1000000,  # 1M context window (official)
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=8192,  # 8K max output (official)
                recommended_max_tokens=4096,
                description="Second-generation workhorse model with 1M token context",
                pricing={"input_tokens": 0.10, "output_tokens": 0.40}
            ),
            ModelInfo(
                id="gemini-2.0-flash-lite",
                name="gemini-2.0-flash-lite",
                display_name="Gemini 2.0 Flash-Lite",
                provider=ModelProvider.GEMINI,
                context_length=1000000,  # 1M context window (official)
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=8192,  # 8K max output (official)
                recommended_max_tokens=4096,
                description="Ultra-efficient for simple, high-frequency tasks",
                pricing={"input_tokens": 0.075, "output_tokens": 0.30}
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

        # Validate and clamp max_tokens for Gemini
        # Gemini 2.5+ and 3 Pro support up to 65K output, 2.0/1.5 support 8K
        max_tokens = params.max_tokens
        
        # Model-specific max output token limits (from official Google AI docs December 2025)
        model_limits = {
            # Gemini 3 Pro - 65K max output
            'gemini-3-pro': 65536,
            # Gemini 2.5 series - 65K max output
            'gemini-2.5-pro': 65536,
            'gemini-2.5-flash': 65536,
            'gemini-2.5-flash-lite': 65536,
            # Gemini 2.0 series - 8K max output
            'gemini-2.0-flash': 8192,
            'gemini-2.0-flash-lite': 8192,
            # Gemini 1.5 series - 8K max output
            'gemini-1.5-pro': 8192,
            'gemini-1.5-flash': 8192,
        }
        
        # Find limit for model
        limit = 8192  # default for unknown models
        for model_prefix, model_limit in model_limits.items():
            if model == model_prefix or model.startswith(model_prefix):
                limit = model_limit
                break
        
        if max_tokens is None or max_tokens < 1:
            max_tokens = 8192  # Default
        elif max_tokens > limit:
            self.logger.warning(f"max_tokens clamped from {params.max_tokens} to {limit} for Gemini model {model}")
            max_tokens = limit

        # Clamp temperature for Gemini (0-2 range)
        temperature = params.temperature
        if temperature is None or temperature < 0:
            temperature = 1.0
        elif temperature > 2.0:
            temperature = 2.0

        # Gemini API payload
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
                "topP": params.top_p,
            }
        }
        
        # Check if this model supports thinking/reasoning mode (only Gemini 2.5+ models)
        model_supports_thinking = model.startswith("gemini-2.5") or "2.5" in model
        
        # Inject thinking config INSIDE generationConfig per latest docs - only for supported models
        # Enable thinking if: thinking_budget is set (and not 0), OR include_thoughts is True
        should_enable_thinking = (params.thinking_budget is not None and params.thinking_budget != 0) or params.include_thoughts
        
        if should_enable_thinking and model_supports_thinking:
            thinking_cfg = {}
            if params.thinking_budget is not None:
                thinking_cfg["thinkingBudget"] = params.thinking_budget  # -1 dynamic, 0 off, >0 fixed
            else:
                # If no budget specified but include_thoughts is True, use dynamic budget
                thinking_cfg["thinkingBudget"] = -1  # Dynamic budget
            # Always include thoughts when thinking is enabled so we can show reasoning process
            thinking_cfg["includeThoughts"] = True
            
            payload["generationConfig"]["thinkingConfig"] = thinking_cfg
            self.logger.info(f"[Gemini] thinkingConfig injected for {model}: {thinking_cfg}")
        elif (params.thinking_budget is not None or params.include_thoughts) and not model_supports_thinking:
            # Log warning when thinking mode is requested but not supported
            self.logger.warning(f"[Gemini] Thinking mode requested but not supported by {model}. Only Gemini 2.5+ models support reasoning mode.")
            yield ChatResponse(
                content=" (Note: Reasoning mode is only supported by Gemini 2.5+ models, proceeding with standard generation)",
                done=False,
                meta={
                    "tokens_in": input_tokens,
                    "tokens_out": 0,
                    "provider": ModelProvider.GEMINI,
                    "model": model,
                    "warning": True
                }
            )

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

        # Rate limiting - ensure minimum interval between requests
        now = time.time()
        last_request = GeminiAdapter._last_request_time.get(model, 0)
        time_since_last = now - last_request
        if time_since_last < self._min_request_interval:
            wait_time = self._min_request_interval - time_since_last
            self.logger.info(f"[Gemini] Rate limiting: waiting {wait_time:.1f}s before request to {model}")
            await asyncio.sleep(wait_time)
        GeminiAdapter._last_request_time[model] = time.time()

        try:
            # Use streaming or non-streaming endpoint
            if params.stream:
                url = f"{self.base_url}/v1beta/models/{model}:streamGenerateContent?key={self.api_key}"
            else:
                url = f"{self.base_url}/v1beta/models/{model}:generateContent?key={self.api_key}"
            
            # Log URL for debugging (hide API key)
            safe_url = url.replace(self.api_key, "***API_KEY***") if self.api_key else url
            self.logger.info(f"Making request to: {safe_url}")
            
            # Prepare retry mechanism for thinking config and overload errors
            max_retries = 5  # Increased for better rate limit handling
            for attempt in range(max_retries):
                safe_url = url.replace(self.api_key, "***API_KEY***") if self.api_key else url
                self.logger.info(f"Making request to: {safe_url} (attempt {attempt+1}/{max_retries}) payloadKeys={list(payload.keys())} genKeys={list(payload['generationConfig'].keys())}")
                
                try:
                    async with self.session.post(url, json=payload) as response:
                        # Handle 429 Rate Limit (quota exceeded)
                        if response.status == 429:
                            error_text = await response.text()
                            self.logger.warning(f"[Gemini] Rate limit (429), attempt {attempt+1}/{max_retries}")
                            self.logger.warning(f"[Gemini] 429 Response body: {error_text[:500]}")
                            
                            # Parse retry delay from response - Google tells us exactly how long to wait
                            import re
                            retry_match = re.search(r'"retryDelay":\s*"(\d+)s"', error_text)
                            if retry_match:
                                retry_delay = int(retry_match.group(1))
                            else:
                                # Fallback exponential backoff: 10s, 20s, 40s, 80s, 160s
                                retry_delay = (2 ** attempt) * 10
                            
                            # If Google says wait, we must wait - no shortening
                            if attempt < max_retries - 1 and retry_delay <= 120:  # Only auto-retry if wait is <= 2 minutes
                                self.logger.info(f"[Gemini] Waiting {retry_delay}s before retry (Google specified)...")
                                yield ChatResponse(
                                    content="",
                                    done=False,
                                    meta={
                                        "provider": ModelProvider.GEMINI,
                                        "model": model,
                                        "retry_attempt": attempt + 1,
                                        "warning": True
                                    },
                                    stage_message=f"⏳ Rate limit reached. Waiting {retry_delay}s before retry ({attempt+1}/{max_retries})..."
                                )
                                await asyncio.sleep(retry_delay)
                                continue
                            else:
                                # Suggest alternative model with better rate limits
                                alt_model = "gemini-2.5-flash" if "preview" in model or "3-pro" in model else "gemini-2.0-flash"
                                yield ChatResponse(
                                    error=f"Rate limit exceeded for {model}. Try using '{alt_model}' which has higher rate limits, or wait {retry_delay}s before retrying.",
                                    meta={"provider": ModelProvider.GEMINI, "model": model}
                                )
                                return
                        
                        # Handle 503 Service Unavailable (overloaded model)
                        if response.status == 503:
                            error_text = await response.text()
                            self.logger.warning(f"[Gemini] Model overloaded (503), attempt {attempt+1}/{max_retries}")
                            if attempt < max_retries - 1:
                                # Wait before retry (exponential backoff)
                                wait_time = (2 ** attempt) * 2  # 2s, 4s, 8s
                                self.logger.info(f"[Gemini] Waiting {wait_time}s before retry...")
                                yield ChatResponse(
                                    content=f" (Model overloaded, retrying in {wait_time}s...)",
                                    done=False,
                                    meta={
                                        "provider": ModelProvider.GEMINI,
                                        "model": model,
                                        "retry_attempt": attempt + 1,
                                        "warning": True
                                    }
                                )
                                await asyncio.sleep(wait_time)
                                continue
                            else:
                                # Final attempt failed
                                yield ChatResponse(
                                    error=f"API Error 503: Model is overloaded after {max_retries} attempts. Please try again later or use a different model.",
                                    meta={"provider": ModelProvider.GEMINI, "model": model}
                                )
                                return
                        
                        # Handle 400 errors (thinking config)
                        if response.status == 400:
                            err_txt = await response.text()
                            if attempt == 0 and ("Unknown name \"thinkingConfig\"" in err_txt or "Unknown name \"thinkingBudget\"" in err_txt):
                                # Remove thinkingConfig and retry once
                                if "thinkingConfig" in payload.get("generationConfig", {}):
                                    self.logger.warning("[Gemini] thinkingConfig rejected by API, retrying without it")
                                    del payload["generationConfig"]["thinkingConfig"]
                                    continue
                        
                        # Check for success status
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
                            self.logger.info(f"[Gemini] Non-streaming response keys: {data.keys()}")
                            candidates = data.get("candidates", [])
                            usage_metadata = data.get("usageMetadata", {})
                            # Extract thought token counts if present
                            thoughts_tokens = usage_metadata.get("thoughtTokens") or usage_metadata.get("thought_token_count") or usage_metadata.get("thoughtsTokenCount")
                            thought_budget_used = usage_metadata.get("thinkingTokenCount") or usage_metadata.get("thinking_token_count")
                            
                            if candidates and candidates[0].get("content"):
                                parts = candidates[0]["content"].get("parts", [])
                                
                                # Extract thought and text content from all parts
                                thought_text = ""
                                regular_text = ""
                                for part in parts:
                                    self.logger.info(f"[Gemini] Part keys: {part.keys()}")
                                    if part.get("thought"):
                                        thought_text += part.get("thought", "")
                                    elif part.get("thoughtContent"):
                                        thought_text += part.get("thoughtContent", "")
                                    elif "text" in part:
                                        regular_text += part["text"]
                                
                                tokens_in = usage_metadata.get("promptTokenCount", input_tokens)
                                tokens_out = usage_metadata.get("candidatesTokenCount", self.estimate_tokens(regular_text))
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
                                if thought_text:
                                    meta_extra["reasoning_content"] = thought_text
                                    meta_extra["thought_content"] = thought_text
                                    meta_extra["thinking"] = thought_text
                                    self.logger.info(f"[Gemini] Thought content found: {len(thought_text)} chars")
                                
                                yield ChatResponse(
                                    content=regular_text,
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
                                                
                                                # Log full response structure for debugging
                                                self.logger.info(f"[Gemini Streaming] Full response keys: {json_response.keys()}")
                                                if "modelVersion" in json_response:
                                                    self.logger.info(f"[Gemini] Model version: {json_response.get('modelVersion')}")
                                                
                                                # Check for usageMetadata at top level
                                                usage_data = json_response.get("usageMetadata", {})
                                                if usage_data:
                                                    self.logger.info(f"[Gemini] usageMetadata: {usage_data}")
                                                
                                                # Check for thoughtSummary at response level (Gemini API v1beta)
                                                thought_summary = json_response.get("thoughtSummary") or json_response.get("thought") or json_response.get("thinking")
                                                if thought_summary:
                                                    self.logger.info(f"[Gemini] Found thought at response level: {len(thought_summary)} chars")
                                                    yield ChatResponse(
                                                        content="",
                                                        done=False,
                                                        meta={
                                                            "tokens_in": input_tokens,
                                                            "tokens_out": self.estimate_tokens(accumulated_content),
                                                            "provider": ModelProvider.GEMINI,
                                                            "model": model,
                                                            "thinking": thought_summary,
                                                            "reasoning_content": thought_summary,
                                                            "reasoning": True
                                                        }
                                                    )
                                                
                                                candidates = json_response.get("candidates", [])
                                                
                                                # Log all candidates for debugging
                                                self.logger.info(f"[Gemini Streaming] Number of candidates: {len(candidates)}")
                                                for c_idx, cand in enumerate(candidates):
                                                    self.logger.info(f"[Gemini] Candidate {c_idx}: keys={cand.keys()}")
                                                
                                                if candidates:
                                                    candidate = candidates[0]
                                                    
                                                    # Check for thought/summary at candidate level
                                                    candidate_thought = candidate.get("thoughtSummary") or candidate.get("thought") or candidate.get("thinking")
                                                    if candidate_thought:
                                                        self.logger.info(f"[Gemini] Found thought at candidate level: {len(candidate_thought)} chars")
                                                        yield ChatResponse(
                                                            content="",
                                                            done=False,
                                                            meta={
                                                                "tokens_in": input_tokens,
                                                                "tokens_out": self.estimate_tokens(accumulated_content),
                                                                "provider": ModelProvider.GEMINI,
                                                                "model": model,
                                                                "thinking": candidate_thought,
                                                                "reasoning_content": candidate_thought,
                                                                "reasoning": True
                                                            }
                                                        )
                                                    
                                                    content_part = candidate.get("content", {})
                                                    parts = content_part.get("parts", [])
                                                    
                                                    # Log response structure for debugging
                                                    self.logger.info(f"[Gemini Streaming] Candidate keys: {candidate.keys()}")
                                                    self.logger.info(f"[Gemini Streaming] Parts count: {len(parts)}")
                                                    for idx, part in enumerate(parts):
                                                        self.logger.info(f"[Gemini Streaming] Part {idx} keys: {part.keys()}")
                                                    
                                                    # Process all parts - Gemini may return thought + text separately
                                                    thought_text = ""
                                                    regular_text = ""
                                                    
                                                    for part in parts:
                                                        # Check for thought/thinking content - multiple possible field names
                                                        if part.get("thought"):
                                                            thought_text += part.get("thought", "")
                                                            self.logger.info(f"[Gemini] Found 'thought' field: {len(part.get('thought', ''))} chars")
                                                        elif part.get("thoughtContent"):
                                                            thought_text += part.get("thoughtContent", "")
                                                            self.logger.info(f"[Gemini] Found 'thoughtContent' field: {len(part.get('thoughtContent', ''))} chars")
                                                        elif part.get("thinkingContent"):
                                                            thought_text += part.get("thinkingContent", "")
                                                            self.logger.info(f"[Gemini] Found 'thinkingContent' field: {len(part.get('thinkingContent', ''))} chars")
                                                        elif part.get("reasoning"):
                                                            thought_text += part.get("reasoning", "")
                                                            self.logger.info(f"[Gemini] Found 'reasoning' field: {len(part.get('reasoning', ''))} chars")
                                                        elif "text" in part:
                                                            # Check if this text part has a "role" indicating it's thinking
                                                            part_role = content_part.get("role", "")
                                                            if part_role == "thought" or part_role == "thinking":
                                                                thought_text += part["text"]
                                                                self.logger.info(f"[Gemini] Found thought text via role: {len(part['text'])} chars")
                                                            else:
                                                                regular_text += part["text"]
                                                    
                                                    # If we have thought content, emit it as thinking event
                                                    if thought_text:
                                                        yield ChatResponse(
                                                            content="",
                                                            done=False,
                                                            meta={
                                                                "tokens_in": input_tokens,
                                                                "tokens_out": self.estimate_tokens(accumulated_content),
                                                                "provider": ModelProvider.GEMINI,
                                                                "model": model,
                                                                "thinking": thought_text,
                                                                "reasoning_content": thought_text,
                                                                "reasoning": True
                                                            }
                                                        )
                                                    
                                                    # Emit regular content
                                                    if regular_text:
                                                        accumulated_content += regular_text
                                                        tokens_out = self.estimate_tokens(accumulated_content)
                                                        yield ChatResponse(
                                                            content=regular_text,
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
                        
                        # End of successful attempt - break out of retry loop
                        break

                except aiohttp.ClientError as e:
                    # Network/connection errors
                    self.logger.warning(f"[Gemini] Network error on attempt {attempt+1}/{max_retries}: {e}")
                    if attempt < max_retries - 1:
                        wait_time = (2 ** attempt) * 1
                        await asyncio.sleep(wait_time)
                        continue
                    else:
                        yield ChatResponse(
                            error=f"Network error: {str(e)}",
                            meta={"provider": ModelProvider.GEMINI, "model": model}
                        )
                        return
                        
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
        # Cache for sync access
        self._models = self.supported_models
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