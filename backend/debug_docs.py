"""Debug: test full RLM flow with real document"""
import requests, json

DOC_ID = "8645c484-a9f3-46"  # Will need full ID

# First, get the full doc ID
from supabase_client.rag import get_rag_store
rag = get_rag_store()
docs = rag.list_documents('dev@example.com', status='ready', limit=5)
if docs:
    doc_id = docs[0]["id"]
    doc_name = docs[0].get("name", "?")
    print(f"Real doc: {doc_id} | {doc_name}")
    
    # Test loading chunks
    chunks = rag.get_all_document_chunks('dev@example.com', document_ids=[doc_id])
    print(f"Chunks loaded: {len(chunks)}")
    if chunks:
        print(f"First chunk preview: {chunks[0].get('content','')[:100]}...")
    
    # Now test the API with this real doc ID
    print("\n--- Testing API ---")
    data = {
        'message': 'О чем эта книга?',
        'provider': 'deepseek',
        'model': 'deepseek-chat',
        'rag': {
            'enabled': False,
            'mode': 'off',
            'use_rlm': True,
            'rlm_max_iterations': 5,
            'document_ids': [doc_id]
        }
    }
    
    r = requests.post('http://localhost:8000/api/chat/send',
        json=data,
        headers={'Content-Type': 'application/json'},
        stream=True, timeout=120)
    print(f'Status: {r.status_code}')
    
    full_content = ""
    for line in r.iter_lines(decode_unicode=True):
        if line and line.startswith('data: '):
            try:
                d = json.loads(line[6:])
                if d.get('rlm_mode'):
                    print(f"[RLM INFO] docs={d.get('rlm_docs')}, context_chars={d.get('rlm_context_chars')}")
                if d.get('content'):
                    full_content += d['content']
                if d.get('done'):
                    print(f"[DONE] meta={json.dumps({k:v for k,v in d.items() if k != 'content'}, ensure_ascii=False)}")
                    break
                if d.get('error'):
                    print(f"[ERROR] {d['error']}")
                    break
                if d.get('meta', {}).get('thinking'):
                    print(f"[THINKING] {d['meta']['thinking']}")
            except:
                pass
    
    print(f"\nResponse length: {len(full_content)} chars")
    print(f"Response preview: {full_content[:300]}...")
else:
    print("No documents found!")
for d in docs[:10]:
    print(f'  {d["id"][:12]}... | {d.get("name","?")} | user: {d.get("user_email","?")} | chunks: {d.get("total_chunks",0)} | conv: {d.get("conversation_id","?")}')

print()

# Try with common email patterns
for email in ['dev@test.com', 'anonymous', '', 'amo808@gmail.com', 'test@test.com']:
    d2 = rag.list_documents(email, status='ready', limit=10)
    if d2:
        print(f'User "{email}": {len(d2)} docs')
        for dd in d2[:3]:
            print(f'  {dd["id"][:12]}... | {dd.get("name")} | chunks: {dd.get("total_chunks",0)}')
    else:
        print(f'User "{email}": 0 docs')

# Test get_all_document_chunks with first doc if exists
if docs:
    first_id = docs[0]["id"]
    first_email = docs[0].get("user_email", "")
    print(f'\nTesting get_all_document_chunks for doc {first_id[:12]}...')
    chunks = rag.get_all_document_chunks(first_email, document_ids=[first_id])
    print(f'  Got {len(chunks)} chunks, first chunk: {chunks[0].get("content","")[:100] if chunks else "NONE"}...')
