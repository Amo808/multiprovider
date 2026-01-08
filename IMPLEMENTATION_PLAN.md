# 🚀 План реализации улучшений RAG и UI

## Обзор задач (по приоритету)

### 🔴 КРИТИЧЕСКИЙ ПРИОРИТЕТ

***

## 1. 📊 Улучшенный JSON Debug Panel (как в n8n)

### 1.1 Структура данных для отображения

```typescript
interface RequestDebugInfo {
  // Основная информация
  timestamp: string;
  request_id: string;
  
  // Входящий запрос
  input: {
    user_message: string;
    conversation_id: string;
    model: string;
    rag_enabled: boolean;
    rag_mode: string;
  };
  
  // RAG Pipeline (раскрываемые секции)
  rag_pipeline: {
    // 1. Intent Analysis
    intent_analysis: {
      original_query: string;
      detected_scope: "single_section" | "multiple_sections" | "full_document" | "search";
      detected_sections: string[];
      detected_task: string;
      reasoning: string;
      tokens_used: number;
    };
    
    // 2. Document Structure
    document_structure: {
      document_id: string;
      document_name: string;
      total_chunks: number;
      detected_chapters: Array<{
        number: string;
        title: string;
        start_chunk: number;
        end_chunk: number;
      }>;
    };
    
    // 3. Retrieval Strategy
    retrieval: {
      strategy_used: "hyde" | "multi_query" | "agentic" | "chapter_load" | "full_document";
      techniques_applied: string[];
      
      // Для multi_query
      generated_queries?: string[];
      
      // Для hyde
      hypothetical_document?: string;
      
      // Для agentic
      agent_iterations?: Array<{
        query: string;
        results_count: number;
      }>;
    };
    
    // 4. Retrieved Chunks
    chunks: {
      total_retrieved: number;
      total_chars: number;
      estimated_tokens: number;
      items: Array<{
        chunk_index: number;
        document_name: string;
        chapter?: string;
        similarity_score: number;
        rerank_score?: number;
        content_preview: string;  // первые 200 символов
        full_content: string;     // полный текст (скрыт по умолчанию)
      }>;
    };
    
    // 5. Context Building
    context_building: {
      raw_context_chars: number;
      final_context_chars: number;
      compression_applied: boolean;
      compression_ratio?: number;
    };
  };
  
  // Финальный запрос к модели
  model_request: {
    model: string;
    messages: Array<{
      role: string;
      content: string;  // с возможностью раскрыть полностью
    }>;
    temperature: number;
    max_tokens: number;
    total_input_tokens: number;
    
    // Полный JSON (раскрываемый)
    full_json: object;
  };
  
  // Ответ модели
  model_response: {
    content: string;
    tokens_used: {
      input: number;
      output: number;
      reasoning?: number;
      total: number;
    };
    latency_ms: number;
  };
  
  // Суммарная статистика
  summary: {
    total_tokens: number;
    total_cost_usd: number;
    total_latency_ms: number;
    rag_overhead_ms: number;
  };
}
```

### 1.2 Backend изменения

**Файл: `backend/main.py`**

```python
# Добавить сбор debug информации на каждом этапе

class RAGDebugCollector:
    def __init__(self):
        self.data = {
            "timestamp": datetime.utcnow().isoformat(),
            "request_id": str(uuid4()),
            "rag_pipeline": {},
            "model_request": {},
            "model_response": {},
            "summary": {}
        }
    
    def log_intent(self, intent_data: dict):
        self.data["rag_pipeline"]["intent_analysis"] = intent_data
    
    def log_retrieval(self, retrieval_data: dict):
        self.data["rag_pipeline"]["retrieval"] = retrieval_data
    
    def log_chunks(self, chunks: list, total_chars: int):
        self.data["rag_pipeline"]["chunks"] = {
            "total_retrieved": len(chunks),
            "total_chars": total_chars,
            "estimated_tokens": total_chars // 4,
            "items": [...]
        }
    
    def log_model_request(self, messages: list, model: str, params: dict):
        self.data["model_request"] = {
            "model": model,
            "messages": messages,
            "full_json": {...}
        }
    
    def get_debug_info(self) -> dict:
        return self.data
```

