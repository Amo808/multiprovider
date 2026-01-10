import sys
sys.path.insert(0, '.')
from supabase_client.rag import RAGStore

rag = RAGStore()
user_email = 'test@example.com'  # Используй свой email

# Тест 1: Получаем summaries чанков
print('=== TEST 1: Get Chunk Summaries ===')
try:
    summaries = rag.get_chunk_summaries(user_email, limit=10)
    print(f'Found {len(summaries)} chunks')
    for s in summaries[:3]:
        doc_name = s.get("document_name", "Unknown")
        preview = s.get("content_preview", "")[:50]
        chunk_idx = s.get("chunk_index", 0)
        chapter = s.get("chapter", "N/A")
        print(f'  [{chunk_idx}] {doc_name} | Chapter: {chapter}')
        print(f'       Preview: {preview}...')
except Exception as e:
    print(f'Error: {e}')

# Тест 2: Двухэтапный поиск - используем запрос по существующему контенту
print('\n=== TEST 2: Smart Two-Stage Search ===')
query = "Три человека комнаты финал"  # Запрос по существующему контенту
try:
    results, debug = rag.smart_two_stage_search(
        query=query,
        user_email=user_email,
        initial_candidates=20,
        final_chunks=5
    )
    print(f'Query: {query}')
    print(f'Stage 1 candidates: {debug.get("stage1_candidates", 0)}')
    print(f'Stage 2 selected: {debug.get("stage2_selected", 0)}')
    print(f'Final results: {len(results)}')
    for i, r in enumerate(results[:3]):
        content_preview = r.get("content", "")[:100]
        print(f'  [{i+1}] {content_preview}...')
except Exception as e:
    print(f'Error: {e}')
    import traceback
    traceback.print_exc()

# Тест 3: Гибридный умный поиск
print('\n=== TEST 3: Hybrid Smart Search ===')
try:
    results, debug = rag.hybrid_smart_search(
        query=query,
        user_email=user_email,
        use_smart_selection=True,
        candidates=20,
        final_chunks=5
    )
    print(f'Method: {debug.get("method")}')
    print(f'Similarity candidates: {debug.get("similarity_candidates", 0)}')
    print(f'AI selected: {debug.get("ai_selected", 0)}')
    print(f'Final results: {len(results)}')
except Exception as e:
    print(f'Error: {e}')
    import traceback
    traceback.print_exc()
