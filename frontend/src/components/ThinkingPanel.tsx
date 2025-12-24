import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Brain, ChevronDown, ChevronRight, X, Maximize2, Minimize2, Eye, EyeOff, Clock, Zap } from 'lucide-react';
import { cn } from '../lib/utils';

interface ThinkingStep {
  id: string;
  timestamp: string;
  stage: string;
  thought: string;
  duration_ms?: number;
}

interface ThinkingSession {
  id: string;
  conversation_id: string;
  message_id?: string;
  model: string;
  provider: string;
  started_at: string;
  completed_at?: string;
  status: 'thinking' | 'completed' | 'failed';
  steps: ThinkingStep[];
  total_tokens?: number;
  summary?: string;
}

interface ThinkingStepItemProps {
  step: ThinkingStep;
  isLast: boolean;
  showTimestamps: boolean;
}

const ThinkingStepItem: React.FC<ThinkingStepItemProps> = ({ step, isLast, showTimestamps }) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = step.thought.length > 200;
  
  const stageColors: Record<string, string> = {
    'analyzing': 'text-blue-500 bg-blue-500/10',
    'planning': 'text-purple-500 bg-purple-500/10',
    'reasoning': 'text-amber-500 bg-amber-500/10',
    'evaluating': 'text-green-500 bg-green-500/10',
    'synthesizing': 'text-cyan-500 bg-cyan-500/10',
    'default': 'text-muted-foreground bg-muted'
  };
  
  const colorClass = stageColors[step.stage.toLowerCase()] || stageColors.default;
  
  return (
    <div className="relative">
      {/* Timeline connector */}
      {!isLast && (
        <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border" />
      )}
      
      <div className="flex gap-3">
        {/* Timeline dot */}
        <div className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
          colorClass
        )}>
          <Brain className="w-3 h-3" />
        </div>
        
        <div className="flex-1 min-w-0 pb-4">
          {/* Stage header */}
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded", colorClass)}>
              {step.stage}
            </span>
            {showTimestamps && step.duration_ms && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {step.duration_ms}ms
              </span>
            )}
          </div>
          
          {/* Thought content */}
          <div 
            className={cn(
              "text-sm text-foreground/90 whitespace-pre-wrap",
              isLong && !expanded && "line-clamp-3"
            )}
          >
            {step.thought}
          </div>
          
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-blue-500 hover:text-blue-400 mt-1 flex items-center gap-1"
            >
              {expanded ? (
                <>
                  <ChevronDown className="w-3 h-3" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronRight className="w-3 h-3" />
                  Show more
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface ThinkingSessionCardProps {
  session: ThinkingSession;
  expanded?: boolean;
  onToggle?: () => void;
  showTimestamps?: boolean;
}

const ThinkingSessionCard: React.FC<ThinkingSessionCardProps> = ({
  session,
  expanded = false,
  onToggle,
  showTimestamps = false
}) => {
  const isActive = session.status === 'thinking';
  
  return (
    <div className={cn(
      "border rounded-lg overflow-hidden",
      isActive ? "border-purple-500/50 animate-pulse-subtle" : "border-border"
    )}>
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 bg-card"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <div className={cn(
            "p-1.5 rounded-md",
            isActive ? "bg-purple-500/20 text-purple-500" : "bg-muted text-muted-foreground"
          )}>
            <Brain className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-medium flex items-center gap-2">
              <span>Thinking Process</span>
              {isActive && (
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {session.model} • {session.steps.length} step{session.steps.length !== 1 ? 's' : ''}
              {session.total_tokens && ` • ${session.total_tokens} thinking tokens`}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>
      
      {/* Steps */}
      {expanded && (
        <div className="border-t border-border p-3 bg-background/50">
          {session.summary && (
            <div className="mb-4 p-2 rounded bg-muted/50 text-sm">
              <span className="text-xs font-medium text-muted-foreground block mb-1">Summary</span>
              {session.summary}
            </div>
          )}
          
          <div className="space-y-0">
            {session.steps.map((step, index) => (
              <ThinkingStepItem
                key={step.id}
                step={step}
                isLast={index === session.steps.length - 1}
                showTimestamps={showTimestamps}
              />
            ))}
            
            {isActive && (
              <div className="flex items-center gap-2 text-purple-500 text-sm pl-9">
                <Zap className="w-4 h-4 animate-pulse" />
                <span>Processing...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface ThinkingPanelProps {
  conversationId?: string;
  messageId?: string;
  className?: string;
  isFloating?: boolean;
  onClose?: () => void;
  // Direct thinking content (for real-time streaming)
  thinkingContent?: string;
  isThinking?: boolean;
  model?: string;
  provider?: string;
}

export const ThinkingPanel: React.FC<ThinkingPanelProps> = ({
  conversationId,
  messageId,
  className,
  isFloating = false,
  onClose,
  thinkingContent,
  isThinking,
  model,
  provider
}) => {
  const [sessions, setSessions] = useState<ThinkingSession[]>([]);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // Connect to process events stream
  useEffect(() => {
    // Don't connect if no conversationId - wait for real conversation
    if (!conversationId) {
      return;
    }
    
    const url = `/api/processes/stream?conversation_id=${conversationId}`;
    
    let eventSource: EventSource;
    try {
      eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;
    } catch (e) {
      console.error('Failed to create EventSource for ThinkingPanel:', e);
      return;
    }
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle thinking events - accumulate text into single step per process
        if (data.type === 'thinking') {
          const { process, thought, stage, timestamp } = data;
          
          setSessions(prev => {
            const existing = prev.find(s => s.id === process.id);
            
            if (existing) {
              // Append thought to the last step if same stage, otherwise create new step
              const lastStep = existing.steps[existing.steps.length - 1];
              const currentStage = stage || 'reasoning';
              
              if (lastStep && lastStep.stage === currentStage) {
                // Accumulate into existing step
                return prev.map(s => 
                  s.id === process.id 
                    ? { 
                        ...s, 
                        steps: s.steps.map((step, idx) =>
                          idx === s.steps.length - 1
                            ? { ...step, thought: step.thought + thought }
                            : step
                        )
                      }
                    : s
                );
              } else {
                // New stage, create new step
                const newStep: ThinkingStep = {
                  id: `${process.id}-${Date.now()}`,
                  timestamp,
                  stage: currentStage,
                  thought
                };
                return prev.map(s => 
                  s.id === process.id 
                    ? { ...s, steps: [...s.steps, newStep] }
                    : s
                );
              }
            } else {
              // New session
              const newStep: ThinkingStep = {
                id: `${process.id}-${Date.now()}`,
                timestamp,
                stage: stage || 'reasoning',
                thought
              };
              const newSession: ThinkingSession = {
                id: process.id,
                conversation_id: process.conversation_id,
                message_id: process.message_id,
                model: process.metadata?.model || 'unknown',
                provider: process.metadata?.provider || 'unknown',
                started_at: process.started_at || timestamp,
                status: 'thinking',
                steps: [newStep]
              };
              return [newSession, ...prev];
            }
          });
          
          // Auto-expand new sessions
          setExpandedSessions(prev => new Set([...prev, process.id]));
        }
        
        // Handle process completion
        if (data.type === 'process_completed' && data.process.type === 'thinking') {
          setSessions(prev => prev.map(s => 
            s.id === data.process.id 
              ? { 
                  ...s, 
                  status: 'completed',
                  completed_at: data.timestamp,
                  total_tokens: data.process.metadata?.thinking_tokens
                }
              : s
          ));
        }
        
      } catch (e) {
        console.error('Failed to parse thinking event:', e);
      }
    };
    
    eventSource.onerror = () => {
      console.error('ThinkingPanel SSE connection error');
      eventSource.close();
    };
    
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [conversationId]);
  
  // Filter sessions by messageId if provided
  const filteredSessions = messageId 
    ? sessions.filter(s => s.message_id === messageId)
    : sessions;
  
  const toggleSession = useCallback((sessionId: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }, []);
  
  // If we have direct thinking content (from streaming), show it
  const hasDirectContent = thinkingContent && thinkingContent.length > 0;
  
  if (filteredSessions.length === 0 && !hasDirectContent) {
    return null;
  }
  
  // Real-time thinking content display
  const realTimeContent = hasDirectContent && (
    <div className="border rounded-lg border-purple-500/50 animate-pulse-subtle overflow-hidden">
      <div className="flex items-center justify-between p-3 bg-purple-500/10 border-b border-purple-500/30">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-purple-500/20 text-purple-500">
            <Brain className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-medium flex items-center gap-2">
              <span>Live Thinking</span>
              {isThinking && (
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {model || 'Model'} {provider && `• ${provider}`}
            </div>
          </div>
        </div>
      </div>
      <div className="p-3 bg-background/50 max-h-96 overflow-y-auto">
        <div className="text-sm text-foreground/90 whitespace-pre-wrap font-mono">
          {thinkingContent}
          {isThinking && <span className="animate-pulse">▊</span>}
        </div>
      </div>
      <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground bg-muted/30">
        {thinkingContent.length.toLocaleString()} characters
      </div>
    </div>
  );
  
  const panelContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-500" />
          <span className="font-medium">Thinking Process</span>
          <span className="text-xs text-muted-foreground">
            {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowTimestamps(!showTimestamps)}
            className={cn(
              "p-1.5 rounded hover:bg-muted",
              showTimestamps && "bg-muted"
            )}
            title={showTimestamps ? "Hide timestamps" : "Show timestamps"}
          >
            {showTimestamps ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          {isFloating && (
            <>
              <button
                onClick={() => setIsMaximized(!isMaximized)}
                className="p-1.5 rounded hover:bg-muted"
              >
                {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button onClick={onClose} className="p-1.5 rounded hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Sessions */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {/* Real-time thinking content */}
        {realTimeContent}
        
        {/* Sessions from process events */}
        {filteredSessions.map(session => (
          <ThinkingSessionCard
            key={session.id}
            session={session}
            expanded={expandedSessions.has(session.id)}
            onToggle={() => toggleSession(session.id)}
            showTimestamps={showTimestamps}
          />
        ))}
      </div>
    </>
  );
  
  if (isFloating) {
    return (
      <div className={cn(
        "fixed bg-background border rounded-lg shadow-lg flex flex-col",
        isMaximized 
          ? "inset-4 z-50" 
          : "bottom-4 right-4 w-[480px] h-[400px] z-40",
        className
      )}>
        {panelContent}
      </div>
    );
  }
  
  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {panelContent}
    </div>
  );
};

// Hook for accessing thinking data
export function useThinkingSessions(conversationId?: string) {
  const [sessions, setSessions] = useState<ThinkingSession[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  
  useEffect(() => {
    const url = conversationId 
      ? `/api/processes/stream?conversation_id=${conversationId}`
      : '/api/processes/stream';
    
    const eventSource = new EventSource(url);
    
    eventSource.onopen = () => setIsConnected(true);
    eventSource.onerror = () => setIsConnected(false);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'thinking') {
          const { process, thought, stage, timestamp } = data;
          
          setSessions(prev => {
            const existing = prev.find(s => s.id === process.id);
            
            const newStep: ThinkingStep = {
              id: `${process.id}-${Date.now()}`,
              timestamp,
              stage: stage || 'reasoning',
              thought
            };
            
            if (existing) {
              return prev.map(s => 
                s.id === process.id 
                  ? { ...s, steps: [...s.steps, newStep] }
                  : s
              );
            } else {
              return [{
                id: process.id,
                conversation_id: process.conversation_id,
                message_id: process.message_id,
                model: process.metadata?.model || 'unknown',
                provider: process.metadata?.provider || 'unknown',
                started_at: process.started_at || timestamp,
                status: 'thinking',
                steps: [newStep]
              }, ...prev];
            }
          });
        }
        
        if (data.type === 'process_completed' && data.process.type === 'thinking') {
          setSessions(prev => prev.map(s => 
            s.id === data.process.id 
              ? { ...s, status: 'completed', completed_at: data.timestamp }
              : s
          ));
        }
      } catch (e) {
        console.error('Failed to parse event:', e);
      }
    };
    
    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [conversationId]);
  
  return { sessions, isConnected };
}

export default ThinkingPanel;
