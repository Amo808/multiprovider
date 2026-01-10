"""Debug script to get full traceback"""
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from supabase_client.rag import RAGStore

print("Starting debug...")
print(f"RAGStore location: {RAGStore.__module__}")

rag = RAGStore()

# Check which methods exist
print("\nChecking methods:")
print(f"  build_iterative_summary_context: {hasattr(rag, 'build_iterative_summary_context')}")
print(f"  build_synthesis_context: {hasattr(rag, 'build_synthesis_context')}")
print(f"  _build_batch_from_cached: {hasattr(rag, '_build_batch_from_cached')}")

user_email = "dev@example.com"
docs = rag.list_documents(user_email, status="ready")
if docs:
    doc_id = docs[0]["id"]
    print(f"\nTesting with doc: {docs[0]['name']}")
    
    try:
        context, sources, debug = rag.smart_rag_search(
            query="о чем этот документ",
            user_email=user_email,
            document_id=doc_id,
            max_tokens=50000
        )
        print(f"SUCCESS: {len(context)} chars")
    except Exception as e:
        print(f"\nFULL ERROR:")
        traceback.print_exc()
else:
    print("No documents found")
