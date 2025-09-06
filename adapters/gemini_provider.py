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
            # Gemini 2.5 Pro - самая мощная модель с мышлением
            ModelInfo(
                id="gemini-2.5-pro",
                name="gemini-2.5-pro",
                display_name="Gemini 2.5 Pro (Most Powerful Thinking)",
                provider=ModelProvider.GEMINI,
                context_length=2000000,  # 2M context window
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=8192,
                recommended_max_tokens=4096,
                description="Most powerful thinking model with advanced reasoning and multimodal understanding"
            ),
            # Gemini 2.5 Flash - лучшее соотношение цена/качество
            ModelInfo(
                id="gemini-2.5-flash",
                name="gemini-2.5-flash",
                display_name="Gemini 2.5 Flash (Best Value + Thinking)",
                provider=ModelProvider.GEMINI,
                context_length=1000000,  # 1M context window
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=8192,
                recommended_max_tokens=4096,
                description="Best price-performance with adaptive thinking and comprehensive capabilities"
            ),
            # Gemini 2.5 Flash Lite - самая экономичная
            ModelInfo(
                id="gemini-2.5-flash-lite",
                name="gemini-2.5-flash-lite",
                display_name="Gemini 2.5 Flash Lite (Fastest & Cheapest)",
                provider=ModelProvider.GEMINI,
                context_length=1000000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=8192,
                recommended_max_tokens=4096,
                description="Most cost-effective model with high throughput and low latency"
            ),
            # Gemini 2.0 Flash - новое поколение
            ModelInfo(
                id="gemini-2.0-flash",
                name="gemini-2.0-flash",
                display_name="Gemini 2.0 Flash (Next-Gen)",
                provider=ModelProvider.GEMINI,
                context_length=1000000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=8192,
                recommended_max_tokens=4096,
                description="Next-generation features with speed and real-time streaming"
            ),
            # Gemini 1.5 Pro - устаревшая но мощная
            ModelInfo(
                id="gemini-1.5-pro",
                name="gemini-1.5-pro",
                display_name="Gemini 1.5 Pro (Legacy)",
                provider=ModelProvider.GEMINI,
                context_length=2000000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=8192,
                recommended_max_tokens=4096,
                description="Complex reasoning tasks requiring greater intelligence (legacy)"
            ),
            # Gemini 1.5 Flash - устаревшая но быстрая
            ModelInfo(
                id="gemini-1.5-flash",
                name="gemini-1.5-flash",
                display_name="Gemini 1.5 Flash (Legacy)",
                provider=ModelProvider.GEMINI,
                context_length=1000000,
                supports_streaming=True,
                supports_functions=True,
                supports_vision=True,
                type=ModelType.CHAT,
                max_output_tokens=8192,
                recommended_max_tokens=4096,
                description="Fast and versatile performance across diverse tasks (legacy)"
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

        # Gemini API payload
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": params.temperature,
                "maxOutputTokens": params.max_tokens,
                "topP": params.top_p,
            }
        }

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
            
            async with self.session.post(url, json=payload) as response:
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
                    if candidates and candidates[0].get("content"):
                        content = candidates[0]["content"]["parts"][0]["text"]
                        usage_metadata = data.get("usageMetadata", {})
                        
                        yield ChatResponse(
                            content=content,
                            done=True,
                            meta={
                                "tokens_in": usage_metadata.get("promptTokenCount", input_tokens),
                                "tokens_out": usage_metadata.get("candidatesTokenCount", self.estimate_tokens(content)),
                                "provider": ModelProvider.GEMINI,
                                "model": model
                            }
                        )
                    else:
                        yield ChatResponse(
                            error="No valid response from Gemini",
                            meta={"provider": ModelProvider.GEMINI, "model": model}
                        )
                    return

                # Handle streaming response - Gemini sends NDJSON stream
                # Each line is a separate JSON object with incremental content
                buffer = b""
                
                async for chunk in response.content.iter_chunked(1024):
                    buffer += chunk
                    
                    # Process complete lines
                    while b'\n' in buffer:
                        line, buffer = buffer.split(b'\n', 1)
                        line_text = line.decode('utf-8', errors='ignore').strip()
                        
                        if not line_text:
                            continue
                            
                        try:
                            # Parse each JSON line
                            json_response = json.loads(line_text)
                            candidates = json_response.get("candidates", [])
                            
                            if candidates:
                                candidate = candidates[0]
                                content_part = candidate.get("content", {})
                                parts = content_part.get("parts", [])
                                
                                if parts and "text" in parts[0]:
                                    content = parts[0]["text"]
                                    accumulated_content += content
                                    
                                    # Yield the streaming chunk immediately
                                    yield ChatResponse(
                                        content=content,
                                        done=False,
                                        meta={
                                            "tokens_in": input_tokens,
                                            "tokens_out": self.estimate_tokens(accumulated_content),
                                            "provider": ModelProvider.GEMINI,
                                            "model": model
                                        }
                                    )
                                
                                # Check for finish reason
                                finish_reason = candidate.get("finishReason")
                                if finish_reason:
                                    self.logger.info(f"Gemini response finished with reason: {finish_reason}")
                                    if finish_reason == "MAX_TOKENS":
                                        self.logger.warning(f"Response was truncated due to max_tokens limit.")
                                        yield ChatResponse(
                                            content="\n\n⚠️ *Response was truncated due to token limit. You can increase max_tokens in settings for longer responses.*",
                                            done=False,
                                            meta={
                                                "tokens_in": input_tokens,
                                                "tokens_out": self.estimate_tokens(accumulated_content),
                                                "provider": ModelProvider.GEMINI,
                                                "model": model
                                            }
                                        )
                                    
                                    # Send final completion signal
                                    final_output_tokens = self.estimate_tokens(accumulated_content)
                                    yield ChatResponse(
                                        content="",
                                        done=True,
                                        meta={
                                            "tokens_in": input_tokens,
                                            "tokens_out": final_output_tokens,
                                            "total_tokens": input_tokens + final_output_tokens,
                                            "provider": ModelProvider.GEMINI,
                                            "model": model
                                        }
                                    )
                                    return
                                    
                        except json.JSONDecodeError as e:
                            self.logger.warning(f"Failed to parse JSON line: {line_text[:100]}... - {e}")
                            continue
                        except Exception as e:
                            self.logger.error(f"Error processing streaming response: {e}")
                            continue
                
                # Process any remaining buffer content
                if buffer:
                    line_text = buffer.decode('utf-8', errors='ignore').strip()
                    if line_text:
                        try:
                            json_response = json.loads(line_text)
                            candidates = json_response.get("candidates", [])
                            
                            if candidates:
                                candidate = candidates[0]
                                content_part = candidate.get("content", {})
                                parts = content_part.get("parts", [])
                                
                                if parts and "text" in parts[0]:
                                    content = parts[0]["text"]
                                    accumulated_content += content
                                    
                                    yield ChatResponse(
                                        content=content,
                                        done=False,
                                        meta={
                                            "tokens_in": input_tokens,
                                            "tokens_out": self.estimate_tokens(accumulated_content),
                                            "provider": ModelProvider.GEMINI,
                                            "model": model
                                        }
                                    )
                        except json.JSONDecodeError:
                            self.logger.warning(f"Failed to parse final buffer: {line_text[:100]}...")
                        except Exception as e:
                            self.logger.error(f"Error processing final buffer: {e}")

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
                "provider": ModelProvider.GEMINI,
                "model": model
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

    def estimate_tokens(self, text: str) -> int:
        """Estimate token count (rough approximation for Gemini)"""
        # Gemini uses different tokenization, rough estimate: 1 token ≈ 4 characters
        return len(text) // 4

    async def close(self):
        """Clean up session"""
        if self.session and not self.session.closed:
            await self.session.close()