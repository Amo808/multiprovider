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

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  // Chat Methods
  async sendMessage(
    request: SendMessageRequest,
    onChunk?: (chunk: ChatResponse) => void
  ): Promise<void> {
    console.log('API Client: Sending message request:', request);
    
    const response = await fetch(`${this.baseUrl}/chat/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...request,
        stream: true
      })
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
    
    return response.json();
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

    const data: ConfigResponse = await response.json();
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
