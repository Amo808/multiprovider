import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react';
import { Message, SendMessageRequest, ChatResponse } from '../types';
import { apiClient } from '../services/api';

interface ConversationState {
  messages: Message[];
  isStreaming: boolean;
  error: string | null;
  currentResponse: string;
  loaded: boolean;
  deepResearchStage?: string;
  lastHeartbeat?: number;
  connectionLost?: boolean;
  thinkingContent?: string;
  isThinking?: boolean;
  updateVersion?: number; // Incremented on each update to force re-renders
  totalCount?: number; // Total messages in conversation
  hasMore?: boolean; // Whether more messages can be loaded
  isLoadingMore?: boolean; // Loading older messages
}

interface ConversationsState {
  [conversationId: string]: ConversationState;
}

// Ref-based storage for thinking content to avoid closure issues
const thinkingContentRefs: Record<string, string> = {};

interface ConversationsContextType {
  conversations: ConversationsState;
  getConversation: (conversationId: string) => ConversationState;
  sendMessage: (conversationId: string, request: SendMessageRequest, onComplete?: (response: string) => void) => Promise<void>;
  clearConversation: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  stopStreaming: (conversationId: string) => void;
  recoverStuckRequest: (conversationId: string) => void;
  updateMessages: (conversationId: string, messages: Message[]) => void;
  createBranchConversation: (sourceConversationId: string, upToMessageIndex: number, newConversationId: string) => Message[];
  loadMoreMessages: (conversationId: string) => Promise<void>;
}

const ConversationsContext = createContext<ConversationsContextType | null>(null);

export const useConversationsContext = () => {
  const context = useContext(ConversationsContext);
  if (!context) {
    throw new Error('useConversationsContext must be used within ConversationsProvider');
  }
  return context;
};

interface ConversationsProviderProps {
  children: ReactNode;
}

