"""Test chapter extraction logic"""
import re
from supabase_client.rag import RAGStore

rag = RAGStore()
doc_id = '44cc1366-9eee-4d00-848c-1a711ba88148'
user_id = '48e89230-ab02-45b1-85aa-18edfb7877eb'

# Test get_document_chapters method
print('=== TESTING get_document_chapters ===')

# First, let's check what structure the method expects
try:
    # The method expects user_email, let's find it
    user = rag.client.table('users').select('*').eq('id', user_id).execute()
    if user.data:
        user_email = user.data[0].get('email')
        print(f'User email: {user_email}')
        
        # Call the method
        chapters = rag.get_document_chapters(user_email, doc_id)
        print(f'Chapters returned: {len(chapters)}')
        print(f'Chapter numbers: {[ch.get("chapter_number") for ch in chapters]}')
    else:
        print('User not found, trying with None')
except Exception as e:
    print(f'Error: {e}')
    import traceback
    traceback.print_exc()

print()
print('=== CHECKING CHUNKS METADATA ===')
# Check if chunks have chapter info in metadata
chunks = rag.client.table('document_chunks').select('id,chunk_index,metadata,content').eq('document_id', doc_id).order('chunk_index').limit(20).execute()

for chunk in chunks.data[:10]:
    meta = chunk.get('metadata', {})
    idx = chunk['chunk_index']
    content_preview = chunk.get('content', '')[:100].replace('\n', ' ')
    if meta:
        print(f'Chunk {idx}: metadata={meta}, content: {content_preview}...')
    else:
        print(f'Chunk {idx}: NO metadata, content: {content_preview}...')

# Check chunk 204 specifically
print()
print('=== CHECKING CHUNK 204 (where chapter 13 is) ===')
chunk_204 = rag.client.table('document_chunks').select('*').eq('document_id', doc_id).eq('chunk_index', 204).execute()
if chunk_204.data:
    c = chunk_204.data[0]
    print(f'Chunk 204 metadata: {c.get("metadata")}')
    print(f'Chunk 204 content (first 500 chars): {c.get("content", "")[:500]}')
