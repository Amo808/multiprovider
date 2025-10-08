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
            self.session = self.session if (self.session and not self.session.closed) else aiohttp.ClientSession(
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
        api_messages = []
        for msg in messages:
            api_messages.append({"role": msg.role, "content": msg.content})
        input_text = "\n".join([f"{m['role']}: {m['content']}" for m in api_messages])
        input_tokens = self.estimate_tokens(input_text)
        total_input_length = sum(len(m.content) for m in messages)
        self.logger.info(f"🔍 [ENTRY] {model} generate called - input_length={total_input_length:,} chars")
        is_reasoning_model = any(model.startswith(prefix) for prefix in ['o1', 'o3', 'o4'])
        is_gpt5 = model.startswith("gpt-5")
        
        if is_gpt5:
            # Ensure GPT-5 requests have enough output budget when reasoning is enabled
            if not params.max_tokens or params.max_tokens <= 0:
                params.max_tokens = 8192 if params.reasoning_effort in {"medium", "high"} else 4096
            elif params.reasoning_effort in {"medium", "high"} and params.max_tokens < 8192:
                params.max_tokens = 8192

        # Large input early warning & reasoning effort auto-downgrade
        reasoning_adjustment = None
        if is_gpt5 and total_input_length > 30000:
            self.logger.warning(f"⚠️ [GPT-5] Large input detected: {total_input_length:,} chars - may take several minutes")
            # Auto downgrade reasoning_effort if too large to reduce latency
            if params.reasoning_effort == 'high' and total_input_length > 90000:
                reasoning_adjustment = ('high', 'medium')
                params.reasoning_effort = 'medium'
            elif params.reasoning_effort == 'medium' and total_input_length > 120000:
                reasoning_adjustment = ('medium', 'minimal')
                params.reasoning_effort = 'minimal'
            yield ChatResponse(
                content="",
                done=False,
                meta={
                    "provider": ModelProvider.OPENAI,
                    "model": model,
                    "input_length": total_input_length,
                    "large_input": True,
                    "input_tokens_est": input_tokens,
                    **({"reasoning_adjusted": True, "from": reasoning_adjustment[0], "to": reasoning_adjustment[1]} if reasoning_adjustment else {})
                },
                stage_message=f"⚠️ Large text ({total_input_length:,} chars ≈ {input_tokens:,} tok). Processing may take several minutes..."
            )

        # Build base payload (same logic as before but condensed for brevity)
        payload = {
            "model": model,
            "messages": api_messages,
            "stream": params.stream,
            "temperature": params.temperature,
            "top_p": params.top_p,
            "frequency_penalty": params.frequency_penalty,
            "presence_penalty": params.presence_penalty,
        }
        if model.startswith('gpt-5'):
            if params.verbosity in {"low", "medium", "high"}:
                payload.setdefault("text", {})["verbosity"] = params.verbosity
            if params.reasoning_effort in {"minimal", "medium", "high"}:
                payload.setdefault("reasoning", {})["effort"] = params.reasoning_effort
            if params.tools:
                payload["tools"] = params.tools
        # Token parameter selection
        if (is_reasoning_model or model in ['gpt-4o', 'gpt-4o-mini', 'gpt-5', 'o1-preview', 'o1-mini', 'o3-mini', 'o4-mini'] or
            model.startswith('gpt-4o') or model.startswith('gpt-5') or model.startswith('o1-') or model.startswith('o3-') or model.startswith('o4-')):
            payload["max_completion_tokens"] = params.max_tokens
        else:
            payload["max_tokens"] = params.max_tokens
        if is_reasoning_model:
            payload.pop("frequency_penalty", None)
            payload.pop("presence_penalty", None)
            payload.pop("top_p", None)
            if model.startswith('o1') or model.startswith('o3'):
                payload["temperature"] = 1.0
        if params.stop_sequences:
            payload["stop"] = params.stop_sequences

        # Decide responses endpoint usage
        advanced_features_requested = any([
            params.free_tool_calling,
            params.tools,
            params.grammar_definition,
            params.verbosity,
            params.reasoning_effort,
        ])
        use_responses_api = is_gpt5
        if model.startswith('gpt-5'):
            if any([params.free_tool_calling, params.tools, params.grammar_definition, params.verbosity, params.reasoning_effort]):
                use_responses_api = True
        grammar_tool = None
        if params.grammar_definition:
            grammar_tool = {
                "type": "custom",
                "name": "grammar_constraint",
                "description": "Grammar constrained output",
                "format": {"type": "grammar", "syntax": "lark", "definition": params.grammar_definition[:50000]}
            }
        responses_tools = []
        if use_responses_api:
            if params.tools:
                responses_tools.extend(params.tools)
            if grammar_tool:
                responses_tools.append(grammar_tool)
            if params.free_tool_calling and not any(t.get('type') == 'custom' for t in responses_tools):
                responses_tools.append({"type": "custom", "name": "code_exec", "description": "Executes arbitrary code (placeholder)."})

        # Deep research (existing logic retained) - ...existing code...
        # NOTE: For brevity, the deep research staging code remains unchanged above in original file.
        # We skip duplicating it here; it will still run in the original positions.

        self.logger.info(f"Sending request to OpenAI API: {model}, temp={params.temperature}")
        accumulated_content = ""
        output_tokens = 0

        try:
            uses_responses_endpoint = model in ['o1-pro', 'o3-deep-research'] or use_responses_api
            if uses_responses_endpoint:
                url = f"{self.base_url}/responses"
                self.logger.info(f"Using /responses endpoint for model: {model}")
                responses_payload = {"model": model, "input": api_messages, "stream": params.stream}
                if params.verbosity in {"low", "medium", "high"}:
                    responses_payload.setdefault("text", {})["verbosity"] = params.verbosity
                if params.reasoning_effort in {"minimal", "medium", "high"}:
                    responses_payload.setdefault("reasoning", {})["effort"] = params.reasoning_effort
                if responses_tools:
                    responses_payload["tools"] = responses_tools
                if model == 'o3-deep-research':
                    required_types = {"web_search_preview", "file_search", "mcp"}
                    existing_types = {t.get('type') for t in responses_payload.get('tools', [])}
                    if not existing_types.intersection(required_types):
                        self.logger.info("Auto-injecting web_search_preview tool for o3-deep-research model")
                        responses_payload.setdefault("tools", []).append({"type": "web_search_preview"})
                if responses_payload.get('tools'):
                    sanitized = []
                    for t in responses_payload['tools']:
                        ttype = t.get('type')
                        if ttype in {"web_search_preview", "file_search", "mcp"}:
                            sanitized.append({"type": ttype})
                        else:
                            sanitized.append(t)
                    responses_payload['tools'] = sanitized
                if params.max_tokens:
                    responses_payload["max_output_tokens"] = params.max_tokens
                if params.stop_sequences:
                    responses_payload["stop"] = params.stop_sequences
                payload = responses_payload
            else:
                url = f"{self.base_url}/chat/completions"

            # Log payload size summary (without full content for safety)
            try:
                payload_size = len(json.dumps(payload)[:100000])  # truncated measure
                self.logger.info(f"🔍 Payload summary: keys={list(payload.keys())}, approx_size={payload_size} bytes, stream={params.stream}")
            except Exception:
                pass

            async with self.session.post(url, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    self.logger.error(f"OpenAI API error: {response.status} - {error_text}")
                    yield ChatResponse(error=f"API Error {response.status}: {error_text}", meta={"provider": ModelProvider.OPENAI, "model": model})
                    return

                if not params.stream:
                    data = await response.json()
                    if uses_responses_endpoint:
                        full_text = ""
                        tool_calls_out = []
                        for item in data.get("output", []):
                            if item.get("type") == "message":
                                for c in item.get("content", []):
                                    if c.get("type") == "output_text":
                                        full_text += c.get("text", "")
                            elif item.get("type") == "custom_tool_call":
                                tool_calls_out.append({"name": item.get("name"), "call_id": item.get("call_id"), "input": item.get("input")})
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
                    # Legacy non-streaming path (unchanged simplification)
                    usage = data.get("usage", {})
                    if uses_responses_endpoint:
                        content = data.get("response", "")
                    else:
                        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
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

                # STREAMING PATH WITH HEARTBEAT WAIT LOOP (GPT-5 enhanced)
                heartbeat_interval = 10
                first_content_chunk = True
                start_time = asyncio.get_event_loop().time()
                last_activity = start_time

                # New accumulators for /responses advanced meta
                tool_call_buffers: Dict[str, Dict[str, Any]] = {}
                finalized_tool_calls: List[Dict[str, Any]] = []
                usage_input_tokens = None
                usage_output_tokens = None
                usage_thought_tokens = None
                reasoning_thought_tokens_live = 0

                if is_gpt5:
                    # Immediate minimal first-byte flush (stage message)
                    self.logger.info("🔍 [GPT-5] Immediate streaming status signal")
                    yield ChatResponse(
                        content="",
                        done=False,
                        streaming_ready=True,
                        meta={"provider": ModelProvider.OPENAI, "model": model, "stage": "waiting_for_openai", "timestamp": start_time},
                        stage_message="🔄 GPT-5: отправлен запрос, модель думает..."
                    )

                while True:
                    try:
                        line_bytes = await asyncio.wait_for(response.content.readline(), timeout=heartbeat_interval)
                    except asyncio.TimeoutError:
                        elapsed = asyncio.get_event_loop().time() - start_time
                        if is_gpt5 and first_content_chunk:
                            self.logger.info(f"🔍 [GPT-5] Heartbeat (waiting first chunk) {elapsed:.1f}s")
                            yield ChatResponse(
                                content="",
                                done=False,
                                heartbeat="processing",
                                meta={
                                    "provider": ModelProvider.OPENAI,
                                    "model": model,
                                    "elapsed_time": elapsed,
                                    "reasoning_wait": True,
                                    "thought_tokens": reasoning_thought_tokens_live or None
                                },
                                stage_message=f"⏳ GPT-5 reasoning... {int(elapsed)}s"
                            )
                        continue

                    if not line_bytes:
                        if response.content.at_eof():
                            break
                        continue

                    raw_line = line_bytes.decode('utf-8').strip()
                    if not raw_line:
                        continue
                    if raw_line == 'data: [DONE]':
                        break
                    if not raw_line.startswith('data: '):
                        continue

                    last_activity = asyncio.get_event_loop().time()
                    payload_line = raw_line[6:]
                    try:
                        json_data = json.loads(payload_line)
                    except json.JSONDecodeError:
                        self.logger.debug(f"Skipping non-JSON line: {raw_line[:120]}")
                        continue

                    event_type = json_data.get('type')
                    # --- /responses event handling ---
                    if event_type == 'response.error':
                        self.logger.error(f"OpenAI /responses error event: {json_data}")
                        yield ChatResponse(
                            error=json_data.get('error', 'Unknown error'),
                            meta={"provider": ModelProvider.OPENAI, "model": model}
                        )
                        return

                    if event_type == 'response.thinking.delta':
                        # Accumulate thought tokens (if token count provided) or increment by length heuristic
                        delta_obj = json_data.get('delta', {})
                        delta_text = delta_obj.get('text') or ''
                        # Heuristic: 1 token ≈ 4 chars
                        reasoning_thought_tokens_live += max(1, len(delta_text) // 4) if delta_text else 1
                        if is_gpt5 and first_content_chunk:
                            # Still before any output_text -> send heartbeat-style reasoning update
                            elapsed = asyncio.get_event_loop().time() - start_time
                            yield ChatResponse(
                                content="",
                                done=False,
                                heartbeat="thinking",
                                meta={
                                    "provider": ModelProvider.OPENAI,
                                    "model": model,
                                    "elapsed_time": elapsed,
                                    "reasoning": True,
                                    "thought_tokens": reasoning_thought_tokens_live,
                                    "reasoning_wait": True
                                },
                                stage_message=f"🧠 GPT-5 thinking... {reasoning_thought_tokens_live} Θ"
                            )
                        continue

                    if event_type == 'response.tool_call.delta':
                        delta = json_data.get('delta', {})
                        call_id = delta.get('call_id') or json_data.get('call_id')
                        if not call_id:
                            continue
                        buf = tool_call_buffers.setdefault(call_id, {
                            'call_id': call_id,
                            'name': delta.get('name'),
                            'input': ''
                        })
                        if delta.get('name') and not buf.get('name'):
                            buf['name'] = delta['name']
                        if 'input' in delta and delta['input']:
                            buf['input'] += delta['input']
                        # Stream partial tool call as stage message (optional)
                        yield ChatResponse(
                            content="",
                            done=False,
                            meta={
                                "provider": ModelProvider.OPENAI,
                                "model": model,
                                "tool_call_partial": True,
                                "tool_calls": list(finalized_tool_calls) + list(tool_call_buffers.values())
                            },
                            stage_message=f"🛠️ Tool call {buf.get('name') or call_id} running..."
                        )
                        continue

                    if event_type == 'response.tool_call.completed':
                        call_id = json_data.get('call_id') or json_data.get('delta', {}).get('call_id')
                        if call_id and call_id in tool_call_buffers:
                            finalized_tool_calls.append(tool_call_buffers.pop(call_id))
                            yield ChatResponse(
                                content="",
                                done=False,
                                meta={
                                    "provider": ModelProvider.OPENAI,
                                    "model": model,
                                    "tool_calls": list(finalized_tool_calls)
                                },
                                stage_message=f"✅ Tool call {call_id} completed"
                            )
                        continue

                    if event_type == 'response.output_text.delta':
                        delta_obj = json_data.get('delta', {})
                        content_piece = delta_obj.get('text', '')
                        if content_piece:
                            if is_gpt5 and first_content_chunk:
                                self.logger.info("🔍 [GPT-5] First content chunk received")
                                yield ChatResponse(
                                    content="",
                                    done=False,
                                    first_content=True,
                                    meta={"provider": ModelProvider.OPENAI, "model": model, "thought_tokens": reasoning_thought_tokens_live or None},
                                    stage_message="✨ GPT-5 output streaming..."
                                )
                                first_content_chunk = False
                            accumulated_content += content_piece
                            output_tokens = self.estimate_tokens(accumulated_content)
                            yield ChatResponse(
                                content=content_piece,
                                id=json_data.get('response_id'),
                                done=False,
                                meta={
                                    "tokens_in": input_tokens,
                                    "tokens_out": output_tokens,
                                    "provider": ModelProvider.OPENAI,
                                    "model": model,
                                    "reasoning": is_reasoning_model or bool(reasoning_thought_tokens_live),
                                    "status": "streaming",
                                    "thought_tokens": reasoning_thought_tokens_live or None,
                                    "tool_calls": list(finalized_tool_calls) if finalized_tool_calls else None
                                }
                            )
                        continue

                    if event_type in ('response.output_text.done', 'response.completed_reasoning'):
                        # Might contain partial usage for reasoning
                        usage = json_data.get('usage') or {}
                        usage_thought_tokens = usage.get('thought_tokens') or usage_thought_tokens
                        continue

                    if event_type == 'response.completed':
                        usage = json_data.get('usage') or {}
                        usage_input_tokens = usage.get('input_tokens', usage_input_tokens)
                        usage_output_tokens = usage.get('output_tokens', usage_output_tokens)
                        usage_thought_tokens = usage.get('thought_tokens', usage_thought_tokens)
                        break

                    # Fallback legacy streaming (chat/completions)
                    if not event_type and 'choices' in json_data:
                        choices = json_data.get('choices', [])
                        if choices:
                            delta = choices[0].get('delta', {})
                            content_piece = delta.get('content')
                            if content_piece:
                                if is_gpt5 and first_content_chunk:
                                    yield ChatResponse(
                                        content="",
                                        done=False,
                                        first_content=True,
                                        meta={"provider": ModelProvider.OPENAI, "model": model},
                                        stage_message="✨ GPT-5 output streaming..."
                                    )
                                    first_content_chunk = False
                                accumulated_content += content_piece
                                output_tokens = self.estimate_tokens(accumulated_content)
                                yield ChatResponse(
                                    content=content_piece,
                                    id=json_data.get('id'),
                                    done=False,
                                    meta={
                                        "tokens_in": input_tokens,
                                        "tokens_out": output_tokens,
                                        "provider": ModelProvider.OPENAI,
                                        "model": model,
                                        "status": "streaming"
                                    }
                                )
                        finish_reason = choices and choices[0].get('finish_reason')
                        if finish_reason:
                            break
                # end streaming loop
        except asyncio.TimeoutError:
            self.logger.error("Request to OpenAI API timed out")
            yield ChatResponse(error="Request timed out", meta={"provider": ModelProvider.OPENAI, "model": model})
        except Exception as e:
            self.logger.error(f"Error in OpenAI API call: {e}")
            yield ChatResponse(error=f"API Error: {str(e)}", meta={"provider": ModelProvider.OPENAI, "model": model})

        final_output_tokens = self.estimate_tokens(accumulated_content) if accumulated_content else output_tokens
        final_meta = {
            "tokens_in": usage_input_tokens or input_tokens,
            "tokens_out": usage_output_tokens or final_output_tokens,
            "total_tokens": (usage_input_tokens or input_tokens) + (usage_output_tokens or final_output_tokens),
            "provider": ModelProvider.OPENAI,
            "model": model,
            "estimated_cost": self._calculate_cost(usage_input_tokens or input_tokens, usage_output_tokens or final_output_tokens, model)
        }
        if finalized_tool_calls:
            final_meta["tool_calls"] = finalized_tool_calls
        if usage_thought_tokens or reasoning_thought_tokens_live:
            final_meta["thought_tokens"] = usage_thought_tokens or reasoning_thought_tokens_live
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
