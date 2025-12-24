"""
Process Events System - Real-time visualization of backend processes.

This module provides infrastructure for emitting and tracking process events
such as:
- Thinking/Reasoning stages (like Google Gemini/DeepSeek R1)
- Context compression steps
- Chunking operations
- RAG retrieval stages
- Multi-model orchestration

Events are streamed to the frontend via SSE for real-time visualization.
"""

import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, AsyncGenerator, Callable
from collections import defaultdict

logger = logging.getLogger(__name__)


class ProcessType(str, Enum):
    """Types of processes that can be tracked."""
    THINKING = "thinking"           # Model reasoning/thinking
    COMPRESSION = "compression"     # Context compression
    CHUNKING = "chunking"           # Text chunking
    EMBEDDING = "embedding"         # Embedding generation
    RAG_RETRIEVAL = "rag_retrieval" # RAG retrieval
    MULTI_MODEL = "multi_model"     # Multi-model orchestration
    STREAMING = "streaming"         # Response streaming
    TOOL_CALL = "tool_call"         # Tool/function calls
    SEARCH = "search"               # Web/knowledge search
    VALIDATION = "validation"       # Input/output validation


class ProcessStatus(str, Enum):
    """Status of a process."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class ProcessStep:
    """A single step within a process."""
    id: str
    name: str
    status: ProcessStatus = ProcessStatus.PENDING
    message: str = ""
    progress: float = 0.0  # 0-100
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status.value,
            "message": self.message,
            "progress": self.progress,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "metadata": self.metadata
        }


@dataclass
class Process:
    """A tracked process with multiple steps."""
    id: str
    type: ProcessType
    name: str
    conversation_id: str
    message_id: Optional[str] = None
    status: ProcessStatus = ProcessStatus.PENDING
    steps: List[ProcessStep] = field(default_factory=list)
    progress: float = 0.0  # Overall progress 0-100
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type.value,
            "name": self.name,
            "conversation_id": self.conversation_id,
            "message_id": self.message_id,
            "status": self.status.value,
            "steps": [step.to_dict() for step in self.steps],
            "progress": self.progress,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "error": self.error,
            "metadata": self.metadata
        }


class ProcessEventEmitter:
    """Emits process events for real-time tracking."""
    
    def __init__(self):
        self._processes: Dict[str, Process] = {}
        self._subscribers: Dict[str, List[asyncio.Queue]] = defaultdict(list)
        self._global_subscribers: List[asyncio.Queue] = []
        
    def create_process(
        self,
        process_type: ProcessType,
        name: str,
        conversation_id: str,
        message_id: Optional[str] = None,
        steps: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Process:
        """Create a new tracked process."""
        process_id = str(uuid.uuid4())
        
        # Create process steps
        process_steps = []
        if steps:
            for i, step_name in enumerate(steps):
                process_steps.append(ProcessStep(
                    id=f"{process_id}_step_{i}",
                    name=step_name
                ))
        
        process = Process(
            id=process_id,
            type=process_type,
            name=name,
            conversation_id=conversation_id,
            message_id=message_id,
            steps=process_steps,
            metadata=metadata or {}
        )
        
        self._processes[process_id] = process
        return process
    
    async def start_process(self, process: Process) -> None:
        """Mark process as started and emit event."""
        process.status = ProcessStatus.RUNNING
        process.started_at = datetime.now().isoformat()
        await self._emit_event("process_started", process)
        logger.info(f"[ProcessEvent] Started: {process.type.value} - {process.name}")
    
    async def update_process(
        self,
        process: Process,
        message: Optional[str] = None,
        progress: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Update process state and emit event."""
        if progress is not None:
            process.progress = progress
        if metadata:
            process.metadata.update(metadata)
        
        await self._emit_event("process_updated", process, extra_data={
            "message": message
        })
    
    async def start_step(self, process: Process, step_index: int, message: str = "") -> None:
        """Start a specific step in the process."""
        if step_index < len(process.steps):
            step = process.steps[step_index]
            step.status = ProcessStatus.RUNNING
            step.started_at = datetime.now().isoformat()
            step.message = message
            
            # Update overall progress
            process.progress = (step_index / len(process.steps)) * 100
            
            await self._emit_event("step_started", process, extra_data={
                "step_index": step_index,
                "step": step.to_dict()
            })
            logger.debug(f"[ProcessEvent] Step started: {step.name}")
    
    async def complete_step(
        self,
        process: Process,
        step_index: int,
        message: str = "",
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Complete a specific step."""
        if step_index < len(process.steps):
            step = process.steps[step_index]
            step.status = ProcessStatus.COMPLETED
            step.completed_at = datetime.now().isoformat()
            step.message = message
            step.progress = 100
            if metadata:
                step.metadata.update(metadata)
            
            # Update overall progress
            completed_steps = sum(1 for s in process.steps if s.status == ProcessStatus.COMPLETED)
            process.progress = (completed_steps / len(process.steps)) * 100
            
            await self._emit_event("step_completed", process, extra_data={
                "step_index": step_index,
                "step": step.to_dict()
            })
            logger.debug(f"[ProcessEvent] Step completed: {step.name}")
    
    async def complete_process(
        self,
        process: Process,
        message: str = "",
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Mark process as completed."""
        process.status = ProcessStatus.COMPLETED
        process.completed_at = datetime.now().isoformat()
        process.progress = 100
        if metadata:
            process.metadata.update(metadata)
        
        await self._emit_event("process_completed", process, extra_data={
            "message": message
        })
        logger.info(f"[ProcessEvent] Completed: {process.type.value} - {process.name}")
    
    async def fail_process(self, process: Process, error: str) -> None:
        """Mark process as failed."""
        process.status = ProcessStatus.FAILED
        process.completed_at = datetime.now().isoformat()
        process.error = error
        
        await self._emit_event("process_failed", process, extra_data={
            "error": error
        })
        logger.error(f"[ProcessEvent] Failed: {process.type.value} - {error}")
    
    async def emit_thinking(
        self,
        process: Process,
        thought: str,
        stage: str = "reasoning"
    ) -> None:
        """Emit a thinking/reasoning event (like Google Gemini's thinking)."""
        await self._emit_event("thinking", process, extra_data={
            "thought": thought,
            "stage": stage,
            "timestamp": datetime.now().isoformat()
        })
    
    async def _emit_event(
        self,
        event_type: str,
        process: Process,
        extra_data: Optional[Dict[str, Any]] = None
    ) -> None:
        """Emit event to all subscribers."""
        event = {
            "type": event_type,
            "process": process.to_dict(),
            "timestamp": datetime.now().isoformat(),
            **(extra_data or {})
        }
        
        # Send to conversation subscribers
        for queue in self._subscribers.get(process.conversation_id, []):
            try:
                await queue.put(event)
            except Exception as e:
                logger.warning(f"Failed to send event to subscriber: {e}")
        
        # Send to global subscribers
        for queue in self._global_subscribers:
            try:
                await queue.put(event)
            except Exception as e:
                logger.warning(f"Failed to send event to global subscriber: {e}")
    
    def subscribe(self, conversation_id: Optional[str] = None) -> asyncio.Queue:
        """Subscribe to process events."""
        queue = asyncio.Queue()
        if conversation_id:
            self._subscribers[conversation_id].append(queue)
        else:
            self._global_subscribers.append(queue)
        return queue
    
    def unsubscribe(self, queue: asyncio.Queue, conversation_id: Optional[str] = None) -> None:
        """Unsubscribe from process events."""
        if conversation_id:
            if queue in self._subscribers.get(conversation_id, []):
                self._subscribers[conversation_id].remove(queue)
        else:
            if queue in self._global_subscribers:
                self._global_subscribers.remove(queue)
    
    def get_process(self, process_id: str) -> Optional[Process]:
        """Get a process by ID."""
        return self._processes.get(process_id)
    
    def get_processes_for_conversation(self, conversation_id: str) -> List[Process]:
        """Get all processes for a conversation."""
        return [
            p for p in self._processes.values()
            if p.conversation_id == conversation_id
        ]
    
    def cleanup_old_processes(self, max_age_seconds: int = 3600) -> None:
        """Remove old completed/failed processes."""
        now = datetime.now()
        to_remove = []
        for process_id, process in self._processes.items():
            if process.completed_at:
                completed = datetime.fromisoformat(process.completed_at)
                if (now - completed).total_seconds() > max_age_seconds:
                    to_remove.append(process_id)
        
        for process_id in to_remove:
            del self._processes[process_id]


# Global process event emitter instance
process_emitter = ProcessEventEmitter()


async def stream_process_events(
    conversation_id: Optional[str] = None
) -> AsyncGenerator[str, None]:
    """Stream process events as SSE."""
    queue = process_emitter.subscribe(conversation_id)
    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30)
                yield f"data: {json.dumps(event)}\n\n"
            except asyncio.TimeoutError:
                # Send keepalive
                yield f": keepalive\n\n"
    finally:
        process_emitter.unsubscribe(queue, conversation_id)


