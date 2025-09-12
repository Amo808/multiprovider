#!/usr/bin/env python3
"""
Test script to fetch Anthropic models and check pricing
"""
import asyncio
import aiohttp
import json
import os
from datetime import datetime

async def test_anthropic_models():
    """Test Anthropic API to get current models"""
    
    # You'll need to set your Anthropic API key
    api_key = os.getenv('ANTHROPIC_API_KEY')
    if not api_key:
        print("❌ ANTHROPIC_API_KEY environment variable not set")
        print("Please set it with: export ANTHROPIC_API_KEY=your_key_here")
        return
    
    base_url = "https://api.anthropic.com"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
    }
    
    async with aiohttp.ClientSession() as session:
        try:
            print("🔍 Fetching Anthropic models...")
            
            # Get models list
            async with session.get(f"{base_url}/v1/models", headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ Successfully fetched models (Status: {response.status})")
                    print(f"📊 Response data:")
                    print(json.dumps(data, indent=2))
                    
                    if 'data' in data:
                        print(f"\n📋 Found {len(data['data'])} models:")
                        for model in data['data']:
                            print(f"  • {model.get('display_name', 'N/A')} (ID: {model.get('id', 'N/A')})")
                            if 'created_at' in model:
                                print(f"    Created: {model['created_at']}")
                            print()
                else:
                    error_text = await response.text()
                    print(f"❌ Failed to fetch models (Status: {response.status})")
                    print(f"Error: {error_text}")
                    
        except Exception as e:
            print(f"❌ Exception occurred: {e}")

async def test_count_tokens():
    """Test token counting for different messages"""
    api_key = os.getenv('ANTHROPIC_API_KEY')
    if not api_key:
        print("❌ ANTHROPIC_API_KEY environment variable not set")
        return
    
    base_url = "https://api.anthropic.com"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
    }
    
    test_messages = [
        "Hello, how are you?",
        "Explain quantum computing in simple terms.",
        "Write a Python function to calculate fibonacci numbers." * 10,  # Longer text
    ]
    
    async with aiohttp.ClientSession() as session:
        for i, message in enumerate(test_messages, 1):
            try:
                print(f"\n🧮 Testing token count for message {i}...")
                print(f"Message: {message[:100]}{'...' if len(message) > 100 else ''}")
                
                payload = {
                    "model": "claude-3-5-sonnet-20241022",  # Use existing model
                    "messages": [
                        {
                            "role": "user",
                            "content": message
                        }
                    ]
                }
                
                async with session.post(f"{base_url}/v1/messages/count_tokens", 
                                      headers=headers, 
                                      json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        print(f"✅ Token count: {data.get('input_tokens', 'N/A')} tokens")
                        
                        # Calculate estimated cost (using Claude 3.5 Sonnet pricing)
                        input_tokens = data.get('input_tokens', 0)
                        cost_per_1m = 3.00  # $3.00 per 1M input tokens for Claude 3.5 Sonnet
                        estimated_cost = (input_tokens / 1_000_000) * cost_per_1m
                        print(f"💰 Estimated cost: ${estimated_cost:.6f} USD")
                        
                    else:
                        error_text = await response.text()
                        print(f"❌ Failed to count tokens (Status: {response.status})")
                        print(f"Error: {error_text}")
                        
            except Exception as e:
                print(f"❌ Exception occurred: {e}")

async def main():
    print("🚀 Anthropic API Testing Script")
    print("=" * 50)
    
    print("\n1️⃣ Testing Models API...")
    await test_anthropic_models()
    
    print("\n2️⃣ Testing Token Counting...")
    await test_count_tokens()
    
    print("\n✅ Testing completed!")

if __name__ == "__main__":
    asyncio.run(main())
