import asyncio
import json
import logging
import os
from typing import Dict, List, Optional, AsyncGenerator, Any

import aiohttp
import tiktoken

from .base_provider import (
    BaseAdapter,
    Message,
    GenerationParams,
    ChatResponse,
    ModelInfo,
    ModelProvider,
    ModelType,
    ProviderConfig,
)

logger = logging.getLogger(__name__)


class OpenAIAdapter(BaseAdapter):
    """OpenAI Provider Adapter"""

    def __init__(self, config: ProviderConfig):
        super().__init__(config)
        self.api_key = config.api_key
        self.base_url = (config.base_url or "https://api.openai.com/v1").rstrip("/")
        self.session: Optional[aiohttp.ClientSession] = None
        self.stream_debug = os.getenv("OPENAI_STREAM_DEBUG", "0") == "1"

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
                pricing={"input_tokens": 2.50, "output_tokens": 10.00},
                max_output_tokens=16384,
                recommended_max_tokens=8192,
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
                pricing={"input_tokens": 0.15, "output_tokens": 0.60},
                max_output_tokens=16384,
                recommended_max_tokens=8192,
            ),
            ModelInfo(
                id="gpt-5",
                name="gpt-5",
                display_name="GPT-5",
                provider=ModelProvider.OPENAI,
                context_length=400000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                pricing={"input_tokens": 1.25, "output_tokens": 10.00},
                max_output_tokens=128000,
                recommended_max_tokens=64000,
                description="Most advanced GPT model with built-in thinking capabilities",
            ),
            ModelInfo(
                id="gpt-5-mini",
                name="gpt-5-mini",
                display_name="GPT-5 Mini",
                provider=ModelProvider.OPENAI,
                context_length=400000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                pricing={"input_tokens": 0.25, "output_tokens": 2.00},
                max_output_tokens=128000,
                recommended_max_tokens=32000,
                description="Lightweight version of GPT-5",
            ),
            ModelInfo(
                id="gpt-5-nano",
                name="gpt-5-nano",
                display_name="GPT-5 Nano",
                provider=ModelProvider.OPENAI,
                context_length=400000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=False,
                type=ModelType.CHAT,
                pricing={"input_tokens": 0.05, "output_tokens": 0.40},
                max_output_tokens=64000,
                recommended_max_tokens=16000,
                description="Most efficient version of GPT-5",
            ),
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
                description="Preview version of o1 reasoning model",
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
                description="Lightweight version of o1 reasoning model",
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
                description="o1 with extended compute for the most reliable responses - Pro exclusive",
            ),
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
                description="Fast reasoning model with optimized performance",
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
                description="o3 optimized for web browsing and multi-step research tasks",
            ),
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
                pricing={"input_tokens": 4.00, "output_tokens": 16.00},
                max_output_tokens=65536,
                recommended_max_tokens=32768,
                description="Lightweight version of o4 reasoning model",
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
                pricing={"input_tokens": 10.00, "output_tokens": 30.00},
                max_output_tokens=4096,
                recommended_max_tokens=2048,
            ),
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
                pricing={"input_tokens": 0.50, "output_tokens": 1.50},
                max_output_tokens=4096,
                recommended_max_tokens=2048,
            ),
        ]

    async def _ensure_session(self):
        if self.session is None or self.session.closed:
            connector = aiohttp.TCPConnector(limit=100, limit_per_host=30)
            timeout = aiohttp.ClientTimeout(total=None, connect=30)
            self.session = aiohttp.ClientSession(
                connector=connector,
                timeout=timeout,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "AI-Chat/1.0",
                },
            )

    async def chat_completion(
        self,
        messages: List[Message],
        model: str = "gpt-4o-mini",
        params: GenerationParams = None,
        **kwargs,
    ) -> AsyncGenerator[ChatResponse, None]:
        if params is None:
            params = GenerationParams()

        await self._ensure_session()

        api_messages = [{"role": msg.role, "content": msg.content} for msg in messages]

        input_text = "\n".join(f"{msg['role']}: {msg['content']}" for msg in api_messages)
        input_tokens = self.estimate_tokens(input_text)
        total_input_length = sum(len(msg.content) for msg in messages)

<<<<<<< ours
        self.logger.info(
            "🔍 [ENTRY] %s generate called - input_length=%s chars",
            model,
            f"{total_input_length:,}",
        )
