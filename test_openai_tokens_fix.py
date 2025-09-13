#!/usr/bin/env python3
"""
Test script for OpenAI provider token counting fix
Tests that:
1. GPT-5 shows token usage in final response
2. o3-deep-research and o1-pro work with max_output_tokens parameter
3. All models return proper usage information
"""

import asyncio
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from adapters.openai_provider import OpenAIProvider
from storage.prompt_builder import PromptBuilder
from storage.session_manager import SessionManager

async def test_openai_tokens():
    """Test token counting for various OpenAI models"""
    
    # Initialize provider
    provider = OpenAIProvider()
    
    # Test models
    models_to_test = [
        "gpt-5",
        "gpt-4o-mini", 
        "o3-deep-research",
        "o1-pro"
    ]
    
    test_prompt = "Explain quantum computing in simple terms"
    
    for model in models_to_test:
        print(f"\n{'='*60}")
        print(f"🧪 Testing model: {model}")
        print(f"{'='*60}")
        
        try:
            # Create mock messages
            messages = [
                type('Message', (), {'role': 'user', 'content': test_prompt})()
            ]
            
            # Create chat parameters
            params = type('ChatParams', (), {
                'max_tokens': 150,
                'temperature': 0.7,
                'stream': True,
                'top_p': None,
                'frequency_penalty': None,
                'presence_penalty': None,
                'stop_sequences': None
            })()
            
            # Track responses
            responses = []
            final_response = None
            
            print(f"📤 Sending request to {model}...")
            
            async for response in provider.chat(messages, params, model):
                responses.append(response)
                
                if response.content:
                    print(f"📝 Content chunk: {response.content[:50]}...")
                
                if response.done:
                    final_response = response
                    print(f"✅ Final response received")
                    break
                    
                # Check for special signals
                if hasattr(response, 'meta') and response.meta:
                    if response.meta.get('heartbeat'):
                        print(f"💓 Heartbeat signal")
                    elif response.meta.get('streaming_ready'):
                        print(f"🚀 Streaming ready signal")
                    elif response.meta.get('first_content'):
                        print(f"🎯 First content signal")
            
            # Analyze final response
            if final_response and final_response.meta:
                meta = final_response.meta
                print(f"\n📊 Token Usage Analysis:")
                print(f"   Input tokens: {meta.get('tokens_in', 'N/A')}")
                print(f"   Output tokens: {meta.get('tokens_out', 'N/A')}")
                print(f"   Total tokens: {meta.get('total_tokens', 'N/A')}")
                print(f"   Estimated cost: ${meta.get('estimated_cost', 'N/A')}")
                
                # Check if usage is present
                has_usage = all(key in meta for key in ['tokens_in', 'tokens_out', 'total_tokens'])
                
                if has_usage:
                    print(f"✅ Token usage information: PRESENT")
                else:
                    print(f"❌ Token usage information: MISSING")
                    print(f"   Available meta keys: {list(meta.keys())}")
            else:
                print(f"❌ No final response or meta information")
                
        except Exception as e:
            print(f"❌ Error testing {model}: {e}")
            import traceback
            traceback.print_exc()
    
    print(f"\n{'='*60}")
    print(f"🏁 Test completed")
    print(f"{'='*60}")

if __name__ == "__main__":
    print("🚀 OpenAI Provider Token Fix Test")
    print("This test validates token counting for all OpenAI models")
    print("Especially GPT-5, o3-deep-research, and o1-pro")
    
    asyncio.run(test_openai_tokens())
