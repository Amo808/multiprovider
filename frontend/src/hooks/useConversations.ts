import { useState, useCallback, useEffect } from 'react';
import { Message, SendMessageRequest, ChatResponse } from '../types';
import { apiClient } from '../services/api';

interface ConversationState {
  messages: Message[];
  isStreaming: boolean;
  error: string | null;
  currentResponse: string;
  loaded: boolean; // Track if conversation history has been loaded
  deepResearchStage?: string; // Current Deep Research stage message
  lastHeartbeat?: number; // Timestamp of last heartbeat/activity
  connectionLost?: boolean; // Track if connection seems lost
  reasoningWaitStart?: number; // New: when we entered reasoning wait phase
  summaryApplied?: boolean; // New flag to indicate history was compressed
  thoughtTokens?: number;   // Live thought token counter
}

interface ConversationsState {
  [conversationId: string]: ConversationState;
}

export const useConversations = () => {
  const [conversations, setConversations] = useState<ConversationsState>(() => {
    // Load conversations from localStorage on initialization
    try {
      const saved = localStorage.getItem('conversations');
      const version = localStorage.getItem('conversations_version');
      
      console.log('Loading conversations from localStorage, version:', version);
      
      // Check version compatibility - only clear if major version change
      if (version && version.startsWith('1.') && saved) {
        console.log('Migrating from version 1.x, clearing old data');
        localStorage.removeItem('conversations');
        localStorage.setItem('conversations_version', '2.0');
        return {};
      }
      
      // Set version if not set
      if (!version) {
        localStorage.setItem('conversations_version', '2.0');
      }
      
      if (saved) {
        const parsedConversations = JSON.parse(saved);
        console.log('Loaded conversations from localStorage:', Object.keys(parsedConversations));
        return parsedConversations;
      }
      
      return {};
    } catch (error) {
      console.warn('Failed to load conversations from localStorage:', error);
      localStorage.setItem('conversations_version', '2.0');
      return {};
    }
  });
  
  // Track active requests for cancellation
  const [activeRequests, setActiveRequests] = useState<Map<string, string>>(new Map());

  // Connection monitoring and auto-recovery
  useEffect(() => {
    const checkConnectionHealth = () => {
      const now = Date.now();
      const HEARTBEAT_TIMEOUT = 60000; // 60 seconds without heartbeat = connection issue
      const STREAMING_TIMEOUT = 300000; // 5 minutes total timeout for streaming requests
      
      setConversations(prev => {
        const updated = { ...prev };
        let changed = false;
        
        Object.entries(updated).forEach(([cid, conv]) => {
          if (conv.isStreaming && conv.lastHeartbeat) {
            const delta = now - conv.lastHeartbeat;
            const waitingReasoning = !!conv.reasoningWaitStart && !conv.currentResponse;
            const reasoningElapsed = conv.reasoningWaitStart ? now - conv.reasoningWaitStart : 0;
            if (waitingReasoning && reasoningElapsed < 240000) {
              // Up to 4 minutes allow reasoning without flagging lost
              return;
            }
            if (delta > STREAMING_TIMEOUT && !conv.connectionLost) {
              updated[cid] = { ...conv, isStreaming: false, error: 'Request timed out after prolonged inactivity.', connectionLost: true, deepResearchStage: undefined };
              changed = true;
            } else if (delta > HEARTBEAT_TIMEOUT && !conv.connectionLost) {
              updated[cid] = { ...conv, connectionLost: true, deepResearchStage: conv.deepResearchStage ? `⚠️ Connection issue. ${conv.deepResearchStage}` : '⚠️ Connection issue detected. Trying to reconnect...' };
              changed = true;
            }
          }
        });
        
        return changed ? updated : prev;
      });
    };
    
    // Check every 30 seconds
    const intv = setInterval(checkConnectionHealth, 30000);
    return () => clearInterval(intv);
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
  useEffect(() => {
    try {
      localStorage.setItem('conversations', JSON.stringify(conversations));
    } catch (error) {
      console.warn('Failed to save conversations to localStorage:', error);
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
        connectionLost: false
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
      
      // Initialize conversation if it doesn't exist
      setConversations(prev => ({
        ...prev,
        [conversationId]: {
          ...getConversation(conversationId),
          isStreaming: true,
          error: null,
          currentResponse: '',
          lastHeartbeat: Date.now(), // Track start time
          connectionLost: false
        }
      }));

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
        // Handle heartbeat messages - keep connection alive, update last activity
        if (chunk.heartbeat) {
          const metaAny: any = chunk.meta || {};
          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              lastHeartbeat: Date.now(),
              reasoningWaitStart: metaAny.reasoning_wait && !prev[conversationId].reasoningWaitStart ? Date.now() : prev[conversationId].reasoningWaitStart,
              deepResearchStage: chunk.stage_message || prev[conversationId].deepResearchStage,
              thoughtTokens: metaAny.thought_tokens !== undefined ? metaAny.thought_tokens : prev[conversationId].thoughtTokens
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
            [conversationId]: { ...prev[conversationId], deepResearchStage: undefined, lastHeartbeat: Date.now(), reasoningWaitStart: undefined }
          }));
          return;
        }
        
        // Handle final chunk with done=true (usually contains estimated_cost)
        if (chunk.done && chunk.meta) {
          console.log(`[${conversationId}] Final chunk received with metadata:`, chunk.meta);
          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              messages: prev[conversationId].messages.map(msg => 
                msg.id === assistantMessage.id 
                  ? { 
                      ...msg, 
                      meta: {
                        ...msg.meta,
                        ...chunk.meta, // This should include estimated_cost
                        // Preserve flags
                        deep_research: msg.meta?.deep_research || chunk.meta?.deep_research,
                        reasoning: msg.meta?.reasoning || chunk.meta?.reasoning
                      }
                    }
                  : msg
              )
            }
          }));
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

      setConversations(prev => ({
        ...prev,
        [conversationId]: {
          ...prev[conversationId],
          isStreaming: false,
          currentResponse: '',
          deepResearchStage: undefined,
          connectionLost: false,
          lastHeartbeat: undefined
        }
      }));

      if (onComplete) {
        onComplete(fullResponse);
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      
      setConversations(prev => ({
        ...prev,
        [conversationId]: {
          ...prev[conversationId],
          isStreaming: false,
          error: errorMessage,
          currentResponse: '',
          deepResearchStage: undefined,
          connectionLost: false,
          lastHeartbeat: undefined
        }
      }));
      
      throw err;
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

  // Conversation compression (client-side summarization without backend roundtrip)
  const compressConversation = useCallback((conversationId: string) => {
    setConversations(prev => {
      const conv = prev[conversationId];
      if (!conv || conv.isStreaming || conv.summaryApplied) return prev;
      const MAX_PER_MESSAGE = 200;
      const parts: string[] = [];
      conv.messages.forEach(m => {
        if (m.role === 'system') return; // skip existing system
        const trimmed = m.content.replace(/\s+/g, ' ').slice(0, MAX_PER_MESSAGE);
        parts.push(`${m.role.toUpperCase()}: ${trimmed}${m.content.length > MAX_PER_MESSAGE ? '…' : ''}`);
      });
      const summaryText = `Summary of previous ${conv.messages.length} messages (compressed client-side)\n---\n` + parts.join('\n');
      const summaryMessage: Message = {
        id: Date.now().toString(),
        role: 'system',
        content: summaryText,
        timestamp: new Date().toISOString(),
        meta: { summary: true }
      } as any;
      return {
        ...prev,
        [conversationId]: {
          ...conv,
            messages: [summaryMessage],
            summaryApplied: true,
            deepResearchStage: '✅ История сжата (client-side)'
        }
      };
    });
  }, []);

  return {
    getConversation,
    sendMessage,
    clearConversation,
    deleteConversation,
    stopStreaming,
    recoverStuckRequest,
    compressConversation
  };
};