=======
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

        response_usage = None

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
                            "type": "web_search_preview"
                        })
                # Sanitize tools: remove unsupported fields for built-in research tool types
                if responses_payload.get('tools'):
                    sanitized_tools = []
                    for t in responses_payload['tools']:
                        ttype = t.get('type')
                        if ttype in {"web_search_preview", "file_search", "mcp"}:
                            sanitized_tools.append({"type": ttype})
                        else:
                            sanitized_tools.append(t)
                    responses_payload['tools'] = sanitized_tools
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
                
                # Enhanced monitoring for GPT-5 (handled via proactive heartbeats)
                monitor_task = None
                response_received = False
                
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
                
                buffer = ""
                stream_finished = False
                
                while not stream_finished:
                    try:
                        raw_line = await asyncio.wait_for(response.content.readline(), timeout=heartbeat_interval)
                    except asyncio.TimeoutError:
                        if is_gpt5:
                            current_time = asyncio.get_event_loop().time()
                            self.logger.debug("🔍 [GPT-5] Heartbeat timeout reached, sending keep-alive")
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
                        continue
                    
                    if not raw_line:
                        break
                    
                    current_time = asyncio.get_event_loop().time()
                    last_heartbeat = current_time
                    
                    if is_gpt5 and not response_received and raw_line.strip():
                        response_received = True
                    
                    try:
                        decoded_line = raw_line.decode("utf-8")
                    except UnicodeDecodeError:
                        decoded_line = raw_line.decode("utf-8", errors="ignore")
                    
                    buffer += decoded_line
                    
                    if decoded_line.strip() != "":
                        continue
                    
                    raw_event = buffer.strip()
                    buffer = ""
                    
                    if not raw_event:
                        continue
                    
                    if raw_event == "data: [DONE]":
                        stream_finished = True
                        break
                    
                    data_lines = []
                    for event_line in raw_event.splitlines():
                        if event_line.startswith("data:"):
                            data_lines.append(event_line.split("data:", 1)[1].strip())
                    
                    if not data_lines:
                        continue
                    
                    for data_line in data_lines:
                        if not data_line or data_line == "[DONE]":
                            stream_finished = True
                            break
                        
                        try:
                            json_data = json.loads(data_line)
                        except json.JSONDecodeError:
                            self.logger.debug(f"🔍 [OpenAI] Skipping malformed SSE chunk: {data_line[:80]}")
                            continue
                        
                        if uses_responses_endpoint:
                            event_type = json_data.get("type")
                            content_segments: List[str] = []
                            
                            if event_type in {"response.output_text.delta", "response.output_text.delta.v1"}:
                                delta_value = json_data.get("delta")
                                if isinstance(delta_value, str):
                                    content_segments.append(delta_value)
                            elif event_type == "response.delta":
                                delta_payload = json_data.get("delta", {})
                                if isinstance(delta_payload, list):
                                    for item in delta_payload:
                                        if item.get("type") in {"output_text.delta", "output_text.delta.v1"}:
                                            segment = item.get("delta")
                                            if isinstance(segment, str):
                                                content_segments.append(segment)
                                elif isinstance(delta_payload, dict):
                                    if delta_payload.get("type") in {"output_text.delta", "output_text.delta.v1"}:
                                        segment = delta_payload.get("delta")
                                        if isinstance(segment, str):
                                            content_segments.append(segment)
                            elif event_type == "response.output_text.done":
                                pass
                            
                            for content in content_segments:
                                if is_gpt5 and first_content_chunk:
                                    self.logger.info("🔍 [GPT-5] First content chunk received - confirming generation")
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
                                    id=json_data.get("response_id") or json_data.get("id"),
                                    done=False,
                                    meta={
                                        "tokens_in": input_tokens,
                                        "tokens_out": output_tokens,
                                        "provider": ModelProvider.OPENAI,
                                        "model": model,
                                        "reasoning": is_reasoning_model,
                                        "status": "streaming"
                                    }
                                )
                            
                            if event_type == "response.tool_call.delta":
                                call_id = json_data.get("call_id") or json_data.get("tool_call_id")
                                delta_payload = json_data.get("delta")
                                if call_id and delta_payload is not None:
                                    if isinstance(delta_payload, str):
                                        delta_str = delta_payload
                                    elif isinstance(delta_payload, dict):
                                        if "arguments" in delta_payload and isinstance(delta_payload["arguments"], str):
                                            delta_str = delta_payload["arguments"]
                                        elif "tool_inputs" in delta_payload and isinstance(delta_payload["tool_inputs"], dict):
                                            arguments = delta_payload["tool_inputs"].get("arguments")
                                            if isinstance(arguments, str):
                                                delta_str = arguments
                                            else:
                                                delta_str = json.dumps(arguments)
                                        else:
                                            delta_str = json.dumps(delta_payload)
                                    else:
                                        delta_str = json.dumps(delta_payload)
                                    current_partial_calls[call_id] = current_partial_calls.get(call_id, "") + delta_str
                            
                            if event_type == "response.tool_call.done":
                                call_id = json_data.get("call_id") or json_data.get("tool_call_id")
                                tool_call = json_data.get("tool_call") or {}
                                name = json_data.get("name") or tool_call.get("name")
                                input_payload = (
                                    json_data.get("result")
                                    or tool_call.get("input")
                                    or tool_call.get("arguments")
                                    or tool_call.get("input_arguments")
                                )
                                if isinstance(input_payload, dict):
                                    result_str = json.dumps(input_payload)
                                elif isinstance(input_payload, str):
                                    result_str = input_payload
                                elif input_payload is None:
                                    result_str = current_partial_calls.get(call_id, "")
                                else:
                                    result_str = json.dumps(input_payload)
                                if call_id:
                                    collected_tool_calls.append({
                                        "call_id": call_id,
                                        "name": name,
                                        "input": result_str
                                    })
                                    current_partial_calls.pop(call_id, None)
                            
                            if event_type == "response.completed":
                                usage_payload = json_data.get("usage") or json_data.get("response", {}).get("usage")
                                if usage_payload:
                                    response_usage = usage_payload
                                stream_finished = True
                                break
                            
                            if event_type in {"response.failed", "response.cancelled"}:
                                error_payload = json_data.get("error") or {}
                                error_message = error_payload.get("message") or event_type.split(".")[-1].replace("_", " ").title()
                                self.logger.error(f"OpenAI responses error ({event_type}): {error_message}")
                                yield ChatResponse(
                                    error=f"OpenAI error: {error_message}",
                                    meta={"provider": ModelProvider.OPENAI, "model": model}
                                )
                                return
                            
                            if event_type == "response.error":
                                error_payload = json_data.get("error") or {}
                                error_message = error_payload.get("message") or "Unknown error"
                                self.logger.error(f"OpenAI responses error: {error_message}")
                                yield ChatResponse(
                                    error=f"OpenAI error: {error_message}",
                                    meta={"provider": ModelProvider.OPENAI, "model": model}
                                )
                                return
                            
                            continue
                        
                        if json_data.get("usage"):
                            response_usage = json_data["usage"]
                        
                        choices = json_data.get("choices") or []
                        if not choices:
                            continue
                        
                        choice = choices[0]
                        delta = choice.get("delta") or {}
                        content = delta.get("content") or ""
                        thinking = delta.get("reasoning") or ""
                        
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
                        
                        finish_reason = choice.get("finish_reason")
                        if finish_reason:
                            stream_finished = True
                            break

                if monitor_task:
                    monitor_task.cancel()
                    try:
                        await monitor_task
                    except asyncio.CancelledError:
                        pass
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
        final_tokens_in = input_tokens
        final_tokens_out = final_output_tokens
        
        if response_usage:
            usage_prompt = response_usage.get("prompt_tokens") or response_usage.get("input_tokens")
            usage_completion = response_usage.get("completion_tokens") or response_usage.get("output_tokens")
            if usage_prompt is not None:
                final_tokens_in = usage_prompt
            if usage_completion is not None:
                final_tokens_out = usage_completion
        
        final_meta = {
            "tokens_in": final_tokens_in,
            "tokens_out": final_tokens_out,
            "total_tokens": final_tokens_in + final_tokens_out,
            "provider": ModelProvider.OPENAI,
            "model": model,
            "estimated_cost": self._calculate_cost(final_tokens_in, final_tokens_out, model)
        }
        if collected_tool_calls:
            final_meta["tool_calls"] = collected_tool_calls
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
>>>>>>> theirs

*** End Patch
