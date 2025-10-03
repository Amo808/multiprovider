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
            # GPT-5 (available in API)
            ModelInfo(
                id="gpt-5",
                name="gpt-5",
                display_name="GPT-5",
                provider=ModelProvider.OPENAI, 
                context_length=400000,  # Official context window
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                pricing={"input_tokens": 1.25, "output_tokens": 10.00},  # Official pricing
                max_output_tokens=128000,  # Official max output
                recommended_max_tokens=64000,  # Recommended for quality
                description="Most advanced GPT model with built-in thinking capabilities"
            ),
            ModelInfo(
                id="gpt-5-mini",
                name="gpt-5-mini",
                display_name="GPT-5 Mini",
                provider=ModelProvider.OPENAI,
                context_length=400000,  # Same as GPT-5
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                pricing={"input_tokens": 0.25, "output_tokens": 2.00},  # Estimated pricing
                max_output_tokens=128000,  # Same as GPT-5
                recommended_max_tokens=32000,  # Recommended for quality
                description="Lightweight version of GPT-5"
            ),
            ModelInfo(
                id="gpt-5-nano",
                name="gpt-5-nano",
                display_name="GPT-5 Nano",
                provider=ModelProvider.OPENAI,
                context_length=400000,  # Same as GPT-5
                supports_streaming=True,
                supports_functions=True,
                supports_vision=False,
                type=ModelType.CHAT,
                pricing={"input_tokens": 0.05, "output_tokens": 0.40},  # Estimated pricing
                max_output_tokens=64000,  # Smaller max output
                recommended_max_tokens=16000,  # Recommended for quality
                description="Most efficient version of GPT-5"
            ),
            # o1 Series - Reasoning Models
            ModelInfo(
                id="o1-preview",
                name="o1-preview",
                display_name="o1 Preview",
                provider=ModelProvider.OPENAI,
                context_length=128000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=False,
                type=ModelType.CHAT,
                pricing={"input_tokens": 15.00, "output_tokens": 60.00},
                max_output_tokens=32768,
                recommended_max_tokens=16384,
                description="Preview version of o1 reasoning model"
            ),
            ModelInfo(
                id="o1-mini",
                name="o1-mini",
                display_name="o1-mini",
                provider=ModelProvider.OPENAI,
                context_length=128000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=False,
                type=ModelType.CHAT,
                pricing={"input_tokens": 3.00, "output_tokens": 12.00},
                max_output_tokens=65536,
                recommended_max_tokens=32768,
                description="Lightweight version of o1 reasoning model"
            ),
            ModelInfo(
                id="o1-pro",
                name="o1-pro", 
                display_name="o1 Pro Mode",
                provider=ModelProvider.OPENAI,
                context_length=128000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=False,
                type=ModelType.CHAT,
                pricing={"input_tokens": 30.00, "output_tokens": 120.00},
                max_output_tokens=65536,
                recommended_max_tokens=32768,
                description="o1 with extended compute for the most reliable responses - Pro exclusive"
            ),
            # o3 Series
            ModelInfo(
                id="o3-mini",
                name="o3-mini",
                display_name="o3-mini",
                provider=ModelProvider.OPENAI,
                context_length=128000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=False,
                type=ModelType.CHAT,
                pricing={"input_tokens": 1.00, "output_tokens": 4.00},
                max_output_tokens=65536,
                recommended_max_tokens=32768,
                description="Fast reasoning model with optimized performance"
            ),
            ModelInfo(
                id="o3-deep-research",
                name="o3-deep-research",
                display_name="o3 Deep Research",
                provider=ModelProvider.OPENAI,
                context_length=200000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                pricing={"input_tokens": 50.00, "output_tokens": 200.00},
                max_output_tokens=65536,
                recommended_max_tokens=32768,
                description="o3 optimized for web browsing and multi-step research tasks"
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
                recommended_max_tokens=32768,  # Recommended for reasoning tasks
                description="Lightweight version of o4 reasoning model"
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
        
        # EARLY DEBUGGING: Log entry point
        total_input_length = sum(len(msg.content) for msg in messages)
        self.logger.info(f"🔍 [ENTRY] {model} generate called - input_length={total_input_length:,} chars")

        # Check if this is a reasoning model (o1, o3, o4 series)
        is_reasoning_model = any(model.startswith(prefix) for prefix in ['o1', 'o3', 'o4'])
        is_gpt5 = model.startswith('gpt-5')
        
        # EARLY WARNING for large texts - especially important for GPT-5
        if is_gpt5 and total_input_length > 30000:
            self.logger.warning(f"⚠️ [GPT-5] Large input detected: {total_input_length:,} chars - may take several minutes")
            yield ChatResponse(
                content="",
                done=False,
                meta={
                    "provider": ModelProvider.OPENAI,
                    "model": model,
                    "input_length": total_input_length,
                    "large_input": True
                },
                stage_message=f"⚠️ Large text ({total_input_length:,} chars). Processing may take 3-5 minutes. Please wait..."
            )

        payload = {
            "model": model,
            "messages": api_messages,
            "stream": params.stream,
            "temperature": params.temperature,
            "top_p": params.top_p,
            "frequency_penalty": params.frequency_penalty,
            "presence_penalty": params.presence_penalty,
        }
        # --- NEW GPT-5 PARAM HANDLING ---
        if model.startswith('gpt-5'):
            # Verbosity maps to text.verbosity (Responses API) but for chat we include hint under extensions
            if params.verbosity in {"low", "medium", "high"}:
                payload.setdefault("text", {})["verbosity"] = params.verbosity
            # Reasoning effort -> reasoning.effort
            if params.reasoning_effort in {"minimal", "medium", "high"}:
                payload.setdefault("reasoning", {})["effort"] = params.reasoning_effort
            # NOTE: cfg_scale & grammar via 'guidance' are temporarily disabled (API 400: Unknown parameter 'guidance')
            # If/when OpenAI re-enables guidance, reintroduce these fields guarded by capability check.
            # if isinstance(params.cfg_scale, (int, float)):
            #     payload.setdefault("guidance", {})["cfg_scale"] = params.cfg_scale
            if params.free_tool_calling and params.tools:
                # Expect tools already in correct schema from frontend
                payload["tools"] = params.tools
            elif params.tools:
                payload["tools"] = params.tools
            # if params.grammar_definition:
            #     payload.setdefault("guidance", {})["grammar"] = {
            #         "syntax": "lark",  # default assumption
            #         "definition": params.grammar_definition[:50000]
            #     }
        # --- END NEW PARAM HANDLING ---

        # Use correct token parameter based on model
        # New OpenAI models use max_completion_tokens, legacy models use max_tokens
        if (is_reasoning_model or 
            model in ['gpt-4o', 'gpt-4o-mini', 'gpt-5', 'o1-preview', 'o1-mini', 'o3-mini', 'o4-mini'] or
            model.startswith('gpt-4o') or model.startswith('gpt-5') or 
            model.startswith('o1-') or model.startswith('o3-') or model.startswith('o4-')):
            payload["max_completion_tokens"] = params.max_tokens
        else:
            payload["max_tokens"] = params.max_tokens

        # Reasoning models have different parameters
        if is_reasoning_model:
            # o1/o3 models don't support some parameters
            payload.pop("frequency_penalty", None)
            payload.pop("presence_penalty", None)
            payload.pop("top_p", None)
            # Temperature is often fixed for reasoning models
            if model.startswith('o1') or model.startswith('o3'):
                payload["temperature"] = 1.0  # Fixed for reasoning models

        if params.stop_sequences:
            payload["stop"] = params.stop_sequences

        # --- GPT-5 ADVANCED FEATURE HANDLING (Responses API switch & tool/grammar injection) ---
        use_responses_api = False
        if model.startswith('gpt-5'):
            # Decide switch if any advanced feature requested
            advanced_trigger = any([
                params.free_tool_calling,
                params.tools,
                params.grammar_definition,
                params.verbosity,
                params.reasoning_effort,
            ])
            if advanced_trigger:
                use_responses_api = True

        # Inject grammar as tool if grammar_definition present and using responses
        grammar_tool = None
        if params.grammar_definition:
            grammar_tool = {
                "type": "custom",
                "name": "grammar_constraint",
                "description": "Grammar constrained output",
                "format": {
                    "type": "grammar",
                    "syntax": "lark",
                    "definition": params.grammar_definition[:50000]
                }
            }
        # Prepare tools list if using responses endpoint
        responses_tools = []
        if use_responses_api:
            if params.tools:
                responses_tools.extend(params.tools)
            if grammar_tool:
                responses_tools.append(grammar_tool)
            # If free tool calling requested but no tools supplied, create a placeholder custom tool
            if params.free_tool_calling and not any(t.get('type') == 'custom' for t in responses_tools):
                responses_tools.append({
                    "type": "custom",
                    "name": "code_exec",
                    "description": "Executes arbitrary code (placeholder - server will NOT execute)."
                })
        # --- END ADVANCED FEATURE HANDLING ---

        # 🔍 Deep Research Mode for o3 model
        is_deep_research = False
        
        # Activate Deep Research for o3 model based on query complexity or length
        if model == "o3" and messages:
            last_message = messages[-1].content
            
            # Auto-detect if Deep Research is needed based on:
            # 1. Query length (complex queries are usually longer)
            # 2. Question indicators (what, how, why, analyze, etc.)
            # 3. Request for detailed information
            should_use_deep_research = (
                len(last_message) > 50 or  # Longer queries
                any(indicator in last_message.lower() for indicator in [
                    'почему', 'как', 'что такое', 'объясни', 'расскажи', 
                    'why', 'how', 'what is', 'explain', 'tell me',
                    'analyze', 'compare', 'research', 'study',
                    'анализ', 'сравнение', 'исследование', 'изучение'
                ]) or
                '?' in last_message  # Questions usually benefit from deep research
            )
            
            if should_use_deep_research:
                is_deep_research = True
                self.logger.info("🔍 DEEP RESEARCH ACTIVATED - detected complex query")
                yield ChatResponse(
                    content="",  # No content for stage events
                    done=False,
                    meta={
                        "provider": ModelProvider.OPENAI,
                        "model": model,
                        "deep_research": True,
                        "stage": "initialization"
                    },
                    stage_message="🔍 **Deep Research Mode** - Analyzing your query..."
                )
                
                # Show research progress stages
                research_stages = [
                    "🔍 Understanding your question...",
                    "🧠 Processing available knowledge...",
                    "� Analyzing relevant information...",
                    "📝 Preparing comprehensive response...",
                ]
                
                for i, stage in enumerate(research_stages):
                    yield ChatResponse(
                        content="",  # No content for stage events
                        done=False,
                        meta={
                            "provider": ModelProvider.OPENAI,
                            "model": model,
                            "deep_research": True,
                            "stage": f"research_{i+1}",
                            "progress": (i+1) / len(research_stages)
                        },
                        stage_message=stage
                    )
                    await asyncio.sleep(1.5)  # Shorter delay for better UX

        self.logger.info(f"Sending request to OpenAI API: {model}, temp={params.temperature}")

        accumulated_content = ""
        output_tokens = 0
        collected_tool_calls = []  # For responses endpoint tool calls
        current_partial_calls = {}  # call_id -> accumulating input

        try:
            # Use different endpoint for special models
            uses_responses_endpoint = model in ['o1-pro', 'o3-deep-research'] or use_responses_api
            
            if uses_responses_endpoint:
                url = f"{self.base_url}/responses"
                self.logger.info(f"Using /responses endpoint for model: {model}")
                responses_payload = {
                    "model": model,
                    "input": api_messages,
                    "stream": params.stream,
                }
                # Add advanced fields
                if params.verbosity in {"low", "medium", "high"}:
                    responses_payload.setdefault("text", {})["verbosity"] = params.verbosity
                if params.reasoning_effort in {"minimal", "medium", "high"}:
                    responses_payload.setdefault("reasoning", {})["effort"] = params.reasoning_effort
                if responses_tools:
                    responses_payload["tools"] = responses_tools
                # Auto-inject required tool for deep research model to avoid 400 error
                if model == 'o3-deep-research':
                    required_types = {"web_search_preview", "file_search", "mcp"}
                    existing_types = {t.get('type') for t in responses_payload.get('tools', [])}
                    if not existing_types.intersection(required_types):
                        self.logger.info("Auto-injecting web_search_preview tool for o3-deep-research model")
                        responses_payload.setdefault("tools", []).append({
                            "type": "web_search_preview",
                            "name": "web_search_preview",
                            "description": "Auto-injected web search tool (no user tool provided)."
                        })
                # Temporarily disable guidance block (cfg_scale / grammar) due to API 400 errors
                # if params.cfg_scale is not None:
                #     responses_payload.setdefault("guidance", {})["cfg_scale"] = params.cfg_scale
                if params.max_tokens:
                    responses_payload["max_output_tokens"] = params.max_tokens
                if params.stop_sequences:
                    responses_payload["stop"] = params.stop_sequences
                payload = responses_payload
            else:
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
                    data = await response.json()
                    if uses_responses_endpoint:
                        # Extract text from responses format
                        full_text = ""
                        tool_calls_out = []
                        for item in data.get("output", []):
                            if item.get("type") == "message":
                                for c in item.get("content", []):
                                    if c.get("type") == "output_text":
                                        full_text += c.get("text", "")
                            elif item.get("type") == "custom_tool_call":
                                tool_calls_out.append({
                                    "name": item.get("name"),
                                    "call_id": item.get("call_id"),
                                    "input": item.get("input")
                                })
                        usage = data.get("usage", {})
                        yield ChatResponse(
                            content=full_text,
                            id=data.get("id"),
                            done=True,
                            meta={
                                "tokens_in": usage.get("input_tokens", input_tokens),
                                "tokens_out": usage.get("output_tokens", self.estimate_tokens(full_text)),
                                "provider": ModelProvider.OPENAI,
                                "model": model,
                                "tool_calls": tool_calls_out
                            }
                        )
                        return
                    # Handle non-streaming response
                    data = await response.json()
                    
                    if uses_responses_endpoint:
                        # Handle responses endpoint format
                        content = data.get("response", "")  # Different field name
                        usage = data.get("usage", {})
                    else:
                        # Handle chat/completions endpoint format
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
                start_time = asyncio.get_event_loop().time()
                last_heartbeat = start_time
                heartbeat_interval = 10  # Send heartbeat every 10 seconds
                first_content_chunk = True
                
                # Enhanced monitoring for GPT-5
                if is_gpt5:
                    hang_detected = False
                    response_received = False
                    
                    # Background monitoring task for GPT-5
                    async def background_monitoring():
                        """Background task for monitoring and timeout detection"""
                        nonlocal hang_detected, response_received
                        check_interval = 15  # Check every 15 seconds
                        await asyncio.sleep(check_interval)
                        
                        while not response_received and not hang_detected:
                            elapsed = asyncio.get_event_loop().time() - start_time
                            self.logger.info(f"🔍 [GPT-5] Monitor: {elapsed:.1f}s elapsed, response_received={response_received}")
                            
                            # 3-minute timeout for safety
                            if elapsed > 180:  # After 3 minutes
                                self.logger.error(f"🚨 [GPT-5] Timeout after {elapsed:.1f}s")
                                hang_detected = True
                                return
                            
                            await asyncio.sleep(check_interval)
                    
                    # Start monitoring in background
                    monitor_task = asyncio.create_task(background_monitoring())
                
                # Send streaming_ready signal for GPT-5
                if is_gpt5:
                    self.logger.info(f"🔍 [GPT-5] Sending immediate status update - streaming ready")
                    yield ChatResponse(
                        content="",
                        done=False,
                        streaming_ready=True,
                        meta={
                            "provider": ModelProvider.OPENAI,
                            "model": model,
                            "stage": "streaming_started",
                            "timestamp": start_time
                        },
                        stage_message="🔄 GPT-5 is generating response..."
                    )
                
                async for line in response.content:
                    current_time = asyncio.get_event_loop().time()
                    
                    # Mark response as received for GPT-5 monitoring
                    if is_gpt5 and not response_received:
                        response_received = True
                        monitor_task.cancel()  # Cancel monitoring task
                        
                        # Check if hang was detected during wait
                        if hang_detected:
                            self.logger.error(f"🚨 [GPT-5] Request was marked as hung, aborting")
                            yield ChatResponse(
                                content="❌ Request timeout - GPT-5 took too long to respond. This may be due to high server load. Please try again.",
                                done=True,
                                error=True,
                                meta={
                                    "provider": ModelProvider.OPENAI,
                                    "model": model,
                                    "timeout": True
                                }
                            )
                            return
                    
                    # Send periodic heartbeat for GPT-5 to prevent timeout
                    if is_gpt5 and current_time - last_heartbeat > heartbeat_interval:
                        self.logger.info(f"🔍 [GPT-5] Sending heartbeat after {current_time - last_heartbeat:.1f}s")
                        yield ChatResponse(
                            content="",
                            done=False,
                            heartbeat="GPT-5 processing... connection active",
                            meta={
                                "provider": ModelProvider.OPENAI,
                                "model": model,
                                "elapsed_time": current_time - start_time,
                                "timestamp": current_time
                            },
                            stage_message="⏳ GPT-5 is still processing... (connection active)"
                        )
                        last_heartbeat = current_time
                    
                    line = line.decode('utf-8').strip()
                    self.logger.debug(f"🔍 [OpenAI] Received line: {line[:100]}...")  # Log first 100 chars
                    
                    if not line or line == "data: [DONE]":
                        continue
                        
                    if line.startswith("data: "):
                        try:
                            json_data = json.loads(line[6:])
                            
                            if uses_responses_endpoint:
                                # Handle responses endpoint streaming format
                                content = json_data.get("delta", "")
                                if not content:
                                    continue
                            else:
                                # Handle chat/completions endpoint streaming format
                                choices = json_data.get("choices", [])
                                
                                if not choices:
                                    continue
                                    
                                choice = choices[0]
                                delta = choice.get("delta", {})
                                content = delta.get("content", "")
                                
                                # Handle reasoning models' thinking process
                                thinking = delta.get("reasoning", "")  # o1/o3 models may have reasoning field
                                
                                # For reasoning models, show thinking process
                                if is_reasoning_model and thinking:
                                    yield ChatResponse(
                                        content=f"🤔 **{model} is analyzing...**\n*Advanced reasoning in progress...*",
                                        id=json_data.get("id"),
                                        done=False,
                                        meta={
                                            "tokens_in": input_tokens,
                                            "tokens_out": 0,
                                            "provider": ModelProvider.OPENAI,
                                            "model": model,
                                            "reasoning": True,
                                            "status": "thinking"
                                        }
                                    )
                            
                            if content:
                                # Send first_content signal for GPT-5 on first chunk
                                if is_gpt5 and first_content_chunk:
                                    self.logger.info(f"🔍 [GPT-5] First content chunk received - confirming generation")
                                    yield ChatResponse(
                                        content="",
                                        done=False,
                                        first_content=True,
                                        meta={
                                            "provider": ModelProvider.OPENAI,
                                            "model": model
                                        },
                                        stage_message="✨ GPT-5 generation in progress..."
                                    )
                                    first_content_chunk = False
                                
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
                                        "model": model,
                                        "reasoning": is_reasoning_model,
                                        "status": "streaming" if not is_reasoning_model else "reasoning_output"
                                    }
                                )
                            
                            # Check if finished
                            if uses_responses_endpoint:
                                # For responses endpoint, check for done field
                                if json_data.get("done", False):
                                    break
                            else:
                                # For chat/completions endpoint, check finish_reason
                                if choice.get("finish_reason"):
                                    break
                                
                        except json.JSONDecodeError as e:
                            self.logger.warning(f"🔍 [OpenAI] JSON decode error: {e}")
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

        # Final response (only for chat/completions path) remains unchanged
        final_output_tokens = self.estimate_tokens(accumulated_content) if accumulated_content else output_tokens
        final_meta = {
            "tokens_in": input_tokens,
            "tokens_out": final_output_tokens,
            "total_tokens": input_tokens + final_output_tokens,
            "provider": ModelProvider.OPENAI,
            "model": model,
            "estimated_cost": self._calculate_cost(input_tokens, final_output_tokens, model)
        }
        if is_gpt5:
            final_meta["openai_completion"] = True
        yield ChatResponse(content="", done=True, meta=final_meta)

    def _calculate_cost(self, input_tokens: int, output_tokens: int, model: str) -> float:
        """Calculate estimated cost based on model pricing"""
        # Find pricing for this model
        model_pricing = None
        for model_info in self.supported_models:
            if model_info.id == model:
                model_pricing = model_info.pricing
                break
        
        if not model_pricing:
            # Fallback pricing for unknown models
            model_pricing = {"input_tokens": 2.50, "output_tokens": 10.00}
            
        # Calculate cost per million tokens
        input_cost_per_million = model_pricing["input_tokens"]
        output_cost_per_million = model_pricing["output_tokens"]
        
        input_cost = (input_tokens / 1_000_000) * input_cost_per_million
        output_cost = (output_tokens / 1_000_000) * output_cost_per_million
        
        return round(input_cost + output_cost, 6)

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
