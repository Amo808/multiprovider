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
        deepResearchStage: undefined
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
          currentResponse: ''
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
        // Handle Deep Research stages
        if (chunk.stage_message) {
          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              deepResearchStage: chunk.stage_message,
              // Also update the assistant message meta to mark it as deep research
              messages: prev[conversationId].messages.map(msg => 
                msg.id === assistantMessage.id 
                  ? { 
                      ...msg, 
                      meta: {
                        ...msg.meta,
                        ...chunk.meta,
                        deep_research: true // Mark this message as using deep research
                      }
                    }
                  : msg
              )
            }
          }));
          return; // Don't process as regular content
        }
        
        // Handle final chunk with done=true (usually contains estimated_cost)
        if (chunk.done && chunk.meta) {
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
              messages: prev[conversationId].messages.map(msg => 
                msg.id === assistantMessage.id 
                  ? { 
                      ...msg, 
                      content: fullResponse, 
                      meta: {
                        ...msg.meta,
                        ...chunk.meta,
                        // Preserve deep_research flag if it was set
                        deep_research: msg.meta?.deep_research || chunk.meta?.deep_research
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
          deepResearchStage: undefined
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
          deepResearchStage: undefined
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

  return {
    getConversation,
    sendMessage,
    clearConversation,
    deleteConversation,
    stopStreaming
  };
};
