"""Test that chunk_mode=fixed respects max_chunks setting"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from supabase_client.rag import RAGStore

rag = RAGStore()
user_email = "dev@example.com"
docs = rag.list_documents(user_email, status="ready")

if not docs:
    print("No documents found")
    sys.exit(1)

doc_id = docs[0]["id"]
doc_name = docs[0]["name"]
all_chunks = rag.get_all_document_chunks(user_email, [doc_id])
print(f"Testing with doc: {doc_name}")
print(f"Total chunks in doc: {len(all_chunks)}")

# Test 1: chunk_mode=fixed with max_chunks=10
print("\n" + "="*60)
print("Test 1: chunk_mode=fixed, max_chunks=10")
print("="*60)
context, sources, debug = rag.smart_rag_search(
    query="о чем книга",
    user_email=user_email,
    document_id=doc_id,
    max_tokens=50000,
    chunk_mode="fixed",
    max_chunks=10
)
print(f"Intent scope: {debug.get('intent', {}).get('scope', 'N/A')}")
print(f"Final scope: {debug.get('scope', 'N/A')}")
print(f"Sources count: {len(sources)}")
print(f"Context chars: {len(context)}")
print(f"Estimated tokens: {len(context) // 4}")

if debug.get("scope") == "search":
    print("✅ SUCCESS: Fixed mode triggered semantic search instead of full doc!")
else:
    print("❌ FAIL: Still using full_document despite fixed mode")

# Test 2: chunk_mode=adaptive (should load full doc)
print("\n" + "="*60)
print("Test 2: chunk_mode=adaptive (should load full doc)")
print("="*60)
context2, sources2, debug2 = rag.smart_rag_search(
    query="о чем книга",
    user_email=user_email,
    document_id=doc_id,
    max_tokens=100000,
    chunk_mode="adaptive"
)
print(f"Intent scope: {debug2.get('intent', {}).get('scope', 'N/A')}")
print(f"Final scope: {debug2.get('scope', 'N/A')}")
print(f"Sources count: {len(sources2)}")
print(f"Context chars: {len(context2)}")
print(f"Estimated tokens: {len(context2) // 4}")

if debug2.get("scope") == "full_document":
    print("✅ SUCCESS: Adaptive mode loaded full document!")
else:
    print("⚠️ Note: Adaptive mode used semantic search")

print("\n" + "="*60)
print("Tests completed!")
print("="*60)
