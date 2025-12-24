"""
Multi-Model Orchestration System

This module provides infrastructure for running multiple AI models in parallel
within a single chat, similar to OpenRouter's approach.

Features:
- Parallel model execution
- Response aggregation and comparison
- Model voting and consensus
- Streaming responses from multiple models
- Model-specific configuration
"""

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, AsyncGenerator, Tuple

logger = logging.getLogger(__name__)


class MultiModelMode(str, Enum):
    """Modes for multi-model execution."""
    PARALLEL = "parallel"      # Run all models simultaneously, show all responses
    FASTEST = "fastest"        # Return response from fastest model
    CONSENSUS = "consensus"    # Aggregate responses, find consensus
    COMPARISON = "comparison"  # Side-by-side comparison
    FALLBACK = "fallback"      # Try models in order until success


@dataclass
class ModelConfig:
    """Configuration for a single model in multi-model setup."""
    provider: str
    model: str
    display_name: Optional[str] = None
    weight: float = 1.0  # Weight for consensus voting
    timeout: float = 60.0  # Timeout in seconds
    enabled: bool = True
    params: Dict[str, Any] = field(default_factory=dict)  # Model-specific params
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "provider": self.provider,
            "model": self.model,
            "display_name": self.display_name or f"{self.provider}/{self.model}",
            "weight": self.weight,
            "timeout": self.timeout,
            "enabled": self.enabled,
            "params": self.params
        }


@dataclass
class ModelResponse:
    """Response from a single model."""
    model_config: ModelConfig
    content: str
    tokens_used: Optional[Dict[str, int]] = None
    latency_ms: float = 0
    success: bool = True
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "model": self.model_config.to_dict(),
            "content": self.content,
            "tokens_used": self.tokens_used,
            "latency_ms": self.latency_ms,
            "success": self.success,
            "error": self.error,
            "metadata": self.metadata
        }


@dataclass 
class MultiModelResult:
    """Aggregated result from multi-model execution."""
    id: str
    mode: MultiModelMode
    responses: List[ModelResponse]
    primary_response: Optional[str] = None  # Selected/aggregated response
    consensus_score: Optional[float] = None  # Agreement score (0-1)
    total_latency_ms: float = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "mode": self.mode.value,
            "responses": [r.to_dict() for r in self.responses],
            "primary_response": self.primary_response,
            "consensus_score": self.consensus_score,
            "total_latency_ms": self.total_latency_ms,
            "metadata": self.metadata
        }


