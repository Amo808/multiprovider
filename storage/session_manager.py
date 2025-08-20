import json
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from pathlib import Path
import logging
import sys
sys.path.append(str(Path(__file__).parent.parent))
from adapters.base import Message


logger = logging.getLogger(__name__)


class Session:
    """Represents a chat session/conversation."""
    
    def __init__(
        self,
        id: str = None,
        title: str = "New Chat",
        created_at: datetime = None,
        updated_at: datetime = None,
        meta: Dict[str, Any] = None
    ):
        self.id = id or str(uuid.uuid4())
        self.title = title
        self.created_at = created_at or datetime.now()
        self.updated_at = updated_at or datetime.now()
        self.meta = meta or {}
        self.messages: List[Message] = []

    def to_dict(self) -> Dict[str, Any]:
        """Convert session to dictionary."""
        return {
            "id": self.id,
            "title": self.title,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "meta": self.meta,
            "messages": [
                {
                    "id": msg.id,
                    "role": msg.role,
                    "content": msg.content,
                    "timestamp": msg.timestamp.isoformat(),
                    "meta": msg.meta or {}
                }
                for msg in self.messages
            ]
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Session":
        """Create session from dictionary."""
        session = cls(
            id=data["id"],
            title=data["title"],
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
            meta=data.get("meta", {})
        )
        
        # Load messages
        for msg_data in data.get("messages", []):
            message = Message(
                id=msg_data["id"],
                role=msg_data["role"],
                content=msg_data["content"],
                timestamp=datetime.fromisoformat(msg_data["timestamp"]),
                meta=msg_data.get("meta", {})
            )
            session.messages.append(message)
            
        return session

    def add_message(self, message: Message) -> None:
        """Add message to session."""
        self.messages.append(message)
        self.updated_at = datetime.now()
        
        # Auto-generate title from first user message
        if len(self.messages) == 1 and message.role == "user" and self.title == "New Chat":
            self.title = message.content[:50] + ("..." if len(message.content) > 50 else "")

    def get_message_count(self) -> int:
        """Get number of messages in session."""
        return len(self.messages)


class SessionManager:
    """Manages multiple chat sessions (Lobe Chat style)."""

    def __init__(self, sessions_file: str = "../data/sessions.json"):
        self.sessions_file = Path(sessions_file)
        self.sessions_file.parent.mkdir(exist_ok=True)
        
        self._sessions: Dict[str, Session] = {}
        self._current_session_id: Optional[str] = None
        
        # Load existing sessions
        self.load_sessions()

    def create_session(self, title: str = "New Chat") -> Session:
        """Create new chat session."""
        session = Session(title=title)
        self._sessions[session.id] = session
        self._current_session_id = session.id
        self.save_sessions()
        
        logger.info(f"Created new session: {session.id} - {title}")
        return session

    def get_session(self, session_id: str) -> Optional[Session]:
        """Get session by ID."""
        return self._sessions.get(session_id)

    def get_current_session(self) -> Optional[Session]:
        """Get currently active session."""
        if self._current_session_id:
            return self._sessions.get(self._current_session_id)
        return None

    def set_current_session(self, session_id: str) -> bool:
        """Set current active session."""
        if session_id in self._sessions:
            self._current_session_id = session_id
            return True
        return False

    def list_sessions(self) -> List[Session]:
        """Get list of all sessions, sorted by last updated."""
        sessions = list(self._sessions.values())
        sessions.sort(key=lambda s: s.updated_at, reverse=True)
        return sessions

    def delete_session(self, session_id: str) -> bool:
        """Delete a session."""
        if session_id in self._sessions:
            del self._sessions[session_id]
            
            # If deleted session was current, clear current
            if self._current_session_id == session_id:
                self._current_session_id = None
                
            self.save_sessions()
            logger.info(f"Deleted session: {session_id}")
            return True
        return False

    def add_message_to_session(self, session_id: str, message: Message) -> bool:
        """Add message to specific session."""
        session = self.get_session(session_id)
        if session:
            session.add_message(message)
            self.save_sessions()
            return True
        return False

    def add_message_to_current(self, message: Message) -> bool:
        """Add message to current session, create one if none exists."""
        if not self._current_session_id:
            self.create_session()
            
        return self.add_message_to_session(self._current_session_id, message)

    def get_session_messages(self, session_id: str, limit: Optional[int] = None) -> List[Message]:
        """Get messages from specific session."""
        session = self.get_session(session_id)
        if session:
            messages = session.messages
            if limit:
                messages = messages[-limit:]
            return messages
        return []

    def get_current_messages(self, limit: Optional[int] = None) -> List[Message]:
        """Get messages from current session."""
        if self._current_session_id:
            return self.get_session_messages(self._current_session_id, limit)
        return []

    def clear_session(self, session_id: str) -> bool:
        """Clear all messages from session."""
        session = self.get_session(session_id)
        if session:
            session.messages.clear()
            session.updated_at = datetime.now()
            self.save_sessions()
            return True
        return False

    def clear_current_session(self) -> bool:
        """Clear current session."""
        if self._current_session_id:
            return self.clear_session(self._current_session_id)
        return False

    def save_sessions(self) -> None:
        """Save all sessions to file."""
        try:
            data = {
                "current_session_id": self._current_session_id,
                "sessions": {
                    session_id: session.to_dict() 
                    for session_id, session in self._sessions.items()
                }
            }
            
            with open(self.sessions_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                
        except Exception as e:
            logger.error(f"Failed to save sessions: {e}")
            raise

    def load_sessions(self) -> None:
        """Load sessions from file."""
        try:
            if not self.sessions_file.exists():
                return
                
            with open(self.sessions_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                
            self._current_session_id = data.get("current_session_id")
            
            # Load sessions
            for session_id, session_data in data.get("sessions", {}).items():
                session = Session.from_dict(session_data)
                self._sessions[session_id] = session
                
        except Exception as e:
            logger.error(f"Failed to load sessions: {e}")

    def get_session_count(self) -> int:
        """Get total number of sessions."""
        return len(self._sessions)

    def get_total_message_count(self) -> int:
        """Get total number of messages across all sessions."""
        return sum(session.get_message_count() for session in self._sessions.values())

    def search_sessions(self, query: str) -> List[Session]:
        """Search sessions by title or message content."""
        query = query.lower()
        results = []
        
        for session in self._sessions.values():
            # Search in title
            if query in session.title.lower():
                results.append(session)
                continue
                
            # Search in messages
            for message in session.messages:
                if query in message.content.lower():
                    results.append(session)
                    break
                    
        # Sort by relevance (updated_at)
        results.sort(key=lambda s: s.updated_at, reverse=True)
        return results


# Global session manager instance
session_manager = SessionManager()
