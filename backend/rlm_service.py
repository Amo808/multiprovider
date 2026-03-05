"""
RLM (Recursive Language Model) Deep Analysis Service

Integrates MIT's Recursive Language Models into Multech for deep analysis
of large documents and complex multi-step reasoning tasks.

RLM enables LLMs to handle near-infinite length contexts by programmatically
examining, decomposing, and recursively calling themselves through a REPL environment.

Library: pip install rlm  (https://github.com/alexzhang13/rlm)
Reference: https://arxiv.org/abs/2512.24601
"""

import asyncio
import logging
import time
import os
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, AsyncGenerator, Dict, List, Optional

logger = logging.getLogger(__name__)


class RLMStatus(str, Enum):
    """Status of an RLM execution."""
    INITIALIZING = "initializing"
    RUNNING = "running"
    ITERATION = "iteration"
    SUB_CALL = "sub_call"
    COMPLETED = "completed"
    ERROR = "error"
    CANCELLED = "cancelled"


@dataclass
class RLMEvent:
    """Event emitted during RLM execution for real-time UI updates."""
    status: RLMStatus
    message: str
    iteration: int = 0
    max_iterations: int = 10
    depth: int = 0
    code: Optional[str] = None
    output: Optional[str] = None
    answer: Optional[str] = None
    tokens_used: int = 0
    elapsed_seconds: float = 0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status.value,
            "message": self.message,
            "iteration": self.iteration,
            "max_iterations": self.max_iterations,
            "depth": self.depth,
            "code": self.code,
            "output": self.output,
            "answer": self.answer,
            "tokens_used": self.tokens_used,
            "elapsed_seconds": self.elapsed_seconds,
            "metadata": self.metadata,
        }


