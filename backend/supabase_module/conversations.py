"""
Conversations CRUD operations for Supabase
Handles conversations and messages with full user isolation
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from uuid import uuid4
import logging

from .client import get_supabase_service_client, get_or_create_user, is_supabase_configured

logger = logging.getLogger(__name__)


class SupabaseConversationStore:
    """Supabase-backed conversation storage with full chat history support"""
    
    def __init__(self):
        self._client = None
        self._user_cache = {}  # Cache user_id by email
    
    @property
    def client(self):
        if self._client is None:
            self._client = get_supabase_service_client()
        return self._client
    
    def _get_user_id(self, user_email: str) -> str:
        """Get or create user and return user_id"""
        if user_email not in self._user_cache:
            user = get_or_create_user(user_email)
            self._user_cache[user_email] = user["id"]
        return self._user_cache[user_email]
    
    # ==================== CONVERSATIONS ====================
    
    def create_conversation(
        self,
        conversation_id: str,
        title: str = "New Conversation",
        user_email: str = None,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        system_prompt: Optional[str] = None,
        settings: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Create a new conversation"""
        user_id = self._get_user_id(user_email)
        
        data = {
            "id": conversation_id,
            "user_id": user_id,
            "title": title,
            "model": model,
            "provider": provider,
            "system_prompt": system_prompt,
            "settings": settings or {},
            "metadata": {}
        }
        
        result = self.client.table("conversations").insert(data).execute()
        logger.info(f"Created conversation: {conversation_id} for user {user_email}")
        return result.data[0] if result.data else data
    
    def get_conversation(self, conversation_id: str, user_email: str = None) -> Optional[Dict[str, Any]]:
        """Get a single conversation by ID"""
        user_id = self._get_user_id(user_email) if user_email else None
        
        query = self.client.table("conversations").select("*").eq("id", conversation_id)
        if user_id:
            query = query.eq("user_id", user_id)
        
        result = query.single().execute()
        return result.data if result.data else None
    
    def get_conversations(
        self,
        user_email: str = None,
        limit: int = 50,
        offset: int = 0,
        include_archived: bool = False
    ) -> List[Dict[str, Any]]:
        """Get list of all conversations for a user"""
        user_id = self._get_user_id(user_email)
        
        query = self.client.table("conversations")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("updated_at", desc=True)\
            .range(offset, offset + limit - 1)
        
        if not include_archived:
            query = query.eq("is_archived", False)
        
        result = query.execute()
        
        # Format for API compatibility
        conversations = []
        for conv in (result.data or []):
            conversations.append({
                "id": conv["id"],
                "title": conv["title"],
                "created_at": conv["created_at"],
                "updated_at": conv["updated_at"],
                "model": conv.get("model"),
                "provider": conv.get("provider"),
                "is_archived": conv.get("is_archived", False)
            })
        
        return conversations
    
    def update_conversation_title(
        self,
        conversation_id: str,
        title: str,
        user_email: str = None
    ) -> bool:
        """Update conversation title"""
        user_id = self._get_user_id(user_email) if user_email else None
        
        query = self.client.table("conversations")\
            .update({"title": title, "updated_at": datetime.utcnow().isoformat()})\
            .eq("id", conversation_id)
        
        if user_id:
            query = query.eq("user_id", user_id)
        
        result = query.execute()
        return len(result.data) > 0 if result.data else False
    
    def delete_conversation(self, conversation_id: str, user_email: str = None) -> bool:
        """Delete a conversation (cascades to messages)"""
        user_id = self._get_user_id(user_email) if user_email else None
        
        query = self.client.table("conversations").delete().eq("id", conversation_id)
        if user_id:
            query = query.eq("user_id", user_id)
        
        result = query.execute()
        logger.info(f"Deleted conversation: {conversation_id}")
        return len(result.data) > 0 if result.data else False
    
    def archive_conversation(self, conversation_id: str, user_email: str = None) -> bool:
        """Archive a conversation"""
        user_id = self._get_user_id(user_email) if user_email else None
        
        query = self.client.table("conversations")\
            .update({"is_archived": True})\
            .eq("id", conversation_id)
        
        if user_id:
            query = query.eq("user_id", user_id)
        
        result = query.execute()
        return len(result.data) > 0 if result.data else False
    
    # ==================== MESSAGES ====================
    
    def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        user_email: str = None,
        message_id: Optional[str] = None,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        reasoning_content: Optional[str] = None,
        tokens_input: Optional[int] = None,
        tokens_output: Optional[int] = None,
        tokens_reasoning: Optional[int] = None,
        latency_ms: Optional[int] = None,
        tool_calls: Optional[list] = None,
        tool_results: Optional[list] = None,
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Add a message to a conversation"""
        # Ensure conversation exists
        conv = self.get_conversation(conversation_id, user_email)
        if not conv:
            # Auto-create conversation if it doesn't exist
            self.create_conversation(conversation_id, "New Conversation", user_email)
        
        data = {
            "id": message_id or str(uuid4()),
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "model": model,
            "provider": provider,
            "reasoning_content": reasoning_content,
            "tokens_input": tokens_input,
            "tokens_output": tokens_output,
            "tokens_reasoning": tokens_reasoning,
            "latency_ms": latency_ms,
            "tool_calls": tool_calls,
            "tool_results": tool_results,
            "metadata": metadata or {}
        }
        
        result = self.client.table("messages").insert(data).execute()
        
        # Update conversation's updated_at
        self.client.table("conversations")\
            .update({"updated_at": datetime.utcnow().isoformat()})\
            .eq("id", conversation_id)\
            .execute()
        
        return result.data[0] if result.data else data
    
    def load_conversation_history(
        self,
        conversation_id: str,
        user_email: str = None,
        limit: int = 100
    ) -> List:
        """Load messages for a conversation - returns Message-like objects"""
        result = self.client.table("messages")\
            .select("*")\
            .eq("conversation_id", conversation_id)\
            .order("created_at", desc=False)\
            .limit(limit)\
            .execute()
        
        # Convert to Message-like objects for API compatibility
        from adapters import Message
        messages = []
        for msg in (result.data or []):
            meta = msg.get("metadata") or {}
            if msg.get("model"):
                meta["model"] = msg["model"]
            if msg.get("provider"):
                meta["provider"] = msg["provider"]
            if msg.get("reasoning_content"):
                meta["reasoning_content"] = msg["reasoning_content"]
            if msg.get("tokens_input"):
                meta["tokens_input"] = msg["tokens_input"]
            if msg.get("tokens_output"):
                meta["tokens_output"] = msg["tokens_output"]
            
            messages.append(Message(
                id=msg["id"],
                role=msg["role"],
                content=msg["content"],
                timestamp=msg["created_at"],
                meta=meta
            ))
        
        return messages
    
    def get_messages(
        self,
        conversation_id: str,
        limit: int = 100,
        before_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get raw messages for a conversation"""
        query = self.client.table("messages")\
            .select("*")\
            .eq("conversation_id", conversation_id)\
            .order("created_at", desc=False)\
            .limit(limit)
        
        if before_id:
            query = query.lt("id", before_id)
        
        result = query.execute()
        return result.data or []
    
    def update_message(
        self,
        message_id: str,
        updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update a message (e.g., add reasoning_content after streaming)"""
        result = self.client.table("messages")\
            .update(updates)\
            .eq("id", message_id)\
            .execute()
        
        return result.data[0] if result.data else None
    
    def delete_message(self, message_id: str) -> bool:
        """Delete a single message"""
        result = self.client.table("messages").delete().eq("id", message_id).execute()
        return len(result.data) > 0 if result.data else False
    
    def clear_conversation(self, conversation_id: str, user_email: str = None) -> int:
        """Delete all messages in a conversation"""
        result = self.client.table("messages")\
            .delete()\
            .eq("conversation_id", conversation_id)\
            .execute()
        
        deleted_count = len(result.data) if result.data else 0
        logger.info(f"Cleared {deleted_count} messages from conversation {conversation_id}")
        return deleted_count
    
    # ==================== STATS ====================
    
    def get_conversation_with_messages(self, conversation_id: str, user_email: str = None) -> Dict:
        """Get conversation with all its messages"""
        conv = self.get_conversation(conversation_id, user_email)
        if not conv:
            return None
        
        messages = self.get_messages(conversation_id)
        return {
            "conversation": conv,
            "messages": messages
        }
    
    def get_user_stats(self, user_email: str) -> Dict:
        """Get usage statistics for a user"""
        user_id = self._get_user_id(user_email)
        
        result = self.client.rpc("get_usage_stats", {"p_user_id": user_id}).execute()
        return result.data if result.data else {}


# Singleton instance
_store: Optional[SupabaseConversationStore] = None

def get_supabase_conversation_store() -> SupabaseConversationStore:
    """Get singleton conversation store instance"""
    global _store
    if _store is None:
        _store = SupabaseConversationStore()
    return _store
