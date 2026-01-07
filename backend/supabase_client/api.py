"""
RAG API Router for MULTECH AI
Handles document upload, processing, and search endpoints
"""
import logging
from typing import Optional, List
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from pydantic import BaseModel

from .rag import get_rag_store, SUPPORTED_TYPES
from .client import is_supabase_configured

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rag", tags=["RAG"])


# ==================== REQUEST/RESPONSE MODELS ====================

class DocumentResponse(BaseModel):
    id: str
    name: str
    content_type: str
    file_size: int
    status: str
    total_chunks: Optional[int] = None
    error_message: Optional[str] = None
    created_at: str
    updated_at: str


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int


class SearchRequest(BaseModel):
    query: str
    document_ids: Optional[List[str]] = None
    limit: int = 5
    threshold: float = 0.5
    use_hybrid: bool = True


class SearchResult(BaseModel):
    document_id: str
    document_name: str
    content: str
    chunk_index: int
    similarity: float


class SearchResponse(BaseModel):
    results: List[SearchResult]
    context: str


class RAGContextRequest(BaseModel):
    query: str
    document_ids: Optional[List[str]] = None
    max_tokens: int = 4000
    use_hybrid: bool = True


class RAGContextResponse(BaseModel):
    context: str
    sources: List[dict]


# ==================== HELPER ====================

def check_supabase():
    """Check if Supabase is configured"""
    if not is_supabase_configured():
        raise HTTPException(
            status_code=503, 
            detail="Supabase is not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY"
        )


# ==================== ENDPOINTS ====================

@router.get("/status")
async def rag_status():
    """Check RAG system status"""
    return {
        "configured": is_supabase_configured(),
        "supported_types": list(SUPPORTED_TYPES.keys())
    }


@router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    user_email: str = Form(...),
    metadata: Optional[str] = Form(None)
):
    """
    Upload and process a document for RAG
    """
    check_supabase()
    
    # Validate file type
    content_type = file.content_type
    if content_type not in SUPPORTED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {content_type}. Supported: {list(SUPPORTED_TYPES.keys())}"
        )
    
    # Check file size (50MB limit)
    MAX_SIZE = 50 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {MAX_SIZE // (1024*1024)}MB"
        )
    
    try:
        import json
        meta_dict = json.loads(metadata) if metadata else None
    except:
        meta_dict = None
    
    try:
        rag_store = get_rag_store()
        doc = await rag_store.upload_and_process_document(
            user_email=user_email,
            file_content=content,
            filename=file.filename,
            content_type=content_type,
            metadata=meta_dict
        )
        
        return {
            "success": True,
            "document": doc
        }
        
    except Exception as e:
        logger.error(f"Document upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents")
async def list_documents(
    user_email: str,
    status: Optional[str] = None,
    limit: int = 50
):
    """List documents for a user"""
    check_supabase()
    
    try:
        rag_store = get_rag_store()
        docs = rag_store.list_documents(
            user_email=user_email,
            status=status,
            limit=limit
        )
        
        return {
            "documents": docs,
            "total": len(docs)
        }
        
    except Exception as e:
        logger.error(f"Failed to list documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/{document_id}")
