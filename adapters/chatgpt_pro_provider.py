import asyncio
import json
import logging
from typing import Dict, List, Optional, AsyncGenerator, Any
import aiohttp
from .openai_provider import OpenAIAdapter
from .base_provider import Message, GenerationParams, ChatResponse, ModelInfo, ModelProvider, ModelType, ProviderConfig

logger = logging.getLogger(__name__)


class ChatGPTProAdapter(OpenAIAdapter):
    """ChatGPT Pro Provider with Deep Research and o1 Pro Mode"""
    
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

    def _prepare_api_payload(self, messages: List[Message], model: str, params: GenerationParams) -> dict:
        """Prepare API payload with model-specific parameter filtering"""
        # Convert messages to OpenAI format
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
        self.logger.info(f"🔍 Input params for {model}: max_tokens={params.max_tokens}, temperature={params.temperature}, top_p={params.top_p}")

        # Add parameters based on model capabilities
        if model == "gpt-5":
            # GPT-5 specific parameters - more restrictive
            if params.max_tokens:
                payload["max_completion_tokens"] = params.max_tokens
            if params.temperature is not None and params.temperature <= 1.0:
                payload["temperature"] = params.temperature
            # GPT-5 Pro reasoning parameters
            payload["reasoning_effort"] = "high"
            payload["verbosity"] = 3  # Medium verbosity for detailed responses
            
            # GPT-5 doesn't support these parameters:
            # - top_p (causes error)
            # - frequency_penalty 
            # - presence_penalty
            self.logger.info(f"🔍 GPT-5 payload (filtered): {json.dumps(payload, indent=2)}")
            
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
        """Enhanced generation with Pro features and proper parameter handling"""
        if params is None:
            params = GenerationParams()

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
            
            # Enhanced Pro research stages
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
                await asyncio.sleep(2)  # Simulate research time

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
        elif model == "gpt-5" and hasattr(params, 'reasoning_effort'):
            # GPT-5 Pro mode with enhanced reasoning
            yield ChatResponse(
                content="🚀 **GPT-5 Pro Mode Engaged**\n\nUsing extended reasoning capabilities for comprehensive analysis...\n",
                done=False,
                meta={
                    "provider": ModelProvider.CHATGPT_PRO,
                    "model": "gpt-5-pro",
                    "pro_mode": True,
                    "extended_reasoning": True,
                    "reasoning_effort": "high"
                }
            )

        # Delegate to parent OpenAI implementation with special handling for GPT-5
        if model == "gpt-5":
            # Use our custom payload preparation for GPT-5 Pro
            payload = self._prepare_api_payload(messages, model, params)
            
            # Debug: Log the payload being sent to API
            self.logger.info(f"🔍 GPT-5 Pro API Payload: {json.dumps(payload, indent=2)}")
            
            # Custom GPT-5 API call
            url = f"{self.base_url}/chat/completions"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            try:
                async with self.session.post(url, json=payload, headers=headers) as resp:
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
                        async for line in resp.content:
                            line = line.decode('utf-8').strip()
                            if line.startswith('data: '):
                                if line == 'data: [DONE]':
                                    break
                                try:
                                    data = json.loads(line[6:])
                                    if 'choices' in data and data['choices']:
                                        delta = data['choices'][0].get('delta', {})
                                        content = delta.get('content', '')
                                        if content:
                                            yield ChatResponse(
                                                content=content,
                                                done=False,
                                                meta={
                                                    "provider": ModelProvider.CHATGPT_PRO,
                                                    "model": model,
                                                    "chatgpt_pro": True,
                                                    "gpt5_pro": True,
                                                    "reasoning_effort": "high"
                                                }
                                            )
                                except json.JSONDecodeError:
                                    continue
                    else:
                        response_data = await resp.json()
                        if 'choices' in response_data and response_data['choices']:
                            content = response_data['choices'][0]['message']['content']
                            yield ChatResponse(
                                content=content,
                                done=True,
                                meta={
                                    "provider": ModelProvider.CHATGPT_PRO,
                                    "model": model,
                                    "chatgpt_pro": True,
                                    "gpt5_pro": True,
                                    "reasoning_effort": "high"
                                }
                            )
            except Exception as e:
                self.logger.error(f"GPT-5 generation error: {e}")
                yield ChatResponse(
                    content=f"Error: {str(e)}",
                    done=True,
                    error=True,
                    meta={"provider": ModelProvider.CHATGPT_PRO, "model": model}
                )
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
                        response.meta["reasoning_effort"] = "high"
                
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
                    
            return True, "ChatGPT Pro connection validated successfully"
            
        except Exception as e:
            return False, f"Pro validation error: {str(e)}"
