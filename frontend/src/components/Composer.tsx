import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import TextareaAutosize from 'react-textarea-autosize';
import { Send, Square, Calculator, DollarSign } from 'lucide-react';
import { Button } from './ui/button';
import { useHotkeys } from 'react-hotkeys-hook';
import { ModelInfo, GenerationConfig } from '../types';
import { getTokenStats, formatTokenCount, getTokenIndicatorColor } from '../utils/tokenUtils';
import { cn } from '../lib/utils';

const schema = z.object({ message: z.string().min(1, 'Message required') });

export interface ComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  selectedModel?: ModelInfo;
  stop: () => void;
  generationConfig: GenerationConfig;
}

export const Composer: React.FC<ComposerProps> = ({ onSend, disabled, isStreaming, stop, selectedModel, generationConfig }) => {
  const { register, handleSubmit, setValue, watch } = useForm<{ message: string }>({ resolver: zodResolver(schema), defaultValues: { message: '' } });
  const value = watch('message');

  const submit = (data: { message: string }) => {
    onSend(data.message.trim());
    setValue('message', '');
  };

  useHotkeys('enter', (e) => { if (!e.shiftKey) { e.preventDefault(); if (value.trim() && !isStreaming && !disabled) handleSubmit(submit)(); } }, { enableOnFormTags: true });

  // Calculate token stats for the current input
  const tokenStats = selectedModel ? getTokenStats(value || '', selectedModel, generationConfig.max_tokens) : null;
  const estimatedCost = selectedModel && tokenStats ? calculateInputCost(tokenStats.current, selectedModel) : 0;

  return (
    <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Token and Cost Info - Top */}
        {selectedModel && value && tokenStats && (
          <div className="mb-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1">
                <Calculator className="w-3 h-3" />
                <span className={getTokenIndicatorColor(tokenStats.percentage)}>
                  ~{formatTokenCount(tokenStats.current)} tokens
                </span>
                <span className="text-gray-400">/ {formatTokenCount(tokenStats.max)}</span>
              </div>
              {tokenStats.isExceeded && (
                <span className="text-red-600 dark:text-red-400 font-medium">
                  Exceeds limit by {formatTokenCount(tokenStats.current - tokenStats.max)}
                </span>
              )}
            </div>
            {estimatedCost > 0 && (
              <div className="flex items-center space-x-1 text-purple-600 dark:text-purple-400">
                <DollarSign className="w-3 h-3" />
                <span>~${estimatedCost.toFixed(6)}</span>
              </div>
            )}
          </div>
        )}

        {/* Input Area */}
        <form onSubmit={handleSubmit(submit)} className="flex space-x-3 mb-4">
          <div className="flex-1 relative">
            <TextareaAutosize
              minRows={1}
              maxRows={8}
              {...register('message')}
              placeholder={selectedModel ? 'Type your message' : 'Select a model first...'}
              className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white resize-none text-sm"
              disabled={disabled || isStreaming || !selectedModel}
            />
            <div className="absolute bottom-3 right-3 text-[10px] text-gray-400">
              {value.length}
            </div>
          </div>
          <Button
            type={isStreaming ? "button" : "submit"}
            onClick={isStreaming ? stop : undefined}
            disabled={!isStreaming && (!value.trim() || disabled || !selectedModel)}
            className={cn(
              "px-6 py-3 rounded-2xl transition-all",
              isStreaming 
                ? "bg-red-500 hover:bg-red-600 text-white" 
                : "bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 disabled:bg-gray-300 disabled:text-gray-500"
            )}
          >
            {isStreaming ? <Square size={18} /> : <Send size={18} />}
          </Button>
        </form>

        {/* Model Information - Bottom */}
        {selectedModel && (
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-2">
            <div className="flex items-center space-x-4">
              <span className="font-medium">
                Model: <span className="text-gray-700 dark:text-gray-300">{selectedModel.display_name || selectedModel.id}</span>
              </span>
              <span>•</span>
              <span>
                Context: <span className="text-gray-700 dark:text-gray-300">{selectedModel.context_length?.toLocaleString() || '400,000'} tks</span>
              </span>
              <span>•</span>
              <span>
                Reasoning: <span className="text-blue-600 dark:text-blue-400">High</span>
              </span>
              {selectedModel.supports_streaming && (
                <>
                  <span>•</span>
                  <span className="text-green-600 dark:text-green-400">Streaming: On</span>
                </>
              )}
            </div>
            <div className="flex items-center space-x-2 text-gray-400">
              <span>MCP Tools (1)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Rough cost estimation for popular models (per 1K tokens)
function calculateInputCost(tokens: number, model: ModelInfo): number {
  const per1kTokens = tokens / 1000;
  
  // Rough pricing estimates (these should ideally come from config)
  const costPer1kTokens = getCostPer1kTokens(model);
  
  return per1kTokens * costPer1kTokens;
}

function getCostPer1kTokens(model: ModelInfo): number {
  const modelId = model.id.toLowerCase();
  const provider = model.provider.toLowerCase();
  
  // Very rough estimates - in a real app, these should be configurable
  if (provider === 'openai') {
    if (modelId.includes('gpt-4o')) return 0.0025;
    if (modelId.includes('gpt-4')) return 0.03;
    if (modelId.includes('gpt-3.5')) return 0.0015;
  } else if (provider === 'anthropic') {
    if (modelId.includes('claude-3-opus')) return 0.015;
    if (modelId.includes('claude-3-sonnet')) return 0.003;
    if (modelId.includes('claude-3-haiku')) return 0.00025;
  } else if (provider === 'deepseek') {
    return 0.00014; // Very cheap
  }
  
  return 0.002; // Default fallback
}
