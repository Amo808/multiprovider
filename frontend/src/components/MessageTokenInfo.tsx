import React from 'react';
import { Calculator, DollarSign } from 'lucide-react';

interface MessageTokenInfoProps {
  tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
  model?: string;
  isUserMessage?: boolean;
  className?: string;
}

const MessageTokenInfo: React.FC<MessageTokenInfoProps> = ({ 
  tokens,
  inputTokens,
  outputTokens, 
  totalTokens,
  estimatedCost,
  model,
  isUserMessage = false,
  className = "" 
}) => {
  // For user messages, show estimated tokens, for assistant messages show actual usage
  const displayTokens = tokens || inputTokens || outputTokens || totalTokens;
  
  if (!displayTokens && displayTokens !== 0) return null;

  return (
    <div className={`flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1 ${className}`}>
      <Calculator className="w-3 h-3" />
      
      {isUserMessage ? (
        // User message: show estimated token count
        <span>~{displayTokens.toLocaleString()} tokens</span>
      ) : (
        // Assistant message: show detailed breakdown
        <div className="flex items-center gap-3">
          {inputTokens !== undefined && (
            <span className="text-blue-600 dark:text-blue-400">
              {inputTokens.toLocaleString()} in
            </span>
          )}
          {outputTokens !== undefined && (
            <span className="text-green-600 dark:text-green-400">
              {outputTokens.toLocaleString()} out
            </span>
          )}
          {totalTokens !== undefined && (
            <span className="text-gray-600 dark:text-gray-400">
              {totalTokens.toLocaleString()} total
            </span>
          )}
          {estimatedCost !== undefined && estimatedCost > 0 && (
            <div className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
              <DollarSign className="w-3 h-3" />
              <span>${estimatedCost.toFixed(6)}</span>
            </div>
          )}
        </div>
      )}
      
      {model && (
        <span className="text-gray-400 dark:text-gray-500">({model})</span>
      )}
    </div>
  );
};

export default MessageTokenInfo;
