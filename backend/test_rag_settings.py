"""
RAG Settings Tester
Тестирует разные комбинации настроек RAG

Тестируемые параметры:
- chunk_mode: "fixed", "percent", "adaptive"
- chunk_percent: 10%, 50%, 100%
- min_similarity: 0.1, 0.3, 0.5
- keyword_weight / semantic_weight: разные балансы
- use_rerank: True/False
"""

import asyncio
import httpx
import json
import time
from typing import Dict, Any, List
from datetime import datetime

API_URL = "http://localhost:8000"

# Тестовые запросы разных типов
TEST_QUERIES = [
    # Поиск данных
    {"query": "сколько стран участвовало", "type": "find_data"},
    {"query": "какие числа упоминаются", "type": "find_data"},
    # Полный документ
    {"query": "о чем этот документ", "type": "full_document"},
    {"query": "краткое содержание", "type": "summarize"},
    # Поиск конкретной информации  
    {"query": "что говорится о России", "type": "search"},
    {"query": "основные темы документа", "type": "analyze"},
]

# Комбинации настроек для тестирования
TEST_CONFIGS = [
    # Базовые режимы
    {
        "name": "Fixed 10 chunks",
        "chunk_mode": "fixed",
        "max_chunks": 10,
        "chunk_percent": 20,
        "min_similarity": 0.3,
        "keyword_weight": 0.3,
        "semantic_weight": 0.7,
        "use_rerank": True,
    },
    {
        "name": "Fixed 50 chunks",
        "chunk_mode": "fixed",
        "max_chunks": 50,
        "chunk_percent": 20,
        "min_similarity": 0.3,
        "keyword_weight": 0.3,
        "semantic_weight": 0.7,
        "use_rerank": True,
    },
    {
        "name": "Percent 20%",
        "chunk_mode": "percent",
        "max_chunks": 50,
        "chunk_percent": 20,
        "min_similarity": 0.3,
        "keyword_weight": 0.3,
        "semantic_weight": 0.7,
        "use_rerank": True,
    },
    {
        "name": "Percent 50%",
        "chunk_mode": "percent",
        "max_chunks": 100,
        "chunk_percent": 50,
        "min_similarity": 0.3,
        "keyword_weight": 0.3,
        "semantic_weight": 0.7,
        "use_rerank": True,
    },
    {
        "name": "Percent 100% (full doc)",
        "chunk_mode": "percent",
        "max_chunks": 500,
        "chunk_percent": 100,
        "min_similarity": 0.1,
        "keyword_weight": 0.3,
        "semantic_weight": 0.7,
        "use_rerank": False,
    },
    {
        "name": "Adaptive (AI decides)",
        "chunk_mode": "adaptive",
        "max_chunks": 50,
        "chunk_percent": 20,
        "min_similarity": 0.3,
        "keyword_weight": 0.3,
        "semantic_weight": 0.7,
        "use_rerank": True,
        "adaptive_chunks": True,
    },
    # Разные пороги релевантности
    {
        "name": "Low threshold (0.1)",
        "chunk_mode": "fixed",
        "max_chunks": 30,
        "chunk_percent": 20,
        "min_similarity": 0.1,
        "keyword_weight": 0.3,
        "semantic_weight": 0.7,
        "use_rerank": True,
    },
    {
        "name": "High threshold (0.5)",
        "chunk_mode": "fixed",
        "max_chunks": 30,
        "chunk_percent": 20,
        "min_similarity": 0.5,
        "keyword_weight": 0.3,
        "semantic_weight": 0.7,
        "use_rerank": True,
    },
    # Разные балансы поиска
    {
        "name": "Keywords heavy (70/30)",
        "chunk_mode": "fixed",
        "max_chunks": 30,
        "chunk_percent": 20,
        "min_similarity": 0.3,
        "keyword_weight": 0.7,
        "semantic_weight": 0.3,
        "use_rerank": True,
    },
    {
        "name": "Semantic heavy (10/90)",
        "chunk_mode": "fixed",
        "max_chunks": 30,
        "chunk_percent": 20,
        "min_similarity": 0.3,
        "keyword_weight": 0.1,
        "semantic_weight": 0.9,
        "use_rerank": True,
    },
    # С/без rerank
    {
        "name": "No rerank",
        "chunk_mode": "fixed",
        "max_chunks": 30,
        "chunk_percent": 20,
        "min_similarity": 0.3,
        "keyword_weight": 0.3,
        "semantic_weight": 0.7,
        "use_rerank": False,
    },
]


async def get_documents() -> List[Dict]:
    """Получить список документов пользователя"""
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{API_URL}/api/rag/documents")
        if resp.status_code == 200:
            return resp.json().get("documents", [])
        return []


