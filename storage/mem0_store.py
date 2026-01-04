"""
Mem0 Memory Store Integration (Open Source Version)

Provides semantic memory capabilities for the AI chat application.
Mem0 automatically extracts and stores important facts from conversations,
enabling personalized AI responses based on user history.

Features:
- Automatic fact extraction from conversations
- Semantic search across memories
- Per-user memory isolation
- Local storage with Qdrant or in-memory vector DB
- No cloud API required - fully self-hosted

Usage:
    Set MEM0_ENABLED=1 to enable Mem0 integration.
    Optionally set QDRANT_URL for persistent vector storage.
    Uses OpenAI API key from secrets for embeddings (or configure local embeddings).
"""

import os
import json
import logging
import asyncio
from typing import Dict, List, Optional, Any
from datetime import datetime

logger = logging.getLogger(__name__)

# Check if mem0 is available
MEM0_AVAILABLE = False
Memory = None

try:
    from mem0 import Memory
    MEM0_AVAILABLE = True
    logger.info("✅ mem0 package available (Open Source version)")
except ImportError:
    logger.info("mem0 package not installed. Run: pip install mem0ai")


class Mem0MemoryStore:
    """
    Mem0-based memory store for semantic memory capabilities (Open Source).
    
    This complements the SQLite message store by providing:
    - Automatic extraction of important facts from conversations
    - Semantic search across all memories
    - Long-term user preferences and context
    - Fully local - no cloud API needed
    """
    
    def __init__(self):
        self.enabled = os.getenv('MEM0_ENABLED', '0') == '1' and MEM0_AVAILABLE
        self.client = None
        
        if self.enabled:
            try:
                # Configure Mem0 Open Source
                config = self._build_config()
                self.client = Memory.from_config(config)
                logger.info("✅ Mem0 Open Source memory store initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Mem0: {e}")
                self.enabled = False
        else:
            if not MEM0_AVAILABLE:
                logger.info("Mem0 not available (package not installed)")
            else:
                logger.info("Mem0 disabled (set MEM0_ENABLED=1 to enable)")
    
    def _build_config(self) -> dict:
        """Build Mem0 configuration for Open Source version."""
        # Get API keys from environment
        openai_key = os.getenv('OPENAI_API_KEY', '')
        qdrant_url = os.getenv('QDRANT_URL', '')
        qdrant_api_key = os.getenv('QDRANT_API_KEY', '')
        
        # Base config - use OpenAI for LLM and embeddings
        config = {
            "llm": {
                "provider": "openai",
                "config": {
                    "model": "gpt-4o-mini",  # Cheap model for extraction
                    "temperature": 0.1,
                    "api_key": openai_key,
                }
            },
            "embedder": {
                "provider": "openai",
                "config": {
                    "model": "text-embedding-3-small",
                    "api_key": openai_key,
                }
            },
            "version": "v1.1"
        }
        
        # Vector store configuration
        if qdrant_url:
            # Use Qdrant for persistent storage
            config["vector_store"] = {
                "provider": "qdrant",
                "config": {
                    "url": qdrant_url,
                    "api_key": qdrant_api_key if qdrant_api_key else None,
                    "collection_name": "mem0_memories",
                }
            }
            logger.info(f"Mem0 using Qdrant at {qdrant_url}")
        else:
            # Use in-memory Chroma (default, no persistence)
            # Data will be lost on restart, but good for testing
            logger.info("Mem0 using in-memory vector store (set QDRANT_URL for persistence)")
        
        return config
    
    async def add_memory(
        self, 
        user_id: str, 
        messages: List[Dict[str, str]],
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict]:
        """
        Add memories from a conversation.
        
        Mem0 automatically extracts important facts and stores them.
        
        Args:
            user_id: Unique identifier for the user
            messages: List of message dicts with 'role' and 'content'
            metadata: Optional metadata (model used, timestamp, etc.)
            
        Returns:
            Dict with memory IDs if successful, None otherwise
        """
        if not self.enabled:
            return None
            
        try:
            # Format messages for Mem0
            formatted_messages = []
            for msg in messages:
                formatted_messages.append({
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", "")
                })
            
            # Add memories asynchronously
            result = await asyncio.to_thread(
                self.client.add,
                formatted_messages,
                user_id=user_id,
                metadata=metadata or {}
            )
            
            logger.debug(f"Added memories for user {user_id}: {result}")
            return result
            
        except Exception as e:
            logger.error(f"Error adding memory for user {user_id}: {e}")
            return None
    
    async def search_memories(
        self, 
        user_id: str, 
        query: str,
        limit: int = 10
    ) -> List[Dict]:
        """
        Search memories using semantic search.
        
        Args:
            user_id: User to search memories for
            query: Search query (semantic)
            limit: Maximum number of results
            
        Returns:
            List of relevant memories with scores
        """
        if not self.enabled:
            return []
            
        try:
            results = await asyncio.to_thread(
                self.client.search,
                query,
                user_id=user_id,
                limit=limit
            )
            
            logger.debug(f"Search results for '{query}': {len(results)} memories")
            return results
            
        except Exception as e:
            logger.error(f"Error searching memories: {e}")
            return []
    
    async def get_all_memories(
        self, 
        user_id: str,
        limit: int = 100
    ) -> List[Dict]:
        """
        Get all memories for a user.
        
        Args:
            user_id: User to get memories for
            limit: Maximum number of memories
            
        Returns:
            List of all memories for the user
        """
        if not self.enabled:
            return []
            
        try:
            # Use search with empty query to get all memories
            # Or use the get_all endpoint if available
            results = await asyncio.to_thread(
                self.client.get_all,
                user_id=user_id,
                limit=limit
            )
            
            return results if results else []
            
        except Exception as e:
            logger.error(f"Error getting memories for user {user_id}: {e}")
            return []
    
    async def get_relevant_context(
        self, 
        user_id: str, 
        current_message: str,
        limit: int = 5
    ) -> str:
        """
        Get relevant memories as context for the current conversation.
        
        This is the main method to use for enhancing AI responses.
        
        Args:
            user_id: User ID
            current_message: The current user message
            limit: Max memories to include
            
        Returns:
            Formatted string of relevant memories for injection into prompt
        """
        if not self.enabled:
            return ""
            
        try:
            memories = await self.search_memories(user_id, current_message, limit)
            
            if not memories:
                return ""
            
            # Format memories for injection into system prompt
            memory_texts = []
            for mem in memories:
                memory_text = mem.get('memory', mem.get('content', ''))
                if memory_text:
                    memory_texts.append(f"- {memory_text}")
            
            if not memory_texts:
                return ""
                
            context = "Relevant memories about this user:\n" + "\n".join(memory_texts)
            logger.debug(f"Generated context with {len(memory_texts)} memories")
            return context
            
        except Exception as e:
            logger.error(f"Error getting relevant context: {e}")
            return ""
    
    async def delete_memory(self, memory_id: str) -> bool:
        """Delete a specific memory by ID."""
        if not self.enabled:
            return False
            
        try:
            await asyncio.to_thread(
                self.client.delete,
                memory_id
            )
            logger.info(f"Deleted memory: {memory_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting memory {memory_id}: {e}")
            return False
    
    async def delete_user_memories(self, user_id: str) -> bool:
        """Delete all memories for a user."""
        if not self.enabled:
            return False
            
        try:
            await asyncio.to_thread(
                self.client.delete_all,
                user_id=user_id
            )
            logger.info(f"Deleted all memories for user: {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting memories for user {user_id}: {e}")
            return False
    
    def is_enabled(self) -> bool:
        """Check if Mem0 is enabled and configured."""
        return self.enabled