### 1.3 Frontend компонент

**Файл: `frontend/src/components/DebugPanel.tsx`**

```tsx
// Компонент в стиле n8n с раскрываемыми секциями

interface DebugPanelProps {
  debugInfo: RequestDebugInfo;
  isOpen: boolean;
  onClose: () => void;
}

const DebugPanel: React.FC<DebugPanelProps> = ({ debugInfo, isOpen, onClose }) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  
  const sections = [
    { key: 'input', label: '📥 Input', icon: 'arrow-right' },
    { key: 'intent', label: '🧠 Intent Analysis', icon: 'brain' },
    { key: 'structure', label: '📚 Document Structure', icon: 'book' },
    { key: 'retrieval', label: '🔍 Retrieval Strategy', icon: 'search' },
    { key: 'chunks', label: '📄 Retrieved Chunks', icon: 'file-text' },
    { key: 'context', label: '📝 Context Building', icon: 'edit' },
    { key: 'request', label: '📤 Model Request', icon: 'send' },
    { key: 'response', label: '📨 Model Response', icon: 'message' },
    { key: 'summary', label: '📊 Summary', icon: 'bar-chart' },
  ];
  
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>🔧 Request Debug Info</SheetTitle>
        </SheetHeader>
        
        {sections.map(section => (
          <CollapsibleSection 
            key={section.key}
            title={section.label}
            isExpanded={expandedSections.has(section.key)}
            onToggle={() => toggleSection(section.key)}
          >
            <JsonViewer data={debugInfo[section.key]} />
          </CollapsibleSection>
        ))}
      </SheetContent>
    </Sheet>
  );
};
```

### 1.4 Этапы реализации

| Этап | Задача | Время |
|------|--------|-------|
| 1.4.1 | Создать `RAGDebugCollector` класс в backend | 2ч |
| 1.4.2 | Интегрировать сбор данных в `ultimate_rag_search` | 3ч |
| 1.4.3 | Добавить debug info в API response | 1ч |
| 1.4.4 | Создать `DebugPanel` компонент | 4ч |
| 1.4.5 | Добавить `CollapsibleSection` и `JsonViewer` | 2ч |
| 1.4.6 | Интегрировать с кнопкой в чате | 1ч |
| 1.4.7 | Тестирование и полировка UI | 2ч |

**Итого: ~15 часов**

***

## 2. 📁 Файлы и база знаний как часть чата

### 2.1 Изменения в базе данных

```sql
-- Новая таблица для связи документов с чатами
CREATE TABLE chat_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    attached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    
    UNIQUE(conversation_id, document_id)
);

-- Индексы
CREATE INDEX idx_chat_documents_conversation ON chat_documents(conversation_id);
CREATE INDEX idx_chat_documents_document ON chat_documents(document_id);

-- Добавить поле для хранения описания документа
ALTER TABLE documents ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS summary_tokens INTEGER;
```

### 2.2 Backend API

```python
# Новые эндпоинты

@app.post("/api/conversations/{conversation_id}/documents")
async def attach_document_to_chat(
    conversation_id: str,
    document_id: str = None,
    file: UploadFile = None,
    user_email: str = Depends(get_current_user)
):
    """
    Прикрепить существующий документ или загрузить новый к чату
    """
    pass

@app.get("/api/conversations/{conversation_id}/documents")
async def get_chat_documents(
    conversation_id: str,
    user_email: str = Depends(get_current_user)
):
    """
    Получить список документов, прикреплённых к чату
    """
    pass

@app.delete("/api/conversations/{conversation_id}/documents/{document_id}")
async def detach_document_from_chat(
    conversation_id: str,
    document_id: str,
    user_email: str = Depends(get_current_user)
):
    """
    Открепить документ от чата
    """
    pass
```

### 2.3 Frontend UI

