import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';
import { BarChart3, X } from 'lucide-react';

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost?: number;
}

interface TokenCounterProps {
  usage: TokenUsage | null;
  model?: string;
  contextLength?: number;  // context_length - для прогресса общего контекста
  className?: string;
}

const TokenCounter: React.FC<TokenCounterProps> = ({ 
  usage, 
  model, 
  contextLength,
  className = ""
}) => {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  
  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (!usage) return null;
  const { prompt_tokens, completion_tokens, total_tokens, estimated_cost } = usage;
  
  // Используем context_length для общего прогресса (total_tokens vs context)
  const contextPercentage = contextLength ? (total_tokens / contextLength) * 100 : 0;
  
  return (
    <div className={cn('relative', className)} ref={panelRef}>
      <button 
        onClick={() => setOpen(o=>!o)} 
        className="px-2 py-1 text-[11px] rounded-md bg-secondary hover:bg-secondary/80 text-secondary-foreground flex items-center gap-1.5 transition-colors"
      >
        <BarChart3 size={12} />
        <span className="hidden sm:inline">{total_tokens.toLocaleString()} tokens</span>
        <span className="sm:hidden">{total_tokens.toLocaleString()}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 rounded-lg border bg-popover text-popover-foreground p-3 min-w-[280px] shadow-lg text-[11px] space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-medium flex items-center gap-1">
              Token Usage 
              {model && <span className="text-muted-foreground text-[10px]">({model})</span>}
            </div>
            <button 
              onClick={() => setOpen(false)} 
              className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex items-center gap-4 text-[10px]">
            <div className="flex items-center gap-1">
              <span className="text-blue-500 font-semibold">{prompt_tokens.toLocaleString()}</span>
              <span className="text-muted-foreground">In</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-green-500 font-semibold">{completion_tokens.toLocaleString()}</span>
              <span className="text-muted-foreground">Out</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-semibold">{total_tokens.toLocaleString()}</span>
              <span className="text-muted-foreground">Total</span>
            </div>
            {estimated_cost !== undefined && (
              <div className="flex items-center gap-1 text-muted-foreground ml-auto">
                <span>${estimated_cost.toFixed(5)}</span>
              </div>
            )}
          </div>
          {/* Context usage - total tokens vs context_length */}
          {contextLength && (
            <div className="space-y-1 pt-1 border-t border-border">
              <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                <span>Context Usage</span>
                <span>{total_tokens.toLocaleString()} / {contextLength.toLocaleString()}</span>
              </div>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`${contextPercentage>90?'bg-red-500':contextPercentage>70?'bg-yellow-500':'bg-blue-500'} h-full transition-all`} 
                  style={{width: `${Math.min(contextPercentage,100)}%`}} 
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TokenCounter;
