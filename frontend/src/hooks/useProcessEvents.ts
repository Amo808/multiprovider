import { useState, useCallback, useRef, useEffect } from 'react';

// Types
export type ProcessType = 
  | 'thinking' 
  | 'compression' 
  | 'chunking' 
  | 'embedding' 
  | 'rag_retrieval' 
  | 'multi_model' 
  | 'streaming' 
  | 'tool_call' 
  | 'search' 
  | 'validation';

export type ProcessStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ProcessStep {
  id: string;
  name: string;
  status: ProcessStatus;
  message: string;
  progress: number;
  started_at?: string;
  completed_at?: string;
  metadata: Record<string, any>;
}

export interface Process {
  id: string;
  type: ProcessType;
  name: string;
  conversation_id: string;
  message_id?: string;
  status: ProcessStatus;
  steps: ProcessStep[];
  progress: number;
  started_at?: string;
  completed_at?: string;
  error?: string;
  metadata: Record<string, any>;
}

export interface ProcessEvent {
  type: string;
  process: Process;
  timestamp: string;
  thought?: string;
  stage?: string;
  step_index?: number;
  step?: ProcessStep;
  message?: string;
  error?: string;
}

interface UseProcessEventsOptions {
  conversationId?: string;
  onEvent?: (event: ProcessEvent) => void;
  autoConnect?: boolean;
}

export function useProcessEvents(options: UseProcessEventsOptions = {}) {
  const { conversationId, onEvent, autoConnect = true } = options;
  
  const [processes, setProcesses] = useState<Process[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    const url = conversationId 
      ? `/api/processes/stream?conversation_id=${conversationId}`
      : '/api/processes/stream';
    
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;
    
    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };
    
    eventSource.onerror = () => {
      setIsConnected(false);
      setError('Connection lost');
    };
    
    eventSource.onmessage = (event) => {
      try {
        const data: ProcessEvent = JSON.parse(event.data);
        
        // Update processes state
        setProcesses(prev => {
          const index = prev.findIndex(p => p.id === data.process.id);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = data.process;
            return updated;
          } else {
            return [data.process, ...prev];
          }
        });
        
        // Call custom event handler
        onEvent?.(data);
        
      } catch (e) {
        console.error('Failed to parse process event:', e);
      }
    };
    
  }, [conversationId, onEvent]);
  
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, []);
  
  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);
  
  // Get active/completed processes
  const activeProcesses = processes.filter(p => 
    p.status === 'running' || p.status === 'pending'
  );
  
  const completedProcesses = processes.filter(p => 
    p.status === 'completed' || p.status === 'failed'
  );
  
  return {
    processes,
    activeProcesses,
    completedProcesses,
    isConnected,
    error,
    connect,
    disconnect
  };
}

// Hook for getting processes for a specific conversation
export function useConversationProcesses(conversationId: string) {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState(false);
  
  const fetchProcesses = useCallback(async () => {
    if (!conversationId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/processes/${conversationId}`);
      const data = await response.json();
      setProcesses(data.processes || []);
    } catch (e) {
      console.error('Failed to fetch processes:', e);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);
  
  useEffect(() => {
    fetchProcesses();
  }, [fetchProcesses]);
  
  return { processes, loading, refetch: fetchProcesses };
}

// Multi-model types
export type MultiModelMode = 'parallel' | 'fastest' | 'consensus' | 'comparison' | 'fallback';

export interface ModelConfig {
  provider: string;
  model: string;
  display_name?: string;
  weight: number;
  timeout: number;
  enabled: boolean;
  params?: Record<string, any>;
}

export interface ModelResponse {
  model: ModelConfig;
  content: string;
  tokens_used?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  latency_ms: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export interface MultiModelResult {
  id: string;
  mode: MultiModelMode;
  responses: ModelResponse[];
  primary_response?: string;
  consensus_score?: number;
  total_latency_ms: number;
  metadata?: Record<string, any>;
}

export interface MultiModelPreset {
  name: string;
  description: string;
  mode: MultiModelMode;
  models: ModelConfig[];
}

interface UseMultiModelOptions {
  conversationId?: string;
  systemPrompt?: string;
  onStream?: (model: string, content: string) => void;
  onModelComplete?: (response: ModelResponse) => void;
  onComplete?: (result: MultiModelResult) => void;
}

export function useMultiModel(options: UseMultiModelOptions = {}) {
  const { conversationId, systemPrompt, onStream, onModelComplete, onComplete } = options;
  
  const [isExecuting, setIsExecuting] = useState(false);
  const [responses, setResponses] = useState<ModelResponse[]>([]);
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const execute = useCallback(async (
    message: string,
    models: ModelConfig[],
    mode: MultiModelMode = 'parallel',
    config?: Record<string, any>
  ) => {
    if (isExecuting) return;
    
    setIsExecuting(true);
    setResponses([]);
    setError(null);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await fetch('/api/multi-model/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          conversation_id: conversationId,
          models,
          mode,
          stream: true,
          config,
          system_prompt: systemPrompt
        }),
        signal: abortControllerRef.current.signal
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) throw new Error('No response body');
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = decoder.decode(value);
        const lines = text.split('\n').filter(line => line.startsWith('data: '));
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'chunk') {
              onStream?.(data.model, data.content);
            } else if (data.type === 'model_complete') {
              const modelResponse: ModelResponse = {
                model: { 
                  provider: data.provider, 
                  model: data.model,
                  weight: 1,
                  timeout: 60,
                  enabled: true
                },
                content: data.content,
                latency_ms: data.latency_ms,
                success: data.success,
                error: data.error
              };
              setResponses(prev => [...prev, modelResponse]);
              onModelComplete?.(modelResponse);
            } else if (data.type === 'done') {
              const result = data.result as MultiModelResult;
              setCurrentExecutionId(result.id);
              onComplete?.(result);
            } else if (data.type === 'error') {
              setError(data.error);
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        }
      }
      
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message);
      }
    } finally {
      setIsExecuting(false);
    }
  }, [conversationId, systemPrompt, isExecuting, onStream, onModelComplete, onComplete]);
  
  const cancel = useCallback(async () => {
    // Abort fetch
    abortControllerRef.current?.abort();
    
    // Cancel on server
    if (currentExecutionId) {
      try {
        await fetch(`/api/multi-model/cancel/${currentExecutionId}`, { method: 'POST' });
      } catch (e) {
        console.error('Failed to cancel execution:', e);
      }
    }
    
    setIsExecuting(false);
  }, [currentExecutionId]);
  
  return {
    execute,
    cancel,
    isExecuting,
    responses,
    error,
    currentExecutionId
  };
}

// Hook for multi-model presets
export function useMultiModelPresets() {
  const [presets, setPresets] = useState<Record<string, MultiModelPreset>>({});
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetch('/api/multi-model/presets')
      .then(res => res.json())
      .then(data => {
        setPresets(data.presets || {});
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load presets:', err);
        setLoading(false);
      });
  }, []);
  
  return { presets, loading };
}
