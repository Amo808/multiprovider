"""
Advanced Document RAG Store
Handles document upload, smart chunking, embedding, and citation-based search
"""
import os
import re
import hashlib
import logging
import asyncio
import json
from typing import List, Optional, Dict, Any, Tuple
from uuid import uuid4
from datetime import datetime
from pathlib import Path
import tempfile

logger = logging.getLogger(__name__)

# OpenAI embeddings configuration
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536

# Try to import OpenAI
try:
    from openai import OpenAI
    _openai_client = None
    
    def get_openai_client():
        global _openai_client
        if _openai_client is None:
            # Get API key from multiple sources
            api_key = os.getenv("OPENAI_API_KEY")
            invalid_keys = ["your_openai_api_key_here", "your-openai-api-key", "sk-xxx", ""]
            
            if not api_key or api_key in invalid_keys:
                # Try secrets.json
                secrets_path = Path(__file__).parent.parent / "data" / "secrets.json"
                if secrets_path.exists():
                    try:
                        with open(secrets_path, 'r', encoding='utf-8') as f:
                            secrets = json.load(f)
                            secrets_key = secrets.get("apiKeys", {}).get("OPENAI_API_KEY", "")
                            if secrets_key and secrets_key not in invalid_keys:
                                api_key = secrets_key
                    except Exception:
                        pass
            
            if api_key and api_key not in invalid_keys:
                _openai_client = OpenAI(api_key=api_key)
        return _openai_client
    
    OPENAI_AVAILABLE = True
    logger.info("[RAG] OpenAI embeddings configured (text-embedding-3-small)")
except ImportError:
    OPENAI_AVAILABLE = False
    get_openai_client = lambda: None
    logger.warning("[RAG] OpenAI not installed, embeddings disabled")

# Supported file types
SUPPORTED_TYPES = {
    "application/pdf": ".pdf",
    "text/plain": ".txt", 
    "text/markdown": ".md",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
}


