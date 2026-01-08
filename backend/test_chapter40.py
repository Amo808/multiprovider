"""
Debug script to test SMART RAG + ULTIMATE RAG - universal AI-powered document retrieval
Tests: single chapters, multiple chapters, full document, comparisons, legal loopholes,
       HyDE, Multi-Query, Reranking, Contextual Compression
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from supabase_client.rag import get_rag_store
from supabase_client.client import get_or_create_user

def main():
    user_email = "dev@example.com"
    rag_store = get_rag_store()
    
    # Get user
    user = get_or_create_user(user_email)
    print(f"User: {user['email']} (id={user['id']})")
    
    # List documents
    docs = rag_store.list_documents(user_email, status="ready")
    print(f"\nFound {len(docs)} documents:")
    for doc in docs:
        print(f"  - {doc['name']} (id={doc['id']}, chunks={doc.get('chunks_count', '?')})")
    
    if not docs:
        print("No documents found!")
        return
    
    # Use first document
    doc_id = docs[0]["id"]
    doc_name = docs[0]["name"]
    print(f"\n=== Analyzing document: {doc_name} ===")
    
    # Get chapters
    chapters = rag_store.get_document_chapters(user_email, doc_id)
    print(f"\nDetected {len(chapters)} chapters:")
    for ch in chapters:
        print(f"  Chapter {ch['chapter_number']}: {ch['title'][:50]}... (chunks {ch['start_chunk']}-{ch['end_chunk']})")
    
    # Check if chapter 40 exists
    ch40 = None
    for ch in chapters:
        if str(ch['chapter_number']) == '40':
            ch40 = ch
            break
    
    if ch40:
        print(f"\n=== Found Chapter 40 ===")
        print(f"Title: {ch40['title']}")
        print(f"Chunk range: {ch40['start_chunk']} - {ch40['end_chunk']}")
        print(f"Preview: {ch40['preview'][:300]}...")
        
        # Get content
        content, sources = rag_store.get_chapter_content(user_email, doc_id, "40")
        print(f"\nChapter 40 content length: {len(content)} chars")
        print(f"Number of sources: {len(sources)}")
        
        if content:
            print(f"\nFirst 500 chars of chapter 40:")
            print(content[:500])
            print("\n...")
            print(f"\nLast 500 chars of chapter 40:")
            print(content[-500:])
    else:
        print(f"\n!!! Chapter 40 NOT FOUND in detected chapters !!!")
        print("\nLet's check raw chunks for 'глава 40' or 'chapter 40':")
        
        # Get all chunks
        all_chunks = rag_store.get_all_document_chunks(user_email, [doc_id])
        print(f"Total chunks: {len(all_chunks)}")
        
        # Search for chapter 40 mentions
        import re
        for chunk in all_chunks:
            content = chunk.get("content", "")
            if re.search(r'(?:глав[аеуы]|chapter)\s*40', content, re.IGNORECASE):
                print(f"\n=== Found mention in chunk {chunk['chunk_index']} ===")
                print(content[:500])
                print("---")
    
    # ========================================
    # DETAILED TEST: Verify FULL chapter content is extracted
    # ========================================
    print("\n" + "="*80)
    print("🔍 DETAILED TEST: Checking if FULL chapter 40 content is extracted")
    print("="*80)
    
    # Test single chapter extraction
    query = "расскажи о 40 главе"
    print(f"\n📝 Query: '{query}'")
    
    context, sources, debug = rag_store.smart_rag_search(
        query=query,
        user_email=user_email,
        document_id=doc_id
    )
    
    print(f"\n📊 EXTRACTION STATS:")
    print(f"   Context length: {len(context)} chars")
    print(f"   Estimated tokens: ~{len(context)//4} tokens")
    print(f"   Sources count: {len(sources)}")
    
    # Compare with direct chapter content
    direct_content, direct_sources = rag_store.get_chapter_content(user_email, doc_id, "40")
    print(f"\n📊 DIRECT CHAPTER 40 STATS (for comparison):")
    print(f"   Direct content length: {len(direct_content)} chars")
    print(f"   Direct sources count: {len(direct_sources)}")
    
    # Check if content matches
    # The smart_rag context includes header, so it should be >= direct content
    if len(context) >= len(direct_content) * 0.9:  # Allow 10% tolerance for headers
        print(f"\n✅ SUCCESS! Full chapter content is included!")
    else:
        print(f"\n❌ WARNING! Context might be truncated!")
        print(f"   Expected: ~{len(direct_content)} chars")
        print(f"   Got: {len(context)} chars")
        print(f"   Missing: ~{len(direct_content) - len(context)} chars")
    
    # Show content details
    print(f"\n{'='*60}")
    print("📖 CONTEXT CONTENT ANALYSIS:")
    print(f"{'='*60}")
    
    print(f"\n🔹 FIRST 1000 chars:")
    print("-"*40)
    print(context[:1000])
    
    print(f"\n🔹 LAST 1000 chars:")
    print("-"*40)
    print(context[-1000:])
    
    # Check for "ГЛАВА 40" and "ГЛАВА 41" markers
    if "ГЛАВА 40" in context or "Глава 40" in context:
        print(f"\n✅ Chapter 40 header FOUND in context")
    else:
        print(f"\n⚠️ Chapter 40 header NOT found in context")
    
    if "ГЛАВА 41" in context or "Глава 41" in context:
        print(f"\n✅ Chapter 41 header FOUND - full chapter included!")
    else:
        print(f"\n⚠️ Chapter 41 header NOT found - might be truncated")
    
    # Intent analysis
    intent = debug.get("intent", {})
    print(f"\n📊 AI INTENT ANALYSIS:")
    print(f"   Scope: {intent.get('scope')}")
    print(f"   Task: {intent.get('task')}")
    print(f"   Sections: {intent.get('sections')}")
    print(f"   Reasoning: {intent.get('reasoning')}")
    
    # ========================================
    # TEST ULTIMATE RAG TECHNIQUES
    # ========================================
    print("\n" + "="*80)
    print("🚀 TESTING ULTIMATE RAG TECHNIQUES")
    print("    (HyDE, Multi-Query, Reranking, Contextual Compression)")
    print("="*80)
    
    # Check if ultimate_rag_search is available
    if hasattr(rag_store, 'ultimate_rag_search'):
        # Test HyDE strategy
        print("\n\n📝 Test 1: HyDE Strategy (for factual question)")
        print("-" * 60)
        query = "Что такое Блок-7 в книге?"
        result = rag_store.ultimate_rag_search(
            query=query,
            user_email=user_email,
            strategy="hyde"
        )
        print(f"Query: {query}")
        print(f"Strategy: {result['debug'].get('strategy')}")
        print(f"Techniques used: {result['debug'].get('techniques_used')}")
        print(f"Generated queries: {result['debug'].get('generated_queries')}")
        print(f"Total candidates: {result['debug'].get('total_candidates')}")
        print(f"After rerank: {result['debug'].get('after_rerank')}")
        print(f"Final chunks: {result['debug'].get('final_chunks')}")
        print(f"Context length: {len(result['context'])} chars")
        if result['sources']:
            print(f"Top source similarity: {result['sources'][0].get('similarity', 0):.3f}")
        
        # Test Multi-Query strategy
        print("\n\n📝 Test 2: Multi-Query Strategy (for complex question)")
        print("-" * 60)
        query = "Как связаны Квадрат и Треугольник в истории?"
        result = rag_store.ultimate_rag_search(
            query=query,
            user_email=user_email,
            strategy="multi_query"
        )
        print(f"Query: {query}")
        print(f"Strategy: {result['debug'].get('strategy')}")
        print(f"Techniques used: {result['debug'].get('techniques_used')}")
        print(f"Generated queries:")
        for i, q in enumerate(result['debug'].get('generated_queries', [])):
            print(f"   {i+1}. {q[:80]}...")
        print(f"Total candidates: {result['debug'].get('total_candidates')}")
        print(f"Final chunks: {result['debug'].get('final_chunks')}")
        
        # Test Auto strategy
        print("\n\n📝 Test 3: Auto Strategy Selection")
        print("-" * 60)
        test_queries = [
            ("Что такое комплекс Утро?", "factual -> hyde"),
            ("Почему Квадрат хочет сбежать?", "complex -> multi_query"),
            ("Найди лазейку в правилах Блока-7", "legal -> agentic"),
        ]
        for query, expected in test_queries:
            result = rag_store.ultimate_rag_search(
                query=query,
                user_email=user_email,
                strategy="auto"
            )
            print(f"Query: {query[:50]}...")
            print(f"   Expected: {expected}")
            print(f"   Auto-detected: {result['debug'].get('auto_detected_strategy')}")
            print(f"   Techniques: {result['debug'].get('techniques_used')}")
            print()
        
        print("\n✅ Ultimate RAG tests completed!")
    else:
        print("\n⚠️ ultimate_rag_search not available - skipping Ultimate RAG tests")

if __name__ == "__main__":
    main()
