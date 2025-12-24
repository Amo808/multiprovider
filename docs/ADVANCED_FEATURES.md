# Advanced Features Documentation

## Overview

This document describes the advanced features implemented in MULTECH AI:

1. **Separate Message Database** - Independent storage for messages with full-text search
2. **Process Visualization** - Real-time tracking of backend processes (like Google Gemini)
3. **Thinking/Reasoning Panel** - Visual display of AI thinking steps
4. **Multi-Model Chat** - Run multiple AI models in parallel (like OpenRouter)

---

## 1. Separate Message Database

### Purpose
Provides dedicated storage for messages with advanced features like:
- Full-text search
- Message versioning
- Soft deletes
- Attachment support
- Token usage tracking
- Thinking steps storage

### Database Schema

```
messages/
├── messages          - Main message storage
├── message_meta      - Key-value metadata
├── message_tokens    - Token usage tracking
├── message_attachments - File attachments
├── message_feedback  - User feedback (like/dislike)
├── thinking_steps    - Reasoning steps
└── multi_model_responses - Multi-model results
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/messages/search` | GET | Full-text search |
| `/api/messages/{conversation_id}/history` | GET | Get messages |
| `/api/messages/{message_id}/thinking` | GET | Get thinking steps |
| `/api/messages/{message_id}/multi-model` | GET | Get multi-model responses |
| `/api/messages/{message_id}/feedback` | POST | Add feedback |
| `/api/messages/{message_id}` | DELETE | Soft delete |
| `/api/messages/stats` | GET | Statistics |

---

## 2. Process Events System

### Purpose
Real-time visualization of backend processes:
- Context compression
- RAG retrieval
- Chunking
- Embedding generation
- Multi-model orchestration

### Process Types

| Type | Description |
|------|-------------|
| `thinking` | Model reasoning/thinking |
| `compression` | Context compression |
| `chunking` | Text chunking |
| `embedding` | Embedding generation |
| `rag_retrieval` | RAG retrieval |
| `multi_model` | Multi-model orchestration |
| `streaming` | Response streaming |
| `tool_call` | Tool/function calls |

### Frontend Components

```tsx
// ProcessViewer - Shows all active processes
<ProcessViewer conversationId={conversationId} />

// Hook for custom process handling
const { processes, isConnected } = useProcessEvents({
  conversationId,
  onEvent: (event) => console.log(event)
});
```

### API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/processes/stream` | GET (SSE) | Stream process events |
| `/api/processes/{conversation_id}` | GET | Get processes |
| `/api/processes/{process_id}/details` | GET | Process details |

---

## 3. Thinking/Reasoning Panel

### Purpose
Visual display of AI thinking steps (similar to Google Gemini's thinking feature):
- Shows reasoning stages
- Expandable thought details
- Timeline visualization
- Duration and token tracking

### Frontend Component

```tsx
// Floating panel
<ThinkingPanel
  conversationId={conversationId}
  isFloating
  onClose={() => setShowPanel(false)}
/>

// Hook for accessing thinking data
const { sessions, isConnected } = useThinkingSessions(conversationId);
```

### Thinking Stages

| Stage | Description |
|-------|-------------|
| `analyzing` | Analyzing input |
| `planning` | Planning response |
| `reasoning` | Logical reasoning |
| `evaluating` | Evaluating options |
| `synthesizing` | Synthesizing answer |

---

## 4. Multi-Model Chat

### Purpose
Run multiple AI models simultaneously (similar to OpenRouter):
- Parallel execution
- Response comparison
- Consensus aggregation
- Fallback chains

### Execution Modes

| Mode | Description |
|------|-------------|
| `parallel` | Run all models, show all responses |
| `fastest` | Return first completed response |
| `consensus` | Aggregate and find consensus |
| `comparison` | Side-by-side comparison |
| `fallback` | Try models in order until success |

### Frontend Component

```tsx
<MultiModelChat
  conversationId={conversationId}
  availableModels={models}
  onSend={(message, result) => console.log(result)}
/>

// Hook for custom multi-model execution
const { execute, cancel, responses, isExecuting } = useMultiModel({
  onStream: (model, content) => console.log(model, content),
  onComplete: (result) => console.log(result)
});
```

### Presets

| Preset | Mode | Description |
|--------|------|-------------|
| `balanced` | parallel | Mix of speed and quality |
| `fast` | fastest | Use fastest available model |
| `quality` | consensus | Best models with consensus |
| `reliable` | fallback | Try models until success |

### API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/multi-model/presets` | GET | Get presets |
| `/api/multi-model/chat` | POST | Execute multi-model |
| `/api/multi-model/cancel/{id}` | POST | Cancel execution |

---

## Usage in ChatInterface

The ChatInterface now includes buttons in the status bar:
- **Processes** - Opens the ProcessViewer panel
- **Thinking** - Opens the floating ThinkingPanel

Both panels show real-time updates during AI responses.

---

## Backend Integration

### Emitting Process Events

```python
from process_events import process_emitter, ProcessType

# Create and track a process
process = process_emitter.create_process(
    process_type=ProcessType.COMPRESSION,
    name="Context Compression",
    conversation_id=conversation_id,
    steps=["Analyze", "Compress", "Verify"]
)

await process_emitter.start_process(process)
await process_emitter.update_process(process, progress=50)
await process_emitter.complete_process(process)

# Emit thinking events
await process_emitter.emit_thinking(
    process,
    thought="Analyzing the query structure...",
    stage="analyzing"
)
```

### Using Context Managers

```python
from process_events import ProcessContext, ProcessType

async with ProcessContext(
    ProcessType.COMPRESSION,
    "Compress Context",
    conversation_id
) as ctx:
    await ctx.step("Step 1 complete")
    await ctx.think("Reasoning about next step...")
    await ctx.update(progress=75)
```

---

## Future Enhancements

1. **Model Routing** - Automatic model selection based on query type
2. **Cost Optimization** - Balance quality vs cost across models
3. **Response Caching** - Cache common responses for faster retrieval
4. **A/B Testing** - Compare model performance over time
5. **Custom Thinking Prompts** - User-defined reasoning frameworks
