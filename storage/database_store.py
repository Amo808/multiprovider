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
            # Определяем путь к файлу данных
            if os.path.exists('/app'):
                # В контейнере используем /app/data
                storage_dir = Path('/app/data')
            else:
                # Локальная разработка - используем data в корне проекта
                storage_dir = Path(__file__).parent.parent / "data"
                
            storage_dir.mkdir(parents=True, exist_ok=True)
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
                
                # --- BEGIN USER MULTI-TENANCY EXTENSION ---
                try:
                    if self.db_type == 'postgresql':
                        # Add user_email column if not exists
                        cursor.execute("""
                            DO $$
                            BEGIN
                                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                    WHERE table_name='conversations' AND column_name='user_email') THEN
                                    ALTER TABLE conversations ADD COLUMN user_email VARCHAR(320);
                                END IF;
                                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                    WHERE table_name='messages' AND column_name='user_email') THEN
                                    ALTER TABLE messages ADD COLUMN user_email VARCHAR(320);
                                END IF;
                            END;$$;""")
                        cursor.execute("CREATE INDEX IF NOT EXISTS idx_conversations_user_email ON conversations(user_email);")
                        cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_user_email_conv ON messages(user_email, conversation_id);")
                    else:
                        # SQLite: detect and add columns
                        cursor.execute("PRAGMA table_info(conversations);")
                        conv_cols = [r[1] for r in cursor.fetchall()]
                        if 'user_email' not in conv_cols:
                            cursor.execute("ALTER TABLE conversations ADD COLUMN user_email TEXT")
                        cursor.execute("PRAGMA table_info(messages);")
                        msg_cols = [r[1] for r in cursor.fetchall()]
                        if 'user_email' not in msg_cols:
                            cursor.execute("ALTER TABLE messages ADD COLUMN user_email TEXT")
                        cursor.execute("CREATE INDEX IF NOT EXISTS idx_conversations_user_email ON conversations(user_email);")
                        cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_user_email_conv ON messages(user_email, conversation_id);")
                except Exception as e:
                    logger.warning(f"[MultiTenant] Failed to ensure user_email columns/indexes: {e}")
                # --- END USER MULTI-TENANCY EXTENSION ---
                
                conn.commit()
                logger.info("Database tables initialized successfully")
                
            except Exception as e:
                logger.error(f"Failed to initialize tables: {e}")
                conn.rollback()
                raise
            finally:
                conn.close()

    def create_conversation(self, conversation_id: str, title: str = None, user_email: Optional[str] = None) -> None:
        """Create a new conversation scoped to user (if provided)."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                title = title or f"Conversation {conversation_id[:8]}"
                now = datetime.now().isoformat()
                
                # Prevent duplicate for same user
                if self.db_type == 'postgresql':
                    if user_email:
                        cursor.execute("SELECT 1 FROM conversations WHERE id=%s AND user_email=%s", (conversation_id, user_email))
                    else:
                        cursor.execute("SELECT 1 FROM conversations WHERE id=%s AND user_email IS NULL", (conversation_id,))
                    if cursor.fetchone():
                        return
                    cursor.execute(
                        'INSERT INTO conversations (id, title, created_at, updated_at, message_count, user_email) VALUES (%s,%s,%s,%s,%s,%s)',
                        (conversation_id, title, now, now, 0, user_email)
                    )
                else:
                    if user_email:
                        cursor.execute('SELECT 1 FROM conversations WHERE id=? AND user_email=?', (conversation_id, user_email))
                    else:
                        cursor.execute('SELECT 1 FROM conversations WHERE id=? AND (user_email IS NULL OR user_email="")', (conversation_id,))
                    if cursor.fetchone():
                        return
                    cursor.execute(
                        'INSERT INTO conversations (id, title, created_at, updated_at, message_count, user_email) VALUES (?,?,?,?,?,?)',
                        (conversation_id, title, now, now, 0, user_email)
                    )
                
                conn.commit()
                logger.info(f"[DatabaseStore] Created conversation: {conversation_id}")
                
            except Exception as e:
                logger.error(f"Failed to create conversation {conversation_id}: {e}")
                conn.rollback()
                raise
            finally:
                conn.close()

    def save_message(self, conversation_id: str, message: Message, user_email: Optional[str] = None) -> None:
        """Save a message to specific conversation for user."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                # Ensure conversation exists
                self.create_conversation(conversation_id, user_email=user_email)
                
                # Prepare message data
                if not message.meta:
                    message.meta = {}
                message.meta["conversation_id"] = conversation_id
                if user_email:
                    message.meta["user_email"] = user_email
                
                timestamp = message.timestamp.isoformat() if hasattr(message.timestamp, 'isoformat') else str(message.timestamp)
                meta_json = json.dumps(message.meta) if message.meta else None
                
                if self.db_type == 'postgresql':
                    cursor.execute('''INSERT INTO messages (id, conversation_id, role, content, timestamp, meta, user_email) VALUES (%s,%s,%s,%s,%s,%s,%s)''',
                                   (message.id, conversation_id, message.role, message.content, timestamp, meta_json, user_email))
                    cursor.execute('''UPDATE conversations SET message_count=(SELECT COUNT(*) FROM messages WHERE conversation_id=%s AND (user_email=%s OR (%s IS NULL AND user_email IS NULL))), updated_at=%s WHERE id=%s AND (user_email=%s OR (%s IS NULL AND user_email IS NULL))''',
                                   (conversation_id, user_email, user_email, datetime.now().isoformat(), conversation_id, user_email, user_email))
                else:
                    cursor.execute('''INSERT INTO messages (id, conversation_id, role, content, timestamp, meta, user_email) VALUES (?,?,?,?,?,?,?)''',
                                   (message.id, conversation_id, message.role, message.content, timestamp, meta_json, user_email))
                    cursor.execute('''UPDATE conversations SET message_count=(SELECT COUNT(*) FROM messages WHERE conversation_id=? AND (user_email=? OR (? IS NULL AND (user_email IS NULL OR user_email="")))), updated_at=? WHERE id=? AND (user_email=? OR (? IS NULL AND (user_email IS NULL OR user_email="")))''',
                                   (conversation_id, user_email, user_email, datetime.now().isoformat(), conversation_id, user_email, user_email))
                
                conn.commit()
                logger.info(f"[DatabaseStore] Saved message to conversation: {conversation_id}")
                
            except Exception as e:
                logger.error(f"Failed to save message to {conversation_id}: {e}")
                conn.rollback()
                raise
            finally:
                conn.close()

    def load_conversation_history(self, conversation_id: str, limit: Optional[int] = None, user_email: Optional[str] = None) -> List[Message]:
        """Load chat history for a conversation (scoped by user)."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                params = [conversation_id]
                clause = "conversation_id = ?"
                if self.db_type == 'postgresql':
                    clause = "conversation_id = %s"
                if user_email:
                    clause += " AND user_email = %s" if self.db_type == 'postgresql' else " AND user_email = ?"
                    params.append(user_email)
                else:
                    clause += " AND (user_email IS NULL OR user_email='' )"
                if limit:
                    if self.db_type == 'postgresql':
                        cursor.execute(f'''SELECT id, role, content, timestamp, meta FROM messages WHERE {clause} ORDER BY created_at ASC LIMIT %s''', (*params, limit))
                    else:
                        cursor.execute(f'''SELECT id, role, content, timestamp, meta FROM messages WHERE {clause} ORDER BY created_at ASC LIMIT ?''', (*params, limit))
                else:
                    if self.db_type == 'postgresql':
                        cursor.execute(f'''SELECT id, role, content, timestamp, meta FROM messages WHERE {clause} ORDER BY created_at ASC''', params)
                    else:
                        cursor.execute(f'''SELECT id, role, content, timestamp, meta FROM messages WHERE {clause} ORDER BY created_at ASC''', params)
                rows = cursor.fetchall()
                messages: List[Message] = []
                for row in rows:
                    msg_id, role, content, timestamp_str, meta_json = row
                    
                    # Parse timestamp
                    try:
                        timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                    except Exception:
                        timestamp = datetime.now()
                    
                    # Parse meta
                    meta = json.loads(meta_json) if meta_json else {}
                    
                    messages.append(Message(id=msg_id, role=role, content=content, timestamp=timestamp, meta=meta))
                
                logger.info(f"[DatabaseStore] Loaded {len(messages)} messages for {conversation_id}")
                return messages
                
            except Exception as e:
                logger.error(f"Failed to load conversation {conversation_id}: {e}")
                return []
            finally:
                conn.close()

    def get_conversations(self, user_email: Optional[str]) -> List[dict]:
        """List conversations for a user."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                if user_email:
                    if self.db_type == 'postgresql':
                        cursor.execute('''SELECT id, title, created_at, updated_at, message_count FROM conversations WHERE user_email=%s ORDER BY updated_at DESC''', (user_email,))
                    else:
                        cursor.execute('''SELECT id, title, created_at, updated_at, message_count FROM conversations WHERE user_email=? ORDER BY updated_at DESC''', (user_email,))
                else:
                    # Legacy anonymous (should be none once all users have email)
                    cursor.execute('''SELECT id, title, created_at, updated_at, message_count FROM conversations WHERE user_email IS NULL OR user_email='' ORDER BY updated_at DESC''')
                
                rows = cursor.fetchall()
                return [
                    {"id": r[0], "title": r[1], "created_at": r[2], "updated_at": r[3], "message_count": r[4]} for r in rows
                ]
            except Exception as e:
                logger.error(f"Failed to get conversations: {e}")
                return []
            finally:
                conn.close()

    def clear_conversation(self, conversation_id: str, user_email: Optional[str]) -> None:
        """Clear specific conversation history."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                # Delete messages
                if self.db_type == 'postgresql':
                    cursor.execute('DELETE FROM messages WHERE conversation_id=%s AND user_email=%s', (conversation_id, user_email))
                    cursor.execute('UPDATE conversations SET message_count=0, updated_at=%s WHERE id=%s AND user_email=%s', (datetime.now().isoformat(), conversation_id, user_email))
                else:
                    cursor.execute('DELETE FROM messages WHERE conversation_id=? AND user_email=?', (conversation_id, user_email))
                    cursor.execute('UPDATE conversations SET message_count=0, updated_at=? WHERE id=? AND user_email=?', (datetime.now().isoformat(), conversation_id, user_email))
                
                conn.commit()
                logger.info(f"[DatabaseStore] Cleared conversation: {conversation_id}")
                
            except Exception as e:
                logger.error(f"Failed to clear conversation {conversation_id}: {e}")
                conn.rollback()
                raise
            finally:
                conn.close()

    def delete_conversation(self, conversation_id: str, user_email: Optional[str]) -> None:
        """Delete entire conversation."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                # Delete messages first (foreign key constraint)
                if self.db_type == 'postgresql':
                    cursor.execute('DELETE FROM messages WHERE conversation_id=%s AND user_email=%s', (conversation_id, user_email))
                    cursor.execute('DELETE FROM conversations WHERE id=%s AND user_email=%s', (conversation_id, user_email))
                else:
                    cursor.execute('DELETE FROM messages WHERE conversation_id=? AND user_email=?', (conversation_id, user_email))
                    cursor.execute('DELETE FROM conversations WHERE id=? AND user_email=?', (conversation_id, user_email))
                
                conn.commit()
                logger.info(f"[DatabaseStore] Deleted conversation: {conversation_id}")
                
            except Exception as e:
                logger.error(f"Failed to delete conversation {conversation_id}: {e}")
                conn.rollback()
                raise
            finally:
                conn.close()

    def update_conversation_title(self, conversation_id: str, title: str, user_email: Optional[str]) -> None:
        """Update conversation title."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                now = datetime.now().isoformat()
                if self.db_type == 'postgresql':
                    cursor.execute('UPDATE conversations SET title=%s, updated_at=%s WHERE id=%s AND user_email=%s', (title, now, conversation_id, user_email))
                else:
                    cursor.execute('UPDATE conversations SET title=?, updated_at=? WHERE id=? AND user_email=?', (title, now, conversation_id, user_email))
                
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
