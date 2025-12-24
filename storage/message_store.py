"""
Separate Message Database Store

This module provides a dedicated database for message storage,
separate from the conversation metadata store.

Features:
- Independent message storage
- Full-text search on messages
- Message versioning
- Soft deletes
- Message attachments support
- Efficient querying by various criteria
"""

import json
import logging
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
import os
import hashlib

logger = logging.getLogger(__name__)


class MessageDatabaseStore:
    """Dedicated database for message storage."""

    def __init__(self, db_path: str = None):
        self.db_path = self._resolve_db_path(db_path)
        self._lock = threading.RLock()
        self._init_tables()
        logger.info(f"MessageDatabaseStore initialized: {self.db_path}")

    def _resolve_db_path(self, db_path: str = None) -> Path:
        """Resolve database path."""
        if db_path:
            return Path(db_path)
        
        # Determine storage directory
        if os.path.exists('/app'):
            storage_dir = Path('/app/data')
        else:
            storage_dir = Path(__file__).parent.parent / "data"
        
        storage_dir.mkdir(parents=True, exist_ok=True)
        return storage_dir / "messages.db"

    def _get_connection(self) -> sqlite3.Connection:
        """Get database connection."""
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        # Enable foreign keys
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_tables(self):
        """Initialize database tables."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                # Main messages table
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS messages (
                        id TEXT PRIMARY KEY,
                        conversation_id TEXT NOT NULL,
                        user_email TEXT,
                        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
                        content TEXT NOT NULL,
                        content_hash TEXT,
                        timestamp TEXT NOT NULL,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        deleted_at TEXT,
                        version INTEGER DEFAULT 1,
                        parent_message_id TEXT,
                        FOREIGN KEY (parent_message_id) REFERENCES messages(id)
                    )
                ''')
                
                # Message metadata table (for extensibility)
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS message_meta (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        message_id TEXT NOT NULL,
                        key TEXT NOT NULL,
                        value TEXT,
                        value_type TEXT DEFAULT 'string',
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
                        UNIQUE(message_id, key)
                    )
                ''')
                
                # Message tokens/usage tracking
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS message_tokens (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        message_id TEXT NOT NULL UNIQUE,
                        tokens_in INTEGER,
                        tokens_out INTEGER,
                        thinking_tokens INTEGER,
                        total_tokens INTEGER,
                        estimated_cost REAL,
                        provider TEXT,
                        model TEXT,
                        latency_ms REAL,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
                    )
                ''')
                
                # Message attachments
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS message_attachments (
                        id TEXT PRIMARY KEY,
                        message_id TEXT NOT NULL,
                        filename TEXT,
                        content_type TEXT,
                        size_bytes INTEGER,
                        storage_path TEXT,
                        checksum TEXT,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
                    )
                ''')
                
                # Message reactions/feedback
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS message_feedback (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        message_id TEXT NOT NULL,
                        user_email TEXT,
                        feedback_type TEXT CHECK(feedback_type IN ('like', 'dislike', 'flag', 'regenerate')),
                        comment TEXT,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
                    )
                ''')
                
                # Thinking/reasoning steps
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS thinking_steps (
                        id TEXT PRIMARY KEY,
                        message_id TEXT NOT NULL,
                        step_index INTEGER NOT NULL,
                        stage TEXT,
                        content TEXT NOT NULL,
                        duration_ms REAL,
                        tokens_used INTEGER,
                        timestamp TEXT NOT NULL,
                        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
                    )
                ''')
                
                # Multi-model responses
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS multi_model_responses (
                        id TEXT PRIMARY KEY,
                        parent_message_id TEXT NOT NULL,
                        provider TEXT NOT NULL,
                        model TEXT NOT NULL,
                        content TEXT,
                        latency_ms REAL,
                        tokens_used INTEGER,
                        success INTEGER DEFAULT 1,
                        error TEXT,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (parent_message_id) REFERENCES messages(id) ON DELETE CASCADE
                    )
                ''')
                
                # Indexes for efficient querying
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_email)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_deleted ON messages(deleted_at)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_message_meta_key ON message_meta(message_id, key)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_thinking_message ON thinking_steps(message_id)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_multi_model_parent ON multi_model_responses(parent_message_id)')
                
                # Full-text search
                cursor.execute('''
                    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                        content,
                        content=messages,
                        content_rowid=rowid
                    )
                ''')
                
                conn.commit()
                logger.info("Message database tables initialized")
                
            except Exception as e:
                logger.error(f"Failed to initialize message tables: {e}")
                conn.rollback()
                raise
            finally:
                conn.close()

    def save_message(
        self,
        message_id: str,
        conversation_id: str,
        role: str,
        content: str,
        timestamp: datetime,
        user_email: Optional[str] = None,
        meta: Optional[Dict[str, Any]] = None,
        parent_message_id: Optional[str] = None
    ) -> bool:
        """Save a message to the database."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                now = datetime.now().isoformat()
                ts_str = timestamp.isoformat() if hasattr(timestamp, 'isoformat') else str(timestamp)
                content_hash = hashlib.sha256(content.encode()).hexdigest()[:16]
                
                # Insert message
                cursor.execute('''
                    INSERT OR REPLACE INTO messages 
                    (id, conversation_id, user_email, role, content, content_hash, timestamp, updated_at, parent_message_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (message_id, conversation_id, user_email, role, content, content_hash, ts_str, now, parent_message_id))
                
                # Save metadata
                if meta:
                    # Extract token usage
                    tokens_in = meta.get('tokens_in')
                    tokens_out = meta.get('tokens_out')
                    thinking_tokens = meta.get('thinking_tokens') or meta.get('thought_tokens')
                    total_tokens = (tokens_in or 0) + (tokens_out or 0) + (thinking_tokens or 0)
                    estimated_cost = meta.get('estimated_cost')
                    provider = meta.get('provider')
                    model = meta.get('model')
                    latency_ms = meta.get('latency_ms')
                    
                    if tokens_in or tokens_out or thinking_tokens:
                        cursor.execute('''
                            INSERT OR REPLACE INTO message_tokens
                            (message_id, tokens_in, tokens_out, thinking_tokens, total_tokens, 
                             estimated_cost, provider, model, latency_ms)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (message_id, tokens_in, tokens_out, thinking_tokens, total_tokens,
                              estimated_cost, provider, model, latency_ms))
                    
                    # Save other metadata as key-value pairs
                    skip_keys = {'tokens_in', 'tokens_out', 'thinking_tokens', 'thought_tokens', 
                                'estimated_cost', 'provider', 'model', 'latency_ms', 'conversation_id', 'user_email'}
                    for key, value in meta.items():
                        if key not in skip_keys and value is not None:
                            value_type = type(value).__name__
                            value_str = json.dumps(value) if isinstance(value, (dict, list)) else str(value)
                            cursor.execute('''
                                INSERT OR REPLACE INTO message_meta (message_id, key, value, value_type)
                                VALUES (?, ?, ?, ?)
                            ''', (message_id, key, value_str, value_type))
                
                # Update FTS index
                cursor.execute('''
                    INSERT INTO messages_fts(rowid, content) 
                    SELECT rowid, content FROM messages WHERE id = ?
                ''', (message_id,))
                
                conn.commit()
                return True
                
            except Exception as e:
                logger.error(f"Failed to save message {message_id}: {e}")
                conn.rollback()
                return False
            finally:
                conn.close()

    def get_messages(
        self,
        conversation_id: str,
        user_email: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
        include_deleted: bool = False,
        roles: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Get messages for a conversation."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                query = '''
                    SELECT m.*, 
                           mt.tokens_in, mt.tokens_out, mt.thinking_tokens, 
                           mt.total_tokens, mt.estimated_cost, mt.latency_ms,
                           mt.provider as token_provider, mt.model as token_model
                    FROM messages m
                    LEFT JOIN message_tokens mt ON m.id = mt.message_id
                    WHERE m.conversation_id = ?
                '''
                params = [conversation_id]
                
                if user_email:
                    query += ' AND m.user_email = ?'
                    params.append(user_email)
                
                if not include_deleted:
                    query += ' AND m.deleted_at IS NULL'
                
                if roles:
                    placeholders = ','.join('?' * len(roles))
                    query += f' AND m.role IN ({placeholders})'
                    params.extend(roles)
                
                query += ' ORDER BY m.timestamp ASC'
                
                if limit:
                    query += f' LIMIT {limit} OFFSET {offset}'
                
                cursor.execute(query, params)
                rows = cursor.fetchall()
                
                messages = []
                for row in rows:
                    msg = dict(row)
                    
                    # Get additional metadata
                    cursor.execute(
                        'SELECT key, value, value_type FROM message_meta WHERE message_id = ?',
                        (msg['id'],)
                    )
                    meta = {}
                    for meta_row in cursor.fetchall():
                        key, value, value_type = meta_row
                        if value_type in ('dict', 'list'):
                            meta[key] = json.loads(value)
                        elif value_type == 'int':
                            meta[key] = int(value)
                        elif value_type == 'float':
                            meta[key] = float(value)
                        elif value_type == 'bool':
                            meta[key] = value.lower() == 'true'
                        else:
                            meta[key] = value
                    
                    # Build meta from tokens and other data
                    if msg.get('tokens_in') or msg.get('tokens_out'):
                        meta['tokens_in'] = msg.get('tokens_in')
                        meta['tokens_out'] = msg.get('tokens_out')
                        meta['thinking_tokens'] = msg.get('thinking_tokens')
                        meta['total_tokens'] = msg.get('total_tokens')
                        meta['estimated_cost'] = msg.get('estimated_cost')
                        meta['latency_ms'] = msg.get('latency_ms')
                    
                    if msg.get('token_provider'):
                        meta['provider'] = msg.get('token_provider')
                    if msg.get('token_model'):
                        meta['model'] = msg.get('token_model')
                    
                    messages.append({
                        'id': msg['id'],
                        'conversation_id': msg['conversation_id'],
                        'role': msg['role'],
                        'content': msg['content'],
                        'timestamp': msg['timestamp'],
                        'meta': meta if meta else None
                    })
                
                return messages
                
            except Exception as e:
                logger.error(f"Failed to get messages: {e}")
                return []
            finally:
                conn.close()

    def search_messages(
        self,
        query: str,
        conversation_id: Optional[str] = None,
        user_email: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Full-text search on messages."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                sql = '''
                    SELECT m.*, snippet(messages_fts, 0, '<mark>', '</mark>', '...', 64) as snippet
                    FROM messages m
                    JOIN messages_fts ON m.rowid = messages_fts.rowid
                    WHERE messages_fts MATCH ?
                '''
                params = [query]
                
                if conversation_id:
                    sql += ' AND m.conversation_id = ?'
                    params.append(conversation_id)
                
                if user_email:
                    sql += ' AND m.user_email = ?'
                    params.append(user_email)
                
                sql += ' AND m.deleted_at IS NULL ORDER BY rank LIMIT ?'
                params.append(limit)
                
                cursor.execute(sql, params)
                rows = cursor.fetchall()
                
                return [dict(row) for row in rows]
                
            except Exception as e:
                logger.error(f"Search failed: {e}")
                return []
            finally:
                conn.close()

    def soft_delete_message(self, message_id: str) -> bool:
        """Soft delete a message."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                now = datetime.now().isoformat()
                cursor.execute(
                    'UPDATE messages SET deleted_at = ? WHERE id = ?',
                    (now, message_id)
                )
                conn.commit()
                return cursor.rowcount > 0
            except Exception as e:
                logger.error(f"Failed to delete message: {e}")
                conn.rollback()
                return False
            finally:
                conn.close()

    def save_thinking_step(
        self,
        step_id: str,
        message_id: str,
        step_index: int,
        content: str,
        stage: str = "reasoning",
        duration_ms: Optional[float] = None,
        tokens_used: Optional[int] = None,
        timestamp: Optional[datetime] = None
    ) -> bool:
        """Save a thinking/reasoning step."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                ts = (timestamp or datetime.now()).isoformat()
                
                cursor.execute('''
                    INSERT INTO thinking_steps 
                    (id, message_id, step_index, stage, content, duration_ms, tokens_used, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (step_id, message_id, step_index, stage, content, duration_ms, tokens_used, ts))
                
                conn.commit()
                return True
            except Exception as e:
                logger.error(f"Failed to save thinking step: {e}")
                conn.rollback()
                return False
            finally:
                conn.close()

    def get_thinking_steps(self, message_id: str) -> List[Dict[str, Any]]:
        """Get all thinking steps for a message."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT * FROM thinking_steps 
                    WHERE message_id = ? 
                    ORDER BY step_index ASC
                ''', (message_id,))
                return [dict(row) for row in cursor.fetchall()]
            except Exception as e:
                logger.error(f"Failed to get thinking steps: {e}")
                return []
            finally:
                conn.close()

    def save_multi_model_response(
        self,
        response_id: str,
        parent_message_id: str,
        provider: str,
        model: str,
        content: Optional[str],
        latency_ms: Optional[float] = None,
        tokens_used: Optional[int] = None,
        success: bool = True,
        error: Optional[str] = None
    ) -> bool:
        """Save a multi-model response."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                cursor.execute('''
                    INSERT INTO multi_model_responses
                    (id, parent_message_id, provider, model, content, latency_ms, tokens_used, success, error)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (response_id, parent_message_id, provider, model, content, 
                      latency_ms, tokens_used, 1 if success else 0, error))
                
                conn.commit()
                return True
            except Exception as e:
                logger.error(f"Failed to save multi-model response: {e}")
                conn.rollback()
                return False
            finally:
                conn.close()

    def get_multi_model_responses(self, parent_message_id: str) -> List[Dict[str, Any]]:
        """Get all multi-model responses for a message."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT * FROM multi_model_responses 
                    WHERE parent_message_id = ?
                    ORDER BY created_at ASC
                ''', (parent_message_id,))
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
            except Exception as e:
                logger.error(f"Failed to get multi-model responses: {e}")
                return []
            finally:
                conn.close()

    def add_feedback(
        self,
        message_id: str,
        feedback_type: str,
        user_email: Optional[str] = None,
        comment: Optional[str] = None
    ) -> bool:
        """Add feedback to a message."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO message_feedback (message_id, user_email, feedback_type, comment)
                    VALUES (?, ?, ?, ?)
                ''', (message_id, user_email, feedback_type, comment))
                conn.commit()
                return True
            except Exception as e:
                logger.error(f"Failed to add feedback: {e}")
                conn.rollback()
                return False
            finally:
                conn.close()

    def get_stats(self, conversation_id: Optional[str] = None, user_email: Optional[str] = None) -> Dict[str, Any]:
        """Get statistics about messages."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                
                base_query = "FROM messages WHERE deleted_at IS NULL"
                params = []
                
                if conversation_id:
                    base_query += " AND conversation_id = ?"
                    params.append(conversation_id)
                if user_email:
                    base_query += " AND user_email = ?"
                    params.append(user_email)
                
                # Total messages
                cursor.execute(f"SELECT COUNT(*) {base_query}", params)
                total_messages = cursor.fetchone()[0]
                
                # By role
                cursor.execute(f"SELECT role, COUNT(*) {base_query} GROUP BY role", params)
                by_role = dict(cursor.fetchall())
                
                # Token stats
                token_query = f'''
                    SELECT 
                        SUM(mt.tokens_in) as total_in,
                        SUM(mt.tokens_out) as total_out,
                        SUM(mt.thinking_tokens) as total_thinking,
                        SUM(mt.estimated_cost) as total_cost
                    FROM message_tokens mt
                    JOIN messages m ON mt.message_id = m.id
                    WHERE m.deleted_at IS NULL
                '''
                if conversation_id:
                    token_query += " AND m.conversation_id = ?"
                if user_email:
                    token_query += " AND m.user_email = ?"
                
                cursor.execute(token_query, params)
                token_row = cursor.fetchone()
                
                return {
                    "total_messages": total_messages,
                    "by_role": by_role,
                    "tokens": {
                        "total_in": token_row[0] or 0,
                        "total_out": token_row[1] or 0,
                        "total_thinking": token_row[2] or 0,
                        "estimated_cost": token_row[3] or 0
                    }
                }
                
            except Exception as e:
                logger.error(f"Failed to get stats: {e}")
                return {}
            finally:
                conn.close()


# Global instance
_message_store: Optional[MessageDatabaseStore] = None


def get_message_store() -> MessageDatabaseStore:
    """Get or create global message store instance."""
    global _message_store
    if _message_store is None:
        _message_store = MessageDatabaseStore()
    return _message_store
