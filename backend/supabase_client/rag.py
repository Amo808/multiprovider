"""
RAG (Retrieval Augmented Generation) operations for Supabase
Handles document upload, chunking, embedding, and similarity search
"""
import os
import json
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
from .debug_collector import RAGDebugCollector, get_current_collector, new_collector

logger = logging.getLogger(__name__)


# ==================== PROMPTS CONFIG LOADER ====================

RAG_PROMPTS_PATH = Path(__file__).parent.parent / "data" / "rag_prompts.json"
MODEL_LIMITS_PATH = Path(__file__).parent.parent / "data" / "model_limits.json"
_prompts_cache: Optional[Dict] = None
_prompts_cache_mtime: float = 0
_model_limits_cache: Optional[Dict] = None
_model_limits_cache_mtime: float = 0


def load_model_limits() -> Dict:
    """
    Load model token limits from JSON config file.
    Caches the result and reloads if file changed.
    """
    global _model_limits_cache, _model_limits_cache_mtime
    
    try:
        if MODEL_LIMITS_PATH.exists():
            current_mtime = MODEL_LIMITS_PATH.stat().st_mtime
            
            # Return cache if file hasn't changed
            if _model_limits_cache is not None and current_mtime == _model_limits_cache_mtime:
                return _model_limits_cache
            
            # Load and cache
            with open(MODEL_LIMITS_PATH, 'r', encoding='utf-8') as f:
                _model_limits_cache = json.load(f)
                _model_limits_cache_mtime = current_mtime
                logger.info(f"[RAG] Loaded model limits from {MODEL_LIMITS_PATH}")
                return _model_limits_cache
        else:
            logger.warning(f"[RAG] Model limits file not found: {MODEL_LIMITS_PATH}")
            return {"defaults": {"context_limit": 8192, "rag_context_percent": 70, "safety_buffer_tokens": 5000}, "models": {}}
    except Exception as e:
        logger.error(f"[RAG] Failed to load model limits: {e}")
        return {"defaults": {"context_limit": 8192, "rag_context_percent": 70, "safety_buffer_tokens": 5000}, "models": {}}


def get_model_limit(model_name: str) -> Dict[str, int]:
    """
    Get token limits for a specific model.
    Searches for exact match first, then partial match.
    
    Args:
        model_name: Name of the model (e.g., "gpt-4o", "claude-3-sonnet")
    
    Returns:
        Dict with context_limit, rag_context_percent, safety_buffer_tokens
    """
    config = load_model_limits()
    defaults = config.get("defaults", {})
    models = config.get("models", {})
    
    model_name_lower = model_name.lower()
    
    # Try exact match first
    if model_name_lower in models:
        model_config = models[model_name_lower]
        return {
            "context_limit": model_config.get("context_limit", defaults.get("context_limit", 8192)),
            "rag_context_percent": model_config.get("rag_context_percent", defaults.get("rag_context_percent", 70)),
            "safety_buffer_tokens": defaults.get("safety_buffer_tokens", 5000)
        }
    
    # Try partial match (e.g., "gpt-4o-2024-01-01" matches "gpt-4o")
    for key in models:
        if key in model_name_lower or model_name_lower in key:
            model_config = models[key]
            return {
                "context_limit": model_config.get("context_limit", defaults.get("context_limit", 8192)),
                "rag_context_percent": model_config.get("rag_context_percent", defaults.get("rag_context_percent", 70)),
                "safety_buffer_tokens": defaults.get("safety_buffer_tokens", 5000)
            }
    
    # Return defaults if no match
    logger.warning(f"[RAG] No model limit found for '{model_name}', using defaults")
    return {
        "context_limit": defaults.get("context_limit", 8192),
        "rag_context_percent": defaults.get("rag_context_percent", 70),
        "safety_buffer_tokens": defaults.get("safety_buffer_tokens", 5000)
    }


def load_rag_prompts() -> Dict:
    """
    Load RAG prompts from JSON config file.
    Caches the result and reloads if file changed.
    """
    global _prompts_cache, _prompts_cache_mtime
    
    try:
        if RAG_PROMPTS_PATH.exists():
            current_mtime = RAG_PROMPTS_PATH.stat().st_mtime
            
            # Return cache if file hasn't changed
            if _prompts_cache is not None and current_mtime == _prompts_cache_mtime:
                return _prompts_cache
            
            # Load and cache
            with open(RAG_PROMPTS_PATH, 'r', encoding='utf-8') as f:
                _prompts_cache = json.load(f)
                _prompts_cache_mtime = current_mtime
                logger.info(f"[RAG] Loaded prompts from {RAG_PROMPTS_PATH}")
                return _prompts_cache
        else:
            logger.warning(f"[RAG] Prompts file not found: {RAG_PROMPTS_PATH}")
            return {}
    except Exception as e:
        logger.error(f"[RAG] Failed to load prompts: {e}")
        return {}


def get_prompt(section: str, key: str = None, default: str = "") -> str:
    """
    Get a specific prompt from the config.
    
    Args:
        section: Section name (e.g., 'task_instructions', 'search_strategies')
        key: Key within section (e.g., 'summarize', 'hyde')
        default: Default value if not found
    
    Returns:
        The prompt string or default
    """
    prompts = load_rag_prompts()
    
    if section not in prompts:
        return default
    
    if key is None:
        # Return the whole section if it's a string/prompt
        section_data = prompts[section]
        if isinstance(section_data, dict) and 'prompt' in section_data:
            return section_data['prompt']
        return default
    
    section_data = prompts.get(section, {})
    if isinstance(section_data, dict):
        item = section_data.get(key, {})
        if isinstance(item, dict):
            return item.get('prompt', default)
        return str(item) if item else default
    
    return default


def get_context_header() -> str:
    """Get the context header prompt."""
    return get_prompt('context_header', default="""Используй следующие фрагменты документов для ответа на вопрос пользователя.
Если информация из документов релевантна, обязательно укажи номер источника [1], [2] и т.д.
Если в документах нет нужной информации, честно скажи об этом.

---
НАЙДЕННЫЕ ДОКУМЕНТЫ:""")


def get_task_prompt(task: str) -> str:
    """Get prompt for a specific task."""
    return get_prompt('task_instructions', task, default="")


def get_search_strategy_prompt(strategy: str) -> str:
    """Get prompt for a specific search strategy."""
    return get_prompt('search_strategies', strategy, default="")


def get_default_setting(key: str, default: Any = None) -> Any:
    """Get a default setting value."""
    prompts = load_rag_prompts()
    return prompts.get('defaults', {}).get(key, default)


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


def remove_chunk_overlaps(chunks: List[str], min_overlap: int = 20, max_overlap: int = 300) -> str:
    """
    Remove overlapping text between consecutive chunks when concatenating.
    
    When chunks are created with overlap (e.g., 200 chars), consecutive chunks
    share some text. This function detects and removes these duplicates.
    
    Args:
        chunks: List of chunk texts in order
        min_overlap: Minimum overlap length to detect (avoid false positives)
        max_overlap: Maximum overlap to search for
    
    Returns:
        Combined text with overlaps removed
    """
    if not chunks:
        return ""
    
    if len(chunks) == 1:
        return chunks[0]
    
    result = [chunks[0]]
    
    for i in range(1, len(chunks)):
        prev_chunk = result[-1] if result else ""
        curr_chunk = chunks[i]
        
        if not prev_chunk or not curr_chunk:
            result.append(curr_chunk)
            continue
        
        # Look for overlap: end of previous chunk should match start of current chunk
        overlap_found = 0
        
        # Search for overlapping suffix/prefix
        # Start from larger overlaps and work down to find the longest match
        for overlap_len in range(min(max_overlap, len(prev_chunk), len(curr_chunk)), min_overlap - 1, -1):
            prev_suffix = prev_chunk[-overlap_len:]
            curr_prefix = curr_chunk[:overlap_len]
            
            if prev_suffix == curr_prefix:
                overlap_found = overlap_len
                break
        
        if overlap_found > 0:
            # Remove the overlapping part from the beginning of current chunk
            result.append(curr_chunk[overlap_found:])
        else:
            result.append(curr_chunk)
    
    return "".join(result)


