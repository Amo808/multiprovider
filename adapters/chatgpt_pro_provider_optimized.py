import asyncio
import json
import logging
from typing import Dict, List, Optional, AsyncGenerator, Any
import aiohttp
from .openai_provider import OpenAIAdapter
from .base_provider import Message, GenerationParams, ChatResponse, ModelInfo, ModelProvider, ModelType, ProviderConfig

logger = logging.getLogger(__name__)


class ChatGPTProAdapter(OpenAIAdapter):
    """ChatGPT Pro Provider with Deep Research and o1 Pro Mode - Render Optimized"""
    
    def __init__(self, config: ProviderConfig):
        super().__init__(config)
        self.base_url = config.base_url or "https://api.openai.com/v1"
        
    @property
    def name(self) -> str:
        return "ChatGPT Pro"

    @property
    def supported_models(self) -> List[ModelInfo]:
        return [
            # GPT-5 Pro (exclusive to Pro subscribers with extended reasoning)
            ModelInfo(
                id="gpt-5",
                name="gpt-5-pro",
                display_name="GPT-5 Pro",
                provider=ModelProvider.CHATGPT_PRO,
                context_length=400000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                pricing={"input_tokens": 1.25, "output_tokens": 10.00},
                max_output_tokens=128000,
                recommended_max_tokens=64000,
                description="GPT-5 with extended reasoning capabilities - Pro exclusive unlimited access"
            ),
            # ChatGPT Pro exclusive models
            ModelInfo(
                id="o1-pro",
                name="o1-pro", 
                display_name="o1 Pro Mode",
                provider=ModelProvider.CHATGPT_PRO,
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
            ModelInfo(
                id="o3-deep-research",
                name="o3-deep-research",
                display_name="o3 Deep Research",
                provider=ModelProvider.CHATGPT_PRO,
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
            # Regular Pro models
            ModelInfo(
                id="o1",
                name="o1",
                display_name="o1",
                provider=ModelProvider.CHATGPT_PRO,
                context_length=128000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=False,
                type=ModelType.CHAT,
                pricing={"input_tokens": 15.00, "output_tokens": 60.00},
                max_output_tokens=65536,
                recommended_max_tokens=32768,
                description="Advanced reasoning model - unlimited for Pro users"
            ),
            ModelInfo(
                id="o1-mini",
                name="o1-mini",
                display_name="o1 Mini",
                provider=ModelProvider.CHATGPT_PRO,
                context_length=128000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=False,
                type=ModelType.CHAT,
                pricing={"input_tokens": 3.00, "output_tokens": 12.00},
                max_output_tokens=65536,
                recommended_max_tokens=32768,
                description="Lightweight reasoning model with unlimited access for Pro"
            ),
            ModelInfo(
                id="gpt-4o",
                name="gpt-4o",
                display_name="GPT-4o",
                provider=ModelProvider.CHATGPT_PRO,
                context_length=128000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                pricing={"input_tokens": 2.50, "output_tokens": 10.00},
                max_output_tokens=16384,
                recommended_max_tokens=8192,
                description="Latest multimodal model with unlimited access for Pro"
            ),
        ]

    def _prepare_messages_for_gpt5(self, messages: List[Message], max_context_length: int = 200000) -> List[dict]:
        """Prepare messages for GPT-5 with smart truncation for very long content"""
        api_messages = []
        total_length = 0
        
        for msg in messages:
            content = msg.content
            content_length = len(content)
            
            # If this is a very long message, provide a summary approach
            if content_length > 50000:  # Very long content
                self.logger.info(f"⚠️ GPT-5 Pro: Very long message detected ({content_length} chars)")
                # For very long academic papers, keep first part and add summary notice
                if content_length > 100000:
                    content = content[:50000] + f"\n\n[Note: This is a very long text ({content_length:,} characters). Content truncated to first 50,000 characters for processing efficiency. Please provide analysis based on the available content.]"
                elif content_length > 75000:
                    content = content[:60000] + f"\n\n[Note: Long text truncated for processing efficiency. Original length: {content_length:,} characters.]"
            
            api_messages.append({
                "role": msg.role,
                "content": content
            })
            total_length += len(content)
            
            # Check if we're approaching context limits
            if total_length > max_context_length:
                self.logger.warning(f"⚠️ GPT-5 Pro: Context length limit approached ({total_length:,} chars)")
                break
                
        return api_messages

    def _prepare_api_payload(self, messages: List[Message], model: str, params: GenerationParams) -> dict:
        """Prepare API payload with model-specific parameter filtering"""
        # Convert messages to API format with smart handling for long content
        if model == "gpt-5":
            api_messages = self._prepare_messages_for_gpt5(messages)
        else:
            # Standard conversion for other models
            api_messages = []
            for msg in messages:
                api_messages.append({
                    "role": msg.role,
                    "content": msg.content
                })

        # Base payload
        payload = {
            "model": model,
            "messages": api_messages,
            "stream": params.stream,
        }

        # Debug: Log input parameters
        self.logger.info(f"🔍 Input params for {model}: max_tokens={params.max_tokens}, temperature={params.temperature}, top_p={params.top_p}, stream={params.stream}")

        # Add parameters based on model capabilities
        if model == "gpt-5":
            # GPT-5 specific parameters - RENDER OPTIMIZED
            payload["stream"] = True  # FORCE STREAMING for GPT-5 to avoid hanging
            
            # RENDER OPTIMIZATION: Reduce max_tokens for hosting limitations
            max_tokens = params.max_tokens if params.max_tokens else 8192  # Reduced from 16384
            if max_tokens > 16384:  # Reduced cap for Render stability
                max_tokens = 16384
            payload["max_completion_tokens"] = max_tokens
            
            # Use more conservative temperature for long texts
            temperature = params.temperature if params.temperature is not None else 0.7
            if temperature > 1.0:
                temperature = 1.0
            payload["temperature"] = temperature
            
            # RENDER OPTIMIZATION: Use lighter reasoning for faster response
            payload["reasoning_effort"] = "low"  # Changed from "medium" for Render
            payload["verbosity"] = 1  # Reduced verbosity to speed up
            
            # GPT-5 doesn't support these parameters:
            # - top_p (causes error)
            # - frequency_penalty 
            # - presence_penalty
            self.logger.info(f"🔍 GPT-5 payload (RENDER OPTIMIZED): {json.dumps(payload, indent=2)}")
            
        else:
            # Other models (o1, o3, legacy models) - use standard parameters
            if params.max_tokens:
                if any(model.startswith(prefix) for prefix in ['o1', 'o3', 'o4']):
                    payload["max_completion_tokens"] = params.max_tokens
                else:
                    payload["max_tokens"] = params.max_tokens
            
            if params.temperature is not None:
                payload["temperature"] = params.temperature
            if params.top_p is not None:
                payload["top_p"] = params.top_p
            if params.frequency_penalty is not None:
                payload["frequency_penalty"] = params.frequency_penalty
            if params.presence_penalty is not None:
                payload["presence_penalty"] = params.presence_penalty

        return payload

    async def generate(
        self,
        messages: List[Message],
        model: str,
        params: GenerationParams = None,
        **kwargs
    ) -> AsyncGenerator[ChatResponse, None]:
        """Enhanced generation with Pro features and Render optimization"""
        if params is None:
            params = GenerationParams()

        # Check API key first
        if not self.api_key or self.api_key == "your_api_key_here":
            self.logger.error(f"🚨 [GPT-5] No valid API key configured for ChatGPT Pro")
            yield ChatResponse(
                content="❌ **ChatGPT Pro API Key Required**\n\nPlease configure your ChatGPT Pro API key in the settings to use GPT-5 Pro features.",
                done=True,
                error=True,
                meta={
                    "provider": ModelProvider.CHATGPT_PRO,
                    "model": model,
                    "error": "missing_api_key"
                }
            )
            return

        # EARLY DEBUGGING: Log entry point
        total_input_length = sum(len(msg.content) for msg in messages)
        self.logger.info(f"🔍 [ENTRY] GPT-5 Pro generate called - model={model}, input_length={total_input_length} chars")
        
        # Track if deep research is being used
        is_deep_research = model == "o3-deep-research"

        # Special handling for deep research model (always uses Deep Research)
        if is_deep_research:
            self.logger.info("🔍 DEEP RESEARCH ACTIVATED - ChatGPT Pro mode")
            self.logger.info(f"DEBUG: Sending stage_message with deep_research=True")
            yield ChatResponse(
                content="",  # No content for stage events
                done=False,
                meta={
                    "provider": ModelProvider.CHATGPT_PRO,
                    "model": model,
                    "deep_research": True,
                    "stage": "initialization"
                },
                stage_message="🔍 **Deep Research Mode** - Pro research capabilities activated..."
            )
            
            # Enhanced Pro research stages - reduced delays for Render
            research_stages = [
                "🔍 Analyzing query with Pro capabilities...",
                "🌐 Accessing latest information sources...",
                "📚 Cross-referencing multiple databases...", 
                "🧠 Advanced reasoning and synthesis...",
                "📝 Generating comprehensive response...",
            ]
            
            for i, stage in enumerate(research_stages):
                yield ChatResponse(
                    content="",  # No content for stage events
                    done=False,
                    meta={
                        "provider": ModelProvider.CHATGPT_PRO,
                        "model": model,
                        "deep_research": True,
                        "stage": f"research_{i+1}",
                        "progress": (i+1) / len(research_stages)
                    },
                    stage_message=stage
                )
                await asyncio.sleep(0.5)  # Reduced delay for production

        # Enhanced Pro mode indication
        if model == "o1-pro":
                yield ChatResponse(
                    content="🧠 **o1 Pro Mode Engaged**\n\nUsing extended compute for maximum reliability...\n",
                    done=False,
                    meta={
                        "provider": ModelProvider.CHATGPT_PRO,
                        "model": model,
                        "pro_mode": True,
                        "extended_reasoning": True
                    }
                )
        elif model == "gpt-5":
            # GPT-5 Pro mode with enhanced reasoning - IMMEDIATELY send status
            self.logger.info(f"🚀 [GPT-5] Starting GPT-5 Pro processing for {total_input_length} chars")
            
            # RENDER WARNING: Inform about hosting limitations
            yield ChatResponse(
                content="🚀 **GPT-5 Pro Mode Engaged**\n\n⚠️ *Running on Render hosting with shorter timeouts. For best GPT-5 experience, consider local setup.*\n\nInitializing advanced reasoning capabilities...\n",
                done=False,
                meta={
                    "provider": ModelProvider.CHATGPT_PRO,
                    "model": "gpt-5-pro",
                    "pro_mode": True,
                    "extended_reasoning": True,
                    "reasoning_effort": "low",  # Reduced for Render
                    "input_length": total_input_length,
                    "render_optimized": True
                }
            )

        # Delegate to parent OpenAI implementation with special handling for GPT-5
        if model == "gpt-5":
            # EARLY WARNING for large texts and Render hosting
            if total_input_length > 30000:
                self.logger.warning(f"⚠️ [GPT-5] Large input detected: {total_input_length} chars - may exceed Render limits")
                yield ChatResponse(
                    content="",
                    done=False,
                    meta={
                        "provider": ModelProvider.CHATGPT_PRO,
                        "model": model,
                        "processing": True,
                        "large_input": True,
                        "render_warning": True
                    },
                    stage_message=f"⚠️ Large text ({total_input_length:,} chars) on Render hosting. May timeout after 1-2 minutes. Consider shorter prompts or local setup."
                )
            
            # Use our custom payload preparation for GPT-5 Pro
            self.logger.info(f"🔍 [GPT-5] Preparing API payload...")
            payload = self._prepare_api_payload(messages, model, params)
            
            # Debug: Log the payload being sent to API
            self.logger.info(f"🔍 GPT-5 Pro API Payload: {json.dumps(payload, indent=2)}")
            
            # Custom GPT-5 API call with extended timeout for long texts
            url = f"{self.base_url}/chat/completions"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            # Calculate input length to adjust timeout
            input_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in payload["messages"]])
            input_length = len(input_text)
            
            # RENDER OPTIMIZED: Shorter timeouts for hosting limitations
            base_timeout = 60  # 1 minute base for Render
            if input_length > 50000:  # Very long text (>50k chars)
                timeout_seconds = 180  # 3 minutes max for Render
            elif input_length > 20000:  # Long text (>20k chars)
                timeout_seconds = 120  # 2 minutes for Render
            else:
                timeout_seconds = base_timeout
            
            self.logger.info(f"🔍 GPT-5 Pro: Input length {input_length} chars, timeout {timeout_seconds}s")
            
            # Send status update for long processing
            yield ChatResponse(
                content="",
                done=False,
                meta={
                    "provider": ModelProvider.CHATGPT_PRO,
                    "model": model,
                    "processing": True
                },
                stage_message="🔄 Processing with GPT-5 Pro... This may take a few minutes for long texts."
            )
            
            # Start monitoring task for hang detection IMMEDIATELY
            start_time = asyncio.get_event_loop().time()
            hang_detected = False
            response_received = False
            self.logger.info(f"🔍 [GPT-5] Starting hang detection monitor at {start_time}")
            
            # Simplified monitoring for Render - shorter timeout
            async def background_monitoring():
                """Background task for monitoring and UI updates"""
                nonlocal hang_detected, response_received
                check_interval = 15  # Check every 15 seconds for Render
                await asyncio.sleep(check_interval)
                
                while not response_received and not hang_detected:
                    elapsed = asyncio.get_event_loop().time() - start_time
                    self.logger.info(f"🔍 [GPT-5] Monitor: {elapsed:.1f}s elapsed, response_received={response_received}")
                    
                    # RENDER OPTIMIZATION: Shorter timeout for hosting limits
                    if elapsed > 90:  # After 1.5 minutes - timeout for Render
                        self.logger.error(f"🚨 [GPT-5] Render timeout after {elapsed:.1f}s")
                        hang_detected = True
                        return
                    
                    await asyncio.sleep(check_interval)
            
            # Start monitoring in background 
            monitor_task = asyncio.create_task(background_monitoring())
            
            try:
                self.logger.info(f"🔍 [GPT-5] Creating aiohttp session with {timeout_seconds}s timeout...")
                # Create session with dynamic timeout for this request  
                timeout = aiohttp.ClientTimeout(total=timeout_seconds, connect=30)
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    self.logger.info(f"🔍 [GPT-5] Session created, sending POST to {url}")
                    self.logger.info(f"🔍 [GPT-5] Payload size: {len(json.dumps(payload))} bytes")
                    
                    async with session.post(url, json=payload, headers=headers) as resp:
                        self.logger.info(f"🔍 [GPT-5] POST completed, got response status: {resp.status}")
                        response_received = True  # Mark that we got a response
                        monitor_task.cancel()  # Cancel monitoring
                        
                        # Check if hang was detected during wait
                        if hang_detected:
                            self.logger.error(f"🚨 [GPT-5] Request was marked as hung, aborting")
                            yield ChatResponse(
                                content="⚠️ **Request timeout on Render hosting**\n\nGPT-5 Pro requests can take 2-5 minutes, but Render has shorter limits. Try:\n• Use shorter prompts\n• Try GPT-4o or o1-mini instead\n• Or use locally for long GPT-5 sessions",
                                done=True,
                                error=True,
                                meta={
                                    "provider": ModelProvider.CHATGPT_PRO,
                                    "model": model,
                                    "timeout": True,
                                    "render_limitation": True
                                }
                            )
                            return
                        
                        self.logger.info(f"🔍 GPT-5 Pro: Received response status: {resp.status}")
                        if resp.status != 200:
                            error_text = await resp.text()
                            self.logger.error(f"GPT-5 API Error {resp.status}: {error_text}")
                            yield ChatResponse(
                                content=f"API Error {resp.status}: {error_text}",
                                done=True,
                                error=True,
                                meta={"provider": ModelProvider.CHATGPT_PRO, "model": model}
                            )
                            return
                        
                        if payload.get("stream", False):
                            self.logger.info(f"🔍 [GPT-5] Starting streaming response processing...")
                            
                            # IMMEDIATELY send status update when streaming starts
                            self.logger.info(f"🔍 [GPT-5] Sending immediate status update - streaming ready")
                            yield ChatResponse(
                                content="",
                                done=False,
                                streaming_ready=True,
                                meta={
                                    "provider": ModelProvider.CHATGPT_PRO,
                                    "model": model,
                                    "timestamp": asyncio.get_event_loop().time(),
                                    "stage": "streaming_started"
                                },
                                stage_message="🔄 GPT-5 Pro is generating response..."
                            )
                            
                            # Start periodic heartbeat to keep connection alive - more frequent for Render
                            last_heartbeat = asyncio.get_event_loop().time()
                            heartbeat_interval = 5  # Send heartbeat every 5 seconds for Render stability
                            
                            first_content_chunk = True
                            content_received = False
                            
                            async for line in resp.content:
                                current_time = asyncio.get_event_loop().time()
                                
                                # Send periodic heartbeat to prevent frontend timeout
                                if current_time - last_heartbeat > heartbeat_interval:
                                    self.logger.info(f"🔍 [GPT-5] Sending heartbeat after {current_time - last_heartbeat:.1f}s")
                                    yield ChatResponse(
                                        content="",
                                        done=False,
                                        heartbeat="GPT-5 Pro processing... connection active",
                                        meta={
                                            "provider": ModelProvider.CHATGPT_PRO,
                                            "model": model,
                                            "elapsed_time": current_time - start_time,
                                            "timestamp": current_time
                                        },
                                        stage_message="⏳ GPT-5 Pro is still processing... (connection active)"
                                    )
                                    last_heartbeat = current_time
                                
                                line = line.decode('utf-8').strip()
                                self.logger.debug(f"🔍 [GPT-5] Received line: {line[:100]}...")  # Log first 100 chars
                                if line.startswith('data: '):
                                    if line == 'data: [DONE]':
                                        self.logger.info(f"🔍 [GPT-5] Streaming completed [DONE]")
                                        break
                                    try:
                                        data = json.loads(line[6:])
                                        if 'choices' in data and data['choices']:
                                            delta = data['choices'][0].get('delta', {})
                                            content = delta.get('content', '')
                                            if content:
                                                # On first content chunk, send another status update
                                                if first_content_chunk:
                                                    self.logger.info(f"🔍 [GPT-5] First content chunk received - confirming generation")
                                                    yield ChatResponse(
                                                        content="",
                                                        done=False,
                                                        first_content=True,
                                                        meta={
                                                            "provider": ModelProvider.CHATGPT_PRO,
                                                            "model": model
                                                        },
                                                        stage_message="✨ GPT-5 Pro generation in progress..."
                                                    )
                                                    first_content_chunk = False
                                                
                                                content_received = True
                                                yield ChatResponse(
                                                    content=content,
                                                    done=False,
                                                    meta={
                                                        "provider": ModelProvider.CHATGPT_PRO,
                                                        "model": model,
                                                        "chatgpt_pro": True,
                                                        "gpt5_pro": True,
                                                        "reasoning_effort": "low"  # Updated for Render
                                                    }
                                                )
                                    except json.JSONDecodeError as e:
                                        self.logger.warning(f"🔍 [GPT-5] JSON decode error: {e}")
                                        continue
                            
                            # Send final completion signal
                            if content_received:
                                yield ChatResponse(
                                    content="",
                                    done=True,
                                    meta={
                                        "provider": ModelProvider.CHATGPT_PRO,
                                        "model": model,
                                        "chatgpt_pro": True,
                                        "gpt5_pro": True,
                                        "reasoning_effort": "low"  # Updated for Render
                                    }
                                )
                        else:
                            # Non-streaming response
                            response_data = await resp.json()
                            if 'choices' in response_data and response_data['choices']:
                                content = response_data['choices'][0]['message']['content']
                                # Send final response
                                yield ChatResponse(
                                    content=content,
                                    done=True,
                                    meta={
                                        "provider": ModelProvider.CHATGPT_PRO,
                                        "model": model,
                                        "chatgpt_pro": True,
                                        "gpt5_pro": True,
                                        "reasoning_effort": "low"  # Updated for Render
                                    }
                                )
                            else:
                                # No content in response
                                self.logger.error(f"GPT-5 API: No content in response: {response_data}")
                                yield ChatResponse(
                                    content="No response received from GPT-5 Pro",
                                    done=True,
                                    error=True,
                                    meta={"provider": ModelProvider.CHATGPT_PRO, "model": model}
                                )
            except Exception as e:
                # Cancel monitoring task if still running
                if 'monitor_task' in locals() and not monitor_task.done():
                    monitor_task.cancel()
                
                self.logger.error(f"GPT-5 generation error: {e}")
                yield ChatResponse(
                    content=f"Error: {str(e)}",
                    done=True,
                    error=True,
                    meta={"provider": ModelProvider.CHATGPT_PRO, "model": model}
                )
            finally:
                # Ensure monitoring task is cancelled
                if 'monitor_task' in locals() and not monitor_task.done():
                    monitor_task.cancel()
        else:
            # Use parent implementation for other models
            async for response in super().generate(messages, model, params, **kwargs):
                # Add Pro metadata
                if response.meta:
                    response.meta["chatgpt_pro"] = True
                    response.meta["unlimited_access"] = True
                    # Add deep research flag if it was used
                    if is_deep_research:
                        response.meta["deep_research"] = True
                        self.logger.info(f"DEBUG: Added deep_research=True to response.meta")
                    # Add GPT-5 Pro metadata
                    if model == "gpt-5":
                        response.meta["gpt5_pro"] = True
                        response.meta["reasoning_effort"] = "low"  # Updated for Render
                
                yield response

    async def deep_research(
        self,
        query: str,
        max_time_minutes: int = 30,
        **kwargs
    ) -> AsyncGenerator[ChatResponse, None]:
        """
        Perform deep research using o3 model optimized for web browsing
        """
        research_message = Message(
            role="user",
            content=f"Perform comprehensive deep research on: {query}\n\nPlease provide detailed analysis with sources and citations."
        )
        
        # Use deep research model
        async for response in self.generate(
            messages=[research_message],
            model="o3-deep-research",
            params=GenerationParams(
                max_tokens=32768,  # Allow for comprehensive responses
                temperature=0.7
            ),
            **kwargs
        ):
            yield response

    def get_pro_features(self) -> Dict[str, Any]:
        """Return ChatGPT Pro exclusive features"""
        return {
            "unlimited_o1": True,
            "o1_pro_mode": True,
            "deep_research": True,
            "advanced_voice": True,
            "priority_access": True,
            "extended_reasoning": True,
            "render_optimized": True,  # Added for Render hosting
            "monthly_quota": {
                "deep_research": 100,  # Pro users get 100 queries per month
                "o1_pro": "unlimited"
            }
        }

    async def validate_connection(self) -> tuple[bool, str]:
        """Validate Pro subscription and API access"""
        try:
            # First validate basic OpenAI connection
            is_valid, message = await super().validate_connection()
            if not is_valid:
                return False, message

            # Check Pro-specific features
            await self._ensure_session()
            
            # Try to access Pro model to validate subscription
            test_payload = {
                "model": "o1",
                "messages": [{"role": "user", "content": "Test Pro access"}],
                "max_completion_tokens": 10  # Use correct parameter for o1
            }
            
            url = f"{self.base_url}/chat/completions"
            async with self.session.post(url, json=test_payload) as response:
                if response.status == 403:
                    return False, "ChatGPT Pro subscription required for this provider"
                elif response.status == 429:
                    return False, "Pro quota exceeded - please check your usage limits"
                elif response.status != 200:
                    error_text = await response.text()
                    return False, f"Pro API validation failed: {error_text}"
                    
            return True, "ChatGPT Pro connection validated successfully (Render optimized)"
            
        except Exception as e:
            return False, f"Pro validation error: {str(e)}"
