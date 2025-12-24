import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Bot, User, Copy, RefreshCcw, ThumbsUp, ThumbsDown, Check, Loader2, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import DOMPurify from 'dompurify';
import 'katex/dist/katex.min.css';
import { ModelInfo } from '../types';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { cn } from '../lib/utils'; // updated path to avoid alias resolution issues

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  meta?: Record<string, any>;
}

interface ChatMessageProps {
  message: ChatMessageData;
  index?: number;
  totalMessages?: number;
  isStreaming?: boolean;
  streamContent?: string;
  selectedModel?: ModelInfo;
  onRegenerate?: (message: ChatMessageData) => void;
  onFeedback?: (message: ChatMessageData, value: 'up' | 'down') => void;
  // NEW: Reordering callbacks
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
  onDelete?: (index: number) => void;
  enableReordering?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, index, totalMessages, isStreaming, streamContent, selectedModel, onRegenerate, onFeedback, onMoveUp, onMoveDown, onDelete, enableReordering }) => {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [codeCopiedId, setCodeCopiedId] = useState<string | null>(null);
  const display = isStreaming && streamContent ? streamContent : message.content;
  const safeDisplay = DOMPurify.sanitize(display);
  const isUser = message.role === 'user';
  const isAssistant = !isUser;
  const isLong = display.length > 1800 || display.split('\n').length > 40;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(display);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCodeCopy = async (code: string, id: string) => {
    await navigator.clipboard.writeText(code);
    setCodeCopiedId(id);
    setTimeout(() => setCodeCopiedId(null), 1500);
  };

  // Bubble styles
  const bubbleClass = cn(
    'p-4 rounded-2xl text-sm leading-relaxed shadow-sm border transition-colors relative',
    isUser
      ? 'bg-primary text-primary-foreground border-primary/40 hover:border-primary/60'
      : 'bg-card text-card-foreground dark:bg-muted/40 border-border/60 backdrop-blur-sm'
  );

  return (
    <div className={cn('flex w-full items-start gap-3 px-4 py-4 group', isUser && 'flex-row-reverse text-right')}>      
      <Avatar className={cn('w-9 h-9 ring-2 ring-offset-2 ring-offset-background', isUser ? 'ring-primary/50' : 'ring-border/40')}>
        <AvatarFallback className={cn('text-xs font-medium', isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>          
          {isUser ? <User size={16} /> : <Bot size={16} />}
        </AvatarFallback>
      </Avatar>
      <div className={cn('flex-1 min-w-0 space-y-1')}>        
        <div className={cn('flex items-center text-xs font-medium', isUser ? 'justify-end space-x-reverse space-x-2' : 'space-x-2')}>          
          <span className='text-muted-foreground'>{isUser ? 'You' : selectedModel?.display_name || 'Assistant'}</span>
          {isStreaming && isAssistant && <span className='text-green-600 flex items-center gap-1 animate-pulse'><Loader2 size={12} /> Streaming</span>}
        </div>
        <Card className='border-0 bg-transparent shadow-none'>
          <CardContent className='p-0'>
            <div className={bubbleClass}>
              <div className={cn('prose prose-sm max-w-none dark:prose-invert', isUser && 'prose-invert')}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    code(codeProps) {
                      const { children, className } = codeProps as any;
                      // Inline detection fallback
                      const isInline = !/\n/.test(String(children)) && !className?.includes('language-');
                      const raw = String(children);
                      const langMatch = /language-(\w+)/.exec(className || '');
                      const language = langMatch ? langMatch[1] : undefined;
                      const codeId = `${message.id}-${language || 'code'}-${raw.length}-${raw.slice(0,8)}`;
                      if (isInline) {
                        return <code className={cn('px-1 py-0.5 rounded bg-muted font-mono text-[11px]', className)}>{children}</code>;
                      }
                      return (
                        <div className='mb-3 rounded-lg overflow-hidden border bg-muted/30 dark:bg-muted/20'>
                          <div className='flex items-center justify-between px-2 py-1.5 bg-muted/50 backdrop-blur text-[11px] font-medium font-mono uppercase tracking-wide'>
                            <span>{language || 'text'}</span>
                            <Button variant='ghost' size='sm' className='h-6 px-2 text-[11px]' onClick={() => handleCodeCopy(raw, codeId)}>
                              {codeCopiedId === codeId ? <Check size={12} /> : <Copy size={12} />}
                            </Button>
                          </div>
                          <pre className='m-0 max-h-[480px] overflow-auto text-xs leading-relaxed bg-background/95 p-3 font-mono'>
                            <code className={className}>{children}</code>
                          </pre>
                        </div>
                      );
                    }
                  }}
                >{expanded || !isLong ? safeDisplay : safeDisplay.slice(0, 1400) + '…'}</ReactMarkdown>
                {isStreaming && <span className='animate-pulse ml-1'>▊</span>}
                {isLong && (
                  <Button variant='ghost' size='sm' onClick={() => setExpanded(e => !e)} className='mt-2 h-7 px-2 text-[11px]'>
                    {expanded ? 'Collapse' : 'Expand'}
                  </Button>
                )}
              </div>

              {/* Toolbar */}
              <div className={cn('absolute top-2', isUser ? 'left-2' : 'right-2', 'flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity')}>                
                <Button variant='ghost' size='sm' className='h-7 w-7 p-0' onClick={handleCopy} title='Copy message'>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </Button>
                {isAssistant && onRegenerate && (
                  <Button variant='ghost' size='sm' className='h-7 w-7 p-0' onClick={() => onRegenerate(message)} title='Regenerate'>
                    <RefreshCcw size={14} />
                  </Button>
                )}
                {isAssistant && onFeedback && (
                  <>
                    <Button variant='ghost' size='sm' className='h-7 w-7 p-0' onClick={() => onFeedback(message, 'up')} title='Helpful'>
                      <ThumbsUp size={14} />
                    </Button>
                    <Button variant='ghost' size='sm' className='h-7 w-7 p-0' onClick={() => onFeedback(message, 'down')} title='Not helpful'>
                      <ThumbsDown size={14} />
                    </Button>
                  </>
                )}
                {!isUser && enableReordering && (
                  <>
                    <Button variant='ghost' size='sm' className='h-7 w-7 p-0' onClick={() => onMoveUp?.(index!)} disabled={index === 0} title='Move up'>
                      <ChevronUp size={14} />
                    </Button>
                    <Button variant='ghost' size='sm' className='h-7 w-7 p-0' onClick={() => onMoveDown?.(index!)} disabled={index === totalMessages! - 1} title='Move down'>
                      <ChevronDown size={14} />
                    </Button>
                    <Button variant='ghost' size='sm' className='h-7 w-7 p-0 text-destructive hover:text-destructive' onClick={() => onDelete?.(index!)} title='Delete'>
                      <Trash2 size={14} />
                    </Button>
                  </>
                )}
                {isUser && enableReordering && (
                  <>
                    <Button variant='ghost' size='sm' className='h-7 w-7 p-0' onClick={() => onMoveUp?.(index!)} disabled={index === 0} title='Move up'>
                      <ChevronUp size={14} />
                    </Button>
                    <Button variant='ghost' size='sm' className='h-7 w-7 p-0' onClick={() => onMoveDown?.(index!)} disabled={index === totalMessages! - 1} title='Move down'>
                      <ChevronDown size={14} />
                    </Button>
                    <Button variant='ghost' size='sm' className='h-7 w-7 p-0 text-destructive hover:text-destructive' onClick={() => onDelete?.(index!)} title='Delete'>
                      <Trash2 size={14} />
                    </Button>
                  </>
                )}
                {!isUser && (
                  <>
                    <Button variant='ghost' size='sm' className='h-7 w-7 p-0' title='Quote'>"</Button>
                    <Button variant='ghost' size='sm' className='h-7 w-7 p-0' title='Summarize'>Σ</Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        {message.timestamp && <div className='mt-0.5 text-[10px] text-muted-foreground'>{new Date(message.timestamp).toLocaleTimeString()}</div>}
      </div>
    </div>
  );
};
