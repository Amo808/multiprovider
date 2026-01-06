# RAG Integration Guide

## Overview

The RAG (Retrieval-Augmented Generation) system is now fully integrated into the chat interface. It allows users to:

1. **Upload documents** (PDF, TXT, MD, DOCX, CSV, JSON)
2. **Automatically search** relevant context when sending messages
3. **View citations** showing which documents were used in responses

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
├─────────────────────────────────────────────────────────────────┤
│  ChatInterface.tsx                                              │
│    ├── useRAG() hook - manages RAG state                        │
│    ├── RAGToggle - enable/disable RAG                           │
│    └── DocumentManager - upload/manage documents                │
│                                                                 │
│  MessageBubble.tsx                                              │
│    └── RAGSources - displays citations under messages           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                 │
├─────────────────────────────────────────────────────────────────┤
│  main.py                                                        │
│    ├── /api/rag/* - RAG API endpoints                           │
│    └── /api/chat/send - includes RAG context in system prompt   │
│                                                                 │
│  supabase_client/rag.py                                         │
│    ├── RAGStore - document management                           │
│    ├── Chunking & Embeddings (OpenAI)                           │
│    ├── Hybrid Search (vector + keyword)                         │
│    ├── Reranking (GPT-4o-mini)                                  │
│    └── Citation formatting                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SUPABASE                                 │
├─────────────────────────────────────────────────────────────────┤
│  Tables:                                                        │
│    ├── documents - document metadata                            │
│    └── document_chunks - chunks with embeddings                 │
│                                                                 │
│  Storage:                                                       │
│    └── documents bucket - original files                        │
│                                                                 │
│  Functions:                                                     │
│    ├── search_document_chunks_v2 - vector search                │
│    └── hybrid_search_chunks_v2 - hybrid search                  │
└─────────────────────────────────────────────────────────────────┘
```

## User Flow

### 1. Upload Documents

1. Click the 📄 button in the chat input
2. Open the Document Manager modal
3. Drag & drop or select files to upload
4. Wait for processing (chunking + embedding)
5. Documents appear with "ready" status

### 2. Chat with RAG

1. When you have documents, the **RAG toggle** appears next to the input
2. Click to enable/disable RAG search
3. Send a message - the system automatically:
   * Searches your documents for relevant chunks
   * Reranks results for better relevance
   * Adds context to the AI's system prompt
4. The AI responds using document knowledge
5. **Citations appear** under the response showing sources

### 3. View Citations

After an AI response with RAG:

* See "📄 Sources (N)" under the message
* Each source shows:
  * Document name
  * Section/page (if available)
  * Relevance percentage
* Click to expand/collapse full source list

## API Endpoints

### RAG Status

```
GET /api/rag/status
Response: { configured: bool, supported_types: string[] }
```

### Upload Document

```
POST /api/rag/documents/upload
Body: FormData with 'file' and optional 'metadata'
Response: { document: Document }
```

### List Documents

```
GET /api/rag/documents?status=ready&limit=50
Response: { documents: Document[] }
```

### Search Documents

```
POST /api/rag/search
Body: { query: string, document_ids?: string[], limit: int, use_hybrid: bool }
Response: { results: SearchResult[], context: string }
```

### Build Context

```
POST /api/rag/context
Body: { query: string, max_tokens: int, use_hybrid: bool }
Response: { context: string, sources: Source[] }
```

## Configuration

### Environment Variables

```bash
# OpenAI for embeddings
OPENAI_API_KEY=sk-...

# Embedding model
EMBEDDING_MODEL=text-embedding-3-small

# Chunk settings
RAG_CHUNK_SIZE=1000
RAG_CHUNK_OVERLAP=200
```

### RAG Config in Chat Request

```typescript
interface RAGConfig {
  enabled: boolean;        // Enable RAG
  mode: 'auto' | 'manual' | 'off';
  document_ids?: string[]; // Specific docs to search
  max_chunks: number;      // Max chunks to include
  min_similarity: number;  // Similarity threshold
  use_rerank: boolean;     // Use LLM reranking
}
```

## Features

### Hybrid Search

Combines:

* **Vector similarity** (70%) - semantic understanding
* **BM25 keyword** (30%) - exact term matching

### Reranking

Uses GPT-4o-mini to re-score top 20 candidates for better relevance.

### Smart Chunking

* 1000 character chunks with 200 char overlap
* Breaks at paragraph/sentence boundaries
* Preserves context between chunks

### Citation Formatting

Each source includes:

* Document name with emoji
* Section title (if available)
* Page number or fragment index
* Relevance score

## Troubleshooting

### RAG not working

1. Check Supabase is configured (`.env`)
2. Check OpenAI API key is set
3. Verify documents are in "ready" status
4. Check browser console for errors

### Poor search results

1. Try hybrid search (enabled by default)
2. Enable reranking for better relevance
3. Upload more relevant documents
4. Check document was processed correctly

### Documents stuck in "processing"

1. Check OpenAI API key and quota
2. Try reprocessing via Document Manager
3. Check backend logs for errors
