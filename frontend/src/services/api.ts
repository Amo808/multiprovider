import {
  ModelProvider,
  SendMessageRequest,
  ChatResponse,
  Message,
  ModelInfo,
  ProviderStatus,
  ProviderListResponse,
  ModelsResponse,
  AppConfig,
  ConfigResponse,
  HealthResponse,
  GenerationConfig
} from '../types';

const API_BASE_URL = '/api';

export class ApiClient {
  private baseUrl: string;
  private activeRequests: Map<string, AbortController> = new Map();
  private getAuthHeaders: (() => Record<string, string>) | null = null;
  private onUnauthorized: (() => void) | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  setAuthHeadersProvider(provider: () => Record<string, string>) {
    this.getAuthHeaders = provider;
  }

  setUnauthorizedCallback(callback: () => void) {
    this.onUnauthorized = callback;
  }

  private handleUnauthorized() {
    console.log('API Client: 401 Unauthorized - triggering logout');
    // Clear stored token
    localStorage.removeItem('jwt_token');
    // Clear auth headers
    this.getAuthHeaders = null;
    // Trigger logout callback
    if (this.onUnauthorized) {
      this.onUnauthorized();
    }
  }

  private getHeaders(): Record<string, string> {
    const baseHeaders = { 'Content-Type': 'application/json' };
    const authHeaders = this.getAuthHeaders?.() || {};
    const headers = { ...baseHeaders, ...authHeaders };
    
    // Log when auth headers are present
    if (authHeaders.Authorization) {
      console.log('[API] Request with auth header, token length:', authHeaders.Authorization.length);
    } else {
      console.log('[API] Request without auth header');
    }
    
    return headers;
  }

