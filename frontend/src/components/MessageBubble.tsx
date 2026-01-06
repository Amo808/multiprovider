import React, { useState, useEffect, useReducer, memo } from 'react';
import { Bot, Copy, Brain, Zap, ChevronDown, Trash2, Clock, Sparkles, Eye, EyeOff, GitBranch, Check, X, RotateCcw } from 'lucide-react';
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
  onDelete?: () => void;
  onBranchFrom?: (index: number) => void;
  onRegenerate?: () => void;
}

// Memoized thinking section
const ThinkingSection = memo<{
  content: string;
  isStreaming?: boolean;
  tokens?: number;
}>(({ content, isStreaming, tokens }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const isLong = content.length > 1000;
  const displayContent = showFull || !isLong ? content : content.substring(0, 1000) + '...';

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 text-sm transition-colors",
          isStreaming ? "text-purple-500" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Brain className={cn("w-4 h-4", isStreaming && "animate-pulse")} />
        <span>{isStreaming ? "Thinking..." : "Thought process"}</span>
        {tokens && tokens > 0 && (
          <span className="text-xs text-muted-foreground">({tokens.toLocaleString()} tokens)</span>
        )}
        <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="mt-2 pl-6 border-l-2 border-purple-500/30">
          <div className="text-sm text-muted-foreground whitespace-pre-wrap font-mono text-xs leading-relaxed">
            {displayContent}
            {isStreaming && <span className="inline-block w-1.5 h-4 bg-purple-500 animate-pulse ml-0.5" />}
          </div>
          {isLong && !isStreaming && (
            <button
              onClick={() => setShowFull(!showFull)}
              className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
            >
              {showFull ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showFull ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
});
ThinkingSection.displayName = 'ThinkingSection';

// OPTIMIZED: Lightweight code block - no syntax highlighting by default
const CodeBlock = memo<{
  language?: string;
  children: string;
}>(({ language, children }) => {
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState(false);
  const [highlightedCode, setHighlightedCode] = useState<React.ReactNode>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Lazy load syntax highlighting only when user clicks
  const handleHighlight = async () => {
    if (highlighted) return;
    setHighlighted(true);

    try {
      const [{ Prism }, { oneDark }] = await Promise.all([
        import('react-syntax-highlighter'),
        import('react-syntax-highlighter/dist/esm/styles/prism')
      ]);

      setHighlightedCode(
        <Prism
          language={language || 'text'}
          style={oneDark}
          customStyle={{
            margin: 0,
            padding: '1rem',
            background: '#1e1e1e',
            fontSize: '13px',
          }}
        >
          {children}
        </Prism>
      );
    } catch (e) {
      console.error('Failed to load syntax highlighter:', e);
    }
  };

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] text-xs text-gray-400">
        <span>{language || 'code'}</span>
        <div className="flex items-center gap-2">
          {!highlighted && (
            <button
              onClick={handleHighlight}
              className="flex items-center gap-1 hover:text-white transition-colors"
              title="Enable syntax highlighting"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Highlight</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 hover:text-white transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>
      </div>
      {highlightedCode || (
        <pre className="m-0 p-4 bg-[#1e1e1e] text-[13px] overflow-x-auto">
          <code className="text-gray-300 font-mono">{children}</code>
        </pre>
      )}
    </div>
  );
});
CodeBlock.displayName = 'CodeBlock';

// Constants for content limits (progressive markdown rendering)
const TRUNCATE_LIMIT = 50000;         // Progressive loading above this
const PREVIEW_LENGTH = 3000;          // Characters to show in preview
const CHUNK_SIZE = 20000;             // Load 20k chars at a time for huge messages

// Smart Content Renderer - handles huge messages with proper markdown rendering
const SmartContent = memo<{ content: string; isStreaming?: boolean }>(({ content, isStreaming }) => {
  const [visibleLength, setVisibleLength] = useState(PREVIEW_LENGTH);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // For streaming, use SimpleMarkdown (optimized, no heavy parsing)
  if (isStreaming) {
    return <SimpleMarkdown content={content} />;
  }

  // Small/medium content - render with markdown immediately
  if (content.length < TRUNCATE_LIMIT) {
    return <SimpleMarkdown content={content} />;
  }

  // Large/Huge content - progressive loading WITH markdown
  const displayContent = content.slice(0, visibleLength);
  const remaining = content.length - visibleLength;
  const isFullyLoaded = visibleLength >= content.length;

  const loadMore = () => {
    setIsLoadingMore(true);
    // Use requestAnimationFrame to prevent UI freeze
    requestAnimationFrame(() => {
      setVisibleLength(prev => Math.min(prev + CHUNK_SIZE, content.length));
      setIsLoadingMore(false);
    });
  };

  const loadAll = () => {
    setIsLoadingMore(true);
    // Load in chunks to prevent freeze
    const loadChunk = (currentLength: number) => {
      if (currentLength >= content.length) {
        setIsLoadingMore(false);
        return;
      }
      setVisibleLength(Math.min(currentLength + CHUNK_SIZE * 2, content.length));
      requestAnimationFrame(() => loadChunk(currentLength + CHUNK_SIZE * 2));
    };
    requestAnimationFrame(() => loadChunk(visibleLength));
  };

  const collapse = () => {
    setVisibleLength(PREVIEW_LENGTH);
  };

  return (
    <div>
      {/* Always render markdown, even for huge content */}
      <SimpleMarkdown content={displayContent} />

      {!isFullyLoaded && (
        <div className="text-muted-foreground text-sm py-2">...</div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {/* Progress indicator */}
        <span className="text-muted-foreground">
          {(visibleLength / 1000).toFixed(0)}k / {(content.length / 1000).toFixed(0)}k chars
          {!isFullyLoaded && ` (${((visibleLength / content.length) * 100).toFixed(0)}%)`}
        </span>

        {!isFullyLoaded && (
          <>
            <button
              onClick={loadMore}
              disabled={isLoadingMore}
              className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors disabled:opacity-50"
            >
              {isLoadingMore ? 'Loading...' : `+${Math.min(CHUNK_SIZE / 1000, remaining / 1000).toFixed(0)}k more`}
            </button>
            <button
              onClick={loadAll}
              disabled={isLoadingMore}
              className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-md transition-colors disabled:opacity-50"
            >
              Load all ({(remaining / 1000).toFixed(0)}k)
            </button>
          </>
        )}

        {visibleLength > PREVIEW_LENGTH && (
          <button
            onClick={collapse}
            className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-md transition-colors"
          >
            Collapse
          </button>
        )}
      </div>
    </div>
  );
});
SmartContent.displayName = 'SmartContent';

// OPTIMIZED: Simple markdown renderer - much faster than ReactMarkdown
const SimpleMarkdown = memo<{ content: string }>(({ content }) => {
  // Fast inline code replacement
  const renderContent = () => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let key = 0;

    // Split by code blocks first
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        parts.push(
          <span key={key++}>
            {renderInlineContent(content.slice(lastIndex, match.index))}
          </span>
        );
      }

      // Add code block
      parts.push(
        <CodeBlock key={key++} language={match[1]}>
          {match[2].trim()}
        </CodeBlock>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(
        <span key={key++}>
          {renderInlineContent(content.slice(lastIndex))}
        </span>
      );
    }

    return parts.length > 0 ? parts : renderInlineContent(content);
  };

  // Render inline elements (bold, italic, inline code, links)
  const renderInlineContent = (text: string): React.ReactNode => {
    // Split into paragraphs
    const paragraphs = text.split(/\n\n+/);

    return paragraphs.map((para, i) => {
      if (!para.trim()) return null;

      // Check for headers
      const headerMatch = para.match(/^(#{1,6})\s+(.+)$/m);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const HeaderTag = `h${level}` as keyof JSX.IntrinsicElements;
        return <HeaderTag key={i} className="font-bold mt-4 mb-2">{headerMatch[2]}</HeaderTag>;
      }

      // Check for list
      if (para.match(/^[-*]\s/m)) {
        const items = para.split(/\n/).filter(l => l.trim());
        return (
          <ul key={i} className="list-disc pl-6 my-2 space-y-1">
            {items.map((item, j) => (
              <li key={j} className="text-[15px]">{item.replace(/^[-*]\s+/, '')}</li>
            ))}
          </ul>
        );
      }

      // Check for numbered list
      if (para.match(/^\d+\.\s/m)) {
        const items = para.split(/\n/).filter(l => l.trim());
        return (
          <ol key={i} className="list-decimal pl-6 my-2 space-y-1">
            {items.map((item, j) => (
              <li key={j} className="text-[15px]">{item.replace(/^\d+\.\s+/, '')}</li>
            ))}
          </ol>
        );
      }

      // Regular paragraph with inline formatting
      let processed = para;

      // Handle inline code
      processed = processed.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">$1</code>');

      // Handle bold
      processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

      // Handle italic
      processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>');

      // Handle links
      processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">$1</a>');

      // Handle line breaks within paragraph
      processed = processed.replace(/\n/g, '<br/>');

      return (
        <p
          key={i}
          className="text-[15px] leading-7 my-2"
          dangerouslySetInnerHTML={{ __html: processed }}
        />
      );
    });
  };

  return <div className="prose prose-sm max-w-none dark:prose-invert">{renderContent()}</div>;
});
SimpleMarkdown.displayName = 'SimpleMarkdown';

// Main component - MEMOIZED
export const MessageBubble = memo<MessageBubbleProps>(({
  message,
  index,
  selectedModel,
  isStreaming = false,
  currentResponse = '',
  deepResearchStage,
  thinkingContent,
  isThinking,
  onDelete,
  onBranchFrom,
  onRegenerate
}) => {
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  const handleCopy = async () => {
    const content = isStreaming ? currentResponse : message.content;
    if (content) {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const displayContent = isStreaming ? currentResponse : message.content;
  const isUser = message.role === 'user';
  const isError = message.content?.startsWith('Error:') ?? false;

  // Reasoning content
  const metaReasoning = message.meta?.reasoning_content || message.meta?.thought_content || message.meta?.thinking || '';
  const reasoningContent = thinkingContent || metaReasoning;
  const hasReasoning = !!reasoningContent;
  const hasThoughtTokens = typeof message.meta?.thought_tokens === 'number' && message.meta.thought_tokens > 0;
  const showReasoningSection = hasReasoning || (isThinking && isStreaming) || hasThoughtTokens;

  useEffect(() => {
    if (reasoningContent && reasoningContent.length > 0) {
      forceUpdate();
    }
  }, [reasoningContent.length, message.meta?.thought_tokens]);

  // User message - simple, right aligned
  if (isUser) {
    return (
      <div className="flex justify-end mb-6 group">
        <div className="max-w-[85%] md:max-w-[70%]">
          <div className="bg-secondary dark:bg-[#2f2f2f] text-foreground px-4 py-2.5 rounded-2xl rounded-br-md">
            {/* Use SmartContent for large user messages to prevent freeze */}
            <div className="text-[15px] leading-relaxed">
              <SmartContent content={displayContent || ''} />
            </div>
          </div>
          {/* Actions on hover */}
          <div className="flex justify-end mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-1">
              <button
                onClick={handleCopy}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary/50 transition-colors"
                title="Copy"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              {onDelete && (
                <>
                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-0.5 bg-card border border-border rounded-md p-0.5">
                      <button onClick={() => { onDelete(); setShowDeleteConfirm(false); }} className="p-1 text-green-500 hover:bg-green-500/10 rounded" title="Confirm">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setShowDeleteConfirm(false)} className="p-1 text-muted-foreground hover:bg-secondary rounded" title="Cancel">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setShowDeleteConfirm(true)} className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10 transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="mb-6 group">
      <div className="flex gap-4 max-w-4xl">
        {/* Avatar */}
        <div className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isError ? "bg-destructive text-destructive-foreground" :
            isThinking ? "bg-purple-600 text-white" :
              "bg-foreground/10 text-foreground"
        )}>
          {isThinking ? <Brain className="w-4 h-4 animate-pulse" /> : <Bot className="w-4 h-4" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pt-1">
          {/* Model name */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-semibold text-foreground">
              {message.meta?.model ?
                (selectedModel?.id === message.meta.model ? selectedModel.display_name : message.meta.model) :
                (selectedModel?.display_name || 'Assistant')
              }
            </span>
            {message.meta?.provider && (
              <span className="text-xs text-muted-foreground">
                {String(message.meta.provider)}
              </span>
            )}
            {isStreaming && !isThinking && (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                generating
              </span>
            )}
          </div>

          {/* Thinking section */}
          {showReasoningSection && (
            <ThinkingSection
              content={reasoningContent || 'Thinking...'}
              isStreaming={isThinking}
              tokens={message.meta?.thought_tokens}
            />
          )}

          {/* Deep research status */}
          {deepResearchStage && !displayContent && (
            <div className="flex items-center gap-2 text-sm text-blue-500 mb-2">
              <Zap className="w-4 h-4 animate-pulse" />
              <span>{deepResearchStage}</span>
            </div>
          )}

          {/* Message content - OPTIMIZED with SmartContent */}
          {displayContent ? (
            <div className={cn(isError && "text-destructive")}>
              <SmartContent content={displayContent} isStreaming={isStreaming} />
              {isStreaming && !isThinking && (
                <span className="inline-block w-2 h-5 bg-foreground/70 animate-pulse ml-0.5 -mb-1" />
              )}
            </div>
          ) : isThinking ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          ) : isStreaming ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          ) : null}

          {/* Actions toolbar */}
          {!isStreaming && displayContent && (
            <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleCopy}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary/50 transition-colors"
                title={copied ? 'Copied!' : 'Copy'}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>

              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary/50 transition-colors"
                  title="Regenerate"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}

              {onBranchFrom && index !== undefined && (
                <button
                  onClick={() => onBranchFrom(index)}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary/50 transition-colors"
                  title="Branch from here"
                >
                  <GitBranch className="w-4 h-4" />
                </button>
              )}

              {onDelete && (
                <>
                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-0.5 bg-card border border-border rounded-md p-0.5 ml-1">
                      <button onClick={() => { onDelete(); setShowDeleteConfirm(false); }} className="p-1 text-green-500 hover:bg-green-500/10 rounded" title="Confirm">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setShowDeleteConfirm(false)} className="p-1 text-muted-foreground hover:bg-secondary rounded" title="Cancel">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setShowDeleteConfirm(true)} className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10 transition-colors" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}

              {/* Meta info */}
              {message.meta && (
                <div className="flex items-center gap-3 ml-3 text-xs text-muted-foreground">
                  {message.meta.tokens_out && (
                    <span>{message.meta.tokens_out.toLocaleString()} tokens</span>
                  )}
                  {message.meta.total_latency && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {message.meta.total_latency.toFixed(1)}s
                    </span>
                  )}
                  {message.meta.estimated_cost !== undefined && message.meta.estimated_cost > 0 && (
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      ${message.meta.estimated_cost.toFixed(4)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';

export default MessageBubble;
