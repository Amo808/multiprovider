"""Test getting chapter 13 content"""
from supabase_client.rag import RAGStore

rag = RAGStore()
doc_id = '44cc1366-9eee-4d00-848c-1a711ba88148'
user_email = 'dev@example.com'

print('=== GETTING CHAPTER 13 CONTENT ===')

content, sources = rag.get_chapter_content(user_email, doc_id, '13')

print(f'Content length: {len(content)} chars')
print(f'Sources count: {len(sources)}')

if content:
    print()
    print('=== FIRST 1000 CHARS OF CHAPTER 13 ===')
    print(content[:1000])
    print('...')
    print()
    print('=== LAST 500 CHARS OF CHAPTER 13 ===')
    print('...')
    print(content[-500:])
else:
    print('NO CONTENT FOUND!')
