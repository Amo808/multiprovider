"""Check messages in Supabase"""
from supabase import create_client
import os
from dotenv import load_dotenv

load_dotenv()

url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_KEY')
client = create_client(url, key)

# Get recent messages
result = client.table('messages').select('id, content, role, conversation_id').order('created_at', desc=True).limit(5).execute()

print("=== Messages in Supabase ===")
for msg in result.data:
    content = msg.get('content', '') or ''
    msg_id = msg.get('id', '')[:8]
    role = msg.get('role', '')
    conv_id = msg.get('conversation_id', '')[:8] if msg.get('conversation_id') else 'N/A'
    
    print(f"ID: {msg_id}... | Conv: {conv_id}... | Role: {role} | Length: {len(content)} chars")
    
    # Check if content is truncated
    if len(content) > 200:
        print(f"  First 100: {content[:100]}...")
        print(f"  Last 100:  ...{content[-100:]}")
    else:
        print(f"  Content: {content}")
    print("---")
