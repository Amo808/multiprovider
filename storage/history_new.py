import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
import sys
sys.path.append(str(Path(__file__).parent.parent))
from adapters.base_provider import Message

logger = logging.getLogger(__name__)


class ConversationStore:
    """Manages conversation history storage with conversation isolation."""

    def __init__(self, storage_dir: str = "data"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True)
        self.conversations_file = self.storage_dir / "conversations.json"
        self.messages_dir = self.storage_dir / "conversations"
        self.messages_dir.mkdir(exist_ok=True)
        
        # Load conversations index
        self._conversations = self._load_conversations()

    def _load_conversations(self) -> Dict[str, dict]:
        """Load conversations index."""
        try:
            if self.conversations_file.exists():
                with open(self.conversations_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            return {}
        except Exception as e:
            logger.error(f"Failed to load conversations index: {e}")
            return {}

    def _save_conversations(self) -> None:
        """Save conversations index."""
        try:
            with open(self.conversations_file, "w", encoding="utf-8") as f:
                json.dump(self._conversations, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Failed to save conversations index: {e}")

    def _get_conversation_file(self, conversation_id: str) -> Path:
        """Get file path for conversation messages."""
        return self.messages_dir / f"{conversation_id}.jsonl"

    def create_conversation(self, conversation_id: str, title: str = None) -> None:
        """Create a new conversation."""
        if conversation_id not in self._conversations:
            self._conversations[conversation_id] = {
                "id": conversation_id,
                "title": title or f"Conversation {conversation_id[:8]}",
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "message_count": 0
            }
            self._save_conversations()

    def update_conversation_title(self, conversation_id: str, title: str) -> None:
        """Update conversation title."""
        if conversation_id in self._conversations:
            self._conversations[conversation_id]["title"] = title
            self._conversations[conversation_id]["updated_at"] = datetime.now().isoformat()
            self._save_conversations()

    def get_conversations(self) -> List[dict]:
        """Get list of all conversations."""
        conversations = list(self._conversations.values())
        # Sort by updated_at descending
        conversations.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        return conversations

    def save_message(self, conversation_id: str, message: Message) -> None:
        """Save a message to specific conversation."""
        try:
            # Ensure conversation exists
            if conversation_id not in self._conversations:
                self.create_conversation(conversation_id)

            # Update message meta with conversation_id
            if not message.meta:
                message.meta = {}
            message.meta["conversation_id"] = conversation_id

            # Save message
            message_data = {
                "id": message.id,
                "role": message.role,
                "content": message.content,
                "timestamp": message.timestamp.isoformat() if hasattr(message.timestamp, 'isoformat') else str(message.timestamp),
                "meta": message.meta or {}
            }
            
            conversation_file = self._get_conversation_file(conversation_id)
            with open(conversation_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(message_data, ensure_ascii=False) + "\n")

            # Update conversation metadata
            self._conversations[conversation_id]["message_count"] = self.get_message_count(conversation_id)
            self._conversations[conversation_id]["updated_at"] = datetime.now().isoformat()
            self._save_conversations()
                
        except Exception as e:
            logger.error(f"Failed to save message to conversation {conversation_id}: {e}")
            raise

    def load_conversation_history(self, conversation_id: str, limit: Optional[int] = None) -> List[Message]:
        """Load chat history for specific conversation."""
        messages = []
        
        try:
            conversation_file = self._get_conversation_file(conversation_id)
            if not conversation_file.exists():
                return messages

            with open(conversation_file, "r", encoding="utf-8") as f:
                lines = f.readlines()
                
            # Apply limit if specified
            if limit and len(lines) > limit:
                lines = lines[-limit:]
                
            for line in lines:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                    
                try:
                    data = json.loads(line)
                    
                    # Handle timestamp parsing
                    timestamp = data.get("timestamp")
                    if isinstance(timestamp, str):
                        try:
                            timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                        except ValueError:
                            timestamp = datetime.now()
                    elif not timestamp:
                        timestamp = datetime.now()
                    
                    message = Message(
                        id=data["id"],
                        role=data["role"],
                        content=data["content"],
                        timestamp=timestamp,
                        meta=data.get("meta", {})
                    )
                    messages.append(message)
                except (json.JSONDecodeError, KeyError) as e:
                    logger.warning(f"Skipping invalid history line in {conversation_id}: {e}")
                    continue
                    
        except Exception as e:
            logger.error(f"Failed to load conversation history {conversation_id}: {e}")
            
        return messages

    def clear_conversation(self, conversation_id: str) -> None:
        """Clear specific conversation history."""
        try:
            conversation_file = self._get_conversation_file(conversation_id)
            if conversation_file.exists():
                conversation_file.unlink()
            
            # Update conversation metadata
            if conversation_id in self._conversations:
                self._conversations[conversation_id]["message_count"] = 0
                self._conversations[conversation_id]["updated_at"] = datetime.now().isoformat()
                self._save_conversations()
        except Exception as e:
            logger.error(f"Failed to clear conversation {conversation_id}: {e}")
            raise

    def delete_conversation(self, conversation_id: str) -> None:
        """Delete entire conversation."""
        try:
            # Delete messages file
            conversation_file = self._get_conversation_file(conversation_id)
            if conversation_file.exists():
                conversation_file.unlink()
            
            # Remove from index
            if conversation_id in self._conversations:
                del self._conversations[conversation_id]
                self._save_conversations()
        except Exception as e:
            logger.error(f"Failed to delete conversation {conversation_id}: {e}")
            raise

    def get_message_count(self, conversation_id: str) -> int:
        """Get message count for specific conversation."""
        try:
            conversation_file = self._get_conversation_file(conversation_id)
            if not conversation_file.exists():
                return 0
                
            with open(conversation_file, "r", encoding="utf-8") as f:
                return sum(1 for line in f if line.strip() and not line.startswith("#"))
        except Exception as e:
            logger.error(f"Failed to count messages for {conversation_id}: {e}")
            return 0

    def get_total_conversations(self) -> int:
        """Get total number of conversations."""
        return len(self._conversations)

    def clear_all_history(self) -> None:
        """Clear all conversation history."""
        try:
            # Delete all message files
            for conversation_file in self.messages_dir.glob("*.jsonl"):
                conversation_file.unlink()
            
            # Clear conversations index
            self._conversations = {}
            self._save_conversations()
        except Exception as e:
            logger.error(f"Failed to clear all history: {e}")
            raise


# Legacy compatibility - keep old HistoryStore class for backward compatibility
class HistoryStore:
    """Legacy history store - redirects to conversation store."""
    
    def __init__(self, history_file: str = "../data/history.jsonl"):
        # Use default conversation for legacy compatibility
        self._conversation_store = ConversationStore()
        self._default_conversation_id = "default"
    
    def save_message(self, message: Message) -> None:
        """Save a single message to default conversation."""
        self._conversation_store.save_message(self._default_conversation_id, message)
    
    def load_history(self, limit: Optional[int] = None) -> List[Message]:
        """Load chat history from default conversation."""
        return self._conversation_store.load_conversation_history(self._default_conversation_id, limit)
    
    def clear_history(self) -> None:
        """Clear default conversation history."""
        self._conversation_store.clear_conversation(self._default_conversation_id)
    
    def get_message_count(self) -> int:
        """Get total number of messages in default conversation."""
        return self._conversation_store.get_message_count(self._default_conversation_id)
