"""
Advanced Document RAG with OpenAI Embeddings and Supabase
Uses OpenAI text-embedding-3-small (1536 dimensions)
"""
import os
import re
import hashlib
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
import uuid
import json

logger = logging.getLogger(__name__)

# Constants
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSION = 1536
DEFAULT_CHUNK_SIZE = 800
DEFAULT_CHUNK_OVERLAP = 150


@dataclass
class DocumentChunk:
    """A chunk of a document with citation metadata"""
    id: str
    document_id: str
    content: str
    chunk_index: int
    page_number: Optional[int] = None
    paragraph_number: Optional[int] = None
    section_title: Optional[str] = None
    chunk_type: str = "content"
    char_start: int = 0
    char_end: int = 0
    word_count: int = 0
    embedding: Optional[List[float]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SearchResult:
    """A search result with citation"""
    chunk_id: str
    document_id: str
    document_name: str
    content: str
    page_number: Optional[int]
    section_title: Optional[str]
    chunk_index: int
    similarity: float
    citation: str  # Formatted citation string
    

class AdvancedDocumentRAG:
    """
    Production-ready Document RAG with:
    - Smart chunking (preserves paragraphs, sections)
    - OpenAI embeddings (1536 dim)
    - Hybrid search (vector + keyword)
    - Precise citations
    - Supabase storage
    """
    
    def __init__(self):
        self._openai_client = None
        self._supabase_client = None
        
    @property
    def openai_client(self):
        """Lazy load OpenAI client"""
        if self._openai_client is None:
            from openai import OpenAI
            
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
            
            if not api_key or api_key in invalid_keys:
                raise ValueError("OPENAI_API_KEY is required for embeddings (set in .env or via UI)")
            self._openai_client = OpenAI(api_key=api_key)
        return self._openai_client
    
    @property
    def supabase(self):
        """Lazy load Supabase client"""
        if self._supabase_client is None:
            from supabase import create_client
            url = os.getenv("SUPABASE_URL")
            key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
            if not url or not key:
                raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY are required")
            self._supabase_client = create_client(url, key)
        return self._supabase_client
    
    # =========================================================================
    # TEXT EXTRACTION
    # =========================================================================
    
    def extract_text_from_file(self, file_path: str, file_type: str) -> Tuple[str, Dict]:
        """Extract text and metadata from various file types"""
        file_path = Path(file_path)
        metadata = {"pages": 1, "file_type": file_type}
        
        if file_type in ["application/pdf", ".pdf"]:
            return self._extract_pdf(file_path, metadata)
        elif file_type in ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"]:
            return self._extract_docx(file_path, metadata)
        elif file_type in ["text/plain", ".txt", "text/markdown", ".md"]:
            return self._extract_text(file_path, metadata)
        else:
            # Try as plain text
            return self._extract_text(file_path, metadata)
    
    def _extract_pdf(self, file_path: Path, metadata: Dict) -> Tuple[str, Dict]:
        """Extract text from PDF with page numbers"""
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(file_path))
            
            text_parts = []
            for i, page in enumerate(reader.pages, 1):
                page_text = page.extract_text() or ""
                if page_text.strip():
                    # Add page marker
                    text_parts.append(f"[PAGE {i}]\n{page_text}")
            
            metadata["pages"] = len(reader.pages)
            return "\n\n".join(text_parts), metadata
            
        except ImportError:
            logger.warning("pypdf not installed, falling back to plain text")
            return self._extract_text(file_path, metadata)
    
    def _extract_docx(self, file_path: Path, metadata: Dict) -> Tuple[str, Dict]:
        """Extract text from DOCX"""
        try:
            from docx import Document
            doc = Document(str(file_path))
            
            text_parts = []
            for para in doc.paragraphs:
                if para.text.strip():
                    # Detect if it's a heading
                    if para.style.name.startswith('Heading'):
                        text_parts.append(f"\n## {para.text}\n")
                    else:
                        text_parts.append(para.text)
            
            # Estimate pages (roughly 3000 chars per page)
            full_text = "\n".join(text_parts)
            metadata["pages"] = max(1, len(full_text) // 3000)
            
            return full_text, metadata
            
        except ImportError:
            logger.warning("python-docx not installed")
            return self._extract_text(file_path, metadata)
    
    def _extract_text(self, file_path: Path, metadata: Dict) -> Tuple[str, Dict]:
        """Extract plain text"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                text = f.read()
        except UnicodeDecodeError:
            with open(file_path, 'r', encoding='cp1251') as f:
                text = f.read()
        
        metadata["pages"] = max(1, len(text) // 3000)
        return text, metadata
    
    # =========================================================================
    # CHUNKING
    # =========================================================================
    
    def chunk_document(
        self,
        text: str,
        document_id: str,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        chunk_overlap: int = DEFAULT_CHUNK_OVERLAP
    ) -> List[DocumentChunk]:
        """
        Smart chunking that preserves:
        - Section boundaries
        - Paragraph integrity
        - Page references
        """
        chunks = []
        
        # Detect page markers
        page_pattern = re.compile(r'\[PAGE (\d+)\]')
        
        # Split by sections (## headers)
        section_pattern = re.compile(r'(^|\n)(#{1,3}\s+.+?)(?=\n)', re.MULTILINE)
        
        current_page = 1
        current_section = "Introduction"
        current_paragraph = 0
        char_position = 0
        
        # Split into paragraphs first
        paragraphs = re.split(r'\n\n+', text)
        
        current_chunk_text = ""
        current_chunk_start = 0
        chunk_index = 0
        
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            
            # Check for page marker
            page_match = page_pattern.search(para)
            if page_match:
                current_page = int(page_match.group(1))
                para = page_pattern.sub('', para).strip()
                if not para:
                    continue
            
            # Check for section header
            section_match = section_pattern.search(para)
            if section_match:
                # Save current chunk if exists
                if current_chunk_text.strip():
                    chunks.append(self._create_chunk(
                        document_id=document_id,
                        content=current_chunk_text.strip(),
                        chunk_index=chunk_index,
                        page_number=current_page,
                        paragraph_number=current_paragraph,
                        section_title=current_section,
                        char_start=current_chunk_start,
                        char_end=char_position
                    ))
                    chunk_index += 1
                    current_chunk_text = ""
                    current_chunk_start = char_position
                
                # Extract section title
                current_section = para.lstrip('#').strip()
            
            current_paragraph += 1
            
            # Check if adding this paragraph exceeds chunk size
            if len(current_chunk_text) + len(para) > chunk_size and current_chunk_text:
                # Save current chunk
                chunks.append(self._create_chunk(
                    document_id=document_id,
                    content=current_chunk_text.strip(),
                    chunk_index=chunk_index,
                    page_number=current_page,
                    paragraph_number=current_paragraph - 1,
                    section_title=current_section,
                    char_start=current_chunk_start,
                    char_end=char_position
                ))
                chunk_index += 1
                
                # Start new chunk with overlap
                overlap_text = current_chunk_text[-chunk_overlap:] if len(current_chunk_text) > chunk_overlap else ""
                current_chunk_text = overlap_text + "\n\n" + para if overlap_text else para
                current_chunk_start = char_position - len(overlap_text)
            else:
                current_chunk_text += ("\n\n" if current_chunk_text else "") + para
            
            char_position += len(para) + 2  # +2 for \n\n
        
        # Don't forget the last chunk
        if current_chunk_text.strip():
            chunks.append(self._create_chunk(
                document_id=document_id,
                content=current_chunk_text.strip(),
                chunk_index=chunk_index,
                page_number=current_page,
                paragraph_number=current_paragraph,
                section_title=current_section,
                char_start=current_chunk_start,
                char_end=char_position
            ))
        
        logger.info(f"Created {len(chunks)} chunks from document {document_id}")
        return chunks
    
    def _create_chunk(self, **kwargs) -> DocumentChunk:
        """Create a DocumentChunk with generated ID"""
        return DocumentChunk(
            id=str(uuid.uuid4()),
            word_count=len(kwargs.get('content', '').split()),
            **kwargs
        )
    
    # =========================================================================
    # EMBEDDINGS
    # =========================================================================
    
    def create_embedding(self, text: str) -> List[float]:
        """Create embedding using OpenAI"""
        response = self.openai_client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text[:8000]  # Limit input length
        )
        return response.data[0].embedding
    
    def create_embeddings_batch(self, texts: List[str], batch_size: int = 100) -> List[List[float]]:
        """Create embeddings in batches"""
        all_embeddings = []
        
        for i in range(0, len(texts), batch_size):
            batch = [t[:8000] for t in texts[i:i + batch_size]]
            response = self.openai_client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=batch
            )
            all_embeddings.extend([item.embedding for item in response.data])
            logger.info(f"Created embeddings for batch {i // batch_size + 1}")
        
        return all_embeddings
    
    # =========================================================================
    # DOCUMENT OPERATIONS
    # =========================================================================
    
    async def upload_document(
        self,
        user_id: str,
        file_content: bytes,
        filename: str,
        file_type: str,
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Full document processing pipeline:
        1. Save file temporarily
        2. Extract text
        3. Chunk document
        4. Create embeddings
        5. Store in Supabase
        """
        import tempfile
        
        document_id = str(uuid.uuid4())
        
        # Create document record
        doc_record = {
            "id": document_id,
            "user_id": user_id,
            "original_filename": filename,
            "name": filename,
            "file_type": file_type,
            "file_size": len(file_content),
            "status": "processing",
            "metadata": metadata or {}
        }
        
        try:
            # Insert document
            self.supabase.table("documents").insert(doc_record).execute()
            logger.info(f"Created document record: {document_id}")
            
            # Save to temp file
            suffix = Path(filename).suffix
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(file_content)
                tmp_path = tmp.name
            
            # Extract text
            text, doc_metadata = self.extract_text_from_file(tmp_path, file_type)
            
            # Clean up temp file
            os.unlink(tmp_path)
            
            if not text.strip():
                self._update_document_status(document_id, "error", "No text content found")
                return {"id": document_id, "status": "error", "error": "No text content found"}
            
            # Chunk document
            chunks = self.chunk_document(text, document_id)
            
            if not chunks:
                self._update_document_status(document_id, "error", "No chunks created")
                return {"id": document_id, "status": "error", "error": "No chunks created"}
            
            # Create embeddings
            logger.info(f"Creating embeddings for {len(chunks)} chunks...")
            embeddings = self.create_embeddings_batch([c.content for c in chunks])
            
            # Assign embeddings to chunks
            for chunk, embedding in zip(chunks, embeddings):
                chunk.embedding = embedding
            
            # Store chunks in Supabase
            await self._store_chunks(chunks, user_id)
            
            # Update document status
            self.supabase.table("documents").update({
                "status": "ready",
                "total_chunks": len(chunks),
                "total_characters": len(text),
                "estimated_pages": doc_metadata.get("pages", 1)
            }).eq("id", document_id).execute()
            
            logger.info(f"Document {document_id} processed: {len(chunks)} chunks")
            
            return {
                "id": document_id,
                "name": filename,
                "status": "ready",
                "chunks_count": len(chunks),
                "pages": doc_metadata.get("pages", 1)
            }
            
        except Exception as e:
            logger.error(f"Error processing document: {e}")
            self._update_document_status(document_id, "error", str(e))
            raise
    
    async def _store_chunks(self, chunks: List[DocumentChunk], user_id: str):
        """Store chunks in Supabase"""
        batch_size = 50
        
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            records = []
            
            for chunk in batch:
                records.append({
                    "id": chunk.id,
                    "document_id": chunk.document_id,
                    "user_id": user_id,
                    "content": chunk.content,
                    "embedding": chunk.embedding,
                    "chunk_index": chunk.chunk_index,
                    "page_number": chunk.page_number,
                    "paragraph_number": chunk.paragraph_number,
                    "section_title": chunk.section_title,
                    "chunk_type": chunk.chunk_type,
                    "char_start": chunk.char_start,
                    "char_end": chunk.char_end,
                    "word_count": chunk.word_count,
                    "metadata": chunk.metadata
                })
            
            self.supabase.table("document_chunks").insert(records).execute()
            logger.info(f"Stored batch {i // batch_size + 1}: {len(records)} chunks")
    
    def _update_document_status(self, document_id: str, status: str, error: str = None):
        """Update document status"""
        update = {"status": status}
        if error:
            update["error_message"] = error
        self.supabase.table("documents").update(update).eq("id", document_id).execute()
    
    # =========================================================================
    # SEARCH
    # =========================================================================
    
    def search(
        self,
        query: str,
        user_id: str,
        document_ids: Optional[List[str]] = None,
        limit: int = 10,
        threshold: float = 0.5,
        use_hybrid: bool = True
    ) -> List[SearchResult]:
        """
        Search documents with vector similarity and optional keyword matching
        Returns results with precise citations
        """
        # Create query embedding
        query_embedding = self.create_embedding(query)
        
        try:
            if use_hybrid:
                # Use hybrid search RPC
                result = self.supabase.rpc(
                    "hybrid_search_chunks_v2",
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
                # Vector-only search
                result = self.supabase.rpc(
                    "search_document_chunks_v2",
                    {
                        "query_embedding": query_embedding,
                        "match_count": limit,
                        "filter_user_id": user_id,
                        "filter_document_id": document_ids[0] if document_ids and len(document_ids) == 1 else None,
                        "similarity_threshold": threshold
                    }
                ).execute()
            
            # Convert to SearchResult objects
            search_results = []
            for r in result.data or []:
                # Format citation
                citation = self._format_citation(r)
                
                search_results.append(SearchResult(
                    chunk_id=r.get("id"),
                    document_id=r.get("document_id"),
                    document_name=r.get("document_name", "Unknown"),
                    content=r.get("content"),
                    page_number=r.get("page_number"),
                    section_title=r.get("section_title"),
                    chunk_index=r.get("chunk_index", 0),
                    similarity=r.get("combined_score") or r.get("similarity", 0),
                    citation=citation
                ))
            
            return search_results
            
        except Exception as e:
            logger.error(f"Search error: {e}")
            # Fallback to simple search without RPC
            return self._fallback_search(query_embedding, user_id, limit)
    
    def _fallback_search(
        self,
        query_embedding: List[float],
        user_id: str,
        limit: int
    ) -> List[SearchResult]:
        """Fallback search using direct query"""
        # This is less efficient but works without RPC functions
        result = self.supabase.table("document_chunks")\
            .select("*, documents(name, original_filename)")\
            .eq("user_id", user_id)\
            .limit(limit * 2)\
            .execute()
        
        if not result.data:
            return []
        
        # Calculate similarities in Python (slower but works)
        import numpy as np
        query_vec = np.array(query_embedding)
        
        scored_results = []
        for r in result.data:
            if r.get("embedding"):
                chunk_vec = np.array(r["embedding"])
                similarity = np.dot(query_vec, chunk_vec) / (np.linalg.norm(query_vec) * np.linalg.norm(chunk_vec))
                scored_results.append((similarity, r))
        
        # Sort by similarity
        scored_results.sort(key=lambda x: x[0], reverse=True)
        
        # Convert to SearchResult
        search_results = []
        for sim, r in scored_results[:limit]:
            doc_info = r.get("documents", {})
            doc_name = doc_info.get("name") or doc_info.get("original_filename") or "Unknown"
            
            citation = self._format_citation({
                **r,
                "document_name": doc_name,
                "similarity": sim
            })
            
            search_results.append(SearchResult(
                chunk_id=r.get("id"),
                document_id=r.get("document_id"),
                document_name=doc_name,
                content=r.get("content"),
                page_number=r.get("page_number"),
                section_title=r.get("section_title"),
                chunk_index=r.get("chunk_index", 0),
                similarity=sim,
                citation=citation
            ))
        
        return search_results
    
    def _format_citation(self, result: Dict) -> str:
        """Format a citation string from search result"""
        parts = []
        
        doc_name = result.get("document_name", "Unknown Document")
        parts.append(doc_name)
        
        if result.get("page_number"):
            parts.append(f"стр. {result['page_number']}")
        
        if result.get("section_title"):
            parts.append(f"раздел: {result['section_title']}")
        
        return " | ".join(parts)
    
    # =========================================================================
    # CONTEXT BUILDING
    # =========================================================================
    
    def build_rag_context(
        self,
        query: str,
        user_id: str,
        document_ids: Optional[List[str]] = None,
        max_tokens: int = 4000,
        include_citations: bool = True
    ) -> Tuple[str, List[Dict]]:
        """
        Build RAG context for LLM prompt
        Returns formatted context and sources list
        """
        # Search for relevant chunks
        results = self.search(
            query=query,
            user_id=user_id,
            document_ids=document_ids,
            limit=15,  # Get more, then trim by tokens
            use_hybrid=True
        )
        
        if not results:
            return "", []
        
        # Build context with citations
        context_parts = []
        sources = []
        total_chars = 0
        max_chars = max_tokens * 4  # Rough estimate
        
        for i, r in enumerate(results, 1):
            chunk_text = r.content.strip()
            
            if include_citations:
                citation_header = f"[{i}] {r.citation}"
                chunk_with_citation = f"{citation_header}\n{chunk_text}"
            else:
                chunk_with_citation = chunk_text
            
            if total_chars + len(chunk_with_citation) > max_chars:
                break
            
            context_parts.append(chunk_with_citation)
            total_chars += len(chunk_with_citation)
            
            sources.append({
                "index": i,
                "document_id": r.document_id,
                "document_name": r.document_name,
                "page": r.page_number,
                "section": r.section_title,
                "similarity": round(r.similarity, 3),
                "citation": r.citation
            })
        
        context = "\n\n---\n\n".join(context_parts)
        
        # Add instruction header
        if include_citations:
            context = f"""Релевантная информация из документов:

{context}

При ответе ссылайся на источники по номеру [1], [2] и т.д."""
        
        return context, sources
    
    # =========================================================================
    # DOCUMENT MANAGEMENT
    # =========================================================================
    
    def list_documents(self, user_id: str, limit: int = 50) -> List[Dict]:
        """List user's documents"""
        result = self.supabase.table("documents")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("created_at", desc=True)\
            .limit(limit)\
            .execute()
        
        return result.data or []
    
    def get_document(self, document_id: str, user_id: str) -> Optional[Dict]:
        """Get document by ID"""
        result = self.supabase.table("documents")\
            .select("*")\
            .eq("id", document_id)\
            .eq("user_id", user_id)\
            .single()\
            .execute()
        
        return result.data
    
    def delete_document(self, document_id: str, user_id: str) -> bool:
        """Delete document and all its chunks"""
        # Chunks are deleted via CASCADE
        result = self.supabase.table("documents")\
            .delete()\
            .eq("id", document_id)\
            .eq("user_id", user_id)\
            .execute()
        
        return len(result.data) > 0 if result.data else False


# Singleton instance
_rag_instance = None

def get_document_rag() -> AdvancedDocumentRAG:
    """Get singleton instance of AdvancedDocumentRAG"""
    global _rag_instance
    if _rag_instance is None:
        _rag_instance = AdvancedDocumentRAG()
    return _rag_instance
