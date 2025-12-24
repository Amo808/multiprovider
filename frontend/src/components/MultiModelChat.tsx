import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Plus, X, Settings, Play, Square, Check, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

// Types matching backend
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

interface ModelResponseCardProps {
  response: ModelResponse;
  isStreaming?: boolean;
  streamContent?: string;
  isPrimary?: boolean;
}

const ModelResponseCard: React.FC<ModelResponseCardProps> = ({
  response,
  isStreaming,
  streamContent,
  isPrimary
}) => {
  const content = isStreaming ? streamContent : response.content;
  const displayName = response.model.display_name || `${response.model.provider}/${response.model.model}`;
  
  return (
    <div className={cn(
      "border rounded-lg overflow-hidden",
      isPrimary ? "border-green-500/50 bg-green-500/5" : "border-border bg-card",
      !response.success && "border-red-500/50 bg-red-500/5"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{displayName}</span>
          {isPrimary && (
            <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-500 rounded">
              Primary
            </span>
          )}
          {isStreaming && (
            <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {response.success ? (
            <>
              <span>{Math.round(response.latency_ms)}ms</span>
              {response.tokens_used && (
                <span>{response.tokens_used.total_tokens} tokens</span>
              )}
            </>
          ) : (
            <span className="text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Failed
            </span>
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className="p-3">
        {response.success ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {content || (isStreaming && <span className="text-muted-foreground">Generating...</span>)}
          </div>
        ) : (
          <div className="text-sm text-red-500">
            {response.error || 'Unknown error'}
          </div>
        )}
      </div>
    </div>
  );
};

interface MultiModelConfigProps {
  models: ModelConfig[];
  availableModels: { provider: string; model: string; display_name?: string }[];
  onModelsChange: (models: ModelConfig[]) => void;
  mode: MultiModelMode;
  onModeChange: (mode: MultiModelMode) => void;
}

const MultiModelConfig: React.FC<MultiModelConfigProps> = ({
  models,
  availableModels,
  onModelsChange,
  mode,
  onModeChange
}) => {
  const [showAddModel, setShowAddModel] = useState(false);
  
  const addModel = (provider: string, model: string, display_name?: string) => {
    const newModel: ModelConfig = {
      provider,
      model,
      display_name,
      weight: 1.0,
      timeout: 60,
      enabled: true
    };
    onModelsChange([...models, newModel]);
    setShowAddModel(false);
  };
  
  const removeModel = (index: number) => {
    onModelsChange(models.filter((_, i) => i !== index));
  };
  
  const toggleModel = (index: number) => {
    const updated = [...models];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    onModelsChange(updated);
  };
  
  const modes: { value: MultiModelMode; label: string; description: string }[] = [
    { value: 'parallel', label: 'Parallel', description: 'Run all models, show all responses' },
    { value: 'fastest', label: 'Fastest', description: 'Return first completed response' },
    { value: 'consensus', label: 'Consensus', description: 'Aggregate responses' },
    { value: 'comparison', label: 'Comparison', description: 'Side-by-side comparison' },
    { value: 'fallback', label: 'Fallback', description: 'Try in order until success' }
  ];
  
  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      {/* Mode selector */}
      <div>
        <label className="text-sm font-medium mb-2 block">Execution Mode</label>
        <div className="flex flex-wrap gap-2">
          {modes.map(m => (
            <button
              key={m.value}
              onClick={() => onModeChange(m.value)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md border transition-colors",
                mode === m.value 
                  ? "border-blue-500 bg-blue-500/20 text-blue-500"
                  : "border-border hover:border-muted-foreground"
              )}
              title={m.description}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* Selected models */}
      <div>
        <label className="text-sm font-medium mb-2 block">Models ({models.length})</label>
        <div className="space-y-2">
          {models.map((model, index) => (
            <div
              key={`${model.provider}-${model.model}-${index}`}
              className={cn(
                "flex items-center justify-between px-3 py-2 rounded-md border",
                model.enabled ? "border-border bg-background" : "border-border/50 bg-muted/50 opacity-60"
              )}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleModel(index)}
                  className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center",
                    model.enabled ? "border-green-500 bg-green-500 text-white" : "border-muted-foreground"
                  )}
                >
                  {model.enabled && <Check className="w-3 h-3" />}
                </button>
                <span className="text-sm">
                  {model.display_name || `${model.provider}/${model.model}`}
                </span>
              </div>
              <button
                onClick={() => removeModel(index)}
                className="p-1 hover:bg-muted rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          
          {/* Add model button/dropdown */}
          {showAddModel ? (
            <div className="border rounded-md p-2 space-y-1 max-h-48 overflow-y-auto">
              {availableModels
                .filter(am => !models.some(m => m.provider === am.provider && m.model === am.model))
                .map(am => (
                  <button
                    key={`${am.provider}-${am.model}`}
                    onClick={() => addModel(am.provider, am.model, am.display_name)}
                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted rounded"
                  >
                    {am.display_name || `${am.provider}/${am.model}`}
                  </button>
                ))}
              <button
                onClick={() => setShowAddModel(false)}
                className="w-full text-center text-sm text-muted-foreground py-1"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddModel(true)}
              className="flex items-center justify-center gap-2 w-full py-2 border border-dashed rounded-md hover:border-muted-foreground text-sm text-muted-foreground"
            >
              <Plus className="w-4 h-4" />
              Add Model
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface MultiModelChatProps {
  conversationId?: string;
  systemPrompt?: string;
  availableModels: { provider: string; model: string; display_name?: string }[];
  onSend?: (message: string, result: MultiModelResult) => void;
  className?: string;
}

export const MultiModelChat: React.FC<MultiModelChatProps> = ({
  conversationId,
  systemPrompt,
  availableModels,
  onSend,
  className
}) => {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [mode, setMode] = useState<MultiModelMode>('parallel');
  const [isExecuting, setIsExecuting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [responses, setResponses] = useState<ModelResponse[]>([]);
  const [streamingContent, setStreamingContent] = useState<Record<string, string>>({});
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Load presets
  const [presets, setPresets] = useState<Record<string, MultiModelPreset>>({});
  
  useEffect(() => {
    fetch('/api/multi-model/presets')
      .then(res => res.json())
      .then(data => setPresets(data.presets || {}))
      .catch(err => console.error('Failed to load presets:', err));
  }, []);
  
  const applyPreset = (presetKey: string) => {
    const preset = presets[presetKey];
    if (preset) {
      setModels(preset.models);
      setMode(preset.mode);
    }
  };
  
  const sendMultiModelMessage = useCallback(async () => {
    if (!inputMessage.trim() || models.length === 0 || isExecuting) return;
    
    setIsExecuting(true);
    setResponses([]);
    setStreamingContent({});
    
    const message = inputMessage;
    setInputMessage('');
    
    try {
      const response = await fetch('/api/multi-model/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          conversation_id: conversationId,
          models: models.filter(m => m.enabled),
          mode,
          stream: true,
          system_prompt: systemPrompt
        })
      });
      
      if (!response.ok) throw new Error('Failed to send message');
      
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
              setStreamingContent(prev => ({
                ...prev,
                [data.model]: (prev[data.model] || '') + data.content
              }));
            } else if (data.type === 'model_complete') {
              setResponses(prev => [...prev, {
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
              }]);
            } else if (data.type === 'done') {
              const result = data.result as MultiModelResult;
              setCurrentExecutionId(result.id);
              onSend?.(message, result);
            } else if (data.type === 'error') {
              console.error('Multi-model error:', data.error);
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        }
      }
      
    } catch (error) {
      console.error('Multi-model chat error:', error);
    } finally {
      setIsExecuting(false);
    }
  }, [inputMessage, models, mode, conversationId, systemPrompt, onSend]);
  
  const cancelExecution = async () => {
    if (currentExecutionId) {
      await fetch(`/api/multi-model/cancel/${currentExecutionId}`, { method: 'POST' });
      setIsExecuting(false);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMultiModelMessage();
    }
  };
  
  return (
    <div className={cn("flex flex-col", className)}>
      {/* Header with config toggle */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-500" />
          <span className="font-medium">Multi-Model Chat</span>
          <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded">
            {mode}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Preset buttons */}
          {Object.entries(presets).slice(0, 3).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className="text-xs px-2 py-1 border rounded hover:bg-muted"
              title={preset.description}
            >
              {preset.name}
            </button>
          ))}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className={cn(
              "p-1.5 rounded",
              showConfig ? "bg-muted" : "hover:bg-muted"
            )}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Config panel */}
      {showConfig && (
        <MultiModelConfig
          models={models}
          availableModels={availableModels}
          onModelsChange={setModels}
          mode={mode}
          onModeChange={setMode}
        />
      )}
      
      {/* Responses area */}
      <div className="flex-1 overflow-auto p-4">
        {(responses.length > 0 || Object.keys(streamingContent).length > 0) ? (
          <div className={cn(
            "grid gap-4",
            mode === 'comparison' || mode === 'parallel'
              ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
              : "grid-cols-1"
          )}>
            {/* Show streaming content */}
            {isExecuting && models.filter(m => m.enabled).map(model => {
              const existing = responses.find(
                r => r.model.provider === model.provider && r.model.model === model.model
              );
              if (existing) return null;
              
              return (
                <ModelResponseCard
                  key={`${model.provider}-${model.model}`}
                  response={{
                    model,
                    content: streamingContent[model.model] || '',
                    latency_ms: 0,
                    success: true
                  }}
                  isStreaming
                  streamContent={streamingContent[model.model]}
                />
              );
            })}
            
            {/* Show completed responses */}
            {responses.map((response, index) => (
              <ModelResponseCard
                key={`${response.model.provider}-${response.model.model}-${index}`}
                response={response}
                isPrimary={index === 0 && mode !== 'parallel'}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Zap className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-center">
              {models.length === 0 
                ? "Add models to start multi-model chat"
                : "Send a message to query multiple models"
              }
            </p>
          </div>
        )}
      </div>
      
      {/* Input area */}
      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputMessage}
            onChange={e => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={models.length === 0 ? "Configure models first..." : "Type your message..."}
            disabled={models.length === 0 || isExecuting}
            className="flex-1 min-h-[44px] max-h-32 px-3 py-2 border rounded-md resize-none bg-background"
            rows={1}
          />
          {isExecuting ? (
            <Button onClick={cancelExecution} variant="destructive" size="icon">
              <Square className="w-4 h-4" />
            </Button>
          ) : (
            <Button 
              onClick={sendMultiModelMessage} 
              disabled={!inputMessage.trim() || models.length === 0}
              size="icon"
            >
              <Play className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {models.filter(m => m.enabled).length} model(s) selected • {mode} mode
        </div>
      </div>
    </div>
  );
};

export default MultiModelChat;
