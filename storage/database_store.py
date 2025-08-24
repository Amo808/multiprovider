import json
import logging
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
import sys
import os

sys.path.append(str(Path(__file__).parent.parent))
from adapters.base_provider import Message

logger = logging.getLogger(__name__)


class DatabaseConversationStore:
    """Database-backed conversation storage for reliable persistence."""

    def __init__(self, db_path: str = None):
        # Use DATABASE_URL from environment (for PostgreSQL) or fallback to SQLite
        self.db_url = os.getenv('DATABASE_URL')
        
        if self.db_url and self.db_url.startswith('postgresql://'):
            # PostgreSQL support
            try:
                import psycopg2
                from urllib.parse import urlparse
                self.db_type = 'postgresql'
                self._init_postgresql()
            except ImportError:
                logger.warning("psycopg2 not found, falling back to SQLite")
                self.db_type = 'sqlite'
                self._init_sqlite(db_path)
        else:
            # SQLite fallback
            self.db_type = 'sqlite'
            self._init_sqlite(db_path)
        
        self._lock = threading.RLock()
        self._init_tables()
        
        logger.info(f"DatabaseConversationStore initialized with {self.db_type}")

    def _init_sqlite(self, db_path: str = None):
        """Initialize SQLite connection."""
        if db_path:
            self.db_path = Path(db_path)
        else:
            # Default path
            storage_dir = Path(__file__).parent.parent / "data"
            storage_dir.mkdir(exist_ok=True)
            self.db_path = storage_dir / "conversations.db"
        
        logger.info(f"SQLite database path: {self.db_path}")

    def _init_postgresql(self):
        """Initialize PostgreSQL connection."""
        import psycopg2
        from urllib.parse import urlparse
        
        url = urlparse(self.db_url)
        self.pg_config = {
            'host': url.hostname,
            'port': url.port,
            'database': url.path[1:],  # Remove leading slash
            'user': url.username,
            'password': url.password
        }

    def _get_connection(self):
        """Get database connection."""
        if self.db_type == 'postgresql':
            import psycopg2
            return psycopg2.connect(**self.pg_config)
        else:
            return sqlite3.connect(self.db_path, check_same_thread=False)

    def _init_tables(self):
        """Initialize database tables."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                if self.db_type == 'postgresql':
                    # PostgreSQL schema
                    cursor.execute('''
                        CREATE TABLE IF NOT EXISTS conversations (
                            id VARCHAR(255) PRIMARY KEY,
                            title TEXT,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            message_count INTEGER DEFAULT 0
                        )
                    ''')
                    
                    cursor.execute('''
                        CREATE TABLE IF NOT EXISTS messages (
                            id VARCHAR(255) PRIMARY KEY,
                            conversation_id VARCHAR(255) REFERENCES conversations(id),
                            role VARCHAR(50) NOT NULL,
                            content TEXT NOT NULL,
                            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            meta JSONB,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )
                    ''')
                    
                    cursor.execute('''
                        CREATE INDEX IF NOT EXISTS idx_messages_conversation 
                        ON messages(conversation_id, created_at)
                    ''')
                    
                else:
                    # SQLite schema
                    cursor.execute('''
                        CREATE TABLE IF NOT EXISTS conversations (
                            id TEXT PRIMARY KEY,
                            title TEXT,
                            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                            message_count INTEGER DEFAULT 0
                        )
                    ''')
                    
                    cursor.execute('''
                        CREATE TABLE IF NOT EXISTS messages (
                            id TEXT PRIMARY KEY,
                            conversation_id TEXT,
                            role TEXT NOT NULL,
                            content TEXT NOT NULL,
                            timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                            meta TEXT,
                            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (conversation_id) REFERENCES conversations (id)
                        )
                    ''')
                    
                    cursor.execute('''
                        CREATE INDEX IF NOT EXISTS idx_messages_conversation 
                        ON messages(conversation_id, created_at)
                    ''')
                
                conn.commit()
                logger.info("Database tables initialized successfully")
                
            except Exception as e:
                logger.error(f"Failed to initialize tables: {e}")
                conn.rollback()
                raise
            finally:
                conn.close()

    def create_conversation(self, conversation_id: str, title: str = None) -> None:
        """Create a new conversation."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                title = title or f"Conversation {conversation_id[:8]}"
                now = datetime.now().isoformat()
                
                if self.db_type == 'postgresql':
                    cursor.execute('''
                        INSERT INTO conversations (id, title, created_at, updated_at, message_count)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO NOTHING
                    ''', (conversation_id, title, now, now, 0))
                else:
                    cursor.execute('''
                        INSERT OR IGNORE INTO conversations (id, title, created_at, updated_at, message_count)
                        VALUES (?, ?, ?, ?, ?)
                    ''', (conversation_id, title, now, now, 0))
                
                conn.commit()
                logger.info(f"[DatabaseStore] Created conversation: {conversation_id}")
                
            except Exception as e:
                logger.error(f"Failed to create conversation {conversation_id}: {e}")
                conn.rollback()
                raise
            finally:
                conn.close()

    def save_message(self, conversation_id: str, message: Message) -> None:
        """Save a message to specific conversation."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                # Ensure conversation exists
                self.create_conversation(conversation_id)
                
                # Prepare message data
                if not message.meta:
                    message.meta = {}
                message.meta["conversation_id"] = conversation_id
                
                timestamp = message.timestamp.isoformat() if hasattr(message.timestamp, 'isoformat') else str(message.timestamp)
                meta_json = json.dumps(message.meta) if message.meta else None
                
                # Insert message
                if self.db_type == 'postgresql':
                    cursor.execute('''
                        INSERT INTO messages (id, conversation_id, role, content, timestamp, meta)
                        VALUES (%s, %s, %s, %s, %s, %s)
                    ''', (message.id, conversation_id, message.role, message.content, timestamp, meta_json))
                else:
                    cursor.execute('''
                        INSERT INTO messages (id, conversation_id, role, content, timestamp, meta)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ''', (message.id, conversation_id, message.role, message.content, timestamp, meta_json))
                
                # Update conversation stats
                now = datetime.now().isoformat()
                if self.db_type == 'postgresql':
                    cursor.execute('''
                        UPDATE conversations 
                        SET message_count = (
                            SELECT COUNT(*) FROM messages WHERE conversation_id = %s
                        ), updated_at = %s
                        WHERE id = %s
                    ''', (conversation_id, now, conversation_id))
                else:
                    cursor.execute('''
                        UPDATE conversations 
                        SET message_count = (
                            SELECT COUNT(*) FROM messages WHERE conversation_id = ?
                        ), updated_at = ?
                        WHERE id = ?
                    ''', (conversation_id, now, conversation_id))
                
                conn.commit()
                logger.info(f"[DatabaseStore] Saved message to conversation: {conversation_id}")
                
            except Exception as e:
                logger.error(f"Failed to save message to {conversation_id}: {e}")
                conn.rollback()
                raise
            finally:
                conn.close()

    def load_conversation_history(self, conversation_id: str, limit: Optional[int] = None) -> List[Message]:
        """Load chat history for specific conversation."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                if limit:
                    if self.db_type == 'postgresql':
                        cursor.execute('''
                            SELECT id, role, content, timestamp, meta
                            FROM messages 
                            WHERE conversation_id = %s
                            ORDER BY created_at ASC
                            LIMIT %s
                        ''', (conversation_id, limit))
                    else:
                        cursor.execute('''
                            SELECT id, role, content, timestamp, meta
                            FROM messages 
                            WHERE conversation_id = ?
                            ORDER BY created_at ASC
                            LIMIT ?
                        ''', (conversation_id, limit))
                else:
                    param = (conversation_id,)
                    if self.db_type == 'postgresql':
                        cursor.execute('''
                            SELECT id, role, content, timestamp, meta
                            FROM messages 
                            WHERE conversation_id = %s
                            ORDER BY created_at ASC
                        ''', param)
                    else:
                        cursor.execute('''
                            SELECT id, role, content, timestamp, meta
                            FROM messages 
                            WHERE conversation_id = ?
                            ORDER BY created_at ASC
                        ''', param)
                
                rows = cursor.fetchall()
                messages = []
                
                for row in rows:
                    msg_id, role, content, timestamp_str, meta_json = row
                    
                    # Parse timestamp
                    try:
                        timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                    except (ValueError, AttributeError):
                        timestamp = datetime.now()
                    
                    # Parse meta
                    meta = json.loads(meta_json) if meta_json else {}
                    
                    message = Message(
                        id=msg_id,
                        role=role,
                        content=content,
                        timestamp=timestamp,
                        meta=meta
                    )
                    messages.append(message)
                
                logger.info(f"[DatabaseStore] Loaded {len(messages)} messages for {conversation_id}")
                return messages
                
            except Exception as e:
                logger.error(f"Failed to load conversation {conversation_id}: {e}")
                return []
            finally:
                conn.close()

    def get_conversations(self) -> List[dict]:
        """Get list of all conversations."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                cursor.execute('''
                    SELECT id, title, created_at, updated_at, message_count
                    FROM conversations
                    ORDER BY updated_at DESC
                ''')
                
                rows = cursor.fetchall()
                conversations = []
                
                for row in rows:
                    conv_id, title, created_at, updated_at, message_count = row
                    conversations.append({
                        "id": conv_id,
                        "title": title,
                        "created_at": created_at,
                        "updated_at": updated_at,
                        "message_count": message_count
                    })
                
                return conversations
                
            except Exception as e:
                logger.error(f"Failed to get conversations: {e}")
                return []
            finally:
                conn.close()

    def clear_conversation(self, conversation_id: str) -> None:
        """Clear specific conversation history."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                # Delete messages
                if self.db_type == 'postgresql':
                    cursor.execute('DELETE FROM messages WHERE conversation_id = %s', (conversation_id,))
                    cursor.execute('''
                        UPDATE conversations 
                        SET message_count = 0, updated_at = %s 
                        WHERE id = %s
                    ''', (datetime.now().isoformat(), conversation_id))
                else:
                    cursor.execute('DELETE FROM messages WHERE conversation_id = ?', (conversation_id,))
                    cursor.execute('''
                        UPDATE conversations 
                        SET message_count = 0, updated_at = ? 
                        WHERE id = ?
                    ''', (datetime.now().isoformat(), conversation_id))
                
                conn.commit()
                logger.info(f"[DatabaseStore] Cleared conversation: {conversation_id}")
                
            except Exception as e:
                logger.error(f"Failed to clear conversation {conversation_id}: {e}")
                conn.rollback()
                raise
            finally:
                conn.close()

    def delete_conversation(self, conversation_id: str) -> None:
        """Delete entire conversation."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                # Delete messages first (foreign key constraint)
                if self.db_type == 'postgresql':
                    cursor.execute('DELETE FROM messages WHERE conversation_id = %s', (conversation_id,))
                    cursor.execute('DELETE FROM conversations WHERE id = %s', (conversation_id,))
                else:
                    cursor.execute('DELETE FROM messages WHERE conversation_id = ?', (conversation_id,))
                    cursor.execute('DELETE FROM conversations WHERE id = ?', (conversation_id,))
                
                conn.commit()
                logger.info(f"[DatabaseStore] Deleted conversation: {conversation_id}")
                
            except Exception as e:
                logger.error(f"Failed to delete conversation {conversation_id}: {e}")
                conn.rollback()
                raise
            finally:
                conn.close()

    def update_conversation_title(self, conversation_id: str, title: str) -> None:
        """Update conversation title."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                now = datetime.now().isoformat()
                if self.db_type == 'postgresql':
                    cursor.execute('''
                        UPDATE conversations 
                        SET title = %s, updated_at = %s 
                        WHERE id = %s
                    ''', (title, now, conversation_id))
                else:
                    cursor.execute('''
                        UPDATE conversations 
                        SET title = ?, updated_at = ? 
                        WHERE id = ?
                    ''', (title, now, conversation_id))
                
                conn.commit()
                logger.info(f"[DatabaseStore] Updated title for {conversation_id}")
                
            except Exception as e:
                logger.error(f"Failed to update title for {conversation_id}: {e}")
                conn.rollback()
                raise
            finally:
                conn.close()

    def get_message_count(self, conversation_id: str) -> int:
        """Get message count for specific conversation."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                if self.db_type == 'postgresql':
                    cursor.execute('SELECT COUNT(*) FROM messages WHERE conversation_id = %s', (conversation_id,))
                else:
                    cursor.execute('SELECT COUNT(*) FROM messages WHERE conversation_id = ?', (conversation_id,))
                
                result = cursor.fetchone()
                return result[0] if result else 0
                
            except Exception as e:
                logger.error(f"Failed to count messages for {conversation_id}: {e}")
                return 0
            finally:
                conn.close()

    def get_total_conversations(self) -> int:
        """Get total number of conversations."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute('SELECT COUNT(*) FROM conversations')
                result = cursor.fetchone()
                return result[0] if result else 0
            except Exception as e:
                logger.error(f"Failed to count conversations: {e}")
                return 0
            finally:
                conn.close()

    def clear_all_history(self) -> None:
        """Clear all conversation history."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                cursor.execute('DELETE FROM messages')
                cursor.execute('DELETE FROM conversations')
                
                conn.commit()
                logger.info("[DatabaseStore] Cleared all history")
                
            except Exception as e:
                logger.error(f"Failed to clear all history: {e}")
                conn.rollback()
                raise
            finally:
                conn.close()
