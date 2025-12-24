#!/usr/bin/env python
"""Test Supabase connection and table access"""
import os
import sys

# Ensure we're in the backend directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from supabase_client.client import get_supabase_service_client, is_supabase_configured

print("=" * 60)
print("SUPABASE CONNECTION TEST")
print("=" * 60)

if not is_supabase_configured():
    print("ERROR: Supabase is not configured!")
    sys.exit(1)

print("✓ Supabase is configured")

try:
    client = get_supabase_service_client()
    print("✓ Supabase service client created")
except Exception as e:
    print(f"ERROR creating client: {e}")
    sys.exit(1)

# Test users table
print("\n--- Testing USERS table ---")
try:
    result = client.table('users').select('*').limit(5).execute()
    print(f"✓ Users table accessible: {len(result.data)} users found")
    for u in result.data:
        email = u.get('email', 'no email')
        print(f"  - {email}")
except Exception as e:
    print(f"ERROR accessing users: {e}")

# Test conversations table
print("\n--- Testing CONVERSATIONS table ---")
try:
    result = client.table('conversations').select('*').limit(5).execute()
    print(f"✓ Conversations table accessible: {len(result.data)} conversations found")
    for c in result.data:
        print(f"  - {c.get('id', 'no id')[:8]}... : {c.get('title', 'no title')}")
except Exception as e:
    print(f"ERROR accessing conversations: {e}")

# Test messages table
print("\n--- Testing MESSAGES table ---")
try:
    result = client.table('messages').select('*').limit(5).execute()
    print(f"✓ Messages table accessible: {len(result.data)} messages found")
except Exception as e:
    print(f"ERROR accessing messages: {e}")

# Test documents table
print("\n--- Testing DOCUMENTS table ---")
try:
    result = client.table('documents').select('*').limit(5).execute()
    print(f"✓ Documents table accessible: {len(result.data)} documents found")
except Exception as e:
    print(f"ERROR accessing documents: {e}")

# Test document_chunks table
print("\n--- Testing DOCUMENT_CHUNKS table ---")
try:
    result = client.table('document_chunks').select('*').limit(5).execute()
    print(f"✓ Document_chunks table accessible: {len(result.data)} chunks found")
except Exception as e:
    print(f"ERROR accessing document_chunks: {e}")

print("\n" + "=" * 60)
print("TEST COMPLETE")
print("=" * 60)
