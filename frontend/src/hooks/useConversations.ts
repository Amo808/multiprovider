import { useState, useCallback, useEffect, useRef } from 'react';
import { Message, SendMessageRequest, ChatResponse } from '../types';
import { apiClient } from '../services/api';

// Track loading conversations globally to prevent duplicate requests across hook instances
const globalLoadingConversations = new Set<string>();

interface ConversationState {
  messages: Message[];
  isStreaming: boolean;
  error: string | null;
  currentResponse: string;
  loaded: boolean; // Track if conversation history has been loaded
  deepResearchStage?: string; // Current Deep Research stage message
  lastHeartbeat?: number; // Timestamp of last heartbeat/activity
  connectionLost?: boolean; // Track if connection seems lost
  thinkingContent?: string; // Accumulated thinking/reasoning content
  isThinking?: boolean; // Whether model is currently in thinking mode
}

interface ConversationsState {
  [conversationId: string]: ConversationState;
}

// Ref-based storage for thinking content to avoid closure issues with state updates
const thinkingContentRefs: Record<string, string> = {};

export const useConversations = () => {
  const [conversations, setConversations] = useState<ConversationsState>(() => {
    // Load conversations from localStorage on initialization
    try {
      const saved = localStorage.getItem('conversations');
      const version = localStorage.getItem('conversations_version');

      console.log('Loading conversations from localStorage, version:', version);

      // MIGRATION TO v3.0: Clear local storage on Supabase migration
      // Version 3.0+ uses Supabase as the primary data store
      const CURRENT_VERSION = '3.0';

      if (!version || version !== CURRENT_VERSION) {
        console.log('[useConversations] Migrating to Supabase - clearing local conversation cache');
        localStorage.removeItem('conversations');
        localStorage.setItem('conversations_version', CURRENT_VERSION);
        return {};
      }

      if (saved) {
        const parsedConversations = JSON.parse(saved);
        console.log('Loaded conversations from localStorage:', Object.keys(parsedConversations));
        return parsedConversations;
      }

      return {};
    } catch (error) {
      console.warn('Failed to load conversations from localStorage:', error);
      localStorage.setItem('conversations_version', '3.0');
      return {};
    }
  });

  // Track active requests for cancellation
  const [activeRequests, setActiveRequests] = useState<Map<string, string>>(new Map());

  // Connection monitoring and auto-recovery
  useEffect(() => {
    const checkConnectionHealth = () => {
      const now = Date.now();
      // Even more generous timeouts - we want to wait as long as OpenAI needs
      const HEARTBEAT_TIMEOUT = 600000; // 10 minutes without heartbeat = connection issue
      const REASONING_HEARTBEAT_TIMEOUT = 1800000; // 30 minutes for reasoning models (GPT-5, o1, etc.)
      const STREAMING_TIMEOUT = 3600000; // 60 minutes total timeout for streaming requests

      setConversations(prev => {
        const updated = { ...prev };
        let hasUpdates = false;

        Object.entries(updated).forEach(([conversationId, conversation]) => {
          if (conversation.isStreaming && conversation.lastHeartbeat) {
            const timeSinceHeartbeat = now - conversation.lastHeartbeat;

            // Check if this is a reasoning model (GPT-5, o1, etc.) or has reasoning stage message
            const isReasoningModel = conversation.deepResearchStage?.includes('reasoning') ||
              conversation.deepResearchStage?.includes('GPT-5') ||
              conversation.deepResearchStage?.includes('thinking') ||
              conversation.deepResearchStage?.includes('processing');

            const heartbeatTimeout = isReasoningModel ? REASONING_HEARTBEAT_TIMEOUT : HEARTBEAT_TIMEOUT;
            const shouldMarkAsLost = timeSinceHeartbeat > heartbeatTimeout;
            const shouldTimeout = timeSinceHeartbeat > STREAMING_TIMEOUT;

            if (shouldTimeout && !conversation.connectionLost) {
              console.warn(`[${conversationId}] Streaming timeout (${Math.round(timeSinceHeartbeat / 1000)}s), marking as failed`);
              updated[conversationId] = {
                ...conversation,
                isStreaming: false,
                error: 'Request timed out. The model may still be processing, but the connection was lost.',
                connectionLost: true,
                deepResearchStage: undefined
              };
              hasUpdates = true;
            } else if (shouldMarkAsLost && !conversation.connectionLost) {
              const minutes = Math.round(timeSinceHeartbeat / 60000);
              const message = isReasoningModel
                ? `🧠 Model is reasoning deeply... (${minutes}m elapsed)`
                : `⚠️ Connection issue detected. Trying to reconnect...`;

              console.warn(`[${conversationId}] ${isReasoningModel ? 'Long reasoning detected' : 'Connection seems lost'} (${Math.round(timeSinceHeartbeat / 1000)}s since heartbeat)`);
              updated[conversationId] = {
                ...conversation,
                connectionLost: !isReasoningModel, // Don't mark as lost for reasoning models
                deepResearchStage: conversation.deepResearchStage
                  ? `${message}`
                  : message
              };
              hasUpdates = true;
            }
          }
        });

        return hasUpdates ? updated : prev;
      });
    };

    // Check every 30 seconds
    const interval = setInterval(checkConnectionHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-recovery for stuck requests
  const recoverStuckRequest = useCallback(async (conversationId: string) => {
    console.log(`[${conversationId}] Attempting to recover stuck request`);

    setConversations(prev => ({
      ...prev,
      [conversationId]: {
        ...prev[conversationId],
        connectionLost: false,
        error: null,
        deepResearchStage: '🔄 Retrying connection...'
      }
    }));

    // Give it a few seconds to potentially receive delayed data
    setTimeout(() => {
      setConversations(prev => {
        const conversation = prev[conversationId];
        if (conversation && conversation.isStreaming && !conversation.lastHeartbeat) {
          return {
            ...prev,
            [conversationId]: {
              ...conversation,
              isStreaming: false,
              error: 'Connection could not be recovered. Please try sending the message again.',
              deepResearchStage: undefined
            }
          };
        }
        return prev;
      });
    }, 10000); // Wait 10 seconds for recovery
  }, []);

  // Save conversations to localStorage whenever they change
  // LIGHTWEIGHT version to prevent quota exceeded (Safari ~5MB limit)
  useEffect(() => {
    try {
      const lightConversations: Record<string, any> = {};
      Object.entries(conversations).forEach(([id, convo]) => {
        if (convo.messages && convo.messages.length > 0) {
          // Save only essential data, truncate content
          const lightMessages = convo.messages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content?.length > 500 ? msg.content.slice(0, 500) + '...[truncated]' : msg.content,
            timestamp: msg.timestamp,
            meta: msg.meta ? { tokens_in: msg.meta.tokens_in, tokens_out: msg.meta.tokens_out } : undefined
          }));
          lightConversations[id] = {
            messages: lightMessages,
            isStreaming: false,
            error: null,
            currentResponse: ''
          };
        }
      });
      localStorage.setItem('conversations', JSON.stringify(lightConversations));
    } catch (error) {
      console.warn('localStorage quota exceeded, clearing cache:', error);
      try {
        localStorage.removeItem('conversations');
      } catch {
        // ignore
      }
    }
  }, [conversations]);

  // Load conversation history when accessing a conversation for the first time
  const loadConversationHistory = useCallback(async (conversationId: string) => {
    console.log(`Loading conversation history for: ${conversationId}`);
    try {
      const response = await fetch(`/api/history/${conversationId}`);
      console.log(`Response status for ${conversationId}:`, response.status);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`Data received for ${conversationId}:`, data);
      const { messages } = data;

      setConversations(prev => ({
        ...prev,
        [conversationId]: {
          ...(prev[conversationId] || {
            isStreaming: false,
            error: null,
            currentResponse: '',
            lastHeartbeat: undefined,
            connectionLost: false
          }),
          messages: messages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            meta: msg.meta
          })),
          loaded: true
        }
      }));
      console.log(`Successfully loaded ${messages.length} messages for ${conversationId}`);
    } catch (error) {
      console.warn(`Failed to load conversation history for ${conversationId}:`, error);
      // Mark as loaded even if failed to avoid infinite retries
      setConversations(prev => ({
        ...prev,
        [conversationId]: {
          ...(prev[conversationId] || {
            isStreaming: false,
            error: null,
            currentResponse: '',
            lastHeartbeat: undefined,
            connectionLost: false
          }),
          messages: [],
          loaded: true
        }
      }));
    }
  }, []);

  const getConversation = useCallback((conversationId: string): ConversationState => {
    console.log(`Getting conversation: ${conversationId}`);
    let conversation = conversations[conversationId];

    if (!conversation) {
      console.log(`Creating new conversation state for: ${conversationId}`);
      // Create empty conversation first
      conversation = {
        messages: [],
        isStreaming: false,
        error: null,
        currentResponse: '',
        loaded: false,
        deepResearchStage: undefined,
        lastHeartbeat: undefined,
        connectionLost: false,
        thinkingContent: undefined,
        isThinking: false
      };

      // Update state with empty conversation
      setConversations(prev => ({
        ...prev,
        [conversationId]: conversation!
      }));
    }

    // Auto-load history if not loaded yet
    if (!conversation.loaded) {
      console.log(`Auto-loading history for: ${conversationId}`);
      loadConversationHistory(conversationId);
    } else {
      console.log(`Conversation ${conversationId} already loaded with ${conversation.messages.length} messages`);
    }

    return conversation;
  }, [conversations, loadConversationHistory]);

  const sendMessage = useCallback(async (
    conversationId: string,
    request: SendMessageRequest,
    onComplete?: (response: string) => void
  ) => {
    try {
      // Create unique request ID
      const requestId = `${conversationId}-${Date.now()}`;

      // Track this request
      setActiveRequests(prev => new Map(prev.set(requestId, conversationId)));

      // Ensure conversation is initialized (this will auto-load history if needed)
      getConversation(conversationId);

      // Clear thinking ref for this conversation at start
      thinkingContentRefs[conversationId] = '';

      // Initialize conversation if it doesn't exist and set streaming state
      setConversations(prev => {
        const existingConvo = prev[conversationId] || {
          messages: [],
          isStreaming: false,
          error: null,
          currentResponse: '',
          loaded: true,
          deepResearchStage: undefined,
          lastHeartbeat: undefined,
          connectionLost: false,
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
            thinkingContent: '', // Clear thinking at start
            isThinking: false,
            lastHeartbeat: Date.now(), // Track start time
            connectionLost: false
          }
        };
      });

      // Add user message immediately
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: request.message,
        timestamp: new Date().toISOString(),
        meta: {
          provider: request.provider,
          model: request.model
        }
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
        meta: {
          provider: request.provider,
          model: request.model
        }
      };

      setConversations(prev => ({
        ...prev,
        [conversationId]: {
          ...prev[conversationId],
          messages: [...prev[conversationId].messages, assistantMessage]
        }
      }));

      await apiClient.sendMessage(request, (chunk: ChatResponse) => {
        // Handle errors received through streaming
        if (chunk.error) {
          const errorMessage = typeof chunk.error === 'string' ? chunk.error : JSON.stringify(chunk.error);
          console.error(`[${conversationId}] Error in chunk:`, errorMessage);
          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              isStreaming: false,
              error: errorMessage,
              currentResponse: '',
              deepResearchStage: undefined,
              connectionLost: false,
              lastHeartbeat: undefined,
              thinkingContent: undefined,
              isThinking: false,
              // Update the assistant message to show error
              messages: prev[conversationId].messages.map(msg =>
                msg.id === assistantMessage.id
                  ? { ...msg, content: `Error: ${errorMessage}` }
                  : msg
              )
            }
          }));
          return;
        }

        // Handle heartbeat messages - keep connection alive, update last activity
        if (chunk.heartbeat) {
          console.log(`[${conversationId}] Heartbeat received:`, chunk.heartbeat);
          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              lastHeartbeat: Date.now(),
              // Keep current stage message if no new one provided
              deepResearchStage: chunk.stage_message || prev[conversationId].deepResearchStage
            }
          }));
          return; // Don't process as regular content
        }

        // Handle stage messages (status updates) - immediate UI feedback
        if (chunk.stage_message) {
          console.log(`[${conversationId}] Stage message:`, chunk.stage_message);
          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              deepResearchStage: chunk.stage_message,
              lastHeartbeat: Date.now(),
              // Also update the assistant message meta to mark special processing
              messages: prev[conversationId].messages.map(msg =>
                msg.id === assistantMessage.id
                  ? {
                    ...msg,
                    meta: {
                      ...msg.meta,
                      ...chunk.meta,
                      deep_research: chunk.meta?.deep_research || true,
                      reasoning: chunk.meta?.reasoning
                    }
                  }
                  : msg
              )
            }
          }));
          return; // Don't process as regular content
        }

        // Handle streaming_ready signal - backend is ready to start streaming
        if (chunk.streaming_ready) {
          console.log(`[${conversationId}] Streaming ready signal received`);
          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              deepResearchStage: "🚀 Starting response generation...",
              lastHeartbeat: Date.now()
            }
          }));
          return;
        }

        // Handle first_content signal - first actual content is coming
        if (chunk.first_content) {
          console.log(`[${conversationId}] First content signal received`);
          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              deepResearchStage: undefined, // Clear stage as content starts
              lastHeartbeat: Date.now(),
              isThinking: false // Done thinking
            }
          }));
          return;
        }

        // Handle thinking/reasoning content from models like deepseek-reasoner
        if (chunk.meta?.thinking || chunk.meta?.reasoning_content) {
          const thinkingChunk = chunk.meta.thinking || chunk.meta.reasoning_content || '';
          console.log(`[${conversationId}] Thinking chunk received:`, thinkingChunk.substring(0, 100) + '...');

          // Accumulate in ref to avoid closure issues
          thinkingContentRefs[conversationId] = (thinkingContentRefs[conversationId] || '') + thinkingChunk;
          const accumulatedThinking = thinkingContentRefs[conversationId];
          console.log(`[${conversationId}] Accumulated thinking (ref): ${accumulatedThinking.length} chars`);

          setConversations(prev => {
            return {
              ...prev,
              [conversationId]: {
                ...prev[conversationId],
                thinkingContent: accumulatedThinking, // Use ref value
                isThinking: true,
                deepResearchStage: '🧠 Model is reasoning...',
                lastHeartbeat: Date.now(),
                messages: prev[conversationId].messages.map(msg =>
                  msg.id === assistantMessage.id
                    ? {
                      ...msg,
                      meta: {
                        ...msg.meta,
                        reasoning: true,
                        thought_tokens: chunk.meta?.thought_tokens,
                        // Use accumulated thinking from ref
                        reasoning_content: accumulatedThinking,
                        thought_content: accumulatedThinking,
                        thinking: accumulatedThinking
                      }
                    }
                    : msg
                )
              }
            };
          });
          return; // Don't process as regular content
        }

        // Handle final chunk with done=true (usually contains estimated_cost, thought_tokens, reasoning_content)
        if (chunk.done && chunk.meta) {
          console.log(`[${conversationId}] Final chunk received with metadata:`, chunk.meta);

          // Capture thinking content from final chunk if present (Gemini non-streaming, or final summary)
          const finalThinking = chunk.meta.thinking || chunk.meta.reasoning_content || chunk.meta.thought_content;
          const finalThoughtTokens = chunk.meta.thought_tokens;

          // Get accumulated thinking from ref first, then fall back to other sources
          const refThinking = thinkingContentRefs[conversationId] || '';

          setConversations(prev => {
            // Get existing thinking content - prefer ref, then state, then final chunk
            const existingMsgThinking = prev[conversationId]?.messages.find(m => m.id === assistantMessage.id)?.meta?.reasoning_content || '';
            // Use ref accumulated thinking if we have it, otherwise use message meta or final chunk
            const mergedThinking = refThinking || existingMsgThinking || finalThinking || '';

            console.log(`[${conversationId}] Final merge - refThinking: ${refThinking.length}, msgThinking: ${existingMsgThinking.length}, finalChunk: ${(finalThinking || '').length}, merged: ${mergedThinking.length}`);

            return {
              ...prev,
              [conversationId]: {
                ...prev[conversationId],
                // Keep thinking content until stream ends
                thinkingContent: mergedThinking,
                messages: prev[conversationId].messages.map(msg =>
                  msg.id === assistantMessage.id
                    ? {
                      ...msg,
                      meta: {
                        ...msg.meta,
                        ...chunk.meta, // This should include estimated_cost, thought_tokens
                        // Preserve flags and add reasoning content
                        deep_research: msg.meta?.deep_research || chunk.meta?.deep_research,
                        reasoning: msg.meta?.reasoning || chunk.meta?.reasoning || !!mergedThinking || !!finalThoughtTokens,
                        // Use merged thinking - don't overwrite with empty
                        reasoning_content: mergedThinking || msg.meta?.reasoning_content,
                        thought_content: mergedThinking || msg.meta?.thought_content,
                        thinking: mergedThinking || msg.meta?.thinking
                      }
                    }
                    : msg
                )
              }
            };
          });
          return; // Don't process as content
        }

        if (chunk.content) {
          fullResponse += chunk.content;

          // Update the assistant message and clear Deep Research stage when content starts
          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              currentResponse: fullResponse,
              deepResearchStage: undefined, // Clear stage when content arrives
              lastHeartbeat: Date.now(),
              messages: prev[conversationId].messages.map(msg =>
                msg.id === assistantMessage.id
                  ? {
                    ...msg,
                    content: fullResponse,
                    meta: {
                      ...msg.meta,
                      ...chunk.meta,
                      // Preserve deep_research flag if it was set
                      deep_research: msg.meta?.deep_research || chunk.meta?.deep_research,
                      reasoning: msg.meta?.reasoning || chunk.meta?.reasoning
                    }
                  }
                  : msg
              )
            }
          }));
        }
      }, requestId);

      // Clean up request tracking
      setActiveRequests(prev => {
        const newMap = new Map(prev);
        newMap.delete(requestId);
        return newMap;
      });

      // Get final thinking content from ref (most reliable source)
      const finalRefThinking = thinkingContentRefs[conversationId] || '';
      console.log(`[${conversationId}] Stream completed. Ref thinking: ${finalRefThinking.length} chars`);

      // Clear the ref for this conversation
      delete thinkingContentRefs[conversationId];

      setConversations(prev => {
        const conversation = prev[conversationId];
        const stateThinking = conversation?.thinkingContent || '';

        console.log(`[${conversationId}] State thinking: ${stateThinking.length} chars`);

        return {
          ...prev,
          [conversationId]: {
            ...conversation,
            isStreaming: false,
            currentResponse: '',
            deepResearchStage: undefined,
            connectionLost: false,
            lastHeartbeat: undefined,
            thinkingContent: undefined, // Clear thinking after completion
            isThinking: false,
            // Save thinking content to the last assistant message's meta
            messages: conversation.messages.map((msg, idx) => {
              if (idx === conversation.messages.length - 1 && msg.role === 'assistant') {
                // Use ref thinking (most reliable), then state thinking, then message meta
                const existingMsgThinking = msg.meta?.reasoning_content || msg.meta?.thought_content || msg.meta?.thinking || '';
                const finalThinking = finalRefThinking || stateThinking || existingMsgThinking;
                console.log(`[${conversationId}] Final save - refThinking: ${finalRefThinking.length}, stateThinking: ${stateThinking.length}, msgThinking: ${existingMsgThinking.length}, final: ${finalThinking.length}`);
                if (finalThinking) {
                  console.log(`[${conversationId}] Saving thinking content to message: ${finalThinking.length} chars`);
                  return {
                    ...msg,
                    meta: {
                      ...msg.meta,
                      reasoning_content: finalThinking,
                      thought_content: finalThinking,
                      thinking: finalThinking
                    }
                  };
                }
              }
              return msg;
            })
          }
        };
      });

      if (onComplete) {
        onComplete(fullResponse);
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      console.error(`[${conversationId}] Send message error:`, errorMessage);

      // Clear thinking ref on error
      delete thinkingContentRefs[conversationId];

      setConversations(prev => ({
        ...prev,
        [conversationId]: {
          ...prev[conversationId],
          isStreaming: false,
          error: errorMessage,
          currentResponse: '',
          deepResearchStage: undefined,
          connectionLost: false,
          lastHeartbeat: undefined,
          thinkingContent: undefined,
          isThinking: false
        }
      }));

      // Don't re-throw - error is already in state for UI display
      // throw err;
    }
  }, [getConversation]);

  const clearConversation = useCallback(async (conversationId: string) => {
    try {
      // Clear conversation on backend
      await fetch(`/api/history/${conversationId}`, {
        method: 'DELETE'
      });

      // Clear local state
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

      console.log(`Successfully cleared conversation: ${conversationId}`);
    } catch (error) {
      console.error(`Failed to clear conversation ${conversationId}:`, error);

      // Still clear local state even if backend fails
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

      throw error;
    }
  }, []);

  const deleteConversation = useCallback((conversationId: string) => {
    setConversations(prev => {
      const newConversations = { ...prev };
      delete newConversations[conversationId];
      return newConversations;
    });
  }, []);

  const stopStreaming = useCallback((conversationId: string) => {
    // Find and abort active requests for this conversation
    const requestsToAbort: string[] = [];
    activeRequests.forEach((convId, requestId) => {
      if (convId === conversationId) {
        requestsToAbort.push(requestId);
      }
    });

    // Abort the actual requests
    requestsToAbort.forEach(requestId => {
      apiClient.abortRequest(requestId);
    });

    // Clean up tracking
    setActiveRequests(prev => {
      const newMap = new Map(prev);
      requestsToAbort.forEach(requestId => newMap.delete(requestId));
      return newMap;
    });

    // Update conversation state
    setConversations(prev => ({
      ...prev,
      [conversationId]: {
        ...prev[conversationId],
        isStreaming: false,
        currentResponse: ''
      }
    }));
  }, [activeRequests]);

  // Update messages after reordering (for external use)
  const updateMessages = useCallback((conversationId: string, messages: Message[]) => {
    setConversations(prev => ({
      ...prev,
      [conversationId]: {
        ...(prev[conversationId] || {
          isStreaming: false,
          error: null,
          currentResponse: '',
          loaded: true,
          lastHeartbeat: undefined,
          connectionLost: false
        }),
        messages
      }
    }));
  }, []);

  return {
    conversations, // Export raw conversations state for direct subscription
    getConversation,
    sendMessage,
    clearConversation,
    deleteConversation,
    stopStreaming,
    recoverStuckRequest,
    updateMessages
  };
};
