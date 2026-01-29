"""
Conversation RAG Store
======================
Handles:
1. Conversation-scoped documents (files attached to specific chats)
2. Chat history indexing and semantic search
3. Unified RAG search across documents + history

This module treats chat history as a first-class knowledge source,
enabling semantic search over past conversations.

Architecture:
- Documents belong to conversations (not global)
- Chat history is chunked and indexed like documents
- Unified search across both sources
"""

import os
import re
import hashlib
import logging
import asyncio
from typing import List, Optional, Dict, Any, Tuple, Union
from uuid import uuid4
from datetime import datetime
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)

# OpenAI embeddings configuration
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536

# Try OpenAI for embeddings
try:
    from openai import AsyncOpenAI
    OPENAI_AVAILABLE = True
    logger.info("[ConversationRAG] OpenAI embeddings configured (text-embedding-3-small)")
except ImportError:
    OPENAI_AVAILABLE = False
    logger.warning("[ConversationRAG] OpenAI not installed, embeddings disabled")


class ChunkType(Enum):
    """Type of chunk - either from chat message or document"""
    MESSAGE = "message"      # Chat history message
    DOCUMENT = "document"    # Uploaded file/document


@dataclass
class ConversationDocument:
    """
    A document attached to a specific conversation.
    Documents belong to chats, not users globally.
    """
    id: str
    conversation_id: str
    user_id: Optional[str]
    filename: str
    content_type: str  # 'text/plain', 'application/pdf', etc.
    file_size: int
    content_hash: str  # SHA256 of content for deduplication
    status: str = "pending"  # 'pending', 'processing', 'indexed', 'error'
    error_message: Optional[str] = None
    chunks_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "user_id": self.user_id,
            "filename": self.filename,
            "content_type": self.content_type,
            "file_size": self.file_size,
            "content_hash": self.content_hash,
            "status": self.status,
            "error_message": self.error_message,
            "chunks_count": self.chunks_count,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }


@dataclass
class ConversationChunk:
    """
    Unified chunk - can be from chat message OR document.
    Both are treated the same way for RAG.
    """
    id: str
    conversation_id: str
    chunk_type: ChunkType  # MESSAGE or DOCUMENT
    chunk_index: int
    content: str
    
    # For MESSAGE chunks
    message_id: Optional[str] = None
    role: Optional[str] = None  # 'user', 'assistant', 'system'
    
    # For DOCUMENT chunks  
    document_id: Optional[str] = None
    filename: Optional[str] = None
    
    # Common fields
    embedding: Optional[List[float]] = None
    tokens_count: Optional[int] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "chunk_type": self.chunk_type.value,
            "chunk_index": self.chunk_index,
            "content": self.content,
            "message_id": self.message_id,
            "role": self.role,
            "document_id": self.document_id,
            "filename": self.filename,
            "tokens_count": self.tokens_count,
            "metadata": self.metadata,
            "created_at": self.created_at
        }
    
    @property
    def source_label(self) -> str:
        """Human-readable source label"""
        if self.chunk_type == ChunkType.MESSAGE:
            return f"[{self.role.title()}]" if self.role else "[Message]"
        else:
            return f"[Doc: {self.filename}]" if self.filename else "[Document]"


@dataclass 
class ConversationSearchResult:
    """Search result - unified for both messages and documents"""
    chunk: ConversationChunk
    similarity: float
    
    def to_dict(self) -> Dict:
        return {
            "chunk": self.chunk.to_dict(),
            "similarity": self.similarity,
            "source_type": self.chunk.chunk_type.value
        }


