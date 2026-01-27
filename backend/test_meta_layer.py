"""Test meta layer functionality"""
from supabase_client.rag import get_rag_store

rag = get_rag_store()

# Get list of documents
docs = rag.list_documents('dev@example.com', status='ready', limit=5)
print('=== DOCUMENTS ===')
for d in docs:
    print(f"  {d['id'][:8]}... - {d['name']}")

if docs:
    doc_id = docs[0]['id']
    doc_name = docs[0]['name']
    print(f'\n=== TESTING META FOR: {doc_name} ===')
    
    # Check if meta exists
    meta = rag.get_document_meta(doc_id, 'dev@example.com')
    print(f'Meta exists: {meta is not None}')
    
    if not meta:
        print('Building meta...')
        meta = rag.build_document_meta(doc_id, 'dev@example.com')
    
    if meta and 'error' not in meta:
        print(f'Total chapters: {meta.get("total_chapters", 0)}')
        print(f'Total chunks: {meta.get("total_chunks", 0)}')
        print(f'Document type: {meta.get("document_type", "unknown")}')
        
        # Show chapter list
        chapters = meta.get("chapter_list", [])
        if chapters:
            print(f'\nChapter list ({len(chapters)} chapters):')
            for ch in chapters[:5]:
                print(f"  Глава {ch.get('number')}: {ch.get('title', '')[:50]}")
            if len(chapters) > 5:
                print(f"  ... и ещё {len(chapters) - 5}")
    else:
        print(f'Meta error: {meta}')
    
    # Test quick answer
    print('\n=== QUICK ANSWER TEST ===')
    answer = rag.get_quick_answer(doc_id, 'dev@example.com', 'сколько глав в книге?')
    if answer:
        print('Quick answer WORKS!')
        print(answer)
    else:
        print('No quick answer (will use RAG)')
        
    # Test structure question
    print('\n=== STRUCTURE QUESTION TEST ===')
    answer2 = rag.get_quick_answer(doc_id, 'dev@example.com', 'покажи оглавление')
    if answer2:
        print('Structure answer WORKS!')
        print(answer2[:500])
else:
    print('No documents found')
