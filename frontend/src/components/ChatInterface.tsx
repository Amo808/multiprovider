import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, RefreshCw, AlertCircle, Square, FileText, Upload, AlertTriangle, Bug } from 'lucide-react';
import { ModelInfo, ModelProvider, SendMessageRequest, GenerationConfig } from '../types';
import { useConversationsContext } from '../contexts/ConversationsContext';
import { useMessageReorder } from '../hooks/useMessageReorder';
import { useThinkingStream } from '../hooks/useThinkingStream';
import { useRAG } from '../hooks/useRAG';
import { ContextViewer } from './ContextViewer';
import { Button } from './ui/button';
import { estimateCostForMessage } from '../lib/pricing';
import { DraggableMessageList } from './DraggableMessageList';
import { VirtualizedMessageList } from './VirtualizedMessageList';
import DocumentManager from './DocumentManager';
import { RAGUnifiedButton } from './RAGUnifiedButton';
import { RAGDebugPanel } from './RAGDebugPanel';
import { RAGPromptsEditor } from './RAGPromptsEditor';
import { ragService } from '../services/rag';
import { DebugPanel, RequestDebugInfo } from './DebugPanel';

// Threshold for switching to virtualized list (performance optimization)
// Lower threshold = faster initial load for chats with many messages
const VIRTUALIZATION_THRESHOLD = 10;