class MultiModelOrchestrator:
    """Orchestrates multi-model execution."""
    
    def __init__(self, provider_manager):
        self.provider_manager = provider_manager
        self._active_executions: Dict[str, bool] = {}  # Track cancellable executions
    
    async def execute(
        self,
        models: List[ModelConfig],
        messages: List[Dict[str, str]],
        mode: MultiModelMode = MultiModelMode.PARALLEL,
        generation_params: Optional[Dict[str, Any]] = None,
        on_stream: Optional[callable] = None,  # Callback for streaming chunks
        on_model_complete: Optional[callable] = None  # Callback when model finishes
    ) -> MultiModelResult:
        """Execute query across multiple models."""
        
        execution_id = str(uuid.uuid4())
        self._active_executions[execution_id] = True
        
        start_time = datetime.now()
        result = MultiModelResult(
            id=execution_id,
            mode=mode,
            responses=[],
            metadata={
                "models_count": len(models),
                "started_at": start_time.isoformat()
            }
        )
        
        try:
            if mode == MultiModelMode.PARALLEL:
                result = await self._execute_parallel(
                    execution_id, models, messages, generation_params,
                    on_stream, on_model_complete, result
                )
            elif mode == MultiModelMode.FASTEST:
                result = await self._execute_fastest(
                    execution_id, models, messages, generation_params,
                    on_stream, result
                )
            elif mode == MultiModelMode.FALLBACK:
                result = await self._execute_fallback(
                    execution_id, models, messages, generation_params,
                    on_stream, result
                )
            elif mode == MultiModelMode.CONSENSUS:
                result = await self._execute_consensus(
                    execution_id, models, messages, generation_params, result
                )
            elif mode == MultiModelMode.COMPARISON:
                result = await self._execute_comparison(
                    execution_id, models, messages, generation_params, result
                )
                
            result.total_latency_ms = (datetime.now() - start_time).total_seconds() * 1000
            result.metadata["completed_at"] = datetime.now().isoformat()
            
        except Exception as e:
            logger.error(f"Multi-model execution failed: {e}")
            result.metadata["error"] = str(e)
        finally:
            del self._active_executions[execution_id]
        
        return result
    
    async def _execute_parallel(
        self,
        execution_id: str,
        models: List[ModelConfig],
        messages: List[Dict[str, str]],
        generation_params: Optional[Dict[str, Any]],
        on_stream: Optional[callable],
        on_model_complete: Optional[callable],
        result: MultiModelResult
    ) -> MultiModelResult:
        """Execute all models in parallel."""
        
        async def run_model(model_config: ModelConfig) -> ModelResponse:
            if not self._active_executions.get(execution_id, False):
                return ModelResponse(
                    model_config=model_config,
                    content="",
                    success=False,
                    error="Execution cancelled"
                )
            
            start = datetime.now()
            try:
                adapter = self.provider_manager.registry.get(model_config.provider)
                if not adapter:
                    raise ValueError(f"Provider {model_config.provider} not found")
                
                # Merge params
                params = {**(generation_params or {}), **(model_config.params or {})}
                
                # Stream response
                content = ""
                tokens_used = None
                
                async for chunk in adapter.generate_stream(
                    messages=messages,
                    model=model_config.model,
                    **params
                ):
                    if isinstance(chunk, dict):
                        if chunk.get("done"):
                            tokens_used = chunk.get("usage")
                            break
                        content += chunk.get("content", "")
                        if on_stream:
                            await on_stream(model_config, chunk.get("content", ""))
                    else:
                        content += str(chunk)
                        if on_stream:
                            await on_stream(model_config, str(chunk))
                
                latency = (datetime.now() - start).total_seconds() * 1000
                
                response = ModelResponse(
                    model_config=model_config,
                    content=content,
                    tokens_used=tokens_used,
                    latency_ms=latency,
                    success=True
                )
                
                if on_model_complete:
                    await on_model_complete(response)
                
                return response
                
            except asyncio.TimeoutError:
                return ModelResponse(
                    model_config=model_config,
                    content="",
                    latency_ms=(datetime.now() - start).total_seconds() * 1000,
                    success=False,
                    error=f"Timeout after {model_config.timeout}s"
                )
            except Exception as e:
                return ModelResponse(
                    model_config=model_config,
                    content="",
                    latency_ms=(datetime.now() - start).total_seconds() * 1000,
                    success=False,
                    error=str(e)
                )
        
        # Run all models in parallel with timeouts
        tasks = [
            asyncio.wait_for(run_model(m), timeout=m.timeout)
            for m in models if m.enabled
        ]
        
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        
        for resp in responses:
            if isinstance(resp, ModelResponse):
                result.responses.append(resp)
            elif isinstance(resp, Exception):
                logger.error(f"Model execution error: {resp}")
        
        # Set primary response (first successful)
        for resp in result.responses:
            if resp.success:
                result.primary_response = resp.content
                break
        
        return result
    
    async def _execute_fastest(
        self,
        execution_id: str,
        models: List[ModelConfig],
        messages: List[Dict[str, str]],
        generation_params: Optional[Dict[str, Any]],
        on_stream: Optional[callable],
        result: MultiModelResult
    ) -> MultiModelResult:
        """Return response from the fastest model."""
        
        async def run_model_with_cancel(model_config: ModelConfig, cancel_event: asyncio.Event) -> ModelResponse:
            start = datetime.now()
            try:
                adapter = self.provider_manager.registry.get(model_config.provider)
                if not adapter:
                    raise ValueError(f"Provider {model_config.provider} not found")
                
                params = {**(generation_params or {}), **(model_config.params or {})}
                content = ""
                tokens_used = None
                
                async for chunk in adapter.generate_stream(
                    messages=messages,
                    model=model_config.model,
                    **params
                ):
                    if cancel_event.is_set():
                        break
                        
                    if isinstance(chunk, dict):
                        if chunk.get("done"):
                            tokens_used = chunk.get("usage")
                            break
                        content += chunk.get("content", "")
                        if on_stream:
                            await on_stream(model_config, chunk.get("content", ""))
                    else:
                        content += str(chunk)
                        if on_stream:
                            await on_stream(model_config, str(chunk))
                
                return ModelResponse(
                    model_config=model_config,
                    content=content,
                    tokens_used=tokens_used,
                    latency_ms=(datetime.now() - start).total_seconds() * 1000,
                    success=True
                )
                
            except Exception as e:
                return ModelResponse(
                    model_config=model_config,
                    content="",
                    latency_ms=(datetime.now() - start).total_seconds() * 1000,
                    success=False,
                    error=str(e)
                )
        
        cancel_event = asyncio.Event()
        tasks = {
            asyncio.create_task(run_model_with_cancel(m, cancel_event)): m
            for m in models if m.enabled
        }
        
        # Wait for first successful completion
        done, pending = await asyncio.wait(
            tasks.keys(),
            return_when=asyncio.FIRST_COMPLETED
        )
        
        # Cancel remaining tasks
        cancel_event.set()
        for task in pending:
            task.cancel()
        
        # Get result from completed task
        for task in done:
            resp = task.result()
            if resp.success:
                result.responses.append(resp)
                result.primary_response = resp.content
                break
        
        return result
    
    async def _execute_fallback(
        self,
        execution_id: str,
        models: List[ModelConfig],
        messages: List[Dict[str, str]],
        generation_params: Optional[Dict[str, Any]],
        on_stream: Optional[callable],
        result: MultiModelResult
    ) -> MultiModelResult:
        """Try models in order until one succeeds."""
        
        for model_config in models:
            if not model_config.enabled:
                continue
            if not self._active_executions.get(execution_id, False):
                break
                
            start = datetime.now()
            try:
                adapter = self.provider_manager.registry.get(model_config.provider)
                if not adapter:
                    continue
                
                params = {**(generation_params or {}), **(model_config.params or {})}
                content = ""
                tokens_used = None
                
                async for chunk in adapter.generate_stream(
                    messages=messages,
                    model=model_config.model,
                    **params
                ):
                    if isinstance(chunk, dict):
                        if chunk.get("done"):
                            tokens_used = chunk.get("usage")
                            break
                        content += chunk.get("content", "")
                        if on_stream:
                            await on_stream(model_config, chunk.get("content", ""))
                    else:
                        content += str(chunk)
                        if on_stream:
                            await on_stream(model_config, str(chunk))
                
                response = ModelResponse(
                    model_config=model_config,
                    content=content,
                    tokens_used=tokens_used,
                    latency_ms=(datetime.now() - start).total_seconds() * 1000,
                    success=True
                )
                result.responses.append(response)
                result.primary_response = content
                break  # Success, stop trying
                
            except Exception as e:
                result.responses.append(ModelResponse(
                    model_config=model_config,
                    content="",
                    latency_ms=(datetime.now() - start).total_seconds() * 1000,
                    success=False,
                    error=str(e)
                ))
                # Continue to next model
        
        return result
    
    async def _execute_consensus(
        self,
        execution_id: str,
        models: List[ModelConfig],
        messages: List[Dict[str, str]],
        generation_params: Optional[Dict[str, Any]],
        result: MultiModelResult
    ) -> MultiModelResult:
        """Run all models and find consensus."""
        
        # First, execute all models in parallel
        parallel_result = await self._execute_parallel(
            execution_id, models, messages, generation_params,
            None, None, result
        )
        
        # Calculate simple consensus based on response similarity
        successful_responses = [r for r in parallel_result.responses if r.success]
        if len(successful_responses) > 1:
            # Simple consensus: weighted average length comparison
            # In production, use embeddings for semantic similarity
            total_weight = sum(r.model_config.weight for r in successful_responses)
            weighted_contents = [
                (r.content, r.model_config.weight / total_weight)
                for r in successful_responses
            ]
            
            # Use longest response as primary (simple heuristic)
            primary = max(successful_responses, key=lambda r: len(r.content) * r.model_config.weight)
            result.primary_response = primary.content
            result.consensus_score = 0.8  # Placeholder - implement real similarity
            
        elif len(successful_responses) == 1:
            result.primary_response = successful_responses[0].content
            result.consensus_score = 1.0
        
        return result
    
    async def _execute_comparison(
        self,
        execution_id: str,
        models: List[ModelConfig],
        messages: List[Dict[str, str]],
        generation_params: Optional[Dict[str, Any]],
        result: MultiModelResult
    ) -> MultiModelResult:
        """Execute all models for side-by-side comparison."""
        
        # Same as parallel, but format responses differently in frontend
        return await self._execute_parallel(
            execution_id, models, messages, generation_params,
            None, None, result
        )
    
    def cancel_execution(self, execution_id: str) -> bool:
        """Cancel an active execution."""
        if execution_id in self._active_executions:
            self._active_executions[execution_id] = False
            return True
        return False