export const ConversationsProvider: React.FC<ConversationsProviderProps> = ({ children }) => {
  const [conversations, setConversations] = useState<ConversationsState>(() => {
    try {
      const saved = localStorage.getItem('conversations');
      const version = localStorage.getItem('conversations_version');

      // MIGRATION TO v3.0: Clear local storage on Supabase migration
      // Version 3.0+ uses Supabase as the primary data store
      const CURRENT_VERSION = '3.0';

      if (!version || version !== CURRENT_VERSION) {
        console.log('[ConversationsContext] Migrating to Supabase - clearing local conversation cache');
        localStorage.removeItem('conversations');
        localStorage.setItem('conversations_version', CURRENT_VERSION);
        return {};
      }

      if (saved) {
        return JSON.parse(saved);
      }

      return {};
    } catch {
      localStorage.setItem('conversations_version', '3.0');
      return {};
    }
  });

  // Track active requests for abort functionality
  const [, setActiveRequests] = useState<Map<string, string>>(new Map());

  // Track conversations currently being loaded to prevent duplicate requests
  const loadingConversationsRef = useRef<Set<string>>(new Set());

  // Save to localStorage - ULTRA-LIGHTWEIGHT version to prevent quota exceeded
  // Full messages are stored in Supabase, localStorage is just a minimal cache for UI state
  // Safari has ~5MB limit, and RAG contexts can be huge (100k+ chars)
  useEffect(() => {
    try {
      const conversationsToSave: ConversationsState = {};
      const MAX_MESSAGES_TO_CACHE = 5; // Only cache last 5 messages per conversation
      const MAX_CONTENT_LENGTH = 200; // Truncate content to 200 chars
      
      Object.entries(conversations).forEach(([id, convo]) => {
        if (convo.messages.length > 0) {
          // Save only last N messages with minimal data
          const recentMessages = convo.messages.slice(-MAX_MESSAGES_TO_CACHE);
          
          const lightMessages = recentMessages.map(msg => ({
            id: msg.id,
            role: msg.role,
            // Keep only first 200 chars for preview
            content: msg.content.length > MAX_CONTENT_LENGTH 
              ? msg.content.slice(0, MAX_CONTENT_LENGTH) + '...' 
              : msg.content,
            timestamp: msg.timestamp
            // NO meta at all - it's loaded fresh from Supabase
          }));

          conversationsToSave[id] = {
            messages: lightMessages as typeof convo.messages,
            loaded: convo.loaded,
            totalCount: convo.totalCount,
            hasMore: convo.hasMore || convo.messages.length > MAX_MESSAGES_TO_CACHE,
            // Reset transient state
            isStreaming: false,
            currentResponse: '',
            error: null,
            deepResearchStage: undefined,
            connectionLost: false,
            lastHeartbeat: undefined,
            thinkingContent: undefined,
            isThinking: false
          };
        }
      });
      localStorage.setItem('conversations', JSON.stringify(conversationsToSave));
    } catch (e) {
      // localStorage quota exceeded - Safari has very limited space (~5MB)
      // Clear old data and try again with minimal info
      console.warn('[ConversationsContext] localStorage quota exceeded, clearing cache:', e);
      try {
        localStorage.removeItem('conversations');
        // Save only conversation IDs and loaded status - no messages
        const minimalSave: Record<string, { loaded: boolean }> = {};
        Object.keys(conversations).forEach(id => {
          minimalSave[id] = { loaded: true };
        });
        localStorage.setItem('conversations', JSON.stringify(minimalSave));
      } catch {
        // Complete failure - just clear everything
        localStorage.removeItem('conversations');
      }
    }
  }, [conversations]);

  const loadConversationHistory = useCallback(async (conversationId: string, loadAll: boolean = false) => {
    // Prevent duplicate requests
    if (loadingConversationsRef.current.has(conversationId)) {
      console.log(`[ConversationsContext] Already loading ${conversationId}, skipping`);
      return;
    }

    loadingConversationsRef.current.add(conversationId);
    console.log(`[ConversationsContext] Loading history for ${conversationId}`);

    try {
      // Load with smaller limit for fast initial load (20 messages)
      // User can load more with "Load more" button
      const limit = loadAll ? 200 : 20;
      const response = await fetch(`/api/history/${conversationId}?limit=${limit}`);
      if (response.ok) {
        const history = await response.json();
        if (history.messages && history.messages.length > 0) {
          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              messages: history.messages,
              loaded: true,
              totalCount: history.total_count,
              hasMore: history.has_more
            }
          }));
        } else {
          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              loaded: true,
              totalCount: 0,
              hasMore: false
            }
          }));
        }
      }
    } catch (error) {
      console.error('Failed to load conversation history:', error);
    } finally {
      // Remove from loading set
      loadingConversationsRef.current.delete(conversationId);
    }
  }, []);

  const getConversation = useCallback((conversationId: string): ConversationState => {
    let conversation = conversations[conversationId];

    if (!conversation) {
      conversation = {
        messages: [],
        isStreaming: false,
        error: null,
        currentResponse: '',
        loaded: false,
        thinkingContent: undefined,
        isThinking: false
      };

      setConversations(prev => ({
        ...prev,
        [conversationId]: conversation!
      }));
    }

    if (!conversation.loaded) {
      loadConversationHistory(conversationId);
    }

    return conversation;
  }, [conversations, loadConversationHistory]);

  const sendMessage = useCallback(async (
    conversationId: string,
    request: SendMessageRequest,
    onComplete?: (response: string) => void
  ) => {
    const requestId = `${conversationId}-${Date.now()}`;
    setActiveRequests(prev => new Map(prev.set(requestId, conversationId)));

    // Clear thinking ref
    thinkingContentRefs[conversationId] = '';

    // Initialize streaming state
    setConversations(prev => {
      const existingConvo = prev[conversationId] || {
        messages: [],
        isStreaming: false,
        error: null,
        currentResponse: '',
        loaded: true,
        thinkingContent: undefined,
        isThinking: false
      };
      return {
        ...prev,
        [conversationId]: {
          ...existingConvo,
          isStreaming: true,
          error: null,
          currentResponse: '',
          thinkingContent: '',
          isThinking: false,
          lastHeartbeat: Date.now(),
          connectionLost: false
        }
      };
    });

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: request.message,
      timestamp: new Date().toISOString(),
      meta: { provider: request.provider, model: request.model }
    };

    setConversations(prev => ({
      ...prev,
      [conversationId]: {
        ...prev[conversationId],
        messages: [...prev[conversationId].messages, userMessage]
      }
    }));

    let fullResponse = '';
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      meta: { provider: request.provider, model: request.model }
    };

    setConversations(prev => ({
      ...prev,
      [conversationId]: {
        ...prev[conversationId],
        messages: [...prev[conversationId].messages, assistantMessage]
      }
    }));

    try {
      await apiClient.sendMessage(request, (chunk: ChatResponse) => {
        // DEBUG: Log every chunk received
        console.log(`[ConversationsContext] Chunk received:`, {
          done: chunk.done,
          hasContent: !!chunk.content,
          contentLen: chunk.content?.length || 0,
          hasError: !!chunk.error,
          hasHeartbeat: !!chunk.heartbeat,
          hasMeta: !!chunk.meta,
          metaThinking: chunk.meta?.thinking?.substring(0, 50),
          metaReasoningContent: chunk.meta?.reasoning_content?.substring(0, 50),
          metaThoughtTokens: chunk.meta?.thought_tokens,
          metaReasoning: chunk.meta?.reasoning
        });

        // Handle errors
        if (chunk.error) {
          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              isStreaming: false,
              error: typeof chunk.error === 'string' ? chunk.error : JSON.stringify(chunk.error),
              thinkingContent: undefined,
              isThinking: false,
              messages: prev[conversationId].messages.map(msg =>
                msg.id === assistantMessage.id
                  ? { ...msg, content: `Error: ${chunk.error}` }
                  : msg
              )
            }
          }));
          return;
        }

        // Handle heartbeat
        if (chunk.heartbeat || chunk.ping) {
          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              lastHeartbeat: Date.now(),
              connectionLost: false
            }
          }));
          return;
        }

        // Handle RAG context info (sent at start of generation)
        if (chunk.type === 'rag_context' && chunk.rag_sources) {
          console.log(`[ConversationsContext] RAG context received: ${chunk.chunks_count} chunks, ${chunk.rag_context_length} chars`);
          console.log(`[ConversationsContext] RAG debug:`, chunk.debug);
          console.log(`[ConversationsContext] RAG debug keys:`, chunk.debug ? Object.keys(chunk.debug) : 'no debug');
          console.log(`[ConversationsContext] RAG debug.collector keys:`, chunk.debug?.collector ? Object.keys(chunk.debug.collector) : 'no collector');

          // Update the assistant message with RAG sources
          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              deepResearchStage: `📚 Found ${chunk.chunks_count} relevant document chunks...`,
              messages: prev[conversationId].messages.map(msg =>
                msg.id === assistantMessage.id
                  ? {
                    ...msg,
                    meta: {
                      ...msg.meta,
                      rag_sources: chunk.rag_sources,
                      rag_enabled: true,
                      rag_context_preview: chunk.rag_context_preview,
                      rag_context_full: chunk.rag_context_full,
                      rag_debug: chunk.debug,
                      system_prompt_preview: chunk.system_prompt_preview,
                      system_prompt_full: chunk.system_prompt_full  // Full system prompt with RAG context for debug
                    }
                  }
                  : msg
              )
            }
          }));
          return;
        }

        // Handle thinking/reasoning content (only for streaming chunks, not final)
        // Check if this is a streaming thinking chunk (not the final done chunk)
        const isStreamingThinkingChunk = (chunk.meta?.thinking || chunk.meta?.reasoning_content) && !chunk.done;

        if (isStreamingThinkingChunk) {
          const thinkingChunk = chunk.meta!.thinking || chunk.meta!.reasoning_content || '';
          thinkingContentRefs[conversationId] = (thinkingContentRefs[conversationId] || '') + thinkingChunk;
          const accumulated = thinkingContentRefs[conversationId];

          console.log(`[ConversationsContext] Thinking chunk: ${thinkingChunk.length} chars, total: ${accumulated.length}`);

          setConversations(prev => {
            const currentVersion = prev[conversationId]?.updateVersion || 0;
            return {
              ...prev,
              [conversationId]: {
                ...prev[conversationId],
                thinkingContent: accumulated,
                isThinking: true,
                deepResearchStage: '🧠 Model is reasoning...',
                lastHeartbeat: Date.now(),
                updateVersion: currentVersion + 1, // Force re-render
                messages: prev[conversationId].messages.map(msg =>
                  msg.id === assistantMessage.id
                    ? {
                      ...msg,
                      meta: {
                        ...msg.meta,
                        reasoning: true,
                        thought_tokens: chunk.meta?.thought_tokens,
                        reasoning_content: accumulated,
                        thought_content: accumulated,
                        thinking: accumulated
                      }
                    }
                    : msg
                )
              }
            };
          });
          return;
        }

        // Handle final chunk with done=true
        if (chunk.done) {
          const refThinking = thinkingContentRefs[conversationId] || '';
          const finalThinking = chunk.meta?.thinking || chunk.meta?.reasoning_content || chunk.meta?.thought_content || '';
          // Use refThinking (accumulated during streaming) OR finalThinking (from final chunk)
          // refThinking takes priority since it's accumulated from real-time chunks
          const mergedThinking = refThinking || finalThinking;

          console.log(`[ConversationsContext] Final chunk received:`, {
            refThinkingLen: refThinking.length,
            finalThinkingLen: finalThinking.length,
            mergedThinkingLen: mergedThinking.length,
            thought_tokens: chunk.meta?.thought_tokens,
            hasChunkMeta: !!chunk.meta
          });

          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              thinkingContent: mergedThinking || prev[conversationId]?.thinkingContent,
              messages: prev[conversationId].messages.map(msg =>
                msg.id === assistantMessage.id
                  ? {
                    ...msg,
                    meta: {
                      ...msg.meta,
                      ...(chunk.meta || {}),
                      // Preserve accumulated reasoning content
                      reasoning_content: mergedThinking || msg.meta?.reasoning_content,
                      thought_content: mergedThinking || msg.meta?.thought_content,
                      thinking: mergedThinking || msg.meta?.thinking
                    }
                  }
                  : msg
              )
            }
          }));
          return;
        }

        // Handle content
        if (chunk.content) {
          fullResponse += chunk.content;
          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              currentResponse: fullResponse,
              deepResearchStage: undefined,
              lastHeartbeat: Date.now(),
              messages: prev[conversationId].messages.map(msg =>
                msg.id === assistantMessage.id
                  ? { ...msg, content: fullResponse, meta: { ...msg.meta, ...chunk.meta } }
                  : msg
              )
            }
          }));
        }
      }, requestId);

      // Cleanup - FORCE re-render by incrementing updateVersion significantly
      const finalThinking = thinkingContentRefs[conversationId] || '';
      delete thinkingContentRefs[conversationId];

      console.log(`[ConversationsContext] Cleanup - finalThinking length: ${finalThinking.length}`);

      setConversations(prev => {
        const currentVersion = prev[conversationId]?.updateVersion || 0;
        const lastMsg = prev[conversationId]?.messages[prev[conversationId]?.messages.length - 1];
        const existingThinking = lastMsg?.meta?.reasoning_content || lastMsg?.meta?.thought_content || '';
        const mergedThinking = finalThinking || existingThinking;

        console.log(`[ConversationsContext] Final cleanup - existingThinking: ${existingThinking.length}, mergedThinking: ${mergedThinking.length}`);

        return {
          ...prev,
          [conversationId]: {
            ...prev[conversationId],
            isStreaming: false,
            currentResponse: '',
            deepResearchStage: undefined,
            connectionLost: false,
            thinkingContent: undefined,
            isThinking: false,
            // Force re-render by bumping version
            updateVersion: currentVersion + 100,
            messages: prev[conversationId].messages.map((msg, idx) => {
              if (idx === prev[conversationId].messages.length - 1 && msg.role === 'assistant') {
                // Force create new object reference for the message
                const updatedMeta = {
                  ...msg.meta,
                  reasoning_content: mergedThinking || msg.meta?.reasoning_content,
                  thought_content: mergedThinking || msg.meta?.thought_content,
                  thinking: mergedThinking || msg.meta?.thinking
                };
                return {
                  ...msg,
                  // Create new id suffix to force MessageBubble key change
                  meta: updatedMeta
                };
              }
              return msg;
            })
          }
        };
      });

      setActiveRequests(prev => {
        const newMap = new Map(prev);
        newMap.delete(requestId);
        return newMap;
      });

      // Force another re-render after a small delay to ensure UI updates
      // This mimics the "move message" behavior that fixes the display
      setTimeout(() => {
        setConversations(prev => {
          const conv = prev[conversationId];
          if (!conv) return prev;

          const currentVersion = conv.updateVersion || 0;
          console.log(`[ConversationsContext] Delayed force update - version: ${currentVersion + 1}`);

          return {
            ...prev,
            [conversationId]: {
              ...conv,
              updateVersion: currentVersion + 1,
              // Re-map messages to create new references
              messages: conv.messages.map(msg => ({ ...msg }))
            }
          };
        });
      }, 100);

      if (onComplete) onComplete(fullResponse);

    } catch (err) {
      delete thinkingContentRefs[conversationId];
      setConversations(prev => ({
        ...prev,
        [conversationId]: {
          ...prev[conversationId],
          isStreaming: false,
          error: err instanceof Error ? err.message : 'Failed to send message',
          thinkingContent: undefined,
          isThinking: false
        }
      }));
    }
  }, []);

  const clearConversation = useCallback(async (conversationId: string) => {
    try {
      await fetch(`/api/history/${conversationId}`, { method: 'DELETE' });
      setConversations(prev => ({
        ...prev,
        [conversationId]: {
          messages: [],
          isStreaming: false,
          error: null,
          currentResponse: '',
          loaded: true
        }
      }));
    } catch (error) {
      console.error('Failed to clear conversation:', error);
    }
  }, []);

  const deleteConversation = useCallback(async (conversationId: string) => {
    try {
      await fetch(`/api/history/${conversationId}`, { method: 'DELETE' });
      setConversations(prev => {
        const newState = { ...prev };
        delete newState[conversationId];
        return newState;
      });
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  }, []);

  const stopStreaming = useCallback((conversationId: string) => {
    apiClient.abortRequest(conversationId);
    delete thinkingContentRefs[conversationId];
    setConversations(prev => ({
      ...prev,
      [conversationId]: {
        ...prev[conversationId],
        isStreaming: false,
        thinkingContent: undefined,
        isThinking: false
      }
    }));
  }, []);

  const recoverStuckRequest = useCallback((conversationId: string) => {
    delete thinkingContentRefs[conversationId];
    setConversations(prev => ({
      ...prev,
      [conversationId]: {
        ...prev[conversationId],
        isStreaming: false,
        error: null,
        connectionLost: false,
        thinkingContent: undefined,
        isThinking: false
      }
    }));
  }, []);

  const updateMessages = useCallback((conversationId: string, messages: Message[]) => {
    setConversations(prev => ({
      ...prev,
      [conversationId]: {
        ...prev[conversationId],
        messages
      }
    }));
  }, []);

  // Load more older messages (pagination)
  const loadMoreMessages = useCallback(async (conversationId: string) => {
    const conversation = conversations[conversationId];
    if (!conversation || conversation.isLoadingMore || !conversation.hasMore) {
      return;
    }

    setConversations(prev => ({
      ...prev,
      [conversationId]: {
        ...prev[conversationId],
        isLoadingMore: true
      }
    }));

    try {
      const currentCount = conversation.messages.length;
      const response = await fetch(`/api/history/${conversationId}?limit=50&offset=${currentCount}`);

      if (response.ok) {
        const history = await response.json();
        if (history.messages && history.messages.length > 0) {
          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              messages: [...prev[conversationId].messages, ...history.messages],
              hasMore: history.has_more,
              isLoadingMore: false
            }
          }));
        } else {
          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              hasMore: false,
              isLoadingMore: false
            }
          }));
        }
      }
    } catch (error) {
      console.error('Failed to load more messages:', error);
      setConversations(prev => ({
        ...prev,
        [conversationId]: {
          ...prev[conversationId],
          isLoadingMore: false
        }
      }));
    }
  }, [conversations]);

  const createBranchConversation = useCallback((sourceConversationId: string, upToMessageIndex: number, newConversationId: string) => {
    setConversations(prev => {
      const sourceConversation = prev[sourceConversationId];
      if (!sourceConversation) return prev;

      // Extract messages up to the specified index
      const newMessages = sourceConversation.messages.slice(0, upToMessageIndex + 1);

      // Create the new conversation with extracted messages
      const newConversation: ConversationState = {
        messages: newMessages,
        isStreaming: false,
        error: null,
        currentResponse: '',
        loaded: true,
        thinkingContent: undefined,
        isThinking: false
      };

      return {
        ...prev,
        [newConversationId]: newConversation
      };
    });

    // Optionally, you can return the new conversation state
    return conversations[newConversationId]?.messages || [];
  }, [conversations]);

  return (
    <ConversationsContext.Provider
      value={{
        conversations,
        getConversation,
        sendMessage,
        clearConversation,
        deleteConversation,
        stopStreaming,
        recoverStuckRequest,
        updateMessages,
        createBranchConversation,
        loadMoreMessages
      }}
    >
      {children}
    </ConversationsContext.Provider>
  );
};
