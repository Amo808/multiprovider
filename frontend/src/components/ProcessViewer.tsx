import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, Brain, Zap, ChevronDown, ChevronRight, X, Loader2, CheckCircle2, XCircle, Clock, Layers } from 'lucide-react';
import { cn } from '../lib/utils';

// Process types matching backend
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

// Icons for different process types
const ProcessIcons: Record<ProcessType, React.ReactNode> = {
  thinking: <Brain className="w-4 h-4" />,
  compression: <Layers className="w-4 h-4" />,
  chunking: <Layers className="w-4 h-4" />,
  embedding: <Zap className="w-4 h-4" />,
  rag_retrieval: <Activity className="w-4 h-4" />,
  multi_model: <Zap className="w-4 h-4" />,
  streaming: <Activity className="w-4 h-4" />,
  tool_call: <Activity className="w-4 h-4" />,
  search: <Activity className="w-4 h-4" />,
  validation: <CheckCircle2 className="w-4 h-4" />,
};

// Status colors
const StatusColors: Record<ProcessStatus, string> = {
  pending: 'text-muted-foreground',
  running: 'text-blue-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
  cancelled: 'text-yellow-500',
};

const StatusIcons: Record<ProcessStatus, React.ReactNode> = {
  pending: <Clock className="w-3 h-3" />,
  running: <Loader2 className="w-3 h-3 animate-spin" />,
  completed: <CheckCircle2 className="w-3 h-3" />,
  failed: <XCircle className="w-3 h-3" />,
  cancelled: <X className="w-3 h-3" />,
};

interface ProcessStepViewProps {
  step: ProcessStep;
  isLast: boolean;
}

const ProcessStepView: React.FC<ProcessStepViewProps> = ({ step, isLast }) => {
  return (
    <div className="flex items-start gap-2 ml-4">
      <div className="flex flex-col items-center">
        <div className={cn("mt-1", StatusColors[step.status])}>
          {StatusIcons[step.status]}
        </div>
        {!isLast && (
          <div className="w-px h-full min-h-[24px] bg-border" />
        )}
      </div>
      <div className="flex-1 pb-2">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium", StatusColors[step.status])}>
            {step.name}
          </span>
          {step.progress > 0 && step.progress < 100 && (
            <span className="text-xs text-muted-foreground">
              {Math.round(step.progress)}%
            </span>
          )}
        </div>
        {step.message && (
          <p className="text-xs text-muted-foreground mt-0.5">{step.message}</p>
        )}
      </div>
    </div>
  );
};

interface ProcessCardProps {
  process: Process;
  expanded?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
  thoughts?: string;  // Accumulated thinking text
}

