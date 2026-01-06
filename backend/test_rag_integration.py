"""
Test script for RAG integration in chat
Run this to verify the full RAG pipeline works
"""
import asyncio
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

async def test_rag_integration():
    print("=" * 60)
    print("RAG INTEGRATION TEST")
    print("=" * 60)
    
    # 1. Test RAG store initialization
    print("\n1. Testing RAG store initialization...")
    try:
        from supabase_client.rag import get_rag_store
        rag_store = get_rag_store()
        print("   ✓ RAG store initialized")
    except Exception as e:
        print(f"   ✗ Failed to initialize RAG store: {e}")
        return False
    
    # 2. Test document listing
    print("\n2. Testing document listing...")
    test_email = "test@example.com"
    try:
        docs = rag_store.list_documents(test_email)
        print(f"   ✓ Found {len(docs)} documents for test user")
    except Exception as e:
        print(f"   ✗ Failed to list documents: {e}")
        return False
    
    # 3. Test embedding creation
    print("\n3. Testing embedding creation...")
    try:
        embedding = rag_store.create_embedding("Test query for RAG")
        print(f"   ✓ Created embedding with {len(embedding)} dimensions")
    except Exception as e:
        print(f"   ✗ Failed to create embedding: {e}")
        return False
    
    # 4. Test search (even with no documents)
    print("\n4. Testing search functionality...")
    try:
        results = rag_store.search(
            query="test query",
            user_email=test_email,
            limit=5
        )
        print(f"   ✓ Search returned {len(results)} results")
    except Exception as e:
        print(f"   ✗ Search failed: {e}")
        return False
    
    # 5. Test hybrid search
    print("\n5. Testing hybrid search...")
    try:
        results = rag_store.hybrid_search(
            query="test query",
            user_email=test_email,
            limit=5
        )
        print(f"   ✓ Hybrid search returned {len(results)} results")
    except Exception as e:
        print(f"   ⚠ Hybrid search failed (may need documents): {e}")
    
    # 6. Test context building
    print("\n6. Testing context building...")
    try:
        context, sources = rag_store.build_rag_context(
            query="test query",
            user_email=test_email,
            max_tokens=1000
        )
        print(f"   ✓ Built context with {len(sources)} sources")
        if context:
            print(f"   ✓ Context preview: {context[:100]}...")
    except Exception as e:
        print(f"   ⚠ Context building failed (may need documents): {e}")
    
    # 7. Test cited context
    print("\n7. Testing cited context building...")
    try:
        context, sources = rag_store.build_cited_context(
            query="test query",
            user_email=test_email,
            max_tokens=1000,
            use_rerank=False  # Skip reranking for speed
        )
        print(f"   ✓ Built cited context with {len(sources)} sources")
        for src in sources[:3]:
            print(f"      - [{src['index']}] {src.get('citation', 'No citation')}")
    except Exception as e:
        print(f"   ⚠ Cited context failed (may need documents): {e}")
    
    print("\n" + "=" * 60)
    print("RAG INTEGRATION TEST COMPLETE")
    print("=" * 60)
    
    return True


if __name__ == "__main__":
    success = asyncio.run(test_rag_integration())
    sys.exit(0 if success else 1)
