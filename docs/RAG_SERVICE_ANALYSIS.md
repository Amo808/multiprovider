# 📋 RAG Service (Go) — Полная документация и анализ замены

> **Дата анализа:** 12.02.2026  
> **Источник:** `rag-service.example/`  
> **Версия:** RAG Service v2.1  
> **Цель:** Оценить возможность замены текущего Python RAG на Go RAG Service

---

## Содержание

1. [Обзор системы](#1-обзор-системы)
2. [Архитектура](#2-архитектура)
3. [API Endpoints](#3-api-endpoints)
4. [Пайплайн обработки документов](#4-пайплайн-обработки-документов)
5. [Пайплайн поиска](#5-пайплайн-поиска)
6. [ML Operations](#6-ml-operations)
7. [Weaviate Schema](#7-weaviate-schema)
8. [Конфигурация](#8-конфигурация)
9. [Docker & Deployment](#9-docker--deployment)
10. [Структура кода](#10-структура-кода)
11. [Текущий multech RAG — обзор](#11-текущий-multech-rag--обзор)
12. [Сравнительная таблица](#12-сравнительная-таблица)
13. [Оценка замены](#13-оценка-замены)
14. [Рекомендации](#14-рекомендации)

---

## 1. Обзор системы

**RAG Service v2.1** — микросервисная система извлечения и обработки документов, написанная на **Go (Golang)**. Построена по архитектуре **"фасад + воркер"**.

### Компоненты

| Компонент | Язык | Порт | Роль |
|-----------|------|------|------|
| **rag-service** | Go 1.24 (Gin framework) | 8080 | Основной API — парсинг, индексация, чанкинг, поиск, пост-процессинг |
| **ml-service** | Go (Gin framework) | 8000 | ML-операции — эмбеддинги, реранкинг, кластеризация, суммаризация |

### Инфраструктура

| Компонент | Версия | Роль |
|-----------|--------|------|
| **Weaviate** | 1.24.1 | Векторная БД — хранение child-чанков + гибридный поиск (vector + BM25) |
| **MongoDB** | 6.0 | Метаданные документов, parent-чанки, структура (TOC), raw chapters, статистика хитов |

### Ключевые зависимости (go.mod)

| Библиотека | Назначение |
|------------|-----------|
| `github.com/gin-gonic/gin` | HTTP framework |
| `github.com/weaviate/weaviate-go-client/v5` | Клиент Weaviate |
| `go.mongodb.org/mongo-driver` | Клиент MongoDB |
| `github.com/pkoukk/tiktoken-go` | Токенизация (cl100k_base, как GPT-4) |
| `github.com/kljensen/snowball` | Стемминг для TF-IDF суммаризации |
| `github.com/ledongthuc/pdf` | Парсинг PDF |
| `github.com/xuri/excelize/v2` | Парсинг XLSX |
| `github.com/golang-jwt/jwt/v5` | JWT аутентификация |
| `github.com/swaggo/gin-swagger` | Swagger документация |
| `github.com/google/uuid` | Генерация UUID |

---

## 2. Архитектура

### Высокоуровневая схема

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Внешний клиент                                │
│                    (Frontend / Bot / Integration)                      │
└─────────────────────────────┬────────────────────────────────────────┘
                              │ HTTP + JWT Bearer Token
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     RAG Service (Go) :8080                            │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────┐  ┌───────────┐  │
│  │ API Layer│  │ Service Layer│  │ Infrastructure │  │   Config  │  │
│  │ (Gin)    │──│ (RAGService) │──│    Layer       │  │  (YAML +  │  │
│  │ handlers │  │ orchestrator │  │ Weaviate/Mongo │  │   ENV)    │  │
│  │ JWT auth │  │ text_splitter│  │ ML Client      │  │           │  │
│  └──────────┘  │ post_process │  │ Bot/Chat/File  │  └───────────┘  │
│                │ struct_extract│  │   Clients      │                  │
│                │ parser/       │  └───────┬────────┘                  │
│                └──────────────┘          │                            │
└──────────────────────────────────────────┼──────────────────────────┘
                                           │
              ┌────────────────────────────┼────────────────────────┐
              │                            │                        │
              ▼                            ▼                        ▼
   ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
   │   Weaviate :8080 │     │   MongoDB :27017 │     │ ML Service :8000 │
   │ (Vector DB)      │     │ (Metadata DB)    │     │ (или Internal)   │
   │                  │     │                  │     │                  │
   │ • V2_Document    │     │ • documents_v2   │     │ • /embed         │
   │ • V2_Chat        │     │ • message_traces │     │ • /rerank        │
   │ • V2_Code        │     │ • chunk_stats    │     │ • /cluster       │
   │ • V2_Table       │     │                  │     │ • /summarize     │
   └──────────────────┘     └──────────────────┘     └──────────────────┘
```

### Два режима ML

#### Internal Mode (Рекомендуемый) — `ML_PROVIDER=internal`

```
RAG Service ──────────────────────────▶ OpenAI / Gemini / Cohere API
                  (Native Go Client)       (Embeddings, Reranking)
              
              ── TF-IDF Summarizer (Go) ──▶ Локальная суммаризация
              ── DBSCAN Clustering (Go) ──▶ Локальная кластеризация
```

- Нет зависимости от ml-service контейнера
- Меньше сетевых задержек
- Упрощённый деплой (1 контейнер вместо 2)

#### External Mode (Legacy) — `ML_PROVIDER=external`

```
RAG Service ──HTTP──▶ ML Service :8000 ──▶ OpenAI / Gemini / Cohere API
```

- Используется когда нужны специфические Python-библиотеки
- Требует отдельный контейнер

---

## 3. API Endpoints

**Базовый URL:** `/api/v2`  
**Аутентификация:** JWT Bearer Token (HMAC подпись, `JWT_SECRET`)  
**Swagger:** `/api/v2/swagger/index.html`

### 3.1 Загрузка и индексация (Ingestion)

#### `POST /api/v2/files/upload`

Загружает один файл, парсит его, создаёт эмбеддинги и сохраняет в Weaviate + MongoDB.

**Content-Type:** `multipart/form-data`

| Параметр | Тип | Обязательный | Описание |
|----------|-----|------|----------|
| `file` | File | Да | Файл (PDF, DOCX, ODT, EPUB, CSV, XLSX, TXT) |
| `type` | String | Нет | Тип: `auto` (default), `code`, `table` |
| `conversation_id` | String | Нет | ID диалога для привязки файла |

**Ответ (200):**
```json
{
  "message": "Processed",
  "documentID": "550e8400-e29b-41d4-a716-446655440000",
  "chunks": 42,
  "children": 168,
  "type": "text"
}
```

**Что происходит внутри:**
1. Файл сохраняется во временный файл
2. Определяется парсер по расширению (PDF/DOCX/ODT/EPUB/CSV/XLSX/TXT)
3. Извлекаются текстовые сегменты с номерами страниц
4. Извлекается структура документа (TOC)
5. Генерируется Structure Summary чанк (Chunk 0)
6. Если включена суммаризация — генерируется Content Summary чанк
7. Parent-Child чанкинг (1024 → 256 токенов)
8. Semantic Zoning (зоны по позиции)
9. Metadata Injection (имя файла, заголовки, зона)
10. Батчевая векторизация (по 64 чанка)
11. Сохранение в Weaviate (child-чанки с векторами) + MongoDB (parent-чанки и метаданные)

---

#### `POST /api/v2/files/upload-multiple`

Загружает несколько файлов одновременно.

**Content-Type:** `multipart/form-data`

| Параметр | Тип | Обязательный |
|----------|-----|------|
| `files` | Array of Files | Да |

**Ответ (200):**
```json
{
  "results": [
    { "filename": "doc1.pdf", "message": "Processed", "chunks": 42, "documentID": "..." },
    { "filename": "doc2.docx", "message": "Processed", "chunks": 18, "documentID": "..." }
  ]
}
```

---

#### `POST /api/v2/ingest/bot`

Push-индексация Knowledge Base бота. Скачивает файлы по URL и индексирует их.

**Body:**
```json
{
  "id": "bot-uuid",
  "name": "My Bot",
  "user_id": "user-uuid",
  "knowledge_base": [
    { "name": "manual.pdf", "url": "https://...", "mime": "application/pdf", "size": 1048576 }
  ],
  "system_prompt": "Ты полезный ассистент...",
  "llm_model": "gpt-4",
  "temperature": 0.7
}
```

---

### 3.2 Поиск и извлечение (Retrieval)

#### `POST /api/v2/retrieve` — Основной метод RAG

Продвинутый поиск контекста с поддержкой:
- Бесшовной памяти (история чата индексируется на лету)
- Вложений (файлы скачиваются и индексируются мгновенно)
- Синхронизации (auto-sync Bot KB + Chat History)

**Body:**
```json
{
  "user_last_message": "Как работает трансформер?",
  "bot_id": "optional-bot-id",
  "user_id": "user-uuid",
  "conversation_id": "chat-uuid",
  "system_prompt": "Ты полезный ассистент...",
  "messages": [
    { "role": "user", "content": "Привет", "timestamp": 1707696000 },
    { "role": "assistant", "content": "Здравствуйте!", "timestamp": 1707696010 }
  ],
  "attachments": [
    { "url": "https://...", "filename": "paper.pdf", "mime_type": "application/pdf" }
  ]
}
```

**Ответ (200):**
```json
{
  "context": "[Source 1: paper.pdf | Path: Chapter 3 > Attention | Page: 15]\nThe transformer architecture...\n\n[Chat History (user) at 2025-02-12T00:00:00Z]: Привет\n",
  "sources": ["paper.pdf"],
  "used_chunks": [
    { "document_id": "...", "chunk_index": 42, "filename": "paper.pdf", "score": 0.89 }
  ]
}
```

**Что происходит внутри:**
1. **SyncContext** — автоматическая синхронизация:
   - Если передан `bot_id` → скачивает и индексирует Knowledge Base бота
   - Если передан `conversation_id` → скачивает историю из Chat Service, индексирует файлы
2. **IndexChatHistory** — индексирует переданные `messages` в Weaviate (V2_Chat class)
3. **Process Attachments** — скачивает и индексирует вложения
4. **Search** — гибридный поиск (vector + BM25) → реранкинг → Parent Resolution → Macro Reconstruction
5. **PostProcessResults** — Narrative Engine (группировка, сортировка, дедупликация, overlap trimming)

---

#### `POST /api/v2/query` — Простой поиск

Классический семантический поиск по документам пользователя.

**Body:**
```json
{
  "query": "Поиск по базе знаний",
  "limit": 5,
  "user_id": "user-uuid"
}
```

---

#### `POST /api/v2/retrieval/query` — Пассивный поиск

Принимает push-историю чата, индексирует её и ищет.

**Body:**
```json
{
  "messages": [
    {
      "message_id": "msg-1",
      "conversation_id": "chat-1",
      "role": "owner",
      "content": "Как работает?",
      "sender": { "id": "user-1", "name": "John" },
      "query_for_bots": [{ "id": "bot-1", "name": "Assistant" }],
      "files": [],
      "created_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

---

### 3.3 Управление (Management)

#### `GET /api/v2/documents`

Список всех загруженных документов пользователя (без тела чанков).

**Ответ (200):**
```json
[
  {
    "document_id": "...",
    "filename": "paper.pdf",
    "uploadDate": "2025-02-12T...",
    "fileSize": 1048576,
    "total": 42,
    "type": "text",
    "structure": { "total_chapters": 5, "table_of_contents": [...] }
  }
]
```

---

#### `DELETE /api/v2/documents/:id`

Удаляет документ и все его векторы из Weaviate + метаданные из MongoDB.

- Проверяет ownership (userID совпадает)
- Удаляет из соответствующего Weaviate-класса (V2_Document / V2_Code / V2_Table)

---

#### `DELETE /api/v2/database`

Полный сброс базы данных. **Только для Admin** (проверка роли из JWT claims).

1. Удаляет все объекты из Weaviate (V2_Document, V2_Chat, V2_Code, V2_Table)
2. Ждёт 2 секунды для консистентности
3. Удаляет все документы из MongoDB

---

#### `GET /api/v2/visualize/:id`

Возвращает граф структуры документа (nodes + links) для визуализации на фронтенде.

**Ответ (200):**
```json
{
  "nodes": [
    { "id": "root", "label": "paper.pdf", "type": "root", "val": 20 },
    { "id": "chap_1", "label": "Chapter 1", "type": "chapter", "val": 10 },
    { "id": "chunk_0", "label": "The transformer...", "type": "chunk", "val": 7, "hits": 3, "content": "..." }
  ],
  "links": [
    { "source": "root", "target": "chap_1" },
    { "source": "chap_1", "target": "chunk_0" }
  ]
}
```

- **hits** — количество обращений к чанку (Heatmap)
- **val** — визуальный размер узла (базовый 5 + hits * 2)

---

#### `POST /api/v2/cluster`

Кластеризация текстов через DBSCAN.

**Body:**
```json
{
  "texts": ["текст 1", "текст 2", "текст 3"]
}
```

**Ответ (200):**
```json
{
  "labels": [0, 0, 1],
  "n_clusters": 2
}
```

---

#### `GET /health`

Healthcheck (без JWT).

```json
{ "status": "ok", "service": "rag-service" }
```

---

## 4. Пайплайн обработки документов

### 4.1 Парсинг файлов

Каждый формат имеет свой парсер, возвращающий `[]TextSegment` (текст + номер страницы):

#### DOCX — Нативный XML-парсер (`service/parser/docx.go`)

```
.docx (ZIP) → word/document.xml → XML Parser
```

- Работает напрямую с `word/document.xml` внутри ZIP-архива
- **Трекинг страниц:** отслеживает теги `<w:br w:type="page"/>` для точного определения номера страницы
- **Маппинг стилей Word → Markdown:**
  - `Heading1` → `# Title`
  - `Heading2` → `## Subtitle`
  - `Heading3` → `### Section`
  - `Heading4` → `#### Subsection`
  - `Title` → `**Text**` (жирный, НЕ заголовок — чтобы не ломать иерархию при извлечении структуры)
- Обработка: таблицы, списки (нумерованные/маркированные), гиперссылки, footnotes

#### PDF (`service/parser/pdf.go`)

```
.pdf → ledongthuc/pdf library → Анализ шрифтов и позиционирования
```

- Реконструкция заголовков по размеру шрифта
- Определение параграфов по позиционированию текста
- Номера страниц — нативно из PDF

#### ODT / EPUB (`service/parser/parser.go` → Pandoc)

```
.odt/.epub → Pandoc (CommonMark) → Markdown → TextSegments
```

- Требует установленный Pandoc (включён в Docker-образ Alpine)
- Таймаут конвертации: 60 секунд
- Номера страниц теряются при конвертации (всё = страница 1)

#### CSV (`service/parser/parser.go`)

```
.csv → encoding/csv → DocumentChunk (с колонками)
```

- Каждая строка → отдельный чанк
- Формат: `Column1: Value1, Column2: Value2, ...`
- Сохраняются имена колонок и сырые данные (JSON)

#### XLSX (`service/parser/parser.go`)

```
.xlsx → excelize → DocumentChunk (с колонками, по листам)
```

- Обрабатываются все листы
- Аналогично CSV, но с поддержкой нескольких sheets

#### TXT / MD / Fallback (`service/parser/parser.go`)

```
.txt/.md → Split по \n\n → Очистка HTML/Markdown → TextSegments
```

- Разделение по двойному переводу строки (абзацы)
- Очистка HTML-тегов, Markdown-форматирования
- Всё = страница 1

---

### 4.2 Извлечение структуры документа (`service/structure_extractor.go`)

После парсинга анализируется текст на наличие заголовков:

```
TextSegments → Structure Extractor → DocumentStructure {
    TotalChapters: int
    TableOfContents: []ChapterNode { Title, Level, PageNumber }
}
```

**Порядок поиска заголовков:**

1. **Markdown Headers:** `#`, `##`, `###`, `####` — из DOCX стилей
2. **Regex Headers:** паттерны для English и Russian:
   ```regex
   (?i)^(?:Chapter|Part|Глава|Часть)\s+([0-9IVXLCDM]+|[a-zA-Z]+)
   (?i)^(?:Prologue|Epilogue|Introduction|Conclusion|Preface|
           Пролог|Эпилог|Введение|Заключение|Предисловие)
   ```

**Нормализация Chapter ID:**
- Арабские числа: `1`, `2`, `42`
- Римские числа: `I` → `1`, `XIV` → `14`
- Текстовые: `One` → `1`, `Twelve` → `12`

**Результат** → Structure Summary чанк (Chunk 0):
```
Document Structure Summary:
Total Chapters: 40
Table of Contents:
- Chapter 1: Introduction (Page 1)
  - Section 1.1: Background (Page 3)
- Chapter 2: Methodology (Page 15)
... and 35 more chapters.
```

> **Лимит:** максимум 50 записей в TOC (остальные — `"... and N more chapters."`)

---

### 4.3 Авто-суммаризация (`ENABLE_AUTO_SUMMARY=true`)

Генерация краткого содержания **без использования LLM** (бесплатно и быстро).

#### Алгоритм: TF-IDF + Snowball Stemmer

```
Документ → Jump Sampling (40 сэмплов) → TF-IDF Scoring → Top-7 предложений → Summary
```

**Jump Sampling стратегия:**
- **Малый документ** (≤40 сегментов): берутся все сегменты (обрезка до 500 символов)
- **Большой документ** (>40 сегментов): 40 равномерно распределённых сэмплов
  - Шаг = `totalSegments / 40`
  - Каждый сэмпл обрезается до 500 символов
- Первый сегмент всегда включается (Введение)

**Результат** → Content Summary чанк:
```
Document Overview and Summary. About this document:
[TF-IDF extracted sentences here...]
```

**Header Chain для поисковой оптимизации:**
```go
HeaderChain: []string{"Document Summary", "Overview", "Synopsis", "About", "Theme", "Topic"}
```

---

### 4.4 Чанкинг — Parent-Child стратегия (`service/text_splitter.go`)

Двухуровневая система для баланса между точностью поиска и полнотой контекста:

```
TextSegments
    │
    ▼
┌────────────────────────────┐
│  Parent Chunks (MongoDB)   │  1024 токена, overlap 200
│  • Полный контекст         │  • Используются для ответа LLM
│  • ChapterID + Headers     │  • Хранят raw text
└────────────┬───────────────┘
             │ SplitParentIntoChildren()
             ▼
┌────────────────────────────┐
│  Child Chunks (Weaviate)   │  256 токенов, overlap 50
│  • Точный поиск            │  • Мелкие, специфичные кусочки
│  • Embed + Vector          │  • Ссылка на parent_chunk_index
└────────────────────────────┘
```

**Токенизация:** `tiktoken` с кодировкой `cl100k_base` (такая же, как GPT-4 и text-embedding-ada-002)

**Процесс SplitText():**

1. Текстовые сегменты разбиваются на `TextSpan` (заголовки + текст + номер страницы)
2. Определяется ChapterID по заголовкам
3. Предложения группируются в parent-чанки по 1024 токена с перекрытием 200 токенов
4. Header Chain сохраняется (иерархия заголовков: `Chapter 1 > Section 1.2 > Subsection`)
5. Raw chapters сохраняются для Macro Reconstruction

**Процесс SplitParentIntoChildren():**

1. Parent-чанк разбивается на child-чанки по 256 токенов с перекрытием 50
2. Каждый child наследует ChapterID, HeaderChain, PageNumber от parent
3. Summary чанки (Chunk 0, 1) НЕ разбиваются — сохраняются целиком

---

### 4.5 Semantic Zoning

Каждому child-чанку присваивается **позиционная зона** на основе его глобального индекса:

```
posRatio = childGlobalIndex / (totalChildren - 1)
```

| Диапазон | Зона | Ключевые слова |
|----------|------|----------------|
| 0% — 15% | Начало | Beginning, Start, Introduction, Prologue, Opening, Setup |
| 15% — 40% | Развитие | Early Context, Development |
| 40% — 60% | Середина | Middle, Midpoint, Body |
| 60% — 85% | Кульминация | Climax, Conflict, Resolution Phase |
| 85% — 100% | Конец | Ending, Conclusion, Finale, Outro, Epilogue, Result, Outcome |

**Специальные случаи:**
- Первый чанк (index 0): добавляется `"First Page"`
- Последний чанк: добавляется `"Last Page"`

**Зачем это нужно:** Когда пользователь спрашивает *"Чем заканчивается книга?"* или *"Какой вывод?"*, вектор поиска по самому тексту может не найти ответ. Но zone keywords `"Ending, Conclusion"` в metadata повышают релевантность чанков из конца документа.

---

### 4.6 Metadata Injection

Перед отправкой на эмбеддинг каждый child-чанк "обогащается" метаданными:

```go
augmentedText := fmt.Sprintf(
    "File: %s. [Zone: %s]. %sChapter: %s. %s",
    filename,       // "paper.pdf"
    zoneStr,        // "Beginning, Start, Introduction"
    headerContext,  // "Context: Chapter 1 > Section 1.2. "
    chapterID,      // "1"
    originalText,   // Сам текст чанка
)
```

**Пример:**
```
File: machine_learning.pdf. [Zone: Middle, Midpoint, Body]. Context: Chapter 5 > Neural Networks > Backpropagation. Chapter: 5. The gradient descent algorithm updates weights by computing the partial derivative of the loss function...
```

> Этот augmented текст отправляется на эмбеддинг, но в Weaviate сохраняется **оригинальный текст** (без metadata prefix).

---

### 4.7 Батчевая векторизация и сохранение

```
Child чанки → Батчи по 64 → ML Client (Embed) → Weaviate (BatchInsert)
                                                    │
                                          При ошибке → Rollback
                                          (удаление по documentID)
```

**Свойства объекта в Weaviate:**
```go
{
    "content":            "оригинальный текст",
    "filename":           "paper.pdf",
    "user_id":            "user-uuid",
    "uploadDate":         "2025-02-12T...",
    "fileSize":           1048576,
    "mimeType":           "application/pdf",
    "documentID":         "doc-uuid",
    "chunkIndex":         42,           // Глобальный индекс child
    "parent_chunk_index": 10,           // Ссылка на parent в MongoDB
    "is_child":           true,
    "fileHash":           "hash-uuid",
    "source":             "upload_api",
    "chapter_id":         "5",
    "header_chain":       ["Chapter 5", "Neural Networks", "Backpropagation"],
    "page_number":        87,
    "bot_id":             "bot-uuid",         // Опционально
    "conversation_id":    "chat-uuid"         // Или "__GLOBAL__"
}
```

**Rollback механизм:**
Если батч-вставка в Weaviate или сохранение в MongoDB фейлятся, все уже вставленные объекты удаляются из Weaviate по `documentID`. Контекст rollback — с таймаутом 30 секунд.

---

## 5. Пайплайн поиска

### Полная последовательность

```
Query → Embed(query) → Hybrid Search (Weaviate)
                             │
                             ▼
                     Child Results (3x limit)
                             │
                             ▼
                        Reranking (LangSearch / Cohere API)
                             │
                             ▼
                    Separation: Docs vs Chat
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
             Doc Children        Chat Results
                    │           (сортировка по timestamp)
                    ▼
           Parent Resolution (MongoDB batch)
                    │
                    ▼
           Content Deduplication (SHA1 hash)
                    │
                    ▼
           Metadata Injection (headers, dates)
                    │
                    ▼
           Macro Reconstruction (raw chapters)
                    │
                    ▼
           PostProcessResults (Narrative Engine)
                    │
                    ▼
           Final Context String + Sources + Used Chunks
```

---

### 5.1 Hybrid Search (Weaviate)

Поиск идёт по **4 классам** одновременно: `V2_Document`, `V2_Code`, `V2_Table`, `V2_Chat`

```go
// Параметры
vector: query embedding (float32[])
alpha:  HYBRID_SEARCH_ALPHA (0.0=BM25 only ... 1.0=vector only, default 0.5)
limit:  requested_limit * 3 (для запаса на дедупликацию)
```

**Фильтрация:**
- `user_id == currentUserID` OR `bot_id == requestedBotID`
- Если передан `conversation_id` → фильтр на конкретный чат ИЛИ `__GLOBAL__`
- Если переданы `fileIDs` → фильтр на конкретные документы

**Semantic Window (Context Expansion):**
Для каждого найденного чанка подтягиваются соседи (N-1, N+1) по `chunkIndex` в том же `documentID`. Это восстанавливает разорванные предложения.

**Summary Injection:**
Принудительно проверяется, попал ли в выдачу Chunk 0 (Structure Summary). Если нет — он догружается отдельно.

---

### 5.2 Reranking

```
Top-N результатов → ML Client (Rerank) → Переоценённые scores → Сортировка
```

- **Провайдер:** LangSearch (`langsearch-reranker-v1`) или Cohere
- **Метод:** Cross-Encoder (пары `(Query, Document)`)
- **Точность:** значительно выше, чем косинусное расстояние
- **Fallback:** если реранкинг фейлится → используются оригинальные scores

Результаты сортируются по `_rerankScore` (по убыванию).

---

### 5.3 Parent Resolution

```
Child (Weaviate) ──parent_chunk_index──▶ Parent (MongoDB)
```

1. Собираются все уникальные пары `(documentID, parentIndex)` из results
2. **Batch-запрос** в MongoDB: `GetChunksByIndices(docID, indices[])`
   - MongoDB Aggregation Pipeline с `$filter` на массиве chunks
3. Child content заменяется на Parent content (полный контекст 1024 токена)
4. **Fallback:** если Parent не найден → используется child content

**Content Deduplication:**
Для каждого parent content генерируется SHA1 hash. Дубликаты (одинаковый parent у нескольких children) отбрасываются.

---

### 5.4 Macro Reconstruction (Chapter Consolidation)

Если несколько чанков оказались из **одной главы** (одинаковый `documentID + chapter_id`):

```
Несколько чанков из Chapter 5 → MongoDB.GetRawChapter("doc-id", "5") → Полный текст главы
```

- `raw_chapters` хранятся при индексации в формате `map[string]string` (chapterID → rawText)
- Все исходные чанки заменяются **одним макро-чанком** с полным текстом главы
- Метаданные сохраняются от первого чанка
- Макро-чанк маркируется: `is_macro: true`, `chunk_index: -1`

---

### 5.5 Post-Processing — Narrative Engine (`service/post_processing.go`)

Превращает сырые результаты в **связный текст** для LLM:

#### 1. Парсинг и разделение
- Результаты парсятся из `map[string]interface{}`
- Разделяются на `docItems` и `chatItems` по `class`

#### 2. Группировка документов
```
docItems → Group by DocumentID → Sort groups by max score (desc)
```

#### 3. Хронологическая сортировка внутри документа
```
Group → Sort by ChunkIndex (asc)
```
Это восстанавливает **естественный ход повествования** (нарратив).

#### 4. Subset Deduplication
```
Если chunk_A.Content содержит chunk_B.Content → удалить chunk_B
```

#### 5. Overlap Trimming
Чанки нарезаются с перекрытием (overlap). Narrative Engine находит общие суффиксы/префиксы соседних чанков и "склеивает" их:

```
Chunk N:   "...the gradient descent algorithm updates weights by computing"
Chunk N+1: "algorithm updates weights by computing the partial derivative..."
                     ↓ trimOverlap()
Result:    "...the gradient descent algorithm updates weights by computing the partial derivative..."
```

#### 6. Форматирование

**Документы:**
```
[Source 1: paper.pdf | Path: Chapter 5 > Neural Networks | Page: 87]
The gradient descent algorithm updates weights by computing...

[Source 2: textbook.docx | Path: Part 2 > Training]
Backpropagation is the key algorithm...
```

**Чат:**
```
[Chat History (user) at 2025-02-12T00:00:00Z]: Как работает backpropagation?
[Chat History (assistant) at 2025-02-12T00:00:05Z]: Backpropagation — это алгоритм...
```

#### 7. Chunk Heatmap (статистика)
При каждом возвращении чанка в результатах, асинхронно инкрементится счётчик:
```go
go s.mongoRepo.IncrementChunkHit(docID, chunkIndex)
```
Эта статистика используется в визуализации (размер узла в графе).

---

### 5.6 Seamless Memory — Индексация чата

```
Chat Messages → Embed each → Weaviate V2_Chat
```

Свойства V2_Chat:
```json
{
  "message":         "текст сообщения",
  "role":            "user" / "assistant" / "system",
  "user_id":         "user-uuid",
  "bot_id":          "bot-uuid",
  "conversation_id": "chat-uuid",
  "timestamp":       1707696000
}
```

**Passive Ingestion** (`/retrieval/query`):
- Дедупликация: для каждого сообщения генерируется UUID (не детерминистический — для избежания 422 "already exists")
- System Event Injection: при загрузке файла в чат генерируется системное сообщение `"System: Document 'file.pdf' has been uploaded to the chat."`
- Файлы из сообщений скачиваются и индексируются с привязкой к conversation_id

---

## 6. ML Operations

### 6.1 Интерфейс ML Client

```go
type Client interface {
    Embed(text string) ([]float32, error)           // Один текст → вектор
    EmbedBatch(texts []string) ([][]float32, error)  // Батч текстов → векторы
    Cluster(texts []string) (*ClusterResponse, error) // DBSCAN кластеризация
    Rerank(query string, documents []string) ([]RerankResult, error) // Переранжирование
    Summarize(texts []string) (string, error)         // TF-IDF суммаризация
}
```

Две реализации: `NativeClient` (internal) и `ExternalClient` (HTTP к ml-service).

---

### 6.2 Embeddings (Native Client)

**Поддерживаемые провайдеры:**

| Провайдер | Протокол | URL | API Key ENV |
|-----------|----------|-----|-------------|
| Google Gemini | `gemini` | `https://generativelanguage.googleapis.com/v1beta/openai/embeddings` | `GEMINI_API_KEY` / `GOOGLE_API_KEY` |
| OpenAI | `openai` | `https://api.openai.com/v1/embeddings` | `OPENAI_API_KEY` |
| Cohere | `cohere` | `https://api.cohere.ai/v1/embed` | `COHERE_API_KEY` |

**Дефолт:** Gemini `gemini-embedding-001` (3072 dimensions)

**Task Types:**
- `query` — для поискового запроса (один текст)
- `passage` — для документов (батч, используется при индексации)

Cohere использует свой формат (`input_type: search_document/search_query`), Gemini и OpenAI — совместимый формат.

---

### 6.3 Reranking (Native Client)

**Поддерживаемые провайдеры:**

| Провайдер | Модель | URL |
|-----------|--------|-----|
| LangSearch | `langsearch-reranker-v1` | `https://api.langsearch.com/v1/rerank` |
| Cohere | cohere reranker | `https://api.cohere.ai/v1/rerank` |

**Ответ:**
```json
{
  "results": [
    { "index": 0, "relevance_score": 0.95 },
    { "index": 2, "relevance_score": 0.82 }
  ]
}
```

**Fallback:** если модель/URL не сконфигурированы → возвращается оригинальный порядок с убывающими score.

---

### 6.4 Суммаризация (TF-IDF)

Чисто Go-реализация, без LLM:

```
Тексты → Tokenize → Snowball Stemmer → Remove Stopwords → TF-IDF → Top-N sentences
```

- **Snowball Stemmer:** многоязычный (English, Russian, German, ...)
- **Stopwords:** встроенный список (English + расширения)
- **TF-IDF:** Term Frequency × Inverse Document Frequency
- **Результат:** 5-7 наиболее информативных предложений

---

### 6.5 Кластеризация (DBSCAN)

Чисто Go-реализация:

```
Тексты → Embed (все тексты) → Cosine Distance Matrix → DBSCAN → Labels
```

**Параметры:**
- `cluster_eps`: максимальная cosine distance между точками в одном кластере (дефолт 0.15)
- `cluster_min_pts`: минимальное кол-во точек для кластера (дефолт 2)

**Результат:**
```json
{
  "labels": [0, 0, 1, -1, 1],  // -1 = noise
  "n_clusters": 2
}
```

---

## 7. Weaviate Schema

4 класса, все с `vectorizer: "none"` и BM25 индексацией:

### V2_Document

```
Описание: Uploaded text documents (Parent-Child)
Свойства:
  content        text     (word tokenization, inverted index)
  filename       text
  user_id        string   (filterable, field tokenization)
  bot_id         string   (filterable)
  conversation_id string  (filterable)
  uploadDate     date
  fileSize       int
  mimeType       text
  documentID     text
  chunkIndex     int
  parent_chunk_index  int  ← ссылка на parent в MongoDB
  fileHash       text
  source         text
  chapter_id     string   (inverted index)
  header_chain   text[]   (массив строк)
  page_number    int
```

### V2_Chat

```
Описание: Chat history (Seamless Memory)
Свойства:
  message        text
  role           text
  user_id        string   (filterable)
  bot_id         string   (filterable)
  conversation_id string  (filterable)
  timestamp      number
```

### V2_Code

```
Описание: Source code files
Дополнительные свойства:
  language       text     (python, javascript, etc.)
  (остальные как V2_Document)
```

### V2_Table

```
Описание: Structured table data
Дополнительные свойства:
  columns        text[]   (имена колонок)
  rawData        text     (JSON строка)
  (остальные как V2_Document)
```

**Auto-recovery:** при запуске сервис проверяет существование классов и их схему. Если `header_chain` имеет неправильный тип (не массив) или отсутствует `conversation_id` — класс автоматически пересоздаётся.

---

## 8. Конфигурация

### Приоритет источников

```
1. Environment Variables     (HIGHEST)
2. config.yaml              (ml-service/config/config.yaml)
3. Code Defaults            (LOWEST)
```

### Полный список переменных

#### Инфраструктура
| Переменная | Дефолт | Описание |
|------------|--------|----------|
| `PORT` | `8080` | Порт RAG Service |
| `MONGO_URI` | `mongodb://localhost:27017` | URI MongoDB |
| `DB_NAME` | `genilion` | Имя базы MongoDB |
| `WEAVIATE_HOST` | `localhost:8080` | Хост Weaviate |
| `WEAVIATE_SCHEME` | `http` | Схема (http/https) |
| `ML_SERVICE_URL` | `http://localhost:8000` | URL ML Service (для external mode) |

#### ML / Embeddings
| Переменная | Дефолт | Описание |
|------------|--------|----------|
| `ML_PROVIDER` | `external` | Режим: `internal` / `external` |
| `ML_EMBEDDING_MODEL` | из config.yaml | Модель эмбеддингов |
| `ML_PROVIDER_URL` | из config.yaml | URL провайдера эмбеддингов |
| `ML_PROVIDER_PROTOCOL` | из config.yaml | Протокол: `openai`, `gemini`, `cohere` |
| `VECTOR_DIMENSION` | `768` | Размерность вектора |

#### Реранкинг
| Переменная | Дефолт | Описание |
|------------|--------|----------|
| `ML_RERANK_MODEL` | из config.yaml | Модель реранкера |
| `ML_RERANK_URL` | из config.yaml | URL реранкера |

#### Поиск
| Переменная | Дефолт | Описание |
|------------|--------|----------|
| `HYBRID_SEARCH_ALPHA` | `0.5` | Баланс vector/BM25 (0.0 = только BM25, 1.0 = только vector) |
| `ENABLE_AUTO_SUMMARY` | `false` | Включить авто-суммаризацию при загрузке |

#### API Keys
| Переменная | Описание |
|------------|----------|
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Ключ Google/Gemini |
| `OPENAI_API_KEY` | Ключ OpenAI |
| `COHERE_API_KEY` | Ключ Cohere |
| `LANGSEARCH_API_KEY` | Ключ LangSearch |
| `JWT_SECRET` | Секрет для JWT подписи |

#### Внешние сервисы
| Переменная | Дефолт | Описание |
|------------|--------|----------|
| `BOTS_SERVICE_URL` | `http://localhost:8081` | URL сервиса ботов |
| `CHAT_SERVICE_URL` | `http://localhost:8082` | URL сервиса чатов |
| `FILE_SERVICE_URL` | `http://localhost:8083` | URL файлового сервиса |
| `SERVICE_JWT_TOKEN` | `""` | JWT для inter-service коммуникации |

### Пример config.yaml

```yaml
ml:
  enable_auto_summary: true
  embedding_model: "gemini-embedding-001"
  provider_url: "https://generativelanguage.googleapis.com/v1beta/openai/embeddings"
  provider_protocol: "gemini"
  vector_dimension: 3072
  cluster_eps: 0.15
  cluster_min_pts: 2
  rerank_model: "langsearch-reranker-v1"
  rerank_url: "https://api.langsearch.com/v1/rerank"
  hybrid_search_alpha: 0.5
```

---

## 9. Docker & Deployment

### Dockerfile (rag-service)

```dockerfile
# Build stage
FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o rag-service cmd/main.go

# Runtime stage
FROM alpine:3.21
RUN apk add --no-cache pandoc   # Для ODT/EPUB конвертации
WORKDIR /app
COPY --from=builder /app/rag-service .
EXPOSE 8080
CMD ["./rag-service"]
```

**Размер образа:** ~20-30 MB (Alpine + Go binary + Pandoc)

### docker-compose.yml

```yaml
services:
  rag-service:
    build: ./rag-service
    ports: ["8010:8080"]
    env_file: [env.rag]
    volumes:
      - ./ml-service/config/config.yaml:/app/config/config.yaml
    environment:
      - MONGO_URI=mongodb://mongo:27017
      - WEAVIATE_HOST=weaviate:8080
      - WEAVIATE_SCHEME=http
      - ML_PROVIDER=internal
    depends_on: [mongo, weaviate]

  mongo:
    image: public.ecr.aws/docker/library/mongo:6.0
    expose: ["27017"]

  weaviate:
    image: semitechnologies/weaviate:1.24.1
    expose: ["8080", "50051"]
    environment:
      - DEFAULT_VECTORIZER_MODULE=none
      - AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED=true
      - PERSISTENCE_DATA_PATH=/var/lib/weaviate
      - ENABLE_MODULES=text2vec-openai,text2vec-cohere,text2vec-huggingface,generative-openai
```

**Итого:** 3 контейнера для полной работы (в internal mode)

---

## 10. Структура кода

```
rag-service/
├── cmd/
│   └── main.go                    # Entry point, DI, HTTP server setup
├── api/
│   ├── handlers.go                # HTTP handlers (671 строк)
│   └── middleware.go              # JWT auth middleware
├── config/
│   ├── config.go                  # Config loading (YAML + ENV)
│   └── config_test.go
├── domain/
│   ├── models.go                  # Core domain models (InputFile, TextSegment, ChunkItem, etc.)
│   └── types.go                   # ContextUsage
├── infrastructure/
│   ├── clients/
│   │   ├── bot_client.go          # HTTP client к Bot Service
│   │   ├── chat_client.go         # HTTP client к Chat Service
│   │   ├── file_client.go         # HTTP client к File Service
│   │   └── clients_test.go
│   ├── ml/
│   │   ├── client.go              # ML Client interface + ExternalClient
│   │   ├── native_client.go       # NativeClient (internal mode)
│   │   └── native/
│   │       ├── engine.go          # Native ML Engine (embed, rerank, cluster, summarize)
│   │       ├── engine_test.go
│   │       └── stopwords/
│   │           └── stopwords.go   # Стоп-слова для TF-IDF
│   ├── mongo/
│   │   └── repository.go         # MongoDB operations (239 строк)
│   └── weaviate/
│       ├── repository.go         # Weaviate operations (638 строк)
│       └── schema.go             # Schema management + auto-recovery (344 строки)
├── internal/
│   ├── ai/
│   │   └── ai.go                 # Constants (провайдеры)
│   ├── dto/
│   │   └── dto.go                # Request/Response DTOs
│   └── models/
│       └── models.go             # Internal models
├── service/
│   ├── rag_service.go            # Core RAG Service (1355 строк!) — processing, search, indexing
│   ├── orchestrator.go           # Active Orchestration (SyncContext, syncBotKB, syncChat)
│   ├── text_splitter.go          # Text splitting, chunking, tokenization (502 строки)
│   ├── structure_extractor.go    # TOC extraction from text
│   ├── post_processing.go        # Narrative Engine (262 строки)
│   ├── downloader.go             # File download helper
│   └── parser/
│       ├── parser.go             # Text, CSV, XLSX, ODT, EPUB parsers
│       ├── docx.go               # Native DOCX XML parser
│       ├── pdf.go                # PDF parser
│       ├── docx_test.go
│       └── pandoc_test.go
├── docs/
│   ├── docs.go                   # Swagger auto-generated
│   ├── swagger.json
│   └── swagger.yaml
├── Dockerfile
├── go.mod
└── go.sum
```

**Общий объём кода:** ~5000+ строк Go

---

## 11. Текущий multech RAG — обзор

### Архитектура

| Аспект | Детали |
|--------|--------|
| **Язык** | Python 3.11+ / FastAPI |
| **Размер** | main.py = 4300+ строк |
| **БД** | Supabase (PostgreSQL + pgvector) — managed cloud |
| **Файлы** | Supabase Storage (bucket "documents") |
| **Auth** | Google OAuth + JWT + Supabase Auth |
| **LLM** | Multi-model (DeepSeek, OpenAI, Anthropic, Gemini) через adapters/ |

### RAG подсистемы (3 параллельных!)

1. **Supabase RAG** (`supabase_client/rag.py` — 4699 строк):
   - Основной production RAG
   - Upload → SmartChunker → OpenAI embed → pgvector
   - Hybrid search через RPC (`hybrid_search_chunks_v2`)

2. **Local Document RAG** (`storage/document_rag.py` — 1073 строки):
   - In-memory RAG с `HybridSearchEngine`
   - Vector + BM25 (`rank_bm25`) + Cross-Encoder reranking

3. **Conversation RAG** (`storage/conversation_rag.py` — 1125 строк):
   - Чат-история как knowledge source
   - Чанкинг и индексация сообщений

### Embedding & Search

| Аспект | Детали |
|--------|--------|
| **Embedding model** | OpenAI `text-embedding-3-small` (1536 dims) |
| **BM25** | `rank_bm25.BM25Okapi` (Python in-memory) |
| **Cross-encoder** | `cross-encoder/ms-marco-MiniLM-L-6-v2` (локальный) |
| **Hybrid fusion** | Weighted: vector (0.5-0.7) + BM25 (0.3) + cross-encoder (0.2) |
| **Search execution** | pgvector server-side RPC ИЛИ Python-side cosine fallback |

### Чанкинг

| Аспект | Детали |
|--------|--------|
| **Подход** | SmartChunker (section-aware) |
| **Размер** | 512-1000 chars, overlap 128-200 |
| **Единица** | Символы (chars), не токены |
| **Структура** | Плоская (одноуровневая), не Parent-Child |
| **Boundary** | Параграфы, не mid-sentence |

### RAG Modes

```
off | auto | smart | basic | advanced | ultimate | hyde | agentic | full | chapter
```

Каждый режим настраивает разные стратегии retrieval, chunk_mode, лимиты.

### Дополнительные фичи multech

- **Mem0 Memory:** долгосрочная память пользователя (cross-conversation)
- **Context Compression:** сжатие длинных контекстов для LLM
- **Multi-model Orchestration:** параллельные/consensus запросы к нескольким LLM
- **Process Events:** SSE стриминг прогресса обработки
- **Model Discovery:** автоматическое обнаружение доступных моделей
- **Per-model token budgets:** model_limits.json

---

## 12. Сравнительная таблица

| Критерий | Go RAG Service | Текущий multech (Python) |
|----------|---------------|------------------------|
| | | |
| **--- Инфраструктура ---** | | |
| Язык | Go 1.24 | Python 3.11+ (FastAPI) |
| Векторная БД | Weaviate (self-hosted) | Supabase pgvector (managed cloud) |
| Метаданные | MongoDB (self-hosted) | Supabase PostgreSQL (managed cloud) |
| Docker image size | ~20-30 MB | ~500+ MB |
| Контейнеры | 3 (rag + mongo + weaviate) | 1 (Python) + Supabase Cloud |
| | | |
| **--- ML / AI ---** | | |
| Embedding | Gemini embedding-001 (3072 dims) | OpenAI text-embedding-3-small (1536 dims) |
| Reranking | LangSearch / Cohere API (внешний) | cross-encoder/ms-marco (локальный) |
| BM25 | Weaviate native | rank_bm25 (Python in-memory) |
| Суммаризация | TF-IDF + Snowball Stemmer (Go, бесплатно) | Нет (через LLM, платно) |
| Кластеризация | DBSCAN native (Go) | Нет |
| LLM генерация | Нет (только retrieval) | Да, multi-model (4 провайдера) |
| | | |
| **--- Парсинг ---** | | |
| DOCX | Нативный XML-парсер (стили, страницы) | python-docx |
| PDF | ledongthuc/pdf (Go) | PyPDF2 |
| ODT/EPUB | Pandoc | Нет поддержки |
| CSV/XLSX | Да (excelize) | Ограниченная |
| | | |
| **--- Чанкинг ---** | | |
| Стратегия | Parent-Child (2 уровня) | Плоский (1 уровень) |
| Единица | Токены (tiktoken) | Символы (chars) |
| Parent size | 1024 токенов | — |
| Child size | 256 токенов | 512-1000 chars |
| Overlap | 200 (parent), 50 (child) | 128-200 chars |
| Semantic Zoning | Да (5 зон по позиции) | Нет |
| Structure Summary | Да (Chunk 0 с TOC) | Нет |
| | | |
| **--- Поиск ---** | | |
| Hybrid Search | Weaviate (vector + BM25, native) | pgvector RPC / Python fallback |
| Reranking | Cross-encoder API | Локальный cross-encoder |
| Parent Resolution | MongoDB batch fetch | — |
| Macro Reconstruction | Полная глава из MongoDB | — |
| Narrative Engine | Да (dedup + overlap trim + sort) | Нет |
| Semantic Window | Да (N-1, N+1 neighbors) | Нет |
| Summary Injection | Да (Chunk 0 forcefully included) | Нет |
| | | |
| **--- Фичи ---** | | |
| RAG Modes | 1 (advanced) | 10+ (off/auto/smart/hyde/agentic...) |
| Chat Memory | V2_Chat в Weaviate | conversation_rag.py |
| Long-term Memory | Нет | Mem0 |
| Context Compression | Нет | Да |
| Multi-model LLM | Нет | Да (DeepSeek, OpenAI, Anthropic, Gemini) |
| Визуализация | Граф documents (nodes/links, heatmap) | Нет |
| Active Orchestration | Auto-sync Bot KB + Chat | Нет |
| Bot Knowledge Push | Да (/ingest/bot) | Нет (ручная загрузка) |
| Passive Mode | Да (/retrieval/query) | Нет |
| Swagger docs | Да (gin-swagger) | FastAPI auto-docs |
| Auth | JWT HMAC | Google OAuth + Supabase Auth |
| | | |
| **--- Качество кода ---** | | |
| Архитектура | Clean Architecture (domain/service/infra) | Monolith (main.py 4300+ строк) |
| Type safety | Go static typing | Python dynamic typing + Pydantic |
| Тесты | Unit tests (text_splitter, post_processing) | Integration tests |
| Код | ~5000 строк Go | ~12000+ строк Python (суммарно) |

---

## 13. Оценка замены

### Вердикт: **Частичная замена возможна, полная — нецелесообразна**

---

### ✅ Что Go RAG делает ЛУЧШЕ

| # | Преимущество | Почему важно |
|---|-------------|-------------|
| 1 | **Производительность** | Go binary в 5-10x быстрее Python, image 20MB vs 500MB |
| 2 | **Parent-Child чанкинг** | Точный поиск (child 256 tok) + полный контекст (parent 1024 tok) |
| 3 | **Semantic Zoning** | Вопросы типа "чем заканчивается?" находят правильные чанки |
| 4 | **Нативный DOCX парсер** | Сохраняет стили, страницы, иерархию заголовков |
| 5 | **TF-IDF суммаризация** | Бесплатная (без LLM), быстрая, на Go |
| 6 | **Narrative Engine** | LLM получает связный текст, а не "мешок цитат" |
| 7 | **Macro Reconstruction** | Подтяжка полных глав → лучшее понимание контекста |
| 8 | **Weaviate** | Полноценная векторная БД vs pgvector extension |
| 9 | **Active Orchestration** | Auto-sync KB ботов + чата — zero-config для пользователя |
| 10 | **Визуализация** | Граф документа с heatmap — UX-фича для фронтенда |
| 11 | **Clean Architecture** | Код организован по слоям, легко тестировать и расширять |
| 12 | **tiktoken токенизация** | Точный подсчёт токенов (как GPT-4), не приблизительный chars/4 |

---

### ❌ Что текущий multech делает ЛУЧШЕ (или чего нет в Go RAG)

| # | Преимущество multech | Почему критично |
|---|---------------------|----------------|
| 1 | **10+ RAG режимов** | Гибкость для разных сценариев (hyde, agentic, full, chapter) |
| 2 | **Multi-model LLM** | Go RAG вообще не генерирует ответы — только retrieval |
| 3 | **Mem0 long-term memory** | Отсутствует в Go, нет аналога |
| 4 | **Локальный cross-encoder** | Go зависит от платных API (LangSearch/Cohere) |
| 5 | **Supabase интеграция** | Весь фронтенд, auth, storage завязаны на Supabase |
| 6 | **Context compression** | Сжатие контекста для длинных диалогов |
| 7 | **Гибкие настройки RAG** | chunk_mode, percent limits, per-model token budgets |
| 8 | **Google OAuth** | Auth система совсем другая |
| 9 | **SSE streaming** | Process events, streaming responses |
| 10 | **Model Discovery** | Авто-определение доступных моделей |

---

### 🚫 БЛОКЕРЫ полной замены

#### 1. Разная инфраструктура
```
Go RAG:     Weaviate + MongoDB (self-hosted, 3 контейнера)
multech:    Supabase Cloud (managed PostgreSQL + pgvector + Storage + Auth)
```
Замена = миграция ВСЕХ данных + отказ от managed Supabase → рост DevOps нагрузки.

#### 2. Go RAG — это ТОЛЬКО retrieval
Go RAG **не знает** ничего о:
- LLM генерации (стриминг ответов)
- Multi-model orchestration
- Prompt building
- Token budget management
- SSE events
- Conversation management

`main.py` в multech — это 4300+ строк **полного AI-бэкенда**. Go RAG заменяет только ~20% этой функциональности (retrieval часть).

#### 3. Frontend несовместимость
Фронтенд multech настроен на:
- `/api/rag/*` endpoints (Supabase RAG API)
- `/api/conversation-rag/*` endpoints
- `/api/documents/*` endpoints
- Google OAuth flow
- Supabase realtime subscriptions

Go RAG имеет **полностью другие** endpoint paths и payload format.

#### 4. Auth несовместимость
```
Go RAG:    JWT (HMAC, JWT_SECRET env var)
multech:   Google OAuth → Supabase JWT → user_id из claims
```

#### 5. Потеря фич при замене
- Mem0 (long-term memory)
- RAG modes (10+)
- Context compression
- Multi-model support
- Process events streaming
- Per-model token budgets
- Model Discovery

---

## 14. Рекомендации

### Рекомендуемый подход: **Выборочная интеграция лучших идей из Go RAG в multech**

Это даёт ~80% преимуществ Go RAG без риска поломки системы.

---

### Приоритет 1: Parent-Child чанкинг

**Что:** Заменить одноуровневый SmartChunker на двухуровневый.

**Как в multech (Python):**
```python
# 1. Parent chunks: 1024 токенов (хранятся в Supabase, полный текст)
# 2. Child chunks: 256 токенов (хранятся с embedding в pgvector)
# 3. При поиске: найти child → подтянуть parent content
```

**Выгода:** Точный поиск + полный контекст для LLM.

---

### Приоритет 2: Semantic Zoning

**Что:** Добавить позиционные зоны к чанкам при индексации.

**Как:**
```python
position_ratio = chunk_index / total_chunks
if position_ratio <= 0.15:
    zone = "Beginning, Introduction"
elif position_ratio <= 0.40:
    zone = "Early Development"
# ... etc
```

**Выгода:** Улучшение поиска для вопросов о начале/конце/середине документа.

---

### Приоритет 3: Structure Summary (Chunk 0)

**Что:** При индексации генерировать специальный "TOC чанк" — Chunk 0.

**Как:**
```python
toc_text = f"Document Structure Summary:\nTotal Chapters: {len(chapters)}\n"
for ch in chapters:
    toc_text += f"- {ch.title} (Page {ch.page})\n"
# Индексировать как обычный чанк, но с metadata type="structure"
```

**Выгода:** LLM может отвечать на "Сколько глав?" без чтения всего документа.

---

### Приоритет 4: TF-IDF суммаризация

**Что:** Автоматическая генерация summary без LLM.

**Как:**
```python
from sklearn.feature_extraction.text import TfidfVectorizer
# Jump sampling → TF-IDF → Top-N sentences → "About this document: ..."
```

**Выгода:** Бесплатная суммаризация, не тратит токены LLM.

---

### Приоритет 5: Narrative Engine (пост-процессинг)

**Что:** Порт логики из `post_processing.go` в Python.

**Ключевые элементы:**
1. Группировка результатов по document_id
2. Сортировка чанков хронологически (по chunk_index)
3. Subset deduplication
4. Overlap trimming (склейка перекрывающихся чанков)

**Выгода:** LLM получает связный текст вместо фрагментов.

---

### Приоритет 6: Macro Reconstruction

**Что:** Хранить полный текст глав, подтягивать при множественных чанках из одной главы.

**Как:**
```python
# При индексации: Supabase table `raw_chapters` (document_id, chapter_id, full_text)
# При поиске: если 3+ чанка из Chapter 5 → заменить на полный текст Chapter 5
```

**Выгода:** Полный контекст главы → лучшее понимание LLM.

---

### НЕ рекомендуется

| Что | Почему НЕ стоит |
|-----|-----------------|
| Заменить Supabase на Weaviate + MongoDB | Потеря managed инфраструктуры, рост DevOps |
| Переписать main.py на Go | Потеря multi-model, mem0, SSE, всех RAG modes |
| Запустить Go RAG параллельно | Двойная инфраструктура, синхронизация данных |

---

> **Итог:** Go RAG Service — это отлично спроектированная система с продвинутыми фичами (Parent-Child, Semantic Zoning, Narrative Engine). Но она покрывает только retrieval-часть, в то время как multech — это полный AI-бэкенд. Лучший путь — портировать лучшие идеи из Go RAG в Python/multech, сохранив всю существующую инфраструктуру.
