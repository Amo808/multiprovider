import React from 'react';
import { Calculator, Zap, DollarSign } from 'lucide-react';

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
  if (!usage) return null;

  const { prompt_tokens, completion_tokens, total_tokens, estimated_cost } = usage;
  const tokenPercentage = maxTokens ? (completion_tokens / maxTokens) * 100 : 0;

  return (
    <div className={`bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs space-y-2 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
        <Calculator className="w-4 h-4" />
        <span>Token Usage</span>
        {model && (
          <span className="text-gray-500 dark:text-gray-400">({model})</span>
        )}
      </div>

      {/* Token Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <div className="text-blue-600 dark:text-blue-400 font-medium">
            {prompt_tokens.toLocaleString()}
          </div>
          <div className="text-gray-500 dark:text-gray-400">Input</div>
        </div>
        
        <div className="text-center">
          <div className="text-green-600 dark:text-green-400 font-medium">
            {completion_tokens.toLocaleString()}
          </div>
          <div className="text-gray-500 dark:text-gray-400">Output</div>
        </div>
        
        <div className="text-center">
          <div className="text-gray-700 dark:text-gray-300 font-medium">
            {total_tokens.toLocaleString()}
          </div>
          <div className="text-gray-500 dark:text-gray-400">Total</div>
        </div>
      </div>

      {/* Progress Bar for Output Tokens */}
      {maxTokens && (
        <div className="space-y-1">
          <div className="flex justify-between text-gray-500 dark:text-gray-400">
            <span>Output Progress</span>
            <span>{tokenPercentage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${
                tokenPercentage > 90 
                  ? 'bg-red-500' 
                  : tokenPercentage > 70 
                    ? 'bg-yellow-500' 
                    : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(tokenPercentage, 100)}%` }}
            />
          </div>
          <div className="text-gray-500 dark:text-gray-400 text-center">
            {completion_tokens.toLocaleString()} / {maxTokens.toLocaleString()} tokens
          </div>
        </div>
      )}

      {/* Cost Estimate */}
      {estimated_cost !== undefined && (
        <div className="flex items-center justify-center gap-1 text-gray-600 dark:text-gray-400 pt-1 border-t border-gray-200 dark:border-gray-700">
          <DollarSign className="w-3 h-3" />
          <span>Est. Cost: ${estimated_cost.toFixed(6)}</span>
        </div>
      )}

      {/* Performance Indicator */}
      <div className="flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400">
        <Zap className="w-3 h-3" />
        <span>
          {completion_tokens > 1000 
            ? 'Long Response' 
            : completion_tokens > 500 
              ? 'Medium Response' 
              : 'Short Response'
          }
        </span>
      </div>
    </div>
  );
};

export default TokenCounter;
