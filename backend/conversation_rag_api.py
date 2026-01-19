"""
Conversation RAG API Routes
===========================
API endpoints for:
1. Indexing conversation history
2. Searching conversation history
3. Managing conversation-scoped documents
4. Unified RAG search
"""

import logging
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/conversation-rag", tags=["conversation-rag"])


# ============================================================================
# Pydantic Models
# ============================================================================

class IndexMessageRequest(BaseModel):
    """Request to index a single message"""
    conversation_id: str
    message_id: str
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str
    timestamp: Optional[str] = None
    model: Optional[str] = None


class IndexConversationRequest(BaseModel):
    """Request to index entire conversation history"""
    conversation_id: str
    messages: List[dict]  # [{id, role, content, timestamp, model}]


class SearchHistoryRequest(BaseModel):
    """Request to search conversation history"""
    conversation_id: str
    query: str
    limit: int = Field(default=10, ge=1, le=50)
    min_similarity: float = Field(default=0.5, ge=0.0, le=1.0)
    roles: Optional[List[str]] = None  # Filter by role


class UnifiedSearchRequest(BaseModel):
    """Request for unified RAG search"""
    query: str
    conversation_id: Optional[str] = None
    include_documents: bool = True
    include_history: bool = True
    include_global_docs: bool = True
    limit: int = Field(default=10, ge=1, le=50)
    min_similarity: float = Field(default=0.5, ge=0.0, le=1.0)


class AttachDocumentRequest(BaseModel):
    """Request to attach a document to a conversation"""
    document_id: str
    conversation_id: str


# ============================================================================
# Routes
# ============================================================================

@router.post("/index-message")
async def index_message(
    request: IndexMessageRequest,
    user: str = Depends(lambda: "dev@example.com")  # Will be replaced with real auth
):
    """
    Index a single message for RAG search.
    Called when a new message is added to a conversation.
    """
    from storage.conversation_rag import get_conversation_rag_store
    
    try:
        store = get_conversation_rag_store()
        
        chunks = await store.index_message(
            conversation_id=request.conversation_id,
            message_id=request.message_id,
            role=request.role,
            content=request.content,
            user_id=user,
            timestamp=request.timestamp,
            model=request.model
        )
        
        return {
            "success": True,
            "chunks_created": len(chunks),
            "message_id": request.message_id
        }
        
    except Exception as e:
        logger.error(f"[ConversationRAG API] Index message error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/index-conversation")
async def index_conversation(
    request: IndexConversationRequest,
    user: str = Depends(lambda: "dev@example.com")
):
    """
    Index an entire conversation history.
    Useful for bulk indexing existing conversations.
    """
    from storage.conversation_rag import get_conversation_rag_store
    
    try:
        store = get_conversation_rag_store()
        total_chunks = 0
        
        for msg in request.messages:
            chunks = await store.index_message(
                conversation_id=request.conversation_id,
                message_id=msg.get("id", str(hash(msg.get("content", "")))),
                role=msg.get("role", "user"),
                content=msg.get("content", ""),
                user_id=user,
                timestamp=msg.get("timestamp"),
                model=msg.get("model")
            )
            total_chunks += len(chunks)
        
        return {
            "success": True,
            "messages_indexed": len(request.messages),
            "total_chunks": total_chunks,
            "conversation_id": request.conversation_id
        }
        
    except Exception as e:
        logger.error(f"[ConversationRAG API] Index conversation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search-history")
async def search_history(
    request: SearchHistoryRequest,
    user: str = Depends(lambda: "dev@example.com")
):
    """
    Semantic search over conversation history.
    Finds relevant past messages based on query.
    """
    from storage.conversation_rag import get_conversation_rag_store
    
    try:
        store = get_conversation_rag_store()
        
        results = await store.search_conversation_history(
            conversation_id=request.conversation_id,
            query=request.query,
            limit=request.limit,
            min_similarity=request.min_similarity,
            roles=request.roles
        )
        
        return {
            "success": True,
            "results": [r.to_dict() for r in results],
            "count": len(results),
            "query": request.query
        }
        
    except Exception as e:
        logger.error(f"[ConversationRAG API] Search history error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/unified-search")
