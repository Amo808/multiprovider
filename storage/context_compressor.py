"""
Context Compressor Module
Интеграция LangChain + RAG с автоматическим сжатием контекста для чата.

Функции:
- Автоматическое сжатие старых сообщений
- RAG-поиск релевантных сообщений
- Управление порядком сообщений в JSON
- Token-aware контекст билдинг
"""

import re
import json
import copy
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

# Optional imports with fallbacks
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    np = None  # type: ignore
    HAS_NUMPY = False

logger = logging.getLogger(__name__)

# Lazy imports для sentence-transformers (опционально)
_embed_model = None
_embed_model_failed = False  # Flag to avoid repeated failed attempts
_nltk_initialized = False


def _init_nltk():
    """Инициализация NLTK для токенизации предложений."""
    global _nltk_initialized
    if _nltk_initialized:
        return True
    try:
        import nltk
        try:
            nltk.data.find('tokenizers/punkt')
        except LookupError:
            nltk.download('punkt', quiet=True)
        _nltk_initialized = True
        return True
    except ImportError:
        logger.warning("nltk not installed, using simple sentence splitting")
        _nltk_initialized = True
        return False


def _get_embed_model(model_name: str = 'all-MiniLM-L6-v2'):
    """Lazy loading эмбеддинг модели с обработкой таймаута."""
    global _embed_model, _embed_model_failed
    
    # If model already failed to load, don't try again
    if _embed_model_failed:
        return None
        
    if _embed_model is None:
        try:
            # Try to load from local cache first (offline mode)
            import os
            os.environ['HF_HUB_OFFLINE'] = '1'  # Force offline mode first
            
            from sentence_transformers import SentenceTransformer
            try:
                _embed_model = SentenceTransformer(model_name, local_files_only=True)
                logger.info(f"Loaded embedding model from cache: {model_name}")
            except Exception:
                # Model not in cache, try online but with short timeout
                os.environ.pop('HF_HUB_OFFLINE', None)
                import socket
                old_timeout = socket.getdefaulttimeout()
                socket.setdefaulttimeout(5)  # 5 second timeout
                try:
                    _embed_model = SentenceTransformer(model_name)
                    logger.info(f"Downloaded embedding model: {model_name}")
                except Exception as e:
                    logger.warning(f"Could not load embedding model (network issue): {e}")
                    _embed_model_failed = True
                    return None
                finally:
                    socket.setdefaulttimeout(old_timeout)
                    
        except ImportError:
            logger.warning("sentence-transformers not installed, embeddings disabled")
            _embed_model_failed = True
            return None
        except Exception as e:
            logger.warning(f"Failed to load embedding model: {e}")
            _embed_model_failed = True
            return None
    return _embed_model


def _sent_tokenize(text: str) -> List[str]:
    """Токенизация предложений с фолбэком."""
    if _init_nltk():
        try:
            import nltk
            return nltk.sent_tokenize(text)
        except Exception:
            pass
    # Простой фолбэк
    return [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]


def _cosine_similarity(a, b) -> float:
    """Косинусное сходство между векторами."""
    if not HAS_NUMPY or a is None or b is None:
        return 0.0
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


