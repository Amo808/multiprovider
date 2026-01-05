import React, { useState, useEffect, useReducer } from 'react';
import { Bot, Copy, Brain, Zap, ChevronDown, Trash2, Clock, Sparkles, Eye, EyeOff, GitBranch, Check, X, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
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

// Collapsible thinking section - ChatGPT style
const ThinkingSection: React.FC<{
  content: string;
  isStreaming?: boolean;
  tokens?: number;
}> = ({ content, isStreaming, tokens }) => {
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
};

// Code block with copy button - ChatGPT style
const CodeBlock: React.FC<{
  language?: string;
  children: string;
}> = ({ language, children }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] text-xs text-gray-400">
        <span>{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <SyntaxHighlighter
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
      </SyntaxHighlighter>
    </div>
  );
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({ 
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

  // User message - ChatGPT style (right aligned, simple)
  if (isUser) {
    return (
      <div className="flex justify-end mb-6 group">
        <div className="max-w-[85%] md:max-w-[70%]">
          <div className="bg-secondary dark:bg-[#2f2f2f] text-foreground px-4 py-2.5 rounded-2xl rounded-br-md">
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{displayContent}</p>
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

  // Assistant message - ChatGPT style (left aligned, no bubble)
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

          {/* Message content with markdown */}
          {displayContent ? (
            <div className={cn(
              "prose prose-sm max-w-none dark:prose-invert",
              "prose-p:leading-relaxed prose-p:my-2",
              "prose-headings:mt-4 prose-headings:mb-2",
              "prose-ul:my-2 prose-ol:my-2",
              "prose-li:my-0.5",
              "prose-pre:my-0 prose-pre:p-0 prose-pre:bg-transparent",
              isError && "text-destructive"
            )}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = !match && !String(children).includes('\n');
                    
                    if (isInline) {
                      return (
                        <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono" {...props}>
                          {children}
                        </code>
                      );
                    }
                    
                    return (
                      <CodeBlock language={match?.[1]}>
                        {String(children).replace(/\n$/, '')}
                      </CodeBlock>
                    );
                  },
                  pre({ children }) {
                    return <>{children}</>;
                  },
                  p({ children }) {
                    return <p className="text-[15px] leading-7">{children}</p>;
                  },
                  ul({ children }) {
                    return <ul className="list-disc pl-6 space-y-1">{children}</ul>;
                  },
                  ol({ children }) {
                    return <ol className="list-decimal pl-6 space-y-1">{children}</ol>;
                  },
                  li({ children }) {
                    return <li className="text-[15px] leading-7">{children}</li>;
                  },
                  a({ href, children }) {
                    return (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {children}
                      </a>
                    );
                  },
                  blockquote({ children }) {
                    return (
                      <blockquote className="border-l-2 border-muted-foreground/30 pl-4 italic text-muted-foreground">
                        {children}
                      </blockquote>
                    );
                  },
                }}
              >
                {displayContent}
              </ReactMarkdown>
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

          {/* Actions toolbar - ChatGPT style */}
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
};

export default MessageBubble;
