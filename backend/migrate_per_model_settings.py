"""
Migration script to convert global generation settings to per-model settings.
This script reads the existing config.json and creates per-model settings 
for all currently available models with model-specific defaults.

Run this once after updating to the per-model settings version.
"""

import json
import os
from pathlib import Path

# Model-specific default settings based on provider documentation
MODEL_DEFAULTS = {
    # DeepSeek models
    "deepseek:deepseek-chat": {
        "temperature": 0.7,
        "max_tokens": 4096,  # Default 4K, max 8K
        "top_p": 1.0,
        "frequency_penalty": 0.0,
        "presence_penalty": 0.0,
        "stream": True,
    },
    "deepseek:deepseek-reasoner": {
        "temperature": 0.7,
        "max_tokens": 32768,  # Default 32K, max 64K (reasoning model)
        "top_p": 1.0,
        "frequency_penalty": 0.0,
        "presence_penalty": 0.0,
        "stream": True,
        "include_thoughts": True,
    },
    
    # OpenAI models
    "openai:gpt-4o": {
        "temperature": 0.7,
        "max_tokens": 4096,
        "top_p": 1.0,
        "stream": True,
    },
    "openai:gpt-4o-mini": {
        "temperature": 0.7,
        "max_tokens": 4096,
        "top_p": 1.0,
        "stream": True,
    },
    "openai:gpt-5": {
        "temperature": 0.7,
        "max_tokens": 8192,
        "top_p": 1.0,
        "stream": True,
        "verbosity": "medium",
        "reasoning_effort": "medium",
    },
    "openai:gpt-5-mini": {
        "temperature": 0.7,
        "max_tokens": 4096,
        "top_p": 1.0,
        "stream": True,
    },
    "openai:gpt-5-nano": {
        "temperature": 0.7,
        "max_tokens": 2048,
        "top_p": 1.0,
        "stream": True,
    },
    "openai:o1-preview": {
        "temperature": 1.0,  # O1 models use temperature=1
        "max_tokens": 32768,
        "top_p": 1.0,
        "stream": True,
        "reasoning_effort": "high",
    },
    "openai:o1-mini": {
        "temperature": 1.0,
        "max_tokens": 16384,
        "top_p": 1.0,
        "stream": True,
        "reasoning_effort": "medium",
    },
    "openai:o1-pro": {
        "temperature": 1.0,
        "max_tokens": 65536,
        "top_p": 1.0,
        "stream": True,
        "reasoning_effort": "high",
    },
    "openai:o3-mini": {
        "temperature": 1.0,
        "max_tokens": 32768,
        "top_p": 1.0,
        "stream": True,
        "reasoning_effort": "high",
    },
    "openai:o3-deep-research": {
        "temperature": 1.0,
        "max_tokens": 65536,
        "top_p": 1.0,
        "stream": True,
        "reasoning_effort": "high",
    },
    "openai:o4-mini": {
        "temperature": 1.0,
        "max_tokens": 32768,
        "top_p": 1.0,
        "stream": True,
        "reasoning_effort": "medium",
    },
    "openai:gpt-4-turbo": {
        "temperature": 0.7,
        "max_tokens": 4096,
        "top_p": 1.0,
        "stream": True,
    },
    "openai:gpt-3.5-turbo": {
        "temperature": 0.7,
        "max_tokens": 2048,
        "top_p": 1.0,
        "stream": True,
    },
    
    # Anthropic models
    "anthropic:claude-opus-4-1-20250805": {
        "temperature": 0.7,
        "max_tokens": 8192,
        "top_p": 1.0,
        "stream": True,
    },
    "anthropic:claude-opus-4-20250514": {
        "temperature": 0.7,
        "max_tokens": 8192,
        "top_p": 1.0,
        "stream": True,
    },
    "anthropic:claude-sonnet-4-20250514": {
        "temperature": 0.7,
        "max_tokens": 8192,
        "top_p": 1.0,
        "stream": True,
    },
    "anthropic:claude-3-7-sonnet-20250219": {
        "temperature": 0.7,
        "max_tokens": 8192,
        "top_p": 1.0,
        "stream": True,
    },
    "anthropic:claude-3-5-sonnet-20241022": {
        "temperature": 0.7,
        "max_tokens": 8192,
        "top_p": 1.0,
        "stream": True,
    },
    "anthropic:claude-3-5-haiku-20241022": {
        "temperature": 0.7,
        "max_tokens": 4096,  # Haiku is faster, smaller outputs
        "top_p": 1.0,
        "stream": True,
    },
    "anthropic:claude-3-5-sonnet-20240620": {
        "temperature": 0.7,
        "max_tokens": 8192,
        "top_p": 1.0,
        "stream": True,
    },
    "anthropic:claude-3-opus-20240229": {
        "temperature": 0.7,
        "max_tokens": 8192,
        "top_p": 1.0,
        "stream": True,
    },
    "anthropic:claude-3-haiku-20240307": {
        "temperature": 0.7,
        "max_tokens": 4096,
        "top_p": 1.0,
        "stream": True,
    },
    
    # Gemini models
    "gemini:gemini-2.5-pro": {
        "temperature": 0.7,
        "max_tokens": 8192,
        "top_p": 1.0,
        "stream": True,
        "thinking_budget": -1,  # Auto
    },
    "gemini:gemini-2.5-flash": {
        "temperature": 0.7,
        "max_tokens": 4096,
        "top_p": 1.0,
        "stream": True,
        "thinking_budget": -1,
    },
    "gemini:gemini-2.5-flash-lite": {
        "temperature": 0.7,
        "max_tokens": 2048,
        "top_p": 1.0,
        "stream": True,
    },
    "gemini:gemini-2.0-flash": {
        "temperature": 0.7,
        "max_tokens": 4096,
        "top_p": 1.0,
        "stream": True,
    },
    "gemini:gemini-1.5-pro": {
        "temperature": 0.7,
        "max_tokens": 8192,
        "top_p": 1.0,
        "stream": True,
    },
    "gemini:gemini-1.5-flash": {
        "temperature": 0.7,
        "max_tokens": 4096,
        "top_p": 1.0,
        "stream": True,
    },
}

