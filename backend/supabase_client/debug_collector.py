"""
RAG Debug Collector - собирает подробную информацию о каждом этапе RAG pipeline
для отображения в UI в стиле n8n
"""
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4
from dataclasses import dataclass, field, asdict
import time

logger = logging.getLogger(__name__)


@dataclass
class IntentAnalysis:
    """Результат анализа намерения пользователя"""
    original_query: str = ""
    detected_scope: str = "search"  # single_section, multiple_sections, full_document, search, summary_only
    detected_sections: List[str] = field(default_factory=list)
    detected_task: str = "search"
    reasoning: str = ""
    tokens_used: int = 0
    latency_ms: int = 0


@dataclass
class DocumentStructure:
    """Информация о структуре документа"""
    document_id: str = ""
    document_name: str = ""
    total_chunks: int = 0
    detected_chapters: List[Dict[str, Any]] = field(default_factory=list)
    detected_structure_type: str = ""  # book, law, manual, article, etc.


@dataclass
class RetrievalInfo:
    """Информация о стратегии retrieval"""
    strategy_used: str = ""  # hyde, multi_query, agentic, chapter_load, full_document
    techniques_applied: List[str] = field(default_factory=list)
    generated_queries: List[str] = field(default_factory=list)  # для multi_query
    hypothetical_document: str = ""  # для hyde
    agent_iterations: List[Dict[str, Any]] = field(default_factory=list)  # для agentic
    step_back_query: str = ""
    latency_ms: int = 0


@dataclass
class ChunkInfo:
    """Информация о найденном чанке"""
    chunk_index: int = 0
    document_id: str = ""
    document_name: str = ""
    chapter: str = ""
    similarity_score: float = 0.0
    rerank_score: Optional[float] = None
    content_preview: str = ""  # первые 200 символов
    full_content: str = ""  # полный текст
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ChunksInfo:
    """Информация о всех найденных чанках"""
    total_retrieved: int = 0
    total_chars: int = 0
    estimated_tokens: int = 0
    items: List[ChunkInfo] = field(default_factory=list)


@dataclass
class ContextBuilding:
    """Информация о построении контекста"""
    raw_context_chars: int = 0
    final_context_chars: int = 0
    compression_applied: bool = False
    compression_ratio: float = 1.0
    context_preview: str = ""  # первые 500 символов финального контекста
    full_context: str = ""  # полный контекст для API Request debug


@dataclass
class ModelMessage:
    """Сообщение для модели"""
    role: str = ""
    content: str = ""
    content_preview: str = ""  # первые 300 символов


@dataclass
class ModelRequest:
    """Информация о запросе к модели"""
    model: str = ""
    messages: List[ModelMessage] = field(default_factory=list)
    temperature: float = 0.7
    max_tokens: int = 4096
    total_input_tokens: int = 0
    total_input_chars: int = 0
    full_json: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TokenUsage:
    """Использование токенов"""
    input: int = 0
    output: int = 0
    reasoning: int = 0
    total: int = 0


@dataclass
class ModelResponse:
    """Информация об ответе модели"""
    content: str = ""
    content_preview: str = ""  # первые 500 символов
    tokens_used: TokenUsage = field(default_factory=TokenUsage)
    latency_ms: int = 0
    model_used: str = ""
    finish_reason: str = ""


@dataclass 
class Summary:
    """Суммарная статистика"""
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    total_latency_ms: int = 0
    rag_overhead_ms: int = 0
    model_latency_ms: int = 0


@dataclass
class RAGPipeline:
    """Полная информация о RAG pipeline"""
    intent_analysis: IntentAnalysis = field(default_factory=IntentAnalysis)
    document_structure: DocumentStructure = field(default_factory=DocumentStructure)
    retrieval: RetrievalInfo = field(default_factory=RetrievalInfo)
    chunks: ChunksInfo = field(default_factory=ChunksInfo)
    context_building: ContextBuilding = field(default_factory=ContextBuilding)


@dataclass
class InputInfo:
    """Входящий запрос"""
    user_message: str = ""
    conversation_id: str = ""
    model: str = ""
    rag_enabled: bool = False
    rag_mode: str = "auto"
    memory_mode: str = "M"