async def get_document(document_id: str, user_email: str):
    """Get a specific document"""
    check_supabase()
    
    try:
        rag_store = get_rag_store()
        doc = rag_store.get_document(document_id, user_email)
        
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        
        return doc
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str, user_email: str):
    """Delete a document and all its chunks"""
    check_supabase()
    
    try:
        rag_store = get_rag_store()
        success = rag_store.delete_document(document_id, user_email)
        
        if not success:
            raise HTTPException(status_code=404, detail="Document not found")
        
        return {"success": True, "message": f"Document {document_id} deleted"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search")
async def search_documents(request: SearchRequest, user_email: str):
    """
    Search documents using vector similarity
    Returns relevant chunks with similarity scores
    """
    check_supabase()
    
    try:
        rag_store = get_rag_store()
        
        if request.use_hybrid:
            results = rag_store.hybrid_search(
                query=request.query,
                user_email=user_email,
                limit=request.limit
            )
        else:
            results = rag_store.search(
                query=request.query,
                user_email=user_email,
                document_ids=request.document_ids,
                threshold=request.threshold,
                limit=request.limit
            )
        
        # Build context from results
        context_parts = []
        for r in results:
            context_parts.append(f"[{r.get('document_name', 'Unknown')}]\n{r['content']}")
        
        return {
            "results": results,
            "context": "\n\n---\n\n".join(context_parts)
        }
        
    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/context")
async def build_rag_context(request: RAGContextRequest, user_email: str):
    """
    Build RAG context for a query
    Returns formatted context string and source documents
    """
    check_supabase()
    
    try:
        rag_store = get_rag_store()
        context, sources = rag_store.build_rag_context(
            query=request.query,
            user_email=user_email,
            document_ids=request.document_ids,
            max_tokens=request.max_tokens,
            use_hybrid=request.use_hybrid
        )
        
        return {
            "context": context,
            "sources": sources
        }
        
    except Exception as e:
        logger.error(f"Context building failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reprocess/{document_id}")
async def reprocess_document(document_id: str, user_email: str):
    """
    Reprocess a document (useful if processing failed)
    """
    check_supabase()
    
    try:
        rag_store = get_rag_store()
        doc = rag_store.get_document(document_id, user_email)
        
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        
        if not doc.get("storage_path"):
            raise HTTPException(status_code=400, detail="Document has no storage path")
        
        # Download file from storage
        client = rag_store.client
        content = client.storage.from_("documents").download(doc["storage_path"])
        
        # Delete existing chunks
        client.table("document_chunks").delete().eq("document_id", document_id).execute()
        
        # Re-extract and process
        import tempfile
        from pathlib import Path
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(doc["name"]).suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        
        text_content = rag_store.extract_text_from_file(tmp_path, doc["content_type"])
        import os
        os.unlink(tmp_path)
        
        chunk_count = await rag_store.process_document_text(
            document_id=document_id,
            content=text_content
        )
        
        return {
            "success": True,
            "chunks_created": chunk_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reprocessing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== CHAPTER ENDPOINTS ====================

class ChapterInfo(BaseModel):
    chapter_number: str
    title: str
    start_chunk: int
    end_chunk: int
    preview: str


class ChaptersResponse(BaseModel):
    document_id: str
    document_name: str
    chapters: List[ChapterInfo]
    total_chapters: int


@router.get("/documents/{document_id}/chapters")
async def get_document_chapters(
    document_id: str,
    user_email: str
):
    """
    Get list of detected chapters/sections in a document.
    Useful for 'chapter' mode RAG.
    """
    check_supabase()
    
    try:
        rag_store = get_rag_store()
        
        # Verify document exists and belongs to user
        doc = rag_store.get_document(document_id, user_email)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        
        chapters = rag_store.get_document_chapters(user_email, document_id)
        
        return ChaptersResponse(
            document_id=document_id,
            document_name=doc["name"],
            chapters=[ChapterInfo(**ch) for ch in chapters],
            total_chapters=len(chapters)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get chapters: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/{document_id}/chapter/{chapter_number}")
async def get_chapter_content(
    document_id: str,
    chapter_number: str,
    user_email: str
):
    """
    Get full content of a specific chapter.
    """
    check_supabase()
    
    try:
        rag_store = get_rag_store()
        
        # Verify document exists
        doc = rag_store.get_document(document_id, user_email)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        
        content, sources = rag_store.get_chapter_content(user_email, document_id, chapter_number)
        
        if not content:
            raise HTTPException(status_code=404, detail=f"Chapter {chapter_number} not found")
        
        return {
            "document_id": document_id,
            "document_name": doc["name"],
            "chapter_number": chapter_number,
            "content": content,
            "sources": sources,
            "char_count": len(content),
            "estimated_tokens": len(content) // 4
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get chapter content: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/{document_id}/full")
async def get_full_document(
    document_id: str,
    user_email: str,
    max_tokens: int = 100000
):
    """
    Get full document content.
    WARNING: Can be very large! Use with models that support large context.
    """
    check_supabase()
    
    try:
        rag_store = get_rag_store()
        
        # Verify document exists
        doc = rag_store.get_document(document_id, user_email)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        
        context, sources, debug_info = rag_store.build_full_document_context(
            user_email=user_email,
            document_ids=[document_id],
            max_tokens=max_tokens
        )
        
        return {
            "document_id": document_id,
            "document_name": doc["name"],
            "content": context,
            "sources": sources,
            "debug": debug_info
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get full document: {e}")
        raise HTTPException(status_code=500, detail=str(e))