# Default settings for unknown models
DEFAULT_SETTINGS = {
    "temperature": 0.7,
    "max_tokens": 4096,
    "top_p": 1.0,
    "frequency_penalty": 0.0,
    "presence_penalty": 0.0,
    "stream": True,
    "system_prompt": "",
}


def migrate_settings():
    """Migrate global generation settings to per-model settings with model-specific defaults."""
    
    # Find config file
    script_dir = Path(__file__).parent
    config_path = script_dir.parent / "data" / "config.json"
    
    if not config_path.exists():
        print(f"Config file not found at {config_path}")
        return False
    
    # Load current config
    with open(config_path, 'r') as f:
        config = json.load(f)
    
    # Get global system prompt
    system_config = config.get("system", {})
    global_system_prompt = system_config.get("system_prompt", "")
    
    print(f"Global system prompt: {global_system_prompt[:50]}..." if len(global_system_prompt) > 50 else f"Global system prompt: {global_system_prompt}")
    
    # Clear existing model_settings to apply fresh defaults
    config["model_settings"] = {}
    
    # Get all models from providers
    providers = config.get("providers", {})
    models_migrated = 0
    
    for provider_id, provider_data in providers.items():
        models = provider_data.get("models", [])
        for model in models:
            model_id = model.get("id")
            if not model_id:
                continue
            
            key = f"{provider_id}:{model_id}"
            
            # Get model-specific defaults or use generic defaults
            model_defaults = MODEL_DEFAULTS.get(key, DEFAULT_SETTINGS).copy()
            
            # Add system prompt
            model_defaults["system_prompt"] = global_system_prompt
            
            config["model_settings"][key] = model_defaults
            models_migrated += 1
            print(f"  {key}: max_tokens={model_defaults.get('max_tokens')}, temp={model_defaults.get('temperature')}")
    
    # Save updated config
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    
    print(f"\n✅ Migration complete! Set defaults for {models_migrated} models.")
    print(f"Per-model settings now stored in config.json under 'model_settings'")
    
    return True


if __name__ == "__main__":
    print("=" * 60)
    print("Per-Model Settings Migration Script (with model-specific defaults)")
    print("=" * 60)
    print()
    
    success = migrate_settings()
    
    if success:
        print("\n✅ Migration successful!")
    else:
        print("\n❌ Migration failed!")