async def test_rag_query(
    query: str,
    config: Dict[str, Any],
    document_id: str = None
) -> Dict[str, Any]:
    """Выполнить тестовый запрос к RAG"""
    
    request_body = {
        "message": query,  # Одно поле message, не массив messages
        "model": "gpt-4o-mini",  # Используем дешёвую модель для тестов
        "provider": "openai",
        "stream": False,  # Отключаем streaming для тестов
        "rag": {
            "enabled": True,
            "document_id": document_id,
            "chunk_mode": config.get("chunk_mode", "fixed"),
            "max_chunks": config.get("max_chunks", 50),
            "chunk_percent": config.get("chunk_percent", 20),
            "min_similarity": config.get("min_similarity", 0.3),
            "keyword_weight": config.get("keyword_weight", 0.3),
            "semantic_weight": config.get("semantic_weight", 0.7),
            "use_rerank": config.get("use_rerank", True),
            "adaptive_chunks": config.get("adaptive_chunks", False),
            "include_metadata": True,
        }
    }
    
    start_time = time.time()
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.post(
                f"{API_URL}/api/chat/send",
                json=request_body,
                headers={"Content-Type": "application/json"}
            )
            
            elapsed = time.time() - start_time
            
            if resp.status_code == 200:
                # API возвращает SSE даже с stream=False, парсим построчно
                full_response = ""
                sources = []
                rag_debug = {}
                
                for line in resp.text.split("\n"):
                    line = line.strip()
                    if not line or not line.startswith("data:"):
                        continue
                    
                    data_str = line[5:].strip()  # Убираем "data:" и пробелы
                    if data_str == "[DONE]":
                        break
                    
                    try:
                        data = json.loads(data_str)
                        msg_type = data.get("type", "")
                        
                        if msg_type == "content":
                            full_response += data.get("content", "")
                        elif msg_type == "rag_sources":
                            sources = data.get("sources", [])
                        elif msg_type == "rag_debug":
                            rag_debug = data.get("debug", {})
                        elif msg_type == "done":
                            break
                    except json.JSONDecodeError:
                        continue
                
                return {
                    "success": True,
                    "elapsed_ms": int(elapsed * 1000),
                    "response_length": len(full_response),
                    "sources_count": len(sources),
                    "rag_debug": rag_debug,
                    "response_preview": full_response[:200] + "..." if len(full_response) > 200 else full_response
                }
            else:
                return {
                    "success": False,
                    "elapsed_ms": int(elapsed * 1000),
                    "error": f"HTTP {resp.status_code}: {resp.text[:200]}"
                }
        except Exception as e:
            return {
                "success": False,
                "elapsed_ms": int((time.time() - start_time) * 1000),
                "error": str(e)
            }


async def run_tests():
    """Запустить все тесты"""
    print("=" * 80)
    print("RAG SETTINGS TESTER")
    print("=" * 80)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Получаем документы
    docs = await get_documents()
    if not docs:
        print("❌ No documents found! Please upload a document first.")
        return
    
    print(f"📄 Found {len(docs)} document(s):")
    for doc in docs:
        print(f"   - {doc.get('name', 'Unknown')} (ID: {doc.get('id', 'N/A')[:8]}...)")
    print()
    
    # Используем первый документ для тестов
    doc_id = docs[0].get("id")
    doc_name = docs[0].get("name", "Unknown")
    
    print(f"📋 Testing with document: {doc_name}")
    print(f"📝 Test queries: {len(TEST_QUERIES)}")
    print(f"⚙️  Test configs: {len(TEST_CONFIGS)}")
    print(f"🔢 Total tests: {len(TEST_QUERIES) * len(TEST_CONFIGS)}")
    print()
    
    results = []
    
    # Тестируем каждую комбинацию
    for config in TEST_CONFIGS:
        config_name = config.get("name", "Unknown")
        print(f"\n{'='*60}")
        print(f"CONFIG: {config_name}")
        print(f"{'='*60}")
        print(f"  chunk_mode: {config.get('chunk_mode')}")
        print(f"  max_chunks: {config.get('max_chunks')}")
        print(f"  chunk_percent: {config.get('chunk_percent')}%")
        print(f"  min_similarity: {config.get('min_similarity')}")
        print(f"  keyword/semantic: {config.get('keyword_weight')}/{config.get('semantic_weight')}")
        print(f"  use_rerank: {config.get('use_rerank')}")
        print()
        
        for test_query in TEST_QUERIES:
            query = test_query["query"]
            query_type = test_query["type"]
            
            print(f"  🔍 [{query_type}] \"{query}\"")
            
            result = await test_rag_query(query, config, doc_id)
            
            if result["success"]:
                debug = result.get("rag_debug", {})
                intent = debug.get("intent", {})
                
                print(f"     ✅ {result['elapsed_ms']}ms | {result['sources_count']} sources | {result['response_length']} chars")
                print(f"     📊 scope={intent.get('scope', 'N/A')} | task={intent.get('task', 'N/A')}")
                
                chunk_config = debug.get("chunk_config", {})
                if chunk_config:
                    print(f"     📦 target_chunks={chunk_config.get('target_chunks_calculated', 'N/A')}")
            else:
                print(f"     ❌ FAILED: {result.get('error', 'Unknown error')[:80]}")
            
            results.append({
                "config": config_name,
                "query": query,
                "query_type": query_type,
                **result
            })
            
            # Небольшая пауза между запросами
            await asyncio.sleep(0.5)
    
    # Итоговая статистика
    print("\n")
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    successful = [r for r in results if r["success"]]
    failed = [r for r in results if not r["success"]]
    
    print(f"✅ Successful: {len(successful)}/{len(results)}")
    print(f"❌ Failed: {len(failed)}/{len(results)}")
    
    if successful:
        avg_time = sum(r["elapsed_ms"] for r in successful) / len(successful)
        avg_sources = sum(r["sources_count"] for r in successful) / len(successful)
        print(f"⏱️  Avg response time: {avg_time:.0f}ms")
        print(f"📚 Avg sources: {avg_sources:.1f}")
    
    # Статистика по конфигам
    print("\n📊 Results by config:")
    for config in TEST_CONFIGS:
        config_name = config["name"]
        config_results = [r for r in results if r["config"] == config_name]
        config_success = [r for r in config_results if r["success"]]
        if config_results:
            success_rate = len(config_success) / len(config_results) * 100
            avg_time = sum(r["elapsed_ms"] for r in config_success) / len(config_success) if config_success else 0
            print(f"   {config_name}: {success_rate:.0f}% success, {avg_time:.0f}ms avg")
    
    # Сохраняем результаты в файл
    output_file = f"rag_test_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n💾 Results saved to: {output_file}")


if __name__ == "__main__":
    asyncio.run(run_tests())
