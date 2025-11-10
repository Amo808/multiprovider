import { useState, useCallback } from 'react';

export interface TokenUsageAggregate {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost?: number;
}

export const useTokenUsage = () => {
  const [usage, setUsage] = useState<TokenUsageAggregate | null>(null);
  const update = useCallback((u: TokenUsageAggregate) => setUsage(u), []);
  const reset = useCallback(() => setUsage(null), []);
  return { usage, update, reset };
};
