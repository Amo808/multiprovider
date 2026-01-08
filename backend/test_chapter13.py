"""Test script to find chapter 13 in document chunks"""
import re
from supabase_client.rag import RAGStore

rag = RAGStore()
doc_id = '44cc1366-9eee-4d00-848c-1a711ba88148'

# Get chunks
print('Loading chunks...')
chunks = rag.client.table('document_chunks').select('id,chunk_index,content').eq('document_id', doc_id).order('chunk_index').execute()
print(f'Total chunks: {len(chunks.data)}')

# Search for chapter 13
print()
print('=== SEARCHING FOR ГЛАВА 13 ===')
found = []
for chunk in chunks.data:
    content = chunk.get('content', '')
    if re.search(r'глава\s*13', content, re.IGNORECASE):
        found.append(chunk)
        idx = chunk['chunk_index']
        preview = content[:300].replace('\n', ' ')
        print(f'Chunk {idx}: {preview}...')
        print('---')

print(f'\nTotal chunks with "глава 13": {len(found)}')

# Also search for chapter patterns
print()
print('=== ALL CHAPTER PATTERNS FOUND ===')
chapter_pattern = re.compile(r'глава\s*(\d+)', re.IGNORECASE)
chapters_found = set()
for chunk in chunks.data:
    content = chunk.get('content', '')
    matches = chapter_pattern.findall(content)
    for m in matches:
        chapters_found.add(int(m))

chapters_found = sorted(chapters_found)
print(f'Chapters mentioned in document: {chapters_found}')
print(f'Chapter 13 is {"PRESENT" if 13 in chapters_found else "MISSING"}')
