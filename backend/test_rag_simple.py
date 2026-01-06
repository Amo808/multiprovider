"""Test Document RAG"""
import os, sys, asyncio
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

from supabase_client.rag import get_rag_store

TEST_DOC = '''
# Гражданский кодекс РФ (тестовый фрагмент)

## Статья 1. Основные положения
Гражданское законодательство основывается на признании равенства участников.

## Статья 421. Свобода договора  
Граждане и юридические лица свободны в заключении договора.
Понуждение к заключению договора не допускается.

## Статья 128. Объекты гражданских прав
К объектам гражданских прав относятся вещи, деньги и ценные бумаги.
'''

async def test():
    print('1. Getting RAG store...')
    rag = get_rag_store()
    
    print('2. Uploading document...')
    doc = await rag.upload_and_process_document(
        user_email='dev@example.com',
        file_content=TEST_DOC.encode('utf-8'),
        filename='test_law_v3.md',
        content_type='text/markdown'
    )
    print(f"Document ID: {doc.get('id')}")
    print(f"Status: {doc.get('status')}")
    print(f"Chunks: {doc.get('total_chunks')}")
    
    if doc.get('status') == 'ready':
        print('\n3. Testing search...')
        results = rag.search('свобода договора', 'dev@example.com', limit=3)
        print(f'Found {len(results)} results')
        for r in results:
            score = r.get('similarity', 0)
            content = r.get('content', '')[:80]
            print(f"  - Score: {score:.3f}")
            print(f"    Content: {content}...")
    else:
        print(f"\nDocument processing failed: {doc.get('error_message')}")

if __name__ == "__main__":
    asyncio.run(test())