```
┌─────────────────────────────────────────────────────────┐
│  💬 Chat: "Анализ книги"                          [⚙️] │
├─────────────────────────────────────────────────────────┤
│  📎 Прикреплённые документы:                            │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 📄 Утро ч.1 в.1.docx  [812 chunks] [✓ Active] [×]│   │
│  │ 📄 УК РФ.pdf         [1250 chunks] [✓ Active] [×]│   │
│  └──────────────────────────────────────────────────┘   │
│  [+ Добавить документ]                                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Сообщения чата...]                                    │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [📎] [Введите сообщение...]                    [Send]  │
└─────────────────────────────────────────────────────────┘
```

### 2.4 Этапы реализации

| Этап | Задача | Время |
|------|--------|-------|
| 2.4.1 | Миграция БД: таблица `chat_documents` | 1ч |
| 2.4.2 | Backend API для attach/detach документов | 3ч |
| 2.4.3 | Модификация RAG search для фильтрации по чату | 2ч |
| 2.4.4 | Frontend: компонент списка документов чата | 3ч |
| 2.4.5 | Frontend: UI для прикрепления документов | 2ч |
| 2.4.6 | Frontend: загрузка документов прямо в чат | 2ч |
| 2.4.7 | Тестирование | 2ч |

**Итого: ~15 часов**

***

## 3. 📜 История чата как RAG источник

### 3.1 Архитектура

```
История чата → Chunking → Embedding → Vector Store
                                          ↓
                              При запросе: поиск релевантных
                              сообщений из истории
```

### 3.2 Новая таблица

```sql
CREATE TABLE conversation_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(1536),
    chunk_index INTEGER NOT NULL,
    role VARCHAR(20) NOT NULL, -- 'user' | 'assistant'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Индекс для векторного поиска
CREATE INDEX idx_conversation_chunks_embedding 
ON conversation_chunks USING ivfflat (embedding vector_cosine_ops);
```

### 3.3 Процесс векторизации истории

```python
class ConversationRAG:
    """
    Векторизация и поиск по истории чата
    """
    
    async def index_message(self, message_id: str, content: str, role: str, conversation_id: str):
        """
        Индексировать новое сообщение в векторную базу
        """
        # Chunk if message is long
        chunks = self.chunk_text(content, chunk_size=500, overlap=100)
        
        for i, chunk in enumerate(chunks):
            embedding = self.create_embedding(chunk)
            
            await self.client.table("conversation_chunks").insert({
                "conversation_id": conversation_id,
                "message_id": message_id,
                "content": chunk,
                "embedding": embedding,
                "chunk_index": i,
                "role": role,
                "metadata": {"original_length": len(content)}
            }).execute()
    
    async def search_conversation_history(
        self, 
        query: str, 
        conversation_id: str, 
        limit: int = 10
    ) -> List[Dict]:
        """
        Поиск релевантных сообщений из истории чата
        """
        query_embedding = self.create_embedding(query)
        
        result = await self.client.rpc(
            "search_conversation_chunks",
            {
                "query_embedding": query_embedding,
                "filter_conversation_id": conversation_id,
                "match_count": limit,
                "similarity_threshold": 0.5
            }
        ).execute()
        
        return result.data
```

### 3.4 Интеграция с основным RAG

```python
async def build_context_with_history(
    self,
    query: str,
    user_email: str,
    conversation_id: str,
    document_ids: List[str]
) -> str:
    """
    Строит контекст из:
    1. Релевантных чанков документов
    2. Релевантных сообщений из истории чата
    """
    
    # 1. Поиск в документах
    doc_context = await self.ultimate_rag_search(query, user_email, document_ids)
    
    # 2. Поиск в истории чата
    history_chunks = await self.conversation_rag.search_conversation_history(
        query, conversation_id, limit=5
    )
    
    # 3. Объединение контекстов
    combined_context = f"""
📚 РЕЛЕВАНТНЫЕ ФРАГМЕНТЫ ДОКУМЕНТОВ:
{doc_context['context']}

💬 РЕЛЕВАНТНЫЕ СООБЩЕНИЯ ИЗ ИСТОРИИ ЧАТА:
{self._format_history_chunks(history_chunks)}
"""
    
    return combined_context
```

