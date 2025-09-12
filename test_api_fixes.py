#!/usr/bin/env python3
"""
Test script for API fixes
"""

import requests
import json

def test_anthropic_temperature_fix():
    """Test Claude Opus 4.1 with temperature only (no top_p)"""
    print("🧪 Testing Anthropic temperature/top_p fix...")
    
    url = "http://localhost:8000/chat/send"
    payload = {
        "message": "Hello, how are you?",
        "conversation_id": "test_anthropic_fix",
        "provider": "anthropic",
        "model": "claude-opus-4-1-20250805",
        "stream": False,
        "generation": {
            "temperature": 0.7,
            "max_tokens": 100,
            "top_p": None  # Should not be sent
        }
    }
    
    try:
        response = requests.post(url, json=payload, timeout=30)
        if response.status_code == 200:
            print("✅ Anthropic temperature fix working!")
            data = response.json()
            return True
        else:
            print(f"❌ Anthropic fix failed: {response.status_code}")
            print(f"Error: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Anthropic test error: {e}")
        return False

def test_openai_responses_endpoint():
    """Test o1-pro and o3-deep-research with /responses endpoint"""
    print("🧪 Testing OpenAI /responses endpoint...")
    
    models_to_test = ["o1-pro", "o3-deep-research"]
    results = []
    
    for model in models_to_test:
        print(f"Testing {model}...")
        
        url = "http://localhost:8000/chat/send"
        payload = {
            "message": "What is 2+2?",
            "conversation_id": f"test_openai_{model}",
            "provider": "openai", 
            "model": model,
            "stream": False,
            "generation": {
                "temperature": 0.7,
                "max_tokens": 50
            }
        }
        
        try:
            response = requests.post(url, json=payload, timeout=60)
            if response.status_code == 200:
                print(f"✅ {model} working with /responses endpoint!")
                results.append(True)
            else:
                print(f"❌ {model} failed: {response.status_code}")
                print(f"Error: {response.text}")
                results.append(False)
        except Exception as e:
            print(f"❌ {model} test error: {e}")
            results.append(False)
    
    return all(results)

def test_regular_openai_models():
    """Test regular OpenAI models still work with /chat/completions"""
    print("🧪 Testing regular OpenAI models...")
    
    url = "http://localhost:8000/chat/send"
    payload = {
        "message": "Hello!",
        "conversation_id": "test_openai_regular",
        "provider": "openai",
        "model": "gpt-4o-mini",
        "stream": False,
        "generation": {
            "temperature": 0.7,
            "max_tokens": 50
        }
    }
    
    try:
        response = requests.post(url, json=payload, timeout=30)
        if response.status_code == 200:
            print("✅ Regular OpenAI models still working!")
            return True
        else:
            print(f"❌ Regular OpenAI model failed: {response.status_code}")
            print(f"Error: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Regular OpenAI test error: {e}")
        return False

def main():
    print("🔧 Testing API Fixes")
    print("=" * 50)
    
    results = []
    
    # Test Anthropic fix
    results.append(test_anthropic_temperature_fix())
    print()
    
    # Test OpenAI /responses endpoint
    results.append(test_openai_responses_endpoint())
    print()
    
    # Test regular OpenAI models
    results.append(test_regular_openai_models())
    print()
    
    # Summary
    print("📊 Test Results:")
    print("=" * 50)
    if all(results):
        print("🎉 All fixes working correctly!")
    else:
        print("⚠️  Some fixes need attention:")
        print(f"   Anthropic fix: {'✅' if results[0] else '❌'}")
        print(f"   OpenAI /responses: {'✅' if results[1] else '❌'}")
        print(f"   Regular OpenAI: {'✅' if results[2] else '❌'}")

if __name__ == "__main__":
    main()
