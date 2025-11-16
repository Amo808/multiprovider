import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Copy, RefreshCw, AlertCircle, Zap, Square, Brain } from 'lucide-react';
import { Message, ModelInfo, ModelProvider, SendMessageRequest, GenerationConfig } from '../types';
import { useConversations } from '../hooks/useConversations';
import { ContextViewer } from './ContextViewer';
import { Button } from './ui/button';
import { estimateCostForMessage } from '../lib/pricing';

interface ChatInterfaceProps {
  selectedModel?: ModelInfo;
  selectedProvider?: ModelProvider;
  generationConfig: GenerationConfig;
  onProviderChange?: (provider: ModelProvider) => void;
  onApiKeyMissing?: (message: string) => void;
  conversationId?: string;
  onMessageSent?: (conversationId: string, message: string) => void;
  onTokenUsageUpdate?: (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; estimated_cost?: number }) => void; // NEW
  systemPrompt?: string; // NEW
}

const MessageBubble: React.FC<{
  message: Message;
  selectedModel?: ModelInfo;
  isStreaming?: boolean;
  currentResponse?: string;
  deepResearchStage?: string;
}> = ({ message, selectedModel, isStreaming = false, currentResponse = '', deepResearchStage }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const content = isStreaming ? currentResponse : message.content;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayContent = isStreaming ? currentResponse : message.content;
  const isUser = message.role === 'user';
  const isError = message.content.startsWith('Error:');

  return (
    <div className={`flex items-start space-x-3 max-w-4xl mx-auto px-4 py-6 ${
      isUser ? 'flex-row-reverse space-x-reverse' : ''
    }`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser 
          ? 'bg-blue-600 text-white' 
          : isError 
            ? 'bg-red-600 text-white'
            : 'bg-gray-600 text-white'
      }`}>
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Message Content */}
      <div className={`flex-1 min-w-0 ${isUser ? 'text-right' : ''}`}>
        <div className="flex items-center space-x-2 mb-1">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {isUser ? 'You' : (
              message.meta?.model ? 
                // Try to find the display name from the current model or use the model ID
                (selectedModel?.id === message.meta.model ? selectedModel.display_name : message.meta.model) :
                (selectedModel?.display_name || 'Assistant')
            )}
          </span>
          {message.meta?.provider && !isUser && (
            <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
              {message.meta.provider.toUpperCase()}
            </span>
          )}
          {/* Deep Research indicator */}
          {!isUser && (deepResearchStage || message.meta?.deep_research) && (
            <span className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full flex items-center space-x-1">
              <Zap size={10} />
              <span>Deep Research</span>
            </span>
          )}
          {/* DEBUG: Add to console */}
          {!isUser && (() => {
            console.log('DEBUG Research:', {
              deepResearchStage, 
              deep_research: message.meta?.deep_research,
              shouldShow: deepResearchStage || message.meta?.deep_research,
              messageMeta: message.meta
            });
            return null;
          })()}
          {isStreaming && (
            <div className="flex items-center space-x-1">
              {message.meta?.reasoning ? (
                <>
                  <Brain size={12} className="animate-pulse text-purple-600 dark:text-purple-400" />
                  <span className="text-xs text-purple-600 dark:text-purple-400">Reasoning...</span>
                </>
              ) : (
                <>
                  <Zap size={12} className="animate-pulse text-green-600 dark:text-green-400" />
                  <span className="text-xs text-green-600 dark:text-green-400">Streaming...</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className={`relative group ${
          isUser 
            ? 'bg-blue-600 text-white' 
            : isError
              ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              : 'bg-gray-50 dark:bg-gray-800'
        } rounded-lg p-4 ${isUser ? 'ml-8' : 'mr-8'}`}>
          {isError && (
            <div className="flex items-center space-x-2 mb-2 text-red-600 dark:text-red-400">
              <AlertCircle size={16} />
              <span className="text-sm font-medium">Error</span>
            </div>
          )}
          
          <div className={`prose prose-sm max-w-none ${
            isUser 
              ? 'text-white prose-invert' 
              : isError
                ? 'text-red-800 dark:text-red-200'
                : 'text-gray-900 dark:text-white prose-gray dark:prose-invert'
          }`}>
            {!isUser && !displayContent && !isError ? (
              // Show Deep Research stage, specific reasoning status, or generic "Thinking..." 
              deepResearchStage ? (
                <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm whitespace-pre-wrap">{deepResearchStage}</span>
                </div>
              ) : message.meta?.reasoning ? (
                <div className="flex items-center space-x-2 text-purple-600 dark:text-purple-400">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm">🤔 Model is reasoning...</span>
                </div>
              ) : isStreaming ? (
                <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm">💭 Generating response...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-muted-foreground">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm">⏳ Preparing...</span>
                </div>
              )
            ) : (
              <p className="whitespace-pre-wrap m-0">
                {displayContent}
                {isStreaming && (
                  <span className="animate-pulse">▊</span>
                )}
              </p>
            )}
          </div>

          {/* Copy Button */}
          {displayContent && !isStreaming && (
            <button
              onClick={handleCopy}
              className={`absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md ${
                isUser 
                  ? 'text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary/20' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              title={copied ? 'Copied!' : 'Copy message'}
            >
              <Copy size={14} />
            </button>
          )}
        </div>

        {/* Message Meta */}
        {message.meta && !isUser && (message.meta.tokens_in || message.meta.tokens_out || isStreaming) && (
          <div className="mt-1 flex items-center space-x-2 text-xs">
            <div className="text-muted-foreground">
              {new Date(message.timestamp).toLocaleTimeString()}
            </div>
            <div className="flex items-center space-x-1">
              {message.meta.tokens_in && (
                <span className="text-blue-600 dark:text-blue-400" title={`Input tokens: ${message.meta.tokens_in}`}>
                  ↑{message.meta.tokens_in}
                </span>
              )}
              {message.meta.tokens_out && (
                <span className="text-green-600 dark:text-green-400" title={`Output tokens: ${message.meta.tokens_out}`}>
                  ↓{message.meta.tokens_out}
                </span>
              )}
              { message.meta?.thought_tokens !== undefined && (
                <span className="text-purple-600 dark:text-purple-400" title={`Thinking (thought) tokens: ${message.meta.thought_tokens}`}>
                  Θ{message.meta.thought_tokens}
                </span>
              )}
              { message.meta?.thinking_tokens_used !== undefined && (
                <span className="text-purple-600 dark:text-purple-400" title={`Thinking tokens actually used: ${message.meta.thinking_tokens_used}`}>
                  used:{message.meta.thinking_tokens_used}
                </span>
              )}
              { message.meta?.tool_calls && Array.isArray(message.meta.tool_calls) && message.meta.tool_calls.length > 0 && (
                <span className="text-orange-600 dark:text-orange-400" title="Tool calls executed">
                  tools:{message.meta.tool_calls.length}
                </span>
              )}
              {message.meta.estimated_cost ? (
                <span className="text-yellow-600 dark:text-yellow-400" title={`Estimated cost: $${message.meta.estimated_cost}`}>
                  ${message.meta.estimated_cost.toFixed(4)}
                </span>
              ) : (isStreaming || (message.content && !message.meta.estimated_cost)) ? (
                <span className="text-muted-foreground animate-pulse">
                  calculating cost...
                </span>
              ) : null}
            </div>
          </div>
        )}

        {/* Show timestamp only if no meta info shown above */}
        {(!message.meta || isUser || (!message.meta.tokens_in && !message.meta.tokens_out && !isStreaming)) && (
          <div className="mt-1 text-xs text-muted-foreground">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
};

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  selectedModel,
  selectedProvider,
  generationConfig,
  onApiKeyMissing,
  conversationId: incomingConversationId,
  onMessageSent,
  onTokenUsageUpdate, // NEW
  systemPrompt // NEW
}) => {
  const [inputValue, setInputValue] = useState('');
  const conversationId = incomingConversationId || `conversation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { getConversation, sendMessage, clearConversation, stopStreaming, recoverStuckRequest } = useConversations();
  const conversationState = getConversation(conversationId);
  const { messages, isStreaming, error, currentResponse, deepResearchStage, connectionLost, lastHeartbeat } = conversationState;

  // NEW: aggregate token usage whenever messages change
  useEffect(() => {
    if (!messages.length) return;
    const totals = messages.reduce((acc, m) => {
      const meta = m.meta;
      if (meta) {
        if (meta.tokens_in) acc.prompt += meta.tokens_in;
        if (meta.tokens_out) acc.completion += meta.tokens_out;
        // compute cost if not provided
        const cost = meta.estimated_cost !== undefined ? meta.estimated_cost : estimateCostForMessage(selectedModel?.id, meta);
        if (cost) acc.cost += cost;
      }
      return acc;
    }, { prompt: 0, completion: 0, cost: 0 });
    onTokenUsageUpdate?.({
      prompt_tokens: totals.prompt,
      completion_tokens: totals.completion,
      total_tokens: totals.prompt + totals.completion,
      estimated_cost: totals.cost || undefined
    });
  }, [messages, onTokenUsageUpdate, selectedModel?.id]);

  // Custom message handler with API key error handling
  const handleSendMessage = async (request: SendMessageRequest) => {
    try {
      console.log('ChatInterface: Sending message:', request);
      await sendMessage(conversationId, request);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      console.log('ChatInterface: Error caught:', errorMessage);
      
      // Check if it's an API key missing error
      const isApiKeyError = errorMessage.includes('API_KEY_MISSING') || 
                           errorMessage.includes('API key is required') || 
                           errorMessage.includes('API key for') || 
                           errorMessage.includes('not configured') ||
                           errorMessage.includes('Invalid API key') ||
                           errorMessage.includes('(API_KEY_MISSING)');
                           
      if (isApiKeyError) {
        console.log('ChatInterface: API key error detected, calling onApiKeyMissing');
        if (onApiKeyMissing) {
          onApiKeyMissing(request.message);
          return; // Don't show error message, let the modal handle it
        } else {
          console.error('ChatInterface: onApiKeyMissing callback is not provided!');
        }
      }
      
      // For other errors, let useChat handle it (it won't reach here for API key errors)
      console.log('ChatInterface: Non-API key error, letting useChat handle it');
      throw err;
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentResponse]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  // Preset insertion via window event
  useEffect(() => {
    const handler = (e: CustomEvent<string>) => {
      if (e.detail) {
        setInputValue(v => (v ? v + '\n' : '') + e.detail);
      }
    };
    window.addEventListener('insert-preset', handler as EventListener);
    return () => window.removeEventListener('insert-preset', handler as EventListener);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputValue.trim() || isStreaming) return;
    if (!selectedModel || !selectedProvider) {
      alert('Please select a model first');
      return;
    }

    const messageText = inputValue.trim();
    const request: SendMessageRequest = {
      message: messageText,
      provider: selectedProvider,
      model: selectedModel.id,
      conversation_id: conversationId,
      config: generationConfig,
      ...(systemPrompt && systemPrompt.trim() ? { system_prompt: systemPrompt.trim() } : {})
    };

    setInputValue('');
    
    try {
      await handleSendMessage(request);
      // Update conversation title with first message
      if (onMessageSent) {
        onMessageSent(conversationId, messageText);
      }
    } catch (error) {
      // Handle error but don't prevent title update
      console.error('Send message error:', error);
      if (onMessageSent) {
        onMessageSent(conversationId, messageText);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleClearHistory = async () => {
    if (confirm('Are you sure you want to clear all messages?')) {
      try {
        await clearConversation(conversationId);
      } catch (err) {
        alert('Failed to clear history');
      }
    }
  };

  const canSend = inputValue.trim() && !isStreaming && selectedModel && selectedProvider;

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md mx-auto px-4">
              <Bot size={64} className="mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Welcome to MULTECH AI
              </h2>
              <p className="text-muted-foreground mb-6">
                Start a conversation with your AI assistant. Choose a model and begin chatting!
              </p>
              {selectedModel && selectedProvider ? (
                <div className="bg-secondary rounded-lg p-4">
                  <div className="flex items-center justify-center space-x-2 text-sm">
                    <span className="text-muted-foreground">Ready with</span>
                    <span className="font-medium text-foreground">
                      {selectedModel.display_name}
                    </span>
                    <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                      {selectedProvider.toUpperCase()}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                  <p className="text-destructive text-sm">
                    Please select a model to start chatting
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-4">
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                selectedModel={selectedModel}
                isStreaming={isStreaming && index === messages.length - 1}
                currentResponse={currentResponse}
                deepResearchStage={index === messages.length - 1 ? deepResearchStage : undefined}
              />
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 flex-shrink-0">
        {/* Connection Status and Recovery */}
        {connectionLost && isStreaming && (
          <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle size={16} className="text-yellow-600 dark:text-yellow-400" />
                <div>
                  {/* Check if this is a reasoning model or deep research */}
                  {(deepResearchStage?.includes('reasoning') || deepResearchStage?.includes('GPT-5') || deepResearchStage?.includes('thinking')) ? (
                    <>
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Deep Reasoning in Progress</p>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">
                        The model is performing complex reasoning. This can take several minutes.
                        {lastHeartbeat && (
                          <span> Processing for: {Math.round((Date.now() - lastHeartbeat) / 1000)}s</span>
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Connection Issue</p>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">
                        No response from server for over a minute. The model might still be processing.
                        {lastHeartbeat && (
                          <span> Last activity: {Math.round((Date.now() - lastHeartbeat) / 1000)}s ago</span>
                        )}
                      </p>
                    </>
                  )}
                </div>
              </div>
              {/* Only show retry button for actual connection issues, not reasoning */}
              {!(deepResearchStage?.includes('reasoning') || deepResearchStage?.includes('GPT-5') || deepResearchStage?.includes('thinking')) && (
                <button
                  type="button"
                  onClick={() => recoverStuckRequest(conversationId)}
                  className="px-3 py-1 text-xs bg-yellow-600 hover:bg-yellow-700 text-white rounded-md transition-colors"
                >
                  Retry Connection
                </button>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <div className="flex items-center space-x-2">
              <AlertCircle size={16} className="text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex space-x-3">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedModel 
                  ? "Type your message... (Press Enter to send, Shift+Enter for new line)"
                  : "Select a model first..."
              }
              className="w-full px-4 py-3 border border-input rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-input bg-background text-foreground placeholder:text-muted-foreground"
              rows={1}
              style={{ minHeight: '48px', maxHeight: '200px' }}
              disabled={!selectedModel || isStreaming}
            />
          </div>
          
          <div className="flex space-x-2">
            {/* Context Viewer */}
            <ContextViewer
              messages={messages}
              currentInput={inputValue}
              generationConfig={generationConfig}
            />
            
            {messages.length > 0 && (
              <Button
                type="button"
                onClick={handleClearHistory}
                disabled={isStreaming}
                variant="ghost"
                title="Clear conversation"
              >
                <RefreshCw size={20} />
              </Button>
            )}
            
            {isStreaming ? (
              <Button
                type="button"
                onClick={() => stopStreaming(conversationId)}
                variant="destructive"
                title="Stop generation"
                className="px-6"
              >
                <Square size={20} />
                <span className="text-sm ml-2">Stop</span>
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={!canSend}
                className="px-6"
              >
                <Send size={20} />
              </Button>
            )}
          </div>
        </form>

        {/* Status Bar */}
        <div className="mt-3 flex items-center justify-between text-xs bg-secondary rounded-md p-2 border border-border">
          <div className="flex items-center space-x-4 text-secondary-foreground">
            {selectedModel && selectedProvider && (
              <>
                <span className="font-semibold text-foreground">
                  Model: {selectedModel.display_name} ({selectedProvider.toUpperCase()})
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">
                  Context: {selectedModel.context_length.toLocaleString()} tokens
                </span>
                {generationConfig.verbosity && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span title="Verbosity hint to GPT-5" className="px-2 py-1 bg-primary/10 text-primary rounded-full font-medium">Verbosity: {generationConfig.verbosity}</span>
                  </>
                )}
                {generationConfig.reasoning_effort && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span title="Reasoning effort" className="px-2 py-1 bg-primary/10 text-primary rounded-full font-medium">Reasoning: {generationConfig.reasoning_effort}</span>
                  </>
                )}
                {generationConfig.thinking_budget !== undefined && selectedProvider === 'gemini' && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span title="Gemini thinking budget" className="px-2 py-1 bg-primary/10 text-primary rounded-full font-medium">ThinkBudget: {generationConfig.thinking_budget}</span>
                  </>
                )}
                {generationConfig.stream && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span className="px-2 py-1 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-medium">Streaming enabled</span>
                  </>
                )}
              </>
            )}
          </div>
          <div className="font-medium text-foreground">
            {messages.length > 0 && (
              <span>{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