### 3.5 Этапы реализации

| Этап | Задача | Время |
|------|--------|-------|
| 3.5.1 | Миграция БД: `conversation_chunks` | 1ч |
| 3.5.2 | SQL функция `search_conversation_chunks` | 1ч |
| 3.5.3 | Класс `ConversationRAG` | 3ч |
| 3.5.4 | Автоматическая индексация новых сообщений | 2ч |
| 3.5.5 | Интеграция с `ultimate_rag_search` | 2ч |
| 3.5.6 | Настройка весов (документы vs история) | 1ч |
| 3.5.7 | Тестирование | 2ч |

**Итого: ~12 часов**

***

## 4. 🧠 Динамическое определение структуры документа

### 4.1 Проблема

Текущий подход ищет только фиксированные паттерны:

* "Глава X", "Chapter X"
* "Статья X", "Article X"
* "Раздел X", "Section X"

**Нужно:** автоматически определять структуру ЛЮБОГО документа.

### 4.2 Решение: AI-based Structure Detection

```python
class DynamicStructureDetector:
    """
    Использует AI для определения структуры документа
    """
    
    async def detect_structure(self, document_id: str, sample_chunks: List[str]) -> DocumentStructure:
        """
        Анализирует образцы текста и определяет структуру документа
        """
        
        # Берём первые 10 чанков + случайные 10 из середины + последние 5
        sample_text = self._prepare_sample(sample_chunks)
        
        prompt = f"""Проанализируй структуру этого документа и определи:

1. Тип документа (книга, закон, инструкция, статья, контракт и т.д.)
2. Иерархию разделов (какие уровни есть: части, главы, разделы, статьи, пункты и т.д.)
3. Паттерны заголовков для каждого уровня (регулярные выражения)
4. Есть ли нумерация и какого формата (1, 1.1, I, i, а), б) и т.д.)

ОБРАЗЕЦ ДОКУМЕНТА:
{sample_text}

Верни JSON:
{{
    "document_type": "book|law|manual|article|contract|other",
    "hierarchy": [
        {{
            "level": 1,
            "name": "Часть",
            "pattern": "(?:^|\\n)(?:Часть|ЧАСТЬ)\\s*(\\d+|[IVX]+)",
            "examples": ["Часть 1", "ЧАСТЬ II"]
        }},
        {{
            "level": 2,
            "name": "Глава", 
            "pattern": "(?:^|\\n)(?:Глава|ГЛАВА)\\s*(\\d+)",
            "examples": ["Глава 1", "ГЛАВА 15"]
        }}
    ],
    "numbering_format": "arabic|roman|letter|mixed",
    "has_table_of_contents": true|false,
    "special_sections": ["Введение", "Заключение", "Приложения"]
}}
"""
        
        response = await self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={"type": "json_object"}
        )
        
        structure = json.loads(response.choices[0].message.content)
        
        # Сохраняем структуру в metadata документа
        await self._save_structure(document_id, structure)
        
        return structure
    
    def build_dynamic_patterns(self, structure: DocumentStructure) -> List[str]:
        """
        Строит regex паттерны на основе определённой структуры
        """
        patterns = []
        for level in structure["hierarchy"]:
            patterns.append(level["pattern"])
        return patterns
```

### 4.3 Применение при загрузке документа

```python
async def upload_and_process_document(self, ...):
    # ... существующий код ...
    
    # После извлечения текста, определяем структуру
    structure_detector = DynamicStructureDetector()
    
    # Берём образцы чанков
    sample_chunks = chunks[:10] + chunks[len(chunks)//2:len(chunks)//2+10] + chunks[-5:]
    sample_texts = [c["content"] for c in sample_chunks]
    
    # Определяем структуру
    structure = await structure_detector.detect_structure(doc["id"], sample_texts)
    
    # Сохраняем в metadata документа
    await self.client.table("documents").update({
        "metadata": {
            **doc.get("metadata", {}),
            "detected_structure": structure
        }
    }).eq("id", doc["id"]).execute()
    
    # ... продолжаем обработку ...
```

