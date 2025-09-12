#!/usr/bin/env python3
"""
Test script to verify Anthropic temperature/top_p fix
"""

import requests
import json

def test_anthropic_models():
    """Test different Anthropic models with the temperature/top_p fix"""
    
    # Test data
    test_message = {
        "messages": [
            {
                "role": "user", 
                "content": "Hello! How are you today? (Short response please)"
            }
        ],
        "provider": "anthropic",
        "model": "claude-opus-4-1-20250805",  # Claude Opus 4.1 - should use only temperature
        "generation": {
            "temperature": 0.7,
            "top_p": 0.9,  # This should be ignored for Claude 4 models
            "max_tokens": 100,
            "stream": False
        }
    }
    
    print("🧪 Testing Anthropic Claude Opus 4.1 with temperature/top_p fix...")
    print(f"Model: {test_message['model']}")
    print(f"Temperature: {test_message['generation']['temperature']}")
    print(f"Top_p: {test_message['generation']['top_p']}")
    print("Expected: Only temperature should be sent to API, top_p should be ignored")
    print()
    
    try:
        response = requests.post(
            "http://localhost:8000/chat/send",
            json=test_message,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ SUCCESS! API call completed without temperature/top_p error")
            print(f"Response: {result.get('content', 'No content')[:100]}...")
            
            # Check for cost calculation
            meta = result.get('meta', {})
            if 'estimated_cost' in meta:
                print(f"💰 Cost calculation: ${meta['estimated_cost']:.6f}")
            
            print()
            return True
        else:
            print(f"❌ FAILED! HTTP {response.status_code}")
            print(f"Error: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ EXCEPTION: {e}")
        return False

def test_claude_3_model():
    """Test older Claude 3 model that should accept both temperature and top_p"""
    
    test_message = {
        "messages": [
            {
                "role": "user", 
                "content": "Hello! (Very short response)"
            }
        ],
        "provider": "anthropic",
        "model": "claude-3-opus-20240229",  # Claude 3 - should accept both params
        "generation": {
            "temperature": 0.7,
            "top_p": 0.9,  # This should be included for Claude 3 models
            "max_tokens": 50,
            "stream": False
        }
    }
    
    print("🧪 Testing Anthropic Claude 3 Opus with both temperature and top_p...")
    print(f"Model: {test_message['model']}")
    print("Expected: Both temperature and top_p should be sent to API")
    print()
    
    try:
        response = requests.post(
            "http://localhost:8000/chat/send",
            json=test_message,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ SUCCESS! Claude 3 model works with both parameters")
            print(f"Response: {result.get('content', 'No content')[:100]}...")
            return True
        else:
            print(f"❌ FAILED! HTTP {response.status_code}")
            print(f"Error: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ EXCEPTION: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("🔧 ANTHROPIC TEMPERATURE/TOP_P FIX TEST")
    print("=" * 60)
    print()
    
    # Test Claude 4 series (should use only temperature)
    claude_4_success = test_anthropic_models()
    
    print("-" * 60)
    
    # Test Claude 3 series (should use both parameters)
    claude_3_success = test_claude_3_model()
    
    print("=" * 60)
    print("📊 FINAL RESULTS:")
    print(f"Claude 4 Opus (temperature only): {'✅ PASS' if claude_4_success else '❌ FAIL'}")
    print(f"Claude 3 Opus (both params): {'✅ PASS' if claude_3_success else '❌ FAIL'}")
    
    if claude_4_success and claude_3_success:
        print("\n🎉 ALL TESTS PASSED! Temperature/top_p fix is working correctly!")
    else:
        print("\n⚠️  Some tests failed. Check the logs above for details.")
