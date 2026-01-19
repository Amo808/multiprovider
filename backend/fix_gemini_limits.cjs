const fs = require('fs');

// ===== FIX 1: Update model limits config to use correct Gemini limits =====
const limitsPath = 'data/model_limits.json';

const modelLimits = {
    "defaults": {
        "context_limit": 8192,
        "rag_context_percent": 50,
        "safety_buffer_tokens": 2000
    },
    "models": {
        // Gemini models - use conservative limits to avoid rate limiting
        "gemini-3-pro": {
            "context_limit": 100000,
            "rag_context_percent": 30,  // REDUCED from 70% to 30% to avoid TPM limit
            "max_tokens_per_request": 50000  // Don't send more than 50k at once
        },
        "gemini-2.5-pro": {
            "context_limit": 1000000,
            "rag_context_percent": 50,
            "max_tokens_per_request": 100000
        },
        "gemini-2.5-flash": {
            "context_limit": 1000000,
            "rag_context_percent": 50,
            "max_tokens_per_request": 100000
        },
        "gemini-2.0-flash": {
            "context_limit": 1000000,
            "rag_context_percent": 60,
            "max_tokens_per_request": 200000
        },
        "gemini-pro": {
            "context_limit": 32000,
            "rag_context_percent": 40,
            "max_tokens_per_request": 20000
        },

        // OpenAI models
        "gpt-4o": {
            "context_limit": 128000,
            "rag_context_percent": 60
        },
        "gpt-4o-mini": {
            "context_limit": 128000,
            "rag_context_percent": 70
        },
        "gpt-4-turbo": {
            "context_limit": 128000,
            "rag_context_percent": 60
        },
        "gpt-4": {
            "context_limit": 8192,
            "rag_context_percent": 50
        },
        "gpt-3.5-turbo": {
            "context_limit": 16384,
            "rag_context_percent": 60
        },

        // Claude models
        "claude-3-opus": {
            "context_limit": 200000,
            "rag_context_percent": 70
        },
        "claude-3-sonnet": {
            "context_limit": 200000,
            "rag_context_percent": 70
        },
        "claude-3-haiku": {
            "context_limit": 200000,
            "rag_context_percent": 70
        },
        "claude-3.5-sonnet": {
            "context_limit": 200000,
            "rag_context_percent": 70
        },
        "claude-sonnet-4": {
            "context_limit": 200000,
            "rag_context_percent": 70
        },

        // DeepSeek
        "deepseek-chat": {
            "context_limit": 64000,
            "rag_context_percent": 60
        },
        "deepseek-reasoner": {
            "context_limit": 64000,
            "rag_context_percent": 50
        }
    }
};

fs.writeFileSync(limitsPath, JSON.stringify(modelLimits, null, 4));
console.log('✅ Updated model_limits.json with conservative Gemini limits');
console.log('');
console.log('Key changes for gemini-3-pro:');
console.log('  - rag_context_percent: 70% → 30% (to avoid TPM limit)');
console.log('  - max_tokens_per_request: 50000 (safety cap)');
console.log('');
console.log('Recommendation: Use gemini-2.5-pro or gemini-2.0-flash for large documents');
console.log('They have 2-4x higher TPM limits!');
