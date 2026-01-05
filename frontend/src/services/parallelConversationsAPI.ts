/**
 * Parallel Conversations API Service
 * Handles communication with backend for parallel chat persistence
 */

import { ModelInfo } from '../types';

export interface ParallelConversation {
  id: string;
  title: string;
  shared_history_mode: boolean;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
  turns?: ParallelTurn[];
}

export interface ParallelTurn {
  id: string;
  conversation_id: string;
  user_message: string;
  turn_order: number;
  created_at: string;
  metadata?: Record<string, unknown>;
  responses: ParallelResponseData[];
}

export interface ParallelResponseData {
  id: string;
  turn_id: string;
  model_id: string;
  model_name: string;
  provider: string;
  content: string;
  enabled: boolean;
  tokens_in?: number;
  tokens_out?: number;
  thought_tokens?: number;
  estimated_cost?: number;
  total_latency?: number;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface CreateTurnRequest {
  user_message: string;
  responses: Array<{
    model_id: string;
    model_name: string;
    provider: string;
    content: string;
    enabled: boolean;
    tokens_in?: number;
    tokens_out?: number;
    thought_tokens?: number;
    estimated_cost?: number;
    total_latency?: number;
  }>;
  metadata?: Record<string, unknown>;
}

class ParallelConversationsAPI {
  private baseUrl = '/api/parallel';

  // ==================== CONVERSATIONS ====================

  async listConversations(limit = 50, offset = 0): Promise<ParallelConversation[]> {
    const response = await fetch(
      `${this.baseUrl}/conversations?limit=${limit}&offset=${offset}`
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || 'Failed to list conversations');
    }
    
    const data = await response.json();
    return data.conversations || [];
  }

  async createConversation(
    title = 'Parallel Chat',
    sharedHistoryMode = false,
    metadata?: Record<string, unknown>
  ): Promise<ParallelConversation> {
    const response = await fetch(`${this.baseUrl}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        shared_history_mode: sharedHistoryMode,
        metadata,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || 'Failed to create conversation');
    }
    
    const data = await response.json();
    return data.conversation;
  }

  async getConversation(conversationId: string): Promise<ParallelConversation | null> {
    const response = await fetch(`${this.baseUrl}/conversations/${conversationId}`);
    
    if (response.status === 404) {
      return null;
    }
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || 'Failed to get conversation');
    }
    
    const data = await response.json();
    return data.conversation;
  }

  async updateConversation(
    conversationId: string,
    updates: { title?: string; shared_history_mode?: boolean }
  ): Promise<ParallelConversation> {
    const params = new URLSearchParams();
    if (updates.title !== undefined) params.set('title', updates.title);
    if (updates.shared_history_mode !== undefined) {
      params.set('shared_history_mode', String(updates.shared_history_mode));
    }
    
    const response = await fetch(
      `${this.baseUrl}/conversations/${conversationId}?${params}`,
      { method: 'PUT' }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || 'Failed to update conversation');
    }
    
    const data = await response.json();
    return data.conversation;
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    const response = await fetch(
      `${this.baseUrl}/conversations/${conversationId}`,
      { method: 'DELETE' }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || 'Failed to delete conversation');
    }
    
    return true;
  }

  // ==================== TURNS ====================

  async addTurn(
    conversationId: string,
    request: CreateTurnRequest
  ): Promise<ParallelTurn> {
    const response = await fetch(
      `${this.baseUrl}/conversations/${conversationId}/turns`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || 'Failed to add turn');
    }
    
    const data = await response.json();
    return data.turn;
  }

  async deleteTurn(turnId: string): Promise<boolean> {
    const response = await fetch(
      `${this.baseUrl}/turns/${turnId}`,
      { method: 'DELETE' }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || 'Failed to delete turn');
    }
    
    return true;
  }

  // ==================== RESPONSES ====================

  async updateResponse(
    responseId: string,
    updates: { content?: string; enabled?: boolean; metadata?: Record<string, unknown> }
  ): Promise<ParallelResponseData> {
    const response = await fetch(
      `${this.baseUrl}/responses/${responseId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || 'Failed to update response');
    }
    
    const data = await response.json();
    return data.response;
  }

  async deleteResponse(responseId: string): Promise<boolean> {
    const response = await fetch(
      `${this.baseUrl}/responses/${responseId}`,
      { method: 'DELETE' }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || 'Failed to delete response');
    }
    
    return true;
  }

  async regenerateResponse(
    responseId: string,
    newContent: string,
    newMeta?: Record<string, unknown>
  ): Promise<ParallelResponseData> {
    const response = await fetch(
      `${this.baseUrl}/responses/${responseId}/regenerate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newContent,
          meta: newMeta,
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || 'Failed to regenerate response');
    }
    
    const data = await response.json();
    return data.response;
  }

  // ==================== HELPERS ====================

  /**
   * Convert frontend ConversationTurn format to API format
   */
  formatTurnForAPI(
    userMessage: string,
    responses: Array<{
      model: ModelInfo;
      content: string;
      enabled: boolean;
      meta?: {
        tokens_in?: number;
        tokens_out?: number;
        thought_tokens?: number;
        estimated_cost?: number;
        total_latency?: number;
      };
    }>
  ): CreateTurnRequest {
    return {
      user_message: userMessage,
      responses: responses.map(r => ({
        model_id: r.model.id,
        model_name: r.model.display_name || r.model.name,
        provider: r.model.provider,
        content: r.content,
        enabled: r.enabled,
        tokens_in: r.meta?.tokens_in,
        tokens_out: r.meta?.tokens_out,
        thought_tokens: r.meta?.thought_tokens,
        estimated_cost: r.meta?.estimated_cost,
        total_latency: r.meta?.total_latency,
      })),
    };
  }

  /**
   * Convert API ParallelTurn to frontend ConversationTurn format
   */
  formatTurnFromAPI(turn: ParallelTurn): {
    id: string;
    userMessage: string;
    timestamp: string;
    responses: Array<{
      model: ModelInfo;
      content: string;
      enabled: boolean;
      dbId: string; // Database ID for API calls
      meta?: {
        tokens_in?: number;
        tokens_out?: number;
        thought_tokens?: number;
        estimated_cost?: number;
        total_latency?: number;
      };
    }>;
  } {
    return {
      id: turn.id,
      userMessage: turn.user_message,
      timestamp: turn.created_at,
      responses: turn.responses.map(r => ({
        model: {
          id: r.model_id,
          name: r.model_id,
          display_name: r.model_name,
          provider: r.provider as ModelInfo['provider'],
          capabilities: [] as string[],
          context_length: 128000,
          supports_streaming: true,
          type: 'chat' as const,
        } as ModelInfo,
        content: r.content,
        enabled: r.enabled,
        dbId: r.id,
        meta: {
          tokens_in: r.tokens_in ?? undefined,
          tokens_out: r.tokens_out ?? undefined,
          thought_tokens: r.thought_tokens ?? undefined,
          estimated_cost: r.estimated_cost ?? undefined,
          total_latency: r.total_latency ?? undefined,
        },
      })),
    };
  }
}

// Export singleton instance
export const parallelAPI = new ParallelConversationsAPI();
export default parallelAPI;
