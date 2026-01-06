import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  responses: ParallelResponse[];
  onClose?: () => void;
}

// Clean response content - filter garbage prefixes
const cleanResponseContent = (content: string): string => {
  return content
    .replace(/^\s*\(Reasoning mode enabled.*?\)\s*/gi, '')
    .replace(/^\s*\(Note: Reasoning mode.*?\)\s*/gi, '')
    .replace(/^\s*\[Reasoning mode enabled.*?\]\s*/gi, '')
    .replace(/^\s*Note:\s*Reasoning mode.*?\n*/gi, '')
    .replace(/^\s*\*\*Note:\*\*\s*Reasoning mode.*?\n*/gi, '')
    .replace(/^0\s+/, '')
    .replace(/^0\n/, '')
    .replace(/^\s*0\s*$/, '')
    .trim();
};

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

// Single response column component - shows only model's response
const ResponseColumn: React.FC<{
  response: ParallelResponse;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}> = ({ response, isExpanded, onToggleExpand }) => {
  const [copied, setCopied] = useState(false);
  // Always start collapsed - user can expand manually if needed
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
      "flex flex-col rounded-lg border transition-all duration-300 overflow-hidden",
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
            <span className="text-sm font-medium text-foreground truncate max-w-[120px] block">
              {response.model.display_name}
            </span>
            <span className={cn("text-xs uppercase", colors.text)}>
              {response.model.provider}
            </span>
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

      {/* Thinking section (collapsible) - always starts collapsed */}
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
              {response.isThinking ? "Thinking..." : `View reasoning${response.meta?.thought_tokens ? ` (${response.meta.thought_tokens.toLocaleString()})` : ''}`}
            </span>
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

      {/* Response content only - no user message */}
      <div 
        ref={contentRef}
        className="flex-1 overflow-y-auto min-h-0 p-3"
      >
        {response.error ? (
          <div className="text-destructive text-sm">⚠️ {response.error}</div>
        ) : !response.content && (response.isStreaming || response.isThinking) ? (
          <div className="flex items-center gap-2 text-muted-foreground py-1">
            <div className="flex space-x-1">
              <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs">{response.isThinking ? "Thinking..." : "Writing..."}</span>
          </div>
        ) : (
          <p className="text-sm text-foreground whitespace-pre-wrap break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {cleanResponseContent(response.content)}
            </ReactMarkdown>
            {response.isStreaming && <span className="animate-pulse">▊</span>}
          </p>
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
  responses,
  onClose,
}) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Calculate grid columns based on response count
  const gridCols = responses.length <= 2 ? 'grid-cols-1 md:grid-cols-2' 
                  : responses.length === 3 ? 'grid-cols-1 md:grid-cols-3'
                  : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';

  return (
    <div className="flex flex-col h-full">
      {/* Header with model count */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/50">
        <span className="text-xs text-muted-foreground">
          {responses.length} model{responses.length > 1 ? 's' : ''} responding
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
            title="Close comparison"
          >
            <X size={14} className="text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Responses grid */}
      <div className={cn(
        "flex-1 overflow-y-auto p-3",
        expandedIndex === null ? `grid ${gridCols} gap-3 items-start` : ""
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
