"""
Terminal test for RLM Deep Analysis — step by step.
Run from backend/ dir:
  .\.venv\Scripts\python.exe test_rlm_terminal.py
"""
import asyncio
import os
import sys
import time

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Load .env
from dotenv import load_dotenv
load_dotenv()


def test_step(name):
    print(f"\n{'='*60}")
    print(f"  STEP: {name}")
    print(f"{'='*60}")


# ── Step 1: Check RLM import ──
test_step("1. Import RLM library")
try:
    from rlm import RLM
    print("  ✓ from rlm import RLM — OK")
except ImportError as e:
    print(f"  ✗ RLM import failed: {e}")
    print("  Fix: pip install rlms")
    sys.exit(1)


# ── Step 2: Check DeepSeek API key ──
test_step("2. Check DeepSeek API key")
api_key = os.getenv("DEEPSEEK_API_KEY", "")
if not api_key or api_key.startswith("your_"):
    print(f"  ✗ DEEPSEEK_API_KEY not set or placeholder")
    sys.exit(1)
print(f"  ✓ DEEPSEEK_API_KEY = {api_key[:8]}...{api_key[-4:]}")


# ── Step 3: Check Supabase / RAGStore ──
test_step("3. Check RAGStore connection")
try:
    from supabase_client.rag import get_rag_store
    rag = get_rag_store()
    print(f"  ✓ RAGStore connected: {type(rag).__name__}")
except Exception as e:
    print(f"  ✗ RAGStore error: {e}")
    print("  → Will still test RLM with synthetic data")
    rag = None


# ── Step 4: Load document chunks (if RAGStore works) ──
test_step("4. Load documents from Supabase")
doc_context = None
if rag:
    try:
        # Dev mode uses dev@test.com
        user_email = "dev@test.com"
        docs = rag.list_documents(user_email, status="ready", limit=5)
        print(f"  Found {len(docs)} ready documents for {user_email}")
        
        if docs:
            doc = docs[0]
            doc_id = doc["id"]
            doc_name = doc.get("name", doc.get("filename", "unnamed"))
            print(f"  Using: '{doc_name}' (id={doc_id[:8]}...)")
            
            chunks = rag.get_all_document_chunks(user_email, document_ids=[doc_id])
            print(f"  Loaded {len(chunks)} chunks")
            
            if chunks:
                raw_text = "\n".join(c.get("content", "") for c in chunks)
                print(f"  Raw text: {len(raw_text):,} chars")
                
                # Clean text
                from rlm_service import clean_text_for_rlm
                doc_context = clean_text_for_rlm(raw_text)
                print(f"  Cleaned text: {len(doc_context):,} chars")
                
                # Check for problematic chars
                for i, ch in enumerate(doc_context):
                    if ord(ch) > 127 and ord(ch) not in range(0x0400, 0x0500):
                        # Not ASCII and not Cyrillic — log first few
                        if i < 500000:
                            continue  # Skip — there will be many legit unicode chars
                
                # Truncate if huge (for terminal test, use first 50K chars)
                if len(doc_context) > 50000:
                    doc_context = doc_context[:50000]
                    print(f"  Truncated to 50,000 chars for terminal test")
        else:
            print("  No ready documents found")
    except Exception as e:
        print(f"  ✗ Error loading docs: {e}")
        import traceback
        traceback.print_exc()

# Fallback: use synthetic context
if not doc_context:
    print("  → Using synthetic test context")
    doc_context = """
    Chapter 1: Introduction to Machine Learning
    Machine learning is a subset of artificial intelligence that focuses on building systems 
    that learn from data. The three main types are supervised, unsupervised, and reinforcement learning.
    
    Chapter 2: Neural Networks
    Neural networks are computing systems inspired by biological neural networks. 
    They consist of layers of interconnected nodes that process information.
    
    Chapter 3: Deep Learning
    Deep learning uses neural networks with many layers (deep networks) to learn 
    complex patterns in large amounts of data. Key architectures include CNNs and RNNs.
    """
    print(f"  Context length: {len(doc_context)} chars")


