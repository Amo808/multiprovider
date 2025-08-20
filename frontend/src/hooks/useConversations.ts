import { useState, useCallback } from 'react';
import { Message, SendMessageRequest, ChatResponse } from '../types';
import { apiClient } from '../services/api';

interface ConversationState {
  messages: Message[];
  isStreaming: boolean;
  error: string | null;
  currentResponse: string;
}

interface ConversationsState {
  [conversationId: string]: ConversationState;
}

export const useConversations = () => {
  const [conversations, setConversations] = useState<ConversationsState>({});

  const getConversation = useCallback((conversationId: string): ConversationState => {
    return conversations[conversationId] || {
      messages: [],
      isStreaming: false,
      error: null,
      currentResponse: ''
    };
  }, [conversations]);

  const sendMessage = useCallback(async (
    conversationId: string,
    request: SendMessageRequest,
    onComplete?: (response: string) => void
  ) => {
    try {
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
        timestamp: new Date().toISOString()
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
        timestamp: new Date().toISOString()
      };

      setConversations(prev => ({
        ...prev,
        [conversationId]: {
          ...prev[conversationId],
          messages: [...prev[conversationId].messages, assistantMessage]
        }
      }));

      await apiClient.sendMessage(request, (chunk: ChatResponse) => {
        if (chunk.content) {
          fullResponse += chunk.content;
          
          // Update the assistant message
          setConversations(prev => ({
            ...prev,
            [conversationId]: {
              ...prev[conversationId],
              currentResponse: fullResponse,
              messages: prev[conversationId].messages.map(msg => 
                msg.id === assistantMessage.id 
                  ? { ...msg, content: fullResponse, meta: chunk.meta }
                  : msg
              )
            }
          }));
        }
      });

      setConversations(prev => ({
        ...prev,
        [conversationId]: {
          ...prev[conversationId],
          isStreaming: false,
          currentResponse: ''
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
          currentResponse: ''
        }
      }));
      
      throw err;
    }
  }, [getConversation]);

  const clearConversation = useCallback((conversationId: string) => {
    setConversations(prev => ({
      ...prev,
      [conversationId]: {
        messages: [],
        isStreaming: false,
        error: null,
        currentResponse: ''
      }
    }));
  }, []);

  const deleteConversation = useCallback((conversationId: string) => {
    setConversations(prev => {
      const newConversations = { ...prev };
      delete newConversations[conversationId];
      return newConversations;
    });
  }, []);

  return {
    getConversation,
    sendMessage,
    clearConversation,
    deleteConversation
  };
};