def deduplicate_sequential_chunks(chunks: List[Dict], content_key: str = "content") -> List[Dict]:
    """
    Deduplicate sequential chunks that have overlapping content.
    Modifies content in place and returns chunks with cleaned content.
    
    Args:
        chunks: List of chunk dictionaries with content
        content_key: Key to access content in chunk dict
    
    Returns:
        Same chunks with overlapping content removed
    """
    if not chunks or len(chunks) < 2:
        return chunks
    
    # Sort by chunk_index to ensure correct order
    sorted_chunks = sorted(chunks, key=lambda c: c.get("chunk_index", 0))
    
    # Extract just the content texts
    texts = [c.get(content_key, "") for c in sorted_chunks]
    
    # Remove overlaps
    combined = remove_chunk_overlaps(texts)
    
    # Can't easily re-split, so return combined as single chunk info
    # Better approach: modify each chunk to remove its overlap
    result_chunks = []
    current_pos = 0
    
    for i, chunk in enumerate(sorted_chunks):
        orig_content = chunk.get(content_key, "")
        
        if i == 0:
            # First chunk - keep as is
            result_chunks.append(chunk)
            current_pos = len(orig_content)
        else:
            # Find where this chunk's unique content starts
            prev_chunk = sorted_chunks[i - 1]
            prev_content = prev_chunk.get(content_key, "")
            
            # Detect overlap with previous
            overlap_found = 0
            for overlap_len in range(min(CHUNK_OVERLAP + 50, len(prev_content), len(orig_content)), 19, -1):
                if prev_content[-overlap_len:] == orig_content[:overlap_len]:
                    overlap_found = overlap_len
                    break
            
            if overlap_found > 0:
                # Create modified chunk without the overlap
                new_chunk = chunk.copy()
                new_chunk[content_key] = orig_content[overlap_found:]
                result_chunks.append(new_chunk)
            else:
                result_chunks.append(chunk)
    
    return result_chunks


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
    
    # ==================== CHUNK CALCULATION ====================
    
    def calculate_target_chunks(
        self,
        total_chunks: int,
        chunk_mode: str = "adaptive",
        max_chunks: int = 50,
        chunk_percent: float = 20.0,
        min_chunks: int = 5,
        max_chunks_limit: int = 10000,  # Internal safety limit
        max_percent_limit: float = 30.0,  # Main user-facing limit (% of document)
        query_complexity: str = "medium"
    ) -> int:
        """
        Calculate target number of chunks based on mode and document size.
        
        IMPORTANT: 
        - In "percent" mode: chunk_percent is the PRIMARY setting (user's explicit choice)
        - In "adaptive" mode: max_percent_limit caps the adaptive calculation
        - max_chunks_limit is always the absolute safety limit
        
        Args:
            total_chunks: Total number of chunks in document(s)
            chunk_mode: "fixed", "percent", or "adaptive"
            max_chunks: For "fixed" mode - exact number of chunks
            chunk_percent: For "percent" mode - user's chosen percentage
            min_chunks: Minimum chunks to retrieve
            max_chunks_limit: Internal safety limit (absolute number)
            max_percent_limit: For "adaptive" mode - caps adaptive calculation
            query_complexity: "simple", "medium", "complex" (for adaptive mode)
        
        Returns:
            Target number of chunks to retrieve
        """
        logger.info(f"[RAG] calculate_target_chunks called: mode={chunk_mode}, "
                   f"chunk_percent={chunk_percent}%, max_percent_limit={max_percent_limit}%, "
                   f"total_chunks={total_chunks}")
        
        if chunk_mode == "fixed":
            # Fixed mode: use exact number of chunks
            target = max_chunks
            logger.info(f"[RAG] Fixed mode: target={max_chunks} chunks")
            
        elif chunk_mode == "percent":
            # PERCENT MODE: User explicitly chose this percentage - USE IT DIRECTLY
            # chunk_percent is the user's explicit choice, respect it!
            target = int(total_chunks * (chunk_percent / 100.0))
            logger.info(f"[RAG] Percent mode: {chunk_percent}% of {total_chunks} = {target} chunks")
            
        elif chunk_mode == "adaptive":
            # Adaptive mode: AI decides based on query complexity
            # max_percent_limit caps the adaptive calculation
            if query_complexity == "simple":
                # Simple factual questions: 5-15% of doc
                adaptive_percent = 10.0
            elif query_complexity == "complex":
                # Complex analysis: 30-50% of doc
                adaptive_percent = 40.0
            else:
                # Medium complexity: 15-25% of doc
                adaptive_percent = 20.0
            
            # Use the lower of adaptive_percent and max_percent_limit
            effective_percent = min(adaptive_percent, max_percent_limit)
            target = int(total_chunks * (effective_percent / 100.0))
            logger.info(f"[RAG] Adaptive mode: complexity={query_complexity}, "
                       f"adaptive_percent={adaptive_percent}%, max_percent_limit={max_percent_limit}%, "
                       f"effective_percent={effective_percent}%, target={target}")
        else:
            # Default fallback - use max_percent_limit
            target = int(total_chunks * (max_percent_limit / 100.0))
            logger.info(f"[RAG] Unknown mode '{chunk_mode}', using max_percent_limit={max_percent_limit}%")
        
        # Apply constraints
        # 1. Ensure minimum chunks
        target = max(target, min_chunks)
        
        # 2. Cap at absolute safety limit
        target = min(target, max_chunks_limit)
        
        # 3. Can't exceed total
        target = min(target, total_chunks)
        
        logger.info(f"[RAG] Final target chunks: {target} "
                   f"(after applying min={min_chunks}, max_limit={max_chunks_limit}, total={total_chunks})")
        
        return target
    
    def estimate_query_complexity(self, query: str) -> str:
        """
        Estimate query complexity for adaptive chunk selection.
        
        Returns: "simple", "medium", or "complex"
        """
        # Simple heuristics
        query_lower = query.lower()
        word_count = len(query.split())
        
        # Complex queries
        complex_indicators = [
            "сравни", "compare", "анализ", "analysis", "analyze",
            "все", "all", "полностью", "целиком", "весь документ",
            "подробно", "детально", "in detail", "throughout",
            "связь между", "relationship", "противоречия", "contradictions",
            "суммаризируй весь", "summarize entire", "overview"
        ]
        
        # Simple queries
        simple_indicators = [
            "что такое", "what is", "определение", "definition",
            "когда", "when", "где", "where", "кто", "who",
            "сколько", "how many", "how much", "какой", "which"
        ]
        
        # Check for complex
        for indicator in complex_indicators:
            if indicator in query_lower:
                return "complex"
        
        # Check for simple
        for indicator in simple_indicators:
            if indicator in query_lower:
                if word_count < 10:  # Short factual questions
                    return "simple"
        
        # Default based on length
        if word_count > 20:
            return "complex"
        elif word_count < 6:
            return "simple"
        
        return "medium"
    
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
        metadata: Optional[Dict] = None,
        conversation_id: Optional[str] = None  # NEW: Link to specific conversation
    ) -> Dict[str, Any]:
        """Create a document record
        
        Args:
            user_email: User's email
            name: Document name
            content_type: MIME type
            file_size: File size in bytes
            storage_path: Path in storage
            file_hash: Hash for deduplication
            metadata: Additional metadata
            conversation_id: Optional conversation ID to link document to specific chat
        """
        user_id = self._get_user_id(user_email)
        
        data = {
            "user_id": user_id,
            "filename": name,  # DB column is 'filename', not 'name'
            "name": name,
            "content_type": content_type,
            "file_size": file_size,
            "storage_path": storage_path,
            "file_hash": file_hash,
            "status": "pending",
            "metadata": metadata or {}
        }
        
        # Add conversation_id if provided
        if conversation_id:
            data["conversation_id"] = conversation_id
        
        result = self.client.table("documents").insert(data).execute()
        logger.info(f"Created document: {result.data[0]['id']} for user {user_email}, conversation={conversation_id}")
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
        limit: int = 50,
        conversation_id: Optional[str] = None  # NEW: Filter by conversation
    ) -> List[Dict[str, Any]]:
        """List documents for a user, optionally filtered by conversation
        
        Args:
            user_email: User's email
            status: Filter by status (e.g. 'ready', 'processing')
            limit: Max documents to return
            conversation_id: If provided, only return documents for this conversation
        """
        user_id = self._get_user_id(user_email)
        
        query = self.client.table("documents")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("created_at", desc=True)\
            .limit(limit)
        
        if status:
            query = query.eq("status", status)
        
        # Filter by conversation_id if provided
        # Include documents that belong to this conversation OR are global (NULL)
        if conversation_id:
            # Use OR filter: conversation_id = provided OR conversation_id IS NULL (global docs)
            query = query.or_(f"conversation_id.eq.{conversation_id},conversation_id.is.null")
        
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
        
        # Ensure chunk_overlap is smaller than chunk_size
        chunk_overlap = min(chunk_overlap, chunk_size // 2)
        
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
            
            chunk_content = text[start:end].strip()
            if chunk_content:
                chunks.append({
                    "chunk_index": chunk_index,
                    "content": chunk_content,
                    "start_char": start,
                    "end_char": end,
                    "metadata": {}
                })
                chunk_index += 1
            
            # Move start forward: advance by (chunk_size - overlap) but at least 1
            # This ensures we make progress and don't create overlapping micro-chunks
            step = max(chunk_size - chunk_overlap, 1)
            new_start = start + step
            
            # If we didn't advance past 'end', force progress to avoid infinite loop
            if new_start <= start:
                new_start = end
            
            start = new_start
        
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
        metadata: Optional[Dict] = None,
        conversation_id: Optional[str] = None  # NEW: Link to specific conversation
    ) -> Dict[str, Any]:
        """
        Full document processing pipeline:
        1. Upload to Supabase Storage
        2. Create document record
        3. Extract text
        4. Chunk and embed
        5. Store vectors
        
        Args:
            user_email: User's email
            file_content: File bytes
            filename: Original filename
            content_type: MIME type
            metadata: Optional metadata
            conversation_id: Optional conversation ID to link document to specific chat
        """
        user_id = self._get_user_id(user_email)
        
        # Calculate file hash for deduplication
        file_hash = hashlib.sha256(file_content).hexdigest()
        
        # Check for duplicate - only within same conversation if conversation_id provided
        query = self.client.table("documents")\
            .select("id")\
            .eq("user_id", user_id)\
            .eq("file_hash", file_hash)
        
        if conversation_id:
            query = query.eq("conversation_id", conversation_id)
        
        existing = query.execute()
        
        if existing.data:
            logger.info(f"Document already exists: {existing.data[0]['id']} (conversation={conversation_id})")
            return self.get_document(existing.data[0]["id"], user_email)
        
        # Generate storage path with sanitized filename
        safe_filename = sanitize_filename(filename)
        storage_path = f"{user_id}/{uuid4()}/{safe_filename}"
        
        logger.info(f"Uploading document: {filename} -> {safe_filename} (conversation={conversation_id})")
        
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
        
        # Create document record with conversation_id
        doc = self.create_document(
            user_email=user_email,
            name=filename,
            content_type=content_type,
            file_size=len(file_content),
            storage_path=storage_path,
            file_hash=file_hash,
            metadata=metadata,
            conversation_id=conversation_id  # Pass conversation_id
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
            
            # Build meta layer for quick answers about document structure
            try:
                # Get user_email from document record
                doc = self.client.table("documents")\
                    .select("user_id")\
                    .eq("id", document_id)\
                    .single()\
                    .execute()
                if doc.data:
                    user_email = doc.data.get("user_id", "dev@example.com")
                    self.build_document_meta(document_id, user_email)
                    logger.info(f"Document {document_id}: meta layer built")
            except Exception as meta_err:
                logger.warning(f"Document {document_id}: failed to build meta layer: {meta_err}")
            
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
        
        # Call the search_document_chunks_v2 function
        result = self.client.rpc(
            "search_document_chunks_v2",
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
    
    def multi_query_search(
        self,
        query: str,
        user_email: str,
        num_queries: int = 3,
        results_per_query: int = 4,
        use_hybrid: bool = True,
        document_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Multi-query retrieval: Generate multiple search queries from the original query,
        search with each, and combine results for better coverage.
        
        This helps find relevant content that might be missed by a single query.
        
        Args:
            query: Original user query
            user_email: User email for filtering
            num_queries: Number of alternative queries to generate
            results_per_query: Number of results per query
            use_hybrid: Use hybrid search instead of pure vector search
            document_ids: Optional list of document IDs to filter
        
        Returns:
            Combined and deduplicated results from all queries
        """
        # Generate alternative queries using AI
        alternative_queries = self._generate_alternative_queries(query, num_queries)
        
        # Add original query to the list
        all_queries = [query] + alternative_queries
        logger.info(f"[RAG] Multi-query search with {len(all_queries)} queries: {all_queries}")
        
        # Search with each query
        all_results = []
        seen_chunks = set()
        
        for q in all_queries:
            if use_hybrid:
                results = self.hybrid_search(
                    query=q,
                    user_email=user_email,
                    limit=results_per_query
                )
            else:
                results = self.search_chunks(
                    query=q,
                    user_email=user_email,
                    document_ids=document_ids,
                    limit=results_per_query
                )
            
            # Deduplicate by chunk ID
            for r in results:
                chunk_id = f"{r.get('document_id', '')}_{r.get('chunk_index', '')}"
                if chunk_id not in seen_chunks:
                    seen_chunks.add(chunk_id)
                    all_results.append(r)
        
        logger.info(f"[RAG] Multi-query found {len(all_results)} unique results")
        return all_results
    
    def _generate_alternative_queries(self, query: str, num_queries: int = 3) -> List[str]:
        """
        Generate alternative search queries from the original query using AI.
        
        Args:
            query: Original query
            num_queries: Number of alternative queries to generate
        
        Returns:
            List of alternative queries
        """
        try:
            prompt = f"""Generate {num_queries} alternative search queries for the following question.
The alternative queries should:
1. Use different words/synonyms
2. Focus on different aspects of the question
3. Be in the same language as the original
4. Be specific and searchable

Original question: "{query}"

Return ONLY a JSON array of strings, like: ["query1", "query2", "query3"]
No explanation, just the array."""

            response = self.embedding_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=200
            )
            
            import json
            result_text = response.choices[0].message.content.strip()
            
            # Extract JSON array
            if '[' in result_text:
                result_text = result_text[result_text.index('['):result_text.rindex(']')+1]
            
            queries = json.loads(result_text)
            logger.info(f"[RAG] Generated alternative queries: {queries}")
            return queries[:num_queries]
            
        except Exception as e:
            logger.warning(f"[RAG] Failed to generate alternative queries: {e}")
            # Fallback: simple keyword extraction
            keywords = self._extract_keywords(query)
            if keywords:
                return [" ".join(keywords)]
            return []

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
            "hybrid_search_chunks_v2",
            {
                "query_text": query,
                "query_embedding": query_embedding,
                "match_count": limit,
                "filter_user_id": user_id,
                "vector_weight": semantic_weight,
                "keyword_weight": keyword_weight
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
    
    # ==================== RERANKING ====================
    
    def rerank_results(
        self,
        query: str,
        results: List[Dict[str, Any]],
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Rerank search results using LLM for better relevance.
        This provides more accurate results than pure vector similarity.
        """
        if not results or len(results) <= top_k:
            return results
        
        try:
            # Build prompt for reranking
            docs_text = "\n\n".join([
                f"[DOC_{i}] {r['content'][:500]}"
                for i, r in enumerate(results)
            ])
            
            rerank_prompt = f"""You are a relevance scoring assistant. Given a query and documents, 
score each document's relevance from 0-10 where 10 is perfectly relevant.

Query: {query}

Documents:
{docs_text}

Return ONLY a JSON array of scores in order, like: [8, 3, 9, 5, ...]
No explanation, just the array."""

            response = self.embedding_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": rerank_prompt}],
                temperature=0,
                max_tokens=100
            )
            
            import json
            scores_text = response.choices[0].message.content.strip()
            # Extract JSON array from response
            if '[' in scores_text:
                scores_text = scores_text[scores_text.index('['):scores_text.rindex(']')+1]
            scores = json.loads(scores_text)
            
            # Add rerank scores and sort
            for i, r in enumerate(results):
                if i < len(scores):
                    r['rerank_score'] = scores[i]
                else:
                    r['rerank_score'] = 0
            
            # Sort by rerank score
            results.sort(key=lambda x: x.get('rerank_score', 0), reverse=True)
            
            # Filter out low-quality results (score < 5 out of 10)
            quality_results = [r for r in results if r.get('rerank_score', 0) >= 5]
            if quality_results:
                return quality_results[:top_k]
            
            # If no high-quality results, return best available
            return results[:top_k]
            
        except Exception as e:
            logger.warning(f"Reranking failed, using original order: {e}")
            return results[:top_k]
    
    def search_with_rerank(
        self,
        query: str,
        user_email: str,
        document_ids: Optional[List[str]] = None,
        top_k: int = 5,
        use_hybrid: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Advanced search with reranking for best results.
        1. Get top 20 candidates via hybrid search
        2. Rerank using LLM
        3. Return top_k best matches
        """
        # Get more candidates for reranking
        if use_hybrid:
            candidates = self.hybrid_search(
                query=query,
                user_email=user_email,
                limit=20
            )
        else:
            candidates = self.search(
                query=query,
                user_email=user_email,
                document_ids=document_ids,
                limit=20
            )
        
        if not candidates:
            return []
        
        # Rerank and return top results
        return self.rerank_results(query, candidates, top_k)
    
    # ==================== ADVANCED RAG TECHNIQUES ====================
    
    def hyde_search(
        self,
        query: str,
        user_email: str,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """
        HyDE (Hypothetical Document Embeddings) - generate a hypothetical answer
        first, then search for documents similar to that answer.
        
        This helps when the query doesn't match document language
        (e.g., "what is chapter 14 about" -> generates content-like text to search)
        """
        try:
            # Step 1: Generate hypothetical document/answer
            # Load prompt from config
            hyde_prompt_template = get_search_strategy_prompt('hyde')
            if not hyde_prompt_template:
                hyde_prompt_template = """Given this question, write a detailed passage that would answer it.
Write as if you are quoting directly from a document that contains this information.
Be specific and detailed. Write 2-3 paragraphs.

Question: {query}

Hypothetical document passage:"""
            
            hyde_prompt = hyde_prompt_template.replace('{query}', query)

            response = self.embedding_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": hyde_prompt}],
                temperature=0.7,
                max_tokens=500
            )
            
            hypothetical_doc = response.choices[0].message.content.strip()
            logger.info(f"[RAG] HyDE generated hypothetical doc: {hypothetical_doc[:100]}...")
            
            # Step 2: Search using the hypothetical document embedding
            hyde_embedding = self.create_embedding(hypothetical_doc)
            
            user_id = self._get_user_id(user_email)
            result = self.client.rpc(
                "search_document_chunks_v2",
                {
                    "query_embedding": hyde_embedding,
                    "match_count": limit,
                    "filter_user_id": user_id,
                    "filter_document_id": None,
                    "similarity_threshold": 0.3  # Lower threshold for HyDE
                }
            ).execute()
            
            results = result.data or []
            
            # Enrich with document names
            if results:
                doc_ids = list(set(r["document_id"] for r in results))
                docs = self.client.table("documents")\
                    .select("id, name")\
                    .in_("id", doc_ids)\
                    .execute()
                doc_names = {d["id"]: d["name"] for d in (docs.data or [])}
                for r in results:
                    r["document_name"] = doc_names.get(r["document_id"], "Unknown")
                    r["hyde_generated"] = True
            
            return results
            
        except Exception as e:
            logger.warning(f"HyDE search failed, falling back to standard: {e}")
            return self.hybrid_search(query, user_email, limit)
    
    def contextual_chunk_text(
        self,
        text: str,
        document_name: str,
        chunk_size: int = CHUNK_SIZE,
        chunk_overlap: int = CHUNK_OVERLAP
    ) -> List[Dict[str, Any]]:
        """
        Enhanced chunking that detects and preserves document structure.
        Adds metadata about chapters, sections, page numbers.
        """
        chunks = []
        
        # Detect chapter/section patterns
        chapter_patterns = [
            r'(?:^|\n)(?:Глава|Chapter|ГЛАВА|CHAPTER)\s*(\d+)[:\.\s]*(.*?)(?=\n)',
            r'(?:^|\n)(\d+)\.\s+([A-ZА-Я][^\.]+)',  # "1. Title"
            r'(?:^|\n)(?:Раздел|Section|РАЗДЕЛ)\s*(\d+)[:\.\s]*(.*?)(?=\n)',
        ]
        
        # Find all chapter/section markers
        structure_markers = []
        for pattern in chapter_patterns:
            for match in re.finditer(pattern, text, re.MULTILINE | re.IGNORECASE):
                structure_markers.append({
                    "position": match.start(),
                    "chapter": match.group(1),
                    "title": match.group(2).strip() if match.group(2) else "",
                    "full_match": match.group(0).strip()
                })
        
        # Sort markers by position
        structure_markers.sort(key=lambda x: x["position"])
        logger.info(f"[RAG] Found {len(structure_markers)} structure markers in document")
        
        # Function to find current chapter for a position
        def get_chapter_info(pos: int) -> Dict:
            current_chapter = None
            for marker in structure_markers:
                if marker["position"] <= pos:
                    current_chapter = marker
                else:
                    break
            return current_chapter
        
        # Standard chunking with metadata enrichment
        start = 0
        chunk_index = 0
        text_len = len(text)
        
        while start < text_len:
            end = min(start + chunk_size, text_len)
            
            # Try to break at sentence/paragraph boundary
            if end < text_len:
                search_start = max(start, end - int(chunk_size * 0.2))
                best_break = end
                
                for sep in ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' ']:
                    pos = text.rfind(sep, search_start, end)
                    if pos != -1:
                        best_break = pos + len(sep)
                        break
                end = best_break
            
            chunk_text = text[start:end].strip()
            if chunk_text:
                # Get structural metadata
                chapter_info = get_chapter_info(start)
                
                metadata = {
                    "document_name": document_name,
                    "position_percent": round(start / text_len * 100, 1),
                }
                
                if chapter_info:
                    metadata["chapter_number"] = chapter_info["chapter"]
                    metadata["chapter_title"] = chapter_info["title"]
                    metadata["section_header"] = chapter_info["full_match"]
                
                # Create contextual prefix for better retrieval
                context_prefix = f"[{document_name}"
                if chapter_info:
                    context_prefix += f" | Глава {chapter_info['chapter']}"
                    if chapter_info["title"]:
                        context_prefix += f": {chapter_info['title']}"
                context_prefix += "]"
                
                chunks.append({
                    "chunk_index": chunk_index,
                    "content": chunk_text,
                    "content_with_context": f"{context_prefix}\n{chunk_text}",
                    "start_char": start,
                    "end_char": end,
                    "metadata": metadata
                })
                chunk_index += 1
            
            start = max(start + 1, end - chunk_overlap)
        
        return chunks
    
    def step_back_prompting(self, query: str) -> str:
        """
        Step-back prompting: generate a more general question first,
        then use both for retrieval. Helps with specific questions.
        """
        try:
            # Load prompt from config
            prompt_template = get_search_strategy_prompt('step_back')
            if not prompt_template:
                prompt_template = """Given a specific question, generate a more general "step-back" question 
that would help understand the broader context needed to answer the original question.

Specific question: {query}

Step-back question (more general):"""
            
            prompt = prompt_template.replace('{query}', query)

            response = self.embedding_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=100
            )
            
            step_back_query = response.choices[0].message.content.strip()
            logger.info(f"[RAG] Step-back query: {step_back_query}")
            return step_back_query
            
        except Exception as e:
            logger.warning(f"Step-back prompting failed: {e}")
            return query
    
    def agentic_retrieval(
        self,
        query: str,
        user_email: str,
        max_iterations: int = 3
    ) -> Dict[str, Any]:
        """
        Agentic RAG: LLM decides what to search for iteratively.
        Similar to how n8n's Vector Store Tool works with an AI Agent.
        
        The agent can:
        1. Reformulate the query
        2. Search for specific information
        3. Ask follow-up questions to fill gaps
        4. Decide when it has enough information
        """
        all_results = []
        search_history = []
        
        agent_prompt = f"""You are a research agent helping to find information in documents.
Your task is to find information to answer: "{query}"

You have access to a document search tool. For each iteration:
1. Analyze what information you still need
2. Generate a specific search query
3. Review results and decide if you need more searches

Current search history:
{{history}}

Based on what you've found, what should be the next search query?
If you have enough information, respond with "DONE".

Next search query (or DONE):"""

        for iteration in range(max_iterations):
            # Build history string
            history_str = "\n".join([
                f"- Query: {h['query']} -> Found {h['results_count']} results"
                for h in search_history
            ]) or "No searches yet"
            
            # Ask agent what to search
            try:
                response = self.embedding_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{
                        "role": "user", 
                        "content": agent_prompt.format(history=history_str)
                    }],
                    temperature=0.3,
                    max_tokens=100
                )
                
                next_query = response.choices[0].message.content.strip()
                
                if "DONE" in next_query.upper():
                    logger.info(f"[RAG] Agent finished after {iteration} iterations")
                    break
                
                # Perform search
                results = self.hybrid_search(
                    query=next_query,
                    user_email=user_email,
                    limit=5
                )
                
                search_history.append({
                    "query": next_query,
                    "results_count": len(results)
                })
                
                # Deduplicate and add results
                for r in results:
                    chunk_id = f"{r['document_id']}_{r['chunk_index']}"
                    if not any(f"{x['document_id']}_{x['chunk_index']}" == chunk_id for x in all_results):
                        all_results.append(r)
                
                logger.info(f"[RAG] Agent iteration {iteration+1}: query='{next_query}', found={len(results)}")
                
            except Exception as e:
                logger.warning(f"Agent iteration failed: {e}")
                break
        
        # If agent found nothing, fall back to original query
        if not all_results:
            all_results = self.hybrid_search(query, user_email, limit=10)
        
        return {
            "results": all_results[:10],
            "search_history": search_history,
            "iterations": len(search_history)
        }
    
    def ultimate_rag_search(
        self,
        query: str,
        user_email: str,
        max_tokens: int = 4000,
        strategy: str = "auto",
        document_id: Optional[str] = None,
        debug_collector: Optional[RAGDebugCollector] = None
    ) -> Dict[str, Any]:
        """
        Ultimate RAG search that combines all techniques intelligently.
        NOW WITH SMART INTENT ANALYSIS: automatically detects when user asks
        for specific chapters and loads full chapter content.
        
        Strategy options:
        - "auto": Automatically select best approach based on query
        - "hyde": Use HyDE for content-seeking queries
        - "multi_query": Use multi-query for broad searches
        - "agentic": Use agentic retrieval for complex questions
        - "step_back": Use step-back prompting for specific questions
        
        Args:
            debug_collector: Optional RAGDebugCollector for collecting debug info
        """
        # Initialize debug collector if provided
        collector = debug_collector or get_current_collector()
        collector.start_rag_pipeline()
        
        debug_info = {
            "original_query": query,
            "strategy": strategy,
            "techniques_used": [],
            "total_candidates": 0,
            "search_history": []
        }
        
        # ====== NEW: SMART INTENT DETECTION ======
        # Detect if user wants specific chapter(s) and load them fully
        if strategy == "auto":
            try:
                logger.info(f"[ULTIMATE-RAG] Starting intent analysis for query: '{query[:100]}...'")
                
                # Get document info for intent analysis
                if not document_id:
                    docs = self.list_documents(user_email, status="ready", limit=1)
                    if docs:
                        document_id = docs[0]["id"]
                        logger.info(f"[ULTIMATE-RAG] Auto-selected document: {document_id}")
                
                if document_id:
                    # Get document structure
                    chapters = self.get_document_chapters(user_email, document_id)
                    all_chunks = self.get_all_document_chunks(user_email, [document_id])
                    
                    # Get document name
                    doc_info = self.get_document(document_id, user_email)
                    doc_name = doc_info.get("name", "") if doc_info else ""
                    
                    logger.info(f"[ULTIMATE-RAG] Document has {len(chapters)} chapters, {len(all_chunks)} total chunks")
                    
                    # Log document structure to collector
                    collector.log_document_structure(
                        document_id=document_id,
                        document_name=doc_name,
                        total_chunks=len(all_chunks),
                        chapters=[{
                            "number": ch["chapter_number"],
                            "title": ch.get("title", ""),
                            "start_chunk": ch.get("start_chunk", 0),
                            "end_chunk": ch.get("end_chunk", 0)
                        } for ch in chapters],
                        structure_type="book"
                    )
                    
                    document_structure = {
                        "type": "book",
                        "chapters": [ch["chapter_number"] for ch in chapters],
                        "chapter_details": chapters,
                        "total_chunks": len(all_chunks)
                    }
                    
                    # Analyze intent using AI
                    intent = self.analyze_query_intent(query, document_structure)
                    scope = intent.get("scope", "search")
                    sections = intent.get("sections", [])
                    task = intent.get("task", "search")
                    
                    logger.info(f"[ULTIMATE-RAG] Intent analysis result: scope={scope}, sections={sections}, task={task}")
                    
                    # Log intent analysis to collector
                    collector.log_intent_analysis(
                        original_query=query,
                        scope=scope,
                        sections=sections,
                        task=task,
                        reasoning=intent.get("reasoning", "")
                    )
                    
                    debug_info["intent_analysis"] = intent
                    
                    # If user wants specific chapter(s), load full chapter content
                    if scope == "single_section" and sections:
                        debug_info["techniques_used"].append("chapter_load")
                        logger.info(f"[ULTIMATE-RAG] Loading full chapter {sections[0]} based on intent analysis")
                        
                        context, sources = self.get_chapter_content(user_email, document_id, sections[0])
                        logger.info(f"[ULTIMATE-RAG] Chapter content loaded: {len(context)} chars, {len(sources)} sources")
                        
                        # If chapter not found, fallback to semantic search
                        if not context or len(context) < 100:
                            logger.warning(f"[ULTIMATE-RAG] Chapter {sections[0]} content is empty, falling back to semantic search")
                            # Don't return early - let it fall through to standard retrieval
                        else:
                            # Add chapter header
                            chapter_info = next((ch for ch in chapters if str(ch["chapter_number"]) == sections[0]), None)
                            if chapter_info:
                                header = f"📖 ГЛАВА {sections[0]}: {chapter_info.get('title', '')}\n\n"
                                context = header + context
                            else:
                                header = f"📖 ГЛАВА {sections[0]}\n\n"
                                context = header + context
                            
                            # Add task instruction
                            task_instruction = self._get_task_instructions(task, intent)
                            if task_instruction:
                                context = task_instruction + "\n\n" + context
                            
                            debug_info["scope"] = "single_section"
                            debug_info["loaded_chapter"] = sections[0]
                            debug_info["total_chars"] = len(context)
                            debug_info["estimated_tokens"] = len(context) // 4
                            
                            logger.info(f"[ULTIMATE-RAG] Returning chapter context: {len(context)} chars, {len(sources)} sources")
                            
                            return {
                                "context": context,
                                "sources": sources,
                                "debug": debug_info
                            }
                    
                    elif scope == "multiple_sections" and sections:
                        debug_info["techniques_used"].append("multi_chapter_load")
                        logger.info(f"[ULTIMATE-RAG] Loading multiple chapters {sections} based on intent analysis")
                        
                        context_parts = []
                        all_sources = []
                        
                        for section_num in sections:
                            section_content, section_sources = self.get_chapter_content(
                                user_email, document_id, section_num
                            )
                            if section_content:
                                chapter_info = next((ch for ch in chapters if str(ch["chapter_number"]) == section_num), None)
                                header = f"\n{'='*60}\n📖 ГЛАВА {section_num}"
                                if chapter_info:
                                    header += f": {chapter_info.get('title', '')}"
                                header += f"\n{'='*60}\n\n"
                                
                                context_parts.append(header + section_content)
                                all_sources.extend(section_sources)
                        
                        context = "\n".join(context_parts)
                        
                        # Add task instruction
                        task_instruction = self._get_task_instructions(task, intent)
                        if task_instruction:
                            context = task_instruction + "\n\n" + context
                        
                        debug_info["scope"] = "multiple_sections"
                        debug_info["loaded_chapters"] = sections
                        debug_info["total_chars"] = len(context)
                        debug_info["estimated_tokens"] = len(context) // 4
                        
                        return {
                            "context": context,
                            "sources": all_sources,
                            "debug": debug_info
                        }
                    
                    elif scope == "full_document":
                        debug_info["techniques_used"].append("full_document_load")
                        logger.info(f"[ULTIMATE-RAG] Loading full document based on intent analysis")
                        
                        # For full document, use much larger limit (ignore passed max_tokens)
                        # DeepSeek/Gemini can handle 100K+ tokens
                        full_doc_max_tokens = 100000  # ~400K chars
                        
                        context, sources, full_doc_info = self.build_full_document_context(
                            user_email=user_email,
                            document_ids=[document_id],
                            max_tokens=full_doc_max_tokens
                        )
                        
                        # Add task instruction
                        task_instruction = self._get_task_instructions(task, intent)
                        if task_instruction:
                            context = task_instruction + "\n\n" + context
                        
                        debug_info["scope"] = "full_document"
                        debug_info["total_chars"] = len(context)
                        debug_info["estimated_tokens"] = len(context) // 4
                        # Include full document info
                        debug_info["full_document_info"] = full_doc_info
                        debug_info["total_chunks_loaded"] = full_doc_info.get("total_chunks", 0)
                        logger.info(f"[ULTIMATE-RAG] Full doc loaded: {full_doc_info}")
                        
                        return {
                            "context": context,
                            "sources": sources,
                            "debug": debug_info
                        }
                    
                    # For search scope, continue with regular retrieval strategies below
                    
            except Exception as e:
                logger.warning(f"[ULTIMATE-RAG] Intent analysis failed: {e}, falling back to standard retrieval")
        
        # ====== STANDARD RETRIEVAL STRATEGIES ======
        # Auto-detect best strategy
        if strategy == "auto":
            # Analyze query type for retrieval strategy
            is_specific = any(kw in query.lower() for kw in [
                "страница", "page", "цитат", "quote",
                "абзац", "параграф"
            ])
            is_broad = any(kw in query.lower() for kw in [
                "о чем", "what is", "summarize", "резюме", "обзор",
                "explain", "объясни"
            ])
            
            if is_specific:
                strategy = "hyde"  # HyDE works better for specific structure queries
            elif is_broad:
                strategy = "multi_query"  # Multi-query for broad understanding
            else:
                strategy = "multi_query"  # Default to multi-query
            
            debug_info["auto_detected_strategy"] = strategy
        
        candidates = []
        
        # Execute selected strategy
        if strategy == "hyde":
            debug_info["techniques_used"].append("HyDE")
            
            # Also do step-back for context
            step_back_query = self.step_back_prompting(query)
            debug_info["step_back_query"] = step_back_query
            debug_info["techniques_used"].append("step_back")
            
            # HyDE search
            hyde_results = self.hyde_search(query, user_email, limit=10)
            candidates.extend(hyde_results)
            
            # Also search with step-back query
            step_back_results = self.hybrid_search(step_back_query, user_email, limit=5)
            for r in step_back_results:
                chunk_id = f"{r['document_id']}_{r['chunk_index']}"
                if not any(f"{c['document_id']}_{c['chunk_index']}" == chunk_id for c in candidates):
                    candidates.append(r)
        
        elif strategy == "agentic":
            debug_info["techniques_used"].append("agentic")
            agent_result = self.agentic_retrieval(query, user_email)
            candidates = agent_result["results"]
            debug_info["search_history"] = agent_result["search_history"]
            debug_info["agent_iterations"] = agent_result["iterations"]
        
        else:  # multi_query or default
            debug_info["techniques_used"].append("multi_query")
            debug_info["techniques_used"].append("hybrid")
            candidates = self.multi_query_search(
                query=query,
                user_email=user_email,
                num_queries=3,  # Reduced from 4 for more focused search
                results_per_query=4,  # Reduced from 7 to avoid context overload
                use_hybrid=True
            )
        
        debug_info["total_candidates"] = len(candidates)
        
        if not candidates:
            return {
                "context": "",
                "sources": [],
                "debug": debug_info
            }
        
        # Always rerank for best precision
        debug_info["techniques_used"].append("rerank")
        candidates = self.rerank_results(query, candidates, top_k=5)  # Reduced from 10 to keep only best matches
        debug_info["after_rerank"] = len(candidates)
        
        # Build context with citations
        context_parts = []
        sources = []
        total_chars = 0
        max_chars = max_tokens * 4
        
        for i, result in enumerate(candidates):
            chunk_chars = len(result["content"])
            
            if total_chars + chunk_chars > max_chars:
                break
            
            citation = self.format_citation(result)
            context_parts.append(f"[{i+1}] {citation}\n{result['content']}")
            
            source_info = {
                "index": i + 1,
                "document_id": result["document_id"],
                "document_name": result.get("document_name"),
                "chunk_index": result.get("chunk_index"),
                "similarity": round(result.get("similarity", 0), 3),
                "rerank_score": result.get("rerank_score"),
                "matching_queries": result.get("matching_queries", []),
                "citation": citation,
                "content_preview": result["content"][:200] + "..." if len(result["content"]) > 200 else result["content"],
                "metadata": result.get("metadata", {})
            }
            sources.append(source_info)
            total_chars += chunk_chars
        
        # Log chunks to collector
        collector.log_chunks(candidates[:len(sources)])  # Only log chunks that were used
        
        # Build final context with header from config
        header = get_context_header() + "\n"
        context = header + "\n\n".join(context_parts)
        
        # Log context building to collector
        raw_chars = sum(len(c.get("content", "")) for c in candidates[:len(sources)])
        collector.log_context_building(
            raw_chars=raw_chars,
            final_chars=len(context),
            compression_applied=False,
            final_context=context
        )
        
        # Log retrieval strategy to collector
        collector.log_retrieval_strategy(
            strategy=strategy if strategy != "auto" else debug_info.get("auto_detected_strategy", "multi_query"),
            techniques=debug_info.get("techniques_used", []),
            generated_queries=debug_info.get("generated_queries", []),
            step_back_query=debug_info.get("step_back_query", ""),
            agent_iterations=debug_info.get("search_history", [])
        )
        
        return {
            "context": context,
            "sources": sources,
            "debug": debug_info
        }

    # ==================== CITATION FORMATTING ====================
    
    def format_citation(self, result: Dict[str, Any]) -> str:
        """Format a result as a proper citation with source info."""
        doc_name = result.get('document_name', 'Unknown')
        page = result.get('page_number')
        section = result.get('section_title')
        chunk_idx = result.get('chunk_index', 0)
        
        # Build citation string
        citation_parts = [f"📄 {doc_name}"]
        if section:
            citation_parts.append(f"§ {section}")
        if page:
            citation_parts.append(f"стр. {page}")
        else:
            citation_parts.append(f"фрагмент {chunk_idx + 1}")
        
        return " | ".join(citation_parts)
    
    def build_cited_context(
        self,
        query: str,
        user_email: str,
        max_tokens: int = 4000,
        use_rerank: bool = True,
        include_citations: bool = True
    ) -> Tuple[str, List[Dict]]:
        """
        Build context with proper citations for RAG.
        Returns formatted context string and source list.
        """
        # Get results with reranking for best quality
        if use_rerank:
            results = self.search_with_rerank(
                query=query,
                user_email=user_email,
                top_k=8
            )
        else:
            results = self.hybrid_search(
                query=query,
                user_email=user_email,
                limit=8
            )
        
        if not results:
            return "", []
        
        context_parts = []
        sources = []
        total_chars = 0
        max_chars = max_tokens * 4
        
        for i, result in enumerate(results):
            chunk_chars = len(result["content"])
            
            if total_chars + chunk_chars > max_chars:
                break
            
            # Format with citation
            citation = self.format_citation(result)
            
            if include_citations:
                context_parts.append(f"[{i+1}] {citation}\n{result['content']}")
            else:
                context_parts.append(result['content'])
            
            sources.append({
                "index": i + 1,
                "document_id": result["document_id"],
                "document_name": result.get("document_name"),
                "section": result.get("section_title"),
                "page": result.get("page_number"),
                "chunk_index": result.get("chunk_index"),
                "similarity": result.get("similarity") or result.get("combined_score") or result.get("rerank_score", 0),
                "citation": citation
            })
            total_chars += chunk_chars
        
        # Build final context with header from config
        header = get_context_header() + "\n"
        context = header + "\n\n".join(context_parts)
        
        return context, sources

    def get_all_document_chunks(
        self,
        user_email: str,
        document_ids: Optional[List[str]] = None,
        order_by: str = "chunk_index"
    ) -> List[Dict[str, Any]]:
        """
        Get ALL chunks for specified documents in order.
        Used for 'full' mode to load entire document into context.
        
        Args:
            user_email: User email
            document_ids: List of document IDs (if None, gets all user's documents)
            order_by: Order chunks by 'chunk_index' or 'created_at'
        
        Returns:
            List of all chunks in order
        """
        user_id = self._get_user_id(user_email)
        
        # If no specific documents, get all ready documents
        if not document_ids:
            docs = self.list_documents(user_email, status="ready")
            document_ids = [d["id"] for d in docs]
        
        if not document_ids:
            return []
        
        all_chunks = []
        
        for doc_id in document_ids:
            # Get all chunks for this document
            result = self.client.table("document_chunks")\
                .select("*, documents!inner(name, user_id)")\
                .eq("document_id", doc_id)\
                .eq("documents.user_id", user_id)\
                .order("chunk_index", desc=False)\
                .execute()
            
            chunks = result.data or []
            
            # Add document name to each chunk
            for chunk in chunks:
                if chunk.get("documents"):
                    chunk["document_name"] = chunk["documents"].get("name", "Unknown")
                    del chunk["documents"]  # Clean up nested data
            
            all_chunks.extend(chunks)
        return all_chunks

    def get_document_chapters(
        self,
        user_email: str,
        document_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get list of detected chapters/sections in a document.
        
        Returns:
            List of chapters with their chunk ranges
        """
        user_id = self._get_user_id(user_email)
        
        # Get all chunks with metadata
        result = self.client.table("document_chunks")\
            .select("chunk_index, metadata, content")\
            .eq("document_id", document_id)\
            .order("chunk_index", desc=False)\
            .execute()
        
        chunks = result.data or []
        
        if not chunks:
            return []
        
        chapters = []
        current_chapter = None
        seen_chapters = set()  # Track which chapters we've already seen to avoid duplicates
        
        # Detect chapter/section/article headers in chunks
        # Supports: books (chapters), laws (articles, статьи), regulations (sections, пункты)
        chapter_patterns = [
            # Books: Глава 1, Chapter 1
            r'(?:^|\n)(?:Глава|Chapter|ГЛАВА|CHAPTER)\s*(\d+)[:\.\s]*(.*?)(?=\n|$)',
            # Laws: Статья 1, Article 1
            r'(?:^|\n)(?:Статья|Article|СТАТЬЯ|ARTICLE)\s*(\d+)[:\.\s]*(.*?)(?=\n|$)',
            # Sections: Раздел 1, Section 1
            r'(?:^|\n)(?:Раздел|Section|РАЗДЕЛ|SECTION)\s*(\d+)[:\.\s]*(.*?)(?=\n|$)',
            # Пункт 1, Параграф 1
            r'(?:^|\n)(?:Пункт|Параграф|§)\s*(\d+)[:\.\s]*(.*?)(?=\n|$)',
            # Part: Часть 1
            r'(?:^|\n)(?:Часть|Part|ЧАСТЬ|PART)\s*(\d+)[:\.\s]*(.*?)(?=\n|$)',
            # Numbered sections: 1. Title
            r'(?:^|\n)(\d+)\.\s+([A-ZА-ЯЁ][^\n]+)',
            # Numbered with dot-notation: 1.1, 1.2.3
            r'(?:^|\n)(\d+(?:\.\d+)+)\s+([A-ZА-ЯЁ][^\n]*)',
        ]
        
        for chunk in chunks:
            content = chunk.get("content", "")
            content = chunk.get("content", "")
            metadata = chunk.get("metadata", {}) or {}
            chunk_idx = chunk.get("chunk_index", 0)
            
            # Check if this chunk contains a new chapter
            # Search in entire chunk content (not just first 500 chars) to catch all chapter headers
            for pattern in chapter_patterns:
                match = re.search(pattern, content, re.IGNORECASE)
                if match:
                    chapter_num = match.group(1)
                    
                    # Skip if we've already seen this chapter (avoid duplicates from mentions)
                    if chapter_num in seen_chapters:
                        continue
                    
                    # Save previous chapter
                    if current_chapter:
                        current_chapter["end_chunk"] = chunk_idx - 1
                        chapters.append(current_chapter)
                    
                    # Start new chapter
                    chapter_title = match.group(2).strip() if match.group(2) else ""
                    seen_chapters.add(chapter_num)
                    
                    current_chapter = {
                        "chapter_number": chapter_num,
                        "title": chapter_title,
                        "start_chunk": chunk_idx,
                        "end_chunk": None,
                        "preview": content[:200]
                    }
                    break
            
            # Also check metadata for chapter info
            if metadata.get("chapter") and not current_chapter:
                ch_num = str(metadata.get("chapter"))
                if ch_num not in seen_chapters:
                    seen_chapters.add(ch_num)
                    current_chapter = {
                        "chapter_number": ch_num,
                        "title": metadata.get("section_title", ""),
                        "start_chunk": chunk_idx,
                        "end_chunk": None,
                        "preview": content[:200]
                    }
        
        # Save last chapter
        if current_chapter:
            current_chapter["end_chunk"] = len(chunks) - 1
            chapters.append(current_chapter)
        
        # If no chapters detected, treat entire document as one chapter
        if not chapters:
            chapters.append({
                "chapter_number": "1",
                "title": "Весь документ",
                "start_chunk": 0,
                "end_chunk": len(chunks) - 1,
                "preview": chunks[0].get("content", "")[:200] if chunks else ""
            })
        
        return chapters

    def get_chapter_content(
        self,
        user_email: str,
        document_id: str,
        chapter_number: str
    ) -> Tuple[str, List[Dict]]:
        """
        Get full content of a specific chapter.
        
        Args:
            user_email: User email
            document_id: Document ID
            chapter_number: Chapter number to retrieve
        
        Returns:
            Tuple of (chapter_content, sources)
        """
        logger.info(f"[RAG] get_chapter_content called: doc={document_id}, chapter={chapter_number}")
        chapters = self.get_document_chapters(user_email, document_id)
        logger.info(f"[RAG] Found {len(chapters)} chapters in document")
        
        # Find requested chapter
        target_chapter = None
        for ch in chapters:
            if str(ch["chapter_number"]) == str(chapter_number):
                target_chapter = ch
                break
        
        if not target_chapter:
            logger.warning(f"[RAG] Chapter {chapter_number} not found in parsed structure! Available: {[ch['chapter_number'] for ch in chapters[:10]]}")
            logger.info(f"[RAG] Falling back to content search for 'глава {chapter_number}'")
            
            # Fallback: search for chapter content directly in chunks
            all_chunks = self.get_all_document_chunks(user_email, [document_id])
            
            # Look for chunks that mention this chapter
            chapter_pattern = rf'(?:глава|chapter|ГЛАВА|CHAPTER)\s*{chapter_number}\b'
            chapter_chunks = []
            found_start = False
            
            for chunk in all_chunks:
                content = chunk.get("content", "")
                # Check if this chunk starts the chapter
                if re.search(chapter_pattern, content, re.IGNORECASE):
                    found_start = True
                    chapter_chunks.append(chunk)
                elif found_start:
                    # Check if we hit next chapter
                    next_chapter_pattern = rf'(?:глава|chapter|ГЛАВА|CHAPTER)\s*(?!{chapter_number})\d+'
                    if re.search(next_chapter_pattern, content[:200], re.IGNORECASE):
                        break  # Stop at next chapter
                    chapter_chunks.append(chunk)
                    # Limit to reasonable size
                    if len(chapter_chunks) > 50:
                        break
            
            if chapter_chunks:
                logger.info(f"[RAG] Found {len(chapter_chunks)} chunks via content search for chapter {chapter_number}")
                content_parts = [c["content"] for c in chapter_chunks]
                # Remove overlapping content between consecutive chunks
                deduplicated_content = remove_chunk_overlaps(content_parts)
                sources = [{
                    "index": i + 1,
                    "document_id": document_id,
                    "document_name": chunk.get("document_name"),
                    "chunk_index": chunk.get("chunk_index"),
                    "chapter": chapter_number,
                    "citation": f"Глава {chapter_number}, фрагмент {i + 1}"
                } for i, chunk in enumerate(chapter_chunks)]
                return deduplicated_content, sources
            
            logger.warning(f"[RAG] Chapter {chapter_number} not found even via content search")
            return "", []
        
        logger.info(f"[RAG] Target chapter found: {target_chapter}")
        
        # Get all chunks for this chapter
        all_chunks = self.get_all_document_chunks(user_email, [document_id])
        logger.info(f"[RAG] Total chunks in document: {len(all_chunks)}")
        
        start_idx = target_chapter["start_chunk"]
        end_idx = target_chapter["end_chunk"]
        
        chapter_chunks = [c for c in all_chunks if start_idx <= c.get("chunk_index", 0) <= end_idx]
        logger.info(f"[RAG] Chapter {chapter_number} chunks: {len(chapter_chunks)} (from idx {start_idx} to {end_idx})")
        
        # Build content
        content_parts = []
        sources = []
        
        for i, chunk in enumerate(chapter_chunks):
            content_parts.append(chunk["content"])
            sources.append({
                "index": i + 1,
                "document_id": document_id,
                "document_name": chunk.get("document_name"),
                "chunk_index": chunk.get("chunk_index"),
                "chapter": chapter_number,
                "citation": f"Глава {chapter_number}, фрагмент {i + 1}"
            })
        
        # Remove overlapping content between consecutive chunks
        full_content = remove_chunk_overlaps(content_parts)
        
        return full_content, sources

    def analyze_query_intent(self, query: str, document_structure: Dict) -> Dict[str, Any]:
        """
        🧠 UNIVERSAL QUERY INTENT ANALYZER
        
        Uses AI to understand ANY user query about documents:
        - What to search for (chapter, article, paragraph, law, loophole, etc.)
        - What scope (single section, multiple sections, full document, comparison)
        - What task (summarize, analyze, find contradictions, find loopholes, compare)
        
        IMPORTANT: When RAG is enabled, ALWAYS return a valid search strategy.
        Never return empty results - if unsure, use "search" scope.
        
        Args:
            query: User's natural language query in any language
            document_structure: Info about document (chapters, sections, type)
        
        Returns:
            Dict with:
                - scope: "single_section" | "multiple_sections" | "full_document" | "comparison" | "search"
                - sections: Array of section identifiers to load (chapter numbers, article numbers, etc.)
                - task: "summarize" | "analyze" | "find_loopholes" | "find_contradictions" | "compare" | "explain" | "search"
                - search_query: Optional refined search query for semantic search
                - reasoning: AI's explanation of why it chose this
        """
        try:
            from openai import OpenAI
            
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                # Fallback to simple chapter extraction
                return self._fallback_intent_analysis(query, document_structure)
            
            client = OpenAI(api_key=api_key)
            
            # Build document structure description
            structure_desc = self._describe_document_structure(document_structure)
            
            # Load intent analysis prompt from config
            prompts_config = load_rag_prompts()
            intent_config = prompts_config.get('intent_analysis', {})
            prompt_template = intent_config.get('prompt', '')
            
            if not prompt_template:
                # Fallback to hardcoded if config is empty
                logger.warning("[RAG] Intent analysis prompt not found in config, using fallback")
                return self._fallback_intent_analysis(query, document_structure)
            
            # Format the prompt with query and structure
            analysis_prompt = prompt_template.replace('{query}', query).replace('{structure_desc}', structure_desc)

            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": analysis_prompt}],
                max_tokens=500,
                temperature=0
            )
            
            result_text = response.choices[0].message.content.strip()
            
            # Parse JSON response
            import json
            # Clean up markdown if present
            if result_text.startswith("```"):
                result_text = result_text.split("```")[1]
                if result_text.startswith("json"):
                    result_text = result_text[4:]
            result_text = result_text.strip()
            
            intent = json.loads(result_text)
            intent["method"] = "ai_analysis"
            
            logger.info(f"[RAG] Intent analysis: query='{query[:50]}...' -> scope={intent.get('scope')}, sections={intent.get('sections')}, task={intent.get('task')}")
            
            return intent
            
        except Exception as e:
            logger.warning(f"[RAG] AI intent analysis failed: {e}, using fallback")
            return self._fallback_intent_analysis(query, document_structure)
    
    def _describe_document_structure(self, structure: Dict) -> str:
        """Build human-readable description of document structure for AI"""
        parts = []
        
        doc_type = structure.get("type", "document")
        parts.append(f"Document type: {doc_type}")
        
        if "chapters" in structure:
            chapters = structure["chapters"]
            parts.append(f"Total chapters: {len(chapters)}")
            if chapters:
                # Show first few and last few
                sample = chapters[:5] + ["..."] + chapters[-3:] if len(chapters) > 8 else chapters
                parts.append(f"Chapter numbers: {sample}")
        
        if "total_chunks" in structure:
            parts.append(f"Total content chunks: {structure['total_chunks']}")
        
        return "\n".join(parts)
    
    def _fallback_intent_analysis(self, query: str, structure: Dict) -> Dict:
        """Simple fallback intent analysis using regex patterns
        
        IMPORTANT: Always returns a valid search strategy, never empty.
        When in doubt, use scope="search" with the original query.
        """
        import re
        
        result = {
            "scope": "search",
            "sections": [],
            "task": "search",
            "search_query": query,
            "reasoning": "Fallback analysis - semantic search",
            "method": "regex_fallback"
        }
        
        query_lower = query.lower()
        
        # PRIORITY 1: Check for specific data questions (numbers, dates, statistics)
        # These should ALWAYS use search, not full_document
        data_patterns = [
            r'\d{4}',  # Years like 2018, 2020
            r'сколько',  # how many
            r'какое количество',
            r'how many',
            r'how much',
            r'статистик',  # statistics
            r'данны[еx]',  # data
            r'показател',  # indicators
            r'процент',  # percent
            r'стран[ыа]?\s',  # countries
            r'компани[йяи]',  # companies
            r'участник',  # participants
        ]
        for pattern in data_patterns:
            if re.search(pattern, query_lower):
                result["scope"] = "search"
                result["task"] = "find_data"
                result["search_query"] = query  # Use original query for search
                result["reasoning"] = "Data/statistics question detected - using semantic search"
                return result
        
        # PRIORITY 2: Check for full document intent (only for general questions)
        full_doc_patterns = [
            r'^о\s*чем\s*(эт[оа]|документ|книга|текст)',  # "о чем это/документ" at start
            r'вс[яеюё]\s*(книг|документ|текст)',
            r'whole\s*(book|document|text)',
            r'entire',
            r'полност',
            r'целиком',
            r'^overview$',
            r'^обзор$',
            r'общ[аи][яй]\s*(тем|иде|суть)',  # общая тема/идея/суть
            r'кратк[оиа].*(содержан|пересказ)',  # краткое содержание
        ]
        for pattern in full_doc_patterns:
            if re.search(pattern, query_lower):
                result["scope"] = "full_document"
                result["task"] = "summarize"
                result["reasoning"] = "Full document overview request detected"
                return result
        
        # Check for comparison
        if re.search(r'сравн|compar|vs\.?|против', query_lower):
            result["scope"] = "comparison"
            result["task"] = "compare"
        
        # Check for loopholes/contradictions (legal docs)
        if re.search(r'лазейк|loophole|исключен|exception|обход', query_lower):
            result["task"] = "find_loopholes"
        if re.search(r'противореч|contradiction|inconsisten', query_lower):
            result["task"] = "find_contradictions"
        
        # Try to extract chapter numbers
        chapters = structure.get("chapters", [])
        chapter_nums = [str(ch) for ch in chapters]
        
        # Range pattern: "главы 1-5", "chapters 1 through 5"
        range_match = re.search(r'(\d+)\s*[-–—]\s*(\d+)', query)
        if range_match:
            start, end = int(range_match.group(1)), int(range_match.group(2))
            found_sections = [str(i) for i in range(start, end + 1) if str(i) in chapter_nums]
            if found_sections:
                result["scope"] = "multiple_sections"
                result["sections"] = found_sections
                result["task"] = "summarize"
                return result
        
        # Multiple chapters: "главы 1 и 40", "chapters 1, 5, and 10"
        multi_match = re.findall(r'\b(\d+)\b', query)
        if len(multi_match) > 1:
            found_sections = [n for n in multi_match if n in chapter_nums]
            if len(found_sections) > 1:
                result["scope"] = "multiple_sections" if result["scope"] != "comparison" else "comparison"
                result["sections"] = found_sections
                return result
        
        # Single chapter
        if multi_match:
            for num in multi_match:
                if num in chapter_nums:
                    result["scope"] = "single_section"
                    result["sections"] = [num]
                    result["task"] = "summarize"
                    return result
        
        return result

    def smart_rag_search(
        self,
        query: str,
        user_email: str,
        document_id: Optional[str] = None,
        max_tokens: int = 50000,
        debug_collector: Optional[Any] = None,
        # === NEW: RAG CONFIG PARAMETERS ===
        chunk_mode: str = "adaptive",
        max_chunks: int = 50,
        chunk_percent: float = 20.0,
        min_chunks: int = 5,
        max_chunks_limit: int = 500,
        max_percent_limit: float = 50.0,  # NEW: percentage-based hard limit
        min_similarity: float = 0.4,
        use_rerank: bool = True,
        keyword_weight: float = 0.3,
        semantic_weight: float = 0.7,
        adaptive_chunks: bool = True,  # From orchestrator
        model_name: str = "gpt-4o"  # Model for context limit calculation
    ) -> Tuple[str, List[Dict], Dict]:
        """
        🚀 SMART RAG - Universal intelligent document retrieval
        
        Automatically understands any user query and retrieves the right content:
        - Single chapter/section
        - Multiple chapters
        - Full document
        - Semantic search
        - Comparisons
        
        NEW: Supports configurable chunk retrieval:
        - chunk_mode: "fixed" (exact count), "percent" (% of doc), "adaptive" (AI decides)
        - chunk_percent: Percentage of document to retrieve
        - adaptive_chunks: AI decides optimal chunk count based on query
        
        Args:
            query: User's natural language query
            user_email: User email
            document_id: Optional specific document
            max_tokens: Max tokens for context
        
        Returns:
            Tuple of (context, sources, debug_info)
        """
        # Get document to work with
        if not document_id:
            docs = self.list_documents(user_email, status="ready", limit=1)
            if not docs:
                return "", [], {"error": "No documents found"}
            document_id = docs[0]["id"]
            document_name = docs[0]["name"]
        else:
            doc = self.get_document(document_id, user_email)
            document_name = doc["name"] if doc else "Unknown"
        
        # === TRY META LAYER FIRST ===
        # Check if question can be answered from document metadata (structure, chapter count, etc.)
        quick_answer = self.get_quick_answer(document_id, user_email, query)
        if quick_answer:
            logger.info(f"[SMART-RAG] Question answered from META layer: '{query[:50]}...'")
            return quick_answer, [], {
                "mode": "meta_layer",
                "source": "document_meta",
                "query": query,
                "document_id": document_id
            }
        
        # Get document structure
        chapters = self.get_document_chapters(user_email, document_id)
        all_chunks = self.get_all_document_chunks(user_email, [document_id])
        
        document_structure = {
            "type": "book",  # Could detect from metadata
            "chapters": [ch["chapter_number"] for ch in chapters],
            "chapter_details": chapters,
            "total_chunks": len(all_chunks)
        }
        
        # Log document structure to debug collector
        if debug_collector:
            debug_collector.start_rag_pipeline()
            debug_collector.log_document_structure(
                document_id=document_id,
                document_name=document_name,
                total_chunks=len(all_chunks),
                chapters=[{
                    "number": ch.get("chapter_number", ""),
                    "title": ch.get("title", ""),
                    "start_chunk": ch.get("start_chunk", 0),
                    "end_chunk": ch.get("end_chunk", 0)
                } for ch in chapters],
                structure_type="book"
            )
        
        # Analyze intent
        intent = self.analyze_query_intent(query, document_structure)
        
        scope = intent.get("scope", "search")
        sections = intent.get("sections", [])
        task = intent.get("task", "search")
        
        # Log intent analysis to debug collector
        if debug_collector:
            debug_collector.log_intent_analysis(
                original_query=query,
                scope=scope,
                sections=sections,
                task=task,
                reasoning=intent.get("reasoning", "")
            )
        
        context = ""
        sources = []
        
        # Initialize chunk calculation variables (used in semantic search and debug_info)
        query_complexity = self.estimate_query_complexity(query) if adaptive_chunks else "medium"
        target_chunks = self.calculate_target_chunks(
            total_chunks=len(all_chunks),
            chunk_mode=chunk_mode,
            max_chunks=max_chunks,
            chunk_percent=chunk_percent,
            min_chunks=min_chunks,
            max_chunks_limit=max_chunks_limit,
            max_percent_limit=max_percent_limit,  # NEW!
            query_complexity=query_complexity
        )
        
        # Calculate effective limit for logging
        percent_limit = int(len(all_chunks) * (max_percent_limit / 100.0))
        effective_limit = min(max_chunks_limit, percent_limit)
        
        # === DETAILED LOGGING FOR CHUNK SETTINGS ===
        logger.info(f"[SMART-RAG] ===== CHUNK SETTINGS =====")
        logger.info(f"[SMART-RAG] Intent scope: {scope}, task: {task}")
        logger.info(f"[SMART-RAG] chunk_mode={chunk_mode}, max_chunks={max_chunks}, chunk_percent={chunk_percent}%")
        logger.info(f"[SMART-RAG] Total document chunks: {len(all_chunks)}, target_chunks calculated: {target_chunks}")
        logger.info(f"[SMART-RAG] Hard limits: abs={max_chunks_limit}, %={max_percent_limit}% ({percent_limit} chunks), effective={effective_limit}")
        logger.info(f"[SMART-RAG] min_chunks={min_chunks}")
        
        # === RESPECT USER CHUNK SETTINGS FOR FULL DOCUMENT ===
        # If user explicitly limited chunks but intent is full_document, switch to semantic search
        if scope == "full_document":
            logger.info(f"[SMART-RAG] Full document scope detected - checking if user limited chunks...")
            
            # Check if user wants less than full document
            user_wants_limited = False
            
            # ALWAYS respect max_chunks_limit if it's less than total chunks
            if max_chunks_limit < len(all_chunks):
                user_wants_limited = True
                logger.info(f"[SMART-RAG] ✓ max_chunks_limit ({max_chunks_limit}) < total ({len(all_chunks)}) - switching to search")
            elif chunk_mode == "fixed":
                if max_chunks < len(all_chunks):
                    user_wants_limited = True
                    logger.info(f"[SMART-RAG] ✓ User set FIXED mode with {max_chunks} chunks < {len(all_chunks)} total - switching to search")
                else:
                    logger.info(f"[SMART-RAG] Fixed mode but max_chunks({max_chunks}) >= total({len(all_chunks)}) - keeping full_document")
                    
            elif chunk_mode == "percent":
                # FIXED: Respect user's explicit percentage choice!
                # If user set ANY percentage < 80%, use search mode to respect it
                if chunk_percent < 80:
                    user_wants_limited = True
                    logger.info(f"[SMART-RAG] ✓ User set PERCENT mode ({chunk_percent}%) = {target_chunks} chunks - switching to search")
                else:
                    logger.info(f"[SMART-RAG] Percent mode at {chunk_percent}% (>= 80%) - keeping full_document")
                    
            elif chunk_mode == "adaptive":
                # In adaptive mode, check max_percent_limit (user's cap setting)
                if max_percent_limit < 80:
                    user_wants_limited = True
                    logger.info(f"[SMART-RAG] ✓ ADAPTIVE mode with max_percent_limit={max_percent_limit}% < 80% - switching to search")
                elif target_chunks < len(all_chunks) * 0.5:
                    user_wants_limited = True
                    logger.info(f"[SMART-RAG] ✓ ADAPTIVE mode but target({target_chunks}) < 50% of total({len(all_chunks)}) - switching to search")
                else:
                    logger.info(f"[SMART-RAG] Adaptive mode, target({target_chunks}) is sufficient - keeping full_document")
            
            if user_wants_limited:
                scope = "search"
                intent["scope"] = "search"
                intent["reasoning"] = f"User limited chunks: mode={chunk_mode}, target={target_chunks}, max_limit={max_chunks_limit}, total={len(all_chunks)}"
                logger.info(f"[SMART-RAG] → Switched to SEARCH mode to respect user's chunk limit")
        
        # Execute based on scope
        full_doc_debug_info = None  # Store full document debug info
        if scope == "full_document":
            logger.info(f"[SMART-RAG] Loading full document for task: {task} (chunk_mode={chunk_mode})")
            context, sources, full_doc_debug_info = self.build_full_document_context(
                user_email=user_email,
                document_ids=[document_id],
                max_tokens=max_tokens
            )
            logger.info(f"[SMART-RAG] Full doc loaded: {full_doc_debug_info.get('total_chunks', 0)} chunks, {full_doc_debug_info.get('total_chars', 0)} chars")
            
        elif scope == "single_section" and sections:
            logger.info(f"[SMART-RAG] Loading single section: {sections[0]}")
            context, sources = self.get_chapter_content(user_email, document_id, sections[0])
            
            # Add chapter header
            chapter_info = next((ch for ch in chapters if str(ch["chapter_number"]) == sections[0]), None)
            if chapter_info:
                header = f"📖 ГЛАВА {sections[0]}: {chapter_info.get('title', '')}\n\n"
                context = header + context
                
        elif scope == "multiple_sections" and sections:
            logger.info(f"[SMART-RAG] Loading multiple sections: {sections}")
            context_parts = []
            
            for section_num in sections:
                section_content, section_sources = self.get_chapter_content(
                    user_email, document_id, section_num
                )
                if section_content:
                    chapter_info = next((ch for ch in chapters if str(ch["chapter_number"]) == section_num), None)
                    header = f"\n{'='*60}\n📖 ГЛАВА {section_num}"
                    if chapter_info:
                        header += f": {chapter_info.get('title', '')}"
                    header += f"\n{'='*60}\n\n"
                    
                    context_parts.append(header + section_content)
                    sources.extend(section_sources)
            
            context = "\n".join(context_parts)
            
        elif scope == "comparison" and len(sections) >= 2:
            logger.info(f"[SMART-RAG] Comparison mode for sections: {sections}")
            context_parts = [f"📊 СРАВНИТЕЛЬНЫЙ АНАЛИЗ ГЛАВ {', '.join(sections)}\n"]
            
            for section_num in sections:
                section_content, section_sources = self.get_chapter_content(
                    user_email, document_id, section_num
                )
                if section_content:
                    chapter_info = next((ch for ch in chapters if str(ch["chapter_number"]) == section_num), None)
                    header = f"\n{'='*60}\n📖 ГЛАВА {section_num}"
                    if chapter_info:
                        header += f": {chapter_info.get('title', '')}"
                    header += f"\n{'='*60}\n\n"
                    
                    context_parts.append(header + section_content)
                    sources.extend(section_sources)
            
            context = "\n".join(context_parts)
            
        else:
            # Default: semantic search (scope == "search" or fallback)
            search_query = intent.get("search_query", query)
            task = intent.get("task", "search")
            logger.info(f"[SMART-RAG] Semantic search: query='{search_query[:80]}...', task='{task}'")
            
            # Target chunks already calculated above
            logger.info(f"[SMART-RAG] Target chunks: {target_chunks} "
                       f"(mode={chunk_mode}, complexity={query_complexity}, total={len(all_chunks)})")
            
            # Log retrieval start to debug collector
            if debug_collector:
                debug_collector.log_retrieval(
                    strategy="semantic_search",
                    techniques=["embedding_similarity", "hybrid_search", f"chunk_mode:{chunk_mode}"],
                    queries=[search_query],
                    latency_ms=0  # Will be updated
                )
            
            # Use direct hybrid search when user explicitly limited chunks
            # to avoid ultimate_rag_search re-analyzing intent and loading full doc
            user_limited_chunks = (chunk_mode == "fixed" and max_chunks < len(all_chunks)) or \
                                  (chunk_mode == "percent" and target_chunks < len(all_chunks) * 0.8)
            
            if user_limited_chunks:
                logger.info(f"[SMART-RAG] User limited chunks - using direct hybrid search (target={target_chunks})")
                # Use direct hybrid search to respect user's chunk limit
                context, sources = self.build_rag_context(
                    query=search_query,
                    user_email=user_email,
                    document_ids=[document_id],
                    max_tokens=target_chunks * 800,
                    threshold=min_similarity,
                    use_hybrid=True,
                    keyword_weight=keyword_weight,
                    semantic_weight=semantic_weight,
                    limit=target_chunks  # PASS TARGET CHUNKS AS LIMIT
                )
            elif hasattr(self, 'ultimate_rag_search'):
                logger.info(f"[SMART-RAG] Using ultimate_rag_search for query (target_chunks={target_chunks})")
                result = self.ultimate_rag_search(
                    query=search_query,
                    user_email=user_email,
                    max_tokens=target_chunks * 1000  # Convert chunks to approximate tokens
                )
                context = result.get("context", "")
                sources = result.get("sources", [])
                
                # If no results from ultimate search, try with lower threshold
                if not sources:
                    logger.warning(f"[SMART-RAG] ultimate_rag_search returned no results, trying build_rag_context")
                    context, sources = self.build_rag_context(
                        query=search_query,
                        user_email=user_email,
                        document_ids=[document_id],
                        max_tokens=max_tokens,
                        threshold=min(min_similarity, 0.3),  # Lower threshold
                        keyword_weight=keyword_weight,
                        semantic_weight=semantic_weight,
                        limit=target_chunks  # PASS TARGET CHUNKS AS LIMIT
                    )
            else:
                # Use build_rag_context with configurable params
                context, sources = self.build_rag_context(
                    query=search_query,
                    user_email=user_email,
                    document_ids=[document_id],
                    max_tokens=max_tokens,
                    threshold=min_similarity,
                    keyword_weight=keyword_weight,
                    semantic_weight=semantic_weight,
                    limit=target_chunks  # PASS TARGET CHUNKS AS LIMIT
                )
            
            # If still no results, try broader search with just keywords
            if not sources and not context:
                logger.warning(f"[SMART-RAG] No results found, trying keyword extraction")
                # Extract key terms from query
                keywords = self._extract_keywords(search_query)
                if keywords:
                    keyword_query = " ".join(keywords)
                    logger.info(f"[SMART-RAG] Trying keyword search: '{keyword_query}'")
                    context, sources = self.build_rag_context(
                        query=keyword_query,
                        user_email=user_email,
                        document_ids=[document_id],
                        max_tokens=max_tokens,
                        threshold=0.25,  # Even lower threshold
                        limit=target_chunks  # PASS TARGET CHUNKS AS LIMIT
                    )
            
            logger.info(f"[SMART-RAG] Search results: {len(sources)} sources, {len(context)} chars context")
        
        # Build task-specific instructions BEFORE compression
        task_instructions = self._get_task_instructions(task, intent)
        if task_instructions:
            context = task_instructions + "\n\n" + context
        
        # Adaptive context compression - automatically handles model limits
        # This prevents "context too large" errors
        original_len = len(context)
        context = self.adaptive_context_compression(
            context=context,
            max_tokens=max_tokens,
            model_name=model_name  # Use actual model for correct limit calculation
        )
        
        # Log to debug collector
        if debug_collector:
            # Log chunks (sources)
            debug_collector.log_chunks([{
                "chunk_index": i,
                "document_id": s.get("document_id", document_id),
                "document_name": s.get("document_name", document_name),
                "content": s.get("content", "")[:500],
                "metadata": s.get("metadata", {}),
                "similarity": s.get("similarity", 0),
                "chapter": s.get("chapter", "")
            } for i, s in enumerate(sources)])
            
            # Log context building
            debug_collector.log_context_building(
                raw_chars=original_len,
                final_chars=len(context),
                compression_applied=len(context) < original_len,
                final_context=context
            )
            
            # Log retrieval strategy
            debug_collector.log_retrieval_strategy(
                strategy=f"smart_rag_{scope}",
                techniques=["intent_analysis", "chapter_detection"] if sections else ["semantic_search"],
                generated_queries=[],
                step_back_query=""
            )
        
        debug_info = {
            "mode": "smart_rag",
            "intent": intent,
            "scope": scope,
            "sections_loaded": sections,
            "task": task,
            "document_name": document_name,
            "original_chars": original_len,
            "compressed_chars": len(context),
            "compression_ratio": f"{len(context)/original_len*100:.1f}%" if original_len > 0 else "100%",
            "estimated_tokens": len(context) // 4,
            "sources_count": len(sources),
            # NEW: Chunk mode info
            "chunk_config": {
                "mode": chunk_mode,
                "max_chunks": max_chunks,
                "chunk_percent": chunk_percent,
                "min_chunks": min_chunks,
                "max_chunks_limit": max_chunks_limit,
                "max_percent_limit": max_percent_limit,  # NEW!
                "effective_limit": effective_limit,  # NEW!
                "total_document_chunks": len(all_chunks),
                "target_chunks_calculated": target_chunks if scope == "search" else None,
                "adaptive_chunks": adaptive_chunks,
                "query_complexity": query_complexity if scope == "search" else None
            }
        }
        
        # Include full document info if available
        if full_doc_debug_info:
            debug_info["full_document_info"] = full_doc_debug_info
            # Override sources_count with actual chunks loaded for full doc mode
            debug_info["total_chunks_loaded"] = full_doc_debug_info.get("total_chunks", 0)
            debug_info["total_chars_loaded"] = full_doc_debug_info.get("total_chars", 0)
            logger.info(f"[SMART-RAG] Debug info enriched with full_doc: {full_doc_debug_info}")
        
        return context, sources, debug_info
    
    def _get_task_instructions(self, task: str, intent: Dict) -> str:
        """Get task-specific instructions for the AI"""
        instructions = {
            "summarize": "📝 ЗАДАЧА: Перескажи/суммаризируй содержание ниже.",
            "analyze": "🔍 ЗАДАЧА: Проведи глубокий анализ текста - темы, смысл, подтекст.",
            "find_data": """📊 ЗАДАЧА: Найди конкретные данные, статистику, факты и цифры в тексте.
Обрати внимание на:
- Числа, проценты, количества
- Даты, годы, периоды
- Названия стран, компаний, организаций
- Статистические показатели
- Конкретные факты и события
Если данные найдены - приведи их точно. Если не найдены - скажи об этом.""",
            "find_loopholes": """⚖️ ЗАДАЧА: Найди лазейки, исключения и способы обхода в тексте.
Обрати внимание на:
- Фразы типа "за исключением", "кроме случаев", "если не..."
- Размытые формулировки
- Отсутствие четких определений
- Противоречия с другими нормами""",
            "find_contradictions": """⚡ ЗАДАЧА: Найди противоречия и несоответствия в тексте.
Ищи:
- Взаимоисключающие утверждения
- Логические нестыковки
- Разночтения в терминах""",
            "find_penalties": """⚠️ ЗАДАЧА: Найди информацию о штрафах, санкциях, наказаниях.
Ищи:
- Размеры штрафов
- Виды наказаний
- Условия применения санкций""",
            "find_requirements": """📋 ЗАДАЧА: Найди требования, обязанности, условия.
Ищи:
- Обязательные требования
- Необходимые условия
- Обязанности сторон""",
            "find_deadlines": """⏰ ЗАДАЧА: Найди сроки, даты, периоды.
Ищи:
- Конкретные даты
- Сроки исполнения
- Периоды действия""",
            "compare": "📊 ЗАДАЧА: Сравни указанные разделы. Найди общее и различия.",
            "explain": "💡 ЗАДАЧА: Объясни запрошенное понятие или термин.",
            "search": ""  # No special instructions for general search
        }
        return instructions.get(task, "")

    def _extract_keywords(self, query: str) -> List[str]:
        """
        Extract meaningful keywords from a query for fallback search.
        Removes common stop words and keeps important terms.
        
        Args:
            query: User's search query
        
        Returns:
            List of keywords
        """
        import re
        
        # Common stop words (Russian + English)
        stop_words = {
            # Russian
            'и', 'в', 'во', 'не', 'что', 'он', 'на', 'я', 'с', 'со', 'как', 'а', 'то', 'все',
            'она', 'так', 'его', 'но', 'да', 'ты', 'к', 'у', 'же', 'вы', 'за', 'бы', 'по',
            'только', 'её', 'мне', 'было', 'вот', 'от', 'меня', 'ещё', 'нет', 'о', 'из',
            'ему', 'теперь', 'когда', 'уже', 'вам', 'ни', 'быть', 'был', 'была', 'были',
            'этот', 'этого', 'этой', 'эти', 'это', 'есть', 'где', 'какой', 'какая', 'какие',
            'сколько', 'который', 'которая', 'которые', 'про', 'для', 'при', 'об',
            # English
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
            'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
            'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
            'through', 'during', 'before', 'after', 'above', 'below', 'between',
            'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
            'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just',
            'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
            'how', 'when', 'where', 'why', 'all', 'each', 'every', 'any', 'some',
            # Question words to remove
            'расскажи', 'скажи', 'покажи', 'найди', 'tell', 'show', 'find',
            'документ', 'документе', 'книге', 'книга', 'тексте', 'document', 'book', 'text'
        }
        
        # Tokenize: split on non-word characters, keep numbers
        tokens = re.findall(r'[\w\d]+', query.lower())
        
        # Filter out stop words and short tokens (except numbers)
        keywords = []
        for token in tokens:
            if token.isdigit():
                keywords.append(token)  # Keep all numbers (years, quantities)
            elif token not in stop_words and len(token) > 2:
                keywords.append(token)
        
        logger.info(f"[RAG] Extracted keywords from '{query[:50]}...': {keywords}")
        return keywords

    def _extract_chapter_with_ai(self, query: str, available_chapters: List) -> Optional[str]:
        """
        Use AI to intelligently extract chapter number from user query.
        Works with any language, phrasing, or format.
        
        Args:
            query: User's natural language query
            available_chapters: List of available chapter numbers (can be strings or ints)
        
        Returns:
            Chapter number as string if detected, None otherwise
        """
        # Normalize available chapters to strings for comparison
        available_str = [str(ch) for ch in available_chapters]
        
        try:
            from openai import OpenAI
            
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                logger.warning("[RAG] OpenAI API key not found, falling back to regex")
                result = self._extract_chapter_with_regex(query)
                return str(result) if result else None
            
            client = OpenAI(api_key=api_key)
            
            # Fast, cheap extraction prompt
            extraction_prompt = f"""Extract the chapter number from this user query about a book/document.
User query: "{query}"

Available chapters: {available_str[:20]}{'...' if len(available_str) > 20 else ''}

Rules:
- Return ONLY the number (e.g., "40")
- If the user mentions a specific chapter number, extract it
- If no chapter is mentioned or you're unsure, return "NONE"
- Handle any language (Russian, English, etc.)
- Handle various formats: "глава 40", "40 глава", "chapter 40", "40-я глава", "сороковая глава", etc.

Chapter number:"""

            response = client.chat.completions.create(
                model="gpt-4o-mini",  # Fast and cheap
                messages=[{"role": "user", "content": extraction_prompt}],
                max_tokens=10,
                temperature=0
            )
            
            result = response.choices[0].message.content.strip()
            logger.info(f"[RAG] AI chapter extraction: query='{query[:50]}...' -> result='{result}'")
            
            if result and result != "NONE" and result.isdigit():
                if result in available_str:
                    return result  # Return as string
                else:
                    logger.warning(f"[RAG] AI extracted chapter {result} but it's not in available chapters: {available_str}")
                    return None
            
            return None
            
        except Exception as e:
            logger.warning(f"[RAG] AI chapter extraction failed: {e}, falling back to regex")
            result = self._extract_chapter_with_regex(query)
            return str(result) if result else None
    
    def _extract_chapter_with_regex(self, query: str) -> Optional[int]:
        """
        Fallback regex-based chapter extraction.
        Used when AI is not available.
        """
        import re
        
        patterns = [
            r'(?:глав[аеуыой]|chapter)\s*(\d+)',  # глава 40, chapter 40
            r'(\d+)[\s\-]*(?:ая|ой|я)?\s*глав[аеуыой]',  # 40 глава, 40-я глава
            r'(?:о|про|в|из)\s*(\d+)\s*глав',  # о 40 главе
            r'(\d+)\s*(?:й|ой|ая|ую)\s*глав',  # 40-й главе
        ]
        
        for pattern in patterns:
            match = re.search(pattern, query, re.IGNORECASE)
            if match:
                return int(match.group(1))
        
        return None

    def build_full_document_context(
        self,
        user_email: str,
        document_ids: Optional[List[str]] = None,
        max_tokens: int = 100000
    ) -> Tuple[str, List[Dict], Dict]:
        """
        Build context with FULL document content.
        Use this when user wants to analyze entire book/document.
        
        WARNING: This can be very large! Use with models that have large context windows
        (Gemini 1.5 Pro 1M, Claude 200K, GPT-4o 128K)
        
        Args:
            user_email: User email
            document_ids: Specific documents (None = all user's documents)
            max_tokens: Maximum tokens to include
        
        Returns:
            Tuple of (context, sources, debug_info)
        """
        logger.info(f"[FULL-DOC] build_full_document_context called: user={user_email}, doc_ids={document_ids}, max_tokens={max_tokens}")
        
        all_chunks = self.get_all_document_chunks(user_email, document_ids)
        
        logger.info(f"[FULL-DOC] get_all_document_chunks returned {len(all_chunks)} chunks")
        
        if not all_chunks:
            logger.warning(f"[FULL-DOC] No chunks found!")
            return "", [], {"error": "No documents found"}
        
        # Group by document
        docs_content = {}
        for chunk in all_chunks:
            doc_id = chunk["document_id"]
            doc_name = chunk.get("document_name", "Unknown")
            
            if doc_id not in docs_content:
                docs_content[doc_id] = {
                    "name": doc_name,
                    "chunks": []
                }
            docs_content[doc_id]["chunks"].append(chunk)
        
        # Build full content
        context_parts = []
        sources = []
        total_chars = 0
        max_chars = max_tokens * 4  # Rough token estimate
        truncated = False
        chunks_loaded = 0  # Track how many chunks were actually loaded
        
        for doc_id, doc_data in docs_content.items():
            doc_name = doc_data["name"]
            chunks = doc_data["chunks"]
            total_doc_chunks = len(chunks)
            doc_total_chars = sum(len(c['content']) for c in chunks)
            
            # Add source info FIRST - ONE entry per document but include ALL chunk info
            # This ensures source is always added even if document is truncated
            source_entry = {
                "document_id": doc_id,
                "document_name": doc_name,
                "total_chunks": total_doc_chunks,
                "chunks_in_document": total_doc_chunks,  # For UI display
                "citation": f"📚 {doc_name} (полный документ, {total_doc_chunks} чанков)",
                "content": f"[Полный документ: {total_doc_chunks} чанков, ~{doc_total_chars} символов]"
            }
            sources.append(source_entry)
            
            # Add document header
            doc_header = f"\n{'='*60}\n📚 ДОКУМЕНТ: {doc_name}\n{'='*60}\n"
            context_parts.append(doc_header)
            total_chars += len(doc_header)
            
            # Sort chunks by index and remove overlaps
            sorted_chunks = sorted(chunks, key=lambda c: c.get("chunk_index", 0))
            
            # Collect chunk contents for this document
            doc_chunk_contents = []
            for chunk in sorted_chunks:
                chunk_content = chunk["content"]
                chunk_chars = len(chunk_content)
                
                if total_chars + chunk_chars > max_chars:
                    # Add truncation notice
                    context_parts.append(f"\n... [Документ обрезан из-за лимита токенов. Загружено {total_chars} символов из {doc_total_chars}] ...")
                    truncated = True
                    # Update source entry with truncation info
                    source_entry["truncated"] = True
                    source_entry["chunks_loaded"] = chunks_loaded
                    source_entry["citation"] = f"📚 {doc_name} (загружено {chunks_loaded} из {total_doc_chunks} чанков)"
                    break
                
                doc_chunk_contents.append(chunk_content)
                total_chars += chunk_chars
                chunks_loaded += 1
            
            # Remove overlapping parts between chunks and join
            if doc_chunk_contents:
                deduplicated_content = remove_chunk_overlaps(doc_chunk_contents)
                context_parts.append(deduplicated_content)
            
            if truncated:
                break
        
        logger.info(f"[FULL-DOC] Built context: {total_chars} chars, chunks_loaded={chunks_loaded}, truncated={truncated}, sources={len(sources)}")
        
        # Build final context
        header = """Ниже представлен ПОЛНЫЙ текст документа(ов) пользователя.
Ты можешь анализировать, пересказывать, отвечать на вопросы по всему содержимому.

"""
        context = header + "\n".join(context_parts)
        
        debug_info = {
            "mode": "full",
            "total_documents": len(docs_content),
            "total_chunks": len(all_chunks),
            "chunks_loaded": chunks_loaded if truncated else len(all_chunks),
            "total_chars": total_chars,
            "estimated_tokens": total_chars // 4,
            "truncated": truncated
        }
        
        return context, sources, debug_info

    def build_chapter_context(
        self,
        query: str,
        user_email: str,
        document_id: Optional[str] = None,
        chapter_number: Optional[str] = None,
        max_tokens: int = 30000
    ) -> Tuple[str, List[Dict], Dict]:
        """
        Build context for working with specific chapter(s).
        Auto-detects relevant chapter if not specified.
        
        Args:
            query: User's query (used to auto-detect chapter if not specified)
            user_email: User email
            document_id: Specific document (None = use first document)
            chapter_number: Specific chapter (None = auto-detect from query)
            max_tokens: Maximum tokens
        
        Returns:
            Tuple of (context, sources, debug_info)
        """
        # Get document to work with
        if not document_id:
            docs = self.list_documents(user_email, status="ready", limit=1)
            if not docs:
                return "", [], {"error": "No documents found"}
            document_id = docs[0]["id"]
            document_name = docs[0]["name"]
        else:
            doc = self.get_document(document_id, user_email)
            document_name = doc["name"] if doc else "Unknown"
        
        # Get chapters
        chapters = self.get_document_chapters(user_email, document_id)
        
        if not chapters:
            return "", [], {"error": "No chapters detected"}
        
        # Auto-detect chapter from query if not specified
        target_chapter = None
        detected_from_query = False
        detection_method = None
        
        if chapter_number:
            for ch in chapters:
                if str(ch["chapter_number"]) == str(chapter_number):
                    target_chapter = ch
                    break
        else:
            # Use AI to extract chapter number from query (works for any language/phrasing)
            extracted_chapter = self._extract_chapter_with_ai(query, [ch["chapter_number"] for ch in chapters])
            
            if extracted_chapter:
                for ch in chapters:
                    if str(ch["chapter_number"]) == str(extracted_chapter):
                        target_chapter = ch
                        detected_from_query = True
                        detection_method = "ai"
                        logger.info(f"[RAG] AI extracted chapter {extracted_chapter} from query: '{query}'")
                        break
        
        if not target_chapter:
            # Return list of available chapters
            chapters_list = "\n".join([
                f"  • Глава {ch['chapter_number']}: {ch['title'][:50]}..."
                for ch in chapters
            ])
            return f"Не удалось определить главу. Доступные главы:\n{chapters_list}", [], {
                "mode": "chapter",
                "available_chapters": [ch["chapter_number"] for ch in chapters]
            }
        
        # Get chapter content
        content, sources = self.get_chapter_content(user_email, document_id, target_chapter["chapter_number"])
        
        if not content:
            return "", [], {"error": f"Chapter {target_chapter['chapter_number']} is empty"}
        
        # Truncate if needed
        max_chars = max_tokens * 4
        if len(content) > max_chars:
            content = content[:max_chars] + "\n\n... [Глава обрезана из-за лимита токенов] ..."
        
        # Build context
        header = f"""📖 ГЛАВА {target_chapter['chapter_number']}: {target_chapter['title']}
Документ: {document_name}

---

"""
        context = header + content
        
        debug_info = {
            "mode": "chapter",
            "document_id": document_id,
            "document_name": document_name,
            "chapter_number": target_chapter["chapter_number"],
            "chapter_title": target_chapter["title"],
            "auto_detected": detected_from_query,
            "detection_method": detection_method or "explicit",  # "ai", "explicit"
            "total_chunks": target_chapter["end_chunk"] - target_chapter["start_chunk"] + 1,
            "total_chars": len(content),
            "estimated_tokens": len(content) // 4,
            "available_chapters": [ch["chapter_number"] for ch in chapters]
        }
        
        return context, sources, debug_info

    def build_rag_context(
        self,
        query: str,
        user_email: str,
        document_ids: Optional[List[str]] = None,
        max_tokens: int = 4000,
        threshold: float = 0.5,
        use_hybrid: bool = True,
        keyword_weight: float = 0.3,
        semantic_weight: float = 0.7,
        limit: int = 50  # NEW: configurable chunk limit
    ) -> Tuple[str, List[Dict]]:
        """
        Build context string from relevant documents for RAG.
        Supports configurable hybrid search weights (like n8n).
        
        Args:
            query: Search query
            user_email: User email for filtering
            document_ids: Optional list of document IDs to search
            max_tokens: Maximum tokens for context
            threshold: Minimum similarity threshold
            use_hybrid: Use hybrid (keyword + semantic) search
            keyword_weight: Weight for BM25/keyword search (0-1)
            semantic_weight: Weight for vector/semantic search (0-1)
            limit: Maximum number of chunks to retrieve
        
        Returns:
            Tuple of (context_string, source_documents)
        """
        logger.info(f"[build_rag_context] Starting with limit={limit}, max_tokens={max_tokens}")
        
        if use_hybrid:
            results = self.hybrid_search(
                query=query,
                user_email=user_email,
                limit=limit,  # Use configurable limit
                keyword_weight=keyword_weight,
                semantic_weight=semantic_weight
            )
        else:
            results = self.search(
                query=query,
                user_email=user_email,
                document_ids=document_ids,
                threshold=threshold,
                limit=limit  # Use configurable limit
            )
        
        logger.info(f"[build_rag_context] Got {len(results)} results from search")
        
        if not results:
            return "", []
        
        context_parts = []
        sources = []
        total_chars = 0
        max_chars = max_tokens * 4  # Rough token estimate
        
        for i, result in enumerate(results):
            chunk_chars = len(result["content"])
            
            if total_chars + chunk_chars > max_chars:
                break
            
            # Format with citation
            citation = self.format_citation(result)
            context_parts.append(f"[{i+1}] {citation}\n{result['content']}")
            
            sources.append({
                "index": i + 1,
                "document_id": result["document_id"],
                "document_name": result.get("document_name"),
                "section": result.get("section_title"),
                "page": result.get("page_number"),
                "chunk_index": result.get("chunk_index"),
                "similarity": result.get("similarity") or result.get("combined_score", 0),
                "citation": citation
            })
            total_chars += chunk_chars
        
        # Build final context with header from config
        header = get_context_header() + "\n"
        context = header + "\n\n".join(context_parts)
        
        return context, sources



    # ==================== TWO-STAGE SMART CHUNK SELECTION ====================
    
    def get_chunk_summaries(
        self,
        user_email: str,
        document_ids: Optional[List[str]] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get lightweight chunk summaries for smart selection.
        Returns only metadata and first ~200 chars of content (no embeddings).
        This is much faster and cheaper than loading full chunks.
        """
        user_id = self._get_user_id(user_email)
        
        query = self.client.table("document_chunks")\
            .select("id, document_id, chunk_index, metadata, content")\
            .order("chunk_index", desc=False)\
            .limit(limit)
        
        # Filter by document IDs if specified
        if document_ids:
            query = query.in_("document_id", document_ids)
        
        result = query.execute()
        chunks = result.data or []
        
        # Get document names
        if chunks:
            doc_ids = list(set(c["document_id"] for c in chunks))
            docs = self.client.table("documents")\
                .select("id, name")\
                .in_("id", doc_ids)\
                .eq("user_id", user_id)\
                .execute()
            doc_names = {d["id"]: d["name"] for d in (docs.data or [])}
        else:
            doc_names = {}
        
        # Build lightweight summaries
        summaries = []
        for chunk in chunks:
            metadata = chunk.get("metadata", {}) or {}
            content_preview = chunk["content"][:200].strip()
            if len(chunk["content"]) > 200:
                content_preview += "..."
            
            summaries.append({
                "id": chunk["id"],
                "document_id": chunk["document_id"],
                "document_name": doc_names.get(chunk["document_id"], "Unknown"),
                "chunk_index": chunk["chunk_index"],
                "chapter": metadata.get("chapter_number") or metadata.get("chapter_title"),
                "section": metadata.get("section_header"),
                "position_percent": metadata.get("position_percent", 0),
                "content_preview": content_preview
            })
        
        return summaries
    
    def ai_select_relevant_chunks(
        self,
        query: str,
        chunk_summaries: List[Dict],
        max_chunks: int = 10
    ) -> List[str]:
        """
        Use AI to select the most relevant chunks based on their summaries/metadata.
        Returns list of chunk IDs that the AI deemed relevant.
        
        This is the "smart selection" step - AI analyzes descriptions,
        not full content, making it fast and cheap.
        """
        if not chunk_summaries:
            return []
        
        # Build concise descriptions for AI
        descriptions = []
        for i, cs in enumerate(chunk_summaries):
            desc = f"[{i}] Doc: {cs['document_name']}"
            if cs.get("chapter"):
                desc += f" | Chapter: {cs['chapter']}"
            if cs.get("section"):
                desc += f" | Section: {cs['section']}"
            desc += f" | Position: {cs['position_percent']}%"
            desc += f"\nPreview: {cs['content_preview']}"
            descriptions.append(desc)
        
        chunks_text = "\n\n".join(descriptions)
        
        prompt = f"""You are a document retrieval expert. Analyze the following chunk descriptions and select which ones are most likely to contain relevant information for the user's question.

USER QUESTION: {query}

AVAILABLE CHUNKS:
{chunks_text}

INSTRUCTIONS:
1. Read each chunk's metadata (document name, chapter, section) and preview text
2. Select chunks that are most likely to contain the answer or relevant context
3. Consider selecting chunks from different parts of the document for comprehensive coverage
4. Select up to {max_chunks} chunks maximum

Return ONLY a JSON array of chunk indices (numbers in brackets), like: [0, 3, 5, 7]
No explanation, just the array of numbers."""

        try:
            response = self.embedding_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=100
            )
            
            import json
            indices_text = response.choices[0].message.content.strip()
            # Extract JSON array from response
            if '[' in indices_text:
                indices_text = indices_text[indices_text.index('['):indices_text.rindex(']')+1]
            selected_indices = json.loads(indices_text)
            
            # Validate indices and get chunk IDs
            selected_ids = []
            for idx in selected_indices:
                if isinstance(idx, int) and 0 <= idx < len(chunk_summaries):
                    selected_ids.append(chunk_summaries[idx]["id"])
            
            logger.info(f"[RAG] AI selected {len(selected_ids)} chunks out of {len(chunk_summaries)} candidates")
            return selected_ids
            
        except Exception as e:
            logger.warning(f"AI chunk selection failed: {e}")
            # Fallback: return first max_chunks chunk IDs
            return [cs["id"] for cs in chunk_summaries[:max_chunks]]
    
    def get_chunks_by_ids(
        self,
        chunk_ids: List[str],
        user_email: str
    ) -> List[Dict[str, Any]]:
        """
        Load full content of specific chunks by their IDs.
        This is the "second stage" - loading only the chunks AI selected.
        """
        if not chunk_ids:
            return []
        
        user_id = self._get_user_id(user_email)
        
        # Get chunks
        result = self.client.table("document_chunks")\
            .select("id, document_id, chunk_index, content, metadata")\
            .in_("id", chunk_ids)\
            .execute()
        
        chunks = result.data or []
        
        # Get document names
        if chunks:
            doc_ids = list(set(c["document_id"] for c in chunks))
            docs = self.client.table("documents")\
                .select("id, name")\
                .in_("id", doc_ids)\
                .eq("user_id", user_id)\
                .execute()
            doc_names = {d["id"]: d["name"] for d in (docs.data or [])}
            
            for chunk in chunks:
                chunk["document_name"] = doc_names.get(chunk["document_id"], "Unknown")
        
        # Sort by original order (chunk_index)
        chunks.sort(key=lambda x: (x.get("document_id", ""), x.get("chunk_index", 0)))
        
        return chunks
    
    def smart_two_stage_search(
        self,
        query: str,
        user_email: str,
        document_ids: Optional[List[str]] = None,
        initial_candidates: int = 50,
        final_chunks: int = 10
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Two-stage smart chunk selection:
        
        Stage 1: Get lightweight chunk summaries (fast, cheap)
        Stage 2: AI selects relevant chunks by analyzing metadata/previews
        Stage 3: Load full content only for selected chunks
        
        Benefits:
        - AI can see document structure (chapters, sections)
        - AI makes informed decisions based on context, not just similarity
        - Much cheaper than loading full content for reranking
        - Works great for structural questions ("what's in chapter 5?")
        
        Args:
            query: User's question
            user_email: User email for filtering
            document_ids: Optional document filter
            initial_candidates: How many chunks to show AI for selection
            final_chunks: Max chunks for AI to select
        
        Returns:
            Tuple of (selected_chunks, debug_info)
        """
        debug_info = {
            "stage1_candidates": 0,
            "stage2_selected": 0,
            "method": "smart_two_stage"
        }
        
        # Stage 1: Get chunk summaries (lightweight)
        logger.info(f"[RAG] Smart search Stage 1: Getting {initial_candidates} chunk summaries")
        summaries = self.get_chunk_summaries(
            user_email=user_email,
            document_ids=document_ids,
            limit=initial_candidates
        )
        debug_info["stage1_candidates"] = len(summaries)
        
        if not summaries:
            return [], debug_info
        
        # Stage 2: AI selects relevant chunks
        logger.info(f"[RAG] Smart search Stage 2: AI selecting from {len(summaries)} candidates")
        selected_ids = self.ai_select_relevant_chunks(
            query=query,
            chunk_summaries=summaries,
            max_chunks=final_chunks
        )
        debug_info["stage2_selected"] = len(selected_ids)
        
        if not selected_ids:
            # Fallback to similarity search if AI selection failed
            logger.warning("[RAG] AI selection returned no chunks, falling back to similarity search")
            return self.search(query, user_email, document_ids, limit=final_chunks), debug_info
        
        # Stage 3: Load full content for selected chunks
        logger.info(f"[RAG] Smart search Stage 3: Loading {len(selected_ids)} selected chunks")
        chunks = self.get_chunks_by_ids(selected_ids, user_email)
        
        return chunks, debug_info
    
    def hybrid_smart_search(
        self,
        query: str,
        user_email: str,
        document_ids: Optional[List[str]] = None,
        use_smart_selection: bool = True,
        candidates: int = 50,
        final_chunks: int = 10
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Combined search that uses both similarity AND smart selection:
        
        1. First, do similarity search to get candidates
        2. Then, use AI to filter/reorder based on metadata understanding
        
        This combines the best of both worlds:
        - Similarity search finds semantically relevant content
        - AI selection filters by document structure and context
        """
        debug_info = {
            "method": "hybrid_smart" if use_smart_selection else "similarity_only"
        }
        
        # Step 1: Similarity search for candidates
        similarity_results = self.hybrid_search(
            query=query,
            user_email=user_email,
            limit=candidates
        )
        debug_info["similarity_candidates"] = len(similarity_results)
        
        if not similarity_results:
            return [], debug_info
        
        if not use_smart_selection:
            return similarity_results[:final_chunks], debug_info
        
        # Step 2: Build summaries from similarity results
        summaries = []
        for i, r in enumerate(similarity_results):
            metadata = r.get("metadata", {}) or {}
            content_preview = r["content"][:200].strip()
            if len(r["content"]) > 200:
                content_preview += "..."
            
            summaries.append({
                "id": r.get("id") or f"sim_{i}",
                "original_index": i,
                "document_id": r["document_id"],
                "document_name": r.get("document_name", "Unknown"),
                "chunk_index": r.get("chunk_index", 0),
                "chapter": metadata.get("chapter_number") or metadata.get("chapter_title"),
                "section": metadata.get("section_header"),
                "position_percent": metadata.get("position_percent", 0),
                "similarity_score": r.get("similarity") or r.get("combined_score", 0),
                "content_preview": content_preview
            })
        
        # Step 3: AI selects best chunks
        selected_ids = self.ai_select_relevant_chunks(
            query=query,
            chunk_summaries=summaries,
            max_chunks=final_chunks
        )
        debug_info["ai_selected"] = len(selected_ids)
        
        # Map selected IDs back to original results
        id_to_index = {s["id"]: s["original_index"] for s in summaries}
        selected_results = []
        for sel_id in selected_ids:
            if sel_id in id_to_index:
                selected_results.append(similarity_results[id_to_index[sel_id]])
        
        return selected_results if selected_results else similarity_results[:final_chunks], debug_info


    # ==================== ITERATIVE PROCESSING FOR LARGE DOCUMENTS ====================
    
    def get_document_stats(
        self,
        user_email: str,
        document_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Get statistics about document(s) to determine processing strategy.
        
        Returns:
            Dict with total_chars, total_chunks, estimated_tokens, recommended_approach
        """
        all_chunks = self.get_all_document_chunks(user_email, document_ids)
        
        total_chars = sum(len(chunk.get("content", "")) for chunk in all_chunks)
        total_chunks = len(all_chunks)
        estimated_tokens = total_chars // 4  # rough estimate
        
        # Recommend approach based on size
        # Modern models support large contexts: Claude 200K, Gemini 1M, GPT-4o 128K
        # DISABLED iterative mode - always use "full" to avoid hangs
        # Iterative mode was causing performance issues with many batches
        approach = "full"  # Always use full mode, let adaptive_context_compression handle truncation
        
        return {
            "total_chars": total_chars,
            "total_chunks": total_chunks,
            "estimated_tokens": estimated_tokens,
            "recommended_approach": approach
        }
    
    def build_iterative_summary_context(
        self,
        user_email: str,
        document_ids: List[str],
        batch_size_chars: int = 20000,
        batch_number: int = 0
    ) -> Tuple[str, List[Dict], Dict]:
        """
        Build context for ONE batch of a large document for iterative processing.
        
        Args:
            user_email: User email
            document_ids: Document IDs to process
            batch_size_chars: Characters per batch
            batch_number: Which batch to return (0-indexed)
        
        Returns:
            Tuple of (batch_context, sources, debug_info)
        """
        all_chunks = self.get_all_document_chunks(user_email, document_ids)
        
        if not all_chunks:
            return "", [], {"error": "No chunks found"}
        
        # Calculate batch boundaries
        total_chars = sum(len(chunk.get("content", "")) for chunk in all_chunks)
        num_batches = (total_chars // batch_size_chars) + (1 if total_chars % batch_size_chars else 0)
        
        if batch_number >= num_batches:
            return "", [], {"error": f"Batch {batch_number} out of range (total: {num_batches})"}
        
        # Collect chunks for this batch
        current_chars = 0
        batch_start_char = batch_number * batch_size_chars
        batch_end_char = (batch_number + 1) * batch_size_chars
        
        batch_chunks = []
        char_counter = 0
        
        for chunk in all_chunks:
            chunk_len = len(chunk.get("content", ""))
            chunk_end = char_counter + chunk_len
            
            # Check if this chunk overlaps with our batch
            if chunk_end > batch_start_char and char_counter < batch_end_char:
                batch_chunks.append(chunk)
            
            char_counter = chunk_end
            
            if char_counter >= batch_end_char:
                break
        
        # Build context from batch chunks
        context_parts = []
        sources = []
        
        for i, chunk in enumerate(batch_chunks):
            content = chunk.get("content", "")
            context_parts.append(content)
            sources.append({
                "index": i + 1,
                "document_id": chunk.get("document_id"),
                "document_name": chunk.get("document_name"),
                "chunk_index": chunk.get("chunk_index"),
                "batch_number": batch_number
            })
        
        context = "\n\n".join(context_parts)
        
        # Add batch header
        header = f"""📦 BATCH {batch_number + 1} of {num_batches}
Content range: ~{batch_start_char:,} to ~{batch_end_char:,} characters

---

"""
        context = header + context
        
        debug_info = {
            "mode": "iterative_batch",
            "batch_number": batch_number,
            "total_batches": num_batches,
            "batch_size_chars": batch_size_chars,
            "chunks_in_batch": len(batch_chunks),
            "context_chars": len(context),
            "estimated_tokens": len(context) // 4
        }
        
        return context, sources, debug_info
    
    def build_synthesis_context(
        self,
        user_email: str,
        document_ids: List[str],
        batch_summaries: List[str],
        batch_sources: List[List[Dict]],
        batch_debugs: List[Dict],
        task: str = "summarize"
    ) -> Tuple[str, List[Dict], Dict]:
        """
        Synthesize final answer from multiple batch summaries.
        
        Args:
            user_email: User email
            document_ids: Document IDs
            batch_summaries: List of summaries from each batch
            batch_sources: List of sources from each batch
            batch_debugs: List of debug info from each batch
            task: Task type (summarize, analyze, etc.)
        
        Returns:
            Tuple of (final_context, combined_sources, debug_info)
        """
        # Combine all summaries
        combined_summary = "\n\n=== BATCH SEPARATOR ===\n\n".join(batch_summaries)
        
        # Build synthesis instructions
        synthesis_instructions = {
            "summarize": "📝 Объедини следующие summary из разных частей документа в один связный summary всего документа.",
            "analyze": "🔍 Проведи общий анализ документа на основе анализов его частей ниже.",
            "find_loopholes": "⚖️ Объедини найденные лазейки из разных частей документа.",
            "find_contradictions": "⚡ Объедини найденные противоречия из всего документа.",
        }.get(task, "📄 Объедини информацию из следующих частей документа:")
        
        context = f"""{synthesis_instructions}

---

{combined_summary}

---

📊 ФИНАЛЬНЫЙ СИНТЕЗ:
Теперь дай итоговый ответ, объединяющий всю информацию выше."""
        
        # Combine all sources
        combined_sources = []
        for batch_idx, sources in enumerate(batch_sources):
            if not isinstance(sources, list):
                # Handle case where sources is not a list
                continue
            for source in sources:
                if isinstance(source, dict):
                    source["batch_number"] = batch_idx
                    combined_sources.append(source)
                # Skip non-dict sources
        
        debug_info = {
            "mode": "synthesis",
            "num_batches": len(batch_summaries),
            "total_sources": len(combined_sources),
            "synthesis_chars": len(context),
            "estimated_tokens": len(context) // 4,
            "batch_debugs": batch_debugs
        }
        
        return context, combined_sources, debug_info
    
    def adaptive_context_compression(
        self,
        context: str,
        max_tokens: int,
        model_name: str = "gpt-4"
    ) -> str:
        """
        Адаптивное сжатие контекста если он не помещается в лимит.
        
        Args:
            context: Исходный контекст
            max_tokens: Максимальное количество токенов ДЛЯ RAG (уже учтены история, completion и т.д.)
            model_name: Название модели (для логирования)
        
        Returns:
            Сжатый контекст
        """
        # max_tokens уже учитывает историю и другие расходы - используем напрямую
        # Добавляем небольшой буфер безопасности (10%)
        safety_margin = 0.9
        available_tokens = int(max_tokens * safety_margin)
        
        current_tokens = len(context) // 4  # грубая оценка (1 token ≈ 4 chars)
        
        logger.info(f"[RAG] Compression check for '{model_name}': context={current_tokens:,} tokens, budget={max_tokens:,}, available={available_tokens:,}")
        
        if current_tokens <= available_tokens:
            logger.info(f"[RAG] Context fits in budget ({current_tokens:,} <= {available_tokens:,}) - no compression needed")
            return context  # помещается, ничего не делаем
        
        # Нужно сжатие
        logger.warning(f"[RAG] Context too large: {current_tokens:,} tokens > {available_tokens:,} available. Compressing...")
        
        # Стратегия сжатия: обрезаем до лимита, оставляя начало и конец
        target_chars = available_tokens * 4
        
        if len(context) <= target_chars:
            return context
        
        # Берем 60% с начала, 40% с конца (чтобы сохранить контекст и выводы)
        start_chars = int(target_chars * 0.6)
        end_chars = int(target_chars * 0.4)
        
        compressed = context[:start_chars] + "\n\n... [СРЕДНЯЯ ЧАСТЬ УДАЛЕНА ДЛЯ СООТВЕТСТВИЯ ЛИМИТУ ТОКЕНОВ] ...\n\n" + context[-end_chars:]
        
        logger.info(f"[RAG] Context compressed: {len(context):,} -> {len(compressed):,} chars ({current_tokens:,} -> {len(compressed)//4:,} tokens)")
        
        return compressed

    # ==================== META LAYER METHODS ====================
    
    def get_document_meta(self, document_id: str, user_email: str) -> Optional[Dict]:
        """
        Get document metadata from meta layer.
        Returns structure info, chapter list, summaries without loading chunks.
        """
        try:
            result = self.client.table("document_meta")\
                .select("*")\
                .eq("document_id", document_id)\
                .single()\
                .execute()
            
            return result.data
        except Exception as e:
            logger.debug(f"[META] No meta found for document {document_id}: {e}")
            return None
    
    def build_document_meta(self, document_id: str, user_email: str) -> Dict:
        """
        Build and store document metadata (structure, chapters, basic stats).
        Called after document processing to populate meta layer.
        """
        user_id = self._get_user_id(user_email)
        
        # Get document info
        doc = self.get_document(document_id, user_email)
        if not doc:
            return {"error": "Document not found"}
        
        # Get chapters
        chapters = self.get_document_chapters(user_email, document_id)
        
        # Get all chunks for stats
        all_chunks = self.get_all_document_chunks(user_email, [document_id])
        
        total_chars = sum(len(c.get("content", "")) for c in all_chunks)
        
        # Detect document type based on content patterns
        doc_type = self._detect_document_type(all_chunks[:10])  # Check first 10 chunks
        
        # Detect language
        language = self._detect_language(all_chunks[:5])
        
        # Build chapter list with structure
        chapter_list = []
        for ch in chapters:
            chapter_list.append({
                "number": ch.get("chapter_number"),
                "title": ch.get("title", ""),
                "start_chunk": ch.get("start_chunk", 0),
                "end_chunk": ch.get("end_chunk", 0),
                "preview": ch.get("preview", "")[:100]
            })
        
        meta_data = {
            "document_id": document_id,
            "user_id": user_id,
            "total_chapters": len(chapters),
            "chapter_list": chapter_list,
            "total_chunks": len(all_chunks),
            "total_chars": total_chars,
            "document_type": doc_type,
            "language": language,
            "meta_status": "ready"
        }
        
        # Upsert to database
        try:
            self.client.table("document_meta")\
                .upsert(meta_data, on_conflict="document_id")\
                .execute()
            
            logger.info(f"[META] Built meta for document {document_id}: {len(chapters)} chapters, {len(all_chunks)} chunks")
            return meta_data
            
        except Exception as e:
            logger.error(f"[META] Failed to save meta: {e}")
            return {"error": str(e)}
    
    def get_quick_answer(self, document_id: str, user_email: str, question: str) -> Optional[str]:
        """
        Try to answer a question from meta layer without loading chunks.
        Handles questions like "how many chapters?", "what's this about?", etc.
        """
        meta = self.get_document_meta(document_id, user_email)
        
        # If no meta exists, try to build it
        if not meta:
            meta = self.build_document_meta(document_id, user_email)
            if "error" in meta:
                return None
        
        question_lower = question.lower()
        
        # Chapter count questions
        if any(p in question_lower for p in ['сколько глав', 'количество глав', 'how many chapters', 'chapter count']):
            total = meta.get("total_chapters", 0)
            chapters = meta.get("chapter_list", [])
            
            if total > 0:
                chapter_nums = [str(ch.get("number", "?")) for ch in chapters[:10]]
                preview = ", ".join(chapter_nums)
                if len(chapters) > 10:
                    preview += f" ... (и ещё {len(chapters) - 10})"
                
                return f"""📚 **Структура документа:**

• Всего глав: **{total}**
• Номера глав: {preview}
• Всего чанков: {meta.get('total_chunks', 0)}
• Тип документа: {meta.get('document_type', 'неизвестно')}

_Эта информация из мета-слоя документа._"""
            
        # Document structure questions
        if any(p in question_lower for p in ['структура', 'оглавление', 'содержание', 'structure', 'table of contents', 'toc']):
            chapters = meta.get("chapter_list", [])
            if chapters:
                toc_lines = []
                for ch in chapters[:20]:  # Show first 20 chapters
                    title = ch.get("title", "")
                    num = ch.get("number", "?")
                    toc_lines.append(f"  • Глава {num}: {title}" if title else f"  • Глава {num}")
                
                toc_text = "\n".join(toc_lines)
                if len(chapters) > 20:
                    toc_text += f"\n  ... и ещё {len(chapters) - 20} глав"
                
                return f"""📖 **Оглавление документа:**

{toc_text}

_Всего глав: {meta.get('total_chapters', 0)}_"""
        
        # Document stats questions
        if any(p in question_lower for p in ['размер', 'объём', 'сколько текста', 'size', 'how long', 'length']):
            return f"""📊 **Статистика документа:**

• Глав: {meta.get('total_chapters', 0)}
• Чанков: {meta.get('total_chunks', 0)}  
• Символов: {meta.get('total_chars', 0):,}
• Примерно слов: ~{meta.get('total_chars', 0) // 6:,}
• Примерно токенов: ~{meta.get('total_chars', 0) // 4:,}
• Тип: {meta.get('document_type', 'неизвестно')}
• Язык: {meta.get('language', 'неизвестно')}"""
        
        return None  # Question not answerable from meta
    
    def _detect_document_type(self, sample_chunks: List[Dict]) -> str:
        """Detect document type from content patterns."""
        if not sample_chunks:
            return "unknown"
        
        combined = " ".join(c.get("content", "")[:500] for c in sample_chunks).lower()
        
        # Legal document patterns
        if any(p in combined for p in ['статья', 'article', 'п.', 'пункт', 'подпункт', 'кодекс', 'закон', 'федеральный']):
            return "legal"
        
        # Book patterns
        if any(p in combined for p in ['глава', 'chapter', 'часть', 'том', 'книга']):
            return "book"
        
        # Technical/code
        if any(p in combined for p in ['function', 'class', 'import', 'def ', 'return', 'const ', 'var ']):
            return "code"
        
        # Academic
        if any(p in combined for p in ['abstract', 'introduction', 'methodology', 'conclusion', 'references', 'аннотация']):
            return "academic"
        
        return "document"
    
    def _detect_language(self, sample_chunks: List[Dict]) -> str:
        """Detect primary language of document."""
        if not sample_chunks:
            return "unknown"
        
        combined = " ".join(c.get("content", "")[:200] for c in sample_chunks)
        
        # Count Cyrillic vs Latin characters
        cyrillic = sum(1 for c in combined if '\u0400' <= c <= '\u04FF')
        latin = sum(1 for c in combined if 'a' <= c.lower() <= 'z')
        
        if cyrillic > latin * 2:
            return "ru"
        elif latin > cyrillic * 2:
            return "en"
        elif cyrillic > 0 and latin > 0:
            return "mixed"
        
        return "unknown"


# ==================== SINGLETON ====================

_rag_store_instance: Optional[RAGStore] = None


def get_rag_store() -> RAGStore:
    """Get or create RAG store singleton"""
    global _rag_store_instance
    if _rag_store_instance is None:
        _rag_store_instance = RAGStore()
    return _rag_store_instance