class RLMService:
    """
    Service wrapping the `rlm` library (from rlm import RLM) for deep analysis
    within Multech's multi-provider architecture.
    
    Supported RLM backends: openai, anthropic, gemini, litellm, openrouter, vllm, portkey.
    DeepSeek uses the openai backend with a custom base_url.
    """

    # Map Multech provider IDs → RLM backend names
    PROVIDER_BACKEND_MAP = {
        "openai": "openai",
        "anthropic": "anthropic",
        "gemini": "gemini",
        "deepseek": "openai",  # DeepSeek uses OpenAI-compatible API
    }

    def __init__(self, provider_manager):
        self.provider_manager = provider_manager
        self._available = None  # Lazy check

    @property
    def is_available(self) -> bool:
        """Check if the rlm library is installed."""
        if self._available is None:
            try:
                from rlm import RLM as _  # noqa: F401
                self._available = True
                logger.info("[RLM] rlm library is available")
            except ImportError:
                self._available = False
                logger.warning("[RLM] rlm library not installed. Install with: pip install rlm")
        return self._available

    def _get_api_key_for_provider(self, provider_id: str) -> Optional[str]:
        """Get API key from provider manager or environment variables."""
        adapter = self.provider_manager.registry.get(provider_id)
        if adapter and hasattr(adapter, 'config') and adapter.config.api_key:
            key = adapter.config.api_key
            if key and not key.startswith('your_') and len(key) > 10:
                return key

        # Fallback to env vars
        env_map = {
            "openai": "OPENAI_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "deepseek": "DEEPSEEK_API_KEY",
            "gemini": "GOOGLE_API_KEY",
        }
        env_var = env_map.get(provider_id, "")
        return os.getenv(env_var)

    def _build_rlm_kwargs(
        self,
        provider_id: str,
        model_id: str,
        sub_model_id: Optional[str] = None,
        max_iterations: int = 15,
        max_depth: int = 2,
        verbose: bool = True,
    ) -> Dict[str, Any]:
        """
        Build the full kwargs dict for the RLM constructor.
        
        RLM(backend, backend_kwargs, max_iterations, max_depth,
            other_backends, other_backend_kwargs, logger, verbose, ...)
        """
        api_key = self._get_api_key_for_provider(provider_id)
        if not api_key:
            raise ValueError(f"No API key found for provider '{provider_id}'")

        backend = self.PROVIDER_BACKEND_MAP.get(provider_id, "openai")

        backend_kwargs: Dict[str, Any] = {
            "model_name": model_id,
            "api_key": api_key,
        }

        # DeepSeek uses OpenAI-compatible API with custom base URL
        if provider_id == "deepseek":
            backend_kwargs["base_url"] = "https://api.deepseek.com"

        kwargs: Dict[str, Any] = {
            "backend": backend,
            "backend_kwargs": backend_kwargs,
            "environment": "local",
            "max_iterations": max_iterations,
            "max_depth": max_depth,
            "verbose": verbose,
        }

        # Configure sub-model (other_backends) if different from main model
        if sub_model_id and sub_model_id != model_id:
            sub_backend_kwargs: Dict[str, Any] = {
                "model_name": sub_model_id,
                "api_key": api_key,
            }
            if provider_id == "deepseek":
                sub_backend_kwargs["base_url"] = "https://api.deepseek.com"
            kwargs["other_backends"] = [backend]
            kwargs["other_backend_kwargs"] = [sub_backend_kwargs]

        return kwargs

    async def deep_analysis(
        self,
        context: str,
        prompt: str,
        provider_id: str = "deepseek",
        model_id: str = "deepseek-chat",
        sub_model_id: Optional[str] = None,
        max_iterations: int = 15,
        max_depth: int = 2,
        verbose: bool = True,
    ) -> AsyncGenerator[RLMEvent, None]:
        """
        Run RLM deep analysis on a given context with streaming events.
        
        In RLM, `prompt` is the main context (becomes `context` variable in the REPL),
        and `root_prompt` is the user's question shown to the root LM.
        
        Args:
            context: The text/data to analyze (can be very large)
            prompt: The user's question about the context
            provider_id: Which provider to use (openai, anthropic, gemini, deepseek)
            model_id: Main model for reasoning
            sub_model_id: Model for sub-calls (defaults to same as model_id)
            max_iterations: Max REPL iterations (constructor param)
            max_depth: Max recursive depth (constructor param)
            verbose: Enable detailed logging
            
        Yields:
            RLMEvent objects for streaming to the frontend
        """
        if not self.is_available:
            yield RLMEvent(
                status=RLMStatus.ERROR,
                message="RLM library not installed. Install with: pip install rlm",
            )
            return

        start_time = time.time()

        yield RLMEvent(
            status=RLMStatus.INITIALIZING,
            message=f"Initializing RLM deep analysis with {provider_id}/{model_id}...",
            metadata={"provider": provider_id, "model": model_id, "context_length": len(context)},
        )

        try:
            from rlm import RLM as RLMEngine
            from rlm.logger import RLMLogger

            # Build constructor kwargs
            rlm_kwargs = self._build_rlm_kwargs(
                provider_id=provider_id,
                model_id=model_id,
                sub_model_id=sub_model_id,
                max_iterations=max_iterations,
                max_depth=max_depth,
                verbose=verbose,
            )

            # Create RLM with in-memory logger for trajectory capture
            rlm_logger = RLMLogger()
            rlm_engine = RLMEngine(**rlm_kwargs, logger=rlm_logger)

            yield RLMEvent(
                status=RLMStatus.RUNNING,
                message="RLM engine initialized. Starting recursive analysis...",
                max_iterations=max_iterations,
                elapsed_seconds=time.time() - start_time,
                metadata={
                    "context_chars": len(context),
                    "context_tokens_approx": len(context) // 4,
                    "max_iterations": max_iterations,
                    "max_depth": max_depth,
                },
            )

            # RLM.completion() is synchronous — run in executor to not block event loop.
            # API: completion(prompt=<context>, root_prompt=<question>)
            #   prompt → becomes the `context` variable in the REPL
            #   root_prompt → short hint visible to the root LM
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: rlm_engine.completion(
                    prompt=context,
                    root_prompt=prompt,
                ),
            )

            elapsed = time.time() - start_time

            # Extract usage stats from RLMChatCompletion
            usage_info: Dict[str, Any] = {}
            if hasattr(result, 'usage_summary') and result.usage_summary:
                try:
                    usage_info = result.usage_summary.to_dict()
                except Exception:
                    pass

            # Extract trajectory info from metadata
            trajectory_info: Dict[str, Any] = {}
            if hasattr(result, 'metadata') and result.metadata:
                iterations = result.metadata.get("iterations", [])
                trajectory_info = {
                    "total_iterations": len(iterations),
                    "has_trajectory": True,
                }

            yield RLMEvent(
                status=RLMStatus.COMPLETED,
                message="Deep analysis completed",
                answer=result.response,
                elapsed_seconds=elapsed,
                metadata={
                    "execution_time": f"{elapsed:.2f}s",
                    "rlm_execution_time": f"{result.execution_time:.2f}s" if hasattr(result, 'execution_time') else None,
                    "root_model": getattr(result, 'root_model', model_id),
                    "provider": provider_id,
                    "model": model_id,
                    "usage": usage_info,
                    **trajectory_info,
                },
            )

            # Cleanup persistent environments
            if hasattr(rlm_engine, 'close'):
                rlm_engine.close()

        except ImportError as e:
            yield RLMEvent(
                status=RLMStatus.ERROR,
                message=f"RLM dependency error: {e}. Try: pip install rlm",
                elapsed_seconds=time.time() - start_time,
            )
        except Exception as e:
            logger.error(f"[RLM] Deep analysis failed: {e}", exc_info=True)
            yield RLMEvent(
                status=RLMStatus.ERROR,
                message=f"Analysis failed: {str(e)}",
                elapsed_seconds=time.time() - start_time,
                metadata={"error_type": type(e).__name__},
            )

    async def analyze_documents(
        self,
        user_email: str,
        prompt: str,
        document_ids: Optional[List[str]] = None,
        provider_id: str = "deepseek",
        model_id: str = "deepseek-chat",
        max_iterations: int = 15,
    ) -> AsyncGenerator[RLMEvent, None]:
        """
        Run RLM analysis over RAG documents.
        Loads document content from Supabase and feeds it to RLM as the prompt context.
        """
        yield RLMEvent(
            status=RLMStatus.INITIALIZING,
            message="Loading documents for deep analysis...",
        )

        try:
            from supabase_client.rag import get_rag_store
            rag_store = get_rag_store()

            # Load user's documents
            user_docs = rag_store.list_documents(user_email, status="ready", limit=100)
            if not user_docs:
                yield RLMEvent(
                    status=RLMStatus.ERROR,
                    message="No documents found. Upload documents first.",
                )
                return

            # Filter to selected documents
            if document_ids:
                user_docs = [d for d in user_docs if d["id"] in document_ids]

            if not user_docs:
                yield RLMEvent(
                    status=RLMStatus.ERROR,
                    message="Selected documents not found or not ready.",
                )
                return

            # Build full document context
            context_parts = []
            total_chars = 0
            for doc in user_docs:
                doc_id = doc["id"]
                doc_name = doc.get("filename", doc_id)

                # Get all chunks for this document
                chunks = rag_store.get_document_chunks(doc_id, user_email)
                if chunks:
                    doc_text = "\n".join(c.get("content", "") for c in chunks)
                    context_parts.append(f"=== Document: {doc_name} ===\n{doc_text}")
                    total_chars += len(doc_text)

            if not context_parts:
                yield RLMEvent(
                    status=RLMStatus.ERROR,
                    message="Could not load document content.",
                )
                return

            full_context = "\n\n".join(context_parts)

            yield RLMEvent(
                status=RLMStatus.INITIALIZING,
                message=f"Loaded {len(user_docs)} document(s), {total_chars:,} chars. Starting deep analysis...",
                metadata={
                    "documents": len(user_docs),
                    "total_chars": total_chars,
                    "document_names": [d.get("filename", "?") for d in user_docs],
                },
            )

            # Run RLM analysis on the combined context
            async for event in self.deep_analysis(
                context=full_context,
                prompt=prompt,
                provider_id=provider_id,
                model_id=model_id,
                max_iterations=max_iterations,
            ):
                yield event

        except ImportError as e:
            yield RLMEvent(
                status=RLMStatus.ERROR,
                message=f"RAG store not available: {e}",
            )
        except Exception as e:
            logger.error(f"[RLM] Document analysis failed: {e}", exc_info=True)
            yield RLMEvent(
                status=RLMStatus.ERROR,
                message=f"Document analysis failed: {str(e)}",
            )


# Singleton instance (initialized in main.py)
_rlm_service: Optional[RLMService] = None


def get_rlm_service() -> Optional[RLMService]:
    """Get the global RLM service instance."""
    return _rlm_service


def init_rlm_service(provider_manager) -> RLMService:
    """Initialize the global RLM service."""
    global _rlm_service
    _rlm_service = RLMService(provider_manager)
    logger.info(f"[RLM] Service initialized. Library available: {_rlm_service.is_available}")
    return _rlm_service