async def unified_search(
    request: UnifiedSearchRequest,
    user: str = Depends(lambda: "dev@example.com")
):
    """
    Unified RAG search across documents and conversation history.
    Combines results from all knowledge sources.
    """
    from storage.conversation_rag import get_unified_rag_search
    
    try:
        search = get_unified_rag_search()
        
        results = await search.search(
            query=request.query,
            conversation_id=request.conversation_id,
            user_id=user,
            include_documents=request.include_documents,
            include_history=request.include_history,
            include_global_docs=request.include_global_docs,
            limit=request.limit,
            min_similarity=request.min_similarity
        )
        
        return {
            "success": True,
            **results
        }
        
    except Exception as e:
        logger.error(f"[ConversationRAG API] Unified search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/{conversation_id}")
async def get_conversation_rag_stats(
    conversation_id: str,
    user: str = Depends(lambda: "dev@example.com")
):
    """
    Get RAG indexing statistics for a conversation.
    Shows how many messages are indexed, chunk counts, etc.
    """
    from storage.conversation_rag import get_conversation_rag_store
    
    try:
        store = get_conversation_rag_store()
        stats = await store.get_conversation_stats(conversation_id)
        
        return {
            "success": True,
            **stats
        }
        
    except Exception as e:
        logger.error(f"[ConversationRAG API] Get stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_conversation_rag_status():
    """
    Check if conversation RAG is available and configured.
    """
    try:
        from storage.conversation_rag import get_conversation_rag_store, EMBEDDING_MODEL
        
        store = get_conversation_rag_store()
        has_supabase = store.supabase is not None
        has_embeddings = EMBEDDING_MODEL is not None or store.openai_client is not None
        
        return {
            "available": True,
            "supabase_configured": has_supabase,
            "embeddings_available": has_embeddings,
            "embedding_provider": store.embedding_provider
        }
        
    except ImportError as e:
        return {
            "available": False,
            "error": f"Module not available: {e}"
        }
    except Exception as e:
        return {
            "available": False,
            "error": str(e)
        }
    

@router.delete("/conversation/{conversation_id}")
async def delete_conversation_index(
    conversation_id: str,
    user: str = Depends(lambda: "dev@example.com")
):
    """Delete all indexed chunks for a conversation"""
    from storage.conversation_rag import get_conversation_rag_store
    
    try:
        store = get_conversation_rag_store()
        success = await store.delete_conversation_chunks(conversation_id)
        
        return {
            "success": success,
            "conversation_id": conversation_id
        }
        
    except Exception as e:
        logger.error(f"[ConversationRAG API] Delete error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Document-to-Conversation Attachment Routes
# ============================================================================

@router.post("/attach-document")
async def attach_document_to_conversation(
    request: AttachDocumentRequest,
    user: str = Depends(lambda: "dev@example.com")
):
    """
    Attach a document to a specific conversation.
    The document will only be used for RAG in this conversation.
    """
    # Import supabase client
    try:
        from supabase_client import get_supabase_client
        supabase = get_supabase_client()
        
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase not configured")
        
        # Update document to link to conversation
        result = supabase.table("documents").update({
            "conversation_id": request.conversation_id
        }).eq("id", request.document_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        return {
            "success": True,
            "document_id": request.document_id,
            "conversation_id": request.conversation_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ConversationRAG API] Attach document error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/detach-document/{document_id}")
async def detach_document_from_conversation(
    document_id: str,
    user: str = Depends(lambda: "dev@example.com")
):
    """
    Detach a document from its conversation (make it global again).
    """
    try:
        from supabase_client import get_supabase_client
        supabase = get_supabase_client()
        
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase not configured")
        
        # Remove conversation_id from document
        result = supabase.table("documents").update({
            "conversation_id": None
        }).eq("id", document_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        return {
            "success": True,
            "document_id": document_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ConversationRAG API] Detach document error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/conversation-documents/{conversation_id}")
async def get_conversation_documents(
    conversation_id: str,
    user: str = Depends(lambda: "dev@example.com")
):
    """
    Get all documents attached to a conversation.
    """
    try:
        from supabase_client import get_supabase_client
        supabase = get_supabase_client()
        
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase not configured")
        
        # Get documents for this conversation
        result = supabase.table("documents").select(
            "id, filename, file_type, file_size, created_at, chunks_count"
        ).eq("conversation_id", conversation_id).execute()
        
        return {
            "success": True,
            "conversation_id": conversation_id,
            "documents": result.data or [],
            "count": len(result.data or [])
        }
        
    except Exception as e:
        logger.error(f"[ConversationRAG API] Get conversation documents error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