### 4.4 Этапы реализации

| Этап | Задача | Время |
|------|--------|-------|
| 4.4.1 | Класс `DynamicStructureDetector` | 3ч |
| 4.4.2 | Интеграция в процесс загрузки документа | 2ч |
| 4.4.3 | Модификация `get_document_chapters` для использования динамических паттернов | 2ч |
| 4.4.4 | Кэширование структуры в БД | 1ч |
| 4.4.5 | UI для просмотра/редактирования структуры | 3ч |
| 4.4.6 | Тестирование на разных типах документов | 2ч |

**Итого: ~13 часов**

***

## 5. 📉 Избежание полной загрузки документа

### 5.1 Проблема

При запросах типа "о чём книга" система загружает весь документ, что:

* Дорого по токенам
* Медленно
* Часто избыточно

### 5.2 Решение: Document Summary

```python
class DocumentSummarizer:
    """
    Создаёт и использует краткое описание документа
    """
    
    async def generate_summary(self, document_id: str, chunks: List[Dict]) -> str:
        """
        Генерирует подробное описание документа при загрузке
        """
        
        # Стратегия: Map-Reduce summarization
        
        # 1. Map: суммаризируем каждую главу/раздел
        chapter_summaries = []
        chapters = self._group_by_chapters(chunks)
        
        for chapter_num, chapter_chunks in chapters.items():
            chapter_text = "\n".join([c["content"] for c in chapter_chunks[:10]])  # первые 10 чанков
            
            summary = await self._summarize_section(chapter_text, f"Глава {chapter_num}")
            chapter_summaries.append({
                "chapter": chapter_num,
                "summary": summary
            })
        
        # 2. Reduce: объединяем в общее описание
        all_summaries = "\n\n".join([
            f"Глава {s['chapter']}: {s['summary']}" 
            for s in chapter_summaries
        ])
        
        final_summary = await self._create_final_summary(all_summaries)
        
        # 3. Сохраняем в БД
        await self.client.table("documents").update({
            "summary": final_summary,
            "summary_tokens": len(final_summary) // 4
        }).eq("id", document_id).execute()
        
        return final_summary
    
    async def _summarize_section(self, text: str, section_name: str) -> str:
        prompt = f"""Кратко опиши содержание {section_name} (2-3 предложения):

{text[:4000]}

Краткое описание:"""
        
        response = await self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=200
        )
        
        return response.choices[0].message.content
    
    async def _create_final_summary(self, chapter_summaries: str) -> str:
        prompt = f"""На основе описаний глав создай подробное описание всего документа.
Включи:
- Общую тему и жанр
- Основных персонажей/концепции
- Ключевые события/идеи каждой главы
- Общий объём и структуру

ОПИСАНИЯ ГЛАВ:
{chapter_summaries}

ПОДРОБНОЕ ОПИСАНИЕ ДОКУМЕНТА:"""
        
        response = await self.client.chat.completions.create(
            model="gpt-4o",  # используем более мощную модель для финального summary
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=2000
        )
        
        return response.choices[0].message.content
```

### 5.3 Использование summary в RAG

```python
def analyze_query_intent(self, query: str, document_structure: Dict) -> Dict:
    """
    Модифицированный intent analyzer
    """
    
    # Определяем, нужен ли полный документ или достаточно summary
    general_queries = [
        "о чём", "о чем", "what is about", "summary", "резюме",
        "общая тема", "главная мысль", "суть книги", "краткое содержание"
    ]
    
    is_general_query = any(q in query.lower() for q in general_queries)
    
    if is_general_query and document_structure.get("has_summary"):
        return {
            "scope": "summary_only",  # Новый scope!
            "sections": [],
            "task": "summarize",
            "use_summary": True
        }
    
    # ... остальная логика ...
```

### 5.4 Этапы реализации