# === Context managers for easy process tracking ===

class ProcessContext:
    """Context manager for tracking a process."""
    
    def __init__(
        self,
        process_type: ProcessType,
        name: str,
        conversation_id: str,
        message_id: Optional[str] = None,
        steps: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        self.process = process_emitter.create_process(
            process_type=process_type,
            name=name,
            conversation_id=conversation_id,
            message_id=message_id,
            steps=steps,
            metadata=metadata
        )
        self._current_step = 0
    
    async def __aenter__(self) -> 'ProcessContext':
        await process_emitter.start_process(self.process)
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        if exc_type:
            await process_emitter.fail_process(self.process, str(exc_val))
        else:
            await process_emitter.complete_process(self.process)
    
    async def step(self, message: str = "", metadata: Optional[Dict[str, Any]] = None) -> None:
        """Move to next step."""
        if self._current_step < len(self.process.steps):
            # Complete current step
            await process_emitter.complete_step(
                self.process, self._current_step, message, metadata
            )
            self._current_step += 1
            
            # Start next step if exists
            if self._current_step < len(self.process.steps):
                await process_emitter.start_step(self.process, self._current_step)
    
    async def update(
        self,
        message: Optional[str] = None,
        progress: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Update process state."""
        await process_emitter.update_process(self.process, message, progress, metadata)
    
    async def think(self, thought: str, stage: str = "reasoning") -> None:
        """Emit thinking event."""
        await process_emitter.emit_thinking(self.process, thought, stage)


# === Compression tracking ===

async def track_compression(
    conversation_id: str,
    original_messages: int,
    original_tokens: int
) -> ProcessContext:
    """Create a process context for tracking compression."""
    return ProcessContext(
        process_type=ProcessType.COMPRESSION,
        name="Context Compression",
        conversation_id=conversation_id,
        steps=[
            "Analyzing message history",
            "Building semantic chunks",
            "Computing embeddings",
            "Retrieving relevant context",
            "Assembling compressed context"
        ],
        metadata={
            "original_messages": original_messages,
            "original_tokens": original_tokens
        }
    )


# === Multi-model tracking ===

async def track_multi_model(
    conversation_id: str,
    models: List[str]
) -> ProcessContext:
    """Create a process context for multi-model execution."""
    steps = [f"Query: {model}" for model in models] + ["Aggregating responses"]
    
    return ProcessContext(
        process_type=ProcessType.MULTI_MODEL,
        name="Multi-Model Execution",
        conversation_id=conversation_id,
        steps=steps,
        metadata={
            "models": models,
            "model_count": len(models)
        }
    )
