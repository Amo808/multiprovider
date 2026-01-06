"""Quick test of advanced RAG features"""
import os, sys
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

from supabase_client.rag import get_rag_store

rag = get_rag_store()

print("Testing build_cited_context...")
try:
    context, sources = rag.build_cited_context(
        query='права юридических лиц',
        user_email='dev@example.com',
        max_tokens=1500,
        use_rerank=False  # Skip rerank for faster test
    )
    print(f"Sources: {len(sources)}")
    for s in sources:
        print(f"  {s['citation']}")
    print(f"\nContext preview:\n{context[:500]}...")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
