"""Test RAG search with actual documents"""
from dotenv import load_dotenv
load_dotenv()

from supabase_client.rag import get_rag_store

rag = get_rag_store()

# Search for something in the law document
query = "штрафы за нарушения"
print(f"Searching for: '{query}'")
print("=" * 60)

# Test hybrid search
results = rag.hybrid_search(
    query=query,
    user_email="dev@example.com",
    limit=5
)

print(f"\nFound {len(results)} results:")
for i, r in enumerate(results):
    print(f"\n[{i+1}] {r.get('document_name', 'Unknown')}")
    print(f"    Score: {r.get('combined_score', r.get('similarity', 0)):.3f}")
    print(f"    Content: {r['content'][:150]}...")

# Test cited context
print("\n" + "=" * 60)
print("Building cited context...")
context, sources = rag.build_cited_context(
    query=query,
    user_email="dev@example.com",
    use_rerank=False
)

print(f"\nSources ({len(sources)}):")
for src in sources:
    print(f"  [{src['index']}] {src['citation']} (score: {src['similarity']:.3f})")

print(f"\nContext preview:")
print(context[:500] + "..." if len(context) > 500 else context)
