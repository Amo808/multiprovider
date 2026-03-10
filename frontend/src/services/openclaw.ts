/**
 * OpenClaw Gateway Service
 * API client for Multech ↔ OpenClaw Gateway communication
 */

const API_BASE = '/api/openclaw';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('jwt_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export interface OpenClawStatus {
  configured: boolean;
  gateway_url: string;
  ws_url: string;
  ws_connected: boolean;
  hooks_configured: boolean;
  health: {
    status: number;
    healthy: boolean;
    error?: string;
  };
  gateway_process: {
    status: 'stopped' | 'starting' | 'running' | 'error' | 'not_installed';
    method: string;
    port: number;
    pid: number | null;
    uptime_seconds: number;
    error: string | null;
    cli_path: string | null;
    restart_count: number;
    log_lines: number;
  };
}

export interface OpenClawSendRequest {
  message: string;
  session_key?: string;
  agent_id?: string;
  deliver?: boolean;
  channel?: string;
  model?: string;
  thinking?: string;
  timeout_seconds?: number;
}

export interface OpenClawStreamEvent {
  type: 'content' | 'thinking' | 'status' | 'done' | 'error' | 'pending' | 'stream_end';
  data: string;
  run_id?: string;
  session_key?: string;
}

export const openclawService = {
  /**
   * Get OpenClaw Gateway connection status
   */
  async getStatus(): Promise<OpenClawStatus> {
    const resp = await fetch(`${API_BASE}/status`, { headers: getAuthHeaders() });
    if (!resp.ok) throw new Error(`Status check failed: ${resp.status}`);
    return resp.json();
  },

  /**
   * Send message to OpenClaw agent (fire-and-forget via webhook)
   */
  async sendMessage(request: OpenClawSendRequest): Promise<any> {
    const resp = await fetch(`${API_BASE}/send`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || `Send failed: ${resp.status}`);
    }
    return resp.json();
  },

  /**
   * Send message and stream agent response via SSE
   */
  async *streamMessage(request: OpenClawSendRequest): AsyncGenerator<OpenClawStreamEvent> {
    const resp = await fetch(`${API_BASE}/stream`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    });

    if (!resp.ok) {
      throw new Error(`Stream failed: ${resp.status}`);
    }

    const reader = resp.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event: OpenClawStreamEvent = JSON.parse(line.slice(6));
            yield event;
            if (event.type === 'stream_end' || event.type === 'done') return;
          } catch {
            // ignore parse errors
          }
        }
      }
    }
  },

  /**
   * Wake the OpenClaw agent
   */
  async wake(text?: string, mode?: string): Promise<any> {
    const resp = await fetch(`${API_BASE}/wake`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ text: text || 'Wake from Multech', mode: mode || 'now' }),
    });
    return resp.json();
  },

  /**
   * Get OpenClaw configuration (requires WS)
   */
  async getConfig(): Promise<any> {
    const resp = await fetch(`${API_BASE}/config`, { headers: getAuthHeaders() });
    return resp.json();
  },

  /**
   * Patch OpenClaw configuration
   */
  async patchConfig(patch: Record<string, any>): Promise<any> {
    const resp = await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ patch }),
    });
    return resp.json();
  },

  /**
   * List agent sessions
   */
  async getSessions(): Promise<any> {
    const resp = await fetch(`${API_BASE}/sessions`, { headers: getAuthHeaders() });
    return resp.json();
  },

  /**
   * Get session transcript history
   */
  async getSessionHistory(sessionKey: string, limit = 50): Promise<any> {
    const resp = await fetch(
      `${API_BASE}/sessions/${encodeURIComponent(sessionKey)}?limit=${limit}`,
      { headers: getAuthHeaders() }
    );
    return resp.json();
  },

  /**
   * Install a skill from ClawHub
   */
  async installSkill(slug: string): Promise<any> {
    const resp = await fetch(`${API_BASE}/skills/install`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ slug }),
    });
    return resp.json();
  },

  /**
   * List installed skills
   */
  async getSkills(): Promise<any> {
    const resp = await fetch(`${API_BASE}/skills`, { headers: getAuthHeaders() });
    return resp.json();
  },

  // =========================================================================
  // Gateway Process Management
  // =========================================================================

  async getGatewayStatus(): Promise<any> {
    const resp = await fetch(`${API_BASE}/gateway`, { headers: getAuthHeaders() });
    return resp.json();
  },

  async startGateway(): Promise<any> {
    const resp = await fetch(`${API_BASE}/gateway/start`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return resp.json();
  },

  async stopGateway(): Promise<any> {
    const resp = await fetch(`${API_BASE}/gateway/stop`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return resp.json();
  },

  async restartGateway(): Promise<any> {
    const resp = await fetch(`${API_BASE}/gateway/restart`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return resp.json();
  },

  async reconnectWs(): Promise<any> {
    const resp = await fetch(`${API_BASE}/reconnect`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return resp.json();
  },

  async getGatewayLogs(lastN = 50): Promise<{ logs: string[] }> {
    const resp = await fetch(`${API_BASE}/gateway/logs?last=${lastN}`, { headers: getAuthHeaders() });
    return resp.json();
  },
};
