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

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...request,
          stream: true
        }),
        signal: abortController.signal
      });

      console.log('API Client: Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error('API Client: Request failed:', errorData);
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      
      while (true) {
        // Check if request was aborted
        if (abortController.signal.aborted) {
          console.log('API Client: Request aborted');
          throw new Error('Request aborted');
        }
        
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = decoder.decode(value);
        console.log('API Client: Received chunk:', chunk);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data: ChatResponse = JSON.parse(line.slice(6));
              console.log('API Client: Parsed data:', data);
              
              // Handle heartbeat messages for GPT-5 Render bypass
              if ((data as any).heartbeat) {
                const elapsed = (data as any).elapsed || 0;
                const model = (data as any).model || 'GPT-5';
                console.log(`API Client: Heartbeat from ${model} - ${elapsed.toFixed(1)}s elapsed`);
                continue; // Skip processing heartbeat as regular content
              }
              
              if (data.error) {
                console.error('API Client: Error in data:', data.error, 'type:', data.type);
                // Create error with the original error message and include type info
                const errorMsg = `${data.error}${data.type ? ` (${data.type})` : ''}`;
                throw new Error(errorMsg);
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
                throw e;
              }
            }
          }
        }
      }
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

  // Method to continue a GPT-5 response that was cut off due to timeout
  async continueGpt5Response(
    request: { conversation_id: string; model: string; partial_content: string },
    onChunk?: (chunk: ChatResponse) => void
  ): Promise<void> {
    console.log('API Client: Continuing GPT-5 response:', request);
    
    try {
      const response = await fetch(`${this.baseUrl}/chat/continue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.trim() && line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (onChunk) {
                onChunk(data);
              }
              
              if (data.done) {
                return;
              }
            } catch (e) {
              if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
                console.error('API Client: Parse error in continuation:', e);
                throw e;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('API Client: Error in continuation:', error);
      throw error;
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
    const response = await fetch(`${this.baseUrl}/providers`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }

  async toggleProvider(providerId: ModelProvider, enabled: boolean): Promise<ProviderStatus> {
    const response = await fetch(`${this.baseUrl}/providers/${providerId}/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
      headers: {
        'Content-Type': 'application/json',
      },
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
      method: 'POST'
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
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.models || data;
  }

  async getModel(providerId: ModelProvider, modelId: string): Promise<ModelInfo> {
    const response = await fetch(`${this.baseUrl}/models/${providerId}/${modelId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }

  async toggleModel(providerId: ModelProvider, modelId: string, enabled: boolean): Promise<ModelInfo> {
    const response = await fetch(`${this.baseUrl}/models/${providerId}/${modelId}/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.messages || data;
  }

  async clearHistory(conversationId?: string): Promise<{ success: boolean }> {
    const url = conversationId 
      ? `${this.baseUrl}/history/${conversationId}`
      : `${this.baseUrl}/history`;
    
    const response = await fetch(url, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }

  async getConversations(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/conversations`);
    
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

  async deleteConversation(conversationId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/conversations/${conversationId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async renameConversation(conversationId: string, title: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/conversations/${conversationId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
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
    const response = await fetch(`${this.baseUrl}/config`);
    
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
      headers: {
        'Content-Type': 'application/json',
      },
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
    const response = await fetch(`${this.baseUrl}/config/generation`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async resetConfig(): Promise<AppConfig> {
    const response = await fetch(`${this.baseUrl}/config/reset`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: ConfigResponse = await response.json();
    return data.config;
  }

  // System and Health
  async healthCheck(): Promise<HealthResponse> {
    const response = await fetch(`${this.baseUrl}/health`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }

  async testProvider(providerId: ModelProvider): Promise<{ success: boolean; error?: string }> {
    const response = await fetch(`${this.baseUrl}/providers/${providerId}/test`, {
      method: 'POST'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // Import/Export
  async exportConversations(): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/export/conversations`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.blob();
  }

  async importConversations(file: File): Promise<{ success: boolean; imported: number }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/import/conversations`, {
      method: 'POST',
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
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ api_key: apiKey })
    });

    if (!response.ok) {
      return { valid: false, error: response.statusText };
    }

    return response.json();
  }

  async getUsageStats(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/stats/usage`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }
}

export const apiClient = new ApiClient();
