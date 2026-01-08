"""Find exact location of chapter 13"""
import re
from supabase_client.rag import RAGStore

rag = RAGStore()
doc_id = '44cc1366-9eee-4d00-848c-1a711ba88148'

print('=== FINDING CHAPTER 13 EXACT LOCATION ===')

# Get all chunks
chunks = rag.client.table('document_chunks').select('chunk_index,content').eq('document_id', doc_id).order('chunk_index').execute()

chapter_pattern = re.compile(r'глава\s*13', re.IGNORECASE)

for chunk in chunks.data:
    content = chunk.get('content', '')
    idx = chunk['chunk_index']
    
    match = chapter_pattern.search(content)
    if match:
        start = max(0, match.start() - 50)
        end = min(len(content), match.end() + 200)
        context = content[start:end]
        print(f'Chunk {idx}:')
        print(f'  Match position in chunk: {match.start()}')
        print(f'  Context: ...{context}...')
        print()

# Now find all chapters and see which ones are detected
print('=== ALL CHAPTERS IN DOCUMENT ===')
all_chapter_pattern = re.compile(r'глава\s*(\d+)', re.IGNORECASE)

chapters_found = {}
for chunk in chunks.data:
    content = chunk.get('content', '')
    idx = chunk['chunk_index']
    
    for match in all_chapter_pattern.finditer(content):
        ch_num = int(match.group(1))
        if ch_num not in chapters_found:
            pos = match.start()
            context = content[max(0, pos-30):min(len(content), pos+100)]
            chapters_found[ch_num] = {
                'chunk': idx,
                'position_in_chunk': pos,
                'context': context
            }

for ch_num in sorted(chapters_found.keys()):
    info = chapters_found[ch_num]
    print(f'Глава {ch_num}: Chunk {info["chunk"]}, position {info["position_in_chunk"]}')
    # Check if position is > 500 (which means it won't be detected)
    if info['position_in_chunk'] > 500:
        print(f'  ⚠️ POSITION > 500 - WON''T BE DETECTED!')
