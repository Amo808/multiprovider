import React, { useMemo } from 'react';
import { Message, ModelInfo } from '../types';

interface TokenProgressProps {
  messages: Message[];
  model?: ModelInfo;
}

export const TokenProgress: React.FC<TokenProgressProps> = ({ messages, model }) => {
  const { used, max } = useMemo(() => {
    if (!model) return { used: 0, max: 0 };
    // naive estimation: sum tokens_in + tokens_out from assistant messages
    let used = 0;
    for (const m of messages) {
      if (m.meta) {
        used += (m.meta.tokens_in || 0) + (m.meta.tokens_out || 0);
      }
    }
    return { used, max: model.context_length };
  }, [messages, model]);

  if (!model) return null;
  const pct = max ? Math.min(100, (used / max) * 100) : 0;

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="relative flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-primary transition-all" style={{ width: pct + '%' }} />
      </div>
      <div className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">{used}/{max} ({pct.toFixed(1)}%)</div>
    </div>
  );
};