class UnifiedChunker:
    """
    Unified chunker for both chat messages and documents.
    
    Treats all content the same way:
    - Keep short content intact
    - Split long content at sentence boundaries
    - Add source context prefix to each chunk
    """
    
    def __init__(
        self,
        chunk_size: int = 500,
        chunk_overlap: int = 50,
        min_chunk_size: int = 50
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.min_chunk_size = min_chunk_size
    
    def chunk_message(
        self,
        message_id: str,
        conversation_id: str,
        role: str,
        content: str,
        timestamp: Optional[str] = None,
        model: Optional[str] = None
    ) -> List[ConversationChunk]:
        """
        Split a chat message into chunks.
        """
        content = content.strip()
        if not content:
            return []
        
        metadata = {
            "timestamp": timestamp or datetime.now().isoformat(),
            "model": model,
            "original_length": len(content),
            "source": "message"
        }
        
        prefix = self._get_role_prefix(role)
        raw_chunks = self._split_content(content)
        
        chunks = []
        for i, chunk_content in enumerate(raw_chunks):
            chunk = ConversationChunk(
                id=f"msg_{message_id}_{i}",
                conversation_id=conversation_id,
                chunk_type=ChunkType.MESSAGE,
                chunk_index=i,
                content=f"{prefix}{chunk_content}",
                message_id=message_id,
                role=role,
                metadata=metadata
            )
            chunks.append(chunk)
        
        return chunks
    
    def chunk_document(
        self,
        document_id: str,
        conversation_id: str,
        filename: str,
        content: str,
        content_type: Optional[str] = None
    ) -> List[ConversationChunk]:
        """
        Split a document into chunks.
        Documents are treated the same as messages, just with different metadata.
        """
        content = content.strip()
        if not content:
            return []
        
        metadata = {
            "filename": filename,
            "content_type": content_type,
            "original_length": len(content),
            "source": "document"
        }
        
        prefix = f"[Document: {filename}] "
        raw_chunks = self._split_content(content)
        
        chunks = []
        for i, chunk_content in enumerate(raw_chunks):
            chunk = ConversationChunk(
                id=f"doc_{document_id}_{i}",
                conversation_id=conversation_id,
                chunk_type=ChunkType.DOCUMENT,
                chunk_index=i,
                content=f"{prefix}{chunk_content}",
                document_id=document_id,
                filename=filename,
                metadata=metadata
            )
            chunks.append(chunk)
        
        return chunks
    
    def _split_content(self, content: str) -> List[str]:
        """Split content into chunks - same logic for messages and documents"""
        if len(content) <= self.chunk_size:
            return [content]
        
        sentences = self._split_sentences(content)
        chunks = []
        current_chunk = ""
        
        for sentence in sentences:
            if len(current_chunk) + len(sentence) > self.chunk_size and current_chunk:
                chunks.append(current_chunk.strip())
                # Overlap: keep end of previous chunk
                overlap_start = max(0, len(current_chunk) - self.chunk_overlap)
                current_chunk = current_chunk[overlap_start:] + sentence
            else:
                current_chunk += sentence
        
        # Last chunk
        if current_chunk.strip() and len(current_chunk.strip()) >= self.min_chunk_size:
            chunks.append(current_chunk.strip())
        
        return chunks if chunks else [content]
    
    def _get_role_prefix(self, role: str) -> str:
        """Get prefix for chat message role"""
        prefixes = {
            "user": "[User]: ",
            "assistant": "[Assistant]: ",
            "system": "[System]: "
        }
        return prefixes.get(role, "")
    
    def _split_sentences(self, text: str) -> List[str]:
        """Split text into sentences"""
        sentences = re.split(r'(?<=[.!?。！？])\s+', text)
        return [s + " " for s in sentences if s.strip()]


# Keep old name for backwards compatibility
ConversationHistoryChunker = UnifiedChunker


class ConversationRAGStore:
    """
    Main store for conversation-scoped RAG.
    
    Features:
    1. Index chat history as searchable chunks
    2. Search across conversation history semantically
    3. Combine with document search for unified RAG
    """
    
    def __init__(
        self,
        supabase_client=None,
        embedding_provider: str = "openai",  # "openai" or "local" - OpenAI by default
        openai_api_key: Optional[str] = None
    ):
        self.supabase = supabase_client
        self.embedding_provider = embedding_provider
        
        # Get API key from multiple sources
        api_key = openai_api_key or os.getenv("OPENAI_API_KEY")
        invalid_keys = ["your_openai_api_key_here", "your-openai-api-key", "sk-xxx", ""]
        
        logger.debug(f"[ConversationRAG] Initial API key from env: {api_key[:20] if api_key else 'None'}...")
        
        if not api_key or api_key in invalid_keys:
            # Try secrets.json
            try:
                from pathlib import Path
                import json
                secrets_path = Path(__file__).parent.parent / "data" / "secrets.json"
                logger.debug(f"[ConversationRAG] Looking for secrets at: {secrets_path}")
                if secrets_path.exists():
                    with open(secrets_path, 'r', encoding='utf-8') as f:
                        secrets = json.load(f)
                        secrets_key = secrets.get("apiKeys", {}).get("OPENAI_API_KEY", "")
                        if secrets_key and secrets_key not in invalid_keys:
                            api_key = secrets_key
                            logger.info(f"[ConversationRAG] Loaded OpenAI key from secrets.json")
                        else:
                            logger.warning(f"[ConversationRAG] secrets.json key is invalid or empty")
                else:
                    logger.warning(f"[ConversationRAG] secrets.json not found at {secrets_path}")
            except Exception as e:
                logger.error(f"[ConversationRAG] Failed to load secrets.json: {e}")
        
        self.openai_api_key = api_key
        self.chunker = ConversationHistoryChunker()
        
        # OpenAI client for embeddings
        self.openai_client = None
        if OPENAI_AVAILABLE and self.openai_api_key and self.openai_api_key not in invalid_keys and embedding_provider == "openai":
            self.openai_client = AsyncOpenAI(api_key=self.openai_api_key)
            logger.info(f"[ConversationRAG] OpenAI client initialized successfully")
    
    async def get_embedding(self, text: str) -> Optional[List[float]]:
        """Get embedding for text using OpenAI"""
        invalid_keys = ["your_openai_api_key_here", "your-openai-api-key", "sk-xxx", ""]
        
        if not self.openai_client:
            # Try to reload API key from secrets.json
            if not self.openai_api_key or self.openai_api_key in invalid_keys:
                try:
                    from pathlib import Path
                    import json
                    secrets_path = Path(__file__).parent.parent / "data" / "secrets.json"
                    if secrets_path.exists():
                        with open(secrets_path, 'r', encoding='utf-8') as f:
                            secrets = json.load(f)
                            secrets_key = secrets.get("apiKeys", {}).get("OPENAI_API_KEY", "")
                            if secrets_key and secrets_key not in invalid_keys:
                                self.openai_api_key = secrets_key
                                logger.info("[ConversationRAG] Reloaded OpenAI key from secrets.json in get_embedding")
                except Exception as e:
                    logger.warning(f"[ConversationRAG] Failed to reload secrets: {e}")
            
            # Try to initialize client
            if OPENAI_AVAILABLE and self.openai_api_key and self.openai_api_key not in invalid_keys:
                self.openai_client = AsyncOpenAI(api_key=self.openai_api_key)
                logger.info("[ConversationRAG] OpenAI client initialized in get_embedding")
            else:
                logger.warning("[ConversationRAG] OpenAI client not available - no valid API key")
                return None
        
        try:
            response = await self.openai_client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=text[:8000]  # Limit text length
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"[ConversationRAG] OpenAI embedding error: {e}")
            return None
    
    async def index_message(
        self,
        conversation_id: str,
        message_id: str,
        role: str,
        content: str,
        user_id: Optional[str] = None,
        timestamp: Optional[str] = None,
        model: Optional[str] = None
    ) -> List[ConversationChunk]:
        """
        Index a single message into conversation chunks.
        
        Args:
            conversation_id: Chat conversation ID
            message_id: Unique message ID
            role: 'user', 'assistant', or 'system'
            content: Message content
            user_id: Owner user ID (for RLS)
            timestamp: Message timestamp
            model: Model that generated response (for assistant messages)
        
        Returns:
            List of created chunks
        """
        # Create chunks
        chunks = self.chunker.chunk_message(
            message_id=message_id,
            conversation_id=conversation_id,
            role=role,
            content=content,
            timestamp=timestamp,
            model=model
        )
        
        if not chunks:
            return []
        
        # Generate embeddings
        for chunk in chunks:
            embedding = await self.get_embedding(chunk.content)
            chunk.embedding = embedding
            chunk.tokens_count = len(chunk.content.split())  # Approximate
        
        # Save to Supabase
        if self.supabase:
            await self._save_chunks_to_supabase(chunks, user_id)
        
        logger.info(f"[ConversationRAG] Indexed message {message_id}: {len(chunks)} chunks")
        return chunks
    
    async def _save_chunks_to_supabase(
        self, 
        chunks: List[ConversationChunk],
        user_id: Optional[str] = None
    ):
        """Save chunks to Supabase conversation_chunks table (unified for messages and docs)"""
        if not self.supabase:
            return
        
        # Ensure user exists in users table before inserting chunks with user_id
        if user_id:
            try:
                # Check if user exists
                user_check = self.supabase.table("users").select("id").eq("id", user_id).execute()
                if not user_check.data:
                    # Try to create user with a default email pattern
                    try:
                        # Create user record
                        self.supabase.table("users").insert({
                            "id": user_id,
                            "email": f"user_{user_id[:8]}@multech.local",  # Placeholder email
                            "display_name": f"User {user_id[:8]}",
                            "created_at": datetime.now().isoformat()
                        }).execute()
                        logger.info(f"[ConversationRAG] Created user record for {user_id}")
                    except Exception as create_err:
                        # If creation fails (maybe due to duplicate), check again
                        logger.warning(f"[ConversationRAG] Could not create user {user_id}: {create_err}")
                        # Re-check if user was created by another process
                        user_recheck = self.supabase.table("users").select("id").eq("id", user_id).execute()
                        if not user_recheck.data:
                            logger.warning(f"[ConversationRAG] User {user_id} still not found, saving chunks without user_id")
                            user_id = None
            except Exception as e:
                logger.warning(f"[ConversationRAG] Failed to check/create user: {e}, saving chunks without user_id")
                user_id = None
        
        for chunk in chunks:
            try:
                data = {
                    "id": chunk.id,
                    "conversation_id": chunk.conversation_id,
                    "chunk_type": chunk.chunk_type.value,
                    "chunk_index": chunk.chunk_index,
                    "content": chunk.content,
                    "tokens_count": chunk.tokens_count,
                    "metadata": chunk.metadata,
                    "created_at": chunk.created_at
                }
                
                # Message-specific fields
                if chunk.chunk_type == ChunkType.MESSAGE:
                    data["message_id"] = chunk.message_id
                    data["role"] = chunk.role
                
                # Document-specific fields
                if chunk.chunk_type == ChunkType.DOCUMENT:
                    data["document_id"] = chunk.document_id
                    data["filename"] = chunk.filename
                
                if user_id:
                    data["user_id"] = user_id
                
                if chunk.embedding:
                    data["embedding"] = chunk.embedding
                
                # Upsert to handle re-indexing
                self.supabase.table("conversation_chunks").upsert(
                    data,
                    on_conflict="id"
                ).execute()
                
            except Exception as e:
                logger.error(f"[ConversationRAG] Failed to save chunk {chunk.id}: {e}")
    
    # ==================== DOCUMENT METHODS ====================
    
    async def add_document(
        self,
        conversation_id: str,
        filename: str,
        content: str,
        user_id: Optional[str] = None,
        content_type: str = "text/plain",
        metadata: Optional[Dict] = None
    ) -> ConversationDocument:
        """
        Add a document to a conversation's knowledge base.
        
        Args:
            conversation_id: Chat to attach document to
            filename: Original filename
            content: Document text content
            user_id: Owner user ID
            content_type: MIME type
            metadata: Additional metadata
        
        Returns:
            Created ConversationDocument
        """
        document_id = str(uuid4())
        content_hash = hashlib.sha256(content.encode()).hexdigest()
        
        # Create document record
        document = ConversationDocument(
            id=document_id,
            conversation_id=conversation_id,
            user_id=user_id,
            filename=filename,
            content_type=content_type,
            file_size=len(content.encode()),
            content_hash=content_hash,
            status="processing",
            metadata=metadata or {}
        )
        
        # Save document to Supabase
        if self.supabase:
            try:
                self.supabase.table("conversation_documents").insert(
                    document.to_dict()
                ).execute()
            except Exception as e:
                logger.error(f"[ConversationRAG] Failed to save document: {e}")
                document.status = "error"
                document.error_message = str(e)
                return document
        
        # Index document into chunks
        try:
            chunks = await self.index_document(
                document_id=document_id,
                conversation_id=conversation_id,
                filename=filename,
                content=content,
                user_id=user_id,
                content_type=content_type
            )
            
            document.chunks_count = len(chunks)
            document.status = "indexed"
            
            # Update document status
            if self.supabase:
                self.supabase.table("conversation_documents").update({
                    "status": "indexed",
                    "chunks_count": len(chunks),
                    "updated_at": datetime.now().isoformat()
                }).eq("id", document_id).execute()
                
        except Exception as e:
            logger.error(f"[ConversationRAG] Failed to index document: {e}")
            document.status = "error"
            document.error_message = str(e)
            
            if self.supabase:
                self.supabase.table("conversation_documents").update({
                    "status": "error",
                    "error_message": str(e),
                    "updated_at": datetime.now().isoformat()
                }).eq("id", document_id).execute()
        
        logger.info(f"[ConversationRAG] Added document {filename} to conversation {conversation_id}")
        return document
    
    async def index_document(
        self,
        document_id: str,
        conversation_id: str,
        filename: str,
        content: str,
        user_id: Optional[str] = None,
        content_type: Optional[str] = None
    ) -> List[ConversationChunk]:
        """
        Index a document into chunks (same as messages).
        """
        # Create chunks using unified chunker
        chunks = self.chunker.chunk_document(
            document_id=document_id,
            conversation_id=conversation_id,
            filename=filename,
            content=content,
            content_type=content_type
        )
        
        if not chunks:
            return []
        
        # Generate embeddings (same as for messages)
        for chunk in chunks:
            embedding = await self.get_embedding(chunk.content)
            chunk.embedding = embedding
            chunk.tokens_count = len(chunk.content.split())
        
        # Save to Supabase (unified table)
        if self.supabase:
            await self._save_chunks_to_supabase(chunks, user_id)
        
        logger.info(f"[ConversationRAG] Indexed document {filename}: {len(chunks)} chunks")
        return chunks
    
    async def get_conversation_documents(
        self,
        conversation_id: str
    ) -> List[ConversationDocument]:
        """Get all documents attached to a conversation"""
        if not self.supabase:
            return []
        
        try:
            result = self.supabase.table("conversation_documents").select("*").eq(
                "conversation_id", conversation_id
            ).order("created_at", desc=False).execute()
            
            documents = []
            for row in result.data or []:
                doc = ConversationDocument(
                    id=row["id"],
                    conversation_id=row["conversation_id"],
                    user_id=row.get("user_id"),
                    filename=row["filename"],
                    content_type=row.get("content_type", "text/plain"),
                    file_size=row.get("file_size", 0),
                    content_hash=row.get("content_hash", ""),
                    status=row.get("status", "unknown"),
                    error_message=row.get("error_message"),
                    chunks_count=row.get("chunks_count", 0),
                    metadata=row.get("metadata", {}),
                    created_at=str(row.get("created_at", "")),
                    updated_at=str(row.get("updated_at", ""))
                )
                documents.append(doc)
            
            return documents
            
        except Exception as e:
            logger.error(f"[ConversationRAG] Failed to get documents: {e}")
            return []
    
    async def delete_document(
        self,
        document_id: str,
        conversation_id: str
    ) -> bool:
        """Delete a document and its chunks"""
        if not self.supabase:
            return False
        
        try:
            # Delete chunks first
            self.supabase.table("conversation_chunks").delete().eq(
                "document_id", document_id
            ).execute()
            
            # Delete document record
            self.supabase.table("conversation_documents").delete().eq(
                "id", document_id
            ).execute()
            
            logger.info(f"[ConversationRAG] Deleted document {document_id}")
            return True
            
        except Exception as e:
            logger.error(f"[ConversationRAG] Failed to delete document: {e}")
            return False
    
    # ==================== UNIFIED SEARCH ====================

    async def search_conversation(
        self,
        conversation_id: str,
        query: str,
        limit: int = 10,
        min_similarity: float = 0.5,
        chunk_types: Optional[List[ChunkType]] = None,  # Filter by type
        roles: Optional[List[str]] = None  # Filter by role (for messages)
    ) -> List[ConversationSearchResult]:
        """
        Unified search over conversation knowledge base (messages + documents).
        
        Args:
            conversation_id: Chat to search in
            query: Search query
            limit: Max results
            min_similarity: Minimum cosine similarity threshold
            chunk_types: Optional filter by ChunkType (MESSAGE, DOCUMENT)
            roles: Optional filter by roles for messages
        
        Returns:
            List of search results sorted by similarity
        """
        query_embedding = await self.get_embedding(query)
        if not query_embedding:
            logger.warning("[ConversationRAG] Failed to get query embedding")
            return []
        
        if not self.supabase:
            return []
        
        try:
            # Use unified search RPC
            result = self.supabase.rpc(
                "search_conversation_chunks",
                {
                    "p_conversation_id": conversation_id,
                    "p_query_embedding": query_embedding,
                    "p_limit": limit,
                    "p_min_similarity": min_similarity
                }
            ).execute()
            
            results = []
            for row in result.data or []:
                row_type = ChunkType(row.get("chunk_type", "message"))
                
                # Filter by chunk type
                if chunk_types and row_type not in chunk_types:
                    continue
                
                # Filter by role (only for messages)
                if roles and row_type == ChunkType.MESSAGE:
                    if row.get("role") not in roles:
                        continue
                
                chunk = ConversationChunk(
                    id=row["id"],
                    conversation_id=conversation_id,
                    chunk_type=row_type,
                    chunk_index=row["chunk_index"],
                    content=row["content"],
                    message_id=row.get("message_id"),
                    role=row.get("role"),
                    document_id=row.get("document_id"),
                    filename=row.get("filename"),
                    metadata=row.get("metadata", {}),
                    created_at=str(row.get("created_at", ""))
                )
                
                results.append(ConversationSearchResult(
                    chunk=chunk,
                    similarity=row["similarity"]
                ))
            
            return results
            
        except Exception as e:
            logger.error(f"[ConversationRAG] Search error: {e}")
            return []
    
    # Alias for backwards compatibility
    async def search_conversation_history(
        self,
        conversation_id: str,
        query: str,
        limit: int = 10,
        min_similarity: float = 0.5,
        roles: Optional[List[str]] = None
    ) -> List[ConversationSearchResult]:
        """Search only messages (backwards compatible)"""
        return await self.search_conversation(
            conversation_id=conversation_id,
            query=query,
            limit=limit,
            min_similarity=min_similarity,
            chunk_types=[ChunkType.MESSAGE],
            roles=roles
        )
    
    async def search_all_conversations(
        self,
        user_id: str,
        query: str,
        limit: int = 20,
        min_similarity: float = 0.5
    ) -> List[ConversationSearchResult]:
        """
        Search across ALL user's conversations.
        Useful for finding information from past chats.
        """
        query_embedding = await self.get_embedding(query)
        if not query_embedding or not self.supabase:
            return []
        
        try:
            # Custom query across all user's conversations
            result = self.supabase.rpc(
                "search_all_user_conversations",
                {
                    "p_user_id": user_id,
                    "p_query_embedding": query_embedding,
                    "p_limit": limit,
                    "p_min_similarity": min_similarity
                }
            ).execute()
            
            results = []
            for row in result.data or []:
                row_type = ChunkType(row.get("chunk_type", "message"))
                
                chunk = ConversationChunk(
                    id=row["id"],
                    conversation_id=row["conversation_id"],
                    chunk_type=row_type,
                    chunk_index=row["chunk_index"],
                    content=row["content"],
                    message_id=row.get("message_id"),
                    role=row.get("role"),
                    document_id=row.get("document_id"),
                    filename=row.get("filename"),
                    metadata=row.get("metadata", {}),
                    created_at=str(row.get("created_at", ""))
                )
                
                results.append(ConversationSearchResult(
                    chunk=chunk,
                    similarity=row["similarity"]
                ))
            
            return results
            
        except Exception as e:
            logger.error(f"[ConversationRAG] Search all conversations error: {e}")
            return []
    
    async def delete_conversation_chunks(self, conversation_id: str) -> bool:
        """Delete all chunks for a conversation"""
        if not self.supabase:
            return False
        
        try:
            self.supabase.table("conversation_chunks").delete().eq(
                "conversation_id", conversation_id
            ).execute()
            logger.info(f"[ConversationRAG] Deleted chunks for conversation {conversation_id}")
            return True
        except Exception as e:
            logger.error(f"[ConversationRAG] Delete error: {e}")
            return False
    
    async def get_conversation_stats(self, conversation_id: str) -> Dict[str, Any]:
        """Get indexing stats for a conversation (messages + documents)"""
        if not self.supabase:
            return {}
        
        try:
            result = self.supabase.table("conversation_chunks").select(
                "id, chunk_type, role"
            ).eq("conversation_id", conversation_id).execute()
            
            total_chunks = len(result.data or [])
            
            # Breakdown by type and role
            type_counts = {"message": 0, "document": 0}
            role_counts = {}
            
            for row in result.data or []:
                chunk_type = row.get("chunk_type", "message")
                type_counts[chunk_type] = type_counts.get(chunk_type, 0) + 1
                
                if chunk_type == "message":
                    role = row.get("role", "unknown")
                    role_counts[role] = role_counts.get(role, 0) + 1
            
            # Get document count
            doc_result = self.supabase.table("conversation_documents").select(
                "id", count="exact"
            ).eq("conversation_id", conversation_id).execute()
            
            return {
                "conversation_id": conversation_id,
                "total_chunks": total_chunks,
                "type_breakdown": type_counts,
                "role_breakdown": role_counts,
                "documents_count": doc_result.count or 0
            }
            
        except Exception as e:
            logger.error(f"[ConversationRAG] Stats error: {e}")
            return {}


