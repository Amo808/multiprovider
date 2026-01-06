"""Check existing documents in RAG store"""
from dotenv import load_dotenv
load_dotenv()

from supabase_client.rag import get_rag_store

rag = get_rag_store()
docs = rag.list_documents('dev@example.com')
print(f'Found {len(docs)} documents')
for d in docs:
    filename = d.get('filename', d.get('name', 'Unknown'))
    status = d.get('status', 'unknown')
    chunks = d.get('total_chunks', 0)
    print(f'  - {filename}: {status} ({chunks} chunks)')
