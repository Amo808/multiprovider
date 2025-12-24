import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, RefreshCw, AlertCircle, Square, ArrowUpDown, FileText } from 'lucide-react';
import { ModelInfo, ModelProvider, SendMessageRequest, GenerationConfig } from '../types';
import { useConversationsContext } from '../contexts/ConversationsContext';
import { useMessageReorder } from '../hooks/useMessageReorder';
import { useThinkingStream } from '../hooks/useThinkingStream';
import { ContextViewer } from './ContextViewer';
import { Button } from './ui/button';
import { estimateCostForMessage } from '../lib/pricing';
import { MessageBubble } from './MessageBubble';
import DocumentManager from './DocumentManager';

interface ChatInterfaceProps {
  selectedModel?: ModelInfo;
  selectedProvider?: ModelProvider;
  generationConfig: GenerationConfig;
  onProviderChange?: (provider: ModelProvider) => void;
  onApiKeyMissing?: (message: string) => void;
  conversationId?: string;
  onMessageSent?: (conversationId: string, message: string) => void;
  onTokenUsageUpdate?: (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; estimated_cost?: number }) => void;
  systemPrompt?: string;
  onConfigChange?: (config: Partial<GenerationConfig>) => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  selectedModel,
  selectedProvider,
  generationConfig,
  onApiKeyMissing,
  conversationId: incomingConversationId,
  onMessageSent,
  onTokenUsageUpdate,
  systemPrompt,
  onConfigChange: _onConfigChange // kept for API compatibility
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showDocumentManager, setShowDocumentManager] = useState(false);
  const conversationId = incomingConversationId || `conversation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { conversations, getConversation, sendMessage, clearConversation, stopStreaming, recoverStuckRequest, updateMessages } = useConversationsContext();
  
  // Use conversations directly for reactivity - this ensures re-render when state changes
  const conversationState = conversations[conversationId] || getConversation(conversationId);
  
  // Safe destructuring with defaults
  const messages = conversationState?.messages || [];
  const isStreaming = conversationState?.isStreaming || false;
  const error = conversationState?.error || null;
  const currentResponse = conversationState?.currentResponse || '';
  const deepResearchStage = conversationState?.deepResearchStage;
  const connectionLost = conversationState?.connectionLost || false;
  const lastHeartbeat = conversationState?.lastHeartbeat;
  // Get thinking from context as fallback
  const contextThinkingContent = conversationState?.thinkingContent;
  const contextIsThinking = conversationState?.isThinking || false;
  const updateVersion = conversationState?.updateVersion || 0;

  // Use dedicated thinking stream hook - this is more reliable than the main chat SSE
  // because it uses the same mechanism as ProcessViewer which works correctly
  const { 
    thinkingContent: streamThinkingContent, 
    isThinking: streamIsThinking 
  } = useThinkingStream({ conversationId });
  
  // Prefer stream thinking over context thinking (stream is more reliable)
  const thinkingContent = streamThinkingContent || contextThinkingContent;
  const isThinking = streamIsThinking || contextIsThinking;
  
  // When thinking completes, update the last assistant message with the thinking content
  useEffect(() => {
    if (!streamIsThinking && streamThinkingContent && streamThinkingContent.length > 0 && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'assistant' && !lastMsg.meta?.reasoning_content) {
        // Update the message with thinking content
        const updatedMessages = messages.map((msg, idx) => {
          if (idx === messages.length - 1 && msg.role === 'assistant') {
            return {
              ...msg,
              meta: {
                ...msg.meta,
                reasoning_content: streamThinkingContent,
                thought_content: streamThinkingContent,
                thinking: streamThinkingContent
              }
            };
          }
          return msg;
        });
        
        if (updateMessages) {
          console.log(`[ChatInterface] Saving thinking content to message: ${streamThinkingContent.length} chars`);
          updateMessages(conversationId, updatedMessages);
        }
      }
    }
  }, [streamIsThinking, streamThinkingContent, messages, conversationId, updateMessages]);

  // Debug: log state changes
  useEffect(() => {
    console.log(`[ChatInterface] State update:`, {
      conversationId,
      updateVersion,
      messagesCount: messages.length,
      isStreaming,
      isThinking,
      streamIsThinking,
      contextIsThinking,
      thinkingContentLen: thinkingContent?.length || 0,
      streamThinkingLen: streamThinkingContent?.length || 0,
      lastMsgReasoningLen: messages[messages.length - 1]?.meta?.reasoning_content?.length || 0
    });
  }, [conversationId, messages, isStreaming, isThinking, thinkingContent, streamThinkingContent, streamIsThinking, contextIsThinking, updateVersion]);

  // Initialize conversation on mount if it doesn't exist
  useEffect(() => {
    if (!conversations[conversationId]) {
      getConversation(conversationId);
    }
  }, [conversationId, conversations, getConversation]);

  // Message reordering functionality
  const { moveUp, moveDown, deleteMessage } = useMessageReorder();
  const [reorderingEnabled, setReorderingEnabled] = useState(false);

  const handleMoveUp = async (index: number) => {
    const newMessages = await moveUp(conversationId, index);
    if (newMessages && updateMessages) {
      updateMessages(conversationId, newMessages);
    }
  };

  const handleMoveDown = async (index: number) => {
    const newMessages = await moveDown(conversationId, index);
    if (newMessages && updateMessages) {
      updateMessages(conversationId, newMessages);
    }
  };

  const handleDeleteMessage = async (index: number) => {
    if (!confirm('Are you sure you want to delete this message?')) return;
    const newMessages = await deleteMessage(conversationId, index);
    if (newMessages && updateMessages) {
      updateMessages(conversationId, newMessages);
    }
  };

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
            {messages.map((message, index) => {
              // Calculate key with updateVersion to force re-render when thinking content changes
              const isLastMessage = index === messages.length - 1;
              const keyId = `${message.id}-v${updateVersion}-${isLastMessage && isThinking ? 'thinking' : 'done'}`;
              
              return (
                <MessageBubble
                  key={keyId}
                  message={message}
                  index={index}
                  totalMessages={messages.length}
                  selectedModel={selectedModel}
                  isStreaming={isStreaming && isLastMessage}
                  currentResponse={currentResponse}
                  deepResearchStage={isLastMessage ? deepResearchStage : undefined}
                  enableReordering={reorderingEnabled && !isStreaming}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                  onDelete={handleDeleteMessage}
                  thinkingContent={isLastMessage ? thinkingContent : undefined}
                  isThinking={isLastMessage ? isThinking : false}
                />
              );
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-border bg-card p-4 flex-shrink-0">
        {/* Connection Status and Recovery */}
        {connectionLost && isStreaming && (
          <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle size={16} className="text-yellow-500" />
                <div>
                  {/* Check if this is a reasoning model or deep research */}
                  {(deepResearchStage?.includes('reasoning') || deepResearchStage?.includes('GPT-5') || deepResearchStage?.includes('thinking')) ? (
                    <>
                      <p className="text-sm font-medium text-yellow-600 dark:text-yellow-300">Deep Reasoning in Progress</p>
                      <p className="text-xs text-yellow-600/80 dark:text-yellow-400/80">
                        The model is performing complex reasoning. This can take several minutes.
                        {lastHeartbeat && (
                          <span> Processing for: {Math.round((Date.now() - lastHeartbeat) / 1000)}s</span>
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-yellow-600 dark:text-yellow-300">Connection Issue</p>
                      <p className="text-xs text-yellow-600/80 dark:text-yellow-400/80">
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
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-md">
            <div className="flex items-center space-x-2">
              <AlertCircle size={16} className="text-red-500" />
              <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
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
              className="w-full px-4 py-3 border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring bg-background text-foreground placeholder:text-muted-foreground"
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
            
            {/* Document Manager */}
            <Button
              type="button"
              onClick={() => setShowDocumentManager(true)}
              variant="ghost"
              title="Manage documents for RAG"
              className="hover:bg-secondary"
            >
              <FileText size={20} className="text-foreground" />
            </Button>
            
            {/* Reorder Messages Button */}
            {messages.length > 1 && (
              <Button
                type="button"
                onClick={() => setReorderingEnabled(!reorderingEnabled)}
                disabled={isStreaming}
                variant={reorderingEnabled ? "secondary" : "ghost"}
                title={reorderingEnabled ? "Done reordering" : "Reorder messages"}
                className="hover:bg-secondary"
              >
                <ArrowUpDown size={20} className="text-foreground" />
              </Button>
            )}
            
            {messages.length > 0 && (
              <Button
                type="button"
                onClick={handleClearHistory}
                disabled={isStreaming}
                variant="ghost"
                title="Clear conversation"
                className="hover:bg-secondary"
              >
                <RefreshCw size={20} className="text-foreground" />
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
                className="px-6 bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
              >
                <Send size={20} />
              </Button>
            )}
          </div>
        </form>
      </div>
      
      {/* Document Manager Modal */}
      <DocumentManager
        isOpen={showDocumentManager}
        onClose={() => setShowDocumentManager(false)}
      />
    </div>
  );
};