class UnifiedRAGSearch:
    """
    Unified RAG search across conversation knowledge base.
    
    Since documents now belong to conversations, this class
    provides a simple interface to search_conversation() which
    already searches both messages AND documents.
    """
    
    def __init__(
        self,
        conversation_rag: ConversationRAGStore,
        supabase_client=None
    ):
        self.conversation_rag = conversation_rag
        self.supabase = supabase_client
    
    async def search(
        self,
        query: str,
        conversation_id: Optional[str] = None,
        user_id: Optional[str] = None,
        include_documents: bool = True,
        include_history: bool = True,
        limit: int = 10,
        min_similarity: float = 0.5
    ) -> Dict[str, Any]:
        """
        Unified search across conversation knowledge base.
        
        Args:
            query: Search query
            conversation_id: Current conversation (required for scoped search)
            user_id: User ID (for cross-conversation search)
            include_documents: Include document chunks
            include_history: Include message chunks
            limit: Max results
            min_similarity: Minimum similarity threshold
        
        Returns:
            {
                "messages": [...],       # Message results
                "documents": [...],      # Document results
                "combined": [...],       # Merged and ranked
                "stats": {...}
            }
        """
        results = {
            "messages": [],
            "documents": [],
            "combined": [],
            "stats": {
                "query": query,
                "conversation_id": conversation_id,
                "sources_searched": []
            }
        }
        
        # Determine which chunk types to search
        chunk_types = []
        if include_history:
            chunk_types.append(ChunkType.MESSAGE)
            results["stats"]["sources_searched"].append("messages")
        if include_documents:
            chunk_types.append(ChunkType.DOCUMENT)
            results["stats"]["sources_searched"].append("documents")
        
        if not chunk_types:
            return results
        
        # Single unified search
        if conversation_id:
            search_results = await self.conversation_rag.search_conversation(
                conversation_id=conversation_id,
                query=query,
                limit=limit * 2,  # Get more to split between types
                min_similarity=min_similarity,
                chunk_types=chunk_types if len(chunk_types) < 2 else None  # None = all
            )
        elif user_id:
            # Search across all user's conversations
            search_results = await self.conversation_rag.search_all_conversations(
                user_id=user_id,
                query=query,
                limit=limit * 2,
                min_similarity=min_similarity
            )
        else:
            search_results = []
        
        # Split results by type
        for r in search_results:
            r_dict = r.to_dict()
            if r.chunk.chunk_type == ChunkType.MESSAGE:
                results["messages"].append(r_dict)
            else:
                results["documents"].append(r_dict)
            results["combined"].append(r_dict)
        
        # Trim to limit
        results["messages"] = results["messages"][:limit]
        results["documents"] = results["documents"][:limit]
        results["combined"] = results["combined"][:limit]
        
        results["stats"]["total_results"] = len(results["combined"])
        results["stats"]["message_results"] = len(results["messages"])
        results["stats"]["document_results"] = len(results["documents"])
        
        return results
    
    def format_context_for_llm(
        self,
        search_results: Dict[str, Any],
        max_tokens: int = 4000
    ) -> str:
        """
        Format search results as context for LLM.
        
        Groups by source type for clarity.
        """
        parts = []
        current_tokens = 0
        
        # Documents first (usually more authoritative)
        if search_results.get("documents"):
            parts.append("=== From Documents ===")
            for r in search_results["documents"]:
                chunk = r["chunk"]
                text = f"\n[{chunk.get('filename', 'Document')}]:\n{chunk['content']}\n"
                est_tokens = len(text.split())
                if current_tokens + est_tokens > max_tokens:
                    break
                parts.append(text)
                current_tokens += est_tokens
        
        # Then messages
        if search_results.get("messages"):
            parts.append("\n=== From Chat History ===")
            for r in search_results["messages"]:
                chunk = r["chunk"]
                text = f"\n{chunk['content']}\n"
                est_tokens = len(text.split())
                if current_tokens + est_tokens > max_tokens:
                    break
                parts.append(text)
                current_tokens += est_tokens
        
        return "\n".join(parts)


