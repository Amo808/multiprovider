import React, { useState, useRef, useEffect } from 'react';
import { Send, Square, Bot, Layers, X } from 'lucide-react';
import { ModelInfo, GenerationConfig } from '../types';
import { Button } from './ui/button';
import { ModelMultiSelector } from './ModelMultiSelector';
import { ParallelResponseView } from './ParallelResponseView';
import { useParallelChat } from '../hooks/useParallelChat';
import { cn } from '../lib/utils';

interface ParallelChatInterfaceProps {
  availableModels: ModelInfo[];
  generationConfig: GenerationConfig;
  systemPrompt?: string;
  onClose?: () => void;
}

export const ParallelChatInterface: React.FC<ParallelChatInterfaceProps> = ({
  availableModels,
  generationConfig,
  systemPrompt,
  onClose,
}) => {
  const [selectedModels, setSelectedModels] = useState<ModelInfo[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [currentUserMessage, setCurrentUserMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    responses,
    isLoading,
    sendParallelMessages,
    cancelAll,
    clearResponses,
  } = useParallelChat();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputValue.trim() || selectedModels.length === 0 || isLoading) return;

    const message = inputValue.trim();
    setInputValue('');
    setCurrentUserMessage(message);
    
    await sendParallelMessages(message, selectedModels, generationConfig, systemPrompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleNewComparison = () => {
    clearResponses();
    setCurrentUserMessage('');
  };

  const canSend = inputValue.trim() && selectedModels.length > 0 && !isLoading;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-purple-500/20">
            <Layers size={18} className="text-purple-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Parallel Model Comparison</h2>
            <p className="text-xs text-muted-foreground">Compare responses from multiple AI models side-by-side</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            title="Close parallel chat"
          >
            <X size={18} className="text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden min-h-0">
        {responses.length > 0 ? (
          <ParallelResponseView
            userMessage={currentUserMessage}
            responses={responses}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md mx-auto px-4">
              <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
                <Layers size={32} className="text-purple-500" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                Compare AI Models
              </h3>
              <p className="text-muted-foreground mb-6">
                Select multiple models below and send a message to see how different AI models respond to the same prompt.
              </p>
              <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-1 bg-muted rounded-full">Compare reasoning</span>
                <span className="px-2 py-1 bg-muted rounded-full">Test prompts</span>
                <span className="px-2 py-1 bg-muted rounded-full">Evaluate speed</span>
                <span className="px-2 py-1 bg-muted rounded-full">Check costs</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border bg-card p-4 flex-shrink-0 space-y-3">
        {/* Model selector */}
        <ModelMultiSelector
          availableModels={availableModels}
          selectedModels={selectedModels}
          onSelectionChange={setSelectedModels}
          maxSelections={4}
          disabled={isLoading}
        />

        {/* Input form */}
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedModels.length === 0
                  ? "Select at least one model to start..."
                  : `Send to ${selectedModels.length} model${selectedModels.length > 1 ? 's' : ''}... (Enter to send)`
              }
              className={cn(
                "w-full px-4 py-3 border rounded-lg resize-none",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring",
                "bg-background text-foreground placeholder:text-muted-foreground",
                "border-border",
                selectedModels.length > 0 && "border-purple-500/30"
              )}
              rows={1}
              style={{ minHeight: '48px', maxHeight: '120px' }}
              disabled={selectedModels.length === 0 || isLoading}
            />
          </div>

          <div className="flex gap-2">
            {responses.length > 0 && !isLoading && (
              <Button
                type="button"
                onClick={handleNewComparison}
                variant="outline"
                title="New comparison"
              >
                <Bot size={18} />
              </Button>
            )}
            
            {isLoading ? (
              <Button
                type="button"
                onClick={cancelAll}
                variant="destructive"
                className="px-6"
              >
                <Square size={18} />
                <span className="ml-2">Stop</span>
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={!canSend}
                className={cn(
                  "px-6",
                  canSend && "bg-purple-600 hover:bg-purple-700"
                )}
              >
                <Send size={18} />
              </Button>
            )}
          </div>
        </form>

        {/* Status bar */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {selectedModels.length > 0 && (
              <span className="flex items-center gap-1">
                <Layers size={12} />
                {selectedModels.length} model{selectedModels.length > 1 ? 's' : ''} selected
              </span>
            )}
            {isLoading && (
              <span className="flex items-center gap-1 text-purple-500">
                <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
                Generating responses...
              </span>
            )}
          </div>
          <div>
            {responses.length > 0 && (
              <span>
                {responses.filter(r => !r.isStreaming && r.content).length}/{responses.length} complete
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParallelChatInterface;
