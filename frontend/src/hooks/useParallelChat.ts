import { useState, useCallback, useRef } from 'react';
import { ModelInfo, GenerationConfig, ChatResponse } from '../types';

interface ParallelResponse {
  model: ModelInfo;
  content: string;
  isStreaming: boolean;
  thinkingContent?: string;
  isThinking?: boolean;
  error?: string;
  meta?: {
    tokens_in?: number;
    tokens_out?: number;
    thought_tokens?: number;
    estimated_cost?: number;
    total_latency?: number;
  };
}

interface UseParallelChatReturn {
  responses: ParallelResponse[];
  isLoading: boolean;
  sendParallelMessages: (
    message: string,
    models: ModelInfo[],
    config: GenerationConfig,
    systemPrompt?: string
  ) => Promise<void>;
  cancelAll: () => void;
  clearResponses: () => void;
}

export const useParallelChat = (): UseParallelChatReturn => {
  const [responses, setResponses] = useState<ParallelResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const clearResponses = useCallback(() => {
    setResponses([]);
  }, []);

  const cancelAll = useCallback(() => {
    abortControllersRef.current.forEach((controller) => {
      controller.abort();
    });
    abortControllersRef.current.clear();
    setIsLoading(false);
    
    // Mark all streaming responses as stopped
    setResponses(prev => prev.map(r => ({
      ...r,
      isStreaming: false,
      isThinking: false,
    })));
  }, []);

  const sendParallelMessages = useCallback(async (
    message: string,
    models: ModelInfo[],
    config: GenerationConfig,
    systemPrompt?: string
  ) => {
    if (models.length === 0) return;

    // Cancel any existing requests
    cancelAll();
    setIsLoading(true);

    // Initialize responses for all models
    const initialResponses: ParallelResponse[] = models.map(model => ({
      model,
      content: '',
      isStreaming: true,
      thinkingContent: '',
      isThinking: false,
    }));
    setResponses(initialResponses);

    // Start all requests in parallel
    const promises = models.map(async (model, index) => {
      const modelKey = `${model.provider}-${model.id}`;
      const abortController = new AbortController();
      abortControllersRef.current.set(modelKey, abortController);

      try {
        const requestBody = {
          message,
          provider: model.provider,
          model: model.id,
          conversation_id: `parallel-${Date.now()}-${index}`,
          config,
          ...(systemPrompt ? { system_prompt: systemPrompt } : {}),
        };

        const response = await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedContent = '';
        let accumulatedThinking = '';
        let lastMeta: ParallelResponse['meta'] = {};
        const startTime = Date.now();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;

            try {
              const data: ChatResponse = JSON.parse(jsonStr);

              // Handle thinking/reasoning content
              if (data.meta?.thinking || data.meta?.reasoning_content) {
                const thinkingChunk = data.meta.thinking || data.meta.reasoning_content || '';
                accumulatedThinking += thinkingChunk;
                
                setResponses(prev => prev.map((r, i) => 
                  i === index ? {
                    ...r,
                    thinkingContent: accumulatedThinking,
                    isThinking: true,
                  } : r
                ));
              }

              // Handle content
              if (data.content) {
                accumulatedContent += data.content;
                
                setResponses(prev => prev.map((r, i) => 
                  i === index ? {
                    ...r,
                    content: accumulatedContent,
                    isThinking: false, // Content started, thinking done
                  } : r
                ));
              }

              // Capture metadata
              if (data.meta) {
                lastMeta = {
                  ...lastMeta,
                  tokens_in: data.meta.tokens_in ?? lastMeta.tokens_in,
                  tokens_out: data.meta.tokens_out ?? lastMeta.tokens_out,
                  thought_tokens: data.meta.thought_tokens ?? lastMeta.thought_tokens,
                  estimated_cost: data.meta.estimated_cost ?? lastMeta.estimated_cost,
                };
              }

              // Handle done
              if (data.done) {
                const totalLatency = (Date.now() - startTime) / 1000;
                setResponses(prev => prev.map((r, i) => 
                  i === index ? {
                    ...r,
                    isStreaming: false,
                    isThinking: false,
                    meta: {
                      ...lastMeta,
                      total_latency: totalLatency,
                    },
                  } : r
                ));
              }

              // Handle errors
              if (data.error) {
                setResponses(prev => prev.map((r, i) => 
                  i === index ? {
                    ...r,
                    error: data.error,
                    isStreaming: false,
                    isThinking: false,
                  } : r
                ));
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e, jsonStr);
            }
          }
        }

        // Finalize if not already done
        const totalLatency = (Date.now() - startTime) / 1000;
        setResponses(prev => prev.map((r, i) => 
          i === index && r.isStreaming ? {
            ...r,
            isStreaming: false,
            isThinking: false,
            meta: {
              ...lastMeta,
              total_latency: totalLatency,
            },
          } : r
        ));

      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return; // Request was cancelled
        }
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setResponses(prev => prev.map((r, i) => 
          i === index ? {
            ...r,
            error: errorMessage,
            isStreaming: false,
            isThinking: false,
          } : r
        ));
      } finally {
        abortControllersRef.current.delete(modelKey);
      }
    });

    // Wait for all requests to complete
    await Promise.allSettled(promises);
    setIsLoading(false);
  }, [cancelAll]);

  return {
    responses,
    isLoading,
    sendParallelMessages,
    cancelAll,
    clearResponses,
  };
};

export default useParallelChat;