  // Authentication method
  async post(endpoint: string, data: any): Promise<{ data: any }> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.handleUnauthorized();
      }
      const errorData = await response.json().catch(() => ({}));
      throw {
        response: {
          status: response.status,
          data: errorData
        }
      };
    }

    const result = await response.json();
    return { data: result };
  }

  // Chat Methods
  async sendMessage(
    request: SendMessageRequest,
    onChunk?: (chunk: ChatResponse) => void,
    requestId?: string
  ): Promise<void> {
    const reqId = requestId || `${request.conversation_id}-${Date.now()}`;
    console.log('API Client: Sending message request:', request, 'requestId:', reqId);
    
    // Create abort controller for this request
    const abortController = new AbortController();
    this.activeRequests.set(reqId, abortController);
    
    // No timeout - allow infinite response time
    console.log('API Client: No timeout set - allowing unlimited response time');
    
    try {
      const response = await fetch(`${this.baseUrl}/chat/send`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          ...request,
          stream: true
        }),
        signal: abortController.signal
      });

      console.log('API Client: Response status:', response.status, response.statusText);

      if (!response.ok) {
        if (response.status === 401) {
          this.handleUnauthorized();
        }
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error('API Client: Request failed:', errorData);
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = ''; // Buffer for incomplete SSE messages
      
      while (true) {
        // Check if request was aborted
        if (abortController.signal.aborted) {
          console.log('API Client: Request aborted');
          throw new Error('Request aborted');
        }
        
        const { done, value } = await reader.read();
        
        if (done) break;
        
        // Append new chunk to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete SSE events (separated by double newline)
        const events = buffer.split('\n\n');
        // Keep the last (possibly incomplete) event in the buffer
        buffer = events.pop() || '';
        
        for (const event of events) {
          const lines = event.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
            try {
              const data: ChatResponse = JSON.parse(line.slice(6));
              
              // Enhanced logging for reasoning/thinking content debugging
              if (data.meta?.thinking || data.meta?.reasoning_content) {
                console.log('API Client: REASONING chunk received:', {
                  thinking: data.meta.thinking?.substring(0, 100),
                  reasoning_content: data.meta.reasoning_content?.substring(0, 100),
                  thought_tokens: data.meta.thought_tokens,
                  done: data.done
                });
              } else if (data.done) {
                console.log('API Client: FINAL chunk:', {
                  done: data.done,
                  hasContent: !!data.content,
                  hasMeta: !!data.meta,
                  thought_tokens: data.meta?.thought_tokens,
                  reasoning_content_len: data.meta?.reasoning_content?.length || 0,
                  thought_content_len: data.meta?.thought_content?.length || 0
                });
              } else {
                console.log('API Client: Parsed data:', data);
              }
              
              if (data.error) {
                console.error('API Client: Error in data:', data.error, 'type:', data.type);
                // Send error through onChunk callback instead of throwing
                // This allows the UI to handle errors gracefully
                if (onChunk) {
                  onChunk({
                    ...data,
                    done: true // Mark as done so streaming stops
                  });
                }
                return; // Exit gracefully instead of throwing
              }
              
              if (onChunk) {
                onChunk(data);
              }
              
              if (data.done) {
                return;
              }
            } catch (e) {
              if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
                console.error('API Client: Parse error:', e);
                // Send parse error through callback if possible
                if (onChunk) {
                  onChunk({
                    error: `Parse error: ${e.message}`,
                    done: true
                  });
                }
                return;
              }
            }
          }
          } // end for (const line of lines)
        } // end for (const event of events)
      } // end while (true)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('API Client: Request was aborted');
        throw new Error('Request cancelled');
      }
      throw error;
    } finally {
      // Clean up the request
      this.activeRequests.delete(reqId);
    }
  }

  // Method to abort a specific request
  abortRequest(requestId: string): void {
    const controller = this.activeRequests.get(requestId);
    if (controller) {
      console.log('API Client: Aborting request:', requestId);
      controller.abort();
      this.activeRequests.delete(requestId);
    }
  }

  // Method to abort all active requests  
  abortAllRequests(): void {
    console.log('API Client: Aborting all active requests');
    this.activeRequests.forEach((controller) => {
      controller.abort();
    });
    this.activeRequests.clear();
  }

  // Provider Management
  async getProviders(): Promise<ProviderListResponse> {
    const response = await fetch(`${this.baseUrl}/providers`, {
      headers: this.getHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }

  async toggleProvider(providerId: ModelProvider, enabled: boolean): Promise<ProviderStatus> {
    const response = await fetch(`${this.baseUrl}/providers/${providerId}/toggle`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ enabled })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async updateProviderConfig(
    providerId: ModelProvider, 
    config: { api_key?: string; enabled?: boolean }
  ): Promise<void> {
    console.log('API: Updating provider config for', providerId, config);
    const response = await fetch(`${this.baseUrl}/providers/${providerId}/config`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(config)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      console.error('API: Failed to update provider config:', errorData.error);
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('API: Provider config updated:', result);
  }

  async refreshProviderModels(providerId: ModelProvider): Promise<ModelsResponse> {
    const response = await fetch(`${this.baseUrl}/providers/${providerId}/models/refresh`, {
      method: 'POST',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // Model Management
  async getModels(providerId?: ModelProvider): Promise<ModelInfo[]> {
    const url = providerId 
      ? `${this.baseUrl}/models?provider=${providerId}`
      : `${this.baseUrl}/models`;
    
    const response = await fetch(url, { headers: this.getHeaders() });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.models || data;
  }

  async getModel(providerId: ModelProvider, modelId: string): Promise<ModelInfo> {
    const response = await fetch(`${this.baseUrl}/models/${providerId}/${modelId}`, { headers: this.getHeaders() });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }

  async toggleModel(providerId: ModelProvider, modelId: string, enabled: boolean): Promise<ModelInfo> {
    const response = await fetch(`${this.baseUrl}/models/${providerId}/${modelId}/toggle`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ enabled })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // History and Conversations
  async getHistory(conversationId?: string): Promise<Message[]> {
    const url = conversationId 
      ? `${this.baseUrl}/history/${conversationId}`
      : `${this.baseUrl}/history`;
    
    const response = await fetch(url, { headers: this.getHeaders() });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.messages || data;
  }

  async clearHistory(conversationId?: string): Promise<{ success: boolean } | { message: string }> {
    const url = conversationId 
      ? `${this.baseUrl}/history/${conversationId}`
      : `${this.baseUrl}/history`;
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }

  async getConversations(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/conversations`, { headers: this.getHeaders() });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    // Ensure we always return an array
    if (data && Array.isArray(data.conversations)) {
      return data.conversations;
    } else if (Array.isArray(data)) {
      return data;
    } else {
      console.warn('API returned non-array conversations data:', data);
      return [];
    }
  }

  async createConversation(conversationId: string, title: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/conversations`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ id: conversationId, title })
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async deleteConversation(conversationId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async renameConversation(conversationId: string, title: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/conversations/${conversationId}/title`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ title })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // Configuration Management
  async getConfig(): Promise<AppConfig> {
    console.log('API: Fetching config from', `${this.baseUrl}/config`);
    const response = await fetch(`${this.baseUrl}/config`, { headers: this.getHeaders() });
    
    if (!response.ok) {
      console.error('API: Config request failed:', response.status, response.statusText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data: ConfigResponse = await response.json();
    console.log('API: Config response:', data);
    return data.config;
  }

  async updateConfig(config: Partial<AppConfig>): Promise<AppConfig> {
    const response = await fetch(`${this.baseUrl}/config`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(config)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.config;
  }

  async updateGenerationConfig(config: Partial<GenerationConfig>): Promise<GenerationConfig> {
    // Supports extended GPT-5 params: verbosity, reasoning_effort, cfg_scale, free_tool_calling, grammar_definition, tools
    const response = await fetch(`${this.baseUrl}/config/generation`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(config)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      console.error('API: updateGenerationConfig failed', response.status, errorData);
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    console.log('API: updateGenerationConfig result', data);
    return data;
  }

  /**
   * Auto-discover models from all providers.
   * Fetches the latest model list from each provider's API and updates config.
   */
  async discoverModels(force: boolean = false): Promise<{
    message: string;
    summary: {
      providers_checked: number;
      new_models_found: number;
      models_updated: number;
      providers: Record<string, number>;
    };
    discovered: Record<string, Array<{
      id: string;
      name: string;
      display_name: string;
      provider: string;
      context_length: number;
      supports_streaming: boolean;
      supports_vision: boolean;
    }>>;
  }> {
    const response = await fetch(`${this.baseUrl}/config/discover-models?force=${force}`, {
      method: 'POST',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('API: discoverModels result', data);
    return data;
  }

  // Per-model settings management
  async getModelSettings(provider: ModelProvider, modelId: string): Promise<{
    settings: Partial<GenerationConfig> & { system_prompt?: string };
    provider: string;
    model_id: string;
  }> {
    const response = await fetch(`${this.baseUrl}/config/model-settings/${provider}/${modelId}`, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { settings: {}, provider, model_id: modelId };
      }
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`API: getModelSettings for ${provider}:${modelId}:`, data);
    return data;
  }

  async updateModelSettings(
    provider: ModelProvider, 
    modelId: string, 
    settings: Partial<GenerationConfig> & { system_prompt?: string }
  ): Promise<{
    settings: Partial<GenerationConfig> & { system_prompt?: string };
    provider: string;
    model_id: string;
  }> {
    const response = await fetch(`${this.baseUrl}/config/model-settings/${provider}/${modelId}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(settings)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      console.error('API: updateModelSettings failed', response.status, errorData);
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`API: updateModelSettings for ${provider}:${modelId}:`, data);
    return data;
  }

  async getAllModelSettings(): Promise<Record<string, Partial<GenerationConfig> & { system_prompt?: string }>> {
    const response = await fetch(`${this.baseUrl}/config/model-settings`, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.model_settings || {};
  }

  async resetConfig(): Promise<AppConfig> {
    const response = await fetch(`${this.baseUrl}/config/reset`, {
      method: 'POST',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: ConfigResponse = await response.json();
    return data.config;
  }

  // System and Health
  async healthCheck(): Promise<HealthResponse> {
    // Health can remain unauthenticated if desired, leave without auth headers
    const response = await fetch(`${this.baseUrl}/health`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }

  async testProvider(providerId: ModelProvider): Promise<{ success: boolean; error?: string }> {
    const response = await fetch(`${this.baseUrl}/providers/${providerId}/test`, {
      method: 'POST',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // Import/Export
  async exportConversations(): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/export/conversations`, { headers: this.getHeaders() });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.blob();
  }

  async importConversations(file: File): Promise<{ success: boolean; imported: number }> {
    const formData = new FormData();
    formData.append('file', file);

    const authHeaders = this.getAuthHeaders?.() || {};

    const response = await fetch(`${this.baseUrl}/import/conversations`, {
      method: 'POST',
      headers: authHeaders, // Let browser set multipart boundary; don't include Content-Type manually
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // Utility Methods
  async validateApiKey(providerId: ModelProvider, apiKey: string): Promise<{ valid: boolean; error?: string }> {
    const response = await fetch(`${this.baseUrl}/providers/${providerId}/validate-key`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ api_key: apiKey })
    });

    if (!response.ok) {
      return { valid: false, error: response.statusText };
    }

    return response.json();
  }

  async googleLogin(idToken: string): Promise<string> {
    const response = await fetch(`/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken })
    });
    if (!response.ok) {
      throw new Error('Google authentication failed');
    }
    const data = await response.json();
    return data.access_token;
  }

  async getUsageStats(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/stats/usage`, { headers: this.getHeaders() });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // ============================================================================
  // MESSAGE REORDERING API
  // ============================================================================

  /**
   * Reorder messages in a conversation.
   * Supported operations: swap, move_up, move_down, move_to, reverse, sort_time, sort_role, interleave
   */
  async reorderMessages(params: {
    conversation_id: string;
    operation: 'swap' | 'move_up' | 'move_down' | 'move_to' | 'reverse' | 'sort_time' | 'sort_role' | 'interleave' | 'remove' | 'duplicate';
    index?: number;
    index1?: number;
    index2?: number;
    from_index?: number;
    to_index?: number;
    ascending?: boolean;
  }): Promise<{
    success: boolean;
    operation: string;
    message_count: number;
    preview: Array<{
      index: number;
      role: string;
      content_preview: string;
      compressed: boolean;
      timestamp: string;
    }>;
    messages: Array<{
      id: string;
      role: string;
      content: string;
      timestamp: string;
      meta?: Record<string, any>;
    }>;
  }> {
    const response = await fetch(`${this.baseUrl}/messages/reorder`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.handleUnauthorized();
      }
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get preview of messages in a conversation with reordering info
   */
  async getMessagesPreview(conversationId: string): Promise<{
    conversation_id: string;
    message_count: number;
    preview: Array<{
      index: number;
      role: string;
      content_preview: string;
      compressed: boolean;
      timestamp: string;
    }>;
  }> {
    const response = await fetch(`${this.baseUrl}/messages/preview/${conversationId}`, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.handleUnauthorized();
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get context compression statistics
   */
  async getCompressionStats(): Promise<{
    active_sessions: number;
    total_messages: number;
    total_compressed: number;
    tokens_saved: number;
    sessions: Record<string, any>;
  }> {
    const response = await fetch(`${this.baseUrl}/context/stats`, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.handleUnauthorized();
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // === MULTI-MODEL METHODS ===

  /**
   * Get multi-model presets
   */
  async getMultiModelPresets(): Promise<Record<string, {
    name: string;
    description: string;
    mode: string;
    models: Array<{
      provider: string;
      model: string;
      display_name?: string;
      weight: number;
      timeout: number;
      enabled: boolean;
    }>;
  }>> {
    const response = await fetch(`${this.baseUrl}/multi-model/presets`, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.presets || {};
  }

  /**
   * Cancel multi-model execution
   */
  async cancelMultiModelExecution(executionId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/multi-model/cancel/${executionId}`, {
      method: 'POST',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // === MESSAGE DATABASE METHODS ===

  /**
   * Search messages using full-text search
   */
  async searchMessages(query: string, conversationId?: string, limit: number = 50): Promise<{
    results: Array<{
      id: string;
      conversation_id: string;
      role: string;
      content: string;
      timestamp: string;
      snippet?: string;
    }>;
    count: number;
  }> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (conversationId) {
      params.set('conversation_id', conversationId);
    }

    const response = await fetch(`${this.baseUrl}/messages/search?${params}`, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get thinking/reasoning steps for a message
   */
  async getThinkingSteps(messageId: string): Promise<{
    message_id: string;
    steps: Array<{
      id: string;
      step_index: number;
      stage: string;
      content: string;
      duration_ms?: number;
      tokens_used?: number;
      timestamp: string;
    }>;
  }> {
    const response = await fetch(`${this.baseUrl}/messages/${messageId}/thinking`, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get multi-model responses for a message
   */
  async getMultiModelResponses(messageId: string): Promise<{
    message_id: string;
    responses: Array<{
      id: string;
      provider: string;
      model: string;
      content: string;
      latency_ms?: number;
      tokens_used?: number;
      success: boolean;
      error?: string;
    }>;
  }> {
    const response = await fetch(`${this.baseUrl}/messages/${messageId}/multi-model`, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Add feedback to a message
   */
  async addMessageFeedback(
    messageId: string,
    feedbackType: 'like' | 'dislike' | 'flag' | 'regenerate',
    comment?: string
  ): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/messages/${messageId}/feedback`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ feedback_type: feedbackType, comment })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Soft delete a message
   */
  async deleteMessage(messageId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/messages/${messageId}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get message statistics
   */
  async getMessageStats(conversationId?: string): Promise<{
    total_messages: number;
    by_role: Record<string, number>;
    tokens: {
      total_in: number;
      total_out: number;
      total_thinking: number;
      estimated_cost: number;
    };
  }> {
    const params = conversationId ? `?conversation_id=${conversationId}` : '';
    const response = await fetch(`${this.baseUrl}/messages/stats${params}`, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // === PROCESS EVENTS METHODS ===

  /**
   * Get processes for a conversation
   */
  async getProcesses(conversationId: string): Promise<{
    conversation_id: string;
    processes: Array<{
      id: string;
      type: string;
      name: string;
      status: string;
      progress: number;
      steps: Array<{
        id: string;
        name: string;
        status: string;
        message: string;
        progress: number;
      }>;
      started_at?: string;
      completed_at?: string;
      error?: string;
      metadata: Record<string, any>;
    }>;
  }> {
    const response = await fetch(`${this.baseUrl}/processes/${conversationId}`, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }
}

export const apiClient = new ApiClient();