export const ProcessCard: React.FC<ProcessCardProps> = ({ 
  process, 
  expanded = false, 
  onToggle,
  onClose,
  thoughts = []
}) => {
  const isActive = process.status === 'running' || process.status === 'pending';
  
  return (
    <div className={cn(
      "border rounded-lg overflow-hidden transition-all duration-200",
      isActive ? "border-blue-500/50 bg-blue-500/5" : "border-border bg-card",
      process.status === 'failed' && "border-red-500/50 bg-red-500/5"
    )}>
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <div className={cn("p-1.5 rounded-md", 
            isActive ? "bg-blue-500/20 text-blue-500" : "bg-muted text-muted-foreground"
          )}>
            {ProcessIcons[process.type]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{process.name}</span>
              <span className={cn("text-xs", StatusColors[process.status])}>
                {StatusIcons[process.status]}
              </span>
            </div>
            {process.metadata.model_count && (
              <span className="text-xs text-muted-foreground">
                {process.metadata.model_count} models
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isActive && (
            <div className="flex items-center gap-1.5">
              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${process.progress}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {Math.round(process.progress)}%
              </span>
            </div>
          )}
          
          <button 
            onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
            className="p-1 hover:bg-muted rounded"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          
          {onClose && !isActive && (
            <button 
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="p-1 hover:bg-muted rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      
      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border px-3 py-2">
          {/* Steps */}
          {process.steps.length > 0 && (
            <div className="space-y-0">
              {process.steps.map((step, index) => (
                <ProcessStepView 
                  key={step.id} 
                  step={step} 
                  isLast={index === process.steps.length - 1}
                />
              ))}
            </div>
          )}
          
          {/* Thoughts (for thinking process) */}
          {thoughts && thoughts.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Reasoning:
              </div>
              <div className="text-xs text-muted-foreground pl-2 border-l-2 border-purple-500/50 whitespace-pre-wrap max-h-60 overflow-y-auto">
                {thoughts}
              </div>
            </div>
          )}
          
          {/* Error */}
          {process.error && (
            <div className="mt-2 text-xs text-red-500 bg-red-500/10 p-2 rounded">
              {process.error}
            </div>
          )}
          
          {/* Metadata */}
          {Object.keys(process.metadata).length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              {process.metadata.original_messages && (
                <div>Messages: {process.metadata.compressed_messages || '?'} / {process.metadata.original_messages}</div>
              )}
              {process.metadata.total_latency_ms && (
                <div>Latency: {Math.round(process.metadata.total_latency_ms)}ms</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface ProcessViewerProps {
  conversationId?: string;
  className?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const ProcessViewer: React.FC<ProcessViewerProps> = ({
  conversationId,
  className,
  collapsed = false,
  onToggleCollapse
}) => {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [expandedProcesses, setExpandedProcesses] = useState<Set<string>>(new Set());
  // Store accumulated thought text per process (not array of chunks)
  const [thoughts, setThoughts] = useState<Record<string, string>>({});
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // Connect to SSE stream
  useEffect(() => {
    // Don't connect if no conversationId is provided - wait for a real conversation
    if (!conversationId) {
      return;
    }
    
    const url = `/api/processes/stream?conversation_id=${conversationId}`;
    
    let eventSource: EventSource;
    try {
      eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;
    } catch (e) {
      console.error('Failed to create EventSource:', e);
      return;
    }
    
    eventSource.onmessage = (event) => {
      try {
        const data: ProcessEvent = JSON.parse(event.data);
        
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
        
        // Auto-expand new running processes
        if (data.type === 'process_started') {
          setExpandedProcesses(prev => new Set([...prev, data.process.id]));
        }
        
        // Collect thoughts - accumulate as string, not array
        if (data.type === 'thinking' && data.thought) {
          setThoughts(prev => ({
            ...prev,
            [data.process.id]: (prev[data.process.id] || '') + data.thought
          }));
        }
        
      } catch (e) {
        console.error('Failed to parse process event:', e);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('Process stream error:', error);
      // Close and don't reconnect automatically to avoid infinite errors
      eventSource.close();
    };
    
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [conversationId]);
  
  const toggleProcess = useCallback((processId: string) => {
    setExpandedProcesses(prev => {
      const next = new Set(prev);
      if (next.has(processId)) {
        next.delete(processId);
      } else {
        next.add(processId);
      }
      return next;
    });
  }, []);
  
  const removeProcess = useCallback((processId: string) => {
    setProcesses(prev => prev.filter(p => p.id !== processId));
    setThoughts(prev => {
      const next = { ...prev };
      delete next[processId];
      return next;
    });
  }, []);
  
  const activeProcesses = processes.filter(p => p.status === 'running' || p.status === 'pending');
  const completedProcesses = processes.filter(p => p.status === 'completed' || p.status === 'failed');
  
  if (collapsed) {
    return (
      <div 
        className={cn("flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50 rounded-lg", className)}
        onClick={onToggleCollapse}
      >
        <Activity className="w-4 h-4 text-blue-500" />
        <span className="text-sm">
          {processes.length === 0
            ? 'No processes'
            : activeProcesses.length > 0 
              ? `${activeProcesses.length} active process${activeProcesses.length > 1 ? 'es' : ''}`
              : `${completedProcesses.length} completed`
          }
        </span>
        <ChevronRight className="w-4 h-4 ml-auto" />
      </div>
    );
  }
  
  // Show empty state instead of null
  if (processes.length === 0) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Processes</span>
          </div>
          {onToggleCollapse && (
            <button onClick={onToggleCollapse} className="p-1 hover:bg-muted rounded">
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="text-xs text-muted-foreground text-center py-4">
          No active processes. Processes will appear here when you send messages.
        </div>
      </div>
    );
  }
  
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Processes</span>
        </div>
        {onToggleCollapse && (
          <button onClick={onToggleCollapse} className="p-1 hover:bg-muted rounded">
            <ChevronDown className="w-4 h-4" />
          </button>
        )}
      </div>
      
      {/* Active processes */}
      {activeProcesses.map(process => (
        <ProcessCard
          key={process.id}
          process={process}
          expanded={expandedProcesses.has(process.id)}
          onToggle={() => toggleProcess(process.id)}
          thoughts={thoughts[process.id]}
        />
      ))}
      
      {/* Completed processes (collapsed by default) */}
      {completedProcesses.length > 0 && (
        <details className="group">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            {completedProcesses.length} completed process{completedProcesses.length > 1 ? 'es' : ''}
          </summary>
          <div className="mt-2 space-y-2">
            {completedProcesses.map(process => (
              <ProcessCard
                key={process.id}
                process={process}
                expanded={expandedProcesses.has(process.id)}
                onToggle={() => toggleProcess(process.id)}
                onClose={() => removeProcess(process.id)}
                thoughts={thoughts[process.id]}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

export default ProcessViewer;
