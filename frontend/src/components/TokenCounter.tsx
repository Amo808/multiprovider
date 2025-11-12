import React, { useState } from 'react';
import { cn } from '../lib/utils';

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost?: number;
}

interface TokenCounterProps {
  usage: TokenUsage | null;
  model?: string;
  maxTokens?: number;
  className?: string;
}

const TokenCounter: React.FC<TokenCounterProps> = ({ 
  usage, 
  model, 
  maxTokens,
  className = ""
}) => {
  const [open, setOpen] = useState(false);
  if (!usage) return null;
  const { prompt_tokens, completion_tokens, total_tokens, estimated_cost } = usage;
  const tokenPercentage = maxTokens ? (completion_tokens / maxTokens) * 100 : 0;
  return (
    <div className={cn('relative', className)}>
      <button onClick={() => setOpen(o=>!o)} className="px-2 py-1 text-[11px] rounded-md bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 flex items-center gap-1">
        📊 <span>{open ? 'Hide' : 'Usage'}</span>
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 w-full max-w-xl shadow-lg text-[11px] space-y-2">
          <div className="flex items-center flex-wrap gap-2">
            <div className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">Token Usage {model && <span className="text-gray-500 dark:text-gray-400">({model})</span>}</div>
            <div className="ml-auto flex items-center gap-4">
              <div className="flex items-center gap-1"><span className="text-blue-600 dark:text-blue-400 font-semibold">{prompt_tokens.toLocaleString()}</span><span className="text-gray-500">In</span></div>
              <div className="flex items-center gap-1"><span className="text-green-600 dark:text-green-400 font-semibold">{completion_tokens.toLocaleString()}</span><span className="text-gray-500">Out</span></div>
              <div className="flex items-center gap-1"><span className="text-gray-800 dark:text-gray-200 font-semibold">{total_tokens.toLocaleString()}</span><span className="text-gray-500">Total</span></div>
              {estimated_cost !== undefined && <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400"><span>$</span><span>{estimated_cost.toFixed(5)}</span></div>}
            </div>
          </div>
          {maxTokens && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className={`${tokenPercentage>90?'bg-red-500':tokenPercentage>70?'bg-yellow-500':'bg-green-500'} h-full transition-all`} style={{width: `${Math.min(tokenPercentage,100)}%`}} />
              </div>
              <span className="text-gray-500 dark:text-gray-400 min-w-[90px] text-right">{completion_tokens.toLocaleString()} / {maxTokens.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TokenCounter;