# Singleton instance
_conversation_rag_store: Optional[ConversationRAGStore] = None
_unified_rag_search: Optional[UnifiedRAGSearch] = None


def get_conversation_rag_store(supabase_client=None) -> ConversationRAGStore:
    """Get or create the conversation RAG store singleton"""
    global _conversation_rag_store
    
    # Auto-initialize Supabase client if not provided
    if supabase_client is None:
        try:
            from supabase_client.client import get_supabase_service_client
            supabase_client = get_supabase_service_client()
            logger.info("[ConversationRAG] Auto-initialized Supabase client")
        except Exception as e:
            logger.warning(f"[ConversationRAG] Could not auto-init Supabase: {e}")
    
    if _conversation_rag_store is None:
        embedding_provider = os.getenv("EMBEDDING_PROVIDER", "openai")  # Default to OpenAI
        _conversation_rag_store = ConversationRAGStore(
            supabase_client=supabase_client,
            embedding_provider=embedding_provider
        )
        logger.info(f"[ConversationRAG] Store created, supabase={supabase_client is not None}")
    elif supabase_client and _conversation_rag_store.supabase is None:
        _conversation_rag_store.supabase = supabase_client
        logger.info("[ConversationRAG] Supabase client attached to existing store")
    
    return _conversation_rag_store


def get_unified_rag_search(
    conversation_rag: ConversationRAGStore = None,
    supabase_client=None
) -> UnifiedRAGSearch:
    """Get or create the unified RAG search singleton"""
    global _unified_rag_search
    
    if _unified_rag_search is None:
        conv_rag = conversation_rag or get_conversation_rag_store(supabase_client)
        _unified_rag_search = UnifiedRAGSearch(
            conversation_rag=conv_rag,
            supabase_client=supabase_client
        )
    
    return _unified_rag_search
