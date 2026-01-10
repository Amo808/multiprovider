"""Test 'о чем книга' query - the exact query that fails in UI"""
import sys
from pathlib import Path
import time

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from supabase_client.rag import RAGStore

print("=" * 60)
print("Testing query: 'о чем книга' (what is the book about)")
print("=" * 60)

rag = RAGStore()

user_email = "dev@example.com"
docs = rag.list_documents(user_email, status="ready")

if not docs:
    print("❌ No documents found")
    sys.exit(1)

doc_id = docs[0]["id"]
doc_name = docs[0]["name"]
print(f"\n📚 Document: {doc_name}")
print(f"   ID: {doc_id}")

# Test intent analysis first
print("\n" + "=" * 60)
print("1️⃣ Testing Intent Analysis")
print("=" * 60)

chapters = rag.get_document_chapters(user_email, doc_id)
all_chunks = rag.get_all_document_chunks(user_email, [doc_id])

document_structure = {
    "type": "book",
    "chapters": [ch["chapter_number"] for ch in chapters],
    "chapter_details": chapters,
    "total_chunks": len(all_chunks)
}

query = "о чем книга"
intent = rag.analyze_query_intent(query, document_structure)

print(f"\nQuery: '{query}'")
print(f"Intent analysis result:")
print(f"  - scope: {intent.get('scope', 'N/A')}")
print(f"  - task: {intent.get('task', 'N/A')}")
print(f"  - sections: {intent.get('sections', [])}")
print(f"  - reasoning: {intent.get('reasoning', 'N/A')[:100]}...")

expected_scope = "full_document"
expected_task = "summarize"

if intent.get('scope') == expected_scope:
    print(f"\n✅ Scope is correct: {expected_scope}")
else:
    print(f"\n❌ Scope mismatch! Expected: {expected_scope}, Got: {intent.get('scope')}")

# Test document stats
print("\n" + "=" * 60)
print("2️⃣ Testing Document Stats")
print("=" * 60)

stats = rag.get_document_stats(user_email, [doc_id])
print(f"\nDocument stats:")
print(f"  - total_chars: {stats.get('total_chars', 0):,}")
print(f"  - total_chunks: {stats.get('total_chunks', 0)}")
print(f"  - estimated_tokens: {stats.get('estimated_tokens', 0):,}")
print(f"  - recommended_approach: {stats.get('recommended_approach', 'N/A')}")

if stats.get('recommended_approach') == "full":
    print(f"\n✅ Recommended approach is 'full' (iterative disabled)")
else:
    print(f"\n❌ Approach is still iterative - this will cause hangs!")

# Test smart_rag_search
print("\n" + "=" * 60)
print("3️⃣ Testing smart_rag_search with 'о чем книга'")
print("=" * 60)

start_time = time.time()
try:
    context, sources, debug = rag.smart_rag_search(
        query="о чем книга",
        user_email=user_email,
        document_id=doc_id,
        max_tokens=100000
    )
    elapsed = time.time() - start_time
    
    print(f"\n✅ SUCCESS in {elapsed:.2f}s")
    print(f"  - Context length: {len(context):,} chars")
    print(f"  - Sources: {len(sources)}")
    print(f"  - Debug keys: {list(debug.keys())}")
    
    # Check if iterative was used
    if debug.get("auto_iterative"):
        print(f"\n⚠️ Warning: iterative mode was triggered!")
        print(f"   Batches: {debug.get('num_batches', 'N/A')}")
    else:
        print(f"\n✅ Full document mode was used (no iterative)")
    
    # Show first 500 chars of context
    print("\n" + "=" * 60)
    print("Context preview (first 500 chars):")
    print("=" * 60)
    print(context[:500] + "..." if len(context) > 500 else context)
    
except Exception as e:
    elapsed = time.time() - start_time
    print(f"\n❌ FAILED after {elapsed:.2f}s")
    print(f"   Error: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
print("Test completed!")
print("=" * 60)
