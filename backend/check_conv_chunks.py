"""Check conversation_chunks table"""
from supabase import create_client
import os
from dotenv import load_dotenv
load_dotenv()

url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_KEY')
client = create_client(url, key)

# Check conversation_chunks table
print("=== Checking conversation_chunks table ===")
try:
    result = client.table('conversation_chunks').select('id, conversation_id, chunk_type, role, content').limit(5).execute()
    if result.data:
        print(f"Found {len(result.data)} chunks:")
        for r in result.data:
            chunk_type = r.get("chunk_type", "?")
            role = r.get("role", "?")
            content = r.get("content", "")[:100]
            print(f"  Type: {chunk_type}, Role: {role}")
            print(f"  Content: {content}...")
            print()
    else:
        print("Table is EMPTY - messages are NOT being indexed!")
        print("This means conversation RAG is not working.")
except Exception as e:
    print(f"Table error: {e}")
    print("Table 'conversation_chunks' might not exist. Need to create migration.")
