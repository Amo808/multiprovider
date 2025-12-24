import React, { useState, useEffect, useRef } from 'react';
import { Bot, Brain, Copy, Check, Sparkles, ChevronRight, Maximize2, Minimize2, X } from 'lucide-react';
import { ModelInfo, ModelProvider } from '../types';
import { cn } from '../lib/utils';

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

interface ParallelResponseViewProps {
  userMessage: string;
  responses: ParallelResponse[];
  onClose?: () => void;
}

// Provider colors
const providerColors: Record<ModelProvider, { bg: string; text: string; gradient: string }> = {
  openai: { bg: 'bg-green-500/10', text: 'text-green-500', gradient: 'from-green-500/20 to-green-500/5' },
  anthropic: { bg: 'bg-orange-500/10', text: 'text-orange-500', gradient: 'from-orange-500/20 to-orange-500/5' },
  gemini: { bg: 'bg-blue-500/10', text: 'text-blue-500', gradient: 'from-blue-500/20 to-blue-500/5' },
  deepseek: { bg: 'bg-purple-500/10', text: 'text-purple-500', gradient: 'from-purple-500/20 to-purple-500/5' },
  ollama: { bg: 'bg-gray-500/10', text: 'text-gray-500', gradient: 'from-gray-500/20 to-gray-500/5' },
  groq: { bg: 'bg-red-500/10', text: 'text-red-500', gradient: 'from-red-500/20 to-red-500/5' },
  mistral: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', gradient: 'from-yellow-500/20 to-yellow-500/5' },
  chatgpt_pro: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', gradient: 'from-emerald-500/20 to-emerald-500/5' },
};

// Single response column component
const ResponseColumn: React.FC<{
  response: ParallelResponse;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}> = ({ response, isExpanded, onToggleExpand }) => {
  const [copied, setCopied] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  
  const colors = providerColors[response.model.provider] || providerColors.ollama;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(response.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Auto-scroll while streaming
  useEffect(() => {
    if (response.isStreaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [response.content, response.isStreaming]);

  return (
    <div className={cn(
      "flex flex-col h-full rounded-lg border transition-all duration-300 overflow-hidden",
      "bg-card border-border",
      response.isThinking && "border-purple-500/50 shadow-lg shadow-purple-500/10",
      isExpanded && "col-span-full"
    )}>
      {/* Header */}
      <div className={cn(
        "flex items-center justify-between px-3 py-2 border-b border-border",
        `bg-gradient-to-r ${colors.gradient}`
      )}>
        <div className="flex items-center gap-2">
          <div className={cn(
            "p-1 rounded",
            colors.bg
          )}>
            {response.isThinking ? (
              <Brain size={14} className="text-purple-500 animate-pulse" />
            ) : (
              <Bot size={14} className={colors.text} />
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-foreground truncate max-w-[150px]">
              {response.model.display_name}
            </div>
            <div className={cn("text-xs uppercase", colors.text)}>
              {response.model.provider}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {response.content && !response.isStreaming && (
            <button
              onClick={handleCopy}
              className="p-1.5 rounded hover:bg-muted transition-colors"
              title="Copy response"
            >
              {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} className="text-muted-foreground" />}
            </button>
          )}
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              className="p-1.5 rounded hover:bg-muted transition-colors"
              title={isExpanded ? "Minimize" : "Expand"}
            >
              {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          )}
        </div>
      </div>

      {/* Thinking section (collapsible) */}
      {(response.thinkingContent || response.isThinking) && (
        <div className="border-b border-border">
          <button
            onClick={() => setShowThinking(!showThinking)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors",
              "hover:bg-muted/50",
              response.isThinking && "bg-purple-500/10"
            )}
          >
            <Brain size={12} className={response.isThinking ? "text-purple-500 animate-pulse" : "text-muted-foreground"} />
            <span className={response.isThinking ? "text-purple-500" : "text-muted-foreground"}>
              {response.isThinking ? "Thinking..." : "View reasoning"}
            </span>
            {response.meta?.thought_tokens && (
              <span className="text-muted-foreground">
                ({response.meta.thought_tokens.toLocaleString()} tokens)
              </span>
            )}
            <ChevronRight size={12} className={cn(
              "ml-auto transition-transform",
              showThinking && "rotate-90"
            )} />
          </button>
          {showThinking && response.thinkingContent && (
            <div className="px-3 py-2 bg-muted/30 max-h-32 overflow-y-auto">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                {response.thinkingContent}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Main content */}
      <div 
        ref={contentRef}
        className="flex-1 overflow-y-auto p-3 min-h-0"
      >
        {response.error ? (
          <div className="text-destructive text-sm">
            ⚠️ {response.error}
          </div>
        ) : !response.content && (response.isStreaming || response.isThinking) ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-sm">
              {response.isThinking ? "Reasoning..." : "Generating..."}
            </span>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
            <p className="whitespace-pre-wrap m-0">
              {response.content}
              {response.isStreaming && <span className="animate-pulse">▊</span>}
            </p>
          </div>
        )}
      </div>

      {/* Footer with stats */}
      {response.meta && !response.isStreaming && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border text-xs text-muted-foreground bg-muted/30">
          {response.meta.tokens_in !== undefined && (
            <span className="text-blue-500">↑{response.meta.tokens_in}</span>
          )}
          {response.meta.tokens_out !== undefined && (
            <span className="text-green-500">↓{response.meta.tokens_out}</span>
          )}
          {response.meta.thought_tokens !== undefined && response.meta.thought_tokens !== null && response.meta.thought_tokens > 0 && (
            <span className="text-purple-500">🧠{response.meta.thought_tokens}</span>
          )}
          {response.meta.estimated_cost !== undefined && response.meta.estimated_cost !== null && (
            <span className="flex items-center gap-0.5 text-yellow-500">
              <Sparkles size={10} />
              ${response.meta.estimated_cost.toFixed(4)}
            </span>
          )}
          {response.meta.total_latency !== undefined && response.meta.total_latency !== null && (
            <span>{response.meta.total_latency.toFixed(1)}s</span>
          )}
        </div>
      )}
    </div>
  );
};

export const ParallelResponseView: React.FC<ParallelResponseViewProps> = ({
  userMessage,
  responses,
  onClose,
}) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Calculate grid columns based on response count
  const gridCols = responses.length <= 2 ? 'grid-cols-1 md:grid-cols-2' 
                  : responses.length === 3 ? 'grid-cols-1 md:grid-cols-3'
                  : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';

  return (
    <div className="flex flex-col h-full bg-background">
      {/* User message header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="p-1.5 rounded-full bg-blue-600 text-white flex-shrink-0">
            <Bot size={14} />
          </div>
          <div className="overflow-hidden">
            <div className="text-xs text-muted-foreground">Your question:</div>
            <div className="text-sm font-medium text-foreground truncate max-w-xl">
              {userMessage}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded-full">
            {responses.length} models
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-muted transition-colors"
              title="Close comparison"
            >
              <X size={16} className="text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Responses grid */}
      <div className={cn(
        "flex-1 overflow-y-auto p-4",
        expandedIndex === null ? `grid ${gridCols} gap-4` : ""
      )}>
        {expandedIndex !== null ? (
          <ResponseColumn
            response={responses[expandedIndex]}
            isExpanded={true}
            onToggleExpand={() => setExpandedIndex(null)}
          />
        ) : (
          responses.map((response, index) => (
            <ResponseColumn
              key={`${response.model.provider}-${response.model.id}`}
              response={response}
              onToggleExpand={() => setExpandedIndex(index)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ParallelResponseView;
