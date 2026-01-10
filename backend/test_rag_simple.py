"""
RAG Settings Tester - Direct version
Тестирует RAG напрямую через функции rag.py (без API)
"""

import sys
import os
import json
import time
from datetime import datetime
from pathlib import Path

# Add path for imports
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

# Load env
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from supabase_client.rag import RAGStore

# Тестовые запросы
TEST_QUERIES = [
    {"query": "о чем этот документ", "type": "full_document"},
    {"query": "краткое содержание", "type": "summarize"},
    {"query": "основные темы", "type": "analyze"},
    {"query": "что говорится о главном герое", "type": "search"},
]

# Конфигурации для тестирования
TEST_CONFIGS = [
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
        "name": "Fixed 30 chunks",
        "chunk_mode": "fixed",
        "max_chunks": 30,
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
        "name": "Low threshold 0.1",
        "chunk_mode": "fixed",
        "max_chunks": 30,
        "chunk_percent": 20,
        "min_similarity": 0.1,
        "keyword_weight": 0.3,
        "semantic_weight": 0.7,
        "use_rerank": True,
    },
    {
        "name": "High threshold 0.5",
        "chunk_mode": "fixed",
        "max_chunks": 30,
        "chunk_percent": 20,
        "min_similarity": 0.5,
        "keyword_weight": 0.3,
        "semantic_weight": 0.7,
        "use_rerank": True,
    },
    {
        "name": "Keywords heavy 70/30",
        "chunk_mode": "fixed",
        "max_chunks": 30,
        "chunk_percent": 20,
        "min_similarity": 0.3,
        "keyword_weight": 0.7,
        "semantic_weight": 0.3,
        "use_rerank": True,
    },
    {
        "name": "Semantic heavy 10/90",
        "chunk_mode": "fixed",
        "max_chunks": 30,
        "chunk_percent": 20,
        "min_similarity": 0.3,
        "keyword_weight": 0.1,
        "semantic_weight": 0.9,
        "use_rerank": True,
    },
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


def run_tests():
    print("=" * 80)
    print("RAG SETTINGS TESTER (Direct)")
    print("=" * 80)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Init RAG store
    rag = RAGStore()
    user_email = "dev@example.com"
    
    # Get documents
    docs = rag.list_documents(user_email, status="ready")
    if not docs:
        print("❌ No documents found!")
        return
    
    print(f"📄 Found {len(docs)} document(s):")
    for doc in docs:
        print(f"   - {doc.get('name', 'Unknown')} (ID: {doc.get('id', 'N/A')[:8]}...)")
    print()
    
    doc_id = docs[0]["id"]
    doc_name = docs[0]["name"]
    
    print(f"📋 Testing with: {doc_name}")
    print(f"📝 Queries: {len(TEST_QUERIES)}")
    print(f"⚙️  Configs: {len(TEST_CONFIGS)}")
    print()
    
    results = []
    
    for config in TEST_CONFIGS:
        config_name = config["name"]
        print(f"\n{'='*60}")
        print(f"CONFIG: {config_name}")
        print(f"{'='*60}")
        
        for test in TEST_QUERIES:
            query = test["query"]
            qtype = test["type"]
            
            print(f"  🔍 [{qtype}] \"{query}\"", end=" ", flush=True)
            
            start = time.time()
            try:
                context, sources, debug = rag.smart_rag_search(
                    query=query,
                    user_email=user_email,
                    document_id=doc_id,
                    max_tokens=50000,
                    chunk_mode=config["chunk_mode"],
                    max_chunks=config["max_chunks"],
                    chunk_percent=config["chunk_percent"],
                    min_similarity=config["min_similarity"],
                    keyword_weight=config["keyword_weight"],
                    semantic_weight=config["semantic_weight"],
                    use_rerank=config["use_rerank"],
                )
                elapsed = time.time() - start
                
                intent = debug.get("intent", {})
                chunk_config = debug.get("chunk_config", {})
                
                print(f"✅ {elapsed*1000:.0f}ms")
                print(f"     📊 scope={intent.get('scope', 'N/A')} | task={intent.get('task', 'N/A')}")
                print(f"     📦 sources={len(sources)} | context={len(context)} chars")
                print(f"     🎯 target_chunks={chunk_config.get('target_chunks_calculated', 'N/A')}")
                
                results.append({
                    "config": config_name,
                    "query": query,
                    "type": qtype,
                    "success": True,
                    "elapsed_ms": int(elapsed * 1000),
                    "sources_count": len(sources),
                    "context_chars": len(context),
                    "scope": intent.get("scope"),
                    "task": intent.get("task"),
                    "target_chunks": chunk_config.get("target_chunks_calculated"),
                })
                
            except Exception as e:
                elapsed = time.time() - start
                print(f"❌ {elapsed*1000:.0f}ms - {str(e)[:60]}")
                results.append({
                    "config": config_name,
                    "query": query,
                    "type": qtype,
                    "success": False,
                    "elapsed_ms": int(elapsed * 1000),
                    "error": str(e)[:100],
                })
    
    # Summary
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
        print(f"⏱️  Avg time: {avg_time:.0f}ms")
        print(f"📚 Avg sources: {avg_sources:.1f}")
    
    # By config
    print("\n📊 By config:")
    for config in TEST_CONFIGS:
        name = config["name"]
        cfg_results = [r for r in results if r["config"] == name]
        cfg_success = [r for r in cfg_results if r["success"]]
        if cfg_results:
            rate = len(cfg_success) / len(cfg_results) * 100
            avg = sum(r["elapsed_ms"] for r in cfg_success) / len(cfg_success) if cfg_success else 0
            avg_src = sum(r["sources_count"] for r in cfg_success) / len(cfg_success) if cfg_success else 0
            print(f"   {name}: {rate:.0f}% | {avg:.0f}ms | {avg_src:.1f} sources")
    
    # Save
    outfile = f"rag_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(outfile, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n💾 Saved: {outfile}")


if __name__ == "__main__":
    run_tests()
