#!/usr/bin/env python3
"""
Test script to verify all imports work correctly
Run this before deployment to catch import issues early
"""

import sys
from pathlib import Path
import traceback

# Add the current directory to Python path (similar to what Dockerfile does)
root_dir = Path(__file__).parent
sys.path.insert(0, str(root_dir))

def test_import(module_name, description=""):
    """Test importing a module and report results"""
    try:
        if module_name == "adapters":
            from adapters import provider_manager, ModelProvider, Message, GenerationParams, ProviderStatus
            print(f"✅ {module_name} - {description}")
            print(f"   Available providers: {list(provider_manager.providers.keys())}")
        elif module_name == "storage":
            from storage import HistoryStore, PromptBuilder
            from storage.history_new import ConversationStore
            print(f"✅ {module_name} - {description}")
        elif module_name == "backend":
            # Test if we can import the main components from backend
            import backend.main
            print(f"✅ {module_name} - {description}")
        else:
            __import__(module_name)
            print(f"✅ {module_name} - {description}")
        return True
    except Exception as e:
        print(f"❌ {module_name} - {description}")
        print(f"   Error: {e}")
        traceback.print_exc()
        return False

def main():
    print("🧪 Testing all imports for MultichatApp...")
    print("=" * 50)
    
    # Test standard library imports
    success = True
    success &= test_import("json", "JSON support")
    success &= test_import("asyncio", "Async support")
    success &= test_import("pathlib", "Path handling")
    success &= test_import("datetime", "Date/time support")
    success &= test_import("uuid", "UUID generation")
    
    print("\n📦 Testing external dependencies...")
    success &= test_import("fastapi", "FastAPI framework")
    success &= test_import("uvicorn", "ASGI server")
    success &= test_import("pydantic", "Data validation")
    success &= test_import("aiohttp", "Async HTTP client")
    success &= test_import("tiktoken", "Token counting")
    success &= test_import("dotenv", "Environment variables")
    
    print("\n🔧 Testing custom modules...")
    success &= test_import("adapters", "AI provider adapters")
    success &= test_import("storage", "Data storage")
    success &= test_import("backend", "Backend API")
    
    print("\n" + "=" * 50)
    if success:
        print("🎉 All imports successful! Ready for deployment.")
        print("✅ The application should start without import errors.")
        return 0
    else:
        print("❌ Some imports failed! Fix these issues before deployment.")
        return 1

if __name__ == "__main__":
    exit(main())
