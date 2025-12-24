import React, { useState, useRef, useEffect, useReducer } from 'react';
import { Bot, User, Copy, Brain, Zap, ChevronUp, ChevronDown, Trash2, ChevronRight, Clock, Sparkles, Eye, EyeOff } from 'lucide-react';
import { Message, ModelInfo } from '../types';
import { cn } from '../lib/utils';

interface MessageBubbleProps {
  message: Message;
  index?: number;
  totalMessages?: number;
  selectedModel?: ModelInfo;
  isStreaming?: boolean;
  currentResponse?: string;
  deepResearchStage?: string;
  thinkingContent?: string;
  isThinking?: boolean;
  enableReordering?: boolean;
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
  onDelete?: (index: number) => void;
}

// Collapsible section component with animation
const CollapsibleSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  isActive?: boolean;
}> = ({ title, icon, badge, badgeColor = 'bg-purple-500/20 text-purple-500', children, defaultOpen = false, isActive = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(defaultOpen ? undefined : 0);

  useEffect(() => {
    if (isOpen) {
      const contentEl = contentRef.current;
      if (contentEl) {
        setHeight(contentEl.scrollHeight);
      }
    } else {
      setHeight(0);
    }
  }, [isOpen, children]);

  // Auto-expand when active
  useEffect(() => {
    if (isActive && !isOpen) {
      setIsOpen(true);
    }
  }, [isActive]);

  return (
    <div className={cn(
      "mt-2 border rounded-lg overflow-hidden transition-all duration-300",
      isActive ? "border-purple-500/50 shadow-lg shadow-purple-500/10" : "border-border",
      isOpen ? "bg-muted/30" : "bg-muted/10"
    )}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 text-left transition-colors",
          "hover:bg-muted/50",
          isActive && "bg-purple-500/10"
        )}
      >
        <div className="flex items-center gap-2">
          <div className={cn(
            "p-1 rounded transition-colors",
            isActive ? "bg-purple-500/20 text-purple-500" : "text-muted-foreground"
          )}>
            {icon}
          </div>
          <span className="text-sm font-medium">{title}</span>
          {badge && (
            <span className={cn("px-1.5 py-0.5 text-xs rounded", badgeColor)}>
              {badge}
            </span>
          )}
          {isActive && (
            <span className="flex gap-0.5 ml-1">
              <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          )}
        </div>
        <ChevronRight 
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform duration-300",
            isOpen && "rotate-90"
          )} 
        />
      </button>
      <div 
        style={{ height: height !== undefined ? `${height}px` : 'auto' }}
        className="transition-all duration-300 ease-in-out overflow-hidden"
      >
        <div ref={contentRef} className="px-3 pb-3">
          {children}
        </div>
      </div>
    </div>
  );
};

