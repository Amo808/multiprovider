import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api';
import {
  ModelProvider,
  ModelInfo,
  ProviderStatus,
  AppConfig,
  Message,
  ChatResponse,
  SendMessageRequest,
  GenerationConfig,
  HealthResponse,
  ConversationData
} from '../types';

// Provider hooks
export const useProviders = () => {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.getProviders();
      setProviders(response.providers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch providers');
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleProvider = useCallback(async (providerId: ModelProvider, enabled: boolean) => {
    const updatedProvider = await apiClient.toggleProvider(providerId, enabled);
    setProviders(prev => 
      prev.map(p => p.id === providerId ? updatedProvider : p)
    );
    return updatedProvider;
  }, []);

  const refreshModels = useCallback(async (providerId: ModelProvider) => {
    try {
      // Update provider status to show loading
      setProviders(prev => 
        prev.map(p => p.id === providerId ? { ...p, loading: true, error: undefined } : p)
      );
      
      const response = await apiClient.refreshProviderModels(providerId);
      
      // Update provider with success status
      setProviders(prev => 
        prev.map(p => p.id === providerId ? { 
          ...p, 
          loading: false, 
          error: undefined,
          connected: true,
          modelsCount: response.models?.length || 0
        } : p)
      );
      
      return response;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to refresh models';
      
      // Update provider with error status
      setProviders(prev => 
        prev.map(p => p.id === providerId ? { 
          ...p, 
          loading: false, 
          error: errorMsg,
          connected: false
        } : p)
      );
      
      throw new Error(errorMsg);
    }
  }, []);

  const testProvider = useCallback(async (providerId: ModelProvider) => {
    try {
      // Update provider status to show loading
      setProviders(prev => 
        prev.map(p => p.id === providerId ? { ...p, loading: true, error: undefined } : p)
      );
      
      const response = await apiClient.testProvider(providerId);
      
      // Update provider with test result
      setProviders(prev => 
        prev.map(p => p.id === providerId ? { 
          ...p, 
          loading: false, 
          error: response.success ? undefined : response.error || 'Test failed',
          connected: response.success
        } : p)
      );
      
      return response;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Connection test failed';
      
      // Update provider with error status
      setProviders(prev => 
        prev.map(p => p.id === providerId ? { 
          ...p, 
          loading: false, 
          error: errorMsg,
          connected: false
        } : p)
      );
      
      return { success: false, error: errorMsg };
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  return {
    providers,
    loading,
    error,
    fetchProviders,
    toggleProvider,
    refreshModels,
    testProvider
  };
};

// Models hook
export const useModels = (providerId?: ModelProvider) => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const modelsList = await apiClient.getModels(providerId);
      setModels(modelsList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models');
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  const toggleModel = useCallback(async (modelProviderId: ModelProvider, modelId: string, enabled: boolean) => {
    const updatedModel = await apiClient.toggleModel(modelProviderId, modelId, enabled);
    setModels(prev => 
      prev.map(m => m.id === modelId && m.provider === modelProviderId ? updatedModel : m)
    );
    return updatedModel;
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  return {
    models,
    loading,
    error,
    fetchModels,
    toggleModel
  };
};

// Config hook
interface UseConfigOptions { skipInitialFetch?: boolean }
export const useConfig = (options?: UseConfigOptions) => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      console.log('Fetching config...');
      setLoading(true);
      setError(null);
      const appConfig = await apiClient.getConfig();
      console.log('Config received:', appConfig);
      setConfig(appConfig);
    } catch (err) {
      console.error('Config fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch config');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateConfig = useCallback(async (updates: Partial<AppConfig>) => {
    try {
      console.log('Updating config with:', updates);
      const updatedConfig = await apiClient.updateConfig(updates);
      console.log('Received updated config:', updatedConfig);
      setConfig(updatedConfig);
      return updatedConfig;
    } catch (err) {
      console.error('Failed to update config:', err);
      throw err;
    }
  }, []);

  const updateGenerationConfig = useCallback(async (generationConfig: Partial<GenerationConfig>) => {
    const updatedGenerationConfig = await apiClient.updateGenerationConfig(generationConfig);
    if (config) {
      setConfig({
        ...config,
        generation: { ...config.generation, ...updatedGenerationConfig }
      });
    }
    return updatedGenerationConfig;
  }, [config]);

  const resetConfig = useCallback(async () => {
    const resetConfig = await apiClient.resetConfig();
    setConfig(resetConfig);
    return resetConfig;
  }, []);

  useEffect(() => {
    if (!options?.skipInitialFetch) {
      fetchConfig();
    } else {
      console.log('useConfig: skipping initial fetch until auth ready (set loading false)');
      setLoading(false);
    }
  }, [fetchConfig, options?.skipInitialFetch]);

  return {
    config,
    loading,
    error,
    fetchConfig,
    updateConfig,
    updateGenerationConfig,
    resetConfig
  };
};

// Chat hook
export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentResponse, setCurrentResponse] = useState<string>('');

  const sendMessage = useCallback(async (
    request: SendMessageRequest,
    onComplete?: (response: string) => void
  ) => {
    try {
      setIsStreaming(true);
      setError(null);
      setCurrentResponse('');
      
      // Add user message immediately
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: request.message,
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, userMessage]);

      let fullResponse = '';
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);

      await apiClient.sendMessage(request, (chunk: ChatResponse) => {
        if (chunk.content) {
          fullResponse += chunk.content;
          setCurrentResponse(fullResponse);
          
          // Update the assistant message
          setMessages(prev => 
            prev.map(msg => 
              msg.id === assistantMessage.id 
                ? { ...msg, content: fullResponse, meta: chunk.meta }
                : msg
            )
          );
        }
      });

      if (onComplete) {
        onComplete(fullResponse);
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      console.log('useChat: Error caught:', errorMessage);
      
      // Check if it's an API key error - if so, don't add to chat, just rethrow
      const isApiKeyError = errorMessage.includes('API_KEY_MISSING') || 
                           errorMessage.includes('API key is required') || 
                           errorMessage.includes('API key for') || 
                           errorMessage.includes('not configured') ||
                           errorMessage.includes('Invalid API key') ||
                           errorMessage.includes('(API_KEY_MISSING)');
                           
      if (isApiKeyError) {
        console.log('useChat: API key error detected, removing empty assistant message and rethrowing');
        // Remove the empty assistant message that was added earlier
        setMessages(prev => {
          console.log('useChat: Messages before removal:', prev.length);
          const filtered = prev.slice(0, -1);
          console.log('useChat: Messages after removal:', filtered.length);
          return filtered;
        });
        setError(null); // Clear error state, let ChatInterface handle the modal
        throw err; // Rethrow to be handled by ChatInterface
      }
      
      console.log('useChat: Non-API key error, adding to chat');
      setError(errorMessage);
      
      // For other errors, add error message to chat as before
      const errorMsg: Message = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: `Error: ${errorMessage}`,
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsStreaming(false);
      setCurrentResponse('');
    }
  }, []);

  const loadHistory = useCallback(async (conversationId?: string) => {
    try {
      const history = await apiClient.getHistory(conversationId);
      setMessages(history);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    }
  }, []);

  const clearHistory = useCallback(async (conversationId?: string) => {
    await apiClient.clearHistory(conversationId);
    setMessages([]);
  }, []);

  return {
    messages,
    isStreaming,
    error,
    currentResponse,
    sendMessage,
    loadHistory,
    clearHistory,
    setMessages
  };
};

// Health hook
export const useHealth = (interval: number = 30000) => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      setError(null);
      const healthData = await apiClient.healthCheck();
      setHealth(healthData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    
    const intervalId = setInterval(checkHealth, interval);
    
    return () => clearInterval(intervalId);
  }, [checkHealth, interval]);

  return {
    health,
    loading,
    error,
    checkHealth
  };
};

// Conversations hook
export const useConversations = () => {
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const conversationsList = await apiClient.getConversations();
      // Ensure we always set an array
      setConversations(Array.isArray(conversationsList) ? conversationsList : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch conversations');
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteConversation = useCallback(async (conversationId: string) => {
    await apiClient.deleteConversation(conversationId);
    setConversations(prev => {
      // Ensure prev is an array
      if (!Array.isArray(prev)) {
        console.warn('Conversations state is not an array:', prev);
        return [];
      }
      return prev.filter(c => c.id !== conversationId);
    });
  }, []);

  const renameConversation = useCallback(async (conversationId: string, title: string) => {
    const updated = await apiClient.renameConversation(conversationId, title);
    setConversations(prev => 
      prev.map(c => c.id === conversationId ? { ...c, title } : c)
    );
    return updated;
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return {
    conversations,
    loading,
    error,
    fetchConversations,
    deleteConversation,
    renameConversation
  };
};