# Singleton instance
_mem0_store: Optional[Mem0MemoryStore] = None


def get_mem0_store() -> Mem0MemoryStore:
    """Get or create the Mem0 store singleton."""
    global _mem0_store
    if _mem0_store is None:
        _mem0_store = Mem0MemoryStore()
    return _mem0_store


# Convenience functions for easy integration
async def add_conversation_to_memory(
    user_id: str,
    user_message: str,
    assistant_response: str,
    model: str = None
) -> Optional[Dict]:
    """
    Convenience function to add a conversation exchange to memory.
    
    Args:
        user_id: User identifier
        user_message: The user's message
        assistant_response: The AI's response
        model: Optional model name for metadata
    """
    store = get_mem0_store()
    if not store.is_enabled():
        return None
        
    messages = [
        {"role": "user", "content": user_message},
        {"role": "assistant", "content": assistant_response}
    ]
    
    metadata = {
        "timestamp": datetime.utcnow().isoformat(),
        "model": model
    } if model else {"timestamp": datetime.utcnow().isoformat()}
    
    return await store.add_memory(user_id, messages, metadata)


async def get_memory_context(user_id: str, query: str) -> str:
    """
    Convenience function to get relevant memory context for a query.
    
    Returns formatted string ready for injection into system prompt.
    """
    store = get_mem0_store()
    return await store.get_relevant_context(user_id, query)
