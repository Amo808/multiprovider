import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, RefreshCw, AlertCircle, Square, FileText } from 'lucide-react';
import { ModelInfo, ModelProvider, SendMessageRequest, GenerationConfig } from '../types';
import { useConversationsContext } from '../contexts/ConversationsContext';
import { useMessageReorder } from '../hooks/useMessageReorder';
import { useThinkingStream } from '../hooks/useThinkingStream';
import { ContextViewer } from './ContextViewer';
import { Button } from './ui/button';
import { estimateCostForMessage } from '../lib/pricing';
import { DraggableMessageList } from './DraggableMessageList';
import DocumentManager from './DocumentManager';
import { ragService } from '../services/rag';

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
  onBranchFrom?: (conversationId: string, messageIndex: number) => void;
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
  onConfigChange: _onConfigChange, // kept for API compatibility
  onBranchFrom
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
  const { deleteMessage, moveTo } = useMessageReorder();
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [isReordering, setIsReordering] = useState(false); // Prevent race conditions

  // Drag & Drop reorder handler - moves message from one position to another
  const handleReorder = useCallback(async (fromIndex: number, toIndex: number) => {
    console.log('[ChatInterface] handleReorder called:', { fromIndex, toIndex, messagesLength: messages.length });
    
    // CRITICAL: Block concurrent reorder operations to prevent race conditions
    if (isReordering) {
      console.log('[ChatInterface] Reorder blocked: another reorder in progress');
      return;
    }
    
    if (fromIndex === toIndex || isStreaming) {
      console.log('[ChatInterface] Reorder skipped:', { sameIndex: fromIndex === toIndex, isStreaming });
      return;
    }
    
    // SAFETY: Don't allow reordering with no messages
    if (messages.length === 0) {
      console.error('[ChatInterface] Reorder blocked: no messages to reorder');
      return;
    }
    
    // Validate indices
    if (fromIndex < 0 || fromIndex >= messages.length || toIndex < 0 || toIndex >= messages.length) {
      console.error('[ChatInterface] Reorder blocked: invalid indices', { fromIndex, toIndex, max: messages.length - 1 });
      return;
    }
    
    setIsReordering(true);
    
    // Save original messages for rollback
    const originalMessages = [...messages];
    
    // Clone messages array and perform reorder
    const newMessages = [...messages];
    const [movedMessage] = newMessages.splice(fromIndex, 1);
    newMessages.splice(toIndex, 0, movedMessage);
    
    console.log('[ChatInterface] Reordered messages:', {
      from: fromIndex,
      to: toIndex,
      movedContent: movedMessage.content.substring(0, 50),
      newOrder: newMessages.map((m, i) => `${i}: ${m.content.substring(0, 20)}...`)
    });
    
    // Update UI immediately (optimistic update)
    if (updateMessages) {
      updateMessages(conversationId, newMessages);
    }
    
    // Persist to backend using move_to API
    try {
      const result = await moveTo(conversationId, fromIndex, toIndex);
      if (result && result.length > 0) {
        console.log('[ChatInterface] Reorder saved to backend, messages:', result.length);
        // Check if backend result matches our expectation
        const backendOrder = result.map((m, i) => `${i}: ${m.content.substring(0, 20)}...`);
        console.log('[ChatInterface] Backend order:', backendOrder);
        // Use backend result as source of truth
        if (updateMessages) {
          updateMessages(conversationId, result);
        }
      } else if (result && result.length === 0) {
        console.error('[ChatInterface] Backend returned empty, reverting');
        if (updateMessages) {
          updateMessages(conversationId, originalMessages);
        }
      } else {
        console.error('[ChatInterface] Failed to save, reverting');
        if (updateMessages) {
          updateMessages(conversationId, originalMessages);
        }
      }
    } catch (err) {
      console.error('[ChatInterface] Error saving reorder:', err);
      if (updateMessages) {
        updateMessages(conversationId, originalMessages);
      }
    } finally {
      setIsReordering(false);
    }
  }, [messages, conversationId, updateMessages, isStreaming, moveTo, isReordering]);

  // File drop handler - uploads files for RAG
  const handleFileDrop = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    
    setUploadingFiles(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        
        await ragService.uploadDocument(file);
        console.log(`[ChatInterface] Uploaded document: ${file.name}`);
      }
      
      // Show success toast or notification
      alert(`Successfully uploaded ${files.length} file${files.length > 1 ? 's' : ''}`);
    } catch (err) {
      console.error('[ChatInterface] File upload error:', err);
      alert('Failed to upload files. Please try again.');
    } finally {
      setUploadingFiles(false);
    }
  }, []);

  const handleDeleteMessage = async (index: number) => {
    // Block if reordering in progress
    if (isReordering) {
      console.log('[ChatInterface] Delete blocked: reorder in progress');
      return;
    }
    // No confirmation needed - instant delete with visual feedback
    const newMessages = await deleteMessage(conversationId, index);
    if (newMessages && updateMessages) {
      updateMessages(conversationId, newMessages);
    }
  };

  // Handle branching from a specific message - creates new conversation with history up to that point
  const handleBranchFrom = useCallback((index: number) => {
    if (onBranchFrom) {
      onBranchFrom(conversationId, index);
    }
  }, [conversationId, onBranchFrom]);

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
    
    // Debug logging for system prompt
    console.log('[ChatInterface] System prompt info:', {
      hasSystemPrompt: !!systemPrompt,
      systemPromptLength: systemPrompt?.length || 0,
      systemPromptPreview: systemPrompt?.substring(0, 100) || 'EMPTY',
      requestHasSystemPrompt: !!request.system_prompt,
      requestSystemPromptLength: request.system_prompt?.length || 0
    });

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

  // Global file drag & drop state for empty chat
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const dragCounterRef = useRef(0);

  const handleGlobalDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsFileDragOver(true);
    }
  }, []);

  const handleGlobalDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsFileDragOver(false);
    }
  }, []);

  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleGlobalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsFileDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setPendingFiles(files);
    }
  }, []);

  const confirmFileUpload = useCallback(async () => {
    if (pendingFiles.length === 0) return;
    await handleFileDrop(pendingFiles);
    setPendingFiles([]);
  }, [pendingFiles, handleFileDrop]);

  const cancelFileUpload = useCallback(() => {
    setPendingFiles([]);
  }, []);

  return (
    <div 
      className="flex flex-col h-full min-h-0 bg-background relative"
      onDragEnter={handleGlobalDragEnter}
      onDragLeave={handleGlobalDragLeave}
      onDragOver={handleGlobalDragOver}
      onDrop={handleGlobalDrop}
    >
      {/* Global File Drop Overlay */}
      {isFileDragOver && (
        <div className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none animate-in fade-in duration-200">
          <div className="bg-card border-2 border-dashed border-primary rounded-2xl p-12 flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
              <FileText className="w-10 h-10 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold text-foreground">Drop files to upload</p>
              <p className="text-sm text-muted-foreground mt-1">
                PDF, TXT, DOCX, MD — for RAG document search
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pending Files Confirmation Modal */}
      {pendingFiles.length > 0 && (
        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-xl p-6 shadow-2xl max-w-md w-full mx-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Upload {pendingFiles.length} file{pendingFiles.length > 1 ? 's' : ''}?</h3>
              <button
                onClick={cancelFileUpload}
                className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-2 max-h-60 overflow-y-auto mb-6">
              {pendingFiles.map((file, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
                  <FileText className="w-5 h-5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={cancelFileUpload}
                className="flex-1 px-4 py-2 border border-border rounded-lg hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmFileUpload}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto min-h-0 ios-scroll">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-lg mx-auto px-6">
              {/* Logo/Icon */}
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <Bot size={32} className="text-primary" />
              </div>
              
              <h1 className="text-3xl font-semibold text-foreground mb-3">
                How can I help you today?
              </h1>
              
              {selectedModel && selectedProvider ? (
                <p className="text-muted-foreground mb-8">
                  Using <span className="font-medium text-foreground">{selectedModel.display_name}</span>
                </p>
              ) : (
                <p className="text-muted-foreground mb-8">
                  Select a model to get started
                </p>
              )}

              {/* Quick suggestions - ChatGPT style */}
              <div className="grid grid-cols-2 gap-3 text-left">
                <button 
                  onClick={() => setInputValue("Explain quantum computing in simple terms")}
                  className="p-4 rounded-xl border border-border hover:bg-secondary/50 transition-colors text-sm text-left"
                >
                  <span className="text-foreground font-medium">Explain quantum computing</span>
                  <span className="text-muted-foreground block mt-1">in simple terms</span>
                </button>
                <button 
                  onClick={() => setInputValue("Help me write a professional email")}
                  className="p-4 rounded-xl border border-border hover:bg-secondary/50 transition-colors text-sm text-left"
                >
                  <span className="text-foreground font-medium">Help me write</span>
                  <span className="text-muted-foreground block mt-1">a professional email</span>
                </button>
                <button 
                  onClick={() => setInputValue("What are the best practices for React?")}
                  className="p-4 rounded-xl border border-border hover:bg-secondary/50 transition-colors text-sm text-left"
                >
                  <span className="text-foreground font-medium">Best practices</span>
                  <span className="text-muted-foreground block mt-1">for React development</span>
                </button>
                <button 
                  onClick={() => setInputValue("Create a Python script that")}
                  className="p-4 rounded-xl border border-border hover:bg-secondary/50 transition-colors text-sm text-left"
                >
                  <span className="text-foreground font-medium">Create a Python script</span>
                  <span className="text-muted-foreground block mt-1">to automate tasks</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <DraggableMessageList
            messages={messages}
            selectedModel={selectedModel}
            isStreaming={isStreaming}
            currentResponse={currentResponse}
            deepResearchStage={deepResearchStage}
            thinkingContent={thinkingContent}
            isThinking={isThinking}
            updateVersion={updateVersion}
            onReorder={handleReorder}
            onDelete={handleDeleteMessage}
            onBranchFrom={onBranchFrom ? handleBranchFrom : undefined}
            onFileDrop={handleFileDrop}
          />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* File Upload Progress Indicator */}
      {uploadingFiles && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 shadow-lg flex items-center gap-4">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Uploading files...</span>
          </div>
        </div>
      )}

      {/* Input Area - ChatGPT style */}
      <div className="border-t border-border bg-gradient-to-t from-background to-transparent pt-4 pb-4 px-3 sm:px-4 flex-shrink-0" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
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

        {/* ChatGPT-style input */}
        <div className="max-w-3xl mx-auto w-full">
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative flex items-end bg-secondary/50 border border-border rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:border-ring transition-all">
              {/* Left buttons */}
              <div className="flex items-center pl-3 pb-3 gap-1">
                <Button
                  type="button"
                  onClick={() => setShowDocumentManager(true)}
                  variant="ghost"
                  size="sm"
                  title="Attach files"
                  className="h-8 w-8 p-0 rounded-lg hover:bg-secondary"
                >
                  <FileText size={18} className="text-muted-foreground" />
                </Button>
              </div>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedModel 
                    ? "Message..."
                    : "Select a model first..."
                }
                className="flex-1 bg-transparent border-0 resize-none focus:outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground py-3 px-2 text-base leading-6"
                rows={1}
                style={{ minHeight: '24px', maxHeight: '200px' }}
                disabled={!selectedModel || isStreaming}
              />

              {/* Right buttons */}
              <div className="flex items-center pr-2 pb-2 gap-1">
                {/* Context Viewer */}
                <ContextViewer
                  messages={messages}
                  currentInput={inputValue}
                  generationConfig={generationConfig}
                  systemPrompt={systemPrompt}
                />
                
                {messages.length > 0 && (
                  <Button
                    type="button"
                    onClick={handleClearHistory}
                    disabled={isStreaming}
                    variant="ghost"
                    size="sm"
                    title="Clear conversation"
                    className="h-8 w-8 p-0 rounded-lg hover:bg-secondary"
                  >
                    <RefreshCw size={16} className="text-muted-foreground" />
                  </Button>
                )}
                
                {isStreaming ? (
                  <Button
                    type="button"
                    onClick={() => stopStreaming(conversationId)}
                    variant="ghost"
                    size="sm"
                    title="Stop"
                    className="h-8 w-8 p-0 rounded-lg bg-destructive/10 hover:bg-destructive/20"
                  >
                    <Square size={16} className="text-destructive" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={!canSend}
                    size="sm"
                    title="Send"
                    className="h-8 w-8 p-0 rounded-lg bg-foreground text-background hover:bg-foreground/90 disabled:opacity-30 disabled:bg-muted disabled:text-muted-foreground"
                  >
                    <Send size={16} />
                  </Button>
                )}
              </div>
            </div>
            
            {/* Hint text */}
            <p className="text-xs text-muted-foreground text-center mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </form>
        </div>
      </div>
      
      {/* Document Manager Modal */}
      <DocumentManager
        isOpen={showDocumentManager}
        onClose={() => setShowDocumentManager(false)}
      />
    </div>
  );
};