// Live thinking indicator with animated stages
const LiveThinkingIndicator: React.FC<{
  stage?: string;
  elapsedTime?: number;
}> = ({ stage, elapsedTime }) => {
  const [dots, setDots] = useState('');
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);
  
  const stages = [
    { key: 'analyzing', label: 'Analyzing', color: 'text-blue-500', bg: 'bg-blue-500/20' },
    { key: 'planning', label: 'Planning', color: 'text-purple-500', bg: 'bg-purple-500/20' },
    { key: 'reasoning', label: 'Reasoning', color: 'text-amber-500', bg: 'bg-amber-500/20' },
    { key: 'synthesizing', label: 'Synthesizing', color: 'text-green-500', bg: 'bg-green-500/20' },
  ];
  
  const currentStage = stages.find(s => stage?.toLowerCase().includes(s.key)) || stages[2]; // default to reasoning
  
  return (
    <div className="flex items-center gap-3 py-2">
      <div className={cn("p-1.5 rounded-md animate-pulse", currentStage.bg)}>
        <Brain className={cn("w-4 h-4", currentStage.color)} />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium", currentStage.color)}>
            {currentStage.label}{dots}
          </span>
          {elapsedTime !== undefined && elapsedTime > 0 && (
            <span className="text-xs text-muted-foreground">
              {elapsedTime.toFixed(1)}s
            </span>
          )}
        </div>
        <div className="flex gap-1 mt-1">
          {stages.map((s) => (
            <div
              key={s.key}
              className={cn(
                "h-1 flex-1 rounded-full transition-all duration-500",
                s.key === currentStage.key ? s.bg : "bg-muted",
                s.key === currentStage.key && "animate-pulse"
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// Reasoning content display with live streaming support
const ReasoningContent: React.FC<{
  content: string;
  isStreaming?: boolean;
  tokens?: number;
}> = ({ content, isStreaming, tokens }) => {
  const [showFull, setShowFull] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isLong = content.length > 500;
  const displayContent = showFull || !isLong ? content : content.substring(0, 500) + '...';
  
  // Auto-scroll to bottom during streaming
  useEffect(() => {
    if (isStreaming && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [content, isStreaming]);

  // Parse thinking content into steps if possible
  const parseThinkingSteps = (text: string) => {
    // Try to detect structured thinking (numbered steps, bullet points, etc.)
    const lines = text.split('\n').filter(l => l.trim());
    const steps: { type: 'step' | 'text'; content: string; number?: number }[] = [];
    
    lines.forEach(line => {
      const stepMatch = line.match(/^(\d+)[.)]\s*(.+)$/);
      const bulletMatch = line.match(/^[-•*]\s*(.+)$/);
      
      if (stepMatch) {
        steps.push({ type: 'step', content: stepMatch[2], number: parseInt(stepMatch[1]) });
      } else if (bulletMatch) {
        steps.push({ type: 'step', content: bulletMatch[1] });
      } else {
        steps.push({ type: 'text', content: line });
      }
    });
    
    return steps;
  };
  
  const steps = parseThinkingSteps(displayContent);
  const hasStructuredSteps = steps.some(s => s.type === 'step');

  return (
    <div className="space-y-2">
      {/* Live indicator when streaming */}
      {isStreaming && (
        <LiveThinkingIndicator stage="reasoning" />
      )}
      
      {/* Content */}
      <div 
        ref={containerRef}
        className={cn(
          "text-sm text-foreground/80 bg-background/50 rounded-lg p-3 max-h-80 overflow-y-auto",
          "border border-border/50",
          isStreaming && "border-purple-500/30"
        )}
      >
        {hasStructuredSteps ? (
          <div className="space-y-2">
            {steps.map((step, idx) => (
              <div key={idx} className="flex gap-2">
                {step.type === 'step' ? (
                  <>
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500/20 text-purple-500 flex items-center justify-center text-xs font-medium">
                      {step.number || '•'}
                    </div>
                    <span className="flex-1">{step.content}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">{step.content}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="whitespace-pre-wrap font-mono text-xs">
            {displayContent}
          </div>
        )}
        
        {isStreaming && (
          <span className="inline-block w-2 h-4 bg-purple-500 animate-pulse ml-1" />
        )}
      </div>
      
      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {tokens !== undefined && tokens > 0 && (
            <span className="flex items-center gap-1 text-purple-500">
              <Brain className="w-3 h-3" />
              {tokens.toLocaleString()} thinking tokens
            </span>
          )}
          <span>{content.length.toLocaleString()} chars</span>
        </div>
        {isLong && (
          <button
            onClick={() => setShowFull(!showFull)}
            className="flex items-center gap-1 text-blue-500 hover:text-blue-400"
          >
            {showFull ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showFull ? 'Show less' : 'Show all'}
          </button>
        )}
      </div>
    </div>
  );
};

// Message metadata display
const MessageMetadata: React.FC<{
  meta: Message['meta'];
}> = ({ meta }) => {
  if (!meta) return null;

  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      {meta.tokens_in !== undefined && (
        <div className="flex items-center gap-1 text-blue-500">
          <span>↑</span>
          <span>{meta.tokens_in.toLocaleString()} input</span>
        </div>
      )}
      {meta.tokens_out !== undefined && (
        <div className="flex items-center gap-1 text-green-500">
          <span>↓</span>
          <span>{meta.tokens_out.toLocaleString()} output</span>
        </div>
      )}
      {meta.thought_tokens !== undefined && meta.thought_tokens !== null && meta.thought_tokens > 0 && (
        <div className="flex items-center gap-1 text-purple-500">
          <Brain className="w-3 h-3" />
          <span>{meta.thought_tokens.toLocaleString()} thinking</span>
        </div>
      )}
      {meta.estimated_cost !== undefined && meta.estimated_cost !== null && (
        <div className="flex items-center gap-1 text-yellow-500">
          <Sparkles className="w-3 h-3" />
          <span>${meta.estimated_cost.toFixed(4)}</span>
        </div>
      )}
      {meta.total_latency !== undefined && meta.total_latency !== null && (
        <div className="flex items-center gap-1 text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{meta.total_latency.toFixed(1)}s</span>
        </div>
      )}
    </div>
  );
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({ 
  message, 
  index, 
  totalMessages, 
  selectedModel, 
  isStreaming = false, 
  currentResponse = '', 
  deepResearchStage,
  thinkingContent,
  isThinking,
  enableReordering, 
  onMoveUp, 
  onMoveDown, 
  onDelete 
}) => {
  const [copied, setCopied] = useState(false);
  // Force re-render counter when reasoning content changes
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  const handleCopy = async () => {
    const content = isStreaming ? currentResponse : message.content;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayContent = isStreaming ? currentResponse : message.content;
  const isUser = message.role === 'user';
  const isError = message.content?.startsWith('Error:') ?? false;
  
  // Check for reasoning content from various sources - prioritize thinkingContent (live streaming)
  // then fall back to message.meta values
  const metaReasoning = message.meta?.reasoning_content || message.meta?.thought_content || message.meta?.thinking || '';
  const reasoningContent = thinkingContent || metaReasoning;
  const hasReasoning = !!reasoningContent;
  
  // Debug logging for reasoning content tracking
  useEffect(() => {
    if (message.role === 'assistant') {
      console.log(`[MessageBubble ${message.id?.substring(0, 8)}] Reasoning state:`, {
        thinkingContent: thinkingContent?.length || 0,
        metaReasoning: metaReasoning?.length || 0,
        reasoningContent: reasoningContent?.length || 0,
        isThinking,
        isStreaming,
        thought_tokens: message.meta?.thought_tokens
      });
    }
  }, [message.id, thinkingContent, metaReasoning, reasoningContent, isThinking, isStreaming, message.meta?.thought_tokens, message.role]);
  
  // Force update when reasoning content changes to ensure re-render
  useEffect(() => {
    if (reasoningContent && reasoningContent.length > 0) {
      forceUpdate();
    }
  }, [reasoningContent.length, message.meta?.thought_tokens]);
  
  // Also show reasoning section if we have thought_tokens > 0 (Gemini sometimes only returns count)
  // Don't show if thought_tokens is 0 or undefined - that means no reasoning happened
  const hasThoughtTokens = typeof message.meta?.thought_tokens === 'number' && message.meta.thought_tokens > 0;
  
  // Only show reasoning section if:
  // 1. We have actual reasoning content, OR
  // 2. We're currently thinking (streaming), OR
  // 3. We have thought_tokens > 0 (model did reasoning but content wasn't captured)
  // Don't show for models that don't support thinking (like Claude, GPT without o1)
  const showReasoningSection = hasReasoning || (isThinking && isStreaming) || hasThoughtTokens;
  
  const hasMeta = message.meta && (message.meta.tokens_in || message.meta.tokens_out || message.meta.estimated_cost);

  return (
    <div className={cn(
      "flex items-start space-x-3 max-w-4xl mx-auto px-4 py-4 transition-all duration-300",
      isUser ? "flex-row-reverse space-x-reverse" : ""
    )}>
      {/* Avatar */}
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300",
        isUser 
          ? "bg-blue-600 text-white" 
          : isError 
            ? "bg-red-600 text-white"
            : isThinking
              ? "bg-purple-600 text-white animate-pulse"
              : "bg-gray-600 text-white"
      )}>
        {isUser ? <User size={16} /> : isThinking ? <Brain size={16} /> : <Bot size={16} />}
      </div>

      {/* Message Content */}
      <div className={cn("flex-1 min-w-0", isUser ? "text-right" : "")}>
        {/* Header */}
        <div className="flex items-center space-x-2 mb-1 flex-wrap">
          <span className="text-sm font-medium text-foreground">
            {isUser ? 'You' : (
              message.meta?.model ? 
                (selectedModel?.id === message.meta.model ? selectedModel.display_name : message.meta.model) :
                (selectedModel?.display_name || 'Assistant')
            )}
          </span>
          {message.meta?.provider && !isUser && (
            <span className="px-2 py-0.5 text-xs bg-secondary text-secondary-foreground rounded-full">
              {String(message.meta.provider).toUpperCase()}
            </span>
          )}
          {!isUser && (deepResearchStage || message.meta?.deep_research) && (
            <span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-500 rounded-full flex items-center gap-1">
              <Zap size={10} />
              <span>Deep Research</span>
            </span>
          )}
          {isStreaming && (
            <div className="flex items-center gap-1">
              {isThinking ? (
                <>
                  <Brain size={12} className="animate-pulse text-purple-500" />
                  <span className="text-xs text-purple-500">Reasoning...</span>
                </>
              ) : (
                <>
                  <Zap size={12} className="animate-pulse text-green-500" />
                  <span className="text-xs text-green-500">Streaming...</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Main bubble */}
        <div className={cn(
          "relative group rounded-lg p-4 transition-all duration-300",
          isUser 
            ? "bg-blue-600 text-white ml-8" 
            : isError
              ? "bg-destructive/10 border border-destructive/50 mr-8"
              : "bg-card border border-border mr-8",
          isThinking && !isUser && "border-purple-500/50 shadow-lg shadow-purple-500/10"
        )}>
          {isError && (
            <div className="flex items-center space-x-2 mb-2 text-destructive">
              <Zap size={16} />
              <span className="text-sm font-medium">Error</span>
            </div>
          )}
          
          {/* Message text */}
          <div className={cn(
            "prose prose-sm max-w-none",
            isUser 
              ? "text-white prose-invert" 
              : isError
                ? "text-destructive"
                : "text-foreground prose-gray dark:prose-invert"
          )}>
            {!isUser && !displayContent && !isError ? (
              deepResearchStage ? (
                <div className="flex items-center space-x-2 text-blue-500">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm whitespace-pre-wrap">{deepResearchStage}</span>
                </div>
              ) : isThinking ? (
                <div className="flex items-center space-x-2 text-purple-500">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm">🧠 Model is reasoning...</span>
                </div>
              ) : isStreaming ? (
                <div className="flex items-center space-x-2 text-green-500">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm">💭 Generating...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-muted-foreground">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm">⏳ Preparing...</span>
                </div>
              )
            ) : (
              <p className="whitespace-pre-wrap m-0">
                {displayContent}
                {isStreaming && !isThinking && <span className="animate-pulse">▊</span>}
              </p>
            )}
          </div>

          {/* Copy button */}
          {displayContent && !isStreaming && (
            <button
              onClick={handleCopy}
              className={cn(
                "absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md",
                isUser 
                  ? "text-white/70 hover:text-white hover:bg-white/20" 
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
              title={copied ? 'Copied!' : 'Copy message'}
            >
              <Copy size={14} />
            </button>
          )}

          {/* Reorder controls */}
          {enableReordering && index !== undefined && totalMessages !== undefined && (
            <div className={cn(
              "absolute top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
              isUser ? "left-2" : "right-12"
            )}>
              <button
                onClick={() => onMoveUp?.(index)}
                disabled={index === 0}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  index === 0 
                    ? "text-muted-foreground/40 cursor-not-allowed" 
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
                title="Move up"
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={() => onMoveDown?.(index)}
                disabled={index === totalMessages - 1}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  index === totalMessages - 1 
                    ? "text-muted-foreground/40 cursor-not-allowed" 
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
                title="Move down"
              >
                <ChevronDown size={14} />
              </button>
              <button
                onClick={() => onDelete?.(index)}
                className="p-1.5 rounded-md text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Delete message"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Expandable sections for assistant messages */}
        {!isUser && (
          <div className="mr-8 space-y-1">
            {/* Reasoning/Thinking section */}
            {showReasoningSection && (
              <CollapsibleSection
                title={isThinking ? "Thinking..." : "Reasoning Process"}
                icon={<Brain className="w-4 h-4" />}
                badge={hasThoughtTokens ? `${message.meta?.thought_tokens?.toLocaleString()} tokens` : (isThinking ? "live" : undefined)}
                badgeColor={isThinking ? "bg-purple-500/30 text-purple-400 animate-pulse" : "bg-purple-500/20 text-purple-500"}
                defaultOpen={isThinking || hasReasoning || (hasThoughtTokens && !reasoningContent)}
                isActive={isThinking}
              >
                {isThinking && !reasoningContent ? (
                  // Show live thinking indicator when no content yet
                  <div className="space-y-3">
                    <LiveThinkingIndicator stage="reasoning" />
                    <div className="text-sm text-muted-foreground italic text-center py-2">
                      🧠 Model is thinking deeply...
                    </div>
                  </div>
                ) : reasoningContent ? (
                  <ReasoningContent 
                    content={reasoningContent}
                    isStreaming={isThinking}
                    tokens={message.meta?.thought_tokens}
                  />
                ) : hasThoughtTokens ? (
                  <div className="text-sm text-muted-foreground italic">
                    Model performed reasoning ({message.meta?.thought_tokens?.toLocaleString()} tokens), but thought content was not captured.
                    <br />
                    <span className="text-xs">Enable "Include Thoughts" in settings to see reasoning content.</span>
                  </div>
                ) : null}
              </CollapsibleSection>
            )}

            {/* Metadata section */}
            {hasMeta && !isStreaming && (
              <CollapsibleSection
                title="Details"
                icon={<Sparkles className="w-4 h-4" />}
                defaultOpen={false}
              >
                <MessageMetadata meta={message.meta} />
              </CollapsibleSection>
            )}
          </div>
        )}

        {/* Timestamp */}
        <div className={cn(
          "mt-1 text-xs text-muted-foreground",
          isUser ? "text-right mr-0" : "mr-8"
        )}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