# ── Step 5: Test RLM completion (small test first) ──
test_step("5. Test RLM with small context")
try:
    small_context = "Python is a programming language created by Guido van Rossum in 1991. It emphasizes code readability."
    
    engine = RLM(
        backend="openai",
        backend_kwargs={
            "model_name": "deepseek-chat",
            "api_key": api_key,
            "base_url": "https://api.deepseek.com",
        },
        environment="local",
        max_iterations=3,
        max_depth=1,
        verbose=False,
    )
    
    print("  RLM engine created. Running small test...")
    start = time.time()
    result = engine.completion(
        prompt=small_context,
        root_prompt="What year was Python created?",
    )
    elapsed = time.time() - start
    
    print(f"  ✓ Response: {result.response[:200]}")
    print(f"  ✓ Time: {elapsed:.1f}s")
    
    if hasattr(engine, 'close'):
        engine.close()

except Exception as e:
    print(f"  ✗ RLM small test failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)


# ── Step 6: Test RLM with actual document context ──
test_step("6. Test RLM with document context")
try:
    engine = RLM(
        backend="openai",
        backend_kwargs={
            "model_name": "deepseek-chat",
            "api_key": api_key,
            "base_url": "https://api.deepseek.com",
        },
        environment="local",
        max_iterations=10,
        max_depth=2,
        verbose=False,
    )
    
    prompt = "Summarize the main topics covered in this document in 3-5 bullet points."
    print(f"  Context: {len(doc_context):,} chars")
    print(f"  Prompt: {prompt}")
    print(f"  Running RLM analysis...")
    
    start = time.time()
    result = engine.completion(
        prompt=doc_context,
        root_prompt=prompt,
    )
    elapsed = time.time() - start
    
    print(f"\n  ✓ RESULT ({elapsed:.1f}s):")
    print(f"  {'-'*50}")
    # Print response, handling long text
    response = result.response if result.response else "(empty)"
    for line in response.split('\n'):
        print(f"  {line}")
    print(f"  {'-'*50}")
    
    if hasattr(result, 'execution_time'):
        print(f"  RLM execution_time: {result.execution_time:.1f}s")
    if hasattr(result, 'usage_summary') and result.usage_summary:
        print(f"  Usage: {result.usage_summary}")
    
    if hasattr(engine, 'close'):
        engine.close()

except Exception as e:
    print(f"  ✗ RLM document test failed: {e}")
    import traceback
    traceback.print_exc()


# ── Step 7: Test the full RLMService flow ──
test_step("7. Test RLMService (full async flow)")
try:
    from rlm_service import RLMService, RLMStatus
    
    # Create a minimal mock provider manager
    class MockProviderManager:
        class registry(dict):
            pass
        registry = {}
    
    service = RLMService(MockProviderManager())
    print(f"  is_available: {service.is_available}")
    
    async def run_service_test():
        events = []
        async for event in service.deep_analysis(
            context=doc_context[:10000],  # Limit for speed
            prompt="What are the key points in this text?",
            provider_id="deepseek",
            model_id="deepseek-chat",
            max_iterations=5,
        ):
            events.append(event)
            status_icon = {
                RLMStatus.INITIALIZING: "🔄",
                RLMStatus.RUNNING: "⚡",
                RLMStatus.COMPLETED: "✅",
                RLMStatus.ERROR: "❌",
            }.get(event.status, "•")
            print(f"  {status_icon} [{event.status.value}] {event.message[:100]}")
            if event.answer:
                print(f"  Answer preview: {event.answer[:200]}...")
        return events
    
    events = asyncio.run(run_service_test())
    
    final = events[-1] if events else None
    if final and final.status == RLMStatus.COMPLETED:
        print(f"\n  ✓ Full service test PASSED")
    elif final and final.status == RLMStatus.ERROR:
        print(f"\n  ✗ Full service test FAILED: {final.message}")
    
except Exception as e:
    print(f"  ✗ Service test error: {e}")
    import traceback
    traceback.print_exc()


print(f"\n{'='*60}")
print(f"  ALL TESTS COMPLETE")
print(f"{'='*60}")