class RAGDebugCollector:
    """
    Коллектор debug информации для RAG pipeline.
    Собирает данные на каждом этапе для отображения в UI.
    """
    
    def __init__(self):
        self.request_id = str(uuid4())
        self.timestamp = datetime.utcnow().isoformat()
        self.start_time = time.time()
        
        # Основные компоненты
        self.input = InputInfo()
        self.rag_pipeline = RAGPipeline()
        self.model_request = ModelRequest()
        self.model_response = ModelResponse()
        self.summary = Summary()
        
        # Временные метки для расчёта latency
        self._rag_start_time: Optional[float] = None
        self._model_start_time: Optional[float] = None
        
        logger.debug(f"[DEBUG-COLLECTOR] Created new collector: {self.request_id}")
    
    # ==================== INPUT ====================
    
    def log_input(
        self,
        user_message: str,
        conversation_id: str = "",
        model: str = "",
        rag_enabled: bool = False,
        rag_mode: str = "auto",
        memory_mode: str = "M"
    ):
        """Логирует входящий запрос"""
        self.input = InputInfo(
            user_message=user_message,
            conversation_id=conversation_id,
            model=model,
            rag_enabled=rag_enabled,
            rag_mode=rag_mode,
            memory_mode=memory_mode
        )
        logger.debug(f"[DEBUG-COLLECTOR] Input logged: {user_message[:50]}...")
    
    # ==================== RAG PIPELINE ====================
    
    def start_rag_pipeline(self):
        """Начинает отсчёт времени RAG pipeline"""
        self._rag_start_time = time.time()
    
    def log_intent_analysis(
        self,
        original_query: str,
        scope: str,
        sections: List[str],
        task: str,
        reasoning: str = "",
        tokens_used: int = 0
    ):
        """Логирует результат анализа намерения"""
        latency = int((time.time() - self._rag_start_time) * 1000) if self._rag_start_time else 0
        
        self.rag_pipeline.intent_analysis = IntentAnalysis(
            original_query=original_query,
            detected_scope=scope,
            detected_sections=sections,
            detected_task=task,
            reasoning=reasoning,
            tokens_used=tokens_used,
            latency_ms=latency
        )
        logger.debug(f"[DEBUG-COLLECTOR] Intent: scope={scope}, sections={sections}, task={task}")
    
    def log_document_structure(
        self,
        document_id: str,
        document_name: str,
        total_chunks: int,
        chapters: List[Dict[str, Any]],
        structure_type: str = ""
    ):
        """Логирует структуру документа"""
        self.rag_pipeline.document_structure = DocumentStructure(
            document_id=document_id,
            document_name=document_name,
            total_chunks=total_chunks,
            detected_chapters=chapters,
            detected_structure_type=structure_type
        )
        logger.debug(f"[DEBUG-COLLECTOR] Document: {document_name}, {total_chunks} chunks, {len(chapters)} chapters")
    
    def log_retrieval_strategy(
        self,
        strategy: str,
        techniques: List[str],
        generated_queries: List[str] = None,
        hypothetical_doc: str = "",
        agent_iterations: List[Dict] = None,
        step_back_query: str = ""
    ):
        """Логирует стратегию retrieval"""
        latency = int((time.time() - self._rag_start_time) * 1000) if self._rag_start_time else 0
        
        self.rag_pipeline.retrieval = RetrievalInfo(
            strategy_used=strategy,
            techniques_applied=techniques,
            generated_queries=generated_queries or [],
            hypothetical_document=hypothetical_doc[:500] if hypothetical_doc else "",
            agent_iterations=agent_iterations or [],
            step_back_query=step_back_query,
            latency_ms=latency
        )
        logger.debug(f"[DEBUG-COLLECTOR] Retrieval: {strategy}, techniques={techniques}")
    
    def log_retrieval(
        self,
        strategy: str,
        techniques: List[str],
        queries: List[str] = None,
        latency_ms: int = 0
    ):
        """
        Алиас для log_retrieval_strategy с упрощённой сигнатурой.
        Используется в smart_rag_search для логирования retrieval этапа.
        """
        # Используем переданный latency или вычисляем из времени старта
        if latency_ms == 0 and self._rag_start_time:
            latency_ms = int((time.time() - self._rag_start_time) * 1000)
        
        self.rag_pipeline.retrieval = RetrievalInfo(
            strategy_used=strategy,
            techniques_applied=techniques,
            generated_queries=queries or [],
            hypothetical_document="",
            agent_iterations=[],
            step_back_query="",
            latency_ms=latency_ms
        )
        logger.debug(f"[DEBUG-COLLECTOR] Retrieval: {strategy}, techniques={techniques}, queries={queries}")

    def log_chunks(self, chunks: List[Dict[str, Any]]):
        """Логирует найденные чанки"""
        chunk_items = []
        total_chars = 0
        
        for chunk in chunks:
            content = chunk.get("content", "")
            total_chars += len(content)
            
            chunk_items.append(ChunkInfo(
                chunk_index=chunk.get("chunk_index", 0),
                document_id=chunk.get("document_id", ""),
                document_name=chunk.get("document_name", ""),
                chapter=chunk.get("metadata", {}).get("chapter_number", "") or chunk.get("chapter", ""),
                similarity_score=round(chunk.get("similarity", 0), 4),
                rerank_score=round(chunk.get("rerank_score", 0), 2) if chunk.get("rerank_score") else None,
                content_preview=content[:200] + "..." if len(content) > 200 else content,
                full_content=content,
                metadata=chunk.get("metadata", {})
            ))
        
        self.rag_pipeline.chunks = ChunksInfo(
            total_retrieved=len(chunks),
            total_chars=total_chars,
            estimated_tokens=total_chars // 4,
            items=chunk_items
        )
        logger.debug(f"[DEBUG-COLLECTOR] Chunks: {len(chunks)}, {total_chars} chars")
    
    def log_context_building(
        self,
        raw_chars: int,
        final_chars: int,
        compression_applied: bool = False,
        final_context: str = ""
    ):
        """Логирует построение контекста"""
        compression_ratio = raw_chars / final_chars if final_chars > 0 else 1.0
        
        self.rag_pipeline.context_building = ContextBuilding(
            raw_context_chars=raw_chars,
            final_context_chars=final_chars,
            compression_applied=compression_applied,
            compression_ratio=round(compression_ratio, 2),
            context_preview=final_context[:500] + "..." if len(final_context) > 500 else final_context,
            full_context=final_context  # Полный контекст для debug
        )
        
        # Завершаем RAG pipeline timing
        if self._rag_start_time:
            self.summary.rag_overhead_ms = int((time.time() - self._rag_start_time) * 1000)
        
        logger.debug(f"[DEBUG-COLLECTOR] Context: {final_chars} chars, compression={compression_applied}")
    
    # ==================== MODEL REQUEST ====================
    
    def log_model_request(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 4096,
        full_request: Dict[str, Any] = None
    ):
        """Логирует запрос к модели"""
        self._model_start_time = time.time()
        
        # Форматируем сообщения
        formatted_messages = []
        total_chars = 0
        
        for msg in messages:
            content = msg.get("content", "")
            total_chars += len(content)
            
            formatted_messages.append(ModelMessage(
                role=msg.get("role", ""),
                content=content,
                content_preview=content[:300] + "..." if len(content) > 300 else content
            ))
        
        self.model_request = ModelRequest(
            model=model,
            messages=formatted_messages,
            temperature=temperature,
            max_tokens=max_tokens,
            total_input_tokens=total_chars // 4,
            total_input_chars=total_chars,
            full_json=full_request or {}
        )
        logger.debug(f"[DEBUG-COLLECTOR] Model request: {model}, {len(messages)} messages, {total_chars} chars")
    
    # ==================== MODEL RESPONSE ====================
    
    def log_model_response(
        self,
        content: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
        reasoning_tokens: int = 0,
        model_used: str = "",
        finish_reason: str = ""
    ):
        """Логирует ответ модели"""
        latency = int((time.time() - self._model_start_time) * 1000) if self._model_start_time else 0
        
        self.model_response = ModelResponse(
            content=content,
            content_preview=content[:500] + "..." if len(content) > 500 else content,
            tokens_used=TokenUsage(
                input=input_tokens,
                output=output_tokens,
                reasoning=reasoning_tokens,
                total=input_tokens + output_tokens + reasoning_tokens
            ),
            latency_ms=latency,
            model_used=model_used,
            finish_reason=finish_reason
        )
        
        # Обновляем summary
        self.summary.model_latency_ms = latency
        self.summary.total_tokens = input_tokens + output_tokens + reasoning_tokens
        self.summary.total_latency_ms = int((time.time() - self.start_time) * 1000)
        
        # Расчёт стоимости (примерные цены)
        self.summary.total_cost_usd = self._calculate_cost(
            model_used or self.model_request.model,
            input_tokens,
            output_tokens
        )
        
        logger.debug(f"[DEBUG-COLLECTOR] Response: {len(content)} chars, {latency}ms")
    
    def _calculate_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        """Расчёт примерной стоимости запроса"""
        # Цены за 1M токенов
        prices = {
            "gpt-4o": {"input": 2.5, "output": 10},
            "gpt-4o-mini": {"input": 0.15, "output": 0.6},
            "gpt-4-turbo": {"input": 10, "output": 30},
            "gpt-3.5-turbo": {"input": 0.5, "output": 1.5},
            "claude-3-5-sonnet": {"input": 3, "output": 15},
            "claude-3-opus": {"input": 15, "output": 75},
            "claude-3-haiku": {"input": 0.25, "output": 1.25},
            "gemini-2.0-flash": {"input": 0.075, "output": 0.3},
            "gemini-1.5-pro": {"input": 1.25, "output": 5},
            "deepseek-chat": {"input": 0.14, "output": 0.28},
            "deepseek-reasoner": {"input": 0.55, "output": 2.19},
        }
        
        # Находим соответствующие цены
        model_lower = model.lower()
        for key, price in prices.items():
            if key in model_lower:
                input_cost = (input_tokens / 1_000_000) * price["input"]
                output_cost = (output_tokens / 1_000_000) * price["output"]
                return round(input_cost + output_cost, 6)
        
        # Default pricing (gpt-4o-mini)
        return round((input_tokens / 1_000_000) * 0.15 + (output_tokens / 1_000_000) * 0.6, 6)
    
    # ==================== OUTPUT ====================
    
    def get_debug_info(self) -> Dict[str, Any]:
        """Возвращает полную debug информацию"""
        return {
            "timestamp": self.timestamp,
            "request_id": self.request_id,
            "input": asdict(self.input),
            "rag_pipeline": {
                "intent_analysis": asdict(self.rag_pipeline.intent_analysis),
                "document_structure": asdict(self.rag_pipeline.document_structure),
                "retrieval": asdict(self.rag_pipeline.retrieval),
                "chunks": {
                    "total_retrieved": self.rag_pipeline.chunks.total_retrieved,
                    "total_chars": self.rag_pipeline.chunks.total_chars,
                    "estimated_tokens": self.rag_pipeline.chunks.estimated_tokens,
                    "items": [asdict(c) for c in self.rag_pipeline.chunks.items]
                },
                "context_building": asdict(self.rag_pipeline.context_building)
            },
            "model_request": {
                "model": self.model_request.model,
                "messages": [asdict(m) for m in self.model_request.messages],
                "temperature": self.model_request.temperature,
                "max_tokens": self.model_request.max_tokens,
                "total_input_tokens": self.model_request.total_input_tokens,
                "total_input_chars": self.model_request.total_input_chars,
                "full_json": self.model_request.full_json
            },
            "model_response": {
                "content": self.model_response.content,
                "content_preview": self.model_response.content_preview,
                "tokens_used": asdict(self.model_response.tokens_used),
                "latency_ms": self.model_response.latency_ms,
                "model_used": self.model_response.model_used,
                "finish_reason": self.model_response.finish_reason
            },
            "summary": asdict(self.summary)
        }
    
    def get_compact_debug_info(self) -> Dict[str, Any]:
        """Возвращает компактную версию debug info (без полного контента чанков)"""
        full_info = self.get_debug_info()
        
        # Убираем полный контент чанков, оставляем только preview
        if "rag_pipeline" in full_info and "chunks" in full_info["rag_pipeline"]:
            for chunk in full_info["rag_pipeline"]["chunks"].get("items", []):
                chunk.pop("full_content", None)
        
        # Убираем полный контент сообщений, оставляем только preview
        if "model_request" in full_info:
            for msg in full_info["model_request"].get("messages", []):
                msg.pop("content", None)
        
        return full_info


# Глобальный коллектор для текущего запроса (thread-local в будущем)
_current_collector: Optional[RAGDebugCollector] = None


def get_current_collector() -> RAGDebugCollector:
    """Получает текущий коллектор или создаёт новый"""
    global _current_collector
    if _current_collector is None:
        _current_collector = RAGDebugCollector()
    return _current_collector


def new_collector() -> RAGDebugCollector:
    """Создаёт новый коллектор"""
    global _current_collector
    _current_collector = RAGDebugCollector()
    return _current_collector


def clear_collector():
    """Очищает текущий коллектор"""
    global _current_collector
    _current_collector = None