| Этап | Задача | Время |
|------|--------|-------|
| 5.4.1 | Миграция БД: поля `summary`, `summary_tokens` | 0.5ч |
| 5.4.2 | Класс `DocumentSummarizer` | 4ч |
| 5.4.3 | Интеграция в процесс загрузки документа | 1ч |
| 5.4.4 | Модификация `analyze_query_intent` для summary | 1ч |
| 5.4.5 | Endpoint для ручной генерации summary | 1ч |
| 5.4.6 | UI для просмотра/редактирования summary | 2ч |
| 5.4.7 | Тестирование | 1.5ч |

**Итого: ~11 часов**

***

## 6. 📊 Режимы памяти (S/M/L/XL)

### 6.1 Конфигурация режимов

```python
MEMORY_MODES = {
    "S": {
        "name": "Small",
        "max_context_tokens": 4000,
        "max_chunks": 5,
        "history_messages": 5,
        "use_compression": True,
        "description": "Минимальный контекст, быстрые ответы"
    },
    "M": {
        "name": "Medium", 
        "max_context_tokens": 16000,
        "max_chunks": 15,
        "history_messages": 20,
        "use_compression": True,
        "description": "Баланс скорости и полноты"
    },
    "L": {
        "name": "Large",
        "max_context_tokens": 64000,
        "max_chunks": 50,
        "history_messages": 50,
        "use_compression": False,
        "description": "Полный контекст для сложных задач"
    },
    "XL": {
        "name": "Extra Large",
        "max_context_tokens": 128000,
        "max_chunks": 200,
        "history_messages": 100,
        "use_compression": False,
        "description": "Максимальный контекст (для Gemini/DeepSeek)"
    }
}
```

### 6.2 Применение режима

```python
async def ultimate_rag_search(
    self,
    query: str,
    user_email: str,
    memory_mode: str = "M",  # Новый параметр
    ...
) -> Dict[str, Any]:
    
    mode_config = MEMORY_MODES[memory_mode]
    
    # Применяем лимиты из конфига
    max_tokens = mode_config["max_context_tokens"]
    max_chunks = mode_config["max_chunks"]
    
    # ... поиск чанков ...
    
    # Если превышаем лимит и включена компрессия
    if total_tokens > max_tokens and mode_config["use_compression"]:
        context = await self.compress_context(context, target_tokens=max_tokens)
    
    return {
        "context": context,
        "sources": sources,
        "mode_used": memory_mode,
        "debug": debug_info
    }
```

### 6.3 UI для выбора режима

```
┌─────────────────────────────────────────────────────┐
│  ⚙️ Настройки RAG                                   │
├─────────────────────────────────────────────────────┤
│  Режим памяти:                                      │
│  ┌─────┬─────┬─────┬─────┐                          │
│  │  S  │  M  │  L  │ XL  │  ← Кнопки выбора        │
│  └─────┴─────┴─────┴─────┘                          │
│                                                     │
│  📊 Текущий режим: Medium                           │
│  • Макс. токенов: 16,000                           │
│  • Макс. чанков: 15                                 │
│  • Компрессия: Да                                   │
│                                                     │
│  💡 Рекомендация: Используйте L/XL для             │
│     детального анализа больших документов           │
└─────────────────────────────────────────────────────┘
```

### 6.4 Этапы реализации

| Этап | Задача | Время |
|------|--------|-------|
| 6.4.1 | Конфигурация режимов в backend | 1ч |
| 6.4.2 | Модификация `ultimate_rag_search` | 2ч |
| 6.4.3 | Компрессия контекста | 3ч |
| 6.4.4 | API endpoint для настроек | 1ч |
| 6.4.5 | Frontend: компонент выбора режима | 2ч |
| 6.4.6 | Сохранение настроек пользователя | 1ч |
| 6.4.7 | Тестирование всех режимов | 2ч |

**Итого: ~12 часов**

***

## 📅 Общий план-график

### Неделя 1: Фундамент

| День | Задачи |
|------|--------|
| Пн | Debug Panel: backend collector (1.4.1-1.4.3) |
| Вт | Debug Panel: frontend компоненты (1.4.4-1.4.5) |
| Ср | Debug Panel: интеграция + тестирование (1.4.6-1.4.7) |
| Чт | Файлы в чате: БД + API (2.4.1-2.4.3) |
| Пт | Файлы в чате: Frontend (2.4.4-2.4.7) |

