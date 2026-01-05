"""
Parallel Conversations CRUD operations for Supabase
Handles parallel chat conversations with multiple model responses per turn
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from uuid import uuid4
import logging

from .client import get_supabase_service_client, get_or_create_user, is_supabase_configured

logger = logging.getLogger(__name__)


class SupabaseParallelStore:
    """Supabase-backed storage for parallel chat conversations"""
    
    def __init__(self):
        self._client = None
        self._user_cache = {}
    
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
        user_email: str,
        title: str = "Parallel Chat",
        shared_history_mode: bool = False,
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Create a new parallel conversation"""
        user_id = self._get_user_id(user_email)
        
        data = {
            "id": str(uuid4()),
            "user_id": user_id,
            "title": title,
            "shared_history_mode": shared_history_mode,
            "metadata": metadata or {}
        }
        
        result = self.client.table("parallel_conversations").insert(data).execute()
        
        if result.data:
            logger.info(f"[PARALLEL] Created conversation {data['id']} for user {user_email}")
            return result.data[0]
        
        raise Exception("Failed to create parallel conversation")
    
    def get_conversation(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        """Get a conversation by ID with all turns and responses"""
        # Get conversation
        conv_result = self.client.table("parallel_conversations")\
            .select("*")\
            .eq("id", conversation_id)\
            .single()\
            .execute()
        
        if not conv_result.data:
            return None
        
        conversation = conv_result.data
        
        # Get turns ordered by turn_order
        turns_result = self.client.table("parallel_turns")\
            .select("*")\
            .eq("conversation_id", conversation_id)\
            .order("turn_order")\
            .execute()
        
        turns = turns_result.data or []
        
        # Get all responses for these turns
        if turns:
            turn_ids = [t["id"] for t in turns]
            responses_result = self.client.table("parallel_responses")\
                .select("*")\
                .in_("turn_id", turn_ids)\
                .execute()
            
            responses_by_turn = {}
            for resp in (responses_result.data or []):
                turn_id = resp["turn_id"]
                if turn_id not in responses_by_turn:
                    responses_by_turn[turn_id] = []
                responses_by_turn[turn_id].append(resp)
            
            # Attach responses to turns
            for turn in turns:
                turn["responses"] = responses_by_turn.get(turn["id"], [])
        
        conversation["turns"] = turns
        return conversation
    
    def list_conversations(
        self,
        user_email: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """List parallel conversations for a user"""
        user_id = self._get_user_id(user_email)
        
        result = self.client.table("parallel_conversations")\
            .select("id, title, shared_history_mode, created_at, updated_at, metadata")\
            .eq("user_id", user_id)\
            .order("updated_at", desc=True)\
            .range(offset, offset + limit - 1)\
            .execute()
        
        return result.data or []
    
    def update_conversation(
        self,
        conversation_id: str,
        title: Optional[str] = None,
        shared_history_mode: Optional[bool] = None,
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Update conversation settings"""
        updates = {"updated_at": datetime.utcnow().isoformat()}
        
        if title is not None:
            updates["title"] = title
        if shared_history_mode is not None:
            updates["shared_history_mode"] = shared_history_mode
        if metadata is not None:
            updates["metadata"] = metadata
        
        result = self.client.table("parallel_conversations")\
            .update(updates)\
            .eq("id", conversation_id)\
            .execute()
        
        if result.data:
            return result.data[0]
        raise Exception(f"Failed to update conversation {conversation_id}")
    
    def delete_conversation(self, conversation_id: str) -> bool:
        """Delete a conversation and all its turns/responses (cascade)"""
        result = self.client.table("parallel_conversations")\
            .delete()\
            .eq("id", conversation_id)\
            .execute()
        
        logger.info(f"[PARALLEL] Deleted conversation {conversation_id}")
        return True
    
    # ==================== TURNS ====================
    
    def add_turn(
        self,
        conversation_id: str,
        user_message: str,
        responses: List[Dict[str, Any]],
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Add a new turn with responses to a conversation"""
        
        # Get next turn order
        existing_turns = self.client.table("parallel_turns")\
            .select("turn_order")\
            .eq("conversation_id", conversation_id)\
            .order("turn_order", desc=True)\
            .limit(1)\
            .execute()
        
        next_order = 1
        if existing_turns.data:
            next_order = existing_turns.data[0]["turn_order"] + 1
        
        # Create turn
        turn_id = str(uuid4())
        turn_data = {
            "id": turn_id,
            "conversation_id": conversation_id,
            "user_message": user_message,
            "turn_order": next_order,
            "metadata": metadata or {}
        }
        
        turn_result = self.client.table("parallel_turns").insert(turn_data).execute()
        
        if not turn_result.data:
            raise Exception("Failed to create turn")
        
        turn = turn_result.data[0]
        
        # Add responses
        turn["responses"] = []
        for resp in responses:
            response_data = {
                "id": str(uuid4()),
                "turn_id": turn_id,
                "model_id": resp.get("model_id", resp.get("model", {}).get("id", "unknown")),
                "model_name": resp.get("model_name", resp.get("model", {}).get("display_name", "Unknown")),
                "provider": resp.get("provider", resp.get("model", {}).get("provider", "unknown")),
                "content": resp.get("content", ""),
                "enabled": resp.get("enabled", True),
                "tokens_in": resp.get("meta", {}).get("tokens_in") or resp.get("tokens_in"),
                "tokens_out": resp.get("meta", {}).get("tokens_out") or resp.get("tokens_out"),
                "thought_tokens": resp.get("meta", {}).get("thought_tokens") or resp.get("thought_tokens"),
                "estimated_cost": resp.get("meta", {}).get("estimated_cost") or resp.get("estimated_cost"),
                "total_latency": resp.get("meta", {}).get("total_latency") or resp.get("total_latency"),
                "metadata": resp.get("metadata", {})
            }
            
            resp_result = self.client.table("parallel_responses").insert(response_data).execute()
            if resp_result.data:
                turn["responses"].append(resp_result.data[0])
        
        logger.info(f"[PARALLEL] Added turn {turn_id} with {len(responses)} responses")
        return turn
    
    def update_turn(
        self,
        turn_id: str,
        user_message: Optional[str] = None,
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Update a turn"""
        updates = {}
        if user_message is not None:
            updates["user_message"] = user_message
        if metadata is not None:
            updates["metadata"] = metadata
        
        if not updates:
            # Return existing turn
            result = self.client.table("parallel_turns")\
                .select("*")\
                .eq("id", turn_id)\
                .single()\
                .execute()
            return result.data
        
        result = self.client.table("parallel_turns")\
            .update(updates)\
            .eq("id", turn_id)\
            .execute()
        
        if result.data:
            return result.data[0]
        raise Exception(f"Failed to update turn {turn_id}")
    
    def delete_turn(self, turn_id: str) -> bool:
        """Delete a turn and all its responses (cascade)"""
        result = self.client.table("parallel_turns")\
            .delete()\
            .eq("id", turn_id)\
            .execute()
        
        logger.info(f"[PARALLEL] Deleted turn {turn_id}")
        return True
    
    # ==================== RESPONSES ====================
    
    def update_response(
        self,
        response_id: str,
        content: Optional[str] = None,
        enabled: Optional[bool] = None,
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Update a specific response"""
        updates = {}
        if content is not None:
            updates["content"] = content
        if enabled is not None:
            updates["enabled"] = enabled
        if metadata is not None:
            updates["metadata"] = metadata
        
        if not updates:
            result = self.client.table("parallel_responses")\
                .select("*")\
                .eq("id", response_id)\
                .single()\
                .execute()
            return result.data
        
        result = self.client.table("parallel_responses")\
            .update(updates)\
            .eq("id", response_id)\
            .execute()
        
        if result.data:
            logger.info(f"[PARALLEL] Updated response {response_id}")
            return result.data[0]
        raise Exception(f"Failed to update response {response_id}")
    
    def delete_response(self, response_id: str) -> bool:
        """Delete a specific response"""
        result = self.client.table("parallel_responses")\
            .delete()\
            .eq("id", response_id)\
            .execute()
        
        logger.info(f"[PARALLEL] Deleted response {response_id}")
        return True
    
    def regenerate_response(
        self,
        response_id: str,
        new_content: str,
        new_meta: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Replace response content (for regeneration)"""
        updates = {
            "content": new_content,
            "enabled": True  # Re-enable after regeneration
        }
        
        if new_meta:
            updates["tokens_in"] = new_meta.get("tokens_in")
            updates["tokens_out"] = new_meta.get("tokens_out")
            updates["thought_tokens"] = new_meta.get("thought_tokens")
            updates["estimated_cost"] = new_meta.get("estimated_cost")
            updates["total_latency"] = new_meta.get("total_latency")
        
        result = self.client.table("parallel_responses")\
            .update(updates)\
            .eq("id", response_id)\
            .execute()
        
        if result.data:
            logger.info(f"[PARALLEL] Regenerated response {response_id}")
            return result.data[0]
        raise Exception(f"Failed to regenerate response {response_id}")


# Singleton instance
_parallel_store: Optional[SupabaseParallelStore] = None


def get_parallel_store() -> Optional[SupabaseParallelStore]:
    """Get the parallel store singleton"""
    global _parallel_store
    
    if not is_supabase_configured():
        logger.warning("[PARALLEL] Supabase not configured, parallel store unavailable")
        return None
    
    if _parallel_store is None:
        _parallel_store = SupabaseParallelStore()
    
    return _parallel_store
