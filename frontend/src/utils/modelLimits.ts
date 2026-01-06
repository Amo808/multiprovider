/**
 * Model-specific token limits based on official API documentation
 * This is the single source of truth for max output tokens across the app
 * Last updated: January 2026
 */

import { ModelInfo, ModelProvider } from '../types';

/**
 * Get the maximum output tokens for a specific model (hardcoded limits from official docs)
 */
export const getModelMaxOutputTokens = (model: ModelInfo): number => {
  const provider = model.provider;
  const modelId = model.id?.toLowerCase() || '';
  const modelName = (model.name || model.display_name || '')?.toLowerCase() || '';
  
  // Use model's max_output_tokens if available from API
  if (model.max_output_tokens) {
    return model.max_output_tokens;
  }
  
  switch (provider) {
    case 'deepseek':
      // DeepSeek official limits:
      // deepseek-chat (Non-thinking): DEFAULT 4K, MAXIMUM 8K
      // deepseek-reasoner (Thinking): DEFAULT 32K, MAXIMUM 64K
      if (modelId.includes('reasoner') || modelName.includes('reasoner') || 
          modelName.includes('r1') || modelId.includes('r1')) {
        return 65536; // deepseek-reasoner: 64K max
      }
      return 8192; // deepseek-chat: 8K max
      
    case 'openai':
      // OpenAI model-specific limits from official docs (Jan 2026)
      
      // GPT-5 series - highest limits
      if (modelId.includes('gpt-5') || modelName.includes('gpt-5')) {
        return 131072; // GPT-5: 128K output tokens
      }
      
      // GPT-4.1 series - medium-high limits  
      if (modelId.includes('gpt-4.1') || modelName.includes('gpt-4.1')) {
        return 65536; // GPT-4.1: 64K output tokens
      }
      
      // O3/O4 reasoning series
      if (modelId.includes('o3') || modelId.includes('o4') || 
          modelName.includes('o3') || modelName.includes('o4')) {
        return 65536; // O3/O4: 64K output tokens
      }
      
      // O1 reasoning series 
      if (modelId.includes('o1') || modelName.includes('o1')) {
        return 32768; // O1: 32K output tokens
      }
      
      // GPT-4o series - IMPORTANT: Limited to 16K!
      if (modelId.includes('gpt-4o') || modelName.includes('gpt-4o')) {
        return 16384; // GPT-4o: 16K output tokens (API enforced!)
      }
      
      // GPT-4 Turbo and legacy GPT-4
      if (modelId.includes('gpt-4-turbo') || modelName.includes('gpt-4-turbo') ||
          modelId.includes('gpt-4') || modelName.includes('gpt-4')) {
        return 16384; // GPT-4/Turbo: 16K output tokens
      }
      
      // GPT-3.5 series
      if (modelId.includes('gpt-3.5') || modelName.includes('gpt-3.5')) {
        return 4096; // GPT-3.5: 4K output tokens
      }
      
      // Conservative fallback for unknown OpenAI models
      return 16384;
      
    case 'anthropic':
      // Claude models official limits from Anthropic docs:
      // Claude Opus 4.1: 32K max output tokens
      // Claude Sonnet 4.5 & Haiku 4.5: 64K max output tokens
      if (modelId.includes('opus') || modelName.includes('opus')) {
        return 32000; // Claude Opus: exactly 32K max (API enforced)
      }
      if (modelId.includes('sonnet') || modelName.includes('sonnet') ||
          modelId.includes('haiku') || modelName.includes('haiku')) {
        return 64000; // Claude Sonnet 4.5 & Haiku 4.5: 64K max
      }
      return 64000; // Default for newer Claude models
      
    case 'gemini':
      // Gemini limits
      if (modelId.includes('2.5') || modelName.includes('2.5') ||
          modelId.includes('2.0') || modelName.includes('2.0')) {
        return 65536; // Gemini 2.x: 64K
      }
      if (modelId.includes('ultra') || modelName.includes('ultra')) {
        return 32768;
      }
      return 32768; // Gemini default
      
    case 'groq':
      // Groq models (usually running Llama, Mixtral)
      if (modelId.includes('llama-3') || modelName.includes('llama-3')) {
        return 8192;
      }
      if (modelId.includes('mixtral') || modelName.includes('mixtral')) {
        return 32768;
      }
      return 8192;
      
    case 'mistral':
      if (modelId.includes('large') || modelName.includes('large')) {
        return 32768;
      }
      if (modelId.includes('medium') || modelName.includes('medium')) {
        return 16384;
      }
      return 8192;
      
    default:
      return model.context_length || 8192;
  }
};