### Неделя 2: RAG улучшения

| День | Задачи |
|------|--------|
| Пн | История чата как RAG (3.5.1-3.5.4) |
| Вт | История чата: интеграция (3.5.5-3.5.7) |
| Ср | Динамическая структура (4.4.1-4.4.3) |
| Чт | Динамическая структура + UI (4.4.4-4.4.6) |
| Пт | Document Summary (5.4.1-5.4.4) |

### Неделя 3: Финализация

| День | Задачи |
|------|--------|
| Пн | Document Summary: UI + тестирование (5.4.5-5.4.7) |
| Вт | Режимы памяти: backend (6.4.1-6.4.3) |
| Ср | Режимы памяти: frontend (6.4.4-6.4.7) |
| Чт | Интеграционное тестирование |
| Пт | Баг-фиксы, документация |

***

## 📊 Оценка трудозатрат

| Компонент | Часы |
|-----------|------|
| 1. Debug Panel (как в n8n) | 15 |
| 2. Файлы как часть чата | 15 |
| 3. История чата как RAG | 12 |
| 4. Динамическая структура | 13 |
| 5. Document Summary | 11 |
| 6. Режимы памяти | 12 |
| **ИТОГО** | **~78 часов** |

При 8ч/день = **~10 рабочих дней** или **2 недели**

***

## 🔧 Технический стек

* **Backend:** Python, FastAPI, Supabase, OpenAI API
* **Frontend:** React, TypeScript, Tailwind CSS, shadcn/ui
* **Database:** PostgreSQL + pgvector
* **Embedding:** OpenAI text-embedding-3-small

***

## ✅ Критерии готовности

### Обновлено: 2026-01-08

1. **Debug Panel:**
   * \[x] Показывает полный JSON запроса к модели
   * \[x] Раскрываемые секции для каждого этапа RAG
   * \[x] Подсчёт токенов на каждом этапе
   * \[x] Копирование JSON в буфер
   * \[x] Скачивание JSON файла
   * \[x] Подсветка синтаксиса JSON (n8n style)
   * \[x] Expand/Collapse для длинного контента

2. **ContextViewer (улучшенный):**
   * \[x] Вкладки: Overview, API Request, RAG, Tokens, Full Context, JSON Editor
   * \[x] Token Bar с визуализацией распределения
   * \[x] JsonViewer с подсветкой синтаксиса (sky/emerald/amber/violet/rose)
   * \[x] MessagePreview с раскрываемыми сообщениями по ролям
   * \[x] JsonEditor с валидацией JSON в реальном времени
   * \[x] Toolbar на каждом компоненте: copy, download, expand
   * \[x] Статистика: lines, tokens, chars
   * \[x] Горизонтальная прокрутка для длинного JSON
   * \[x] Фиксированная ширина `min-w-max` для предотвращения "ухода вбок"

3. **RAG Backend:**
   * \[x] Intent Analyzer с fallback для чисел/дат
   * \[x] Multi-query search метод
   * \[x] Keyword extraction
   * \[x] Улучшенные паттерны для scope=search

4. **Файлы в чате:**
   * \[ ] Можно прикрепить документ к чату
   * \[ ] RAG автоматически фильтрует по документам чата
   * \[ ] Можно загрузить новый документ прямо в чат

5. **История как RAG:**
   * \[ ] Сообщения автоматически индексируются
   * \[ ] При запросе ищет в истории
   * \[ ] Релевантная история добавляется в контекст

6. **Динамическая структура:**
   * \[ ] Автоматически определяет структуру при загрузке
   * \[ ] Работает с разными форматами документов
   * \[ ] Можно редактировать структуру вручную

7. **Document Summary:**
   * \[ ] Генерируется при загрузке документа
   * \[ ] Используется для общих запросов
   * \[ ] Экономит токены на запросах типа "о чём книга"

8. **Режимы памяти:**
   * \[ ] 4 режима с разными лимитами
   * \[ ] UI для переключения
   * \[ ] Компрессия в режимах S/M
