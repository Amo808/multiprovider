#!/usr/bin/env python3
"""
Test script for ChatGPT Pro provider debugging
"""
import asyncio
import logging
import json
import os
import sys
from pathlib import Path

# Add the project root to sys.path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from adapters.chatgpt_pro_provider import ChatGPTProAdapter
from adapters.base_provider import ProviderConfig, Message, GenerationParams, ModelProvider

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_chatgpt_pro():
    """Test ChatGPT Pro provider functionality"""
    print("🧪 Testing ChatGPT Pro Provider...")
    
    # Configuration (without real API key for safety)
    config = ProviderConfig(
        provider_id=ModelProvider.CHATGPT_PRO,
        api_key="test-key",  # Using test key
        base_url="https://api.openai.com/v1",
        enabled=True
    )
    
    # Initialize adapter
    try:
        adapter = ChatGPTProAdapter(config)
        print(f"✅ Adapter initialized: {adapter.name}")
        
        # Check supported models
        models = adapter.supported_models
        print(f"📋 Available models: {len(models)}")
        for model in models:
            print(f"  - {model.id} ({model.display_name})")
        
        # Test validation (should fail with test key)
        print("\n🔍 Testing connection validation...")
        try:
            is_valid, message = await adapter.validate_connection()
            print(f"Validation result: {is_valid}, Message: {message}")
        except Exception as e:
            print(f"⚠️ Validation error (expected): {e}")
        
        # Test timeout behavior
        print("\n⏱️ Testing timeout behavior...")
        messages = [Message(role="user", content="Hello, test message")]
        params = GenerationParams(max_tokens=50, temperature=0.7, stream=True)
        
        try:
            # This should timeout/fail quickly with invalid API key
            async for response in adapter.chat_completion(messages, model="gpt-5", params=params):
                print(f"Response: {response}")
                break  # Just test first response
        except Exception as e:
            print(f"⚠️ Chat completion error (expected): {e}")
            
        print("\n✅ Test completed")
        
    except Exception as e:
        print(f"❌ Error initializing adapter: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # Cleanup
        if hasattr(adapter, 'session') and adapter.session:
            await adapter.session.close()

if __name__ == "__main__":
    asyncio.run(test_chatgpt_pro())