/**
 * Get recommended default max tokens for a model (reasonable defaults for most tasks)
 */
export const getModelDefaultTokens = (model: ModelInfo): number => {
  const provider = model.provider;
  const modelId = model.id?.toLowerCase() || '';
  const modelName = (model.name || model.display_name || '')?.toLowerCase() || '';
  
  switch (provider) {
    case 'deepseek':
      // DeepSeek recommendations from docs:
      if (modelId.includes('reasoner') || modelName.includes('reasoner') ||
          modelName.includes('r1') || modelId.includes('r1')) {
        return 32768; // deepseek-reasoner: DEFAULT 32K
      }
      return 4096; // deepseek-chat: DEFAULT 4K
      
    case 'openai':
      // OpenAI recommended defaults by model series
      
      // GPT-5 series - can handle larger outputs
      if (modelId.includes('gpt-5') || modelName.includes('gpt-5')) {
        return 8192; // GPT-5: reasonable default for most tasks
      }
      
      // GPT-4.1 series
      if (modelId.includes('gpt-4.1') || modelName.includes('gpt-4.1')) {
        return 6144; // GPT-4.1: balanced default
      }
      
      // O3/O4 reasoning models - often need longer outputs
      if (modelId.includes('o3') || modelId.includes('o4') || 
          modelName.includes('o3') || modelName.includes('o4')) {
        return 8192; // Reasoning models: higher default for complex responses
      }
      
      // O1 reasoning series
      if (modelId.includes('o1') || modelName.includes('o1')) {
        return 6144; // O1: medium default for reasoning
      }
      
      // GPT-4o series - conservative due to 16K limit
      if (modelId.includes('gpt-4o') || modelName.includes('gpt-4o')) {
        return 4096; // GPT-4o: conservative default (limit is 16K)
      }
      
      // GPT-4 and GPT-4 Turbo
      if (modelId.includes('gpt-4') || modelName.includes('gpt-4')) {
        return 4096; // GPT-4: standard default
      }
      
      // GPT-3.5
      if (modelId.includes('gpt-3.5') || modelName.includes('gpt-3.5')) {
        return 2048; // GPT-3.5: smaller default
      }
      
      return 4096; // Conservative default for unknown OpenAI models
      
    case 'anthropic':
      // Claude recommended defaults based on model type:
      if (modelId.includes('opus') || modelName.includes('opus')) {
        return 8192; // Claude Opus: higher default for complex reasoning tasks
      }
      if (modelId.includes('sonnet') || modelName.includes('sonnet')) {
        return 8192; // Claude Sonnet: good balance for coding and agents
      }
      if (modelId.includes('haiku') || modelName.includes('haiku')) {
        return 4096; // Claude Haiku: optimized for speed, smaller outputs
      }
      return 6144; // Default for other Claude models
      
    case 'gemini':
      if (modelId.includes('flash') || modelName.includes('flash')) {
        return 4096; // Flash models: speed-optimized
      }
      return 8192; // Reasonable default
      
    case 'groq':
      return 4096; // Fast inference, moderate default
      
    case 'mistral':
      return 4096;
      
    default:
      return 4096; // Conservative default
  }
};

/**
 * Get minimum tokens (universal)
 */
export const getModelMinTokens = (): number => {
  return 1;
};

/**
 * Validate and clamp max_tokens to model's actual limits
 */
export const validateMaxTokens = (maxTokens: number | undefined, model: ModelInfo): number => {
  if (maxTokens === undefined) {
    return getModelDefaultTokens(model);
  }
  
  const modelMax = getModelMaxOutputTokens(model);
  const modelMin = getModelMinTokens();
  
  // Clamp to valid range
  if (maxTokens > modelMax) {
    console.log(`[modelLimits] Clamping max_tokens from ${maxTokens} to model limit ${modelMax}`);
    return modelMax;
  }
  if (maxTokens < modelMin) {
    return modelMin;
  }
  
  return maxTokens;
};

/**
 * Get max tokens based on provider (legacy support, prefer model-specific)
 */
export const getProviderMaxTokens = (provider: ModelProvider): number => {
  switch (provider) {
    case 'deepseek':
      return 8192;
    case 'openai':
      return 16384;
    case 'anthropic':
      return 64000;
    case 'gemini':
      return 32768;
    case 'groq':
      return 8192;
    case 'mistral':
      return 8192;
    default:
      return 8192;
  }
};