@dataclass
class CompressedMessage:
    """Структура сжатого сообщения."""
    id: str
    role: str  # 'user', 'assistant', 'system'
    content: str
    timestamp: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    compressed: bool = False
    original_length: int = 0
    compression_ratio: float = 1.0
    
    def to_dict(self) -> Dict:
        return {
            'id': self.id,
            'role': self.role,
            'content': self.content,
            'timestamp': self.timestamp,
            'metadata': self.metadata,
            'compressed': self.compressed,
            'original_length': self.original_length,
            'compression_ratio': self.compression_ratio
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'CompressedMessage':
        return cls(
            id=data.get('id', ''),
            role=data.get('role', 'user'),
            content=data.get('content', ''),
            timestamp=data.get('timestamp', datetime.now().isoformat()),
            metadata=data.get('metadata', {}),
            compressed=data.get('compressed', False),
            original_length=data.get('original_length', 0),
            compression_ratio=data.get('compression_ratio', 1.0)
        )


class ContextCompressor:
    """
    Компрессор контекста чата с поддержкой RAG.
    
    Использование:
        compressor = ContextCompressor(max_context_tokens=4000)
        
        # Добавление сообщений
        compressor.add_message('user', 'Привет!')
        compressor.add_message('assistant', 'Привет! Чем могу помочь?')
        
        # Построение сжатого контекста
        context = compressor.build_context('Новый вопрос')
    """
    
    # Паттерны для удаления филлеров
    FILLER_PATTERNS = [
        r'\b(um|uh|well|so|basically|actually|you know|i mean|like)\b',
        r'^(hi|hello|hey|greetings|привет|здравствуй)[,!.\s]*',
        r'(thanks|thank you|спасибо)[,!.\s]*$',
        r'\b(very|really|just|quite|pretty much)\b',
    ]
    
    # Настройки chunking для длинных сообщений
    CHUNK_SIZE = 500  # Размер чанка в символах
    CHUNK_OVERLAP = 100  # Перекрытие между чанками
    LONG_MESSAGE_THRESHOLD = 800  # Порог для разбиения на чанки
    
    def __init__(
        self,
        max_context_tokens: int = 4000,
        compression_threshold: int = 400,
        keep_recent_messages: int = 4,
        enable_embeddings: bool = True,
        embed_model_name: str = 'all-MiniLM-L6-v2',
        enable_chunking: bool = True  # NEW: включить chunking для длинных сообщений
    ):
        """
        Инициализация компрессора.
        
        Args:
            max_context_tokens: Максимум токенов в контексте
            compression_threshold: Порог для сжатия (в символах)
            keep_recent_messages: Количество недавних сообщений без сжатия
            enable_embeddings: Использовать эмбеддинги для RAG
            embed_model_name: Название модели для эмбеддингов
            enable_chunking: Разбивать длинные сообщения на чанки для RAG
        """
        self.max_context_tokens = max_context_tokens
        self.compression_threshold = compression_threshold
        self.keep_recent_messages = keep_recent_messages
        self.enable_embeddings = enable_embeddings
        self.embed_model_name = embed_model_name
        self.enable_chunking = enable_chunking
        
        # Хранилище сообщений
        self.messages: List[CompressedMessage] = []
        
        # Индекс эмбеддингов для RAG (message-level)
        self.embeddings_index: List[Tuple[Any, int]] = []  # (embedding, message_index)
        
        # NEW: Индекс чанков для длинных сообщений
        # (embedding, message_index, chunk_index, chunk_text)
        self.chunk_index: List[Tuple[Any, int, int, str]] = []
        
        # Статистика
        self.stats = {
            'total_compressed': 0,
            'tokens_saved': 0,
            'compression_calls': 0,
            'chunks_created': 0,
            'chunk_retrievals': 0
        }
    
    def _estimate_tokens(self, text: str) -> int:
        """Примерная оценка токенов (4 символа ~ 1 токен)."""
        return len(text) // 4 + 1
    
    def _compress_text(self, text: str, aggressive: bool = False) -> Tuple[str, float]:
        """
        Сжатие текста с сохранением смысла.
        
        Returns:
            (compressed_text, compression_ratio)
        """
        original_length = len(text)
        if original_length <= self.compression_threshold and not aggressive:
            return text, 1.0
        
        compressed = text
        
        # 1. Удаление филлеров
        for pattern in self.FILLER_PATTERNS:
            compressed = re.sub(pattern, '', compressed, flags=re.IGNORECASE)
        
        # 2. Нормализация пробелов
        compressed = re.sub(r'\s+', ' ', compressed).strip()
        
        # 3. Удаление повторяющихся знаков препинания
        compressed = re.sub(r'([.!?])\1+', r'\1', compressed)
        
        # 4. Если всё ещё большое — извлечение ключевых предложений
        if len(compressed) > self.compression_threshold:
            sentences = _sent_tokenize(compressed)
            if len(sentences) > 2:
                # Берём первое, последнее и среднее предложения
                if len(sentences) >= 4:
                    mid_idx = len(sentences) // 2
                    compressed = f"{sentences[0]} [...] {sentences[mid_idx]} [...] {sentences[-1]}"
                else:
                    compressed = f"{sentences[0]} [...] {sentences[-1]}"
        
        ratio = len(compressed) / original_length if original_length > 0 else 1.0
        return compressed, ratio
    
    def _get_embedding(self, text: str) -> Optional[Any]:
        """Получение эмбеддинга для текста."""
        if not self.enable_embeddings or not HAS_NUMPY:
            return None
        
        model = _get_embed_model(self.embed_model_name)
        if model is None:
            return None
        
        try:
            return model.encode([text])[0]
        except Exception as e:
            logger.warning(f"Failed to get embedding: {e}")
            return None
    
    def add_message(
        self,
        role: str,
        content: str,
        message_id: str = None,
        timestamp: str = None,
        metadata: Dict = None
    ) -> CompressedMessage:
        """
        Добавление нового сообщения.
        
        Args:
            role: Роль (user/assistant/system)
            content: Содержимое сообщения
            message_id: ID сообщения (генерируется если не указан)
            timestamp: Временная метка (генерируется если не указана)
            metadata: Дополнительные метаданные
        
        Returns:
            Добавленное сообщение
        """
        import uuid
        
        msg = CompressedMessage(
            id=message_id or str(uuid.uuid4()),
            role=role,
            content=content,
            timestamp=timestamp or datetime.now().isoformat(),
            metadata=metadata or {},
            original_length=len(content)
        )
        
        self.messages.append(msg)
        
        # Добавляем эмбеддинг в индекс
        if self.enable_embeddings:
            emb = self._get_embedding(content)
            if emb is not None:
                self.embeddings_index.append((emb, len(self.messages) - 1))
        
        # NEW: Индексация чанков для длинных сообщений
        self._index_message_chunks(len(self.messages) - 1, content)
        
        return msg
    
    def _split_into_chunks(self, text: str) -> List[str]:
        """
        Разбиение текста на семантические чанки.
        
        Сначала пытаемся разбить по предложениям, затем по размеру.
        """
        if len(text) <= self.LONG_MESSAGE_THRESHOLD:
            return [text]  # Не нужно разбивать
        
        chunks = []
        sentences = _sent_tokenize(text)
        
        current_chunk = ""
        for sentence in sentences:
            # Если добавление предложения превысит размер чанка
            if len(current_chunk) + len(sentence) > self.CHUNK_SIZE:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = sentence
            else:
                current_chunk = (current_chunk + " " + sentence).strip()
        
        # Добавляем остаток
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        # Если чанки всё ещё слишком большие, разбиваем по символам
        final_chunks = []
        for chunk in chunks:
            if len(chunk) > self.CHUNK_SIZE * 1.5:
                # Разбиваем большой чанк
                for i in range(0, len(chunk), self.CHUNK_SIZE - self.CHUNK_OVERLAP):
                    final_chunks.append(chunk[i:i + self.CHUNK_SIZE])
            else:
                final_chunks.append(chunk)
        
        return final_chunks if final_chunks else [text]
    
    def _index_message_chunks(self, message_index: int, content: str):
        """
        Индексация чанков сообщения для RAG-поиска.
        
        Args:
            message_index: Индекс сообщения в self.messages
            content: Содержимое сообщения
        """
        if not self.enable_chunking:
            return
        
        if len(content) < self.LONG_MESSAGE_THRESHOLD:
            return  # Сообщение слишком короткое для разбиения
        
        chunks = self._split_into_chunks(content)
        
        if len(chunks) <= 1:
            return  # Не удалось разбить на чанки
        
        logger.debug(f"Indexing {len(chunks)} chunks for message {message_index}")
        
        for chunk_idx, chunk_text in enumerate(chunks):
            emb = self._get_embedding(chunk_text)
            if emb is not None:
                self.chunk_index.append((emb, message_index, chunk_idx, chunk_text))
                self.stats['chunks_created'] += 1
    
    def _retrieve_relevant_chunks(
        self,
        query: str,
        top_k: int = 5,
        exclude_recent: int = 0,
        similarity_threshold: float = 0.3
    ) -> List[Tuple[int, int, str, float]]:
        """
        RAG: поиск релевантных чанков из длинных сообщений.
        
        Args:
            query: Поисковый запрос
            top_k: Количество результатов
            exclude_recent: Исключить последние N сообщений
            similarity_threshold: Минимальный порог сходства
        
        Returns:
            Список кортежей (message_index, chunk_index, chunk_text, score)
        """
        if not self.chunk_index or not self.enable_embeddings:
            return []
        
        q_emb = self._get_embedding(query)
        if q_emb is None:
            return []
        
        # Вычисляем сходство для каждого чанка
        scored = []
        excluded_indices = set(range(len(self.messages) - exclude_recent, len(self.messages)))
        
        for emb, msg_idx, chunk_idx, chunk_text in self.chunk_index:
            if msg_idx in excluded_indices:
                continue
            score = _cosine_similarity(q_emb, emb)
            if score >= similarity_threshold:
                scored.append((msg_idx, chunk_idx, chunk_text, score))
        
        # Сортируем по сходству
        scored.sort(key=lambda x: x[3], reverse=True)
        
        self.stats['chunk_retrievals'] += 1
        
        return scored[:top_k]

    def _retrieve_relevant(self, query: str, top_k: int = 5, exclude_recent: int = 0) -> List[int]:
        """
        RAG: поиск релевантных сообщений по запросу.
        
        Args:
            query: Поисковый запрос
            top_k: Количество результатов
            exclude_recent: Исключить последние N сообщений
        
        Returns:
            Индексы релевантных сообщений
        """
        if not self.embeddings_index or not self.enable_embeddings:
            return []
        
        q_emb = self._get_embedding(query)
        if q_emb is None:
            return []
        
        # Вычисляем сходство
        scored = []
        excluded_indices = set(range(len(self.messages) - exclude_recent, len(self.messages)))
        
        for emb, idx in self.embeddings_index:
            if idx in excluded_indices:
                continue
            score = _cosine_similarity(q_emb, emb)
            scored.append((score, idx))
        
        # Сортируем по сходству
        scored.sort(key=lambda x: x[0], reverse=True)
        
        return [idx for _, idx in scored[:top_k]]
    
    def build_context(
        self,
        current_query: str,
        system_prompt: str = None,
        include_relevant: bool = True
    ) -> Dict[str, Any]:
        """
        Построение оптимального контекста для LLM.
        
        Args:
            current_query: Текущий запрос пользователя
            system_prompt: Системный промпт (опционально)
            include_relevant: Включать релевантные старые сообщения
        
        Returns:
            Словарь с контекстом и статистикой
        """
        result = {
            'system_prompt': system_prompt or '',
            'recent_messages': [],
            'context_messages': [],
            'relevant_chunks': [],  # NEW: релевантные чанки из длинных сообщений
            'current_query': current_query,
            'stats': {}
        }
        
        total_tokens = self._estimate_tokens(system_prompt or '')
        
        # 1. Недавние сообщения (без сжатия)
        recent_start = max(0, len(self.messages) - self.keep_recent_messages)
        for msg in self.messages[recent_start:]:
            result['recent_messages'].append(msg.to_dict())
            total_tokens += self._estimate_tokens(msg.content)
        
        # 2. Релевантные старые сообщения (сжатые)
        if include_relevant and len(self.messages) > self.keep_recent_messages:
            # NEW: Сначала ищем релевантные чанки из длинных сообщений
            if self.enable_chunking and self.chunk_index:
                relevant_chunks = self._retrieve_relevant_chunks(
                    current_query,
                    top_k=5,
                    exclude_recent=self.keep_recent_messages,
                    similarity_threshold=0.35
                )
                
                # Добавляем релевантные чанки
                seen_messages = set()
                for msg_idx, chunk_idx, chunk_text, score in relevant_chunks:
                    tokens = self._estimate_tokens(chunk_text)
                    if total_tokens + tokens < self.max_context_tokens:
                        msg = self.messages[msg_idx]
                        result['relevant_chunks'].append({
                            'message_id': msg.id,
                            'message_index': msg_idx,
                            'chunk_index': chunk_idx,
                            'role': msg.role,
                            'content': chunk_text,
                            'similarity_score': round(score, 3),
                            'timestamp': msg.timestamp
                        })
                        total_tokens += tokens
                        seen_messages.add(msg_idx)
                        logger.debug(f"Added chunk {chunk_idx} from message {msg_idx} (score: {score:.3f})")
            else:
                seen_messages = set()
            
            # Затем ищем целые сообщения (для коротких или если чанков мало)
            relevant_indices = self._retrieve_relevant(
                current_query,
                top_k=5,
                exclude_recent=self.keep_recent_messages
            )
            
            for idx in relevant_indices:
                # Пропускаем если уже добавили чанки из этого сообщения
                if idx in seen_messages:
                    continue
                    
                msg = self.messages[idx]
                
                # Сжимаем сообщение
                compressed_content, ratio = self._compress_text(msg.content)
                tokens = self._estimate_tokens(compressed_content)
                
                if total_tokens + tokens < self.max_context_tokens:
                    compressed_msg = CompressedMessage(
                        id=msg.id,
                        role=msg.role,
                        content=compressed_content,
                        timestamp=msg.timestamp,
                        metadata={**msg.metadata, 'original_index': idx},
                        compressed=ratio < 1.0,
                        original_length=msg.original_length,
                        compression_ratio=ratio
                    )
                    result['context_messages'].append(compressed_msg.to_dict())
                    total_tokens += tokens
                    
                    if ratio < 1.0:
                        self.stats['total_compressed'] += 1
                        self.stats['tokens_saved'] += self._estimate_tokens(msg.content) - tokens
        
        self.stats['compression_calls'] += 1
        
        result['stats'] = {
            'total_tokens_estimate': total_tokens,
            'max_tokens': self.max_context_tokens,
            'recent_count': len(result['recent_messages']),
            'context_count': len(result['context_messages']),
            'chunks_count': len(result.get('relevant_chunks', [])),  # NEW
            'within_budget': total_tokens < self.max_context_tokens,
            'utilization': round(total_tokens / self.max_context_tokens * 100, 1),
            'total_chunks_indexed': len(self.chunk_index)  # NEW
        }
        
        return result
    
    def get_formatted_messages(self, context: Dict[str, Any]) -> List[Dict[str, str]]:
        """
        Форматирование контекста в формат сообщений для API.
        
        Returns:
            Список сообщений в формате [{'role': 'user', 'content': '...'}, ...]
        """
        messages = []
        
        # System prompt
        if context.get('system_prompt'):
            messages.append({
                'id': 'system',
                'role': 'system',
                'content': context['system_prompt']
            })
        
        # NEW: Релевантные чанки из длинных сообщений
        for chunk in context.get('relevant_chunks', []):
            messages.append({
                'id': f"{chunk['message_id']}_chunk_{chunk['chunk_index']}",
                'role': chunk['role'],
                'content': f"[Relevant excerpt, score={chunk['similarity_score']}] {chunk['content']}"
            })
        
        # Контекстные сообщения (сжатые старые)
        for msg in context.get('context_messages', []):
            messages.append({
                'id': msg.get('id', ''),
                'role': msg['role'],
                'content': f"[Previous context] {msg['content']}"
            })
        
        # Недавние сообщения
        for msg in context.get('recent_messages', []):
            messages.append({
                'id': msg.get('id', ''),
                'role': msg['role'],
                'content': msg['content']
            })
        
        return messages
    
    def export_messages(self) -> str:
        """Экспорт всех сообщений в JSON."""
        return json.dumps(
            [m.to_dict() for m in self.messages],
            ensure_ascii=False,
            indent=2
        )
    
    def import_messages(self, json_str: str):
        """Импорт сообщений из JSON."""
        data = json.loads(json_str)
        self.messages = [CompressedMessage.from_dict(d) for d in data]
        
        # Перестроить индекс эмбеддингов
        self.embeddings_index = []
        if self.enable_embeddings:
            for i, msg in enumerate(self.messages):
                emb = self._get_embedding(msg.content)
                if emb is not None:
                    self.embeddings_index.append((emb, i))
    
    def clear(self):
        """Очистка всех сообщений и индекса."""
        self.messages = []
        self.embeddings_index = []
        self.stats = {
            'total_compressed': 0,
            'tokens_saved': 0,
            'compression_calls': 0
        }
    
    def get_stats(self) -> Dict[str, Any]:
        """Получение статистики компрессора."""
        return {
            **self.stats,
            'total_messages': len(self.messages),
            'embeddings_count': len(self.embeddings_index)
        }


class ChatMessageManager:
    """
    Утилиты для управления порядком сообщений в чате.
    
    Поддерживает:
    - Перестановка сообщений (swap)
    - Перемещение вверх/вниз
    - Сортировка по времени/роли
    - Группировка и фильтрация
    """
    
    def __init__(self, messages: List[Dict] = None):
        self.messages = messages or []
    
    def load_json(self, json_str: str) -> 'ChatMessageManager':
        """Загрузка из JSON строки."""
        self.messages = json.loads(json_str)
        return self
    
    def load_list(self, messages: List[Dict]) -> 'ChatMessageManager':
        """Загрузка из списка."""
        self.messages = copy.deepcopy(messages)
        return self
    
    def to_json(self, indent: int = 2) -> str:
        """Экспорт в JSON."""
        return json.dumps(self.messages, ensure_ascii=False, indent=indent)
    
    def to_list(self) -> List[Dict]:
        """Получить копию списка сообщений."""
        return copy.deepcopy(self.messages)
    
    # === ОПЕРАЦИИ ПЕРЕСТАНОВКИ ===
    
    def swap(self, index1: int, index2: int) -> 'ChatMessageManager':
        """Поменять местами два сообщения."""
        if 0 <= index1 < len(self.messages) and 0 <= index2 < len(self.messages):
            self.messages[index1], self.messages[index2] = \
                self.messages[index2], self.messages[index1]
        return self
    
    def move_up(self, index: int) -> 'ChatMessageManager':
        """Переместить сообщение на одну позицию вверх."""
        if 0 < index < len(self.messages):
            self.swap(index, index - 1)
        return self
    
    def move_down(self, index: int) -> 'ChatMessageManager':
        """Переместить сообщение на одну позицию вниз."""
        if 0 <= index < len(self.messages) - 1:
            self.swap(index, index + 1)
        return self
    
    def move_to_position(self, from_index: int, to_index: int) -> 'ChatMessageManager':
        """Переместить сообщение на конкретную позицию."""
        if 0 <= from_index < len(self.messages) and 0 <= to_index < len(self.messages):
            msg = self.messages.pop(from_index)
            self.messages.insert(to_index, msg)
        return self
    
    def move_to_top(self, index: int) -> 'ChatMessageManager':
        """Переместить сообщение в начало."""
        return self.move_to_position(index, 0)
    
    def move_to_bottom(self, index: int) -> 'ChatMessageManager':
        """Переместить сообщение в конец."""
        return self.move_to_position(index, len(self.messages) - 1)
    
    def reverse(self) -> 'ChatMessageManager':
        """Развернуть порядок сообщений."""
        self.messages.reverse()
        return self
    
    # === СОРТИРОВКА ===
    
    def sort_by_timestamp(self, ascending: bool = True) -> 'ChatMessageManager':
        """Сортировка по времени."""
        self.messages.sort(
            key=lambda m: m.get('timestamp', ''),
            reverse=not ascending
        )
        return self
    
    def sort_by_role(self, order: List[str] = None) -> 'ChatMessageManager':
        """Сортировка по роли."""
        order = order or ['system', 'user', 'assistant']
        role_priority = {r: i for i, r in enumerate(order)}
        self.messages.sort(key=lambda m: role_priority.get(m.get('role', ''), 999))
        return self
    
    # === ФИЛЬТРАЦИЯ И ГРУППИРОВКА ===
    
    def filter_by_role(self, role: str) -> List[Dict]:
        """Получить сообщения определённой роли."""
        return [m for m in self.messages if m.get('role') == role]
    
    def remove_by_index(self, index: int) -> 'ChatMessageManager':
        """Удалить сообщение по индексу."""
        if 0 <= index < len(self.messages):
            self.messages.pop(index)
        return self
    
    def duplicate(self, index: int) -> 'ChatMessageManager':
        """Дублировать сообщение."""
        if 0 <= index < len(self.messages):
            msg_copy = copy.deepcopy(self.messages[index])
            msg_copy['timestamp'] = datetime.now().isoformat()
            msg_copy.setdefault('metadata', {})['duplicated_from'] = index
            self.messages.insert(index + 1, msg_copy)
        return self
    
    def group_by_role(self) -> Dict[str, List[Dict]]:
        """Группировка по ролям."""
        groups = {}
        for msg in self.messages:
            role = msg.get('role', 'unknown')
            groups.setdefault(role, []).append(msg)
        return groups
    
    def interleave_user_assistant(self) -> 'ChatMessageManager':
        """Чередование user/assistant (восстановление диалоговой структуры)."""
        users = [m for m in self.messages if m.get('role') == 'user']
        assistants = [m for m in self.messages if m.get('role') == 'assistant']
        others = [m for m in self.messages if m.get('role') not in ('user', 'assistant')]
        
        result = others[:]  # system messages first
        for u, a in zip(users, assistants):
            result.append(u)
            result.append(a)
        result.extend(users[len(assistants):])
        result.extend(assistants[len(users):])
        
        self.messages = result
        return self
    
    def apply_operation(self, operation: str, **kwargs) -> Dict[str, Any]:
        """
        Универсальный метод для применения операций.
        
        Поддерживаемые операции:
        - swap: index1, index2
        - move_up: index
        - move_down: index
        - move_to: from_index, to_index
        - reverse: (без параметров)
        - sort_time: ascending (bool)
        - sort_role: order (list)
        - interleave: (без параметров)
        - remove: index
        - duplicate: index
        """
        try:
            if operation == 'swap':
                self.swap(kwargs.get('index1', 0), kwargs.get('index2', 1))
            elif operation == 'move_up':
                self.move_up(kwargs.get('index', 0))
            elif operation == 'move_down':
                self.move_down(kwargs.get('index', 0))
            elif operation == 'move_to':
                self.move_to_position(
                    kwargs.get('from_index', 0),
                    kwargs.get('to_index', 0)
                )
            elif operation == 'reverse':
                self.reverse()
            elif operation == 'sort_time':
                self.sort_by_timestamp(kwargs.get('ascending', True))
            elif operation == 'sort_role':
                self.sort_by_role(kwargs.get('order'))
            elif operation == 'interleave':
                self.interleave_user_assistant()
            elif operation == 'remove':
                self.remove_by_index(kwargs.get('index', 0))
            elif operation == 'duplicate':
                self.duplicate(kwargs.get('index', 0))
            else:
                return {'success': False, 'error': f'Unknown operation: {operation}'}
            
            return {
                'success': True,
                'operation': operation,
                'message_count': len(self.messages)
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_preview(self, max_content_len: int = 50) -> List[Dict]:
        """Получить превью сообщений."""
        preview = []
        for i, m in enumerate(self.messages):
            content = m.get('content', '')[:max_content_len]
            if len(m.get('content', '')) > max_content_len:
                content += '...'
            preview.append({
                'index': i,
                'role': m.get('role', '?'),
                'content_preview': content,
                'compressed': m.get('compressed', False),
                'timestamp': m.get('timestamp', '')
            })
        return preview
