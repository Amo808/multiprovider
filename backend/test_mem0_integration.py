"""
Test Mem0 Integration with Supabase PGVector
"""
import os
import sys

# Add project paths
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment
from dotenv import load_dotenv
load_dotenv()

print("=" * 60)
print("Mem0 + Supabase Integration Test")
print("=" * 60)

# Check environment variables
print("\n📋 Environment Configuration:")
print(f"  MEM0_ENABLED: {os.getenv('MEM0_ENABLED', 'not set')}")
print(f"  MEM0_DATABASE_URL: {'✅ SET' if os.getenv('MEM0_DATABASE_URL') else '❌ NOT SET'}")
print(f"  OPENAI_API_KEY: {'✅ SET' if os.getenv('OPENAI_API_KEY') else '❌ NOT SET'}")

# Test database connection first
print("\n🔌 Testing Database Connection...")
try:
    import psycopg2
    conn = psycopg2.connect(os.getenv('MEM0_DATABASE_URL'))
    cur = conn.cursor()
    cur.execute("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')")
    print(f"  pgvector extension: {'✅ YES' if cur.fetchone()[0] else '❌ NO'}")
    cur.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mem0'")
    print(f"  mem0 table: {'✅ YES' if cur.fetchone()[0] > 0 else '❌ NO'}")
    conn.close()
except Exception as e:
    print(f"  ❌ Database connection failed: {e}")

# Test Mem0 initialization
print("\n🧠 Testing Mem0 Initialization...")
try:
    from storage.mem0_store import Mem0MemoryStore, MEM0_AVAILABLE
    print(f"  mem0 package: {'✅ Available' if MEM0_AVAILABLE else '❌ Not installed'}")
    
    store = Mem0MemoryStore()
    print(f"  Mem0 enabled: {'✅ YES' if store.enabled else '❌ NO'}")
    print(f"  Backend: {store.backend}")
    
    if store.enabled:
        print("\n🎯 Testing Memory Operations...")
        
        import asyncio
        
        async def test_operations():
            test_user_id = "test_user_integration"
            
            # Test adding memory
            print("\n  Adding test memory...")
            result = await store.add_memory(
                user_id=test_user_id,
                messages=[
                    {"role": "user", "content": "My name is Alice and I work as a software engineer at Google."},
                    {"role": "assistant", "content": "Nice to meet you Alice! How exciting to work at Google as a software engineer."}
                ],
                metadata={"test": True, "source": "integration_test"}
            )
            print(f"    Result: {result}")
            
            # Test searching memories
            print("\n  Searching memories...")
            results = await store.search_memories(
                user_id=test_user_id,
                query="What does Alice do for work?",
                limit=5
            )
            print(f"    Found {len(results)} memories")
            for r in results:
                print(f"      - {r}")
            
            # Test getting all memories
            print("\n  Getting all memories...")
            all_mems = await store.get_all_memories(user_id=test_user_id)
            print(f"    Total memories: {len(all_mems) if all_mems else 0}")
            
            # Test context retrieval
            print("\n  Getting relevant context...")
            context = await store.get_relevant_context(
                user_id=test_user_id,
                current_message="Tell me about my job"
            )
            print(f"    Context: {context[:200] if context else 'None'}...")
            
            print("\n✅ All memory operations completed!")
            return True
        
        asyncio.run(test_operations())
    else:
        print("\n⚠️ Mem0 is not enabled. Check configuration.")
        
except Exception as e:
    print(f"\n❌ Error: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
print("Test Complete!")
print("=" * 60)
