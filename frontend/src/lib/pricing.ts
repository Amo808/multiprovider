// Basic per-1K token pricing table (USD). Approximate / placeholder values.
// Adjust with real pricing from providers as needed.
// Keys are model id substrings (lowercase) for matching.
export interface PricingEntry { input: number; output: number; thought?: number }

const PRICING: Record<string, PricingEntry> = {
  // DeepSeek
  'deepseek-chat': { input: 0.0005, output: 0.0005 },
  'deepseek-reasoner': { input: 0.0008, output: 0.0012, thought: 0.0006 },
  // OpenAI (examples)
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4.1': { input: 0.01, output: 0.03 },
  'gpt-5': { input: 0.012, output: 0.036 },
  'o1': { input: 0.01, output: 0.03, thought: 0.008 },
  'o3': { input: 0.02, output: 0.06, thought: 0.01 },
  // Anthropic
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.001, output: 0.005 },
  // Gemini
  'gemini': { input: 0.001, output: 0.002 },
};

// Attempt to find pricing by model id using substring match priority order
export function findPricing(modelId?: string): PricingEntry | undefined {
  if (!modelId) return undefined;
  const id = modelId.toLowerCase();
  const keys = Object.keys(PRICING);
  for (const k of keys) {
    if (id.includes(k)) return PRICING[k];
  }
  return undefined;
}

interface MetaLike { tokens_in?: number; tokens_out?: number; estimated_cost?: number; thought_tokens?: number; thinking_tokens_used?: number }
export function estimateCostForMessage(modelId: string | undefined, meta: MetaLike): number | undefined {
  if (!modelId || !meta) return undefined;
  if (meta.estimated_cost !== undefined) return meta.estimated_cost; // prefer server estimate
  const pricing = findPricing(modelId);
  if (!pricing) return undefined;
  const inT = meta.tokens_in || 0;
  const outT = meta.tokens_out || 0;
  const thoughtT = meta.thought_tokens || meta.thinking_tokens_used || 0;
  const cost = (inT / 1000) * pricing.input + (outT / 1000) * pricing.output + (pricing.thought ? (thoughtT / 1000) * pricing.thought : 0);
  return cost;
}
