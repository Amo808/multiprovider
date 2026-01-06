"""
RAG (Retrieval Augmented Generation) operations for Supabase
Handles document upload, chunking, embedding, and similarity search
"""
import os
import hashlib
import logging
import asyncio
import re
import unicodedata
from typing import List, Optional, Dict, Any, BinaryIO, Tuple
from uuid import uuid4
from datetime import datetime
from pathlib import Path
import tempfile

from .client import get_supabase_service_client, get_or_create_user, is_supabase_configured

logger = logging.getLogger(__name__)


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename for storage - remove non-ASCII chars, spaces, special chars.
    Keeps the original extension.
    """
    # Get extension
    path = Path(filename)
    ext = path.suffix.lower()
    name = path.stem
    
    # Normalize unicode (decompose accented chars)
    name = unicodedata.normalize('NFKD', name)
    
    # Remove non-ASCII characters
    name = name.encode('ascii', 'ignore').decode('ascii')
    
    # Replace spaces and special chars with underscores
    name = re.sub(r'[^\w\-]', '_', name)
    
    # Remove multiple underscores
    name = re.sub(r'_+', '_', name)
    
    # Remove leading/trailing underscores
    name = name.strip('_')
    
    # If name is empty after sanitization, use a default
    if not name:
        name = 'document'
    
    # Limit length
    if len(name) > 100:
        name = name[:100]
    
    return f"{name}{ext}"


# Embedding configuration
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIMENSION = 1536  # OpenAI text-embedding-3-small
CHUNK_SIZE = int(os.getenv("RAG_CHUNK_SIZE", "1000"))  # characters per chunk
CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP", "200"))  # overlap between chunks

# Supported file types
SUPPORTED_TYPES = {
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/csv": ".csv",
    "application/json": ".json"
}


class RAGStore:
    """Supabase-backed RAG storage with vector search"""
    
    def __init__(self):
        self._client = None
        self._embedding_client = None
        self._user_cache = {}
    
    @property
    def client(self):
        if self._client is None:
            self._client = get_supabase_service_client()
        return self._client
    
    @property
    def embedding_client(self):
        """Lazy load OpenAI client for embeddings"""
        if self._embedding_client is None:
            from openai import OpenAI
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY required for embeddings")
            self._embedding_client = OpenAI(api_key=api_key)
        return self._embedding_client
    
    def _get_user_id(self, user_email: str) -> str:
        """Get or create user and return user_id"""
        if user_email not in self._user_cache:
            user = get_or_create_user(user_email)
            self._user_cache[user_email] = user["id"]
        return self._user_cache[user_email]
    
    # ==================== FILE PARSING ====================
    
    def extract_text_from_file(self, file_path: str, content_type: str) -> str:
        """Extract text content from various file types"""
        ext = SUPPORTED_TYPES.get(content_type, "").lower()
        
        if ext == ".pdf":
            return self._extract_pdf(file_path)
        elif ext == ".docx":
            return self._extract_docx(file_path)
        elif ext in [".txt", ".md", ".csv", ".json"]:
            return self._extract_text(file_path)
        else:
            raise ValueError(f"Unsupported file type: {content_type}")
    
    def _extract_pdf(self, file_path: str) -> str:
        """Extract text from PDF"""
        try:
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            text_parts = []
            for page in reader.pages:
                text = page.extract_text()
                if text:
                    text_parts.append(text)
            return "\n\n".join(text_parts)
        except ImportError:
            logger.warning("pypdf not installed, trying fallback")
            return self._extract_text(file_path)
    
    def _extract_docx(self, file_path: str) -> str:
        """Extract text from DOCX"""
        try:
            from docx import Document
            doc = Document(file_path)
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            return "\n\n".join(paragraphs)
        except ImportError:
            logger.warning("python-docx not installed")
            raise ValueError("python-docx required for .docx files")
    
    def _extract_text(self, file_path: str) -> str:
        """Extract text from plain text files"""
        import chardet
        
        with open(file_path, "rb") as f:
            raw = f.read()
        
        # Detect encoding
        detected = chardet.detect(raw)
        encoding = detected.get("encoding", "utf-8")
        
        return raw.decode(encoding, errors="replace")
    
    # ==================== DOCUMENTS ====================
    
    def create_document(
        self,
        user_email: str,
        name: str,
        content_type: str,
        file_size: int,
        storage_path: Optional[str] = None,
        file_hash: Optional[str] = None,
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Create a document record"""
        user_id = self._get_user_id(user_email)
        
        data = {
            "user_id": user_id,
            "name": name,
            "content_type": content_type,
            "file_size": file_size,
            "storage_path": storage_path,
            "file_hash": file_hash,
            "status": "pending",
            "metadata": metadata or {}
        }
        
        result = self.client.table("documents").insert(data).execute()
        logger.info(f"Created document: {result.data[0]['id']} for user {user_email}")
        return result.data[0]
    
    def get_document(self, document_id: str, user_email: str) -> Optional[Dict[str, Any]]:
        """Get a document by ID"""
        user_id = self._get_user_id(user_email)
        
        result = self.client.table("documents")\
            .select("*")\
            .eq("id", document_id)\
            .eq("user_id", user_id)\
            .single()\
            .execute()
        return result.data if result.data else None
    
    def list_documents(
        self,
        user_email: str,
        status: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """List documents for a user"""
        user_id = self._get_user_id(user_email)
        
        query = self.client.table("documents")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("created_at", desc=True)\
            .limit(limit)
        
        if status:
            query = query.eq("status", status)
        
        result = query.execute()
        return result.data or []
    
    def update_document_status(
        self,
        document_id: str,
        status: str,
        total_chunks: Optional[int] = None,
        error_message: Optional[str] = None
    ) -> bool:
        """Update document processing status"""
        updates = {
            "status": status,
            "updated_at": datetime.utcnow().isoformat()
        }
        if total_chunks is not None:
            updates["total_chunks"] = total_chunks
        if error_message:
            updates["error_message"] = error_message
        
        result = self.client.table("documents")\
            .update(updates)\
            .eq("id", document_id)\
            .execute()
        
        return len(result.data) > 0 if result.data else False
    
    def delete_document(self, document_id: str, user_email: str) -> bool:
        """Delete a document and its chunks"""
        user_id = self._get_user_id(user_email)
        
        # Delete from storage first
        doc = self.get_document(document_id, user_email)
        if doc and doc.get("storage_path"):
            try:
                self.client.storage.from_("documents").remove([doc["storage_path"]])
            except Exception as e:
                logger.warning(f"Failed to delete file from storage: {e}")
        
        # Chunks are deleted automatically via CASCADE
        result = self.client.table("documents")\
            .delete()\
            .eq("id", document_id)\
            .eq("user_id", user_id)\
            .execute()
        
        logger.info(f"Deleted document: {document_id}")
        return len(result.data) > 0 if result.data else False
    
    # ==================== CHUNKING ====================
    
    def chunk_text(
        self,
        text: str,
        chunk_size: int = CHUNK_SIZE,
        chunk_overlap: int = CHUNK_OVERLAP
    ) -> List[Dict[str, Any]]:
        """Split text into overlapping chunks with smart boundaries"""
        chunks = []
        start = 0
        chunk_index = 0
        text_len = len(text)
        
        while start < text_len:
            end = min(start + chunk_size, text_len)
            
            # Try to break at sentence/paragraph boundary
            if end < text_len:
                search_start = max(start, end - int(chunk_size * 0.2))
                best_break = end
                
                # Priority: paragraph > sentence > word
                for sep in ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' ']:
                    pos = text.rfind(sep, search_start, end)
                    if pos != -1:
                        best_break = pos + len(sep)
                        break
                
                end = best_break
            
            chunk_text = text[start:end].strip()
            if chunk_text:
                chunks.append({
                    "chunk_index": chunk_index,
                    "content": chunk_text,
                    "start_char": start,
                    "end_char": end,
                    "metadata": {}
                })
                chunk_index += 1
            
            # Move start with overlap
            start = max(start + 1, end - chunk_overlap)
        
        return chunks
    
    # ==================== EMBEDDINGS ====================
    
    def create_embedding(self, text: str) -> List[float]:
        """Create embedding for text using OpenAI"""
        response = self.embedding_client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text[:8000]  # Limit input length
        )
        return response.data[0].embedding
    
    def create_embeddings_batch(self, texts: List[str], batch_size: int = 100) -> List[List[float]]:
        """Create embeddings for multiple texts in batches"""
        all_embeddings = []
        
        for i in range(0, len(texts), batch_size):
            batch = [t[:8000] for t in texts[i:i + batch_size]]
            response = self.embedding_client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=batch
            )
            all_embeddings.extend([item.embedding for item in response.data])
        
        return all_embeddings
    
    # ==================== DOCUMENT PROCESSING ====================
    
    async def upload_and_process_document(
        self,
        user_email: str,
        file_content: bytes,
        filename: str,
        content_type: str,
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Full document processing pipeline:
        1. Upload to Supabase Storage
        2. Create document record
        3. Extract text
        4. Chunk and embed
        5. Store vectors
        """
        user_id = self._get_user_id(user_email)
        
        # Calculate file hash for deduplication
        file_hash = hashlib.sha256(file_content).hexdigest()
        
        # Check for duplicate
        existing = self.client.table("documents")\
            .select("id")\
            .eq("user_id", user_id)\
            .eq("file_hash", file_hash)\
            .execute()
        
        if existing.data:
            logger.info(f"Document already exists: {existing.data[0]['id']}")
            return self.get_document(existing.data[0]["id"], user_email)
        
        # Generate storage path with sanitized filename
        safe_filename = sanitize_filename(filename)
        storage_path = f"{user_id}/{uuid4()}/{safe_filename}"
        
        logger.info(f"Uploading document: {filename} -> {safe_filename}")
        
        # Upload to storage
        try:
            self.client.storage.from_("documents").upload(
                storage_path,
                file_content,
                {"content-type": content_type}
            )
        except Exception as e:
            logger.error(f"Failed to upload to storage: {e}")
            raise
        
        # Create document record
        doc = self.create_document(
            user_email=user_email,
            name=filename,
            content_type=content_type,
            file_size=len(file_content),
            storage_path=storage_path,
            file_hash=file_hash,
            metadata=metadata
        )
        
        # Process asynchronously
        try:
            # Save to temp file for processing
            with tempfile.NamedTemporaryFile(delete=False, suffix=Path(filename).suffix) as tmp:
                tmp.write(file_content)
                tmp_path = tmp.name
            
            # Extract text
            text_content = self.extract_text_from_file(tmp_path, content_type)
            
            # Clean up temp file
            os.unlink(tmp_path)
            
            if not text_content.strip():
                self.update_document_status(doc["id"], "error", error_message="No text content found")
                return doc
            
            # Process document
            chunk_count = await self.process_document_text(
                document_id=doc["id"],
                content=text_content,
                metadata=metadata
            )
            
            doc["status"] = "ready"
            doc["total_chunks"] = chunk_count
            
        except Exception as e:
            logger.error(f"Error processing document {doc['id']}: {e}")
            self.update_document_status(doc["id"], "error", error_message=str(e))
            doc["status"] = "error"
            doc["error_message"] = str(e)
        
        return doc
    
    async def process_document_text(
        self,
        document_id: str,
        content: str,
        metadata: Optional[Dict] = None
    ) -> int:
        """
        Process document text: chunk it, create embeddings, store in vector DB
        Returns the number of chunks created
        """
        try:
            # Update status to processing
            self.update_document_status(document_id, "processing")
            
            # Chunk the text
            chunks = self.chunk_text(content)
            logger.info(f"Document {document_id}: created {len(chunks)} chunks")
            
            if not chunks:
                self.update_document_status(document_id, "error", error_message="No content to process")
                return 0
            
            # Create embeddings
            texts = [c["content"] for c in chunks]
            embeddings = self.create_embeddings_batch(texts)
            
            # Prepare chunk records for insertion
            chunk_records = []
            for i, chunk in enumerate(chunks):
                chunk_records.append({
                    "document_id": document_id,
                    "content": chunk["content"],
                    "embedding": embeddings[i],
                    "chunk_index": chunk["chunk_index"],
                    "start_char": chunk["start_char"],
                    "end_char": chunk["end_char"],
                    "metadata": {
                        **(metadata or {}),
                        **chunk.get("metadata", {})
                    }
                })
            
            # Insert chunks in batches (Supabase has request size limits)
            batch_size = 50
            for i in range(0, len(chunk_records), batch_size):
                batch = chunk_records[i:i + batch_size]
                self.client.table("document_chunks").insert(batch).execute()
            
            # Update status to ready
            self.update_document_status(document_id, "ready", total_chunks=len(chunks))
            logger.info(f"Document {document_id}: processing complete, {len(chunks)} chunks stored")
            
            return len(chunks)
            
        except Exception as e:
            logger.error(f"Error processing document {document_id}: {e}")
            self.update_document_status(document_id, "error", error_message=str(e))
            raise
    
    # ==================== SEARCH ====================
    
    def search(
        self,
        query: str,
        user_email: str,
        document_ids: Optional[List[str]] = None,
        threshold: float = 0.5,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Search for relevant document chunks using vector similarity
        """
        user_id = self._get_user_id(user_email)
        
        # Create embedding for query
        query_embedding = self.create_embedding(query)
        
        # Use filter_document_id if single document specified
        filter_doc_id = document_ids[0] if document_ids and len(document_ids) == 1 else None
        
        # Call the match_documents function
        result = self.client.rpc(
            "match_documents",
            {
                "query_embedding": query_embedding,
                "match_count": limit,
                "filter_user_id": user_id,
                "filter_document_id": filter_doc_id,
                "similarity_threshold": threshold
            }
        ).execute()
        
        # Enrich results with document info
        results = result.data or []
        if results:
            doc_ids = list(set(r["document_id"] for r in results))
            docs = self.client.table("documents")\
                .select("id, name")\
                .in_("id", doc_ids)\
                .execute()
            
            doc_names = {d["id"]: d["name"] for d in (docs.data or [])}
            
            for r in results:
                r["document_name"] = doc_names.get(r["document_id"], "Unknown")
        
        return results
    
    def hybrid_search(
        self,
        query: str,
        user_email: str,
        limit: int = 5,
        keyword_weight: float = 0.3,
        semantic_weight: float = 0.7
    ) -> List[Dict[str, Any]]:
        """
        Hybrid search combining vector similarity and keyword matching
        """
        user_id = self._get_user_id(user_email)
        query_embedding = self.create_embedding(query)
        
        result = self.client.rpc(
            "hybrid_search",
            {
                "query_text": query,
                "query_embedding": query_embedding,
                "match_count": limit,
                "filter_user_id": user_id,
                "keyword_weight": keyword_weight,
                "semantic_weight": semantic_weight
            }
        ).execute()
        
        # Enrich results with document info
        results = result.data or []
        if results:
            doc_ids = list(set(r["document_id"] for r in results))
            docs = self.client.table("documents")\
                .select("id, name")\
                .in_("id", doc_ids)\
                .execute()
            
            doc_names = {d["id"]: d["name"] for d in (docs.data or [])}
            
            for r in results:
                r["document_name"] = doc_names.get(r["document_id"], "Unknown")
        
        return results
    
    # ==================== CONTEXT BUILDING ====================
    
    def build_rag_context(
        self,
        query: str,
        user_email: str,
        document_ids: Optional[List[str]] = None,
        max_tokens: int = 4000,
        threshold: float = 0.5,
        use_hybrid: bool = True
    ) -> Tuple[str, List[Dict]]:
        """
        Build context string from relevant documents for RAG
        Returns (context_string, source_documents)
        """
        if use_hybrid:
            results = self.hybrid_search(
                query=query,
                user_email=user_email,
                limit=10
            )
        else:
            results = self.search(
                query=query,
                user_email=user_email,
                document_ids=document_ids,
                threshold=threshold,
                limit=10
            )
        
        if not results:
            return "", []
        
        context_parts = []
        sources = []
        total_chars = 0
        max_chars = max_tokens * 4  # Rough token estimate
        
        for result in results:
            chunk_chars = len(result["content"])
            
            if total_chars + chunk_chars > max_chars:
                break
            
            context_parts.append(
                f"[Source: {result.get('document_name', 'Unknown')}]\n{result['content']}"
            )
            sources.append({
                "document_id": result["document_id"],
                "document_name": result.get("document_name"),
                "chunk_index": result["chunk_index"],
                "similarity": result.get("similarity") or result.get("combined_score", 0)
            })
            total_chars += chunk_chars
        
        context = "\n\n---\n\n".join(context_parts)
        return context, sources


# Singleton instance
_store: Optional[RAGStore] = None

def get_rag_store() -> RAGStore:
    """Get singleton RAG store instance"""
    global _store
    if _store is None:
        _store = RAGStore()
    return _store
