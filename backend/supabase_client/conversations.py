"""
Conversations CRUD operations for Supabase
Handles conversations and messages with full user isolation
"""
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from uuid import uuid4, uuid5, NAMESPACE_DNS
import hashlib
import logging

from .client import get_supabase_service_client, get_or_create_user, is_supabase_configured

logger = logging.getLogger(__name__)


def string_to_uuid(s: str) -> str:
    """Convert any string to a valid UUID string using uuid5"""
    # If already looks like UUID, return as-is
    if len(s) == 36 and s.count('-') == 4:
        return s
    # Generate deterministic UUID from string
    return str(uuid5(NAMESPACE_DNS, s))


def is_valid_uuid(s: str) -> bool:
    """Check if string is a valid UUID format"""
    if not s or len(s) != 36:
        return False
    try:
        parts = s.split('-')
        return len(parts) == 5 and all(len(p) > 0 for p in parts)
    except:
        return False


class SupabaseConversationStore:
    """Supabase-backed conversation storage with full chat history support"""
    
    def __init__(self):
        self._client = None
        self._user_cache = {}  # Cache user_id by email
        self._id_mapping = {}  # Map original IDs to UUIDs
    
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
    
    def _to_db_id(self, original_id: str) -> str:
        """Convert original ID to database-compatible UUID if needed"""
        if is_valid_uuid(original_id):
            return original_id
        # Convert string ID to UUID
        db_id = string_to_uuid(original_id)
        # Store mapping for reverse lookup
        self._id_mapping[db_id] = original_id
        self._id_mapping[original_id] = db_id
        return db_id
    
    def _from_db_id(self, db_id: str, original_hint: str = None) -> str:
        """Convert database UUID back to original ID if we have the mapping"""
        if db_id in self._id_mapping:
            return self._id_mapping[db_id]
        return original_hint or db_id
    
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
        
        # Convert ID to UUID if needed
        db_id = self._to_db_id(conversation_id)
        
        # Store original ID in metadata for recovery
        metadata = {"original_id": conversation_id}
        
        # Build data dict with only columns that exist in the schema
        data = {
            "id": db_id,
            "user_id": user_id,
            "title": title,
            "metadata": metadata
        }
        
        # Add optional fields if provided
        if model:
            data["model"] = model
        if provider:
            data["provider"] = provider
        if settings:
            data["settings"] = settings
        
        try:
            result = self.client.table("conversations").insert(data).execute()
            logger.info(f"Created conversation: {conversation_id} (db_id={db_id}) for user {user_email}")
            conv = result.data[0] if result.data else data
            # Return with original ID
            conv["id"] = conversation_id
            return conv
        except Exception as e:
            # If insert fails, try with minimal data
            logger.warning(f"Insert with all fields failed, trying minimal: {e}")
            minimal_data = {
                "id": db_id,
                "user_id": user_id,
                "title": title
            }
            result = self.client.table("conversations").insert(minimal_data).execute()
            conv = result.data[0] if result.data else minimal_data
            conv["id"] = conversation_id
            return conv
    
    def get_conversation(self, conversation_id: str, user_email: str = None) -> Optional[Dict[str, Any]]:
        """Get a single conversation by ID"""
        user_id = self._get_user_id(user_email) if user_email else None
        db_id = self._to_db_id(conversation_id)
        
        try:
            query = self.client.table("conversations").select("*").eq("id", db_id)
            if user_id:
                query = query.eq("user_id", user_id)
            
            # Use limit(1) instead of single() to avoid error on 0 rows
            result = query.limit(1).execute()
            
            if result.data and len(result.data) > 0:
                conv = result.data[0]
                # Restore original ID from metadata if available
                meta = conv.get("metadata") or {}
                original_id = meta.get("original_id", conversation_id)
                conv["id"] = original_id
                return conv
            return None
        except Exception as e:
            logger.warning(f"get_conversation error for {conversation_id}: {e}")
            return None
    
    def get_conversations(
        self,
        user_email: str = None,
        limit: int = 50,
        offset: int = 0,
        include_archived: bool = False
    ) -> List[Dict[str, Any]]:
        """Get list of all conversations for a user"""
        user_id = self._get_user_id(user_email)
        
        try:
            query = self.client.table("conversations")\
                .select("*")\
                .eq("user_id", user_id)\
                .order("updated_at", desc=True)\
                .range(offset, offset + limit - 1)
            
            # Try to filter by is_archived if column exists
            if not include_archived:
                try:
                    query = query.eq("is_archived", False)
                except Exception:
                    pass  # Column may not exist
            
            result = query.execute()
        except Exception as e:
            # If query fails (e.g., missing is_archived column), try simpler query
            logger.warning(f"Full conversations query failed, trying simple: {e}")
            result = self.client.table("conversations")\
                .select("*")\
                .eq("user_id", user_id)\
                .order("updated_at", desc=True)\
                .range(offset, offset + limit - 1)\
                .execute()
        
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
        db_id = self._to_db_id(conversation_id)
        
        query = self.client.table("conversations")\
            .update({"title": title, "updated_at": datetime.utcnow().isoformat()})\
            .eq("id", db_id)
        
        if user_id:
            query = query.eq("user_id", user_id)
        
        result = query.execute()
        return len(result.data) > 0 if result.data else False
    
    def delete_conversation(self, conversation_id: str, user_email: str = None) -> bool:
        """Delete a conversation (cascades to messages)"""
        user_id = self._get_user_id(user_email) if user_email else None
        db_id = self._to_db_id(conversation_id)
        
        # First delete messages
        self.client.table("messages").delete().eq("conversation_id", db_id).execute()
        
        # Then delete conversation
        query = self.client.table("conversations").delete().eq("id", db_id)
        if user_id:
            query = query.eq("user_id", user_id)
        
        result = query.execute()
        logger.info(f"Deleted conversation: {conversation_id}")
        return len(result.data) > 0 if result.data else False
    
    def archive_conversation(self, conversation_id: str, user_email: str = None) -> bool:
        """Archive a conversation"""
        user_id = self._get_user_id(user_email) if user_email else None
        db_id = self._to_db_id(conversation_id)
        
        try:
            query = self.client.table("conversations")\
                .update({"is_archived": True})\
                .eq("id", db_id)
            
            if user_id:
                query = query.eq("user_id", user_id)
            
            result = query.execute()
            return len(result.data) > 0 if result.data else False
        except Exception as e:
            logger.warning(f"archive_conversation error (is_archived column may not exist): {e}")
            return False
    
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
        # Convert conversation_id to UUID
        db_conversation_id = self._to_db_id(conversation_id)
        
        # Try to ensure conversation exists, but don't block on failure
        try:
            conv = self.get_conversation(conversation_id, user_email)
            if not conv:
                # Auto-create conversation if it doesn't exist
                self.create_conversation(conversation_id, "New Conversation", user_email)
        except Exception as e:
            logger.warning(f"Failed to check/create conversation: {e}")
        
        msg_id = message_id or str(uuid4())
        
        # Try multiple insert strategies based on available columns
        # Strategy 1: Full data
        full_data = {
            "id": msg_id,
            "conversation_id": db_conversation_id,
            "role": role,
            "content": content,
        }
        
        # Add optional fields - only include non-None values
        optional_fields = {
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
        
        for key, value in optional_fields.items():
            if value is not None:
                full_data[key] = value
        
        # Strategy 2: Minimal data (just required columns)
        minimal_data = {
            "id": msg_id,
            "conversation_id": db_conversation_id,
            "role": role,
            "content": content,
        }
        
        # Try full insert first
        try:
            result = self.client.table("messages").insert(full_data).execute()
            logger.info(f"Message saved with full data: {msg_id}")
        except Exception as e1:
            logger.warning(f"Full message insert failed: {e1}")
            # Try minimal insert
            try:
                result = self.client.table("messages").insert(minimal_data).execute()
                logger.info(f"Message saved with minimal data: {msg_id}")
            except Exception as e2:
                logger.error(f"Minimal message insert also failed: {e2}")
                raise e2
        
        # Update conversation's updated_at
        try:
            self.client.table("conversations")\
                .update({"updated_at": datetime.utcnow().isoformat()})\
                .eq("id", db_conversation_id)\
                .execute()
        except Exception as e:
            logger.warning(f"Failed to update conversation timestamp: {e}")
        
        return result.data[0] if result.data else full_data
    
    def load_conversation_history(
        self,
        conversation_id: str,
        user_email: str = None,
        limit: int = 100,
        offset: int = 0
    ) -> List:
        """Load messages for a conversation - returns Message-like objects.
        
        Optimized for large conversations with offset support.
        """
        db_conversation_id = self._to_db_id(conversation_id)
        
        # Use range for efficient pagination
        query = self.client.table("messages")\
            .select("id, role, content, created_at, model, provider, reasoning_content, tokens_input, tokens_output, metadata")\
            .eq("conversation_id", db_conversation_id)\
            .order("created_at", desc=False)
        
        # Apply pagination using range (more efficient than limit+offset for large datasets)
        if offset > 0:
            query = query.range(offset, offset + limit - 1)
        else:
            query = query.limit(limit)
        
        result = query.execute()
        
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
                meta["thought_content"] = msg["reasoning_content"]  # Also set thought_content for UI
            # Map DB field names to API field names that UI expects
            if msg.get("tokens_input"):
                meta["tokens_in"] = msg["tokens_input"]
                meta["tokens_input"] = msg["tokens_input"]  # Keep both for compatibility
            if msg.get("tokens_output"):
                meta["tokens_out"] = msg["tokens_output"]
                meta["tokens_output"] = msg["tokens_output"]  # Keep both for compatibility
            
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
        db_conversation_id = self._to_db_id(conversation_id)
        
        query = self.client.table("messages")\
            .select("*")\
            .eq("conversation_id", db_conversation_id)\
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
    
    def save_message(self, conversation_id: str, message: Any, user_email: str = None) -> Dict[str, Any]:
        """
        Save a Message object to a conversation.
        This is an alias for add_message that accepts a Message object for API compatibility.
        Non-blocking - will not raise exceptions, just log errors.
        """
        try:
            # Extract metadata from Message object
            meta = getattr(message, 'meta', {}) or {}
            
            return self.add_message(
                conversation_id=conversation_id,
                role=message.role,
                content=message.content,
                user_email=user_email,
                message_id=getattr(message, 'id', None),
                model=meta.get('model'),
                provider=meta.get('provider'),
                reasoning_content=meta.get('reasoning_content') or meta.get('thought_content'),
                # Support both naming conventions: tokens_in/tokens_out (main.py) and tokens_input/tokens_output (DB)
                tokens_input=meta.get('tokens_in') or meta.get('tokens_input'),
                tokens_output=meta.get('tokens_out') or meta.get('tokens_output'),
                tokens_reasoning=meta.get('tokens_reasoning') or meta.get('thought_tokens'),
                latency_ms=meta.get('latency_ms') or (int(meta.get('total_latency', 0) * 1000) if meta.get('total_latency') else None),
                tool_calls=meta.get('tool_calls'),
                tool_results=meta.get('tool_results'),
                metadata=meta
            )
        except Exception as e:
            logger.error(f"save_message failed for {conversation_id}: {e}")
            return {"id": getattr(message, 'id', None), "error": str(e)}

    def clear_conversation(self, conversation_id: str, user_email: str = None) -> int:
        """Delete all messages in a conversation"""
        db_id = self._to_db_id(conversation_id)
        
        result = self.client.table("messages")\
            .delete()\
            .eq("conversation_id", db_id)\
            .execute()
        
        deleted_count = len(result.data) if result.data else 0
        logger.info(f"Cleared {deleted_count} messages from conversation {conversation_id}")
        return deleted_count
    
    def replace_messages(self, conversation_id: str, messages: List[Dict], user_email: str = None) -> bool:
        """
        Replace all messages in a conversation with the given list.
        Used for reordering messages.
        
        Args:
            conversation_id: The conversation ID
            messages: List of message dicts with id, role, content, timestamp, meta
            user_email: User email for authorization
        
        Returns:
            True if successful
        """
        try:
            db_id = self._to_db_id(conversation_id)
            
            # SAFETY: Get current messages count first
            current_result = self.client.table("messages")\
                .select("id")\
                .eq("conversation_id", db_id)\
                .execute()
            current_count = len(current_result.data or [])
            
            # SAFETY: Prevent accidental deletion of all messages
            if current_count > 0 and len(messages) == 0:
                logger.error(f"[REORDER] BLOCKED: Refusing to delete {current_count} messages with empty replacement for {conversation_id}")
                return False
            
            # SAFETY: Backup current messages in case insert fails
            backup_messages = []
            if current_count > 0:
                backup_result = self.client.table("messages")\
                    .select("*")\
                    .eq("conversation_id", db_id)\
                    .execute()
                backup_messages = backup_result.data or []
            
            # Prepare all new message data before deleting - MINIMAL FIELDS ONLY
            new_messages_data = []
            base_time = datetime.utcnow()
            
            for idx, msg in enumerate(messages):
                # Generate new message ID if not valid UUID
                msg_id = msg.get('id')
                if not is_valid_uuid(msg_id):
                    msg_id = str(uuid4())
                
                # Use position-based timestamps to preserve order
                # Each message gets a timestamp 1 second apart to ensure ordering
                timestamp = base_time + timedelta(seconds=idx)
                
                # Build MINIMAL data only - these fields definitely exist in schema
                data = {
                    "id": msg_id,
                    "conversation_id": db_id,
                    "role": msg.get('role', 'user'),
                    "content": msg.get('content', ''),
                    "created_at": timestamp.isoformat()
                }
                
                new_messages_data.append(data)
            
            # Now do the delete
            self.client.table("messages")\
                .delete()\
                .eq("conversation_id", db_id)\
                .execute()
            
            # Insert new messages
            insert_success = True
            try:
                for data in new_messages_data:
                    logger.info(f"[REORDER] Inserting: role={data['role']}, content={data['content'][:50]}...")
                    self.client.table("messages").insert(data).execute()
            except Exception as insert_error:
                logger.error(f"[REORDER] Insert failed: {insert_error}")
                insert_success = False
            
            if not insert_success:
                logger.error(f"[REORDER] Insert failed, attempting to restore backup")
                # Restore backup - filter out unknown columns
                ALLOWED_COLUMNS = {'id', 'conversation_id', 'role', 'content', 'created_at'}
                try:
                    for backup_msg in backup_messages:
                        # Remove any columns that don't exist in schema
                        clean_msg = {k: v for k, v in backup_msg.items() if k in ALLOWED_COLUMNS}
                        self.client.table("messages").insert(clean_msg).execute()
                    logger.info(f"[REORDER] Successfully restored {len(backup_messages)} backup messages")
                except Exception as restore_error:
                    logger.error(f"[REORDER] CRITICAL: Failed to restore backup: {restore_error}")
                return False
            
            logger.info(f"[REORDER] Replaced {len(messages)} messages in conversation {conversation_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to replace messages in {conversation_id}: {e}")
            return False
    
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