# === Predefined Multi-Model Configurations ===

MULTI_MODEL_PRESETS = {
    "balanced": {
        "name": "Balanced",
        "description": "Mix of speed and quality",
        "mode": MultiModelMode.PARALLEL,
        "models": [
            ModelConfig(provider="deepseek", model="deepseek-chat", weight=1.0),
            ModelConfig(provider="openai", model="gpt-4o-mini", weight=0.8),
            ModelConfig(provider="anthropic", model="claude-3-haiku-20240307", weight=0.8),
        ]
    },
    "fast": {
        "name": "Fast Response",
        "description": "Use fastest available model",
        "mode": MultiModelMode.FASTEST,
        "models": [
            ModelConfig(provider="deepseek", model="deepseek-chat", timeout=30),
            ModelConfig(provider="openai", model="gpt-4o-mini", timeout=30),
            ModelConfig(provider="anthropic", model="claude-3-haiku-20240307", timeout=30),
        ]
    },
    "quality": {
        "name": "High Quality",
        "description": "Best models with consensus",
        "mode": MultiModelMode.CONSENSUS,
        "models": [
            ModelConfig(provider="openai", model="gpt-4o", weight=1.2),
            ModelConfig(provider="anthropic", model="claude-3-opus-20240229", weight=1.2),
            ModelConfig(provider="deepseek", model="deepseek-chat", weight=1.0),
        ]
    },
    "reliable": {
        "name": "Reliable Fallback",
        "description": "Try models in order until success",
        "mode": MultiModelMode.FALLBACK,
        "models": [
            ModelConfig(provider="deepseek", model="deepseek-chat"),
            ModelConfig(provider="openai", model="gpt-4o-mini"),
            ModelConfig(provider="anthropic", model="claude-3-haiku-20240307"),
        ]
    }
}