class SmartChunker:
    """
    Advanced chunking with:
    - Semantic boundaries (paragraphs, sections)
    - Overlap for context preservation
    - Metadata extraction (page, section, line numbers)
    """
    
    def __init__(
        self,
        chunk_size: int = 500,
        chunk_overlap: int = 100,
        min_chunk_size: int = 100
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.min_chunk_size = min_chunk_size
    
    def chunk_document(
        self, 
        text: str, 
        filename: str = "",
        preserve_structure: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Smart chunking that preserves document structure
        Returns list of chunks with citation metadata
        """
        chunks = []
        
        # Detect document structure
        if preserve_structure:
            # Try to split by sections first
            sections = self._split_by_sections(text)
            
            for section_idx, (section_title, section_text) in enumerate(sections):
                section_chunks = self._chunk_section(
                    section_text, 
                    section_title,
                    section_idx
                )
                chunks.extend(section_chunks)
        else:
            # Simple chunking
            chunks = self._simple_chunk(text)
        
        # Add global metadata
        total_chars = len(text)
        estimated_pages = max(1, total_chars // 3000)  # ~3000 chars per page
        
        for i, chunk in enumerate(chunks):
            chunk['chunk_index'] = i
            chunk['estimated_pages'] = estimated_pages
            chunk['word_count'] = len(chunk['content'].split())
        
        return chunks
    
    def _split_by_sections(self, text: str) -> List[Tuple[str, str]]:
        """Split text by section headers"""
        # Common section patterns
        patterns = [
            r'^(#+\s+.+)$',  # Markdown headers
            r'^(Статья\s+\d+[.\s].*)$',  # Russian law articles
            r'^(Article\s+\d+[.\s].*)$',  # English articles
            r'^(Глава\s+\d+[.\s].*)$',  # Russian chapters
            r'^(Chapter\s+\d+[.\s].*)$',  # English chapters
            r'^(Раздел\s+\d+[.\s].*)$',  # Russian sections
            r'^(Section\s+\d+[.\s].*)$',  # English sections
            r'^(\d+\.\s+[А-ЯA-Z].+)$',  # Numbered sections
        ]
        
        combined_pattern = '|'.join(f'({p})' for p in patterns)
        
        sections = []
        current_title = "Introduction"
        current_text = []
        
        for line in text.split('\n'):
            is_header = False
            for pattern in patterns:
                if re.match(pattern, line.strip(), re.MULTILINE | re.IGNORECASE):
                    # Save previous section
                    if current_text:
                        sections.append((current_title, '\n'.join(current_text)))
                    current_title = line.strip()
                    current_text = []
                    is_header = True
                    break
            
            if not is_header:
                current_text.append(line)
        
        # Add last section
        if current_text:
            sections.append((current_title, '\n'.join(current_text)))
        
        # If no sections found, return whole text
        if len(sections) <= 1:
            return [("Document", text)]
        
        return sections
    
    def _chunk_section(
        self, 
        text: str, 
        section_title: str,
        section_idx: int
    ) -> List[Dict[str, Any]]:
        """Chunk a section while preserving paragraph boundaries"""
        chunks = []
        paragraphs = self._split_paragraphs(text)
        
        current_chunk = []
        current_size = 0
        para_start = 0
        
        for para_idx, para in enumerate(paragraphs):
            para_size = len(para)
            
            # If single paragraph is too large, split it
            if para_size > self.chunk_size:
                # Save current chunk first
                if current_chunk:
                    chunks.append(self._create_chunk(
                        ' '.join(current_chunk),
                        section_title,
                        section_idx,
                        para_start,
                        para_idx - 1
                    ))
                    current_chunk = []
                    current_size = 0
                
                # Split large paragraph
                sub_chunks = self._split_large_paragraph(para)
                for sub_idx, sub_chunk in enumerate(sub_chunks):
                    chunks.append(self._create_chunk(
                        sub_chunk,
                        section_title,
                        section_idx,
                        para_idx,
                        para_idx,
                        is_partial=True
                    ))
                para_start = para_idx + 1
                continue
            
            # Check if adding this paragraph exceeds chunk size
            if current_size + para_size > self.chunk_size and current_chunk:
                # Save current chunk with overlap
                chunks.append(self._create_chunk(
                    ' '.join(current_chunk),
                    section_title,
                    section_idx,
                    para_start,
                    para_idx - 1
                ))
                
                # Start new chunk with overlap (last paragraph)
                overlap_paras = current_chunk[-1:] if current_chunk else []
                current_chunk = overlap_paras + [para]
                current_size = sum(len(p) for p in current_chunk)
                para_start = max(0, para_idx - len(overlap_paras))
            else:
                current_chunk.append(para)
                current_size += para_size
        
        # Add remaining chunk
        if current_chunk:
            content = ' '.join(current_chunk)
            if len(content) >= self.min_chunk_size:
                chunks.append(self._create_chunk(
                    content,
                    section_title,
                    section_idx,
                    para_start,
                    len(paragraphs) - 1
                ))
        
        return chunks
    
    def _split_paragraphs(self, text: str) -> List[str]:
        """Split text into paragraphs"""
        # Split by double newlines or single newlines followed by indent
        paragraphs = re.split(r'\n\s*\n|\n(?=\s{2,})', text)
        return [p.strip() for p in paragraphs if p.strip()]
    
    def _split_large_paragraph(self, text: str) -> List[str]:
        """Split a large paragraph into smaller chunks"""
        chunks = []
        sentences = re.split(r'(?<=[.!?])\s+', text)
        
        current = []
        current_size = 0
        
        for sent in sentences:
            if current_size + len(sent) > self.chunk_size and current:
                chunks.append(' '.join(current))
                # Overlap: keep last sentence
                current = [current[-1], sent] if current else [sent]
                current_size = sum(len(s) for s in current)
            else:
                current.append(sent)
                current_size += len(sent)
        
        if current:
            chunks.append(' '.join(current))
        
        return chunks
    
    def _create_chunk(
        self,
        content: str,
        section_title: str,
        section_idx: int,
        para_start: int,
        para_end: int,
        is_partial: bool = False
    ) -> Dict[str, Any]:
        """Create chunk with metadata"""
        return {
            'content': content,
            'section_title': section_title,
            'section_index': section_idx,
            'paragraph_start': para_start,
            'paragraph_end': para_end,
            'is_partial': is_partial,
            'char_count': len(content),
            'content_hash': hashlib.md5(content.encode()).hexdigest()[:16]
        }
    
    def _simple_chunk(self, text: str) -> List[Dict[str, Any]]:
        """Simple fixed-size chunking with overlap"""
        chunks = []
        start = 0
        
        while start < len(text):
            end = min(start + self.chunk_size, len(text))
            
            # Try to break at sentence boundary
            if end < len(text):
                for sep in ['. ', '! ', '? ', '\n', ' ']:
                    pos = text.rfind(sep, start, end)
                    if pos > start + self.min_chunk_size:
                        end = pos + len(sep)
                        break
            
            chunk_text = text[start:end].strip()
            if len(chunk_text) >= self.min_chunk_size:
                chunks.append({
                    'content': chunk_text,
                    'section_title': None,
                    'char_start': start,
                    'char_end': end,
                    'content_hash': hashlib.md5(chunk_text.encode()).hexdigest()[:16]
                })
            
            start = max(start + 1, end - self.chunk_overlap)
        
        return chunks


class AdvancedRAGStore:
    """
    Advanced RAG Store with:
    - Smart chunking with citations
    - Hybrid search (vector + keyword)
    - Reranking for better precision
    """
    
    def __init__(self):
        self._client = None
        self._chunker = SmartChunker(
            chunk_size=500,
            chunk_overlap=100,
            min_chunk_size=50
        )
    
    @property
    def client(self):
        """Lazy load Supabase client"""
        if self._client is None:
            from supabase_client.client import get_supabase_service_client
            self._client = get_supabase_service_client()
        return self._client
    
    def create_embedding(self, text: str) -> Optional[List[float]]:
        """Create embedding for text using OpenAI"""
        if not OPENAI_AVAILABLE:
            logger.warning("[RAG] OpenAI not available for embeddings")
            return None
        
        try:
            client = get_openai_client()
            if client is None:
                logger.warning("[RAG] OpenAI client not initialized (missing API key?)")
                return None
            
            response = client.embeddings.create(
                input=text[:8000],  # Limit text length
                model=EMBEDDING_MODEL
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"[RAG] Embedding error: {e}")
            return None
    
    def create_embeddings_batch(self, texts: List[str]) -> List[Optional[List[float]]]:
        """Create embeddings for multiple texts using OpenAI"""
        if not OPENAI_AVAILABLE:
            return [None] * len(texts)
        
        try:
            client = get_openai_client()
            if client is None:
                return [None] * len(texts)
            
            # OpenAI supports batch embedding in a single call
            truncated = [t[:8000] for t in texts]
            response = client.embeddings.create(
                input=truncated,
                model=EMBEDDING_MODEL
            )
            return [item.embedding for item in response.data]
        except Exception as e:
            logger.error(f"[RAG] Batch embedding error: {e}")
            return [None] * len(texts)
    
    # ==================== Document Operations ====================
    
    async def upload_document(
        self,
        user_id: str,
        content: str,
        filename: str,
        file_type: str = "text/plain",
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Upload and process a document for RAG
        Returns document info with chunk count
        """
        doc_id = str(uuid4())
        
        try:
            # Create document record
            doc_data = {
                "id": doc_id,
                "user_id": user_id,
                "name": filename,
                "file_type": file_type,
                "file_size_bytes": len(content.encode('utf-8')),
                "total_characters": len(content),
                "estimated_pages": max(1, len(content) // 3000),
                "status": "processing",
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }
            
            self.client.table("rag_documents").insert(doc_data).execute()
            logger.info(f"[RAG] Created document {doc_id}: {filename}")
            
            # Chunk the document
            chunks = self._chunker.chunk_document(content, filename)
            logger.info(f"[RAG] Document {doc_id}: {len(chunks)} chunks created")
            
            if not chunks:
                self._update_document_status(doc_id, "error", "No content to process")
                return {"id": doc_id, "status": "error", "error": "No content"}
            
            # Create embeddings
            texts = [c['content'] for c in chunks]
            embeddings = self.create_embeddings_batch(texts)
            
            # Prepare chunk records
            chunk_records = []
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                chunk_record = {
                    "id": f"{doc_id}_chunk_{i}",
                    "document_id": doc_id,
                    "user_id": user_id,
                    "content": chunk['content'],
                    "content_hash": chunk.get('content_hash'),
                    "embedding": embedding,
                    "page_number": chunk.get('section_index', 0) + 1,  # Approximate
                    "paragraph_number": chunk.get('paragraph_start', i),
                    "section_title": chunk.get('section_title'),
                    "chunk_type": "content",
                    "chunk_index": i,
                    "word_count": chunk.get('word_count', len(chunk['content'].split())),
                    "char_start": chunk.get('char_start'),
                    "char_end": chunk.get('char_end'),
                    "metadata": metadata or {},
                    "created_at": datetime.utcnow().isoformat()
                }
                chunk_records.append(chunk_record)
            
            # Insert chunks in batches
            batch_size = 50
            for i in range(0, len(chunk_records), batch_size):
                batch = chunk_records[i:i + batch_size]
                self.client.table("document_chunks").insert(batch).execute()
            
            # Update document status
            self._update_document_status(doc_id, "ready", total_chunks=len(chunks))
            
            logger.info(f"[RAG] Document {doc_id} processed: {len(chunks)} chunks stored")
            
            return {
                "id": doc_id,
                "name": filename,
                "status": "ready",
                "total_chunks": len(chunks),
                "total_characters": len(content),
                "estimated_pages": max(1, len(content) // 3000)
            }
            
        except Exception as e:
            logger.error(f"[RAG] Upload error: {e}")
            self._update_document_status(doc_id, "error", str(e))
            raise
    
    def _update_document_status(
        self,
        doc_id: str,
        status: str,
        error_message: Optional[str] = None,
        total_chunks: Optional[int] = None
    ):
        """Update document status"""
        updates = {
            "status": status,
            "updated_at": datetime.utcnow().isoformat()
        }
        if error_message:
            updates["error_message"] = error_message
        if total_chunks is not None:
            updates["total_chunks"] = total_chunks
        
        self.client.table("rag_documents").update(updates).eq("id", doc_id).execute()
    
    def get_documents(self, user_id: str, limit: int = 50) -> List[Dict]:
        """Get all documents for a user"""
        result = self.client.table("rag_documents")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("created_at", desc=True)\
            .limit(limit)\
            .execute()
        return result.data or []
    
    def get_document(self, doc_id: str, user_id: str) -> Optional[Dict]:
        """Get a specific document"""
        result = self.client.table("rag_documents")\
            .select("*")\
            .eq("id", doc_id)\
            .eq("user_id", user_id)\
            .single()\
            .execute()
        return result.data if result.data else None
    
    def delete_document(self, doc_id: str, user_id: str) -> bool:
        """Delete a document and all its chunks"""
        result = self.client.table("rag_documents")\
            .delete()\
            .eq("id", doc_id)\
            .eq("user_id", user_id)\
            .execute()
        return bool(result.data)
    
    # ==================== Search Operations ====================
    
    async def search(
        self,
        query: str,
        user_id: str,
        document_ids: Optional[List[str]] = None,
        limit: int = 10,
        threshold: float = 0.3,
        use_hybrid: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Search documents with citations
        Returns chunks with relevance scores and citation info
        """
        query_embedding = self.create_embedding(query)
        
        if query_embedding is None:
            logger.warning("[RAG] No embedding model, using keyword search only")
            return await self._keyword_search(query, user_id, document_ids, limit)
        
        try:
            if use_hybrid:
                # Use hybrid search RPC
                result = self.client.rpc(
                    "hybrid_search_chunks",
                    {
                        "query_text": query,
                        "query_embedding": query_embedding,
                        "match_count": limit,
                        "filter_user_id": user_id,
                        "filter_document_id": document_ids[0] if document_ids and len(document_ids) == 1 else None,
                        "vector_weight": 0.7,
                        "keyword_weight": 0.3
                    }
                ).execute()
            else:
                # Use vector-only search
                result = self.client.rpc(
                    "search_document_chunks",
                    {
                        "query_embedding": query_embedding,
                        "match_count": limit,
                        "filter_user_id": user_id,
                        "filter_document_id": document_ids[0] if document_ids and len(document_ids) == 1 else None,
                        "similarity_threshold": threshold
                    }
                ).execute()
            
            results = result.data or []
            
            # Enrich with document names
            if results:
                doc_ids = list(set(r["document_id"] for r in results))
                docs = self.client.table("rag_documents")\
                    .select("id, name")\
                    .in_("id", doc_ids)\
                    .execute()
                doc_names = {d["id"]: d["name"] for d in (docs.data or [])}
                
                for r in results:
                    r["document_name"] = doc_names.get(r["document_id"], "Unknown")
            
            return results
            
        except Exception as e:
            logger.error(f"[RAG] Search error: {e}")
            # Fallback to direct query
            return await self._fallback_search(query_embedding, user_id, limit, threshold)
    
    async def _keyword_search(
        self,
        query: str,
        user_id: str,
        document_ids: Optional[List[str]],
        limit: int
    ) -> List[Dict]:
        """Fallback keyword search"""
        # Simple ILIKE search
        query_pattern = f"%{query}%"
        
        q = self.client.table("document_chunks")\
            .select("id, document_id, content, section_title, page_number")\
            .eq("user_id", user_id)\
            .ilike("content", query_pattern)\
            .limit(limit)
        
        if document_ids:
            q = q.in_("document_id", document_ids)
        
        result = q.execute()
        return result.data or []
    
    async def _fallback_search(
        self,
        embedding: List[float],
        user_id: str,
        limit: int,
        threshold: float
    ) -> List[Dict]:
        """Fallback search without RPC"""
        # Direct vector search (less efficient but works)
        result = self.client.table("document_chunks")\
            .select("id, document_id, content, section_title, page_number, embedding")\
            .eq("user_id", user_id)\
            .limit(limit * 3)\
            .execute()
        
        if not result.data:
            return []
        
        # Calculate similarity in Python
        import numpy as np
        query_vec = np.array(embedding)
        
        scored = []
        for chunk in result.data:
            if chunk.get("embedding"):
                chunk_vec = np.array(chunk["embedding"])
                similarity = float(np.dot(query_vec, chunk_vec) / 
                                 (np.linalg.norm(query_vec) * np.linalg.norm(chunk_vec)))
                if similarity >= threshold:
                    chunk["similarity"] = similarity
                    del chunk["embedding"]  # Don't return embedding
                    scored.append(chunk)
        
        scored.sort(key=lambda x: x["similarity"], reverse=True)
        return scored[:limit]
    
    # ==================== Context Building ====================
    
    def build_context_for_query(
        self,
        search_results: List[Dict],
        max_tokens: int = 3000,
        include_citations: bool = True
    ) -> Tuple[str, List[Dict]]:
        """
        Build context string from search results
        Returns (context_string, sources_list)
        """
        if not search_results:
            return "", []
        
        context_parts = []
        sources = []
        total_chars = 0
        max_chars = max_tokens * 4  # Approximate chars
        
        for i, result in enumerate(search_results):
            content = result.get("content", "")
            
            if total_chars + len(content) > max_chars:
                break
            
            # Build citation reference
            doc_name = result.get("document_name", "Document")
            section = result.get("section_title", "")
            page = result.get("page_number", "")
            
            if include_citations:
                citation = f"[{i+1}]"
                if section:
                    citation_info = f"{doc_name}, {section}"
                elif page:
                    citation_info = f"{doc_name}, стр. {page}"
                else:
                    citation_info = doc_name
                
                context_parts.append(f"{citation} {content}")
                sources.append({
                    "ref": i + 1,
                    "document": doc_name,
                    "section": section,
                    "page": page,
                    "similarity": result.get("similarity") or result.get("combined_score"),
                    "preview": content[:100] + "..." if len(content) > 100 else content
                })
            else:
                context_parts.append(content)
            
            total_chars += len(content)
        
        context = "\n\n".join(context_parts)
        
        return context, sources
    
    def format_context_with_sources(
        self,
        context: str,
        sources: List[Dict]
    ) -> str:
        """Format context with source references at the end"""
        if not sources:
            return context
        
        source_lines = ["\n\n---\nИсточники:"]
        for s in sources:
            ref = s["ref"]
            doc = s["document"]
            section = s.get("section", "")
            page = s.get("page", "")
            
            if section:
                source_lines.append(f"[{ref}] {doc} — {section}")
            elif page:
                source_lines.append(f"[{ref}] {doc} — стр. {page}")
            else:
                source_lines.append(f"[{ref}] {doc}")
        
        return context + "\n".join(source_lines)


# Singleton instance
_rag_store: Optional[AdvancedRAGStore] = None


def get_advanced_rag_store() -> AdvancedRAGStore:
    """Get or create RAG store instance"""
    global _rag_store
    if _rag_store is None:
        _rag_store = AdvancedRAGStore()
    return _rag_store
