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
        # Check USE_SUPABASE flag - if 0 or False, always use SQLite
        use_supabase = os.getenv('USE_SUPABASE', '0')
        force_sqlite = use_supabase in ('0', 'false', 'False', '')
        
        # Use DATABASE_URL from environment (for PostgreSQL) or fallback to SQLite
        self.db_url = os.getenv('DATABASE_URL') if not force_sqlite else None
        
        if self.db_url and self.db_url.startswith('postgresql://') and not force_sqlite:
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

    def _storage_id(self, conversation_id: str, user_email: Optional[str]) -> str:
        """Generate a per-user storage key to avoid global PK collisions.
        For authenticated users we namespace the id by email.
        Legacy rows (without namespacing) are still readable via fallback."""
        if user_email:
            return f"{user_email}__{conversation_id}"
        return conversation_id

    def _maybe_legacy_id(self, conversation_id: str, user_email: Optional[str]) -> Optional[str]:
        """If a legacy (non-namespaced) conversation exists for this user, return its id."""
        if not user_email:
            return None
        # Legacy pattern: id stored without namespacing but user_email column set.
        return conversation_id

    def create_conversation(self, conversation_id: str, title: str = None, user_email: Optional[str] = None) -> None:
        """Create a new conversation scoped to user (if provided). Uses namespaced storage id."""
        storage_id = self._storage_id(conversation_id, user_email)
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                title = title or f"Conversation {conversation_id[:8]}"
                now = datetime.now().isoformat()

                # Check existence with storage id (new scheme)
                if self.db_type == 'postgresql':
                    cursor.execute("SELECT 1 FROM conversations WHERE id=%s", (storage_id,))
                else:
                    cursor.execute("SELECT 1 FROM conversations WHERE id=?", (storage_id,))
                if cursor.fetchone():
                    return  # Already exists (this user's namespaced id)

                # Fallback: legacy record exists with plain id for this user? Do not insert new, reuse.
                legacy_id = self._maybe_legacy_id(conversation_id, user_email)
                if legacy_id and legacy_id != storage_id:
                    if self.db_type == 'postgresql':
                        cursor.execute("SELECT 1 FROM conversations WHERE id=%s AND user_email=%s", (legacy_id, user_email))
                    else:
                        cursor.execute("SELECT 1 FROM conversations WHERE id=? AND user_email=?", (legacy_id, user_email))
                    if cursor.fetchone():
                        return  # Legacy row present

                # Insert new namespaced row
                if self.db_type == 'postgresql':
                    cursor.execute(
                        'INSERT INTO conversations (id, title, created_at, updated_at, message_count, user_email) VALUES (%s,%s,%s,%s,%s,%s)',
                        (storage_id, title, now, now, 0, user_email)
                    )
                else:
                    cursor.execute(
                        'INSERT INTO conversations (id, title, created_at, updated_at, message_count, user_email) VALUES (?,?,?,?,?,?)',
                        (storage_id, title, now, now, 0, user_email)
                    )

                conn.commit()
                logger.info(f"[DatabaseStore] Created conversation: {conversation_id} (storage_id={storage_id})")
            except Exception as e:
                logger.error(f"Failed to create conversation {conversation_id}: {e}")
                conn.rollback()
                raise
            finally:
                conn.close()

    def save_message(self, conversation_id: str, message: Message, user_email: Optional[str] = None) -> None:
        """Save a message to specific conversation for user (namespaced id)."""
        storage_id = self._storage_id(conversation_id, user_email)
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                # Ensure conversation
                self.create_conversation(conversation_id, user_email=user_email)
                # Meta adjustments
                if not message.meta:
                    message.meta = {}
                message.meta["conversation_id"] = conversation_id  # external id
                if user_email:
                    message.meta["user_email"] = user_email
                timestamp = message.timestamp.isoformat() if hasattr(message.timestamp, 'isoformat') else str(message.timestamp)
                meta_json = json.dumps(message.meta) if message.meta else None
                if self.db_type == 'postgresql':
                    cursor.execute('''INSERT INTO messages (id, conversation_id, role, content, timestamp, meta, user_email) VALUES (%s,%s,%s,%s,%s,%s,%s)''',
                                   (message.id, storage_id, message.role, message.content, timestamp, meta_json, user_email))
                    cursor.execute('''UPDATE conversations SET message_count=(SELECT COUNT(*) FROM messages WHERE conversation_id=%s), updated_at=%s WHERE id=%s''',
                                   (storage_id, datetime.now().isoformat(), storage_id))
                else:
                    cursor.execute('''INSERT INTO messages (id, conversation_id, role, content, timestamp, meta, user_email) VALUES (?,?,?,?,?,?,?)''',
                                   (message.id, storage_id, message.role, message.content, timestamp, meta_json, user_email))
                    cursor.execute('''UPDATE conversations SET message_count=(SELECT COUNT(*) FROM messages WHERE conversation_id=?), updated_at=? WHERE id=?''',
                                   (storage_id, datetime.now().isoformat(), storage_id))
                conn.commit()
                logger.info(f"[DatabaseStore] Saved message to conversation: {conversation_id} (storage_id={storage_id})")
            except Exception as e:
                logger.error(f"Failed to save message to {conversation_id}: {e}")
                conn.rollback()
                raise
            finally:
                conn.close()

    def load_conversation_history(self, conversation_id: str, limit: Optional[int] = None, user_email: Optional[str] = None) -> List[Message]:
        storage_id = self._storage_id(conversation_id, user_email)
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                # Primary attempt (namespaced)
                params = [storage_id]
                clause = "conversation_id = ?"
                if self.db_type == 'postgresql':
                    clause = "conversation_id = %s"
                if limit:
                    if self.db_type == 'postgresql':
                        cursor.execute(f'''SELECT id, role, content, timestamp, meta FROM messages WHERE {clause} ORDER BY created_at ASC LIMIT %s''', (storage_id, limit))
                    else:
                        cursor.execute(f'''SELECT id, role, content, timestamp, meta FROM messages WHERE {clause} ORDER BY created_at ASC LIMIT ?''', (storage_id, limit))
                else:
                    if self.db_type == 'postgresql':
                        cursor.execute(f'''SELECT id, role, content, timestamp, meta FROM messages WHERE {clause} ORDER BY created_at ASC''', (storage_id,))
                    else:
                        cursor.execute(f'''SELECT id, role, content, timestamp, meta FROM messages WHERE {clause} ORDER BY created_at ASC''', (storage_id,))
                rows = cursor.fetchall()
                # Fallback legacy (plain id) if no rows
                if not rows and storage_id != conversation_id:
                    legacy_id = conversation_id
                    if limit:
                        if self.db_type == 'postgresql':
                            cursor.execute('''SELECT id, role, content, timestamp, meta FROM messages WHERE conversation_id=%s ORDER BY created_at ASC LIMIT %s''', (legacy_id, limit))
                        else:
                            cursor.execute('''SELECT id, role, content, timestamp, meta FROM messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT ?''', (legacy_id, limit))
                    else:
                        if self.db_type == 'postgresql':
                            cursor.execute('''SELECT id, role, content, timestamp, meta FROM messages WHERE conversation_id=%s ORDER BY created_at ASC''', (legacy_id,))
                        else:
                            cursor.execute('''SELECT id, role, content, timestamp, meta FROM messages WHERE conversation_id=? ORDER BY created_at ASC''', (legacy_id,))
                    rows = cursor.fetchall()
                messages: List[Message] = []
                for row in rows:
                    msg_id, role, content, timestamp_str, meta_json = row
                    try:
                        timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                    except Exception:
                        timestamp = datetime.now()
                    meta = json.loads(meta_json) if meta_json else {}
                    messages.append(Message(id=msg_id, role=role, content=content, timestamp=timestamp, meta=meta))
                logger.info(f"[DatabaseStore] Loaded {len(messages)} messages for {conversation_id} (storage_id={storage_id})")
                return messages
            except Exception as e:
                logger.error(f"Failed to load conversation {conversation_id}: {e}")
                return []
            finally:
                conn.close()

    def clear_conversation(self, conversation_id: str, user_email: Optional[str]) -> None:
        storage_id = self._storage_id(conversation_id, user_email)
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                if self.db_type == 'postgresql':
                    cursor.execute('DELETE FROM messages WHERE conversation_id=%s', (storage_id,))
                    cursor.execute('UPDATE conversations SET message_count=0, updated_at=%s WHERE id=%s', (datetime.now().isoformat(), storage_id))
                else:
                    cursor.execute('DELETE FROM messages WHERE conversation_id=?', (storage_id,))
                    cursor.execute('UPDATE conversations SET message_count=0, updated_at=? WHERE id=?', (datetime.now().isoformat(), storage_id))
                conn.commit()
                logger.info(f"[DatabaseStore] Cleared conversation: {conversation_id} (storage_id={storage_id})")
            except Exception as e:
                logger.error(f"Failed to clear conversation {conversation_id}: {e}")
                conn.rollback()
                raise
            finally:
                conn.close()

    def delete_conversation(self, conversation_id: str, user_email: Optional[str]) -> None:
        storage_id = self._storage_id(conversation_id, user_email)
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                if self.db_type == 'postgresql':
                    cursor.execute('DELETE FROM messages WHERE conversation_id=%s', (storage_id,))
                    cursor.execute('DELETE FROM conversations WHERE id=%s', (storage_id,))
                else:
                    cursor.execute('DELETE FROM messages WHERE conversation_id=?', (storage_id,))
                    cursor.execute('DELETE FROM conversations WHERE id=?', (storage_id,))
                conn.commit()
                logger.info(f"[DatabaseStore] Deleted conversation: {conversation_id} (storage_id={storage_id})")
            except Exception as e:
                logger.error(f"Failed to delete conversation {conversation_id}: {e}")
                conn.rollback()
                raise
            finally:
                conn.close()

    def update_conversation_title(self, conversation_id: str, title: str, user_email: Optional[str]) -> None:
        storage_id = self._storage_id(conversation_id, user_email)
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                if self.db_type == 'postgresql':
                    cursor.execute('UPDATE conversations SET title=%s, updated_at=%s WHERE id=%s', (title, datetime.now().isoformat(), storage_id))
                else:
                    cursor.execute('UPDATE conversations SET title=?, updated_at=? WHERE id=?', (title, datetime.now().isoformat(), storage_id))
                conn.commit()
                logger.info(f"[DatabaseStore] Updated title for conversation: {conversation_id} (storage_id={storage_id})")
            except Exception as e:
                logger.error(f"Failed to update conversation title {conversation_id}: {e}")
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

    def get_conversations(self, user_email: Optional[str] = None) -> List[Dict]:
        """Get list of conversations for a user (or all if no user_email provided)."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                if user_email:
                    # Get conversations for specific user (both namespaced and legacy)
                    if self.db_type == 'postgresql':
                        cursor.execute('''
                            SELECT id, title, created_at, updated_at, message_count, user_email 
                            FROM conversations 
                            WHERE user_email = %s OR id LIKE %s
                            ORDER BY updated_at DESC
                        ''', (user_email, f"{user_email}__%"))
                    else:
                        cursor.execute('''
                            SELECT id, title, created_at, updated_at, message_count, user_email 
                            FROM conversations 
                            WHERE user_email = ? OR id LIKE ?
                            ORDER BY updated_at DESC
                        ''', (user_email, f"{user_email}__%"))
                else:
                    # Get all conversations (for dev mode or admin)
                    cursor.execute('''
                        SELECT id, title, created_at, updated_at, message_count, user_email 
                        FROM conversations 
                        ORDER BY updated_at DESC
                    ''')
                
                rows = cursor.fetchall()
                conversations = []
                
                for row in rows:
                    conv_id, title, created_at, updated_at, message_count, conv_user_email = row
                    
                    # Extract original conversation_id from namespaced storage_id
                    original_id = conv_id
                    if user_email and conv_id.startswith(f"{user_email}__"):
                        original_id = conv_id[len(f"{user_email}__"):]
                    
                    conversations.append({
                        'id': original_id,  # Return original ID to frontend
                        'title': title,
                        'created_at': created_at,
                        'updated_at': updated_at,
                        'message_count': message_count or 0,
                        'user_email': conv_user_email
                    })
                
                logger.info(f"[DatabaseStore] Retrieved {len(conversations)} conversations for user: {user_email}")
                return conversations
                
            except Exception as e:
                logger.error(f"Failed to get conversations for user {user_email}: {e}")
                return []
            finally:
                conn.close()