// Prompt size limits for preventing UI freezes
const PROMPT_WARNING_THRESHOLD = 50_000; // 50k chars - show warning
const PROMPT_DISPLAY_LIMIT = 10_000; // 10k chars - switch to hidden mode (show preview only)
const PROMPT_FILE_RECOMMENDED = 100_000; // 100k chars - recommend file upload
const PASTE_CONFIRM_THRESHOLD = 100_000; // 100k chars - confirm before pasting
// No hard limit - large content stored separately, only preview shown

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
  // Hidden large content - stored separately to prevent UI freeze
  const [hiddenContent, setHiddenContent] = useState<string | null>(null);
  const [showDocumentManager, setShowDocumentManager] = useState(false);
  const [promptSizeWarning, setPromptSizeWarning] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  // Debug Panel state
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [lastDebugInfo, setLastDebugInfo] = useState<RequestDebugInfo | null>(null);
  // RAG Debug Panel state
  const [showRAGDebugPanel, setShowRAGDebugPanel] = useState(false);
  const [lastRAGDebugInfo, setLastRAGDebugInfo] = useState<Record<string, any> | null>(null);
  // RAG Prompts Editor state
  const [showRAGPromptsEditor, setShowRAGPromptsEditor] = useState(false);
  // Large paste confirmation modal state
  const [pendingPaste, setPendingPaste] = useState<{
    text: string;
    totalLength: number;
  } | null>(null);

  // Actual message content - either inputValue or hiddenContent
  const actualContent = hiddenContent || inputValue;
  const isHiddenMode = hiddenContent !== null;

  const conversationId = incomingConversationId || `conversation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { conversations, getConversation, sendMessage, clearConversation, stopStreaming, recoverStuckRequest, updateMessages, loadMoreMessages } = useConversationsContext();

  // RAG hook for document search integration
  const {
    ragEnabled,
    setRagEnabled,
    ragMode,
    setRagMode,
    ragSettings,
    setRagSettings,
    documentsCount,
    loadDocuments,
    documents,
    selectedDocumentIds,
    selectDocument,
    deselectDocument,
    clearSelection
  } = useRAG();

  // Toggle document selection for RAG
  const handleDocumentToggle = useCallback((docId: string) => {
    if (selectedDocumentIds.includes(docId)) {
      deselectDocument(docId);
    } else {
      selectDocument(docId);
    }
  }, [selectedDocumentIds, selectDocument, deselectDocument]);

  const handleSelectAllDocuments = useCallback(() => {
    documents.forEach(doc => {
      if (!selectedDocumentIds.includes(doc.id)) {
        selectDocument(doc.id);
      }
    });
  }, [documents, selectedDocumentIds, selectDocument]);

  const handleDeselectAllDocuments = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

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
  // Pagination state
  const hasMore = conversationState?.hasMore || false;
  const isLoadingMore = conversationState?.isLoadingMore || false;
  const totalCount = conversationState?.totalCount || 0;

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

  // Extract RAG debug info from last assistant message for Debug Panel
  useEffect(() => {
    if (messages.length > 0) {
      const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
      if (lastAssistantMsg?.meta?.rag_debug) {
        // Transform rag_debug to RequestDebugInfo format
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ragDebug = lastAssistantMsg.meta.rag_debug as any;
        const collectorData = ragDebug?.collector || ragDebug;

        // Only update if we have meaningful debug data
        if (collectorData && (collectorData.request_id || collectorData.timestamp)) {
          setLastDebugInfo(collectorData as RequestDebugInfo);
        }

        // Also store full RAG debug info for RAGDebugPanel
        setLastRAGDebugInfo(ragDebug);
      }
    }
  }, [messages]);

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

  // Handle input value changes with size validation
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // If in hidden mode, clear it when user starts typing
    if (hiddenContent) {
      setHiddenContent(null);
    }

    const value = e.target.value;
    const len = value.length;

    // Switch to hidden mode for very large content to prevent UI freeze
    if (len > PROMPT_DISPLAY_LIMIT) {
      setHiddenContent(value);
      setInputValue(`[Large content: ${(len / 1000).toFixed(1)}k chars]\n\n${value.slice(0, 500)}...`);
      setPromptSizeWarning(`Large content (${(len / 1000).toFixed(1)}k chars) - showing preview only`);
      return;
    }

    // Warning levels
    if (len > PROMPT_FILE_RECOMMENDED) {
      setPromptSizeWarning(`Large prompt (${(len / 1000).toFixed(1)}k chars). Consider using "Load from file" for better performance.`);
    } else if (len > PROMPT_WARNING_THRESHOLD) {
      setPromptSizeWarning(`Prompt size: ${(len / 1000).toFixed(1)}k characters`);
    } else {
      setPromptSizeWarning(null);
    }

    setInputValue(value);
  }, [hiddenContent]);

  // Handle paste with confirmation for very large content
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData('text');
    if (!pastedText) return;

    const currentLength = inputValue.length;
    const pasteLength = pastedText.length;
    const totalLength = currentLength + pasteLength;

    // For very large pastes, show confirmation modal
    if (pasteLength > PASTE_CONFIRM_THRESHOLD) {
      e.preventDefault(); // Prevent default paste
      setPendingPaste({
        text: pastedText,
        totalLength
      });
      return;
    }

    // For large but not huge pastes, let it through but show warning
    // (the onChange handler will set the warning)
  }, [inputValue.length]);

  // Confirm large paste - store in hidden mode if too large for display
  const handleConfirmPaste = useCallback(() => {
    if (!pendingPaste) return;

    const { text, totalLength } = pendingPaste;
    const currentContent = hiddenContent || inputValue;
    const fullContent = currentContent + text;

    // For very large content, use hidden mode
    if (totalLength > PROMPT_DISPLAY_LIMIT) {
      setHiddenContent(fullContent);
      setInputValue(`[Large content: ${(fullContent.length / 1000).toFixed(1)}k chars]\n\n${fullContent.slice(0, 500)}...`);
      setPromptSizeWarning(`Large content (${(fullContent.length / 1000).toFixed(1)}k chars) stored - showing preview only`);
    } else {
      setHiddenContent(null);
      setInputValue(fullContent);
      if (totalLength > PROMPT_FILE_RECOMMENDED) {
        setPromptSizeWarning(`Large message (${(totalLength / 1000).toFixed(1)}k chars). Consider using "Load from file".`);
      } else if (totalLength > PROMPT_WARNING_THRESHOLD) {
        setPromptSizeWarning(`Message size: ${(totalLength / 1000).toFixed(1)}k characters`);
      }
    }

    setPendingPaste(null);
  }, [pendingPaste, inputValue, hiddenContent]);

  // Cancel large paste
  const handleCancelPaste = useCallback(() => {
    setPendingPaste(null);
  }, []);

  // Paste with truncation (truncate to recommended size)
  const handlePasteTruncated = useCallback(() => {
    if (!pendingPaste) return;

    const currentContent = hiddenContent || inputValue;
    const maxPaste = PROMPT_FILE_RECOMMENDED - currentContent.length;
    if (maxPaste <= 0) {
      setPromptSizeWarning('Input is already at recommended limit. Clear some text first.');
      setPendingPaste(null);
      return;
    }

    const truncatedText = pendingPaste.text.slice(0, maxPaste);
    const newContent = currentContent + truncatedText;

    if (newContent.length > PROMPT_DISPLAY_LIMIT) {
      setHiddenContent(newContent);
      setInputValue(`[Large content: ${(newContent.length / 1000).toFixed(1)}k chars]\n\n${newContent.slice(0, 500)}...`);
    } else {
      setHiddenContent(null);
      setInputValue(newContent);
    }

    setPromptSizeWarning(`Pasted ${(truncatedText.length / 1000).toFixed(1)}k of ${(pendingPaste.text.length / 1000).toFixed(1)}k characters (truncated to recommended size)`);
    setPendingPaste(null);
  }, [pendingPaste, inputValue, hiddenContent]);

  // Load prompt from text file
  const handleLoadPromptFromFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Only allow text files
    const allowedTypes = ['text/plain', 'text/markdown', 'application/json', 'text/csv', 'text/html', 'text/xml'];
    const isText = allowedTypes.includes(file.type) ||
      file.name.endsWith('.txt') ||
      file.name.endsWith('.md') ||
      file.name.endsWith('.json') ||
      file.name.endsWith('.py') ||
      file.name.endsWith('.js') ||
      file.name.endsWith('.ts') ||
      file.name.endsWith('.html') ||
      file.name.endsWith('.css') ||
      file.name.endsWith('.xml') ||
      file.name.endsWith('.yaml') ||
      file.name.endsWith('.yml') ||
      file.name.endsWith('.csv');

    if (!isText) {
      alert('Please select a text file (.txt, .md, .json, .py, .js, etc.)');
      return;
    }

    // Size limit for file - 10MB to allow large documents
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      alert(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`);
      return;
    }

    setIsLoadingFile(true);
    setPromptSizeWarning(null);

    try {
      const text = await file.text();
      const len = text.length;

      // Use hidden mode for large content
      if (len > PROMPT_DISPLAY_LIMIT) {
        setHiddenContent(text);
        setInputValue(`[Large file: ${file.name} - ${(len / 1000).toFixed(1)}k chars]\n\n${text.slice(0, 500)}...`);
        setPromptSizeWarning(`Loaded ${(len / 1000).toFixed(1)}k characters from "${file.name}" - showing preview only`);
      } else if (len > PROMPT_FILE_RECOMMENDED) {
        setHiddenContent(null);
        setPromptSizeWarning(`Loaded ${(len / 1000).toFixed(1)}k characters from "${file.name}"`);
        setInputValue(text);
      } else {
        setHiddenContent(null);
        setPromptSizeWarning(`Loaded ${len.toLocaleString()} characters from "${file.name}"`);
        setInputValue(text);
      }

      // Clear file input for re-selection
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('[ChatInterface] Failed to read file:', err);
      alert('Failed to read file. Please try again.');
    } finally {
      setIsLoadingFile(false);
    }
  }, []);

  // File drop handler - uploads files for RAG (non-blocking)
  const handleFileDrop = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setUploadingFiles(true);

    // Process uploads with better error handling
    const results: { success: string[]; failed: string[] } = { success: [], failed: [] };

    try {
      for (const file of files) {
        try {
          await ragService.uploadDocument(file);
          results.success.push(file.name);
          console.log(`[ChatInterface] Uploaded document: ${file.name}`);
        } catch (err) {
          results.failed.push(file.name);
          console.error(`[ChatInterface] Failed to upload ${file.name}:`, err);
        }
      }

      // Show result notification
      if (results.failed.length === 0) {
        // All succeeded
        const msg = results.success.length === 1
          ? `Uploaded: ${results.success[0]}`
          : `Uploaded ${results.success.length} files`;
        // Use non-blocking notification instead of alert
        console.log(`[ChatInterface] ${msg}`);
      } else if (results.success.length === 0) {
        // All failed
        alert(`Failed to upload ${results.failed.length} file(s). Please try again.`);
      } else {
        // Mixed results
        alert(`Uploaded ${results.success.length} file(s). Failed: ${results.failed.join(', ')}`);
      }

      // Refresh documents list
      loadDocuments();
    } catch (err) {
      console.error('[ChatInterface] File upload error:', err);
      alert('Failed to upload files. Please try again.');
    } finally {
      setUploadingFiles(false);
    }
  }, [loadDocuments]);

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

  // Auto-scroll to bottom (debounced to prevent performance issues)
  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages.length, currentResponse.length > 0]);

  // Auto-resize textarea (debounced for large inputs)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        // Limit max height to prevent freeze with huge pastes
        const newHeight = Math.min(textareaRef.current.scrollHeight, 300);
        textareaRef.current.style.height = `${newHeight}px`;
      }
    }, 50);
    return () => clearTimeout(timer);
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

    // Use actual content (hidden or visible)
    const contentToSend = actualContent;
    if (!contentToSend.trim() || isStreaming) return;
    if (!selectedModel || !selectedProvider) {
      alert('Please select a model first');
      return;
    }

    const messageText = contentToSend.trim();
    const request: SendMessageRequest = {
      message: messageText,
      provider: selectedProvider,
      model: selectedModel.id,
      conversation_id: conversationId,
      config: generationConfig,
      ...(systemPrompt && systemPrompt.trim() ? { system_prompt: systemPrompt.trim() } : {}),
      // Use ragSettings for all RAG parameters including new chunk_mode and orchestrator
      rag: {
        enabled: ragEnabled && documentsCount > 0,
        mode: ragEnabled ? ragMode : 'off',
        document_ids: selectedDocumentIds.length > 0 ? selectedDocumentIds : undefined,

        // === CHUNK MODE SETTINGS ===
        chunk_mode: ragSettings.chunk_mode,
        max_chunks: ragSettings.max_chunks,
        chunk_percent: ragSettings.chunk_percent,
        min_chunks: ragSettings.min_chunks,
        max_chunks_limit: ragSettings.max_chunks_limit,

        // === SEARCH SETTINGS ===
        min_similarity: ragSettings.min_similarity,
        use_rerank: ragSettings.use_rerank,
        keyword_weight: ragSettings.keyword_weight,
        semantic_weight: ragSettings.semantic_weight,
        include_metadata: ragSettings.include_metadata,
        debug_mode: ragSettings.debug_mode,

        // === ORCHESTRATOR SETTINGS ===
        orchestrator: ragSettings.orchestrator ? {
          include_history: ragSettings.orchestrator.include_history,
          history_limit: ragSettings.orchestrator.history_limit,
          include_memory: ragSettings.orchestrator.include_memory,
          auto_retrieve: ragSettings.orchestrator.auto_retrieve,
          adaptive_chunks: ragSettings.orchestrator.adaptive_chunks,
          enable_web_search: ragSettings.orchestrator.enable_web_search,
          enable_code_execution: ragSettings.orchestrator.enable_code_execution,
        } : undefined
      }
    };

    // Debug logging for system prompt and RAG
    console.log('[ChatInterface] Request info:', {
      hasSystemPrompt: !!systemPrompt,
      systemPromptLength: systemPrompt?.length || 0,
      systemPromptPreview: systemPrompt?.substring(0, 100) || 'EMPTY',
      requestHasSystemPrompt: !!request.system_prompt,
      requestSystemPromptLength: request.system_prompt?.length || 0,
      ragEnabled,
      documentsCount,
      ragConfig: request.rag,
      selectedDocumentIds: selectedDocumentIds.length,
      messageLength: messageText.length,
      isHiddenMode
    });

    // Clear both visible and hidden content
    setInputValue('');
    setHiddenContent(null);
    setPromptSizeWarning(null);

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

    // Only count if entering with files
    if (e.dataTransfer.types.includes('Files')) {
      dragCounterRef.current++;
      setIsFileDragOver(true);
    }
  }, []);

  const handleGlobalDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current--;
    // Only hide when fully left the container
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsFileDragOver(false);
    }
  }, []);

  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleGlobalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Reset state immediately
    dragCounterRef.current = 0;
    setIsFileDragOver(false);

    // Get files
    const files = Array.from(e.dataTransfer.files);
    console.log('[ChatInterface] Drop event, files:', files.length, files.map(f => f.name));

    if (files.length > 0) {
      // Show confirmation modal
      setPendingFiles(files);
    }
  }, []);

  const confirmFileUpload = useCallback(async () => {
    if (pendingFiles.length === 0) return;

    // Clear pending files immediately (closes modal)
    const filesToUpload = [...pendingFiles];
    setPendingFiles([]);

    // Upload in background
    await handleFileDrop(filesToUpload);
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
      {/* Global File Drop Overlay - captures drop events */}
      {isFileDragOver && (
        <div
          className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200"
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; }}
          onDrop={handleGlobalDrop}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Only close if leaving the overlay entirely (not entering a child)
            if (e.currentTarget === e.target) {
              dragCounterRef.current = 0;
              setIsFileDragOver(false);
            }
          }}
        >
          <div className="bg-card border-2 border-dashed border-primary rounded-2xl p-12 flex flex-col items-center gap-4 shadow-2xl pointer-events-none">
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
          <>
            {/* Load More Button - shown at the top when there are more messages */}
            {hasMore && (
              <div className="flex justify-center py-4">
                <button
                  onClick={() => loadMoreMessages(conversationId)}
                  disabled={isLoadingMore}
                  className="px-4 py-2 text-sm bg-secondary hover:bg-secondary/80 text-foreground rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isLoadingMore ? (
                    <>
                      <div className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      Load older messages
                      {totalCount > 0 && <span className="text-muted-foreground">({messages.length}/{totalCount})</span>}
                    </>
                  )}
                </button>
              </div>
            )}
            {/* Use virtualized list for performance when there are many messages */}
            {messages.length > VIRTUALIZATION_THRESHOLD ? (
              <VirtualizedMessageList
                messages={messages}
                selectedModel={selectedModel}
                isStreaming={isStreaming}
                currentResponse={currentResponse}
                deepResearchStage={deepResearchStage}
                thinkingContent={thinkingContent}
                isThinking={isThinking}
                updateVersion={updateVersion}
                onDelete={handleDeleteMessage}
                onBranchFrom={onBranchFrom ? handleBranchFrom : undefined}
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={() => loadMoreMessages(conversationId)}
              />
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
          </>
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
          <div className="mb-3 p-2.5 sm:p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg max-w-3xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-start sm:items-center gap-2">
                <AlertCircle size={16} className="text-yellow-500 flex-shrink-0 mt-0.5 sm:mt-0" />
                <div className="min-w-0">
                  {/* Check if this is a reasoning model or deep research */}
                  {(deepResearchStage?.includes('reasoning') || deepResearchStage?.includes('GPT-5') || deepResearchStage?.includes('thinking')) ? (
                    <>
                      <p className="text-xs sm:text-sm font-medium text-yellow-600 dark:text-yellow-300">Deep Reasoning in Progress</p>
                      <p className="text-[10px] sm:text-xs text-yellow-600/80 dark:text-yellow-400/80">
                        Complex reasoning - may take several minutes.
                        {lastHeartbeat && (
                          <span> ({Math.round((Date.now() - lastHeartbeat) / 1000)}s)</span>
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs sm:text-sm font-medium text-yellow-600 dark:text-yellow-300">Connection Issue</p>
                      <p className="text-[10px] sm:text-xs text-yellow-600/80 dark:text-yellow-400/80">
                        No response for a while.
                        {lastHeartbeat && (
                          <span> ({Math.round((Date.now() - lastHeartbeat) / 1000)}s ago)</span>
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
                  className="px-3 py-1.5 text-xs bg-yellow-600 hover:bg-yellow-700 text-white rounded-md transition-colors flex-shrink-0 self-end sm:self-auto"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-3 p-2.5 sm:p-3 bg-red-500/20 border border-red-500/50 rounded-lg max-w-3xl mx-auto">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm text-red-600 dark:text-red-300 break-words overflow-hidden">{error}</p>
            </div>
          </div>
        )}

        {/* ChatGPT-style input */}
        <div className="max-w-3xl mx-auto w-full">
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative flex items-end bg-secondary/50 border border-border rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:border-ring transition-all">
              {/* Hidden file input for prompt loading */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.json,.py,.js,.ts,.tsx,.jsx,.html,.css,.xml,.yaml,.yml,.csv,.sql,.sh,.bash,.ps1,.bat,.c,.cpp,.h,.hpp,.java,.rb,.go,.rs,.swift,.kt,.php"
                onChange={handleLoadPromptFromFile}
                className="hidden"
              />

              {/* Left buttons - shrink on mobile */}
              <div className="flex items-center pl-2 sm:pl-3 pb-3 gap-1 flex-shrink-0 max-w-[50%] sm:max-w-none">
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoadingFile || isStreaming}
                  variant="ghost"
                  size="sm"
                  title="Load prompt from file"
                  className="h-8 w-8 p-0 rounded-lg hover:bg-secondary flex-shrink-0"
                >
                  {isLoadingFile ? (
                    <RefreshCw size={18} className="text-muted-foreground animate-spin" />
                  ) : (
                    <Upload size={18} className="text-muted-foreground" />
                  )}
                </Button>

                <Button
                  type="button"
                  onClick={() => {
                    setShowDocumentManager(true);
                    loadDocuments(); // Refresh documents when opening manager
                  }}
                  variant="ghost"
                  size="sm"
                  title="Manage documents"
                  className="h-8 w-8 p-0 rounded-lg hover:bg-secondary"
                >
                  <FileText size={18} className="text-muted-foreground" />
                </Button>

                {/* RAG Unified Button - only show if documents exist */}
                {documentsCount > 0 && (
                  <RAGUnifiedButton
                    enabled={ragEnabled}
                    onEnableChange={setRagEnabled}
                    mode={ragMode}
                    onModeChange={setRagMode}
                    settings={ragSettings}
                    onSettingsChange={setRagSettings}
                    documentsCount={documentsCount}
                    documents={documents.map(d => ({ id: d.id, filename: d.name }))}
                    selectedDocumentIds={selectedDocumentIds}
                    onDocumentToggle={handleDocumentToggle}
                    onSelectAll={handleSelectAllDocuments}
                    onDeselectAll={handleDeselectAllDocuments}
                    onOpenDebug={() => setShowRAGDebugPanel(true)}
                    onOpenPromptsEditor={() => setShowRAGPromptsEditor(true)}
                  />
                )}
              </div>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={
                  selectedModel
                    ? ragEnabled && documentsCount > 0
                      ? "Message... (RAG enabled)"
                      : "Message..."
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
                  ragDebugInfo={lastDebugInfo?.rag_pipeline ? {
                    intent: lastDebugInfo.rag_pipeline.intent_analysis ? {
                      query: lastDebugInfo.rag_pipeline.intent_analysis.original_query,
                      detected_intent: lastDebugInfo.rag_pipeline.intent_analysis.detected_task,
                      keywords: lastDebugInfo.rag_pipeline.intent_analysis.detected_sections
                    } : undefined,
                    structure: lastDebugInfo.rag_pipeline.document_structure ? {
                      total_chunks: lastDebugInfo.rag_pipeline.document_structure.total_chunks,
                      chapters: lastDebugInfo.rag_pipeline.document_structure.detected_chapters?.map(c => `${c.number}: ${c.title}`),
                      document_type: lastDebugInfo.rag_pipeline.document_structure.detected_structure_type
                    } : undefined,
                    retrieval: lastDebugInfo.rag_pipeline.retrieval ? {
                      query: lastDebugInfo.rag_pipeline.retrieval.generated_queries?.[0] || '',
                      top_k: lastDebugInfo.rag_pipeline.chunks?.total_retrieved || 0,
                      results_count: lastDebugInfo.rag_pipeline.chunks?.total_retrieved || 0
                    } : undefined,
                    chunks: lastDebugInfo.rag_pipeline.chunks?.items?.map(chunk => ({
                      id: `chunk-${chunk.chunk_index}`,
                      content: chunk.full_content || chunk.content_preview,
                      metadata: {
                        source: chunk.document_name,
                        chapter: chunk.chapter,
                        score: chunk.similarity_score
                      },
                      similarity_score: chunk.similarity_score
                    })),
                    context: lastDebugInfo.rag_pipeline.context_building ? {
                      total_tokens: lastDebugInfo.rag_pipeline.context_building.final_context_chars ? Math.ceil(lastDebugInfo.rag_pipeline.context_building.final_context_chars / 4) : undefined,
                      context_text: lastDebugInfo.rag_pipeline.context_building.full_context || lastDebugInfo.rag_pipeline.context_building.context_preview
                    } : undefined,
                    timing: {
                      retrieval_ms: lastDebugInfo.rag_pipeline.retrieval?.latency_ms,
                      total_ms: lastDebugInfo.summary?.total_latency_ms
                    }
                  } : undefined}
                  ragContext={
                    // Try to get RAG context from various sources
                    // 1. From debug collector's context_building
                    lastDebugInfo?.rag_pipeline?.context_building?.full_context
                    // 2. From context_building preview
                    || lastDebugInfo?.rag_pipeline?.context_building?.context_preview
                    // 3. From last assistant message's meta (set during streaming)
                    || messages.slice().reverse().find(m => m.role === 'assistant' && m.meta?.rag_context_full)?.meta?.rag_context_full as string
                    // 4. Empty string - ContextViewer will try to extract from systemPrompt
                    || ''
                  }
                />

                {/* Debug Panel Button - show when RAG is enabled and we have debug info */}
                {lastDebugInfo && (
                  <Button
                    type="button"
                    onClick={() => setShowDebugPanel(true)}
                    variant="ghost"
                    size="sm"
                    title="View RAG Debug Info"
                    className="h-8 w-8 p-0 rounded-lg hover:bg-secondary"
                  >
                    <Bug size={16} className="text-muted-foreground" />
                  </Button>
                )}

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

            {/* Prompt size warning */}
            {promptSizeWarning && (
              <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <AlertTriangle size={14} className="text-yellow-500 flex-shrink-0" />
                <span className="text-xs text-yellow-600 dark:text-yellow-400">{promptSizeWarning}</span>
                <button
                  type="button"
                  onClick={() => setPromptSizeWarning(null)}
                  className="ml-auto text-yellow-500 hover:text-yellow-600 text-xs font-medium"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Hint text */}
            <p className="text-xs text-muted-foreground text-center mt-2">
              Press Enter to send, Shift+Enter for new line • Click <Upload size={12} className="inline" /> to load prompt from file
            </p>
          </form>
        </div>
      </div>

      {/* Document Manager Modal */}
      <DocumentManager
        isOpen={showDocumentManager}
        onClose={() => setShowDocumentManager(false)}
      />

      {/* Large Paste Confirmation Modal */}
      {pendingPaste && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-background border border-border rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-yellow-500/10">
                <AlertTriangle className="h-6 w-6 text-yellow-500" />
              </div>
              <h3 className="text-lg font-semibold">Large Content Detected</h3>
            </div>

            <div className="space-y-3 mb-6">
              <p className="text-sm text-muted-foreground">
                You're about to paste <span className="font-medium text-foreground">{(pendingPaste.text.length / 1000).toFixed(1)}k characters</span>.
              </p>
              <p className="text-sm text-muted-foreground">
                Total message size will be: <span className="font-medium text-foreground">{(pendingPaste.totalLength / 1000).toFixed(1)}k characters</span>
              </p>
              {pendingPaste.totalLength > PROMPT_DISPLAY_LIMIT && (
                <p className="text-sm text-blue-500">
                  📦 Large content will be stored in hidden mode (preview only in textarea).
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                💡 Content of any size is supported. Large text shows as preview only.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button
                  onClick={handleConfirmPaste}
                  className="flex-1"
                >
                  Paste All ({(pendingPaste.text.length / 1000).toFixed(0)}k)
                </Button>
                <Button
                  onClick={handlePasteTruncated}
                  variant="outline"
                  className="flex-1"
                  disabled={inputValue.length >= PROMPT_FILE_RECOMMENDED}
                >
                  Paste {(PROMPT_FILE_RECOMMENDED / 1000).toFixed(0)}k max
                </Button>
              </div>
              <Button
                onClick={handleCancelPaste}
                variant="ghost"
                className="w-full text-muted-foreground"
              >
                Cancel
              </Button>
            </div>

            {/* Preview of pasted content */}
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Preview (first 200 chars):</p>
              <p className="text-xs font-mono text-foreground/80 line-clamp-3 whitespace-pre-wrap break-all">
                {pendingPaste.text.slice(0, 200)}{pendingPaste.text.length > 200 ? '...' : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* RAG Debug Panel */}
      <DebugPanel
        debugInfo={lastDebugInfo}
        isOpen={showDebugPanel}
        onClose={() => setShowDebugPanel(false)}
      />

      {/* RAG Prompts & Settings Panel */}
      <RAGDebugPanel
        isOpen={showRAGDebugPanel}
        onClose={() => setShowRAGDebugPanel(false)}
        currentSettings={{
          mode: ragMode,
          max_chunks: ragSettings.max_chunks,
          min_similarity: ragSettings.min_similarity,
          keyword_weight: ragSettings.keyword_weight,
          semantic_weight: ragSettings.semantic_weight,
          use_rerank: ragSettings.use_rerank,
          // NEW: Chunk mode settings
          chunk_mode: ragSettings.chunk_mode,
          chunk_percent: ragSettings.chunk_percent,
          min_chunks: ragSettings.min_chunks,
          max_chunks_limit: ragSettings.max_chunks_limit,
          // NEW: Orchestrator settings
          orchestrator: ragSettings.orchestrator,
        }}
        lastDebugInfo={lastRAGDebugInfo || undefined}
      />

      {/* RAG Prompts Editor - для редактирования промптов */}
      <RAGPromptsEditor
        isOpen={showRAGPromptsEditor}
        onClose={() => setShowRAGPromptsEditor(false)}
      />
    </div>
  );
};
