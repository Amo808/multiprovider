import { useState, useEffect, useRef, useCallback } from 'react';

interface ProcessEvent {
  type: string;
  process: {
    id: string;
    type?: string;
    conversation_id: string;
    message_id?: string;
    status: string;
  };
  thought?: string;
  stage?: string;
  timestamp: string;
}

interface UseThinkingStreamOptions {
  conversationId?: string;
  onThinkingUpdate?: (content: string, isThinking: boolean) => void;
}

/**
 * Hook to subscribe to thinking/reasoning events from the process stream.
 * This provides real-time thinking content that works reliably, unlike the
 * main chat SSE stream which may not include reasoning_content in all cases.
 */
export function useThinkingStream(options: UseThinkingStreamOptions = {}) {
  const { conversationId, onThinkingUpdate } = options;
  
  const [thinkingContent, setThinkingContent] = useState<string>('');
  const [isThinking, setIsThinking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const thinkingContentRef = useRef<string>('');
  
  // Reset thinking state
  const resetThinking = useCallback(() => {
    thinkingContentRef.current = '';
    setThinkingContent('');
    setIsThinking(false);
  }, []);
  
  // Connect to process events SSE stream
  useEffect(() => {
    if (!conversationId) {
      return;
    }
    
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    const url = `/api/processes/stream?conversation_id=${conversationId}`;
    
    let eventSource: EventSource;
    try {
      eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;
    } catch (e) {
      console.error('[useThinkingStream] Failed to create EventSource:', e);
      return;
    }
    
    eventSource.onopen = () => {
      setIsConnected(true);
      console.log('[useThinkingStream] Connected to process stream');
    };
    
    eventSource.onerror = () => {
      setIsConnected(false);
      console.log('[useThinkingStream] Connection error');
    };
    
    eventSource.onmessage = (event) => {
      try {
        const data: ProcessEvent = JSON.parse(event.data);
        
        // Handle thinking events
        if (data.type === 'thinking' && data.thought) {
          thinkingContentRef.current += data.thought;
          setThinkingContent(thinkingContentRef.current);
          setIsThinking(true);
          
          console.log(`[useThinkingStream] Thinking update: +${data.thought.length} chars, total: ${thinkingContentRef.current.length}`);
          
          if (onThinkingUpdate) {
            onThinkingUpdate(thinkingContentRef.current, true);
          }
        }
        
        // Handle process completion
        if (data.type === 'process_completed' && data.process.type === 'thinking') {
          setIsThinking(false);
          console.log(`[useThinkingStream] Thinking completed, total: ${thinkingContentRef.current.length} chars`);
          
          if (onThinkingUpdate) {
            onThinkingUpdate(thinkingContentRef.current, false);
          }
        }
        
        // Handle process start - reset accumulated thinking
        if (data.type === 'process_started' && data.process.type === 'thinking') {
          thinkingContentRef.current = '';
          setThinkingContent('');
          setIsThinking(true);
          console.log('[useThinkingStream] New thinking process started');
          
          if (onThinkingUpdate) {
            onThinkingUpdate('', true);
          }
        }
        
      } catch (e) {
        console.error('[useThinkingStream] Failed to parse event:', e);
      }
    };
    
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [conversationId, onThinkingUpdate]);
  
  return {
    thinkingContent,
    isThinking,
    isConnected,
    resetThinking
  };
}

export default useThinkingStream;
