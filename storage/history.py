import json
import uuid
from datetime import datetime
from typing import List, Optional
from pathlib import Path
import logging
import sys
sys.path.append(str(Path(__file__).parent.parent))
from adapters.base import Message


logger = logging.getLogger(__name__)


class HistoryStore:
    """Manages chat history storage in JSONL format."""

    def __init__(self, history_file: str = "../data/history.jsonl"):
        self.history_file = Path(history_file)
        self.history_file.parent.mkdir(exist_ok=True)
        
        # Ensure file exists
        if not self.history_file.exists():
            self.history_file.touch()

    def save_message(self, message: Message) -> None:
        """Save a single message to history."""
        try:
            message_data = {
                "id": message.id,
                "role": message.role,
                "content": message.content,
                "timestamp": message.timestamp.isoformat(),
                "meta": message.meta or {}
            }
            
            with open(self.history_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(message_data, ensure_ascii=False) + "\n")
                
        except Exception as e:
            logger.error(f"Failed to save message: {e}")
            raise

    def load_history(self, limit: Optional[int] = None) -> List[Message]:
        """Load chat history from file."""
        messages = []
        
        try:
            if not self.history_file.exists():
                return messages

            with open(self.history_file, "r", encoding="utf-8") as f:
                lines = f.readlines()
                
            # Apply limit if specified
            if limit:
                lines = lines[-limit:]
                
            for line in lines:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                    
                try:
                    data = json.loads(line)
                    message = Message(
                        id=data["id"],
                        role=data["role"],
                        content=data["content"],
                        timestamp=datetime.fromisoformat(data["timestamp"]),
                        meta=data.get("meta", {})
                    )
                    messages.append(message)
                except (json.JSONDecodeError, KeyError) as e:
                    logger.warning(f"Skipping invalid history line: {e}")
                    continue
                    
        except Exception as e:
            logger.error(f"Failed to load history: {e}")
            
        return messages

    def clear_history(self) -> None:
        """Clear all chat history."""
        try:
            self.history_file.write_text("", encoding="utf-8")
        except Exception as e:
            logger.error(f"Failed to clear history: {e}")
            raise

    def get_message_count(self) -> int:
        """Get total number of messages."""
        try:
            if not self.history_file.exists():
                return 0
                
            with open(self.history_file, "r", encoding="utf-8") as f:
                return sum(1 for line in f if line.strip() and not line.startswith("#"))
        except Exception as e:
            logger.error(f"Failed to count messages: {e}")
            return 0
