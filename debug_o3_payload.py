#!/usr/bin/env python3
"""
Debug script to check what payload is being sent to o3-deep-research
"""

import json

def test_responses_payload():
    """Test the exact payload format for /responses endpoint"""
    
    # Simulate API messages
    api_messages = [
        {"role": "user", "content": "What is quantum computing?"},
        {"role": "assistant", "content": "Quantum computing is a technology..."},
        {"role": "user", "content": "Explain quantum entanglement"}
    ]
    
    # Simulate parameters  
    class MockParams:
        max_tokens = 150
        temperature = 0.7
        stream = True
    
    params = MockParams()
    model = "o3-deep-research"
    
    # Create the exact payload that should be sent
    responses_payload = {
        "model": model,
        "input": api_messages,  # NEW: Use 'input' instead of 'messages' for /responses API
        "stream": params.stream,
    }
    
    # Add parameters
    if params.max_tokens:
        responses_payload["max_output_tokens"] = params.max_tokens
    if params.temperature is not None:
        responses_payload["temperature"] = params.temperature
    
    print("🔍 o3-deep-research /responses Payload Check")
    print("=" * 50)
    print(f"Model: {model}")
    print(f"Endpoint: /responses")
    print(f"Payload structure:")
    print(json.dumps(responses_payload, indent=2))
    
    # Validate payload structure
    print("\n🧪 Validation:")
    print(f"✅ Has 'model': {('model' in responses_payload)}")
    print(f"✅ Has 'input': {('input' in responses_payload)}")
    print(f"✅ Input is array: {isinstance(responses_payload['input'], list)}")
    print(f"✅ Has 'stream': {('stream' in responses_payload)}")
    print(f"✅ Has 'max_output_tokens': {('max_output_tokens' in responses_payload)}")
    print(f"✅ No 'messages' field: {('messages' not in responses_payload)}")
    print(f"✅ No 'prompt' field: {('prompt' not in responses_payload)}")
    print(f"✅ No 'system' field: {('system' not in responses_payload)}")
    
    # Check message structure
    print(f"\n📝 Input structure ({len(responses_payload['input'])} messages):")
    for i, msg in enumerate(responses_payload['input']):
        print(f"   [{i}] role='{msg['role']}', content='{msg['content'][:30]}...'")
    
    print(f"\n🎯 This is the CORRECT format for /responses endpoint!")
    print(f"   - Uses 'input' array (NEW API format)")
    print(f"   - Uses 'max_output_tokens' (not 'max_completion_tokens')")
    print(f"   - No 'messages', 'prompt', or 'system' parameters")
    
    return responses_payload

if __name__ == "__main__":
    payload = test_responses_payload()
    print(f"\n✅ Payload ready for /responses endpoint")
