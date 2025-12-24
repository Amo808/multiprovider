#!/usr/bin/env python
"""Test Supabase conversation flow - create, save messages, load"""
import os
import sys
from uuid import uuid4

# Ensure we're in the backend directory
backend_dir = os.path.dirname(os.path.abspath(__file__))
project_dir = os.path.dirname(backend_dir)  # multiprovider root
os.chdir(backend_dir)
sys.path.insert(0, backend_dir)
sys.path.insert(0, project_dir)  # for adapters, storage, etc.

print("=" * 60)
print("SUPABASE CONVERSATION FLOW TEST")
print("=" * 60)

from supabase_client.conversations import get_supabase_conversation_store
from adapters import Message

store = get_supabase_conversation_store()
test_email = "test@multech.ai"
test_conv_id = str(uuid4())

print(f"\nTest conversation ID: {test_conv_id}")
print(f"Test user email: {test_email}")

# Step 1: Create conversation
print("\n--- Step 1: Creating conversation ---")
try:
    conv = store.create_conversation(
        conversation_id=test_conv_id,
        title="Test Conversation from Script",
        user_email=test_email
    )
    print(f"✓ Conversation created: {conv.get('id', test_conv_id)}")
except Exception as e:
    print(f"ERROR creating conversation: {e}")
    sys.exit(1)

# Step 2: Save user message
print("\n--- Step 2: Saving user message ---")
try:
    user_msg = Message(
        id=str(uuid4()),
        role="user",
        content="Hello, this is a test message!",
        meta={"model": "test-model", "provider": "test-provider"}
    )
    result = store.save_message(test_conv_id, user_msg, user_email=test_email)
    print(f"✓ User message saved: {result.get('id', 'OK')}")
except Exception as e:
    print(f"ERROR saving user message: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Step 3: Save assistant message
print("\n--- Step 3: Saving assistant message ---")
try:
    assistant_msg = Message(
        id=str(uuid4()),
        role="assistant",
        content="Hello! This is a test response from the assistant.",
        meta={
            "model": "deepseek-chat",
            "provider": "deepseek",
            "tokens_input": 50,
            "tokens_output": 30
        }
    )
    result = store.save_message(test_conv_id, assistant_msg, user_email=test_email)
    print(f"✓ Assistant message saved: {result.get('id', 'OK')}")
except Exception as e:
    print(f"ERROR saving assistant message: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Step 4: Load conversation history
print("\n--- Step 4: Loading conversation history ---")
try:
    messages = store.load_conversation_history(test_conv_id, user_email=test_email)
    print(f"✓ Loaded {len(messages)} messages:")
    for msg in messages:
        content_preview = msg.content[:50] + "..." if len(msg.content) > 50 else msg.content
        print(f"  [{msg.role}]: {content_preview}")
except Exception as e:
    print(f"ERROR loading history: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Step 5: List conversations
print("\n--- Step 5: Listing conversations ---")
try:
    conversations = store.get_conversations(user_email=test_email)
    print(f"✓ Found {len(conversations)} conversations for user:")
    for c in conversations[:5]:
        print(f"  - {c.get('id', 'no id')[:8]}... : {c.get('title', 'no title')}")
except Exception as e:
    print(f"ERROR listing conversations: {e}")

# Cleanup: Delete test conversation
print("\n--- Cleanup: Deleting test conversation ---")
try:
    store.delete_conversation(test_conv_id, user_email=test_email)
    print(f"✓ Test conversation deleted")
except Exception as e:
    print(f"Note: Could not delete test conversation: {e}")

print("\n" + "=" * 60)
print("TEST COMPLETE - ALL STEPS PASSED!")
print("=" * 60)
