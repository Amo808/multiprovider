import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Square, Bot, Layers, X, GitMerge, GitBranch, User, Trash2, Eye, EyeOff, RefreshCw, Copy, FolderOpen, ChevronDown, Plus, Check, AlertCircle, Loader2, ArrowUp, ArrowDown, Sparkles, GripVertical, Brain, Edit2, Maximize2, Settings } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ModelInfo, GenerationConfig, Message } from '../types';
import { Button } from './ui/button';
import { ParallelResponseView } from './ParallelResponseView';
import { useParallelChat } from '../hooks/useParallelChat';
import { cn } from '../lib/utils';
import { parallelAPI, ParallelConversation, ParallelTurn } from '../services/parallelConversationsAPI';
import { apiClient } from '../services/api';
import { getModelMaxOutputTokens, getModelDefaultTokens } from '../utils/modelLimits';

// Code block component for syntax highlighting
const CodeBlock: React.FC<{ language?: string; children: string }> = ({ language, children }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group my-2 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#2d2d2d] text-[10px] text-gray-400">
        <span>{language || 'code'}</span>
        <button onClick={handleCopy} className="flex items-center gap-1 hover:text-white transition-colors">
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{ margin: 0, padding: '0.75rem', fontSize: '12px', lineHeight: '1.5' }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
};

// Markdown content renderer
const MarkdownContent: React.FC<{ content: string; className?: string }> = ({ content, className }) => {
  // Filter out Gemini reasoning mode messages and other garbage prefixes
  const cleanContent = content
    .replace(/^\s*\(Reasoning mode enabled.*?\)\s*/gi, '')
    .replace(/^\s*\(Note: Reasoning mode.*?\)\s*/gi, '')
    .replace(/^\s*\[Reasoning mode enabled.*?\]\s*/gi, '')
    .replace(/^\s*Note:\s*Reasoning mode.*?\n*/gi, '')
    .replace(/^\s*\*\*Note:\*\*\s*Reasoning mode.*?\n*/gi, '')
    .replace(/^0\s+/, '') // Remove leading "0 " that sometimes appears from GPT
    .replace(/^0\n/, '') // Remove leading "0\n"
    .replace(/^\s*0\s*$/, '') // Remove if content is just "0"
    .trim();
  
  return (
    <div className={cn(
      "prose prose-sm max-w-none dark:prose-invert",
      "prose-p:leading-relaxed prose-p:my-1.5",
      "prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:font-semibold",
      "prose-h1:text-lg prose-h2:text-base prose-h3:text-sm",
      "prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5",
      "prose-pre:my-0 prose-pre:p-0 prose-pre:bg-transparent",
      "prose-blockquote:border-l-2 prose-blockquote:border-foreground/20 prose-blockquote:pl-3 prose-blockquote:italic prose-blockquote:text-foreground/70",
      "prose-strong:text-foreground prose-strong:font-semibold",
      "prose-code:text-[13px] prose-code:bg-white/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded",
      className
    )}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');
            if (isInline) {
              return <code className="px-1 py-0.5 rounded bg-white/10 text-[13px] font-mono" {...props}>{children}</code>;
            }
            return <CodeBlock language={match?.[1]}>{String(children).replace(/\n$/, '')}</CodeBlock>;
          },
          pre({ children }) { return <>{children}</>; },
          p({ children }) { return <p className="text-[15px] leading-[1.7] my-1.5">{children}</p>; },
          ul({ children }) { return <ul className="list-disc pl-5 space-y-0.5 my-1.5">{children}</ul>; },
          ol({ children }) { return <ol className="list-decimal pl-5 space-y-0.5 my-1.5">{children}</ol>; },
          li({ children }) { return <li className="text-[15px] leading-[1.6]">{children}</li>; },
          a({ href, children }) { return <a href={href} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">{children}</a>; },
          blockquote({ children }) { return <blockquote className="border-l-2 border-foreground/20 pl-3 my-2 italic text-foreground/70">{children}</blockquote>; },
          hr() { return <hr className="my-3 border-foreground/10" />; },
          table({ children }) { return <table className="w-full text-sm border-collapse my-2">{children}</table>; },
          th({ children }) { return <th className="border border-foreground/20 px-2 py-1 bg-foreground/5 text-left font-medium">{children}</th>; },
          td({ children }) { return <td className="border border-foreground/20 px-2 py-1">{children}</td>; },
        }}
      >
        {cleanContent}
      </ReactMarkdown>
    </div>
  );
};

// Collapsible thinking section component
const ThinkingSection: React.FC<{
  content: string;
  tokens?: number;
  isStreaming?: boolean;
}> = ({ content, tokens, isStreaming }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const isLong = content.length > 500;
  const displayContent = showFull || !isLong ? content : content.substring(0, 500) + '...';

  if (!content && !tokens) return null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1.5 text-[10px] transition-colors w-full",
          isStreaming ? "text-purple-500" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Brain className={cn("w-3 h-3", isStreaming && "animate-pulse")} />
        <span>{isStreaming ? "Thinking..." : "Thought process"}</span>
        {tokens && tokens > 0 && (
          <span className="text-muted-foreground">({tokens.toLocaleString()})</span>
        )}
        <ChevronDown className={cn("w-3 h-3 ml-auto transition-transform", isOpen && "rotate-180")} />
      </button>
      
      {isOpen && content && (
        <div className="mt-1.5 pl-3 border-l-2 border-purple-500/30 max-h-32 overflow-y-auto">
          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
            {displayContent}
            {isStreaming && <span className="inline-block w-1 h-3 bg-purple-500 animate-pulse ml-0.5" />}
          </pre>
          {isLong && !isStreaming && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowFull(!showFull); }}
              className="mt-1 text-[9px] text-primary hover:underline flex items-center gap-0.5"
            >
              {showFull ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
              {showFull ? 'Less' : 'More'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

interface ParallelChatInterfaceProps {
  availableModels: ModelInfo[];
  generationConfig: GenerationConfig;
  systemPrompt?: string;
  onClose?: () => void;
  initialConversationId?: string | null;
  onConversationChange?: (conversationId: string | null) => void;
  // External control of selected models (for integration with top header selector)
  selectedModels?: ModelInfo[];
  onSelectedModelsChange?: (models: ModelInfo[]) => void;
}

// Conversation turn for history
interface ConversationTurn {
  id: string;
  userMessage: string;
  timestamp: string;
  dbId?: string; // Database ID from Supabase
  responses: Array<{
    model: ModelInfo;
    content: string;
    enabled: boolean;
    dbId?: string; // Database ID for response
    thinkingContent?: string; // Reasoning/thinking content
    meta?: {
      tokens_in?: number;
      tokens_out?: number;
      thought_tokens?: number;
      estimated_cost?: number;
      total_latency?: number;
      reasoning_content?: string;
    };
  }>;
}

// Provider colors for history display - modern 2026 glassmorphism style
const providerColors: Record<string, string> = {
  openai: 'bg-gradient-to-br from-white/5 to-white/[0.02] dark:from-white/[0.08] dark:to-white/[0.02] border-white/10 backdrop-blur-sm',
  anthropic: 'bg-gradient-to-br from-white/5 to-white/[0.02] dark:from-white/[0.08] dark:to-white/[0.02] border-white/10 backdrop-blur-sm',
  gemini: 'bg-gradient-to-br from-white/5 to-white/[0.02] dark:from-white/[0.08] dark:to-white/[0.02] border-white/10 backdrop-blur-sm',
  deepseek: 'bg-gradient-to-br from-white/5 to-white/[0.02] dark:from-white/[0.08] dark:to-white/[0.02] border-white/10 backdrop-blur-sm',
  ollama: 'bg-gradient-to-br from-white/5 to-white/[0.02] dark:from-white/[0.08] dark:to-white/[0.02] border-white/10 backdrop-blur-sm',
  groq: 'bg-gradient-to-br from-white/5 to-white/[0.02] dark:from-white/[0.08] dark:to-white/[0.02] border-white/10 backdrop-blur-sm',
  mistral: 'bg-gradient-to-br from-white/5 to-white/[0.02] dark:from-white/[0.08] dark:to-white/[0.02] border-white/10 backdrop-blur-sm',
  chatgpt_pro: 'bg-gradient-to-br from-white/5 to-white/[0.02] dark:from-white/[0.08] dark:to-white/[0.02] border-white/10 backdrop-blur-sm',
};

// Provider accent colors - vibrant but subtle glow accents
const providerAccentColors: Record<string, string> = {
  openai: 'text-emerald-400',
  anthropic: 'text-amber-400',
  gemini: 'text-sky-400',
  deepseek: 'text-violet-400',
  ollama: 'text-slate-400',
  groq: 'text-rose-400',
  mistral: 'text-orange-400',
  chatgpt_pro: 'text-teal-400',
};

// Provider glow colors for hover/active states
const providerGlowColors: Record<string, string> = {
  openai: 'hover:shadow-emerald-500/10 hover:border-emerald-500/20',
  anthropic: 'hover:shadow-amber-500/10 hover:border-amber-500/20',
  gemini: 'hover:shadow-sky-500/10 hover:border-sky-500/20',
  deepseek: 'hover:shadow-violet-500/10 hover:border-violet-500/20',
  ollama: 'hover:shadow-slate-500/10 hover:border-slate-500/20',
  groq: 'hover:shadow-rose-500/10 hover:border-rose-500/20',
  mistral: 'hover:shadow-orange-500/10 hover:border-orange-500/20',
  chatgpt_pro: 'hover:shadow-teal-500/10 hover:border-teal-500/20',
};

export const ParallelChatInterface: React.FC<ParallelChatInterfaceProps> = ({
  availableModels: _availableModels, // Available models list (selection now handled by global menu)
  generationConfig,
  systemPrompt,
  onClose,
  initialConversationId,
  onConversationChange,
  selectedModels: externalSelectedModels,
  onSelectedModelsChange,
}) => {
  // Use external or internal state for selected models
  const [internalSelectedModels, setInternalSelectedModels] = useState<ModelInfo[]>([]);
  const selectedModels = externalSelectedModels ?? internalSelectedModels;
  // Note: Model selection is now handled via global menu, keep this for potential future use
  void (onSelectedModelsChange ?? setInternalSelectedModels);
  
  const [inputValue, setInputValue] = useState('');
  const [currentUserMessage, setCurrentUserMessage] = useState('');
  
  // Shared history mode (brainstorm)
  const [sharedHistoryMode, setSharedHistoryMode] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  
  // Supabase state
  const [supabaseConversationId, setSupabaseConversationId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedConversations, setSavedConversations] = useState<ParallelConversation[]>([]);
  const [showConversationList, setShowConversationList] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [conversationTitle, setConversationTitle] = useState('Parallel Chat');
  
  // Track regeneration state: which turn/response is being regenerated
  const [regeneratingInfo, setRegeneratingInfo] = useState<{turnId: string; responseIndex: number; dbId?: string} | null>(null);
  
  // Drag & Drop state (desktop)
  const [draggedResponse, setDraggedResponse] = useState<{turnId: string; responseIndex: number} | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{turnId: string; responseIndex: number} | null>(null);
  
  // Touch Drag & Drop state (mobile)
  const [touchDragging, setTouchDragging] = useState<{
    turnId: string;
    responseIndex: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    element: HTMLElement | null;
  } | null>(null);
  const [touchDropTarget, setTouchDropTarget] = useState<{turnId: string; responseIndex: number} | null>(null);
  const touchGhostRef = useRef<HTMLDivElement>(null);
  const responseRefs = useRef<Map<string, HTMLElement>>(new Map());
  
  // Inline Edit state for user messages
  const [editingTurnId, setEditingTurnId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState('');
  
  // Expanded response modal state
  const [expandedResponse, setExpandedResponse] = useState<{
    turnId: string;
    responseIndex: number;
    content: string;
    model: ModelInfo;
  } | null>(null);
  
  // Custom context popup for smart regenerate
  const [smartRegeneratePopup, setSmartRegeneratePopup] = useState<{
    turnId: string;
    responseIndex: number;
    customContext: string;
  } | null>(null);
  
  // Per-model settings popup
  const [modelSettingsPopup, setModelSettingsPopup] = useState<{
    model: ModelInfo;
    settings: {
      systemPrompt: string;
      temperature: number;
      maxTokens: number;
      topP: number;
      topK?: number;
      frequencyPenalty: number;
      presencePenalty: number;
      thinkingBudget?: number;
      reasoningEffort?: 'minimal' | 'medium' | 'high';
      streaming: boolean;
      stopSequences: string[];
    };
  } | null>(null);
  
  // Per-model settings storage (model.id -> settings)
  const [perModelSettings, setPerModelSettings] = useState<Record<string, {
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    topP: number;
    topK?: number;
    frequencyPenalty: number;
    presencePenalty: number;
    thinkingBudget?: number;
    reasoningEffort?: 'minimal' | 'medium' | 'high';
    streaming: boolean;
    stopSequences: string[];
  }>>({});
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const conversationListRef = useRef<HTMLDivElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    responses,
    isLoading,
    sendParallelMessages,
    cancelAll,
    clearResponses,
  } = useParallelChat();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  // Scroll to bottom when history updates or responses stream
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationHistory, responses]);

  // Close conversation list when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (conversationListRef.current && !conversationListRef.current.contains(e.target as Node)) {
        setShowConversationList(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close smart regenerate popup when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if clicking inside the popup
      if (smartRegeneratePopup && !target.closest('[data-smart-regenerate-popup]')) {
        // Check if clicked on the sparkles button itself
        if (!target.closest('button')) {
          setSmartRegeneratePopup(null);
        }
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSmartRegeneratePopup(null);
        cancelEditing();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [smartRegeneratePopup]);

  // Load saved conversations on mount
  useEffect(() => {
    loadSavedConversations();
  }, []);

  // Load initial conversation if provided, or reset if null
  useEffect(() => {
    if (initialConversationId && initialConversationId !== supabaseConversationId) {
      loadConversation(initialConversationId);
    } else if (initialConversationId === null && supabaseConversationId !== null) {
      // Reset to new conversation when initialConversationId becomes null
      clearResponses();
      setCurrentUserMessage('');
      setConversationHistory([]);
      setSupabaseConversationId(null);
      setConversationTitle('Parallel Chat');
      setSaveError(null);
    }
  }, [initialConversationId]);

  // Notify parent when conversation changes
  useEffect(() => {
    onConversationChange?.(supabaseConversationId);
  }, [supabaseConversationId, onConversationChange]);

  // ==================== SUPABASE INTEGRATION ====================
  
  // Load list of saved conversations
  const loadSavedConversations = async () => {
    setIsLoadingConversations(true);
    try {
      const conversations = await parallelAPI.listConversations(50, 0);
      setSavedConversations(conversations);
    } catch (error) {
      console.error('[ParallelChat] Failed to load conversations:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  // Create or get conversation in Supabase
  const ensureSupabaseConversation = useCallback(async (): Promise<string | null> => {
    if (supabaseConversationId) return supabaseConversationId;
    
    try {
      const conversation = await parallelAPI.createConversation(
        conversationTitle,
        sharedHistoryMode
      );
      setSupabaseConversationId(conversation.id);
      // Refresh conversation list
      loadSavedConversations();
      return conversation.id;
    } catch (error) {
      console.error('[ParallelChat] Failed to create Supabase conversation:', error);
      setSaveError('Failed to create conversation');
      return null;
    }
  }, [supabaseConversationId, sharedHistoryMode, conversationTitle]);

  // Save turn to Supabase
  const saveTurnToSupabase = useCallback(async (turn: ConversationTurn): Promise<ParallelTurn | null> => {
    const convId = await ensureSupabaseConversation();
    if (!convId) return null;
    
    setIsSaving(true);
    setSaveError(null);
    try {
      const apiTurn = await parallelAPI.addTurn(convId, {
        user_message: turn.userMessage,
        responses: turn.responses.map(r => ({
          model_id: r.model.id,
          model_name: r.model.display_name || r.model.name,
          provider: r.model.provider,
          content: r.content,
          enabled: r.enabled,
          tokens_in: r.meta?.tokens_in,
          tokens_out: r.meta?.tokens_out,
          thought_tokens: r.meta?.thought_tokens,
          estimated_cost: r.meta?.estimated_cost,
          total_latency: r.meta?.total_latency,
        })),
      });
      
      console.log('[ParallelChat] Saved turn to Supabase:', apiTurn.id);
      return apiTurn;
    } catch (error) {
      console.error('[ParallelChat] Failed to save turn:', error);
      setSaveError('Failed to save message');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [ensureSupabaseConversation]);

  // Update response enabled state in Supabase
  const updateResponseInSupabase = useCallback(async (dbId: string | undefined, updates: { enabled?: boolean; content?: string }) => {
    if (!dbId) return;
    
    try {
      await parallelAPI.updateResponse(dbId, updates);
      console.log('[ParallelChat] Updated response in Supabase:', dbId, updates);
    } catch (error) {
      console.error('[ParallelChat] Failed to update response:', error);
      setSaveError('Failed to update response');
    }
  }, []);

  // Regenerate response in Supabase
  const regenerateResponseInSupabase = useCallback(async (dbId: string | undefined, newContent: string, newMeta?: Record<string, unknown>) => {
    if (!dbId) return;
    
    try {
      await parallelAPI.regenerateResponse(dbId, newContent, newMeta);
      console.log('[ParallelChat] Regenerated response in Supabase:', dbId);
    } catch (error) {
      console.error('[ParallelChat] Failed to regenerate response:', error);
      setSaveError('Failed to save regenerated response');
    }
  }, []);

  // Delete turn from Supabase
  const deleteTurnFromSupabase = useCallback(async (dbId: string | undefined) => {
    if (!dbId) return;
    
    try {
      await parallelAPI.deleteTurn(dbId);
      console.log('[ParallelChat] Deleted turn from Supabase:', dbId);
    } catch (error) {
      console.error('[ParallelChat] Failed to delete turn:', error);
      setSaveError('Failed to delete message');
    }
  }, []);

  // Delete response from Supabase
  const deleteResponseFromSupabase = useCallback(async (dbId: string | undefined) => {
    if (!dbId) return;
    
    try {
      await parallelAPI.deleteResponse(dbId);
      console.log('[ParallelChat] Deleted response from Supabase:', dbId);
    } catch (error) {
      console.error('[ParallelChat] Failed to delete response:', error);
      setSaveError('Failed to delete response');
    }
  }, []);

  // Load conversation from Supabase
  const loadConversation = useCallback(async (conversationId: string) => {
    setIsLoadingConversations(true);
    try {
      const conversation = await parallelAPI.getConversation(conversationId);
      if (!conversation || !conversation.turns) {
        setSaveError('Conversation not found');
        return false;
      }
      
      setSupabaseConversationId(conversation.id);
      setSharedHistoryMode(conversation.shared_history_mode);
      setConversationTitle(conversation.title);
      
      // Convert API turns to frontend format
      const turns: ConversationTurn[] = conversation.turns.map(turn => {
        const formatted = parallelAPI.formatTurnFromAPI(turn);
        return {
          id: formatted.id,
          dbId: turn.id,
          userMessage: formatted.userMessage,
          timestamp: formatted.timestamp,
          responses: formatted.responses.map(r => ({
            model: r.model,
            content: r.content,
            enabled: r.enabled,
            dbId: r.dbId,
            meta: r.meta,
          })),
        };
      });
      
      setConversationHistory(turns);
      clearResponses();
      setCurrentUserMessage('');
      setShowConversationList(false);
      console.log('[ParallelChat] Loaded conversation from Supabase:', conversationId);
      return true;
    } catch (error) {
      console.error('[ParallelChat] Failed to load conversation:', error);
      setSaveError('Failed to load conversation');
      return false;
    } finally {
      setIsLoadingConversations(false);
    }
  }, [clearResponses]);

  // Delete conversation from Supabase
  const deleteConversation = useCallback(async (conversationId: string) => {
    try {
      await parallelAPI.deleteConversation(conversationId);
      setSavedConversations(prev => prev.filter(c => c.id !== conversationId));
      
      // If we deleted the current conversation, reset state
      if (conversationId === supabaseConversationId) {
        setSupabaseConversationId(null);
        setConversationHistory([]);
        setConversationTitle('Parallel Chat');
      }
      
      console.log('[ParallelChat] Deleted conversation:', conversationId);
    } catch (error) {
      console.error('[ParallelChat] Failed to delete conversation:', error);
      setSaveError('Failed to delete conversation');
    }
  }, [supabaseConversationId]);

  // Build shared history for API calls (only enabled responses)
  const buildSharedHistory = (): Message[] => {
    if (!sharedHistoryMode) return [];
    
    const messages: Message[] = [];
    
    for (const turn of conversationHistory) {
      messages.push({
        id: `user-${turn.id}`,
        role: 'user',
        content: turn.userMessage,
        timestamp: turn.timestamp,
      });
      
      const enabledResponses = turn.responses.filter(r => r.enabled);
      if (enabledResponses.length > 0) {
        const combinedContent = enabledResponses.map(r => 
          `[${r.model.display_name || r.model.name} (${r.model.provider})]: ${r.content}`
        ).join('\n\n---\n\n');
        
        messages.push({
          id: `assistant-${turn.id}`,
          role: 'assistant',
          content: combinedContent,
          timestamp: turn.timestamp,
        });
      }
    }
    
    return messages;
  };

  // Enhanced system prompt for shared history mode
  const getEnhancedSystemPrompt = (): string => {
    if (!sharedHistoryMode) return systemPrompt || '';
    
    const basePrompt = systemPrompt || '';
    const sharedHistoryNote = `
[CONTEXT: This is a brainstorm/comparison session. Multiple AI models are responding to the same questions. Previous responses may contain answers from different models. Please consider the diversity of perspectives when responding.]
`;
    
    return basePrompt + sharedHistoryNote;
  };

  // When responses complete, save to history OR update existing response if regenerating
  const responsesStreamingKey = responses.map(r => r.isStreaming).join(',');
  useEffect(() => {
    const allDone = responses.length > 0 && responses.every(r => !r.isStreaming);
    if (allDone && responses.some(r => r.content)) {
      
      // If we're regenerating, update the existing response instead of creating new turn
      if (regeneratingInfo) {
        const { turnId, responseIndex, dbId } = regeneratingInfo;
        const newResponse = responses[0]; // Should only be one response when regenerating
        
        if (newResponse && newResponse.content) {
          setConversationHistory(prev => prev.map(turn => {
            if (turn.id === turnId) {
              const newResponses = [...turn.responses];
              newResponses[responseIndex] = {
                ...newResponses[responseIndex],
                content: newResponse.content,
                meta: newResponse.meta,
                enabled: true, // Re-enable after regeneration
              };
              return { ...turn, responses: newResponses };
            }
            return turn;
          }));
          
          // Update in Supabase
          if (dbId) {
            regenerateResponseInSupabase(dbId, newResponse.content, newResponse.meta);
          }
        }
        
        setRegeneratingInfo(null);
        clearResponses();
        return;
      }
      
      // Normal flow: create new turn
      if (currentUserMessage) {
        const turn: ConversationTurn = {
          id: `turn-${Date.now()}`,
          userMessage: currentUserMessage,
          timestamp: new Date().toISOString(),
          responses: responses.map(r => ({
            model: r.model,
            content: r.content,
            enabled: true,
            thinkingContent: r.thinkingContent,
            meta: r.meta,
          })),
        };
        
        setConversationHistory(prev => {
          // Prevent duplicates - check if turn with same userMessage already exists
          const alreadyExists = prev.some(t => 
            t.userMessage === currentUserMessage && 
            Math.abs(new Date(t.timestamp).getTime() - Date.now()) < 5000 // within 5 seconds
          );
          if (alreadyExists) return prev;
          
          // Save to Supabase asynchronously
          saveTurnToSupabase(turn).then(apiTurn => {
            if (apiTurn) {
              // Update turn with database IDs
              setConversationHistory(current => current.map(t => {
                if (t.id === turn.id) {
                  return {
                    ...t,
                    dbId: apiTurn.id,
                    responses: t.responses.map((r, idx) => ({
                      ...r,
                      dbId: apiTurn.responses[idx]?.id,
                    })),
                  };
                }
                return t;
              }));
            }
          });
          
          return [...prev, turn];
        });
        
        // Update conversation title from first message
        if (conversationHistory.length === 0) {
          const newTitle = currentUserMessage.slice(0, 50) + (currentUserMessage.length > 50 ? '...' : '');
          setConversationTitle(newTitle);
        }
        
        // Clear current message and responses after saving to history
        setCurrentUserMessage('');
        clearResponses();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps  
  }, [responsesStreamingKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputValue.trim() || selectedModels.length === 0 || isLoading) return;

    const message = inputValue.trim();
    setInputValue('');
    setCurrentUserMessage(message);
    setSaveError(null);
    
    const history = sharedHistoryMode ? buildSharedHistory() : undefined;
    const enhancedPrompt = getEnhancedSystemPrompt();
    
    const historyContext = history && history.length > 0 
      ? '\n\n[PREVIOUS CONVERSATION]:\n' + history.map(m => `${m.role}: ${m.content}`).join('\n\n') + '\n\n[END PREVIOUS CONVERSATION]\n'
      : '';
    
    // DEBUG: Log what's being sent
    if (historyContext) {
      console.log('[Send Message] Shared history context:');
      console.log('------- CONTEXT START -------');
      console.log(historyContext + message);
      console.log('------- CONTEXT END -------');
    }
    
    await sendParallelMessages(
      historyContext + message, 
      selectedModels, 
      generationConfig, 
      enhancedPrompt,
      perModelSettings
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleNewComparison = () => {
    clearResponses();
    setCurrentUserMessage('');
    setConversationHistory([]);
    setSupabaseConversationId(null);
    setConversationTitle('Parallel Chat');
    setSaveError(null);
  };

  // Toggle response visibility in a turn (with Supabase sync)
  const toggleResponseEnabled = (turnId: string, responseIndex: number) => {
    setConversationHistory(prev => prev.map(turn => {
      if (turn.id === turnId) {
        const newResponses = [...turn.responses];
        const newEnabled = !newResponses[responseIndex].enabled;
        newResponses[responseIndex] = {
          ...newResponses[responseIndex],
          enabled: newEnabled
        };
        
        // Update in Supabase
        updateResponseInSupabase(newResponses[responseIndex].dbId, { enabled: newEnabled });
        
        return { ...turn, responses: newResponses };
      }
      return turn;
    }));
  };

  // Delete an entire turn (with Supabase sync)
  const deleteTurn = (turnId: string) => {
    const turn = conversationHistory.find(t => t.id === turnId);
    if (turn?.dbId) {
      deleteTurnFromSupabase(turn.dbId);
    }
    setConversationHistory(prev => prev.filter(t => t.id !== turnId));
  };

  // State for loading model settings
  const [isLoadingModelSettings, setIsLoadingModelSettings] = useState(false);

  // Open model settings popup - load from backend API
  const openModelSettings = async (model: ModelInfo) => {
    setIsLoadingModelSettings(true);
    
    // Get model-specific limits
    const modelMaxTokens = getModelMaxOutputTokens(model);
    const modelDefaultTokens = getModelDefaultTokens(model);
    
    // First show popup with smart defaults
    setModelSettingsPopup({
      model,
      settings: {
        systemPrompt: systemPrompt || '',
        temperature: generationConfig.temperature ?? 0.7,
        maxTokens: Math.min(generationConfig.max_tokens ?? modelDefaultTokens, modelMaxTokens),
        topP: generationConfig.top_p ?? 0.95,
        topK: generationConfig.top_k,
        frequencyPenalty: generationConfig.frequency_penalty ?? 0,
        presencePenalty: generationConfig.presence_penalty ?? 0,
        thinkingBudget: generationConfig.thinking_budget,
        reasoningEffort: generationConfig.reasoning_effort,
        streaming: generationConfig.stream !== false, // Default true
        stopSequences: [],
      }
    });
    
    // Then load real settings from backend
    try {
      const result = await apiClient.getModelSettings(model.provider, model.id);
      if (result.settings) {
        setModelSettingsPopup(prev => prev ? {
          ...prev,
          settings: {
            systemPrompt: result.settings.system_prompt || systemPrompt || '',
            temperature: result.settings.temperature ?? generationConfig.temperature ?? 0.7,
            maxTokens: Math.min(
              result.settings.max_tokens ?? generationConfig.max_tokens ?? modelDefaultTokens, 
              modelMaxTokens
            ),
            topP: result.settings.top_p ?? generationConfig.top_p ?? 0.95,
            topK: result.settings.top_k ?? generationConfig.top_k,
            frequencyPenalty: result.settings.frequency_penalty ?? 0,
            presencePenalty: result.settings.presence_penalty ?? 0,
            thinkingBudget: result.settings.thinking_budget ?? generationConfig.thinking_budget,
            reasoningEffort: result.settings.reasoning_effort ?? generationConfig.reasoning_effort,
            streaming: result.settings.stream !== false,
            stopSequences: result.settings.stop_sequences || [],
          }
        } : null);
      }
    } catch (error) {
      console.warn('Failed to load model settings from backend:', error);
      // Keep defaults on error
    } finally {
      setIsLoadingModelSettings(false);
    }
  };

  // Save model settings - save to backend API
  const saveModelSettings = async () => {
    if (!modelSettingsPopup) return;
    
    const settings = modelSettingsPopup.settings;
    const model = modelSettingsPopup.model;
    
    // Validate maxTokens against model limit
    const modelMaxTokens = getModelMaxOutputTokens(model);
    const validatedMaxTokens = Math.min(settings.maxTokens, modelMaxTokens);
    
    // Convert to backend format
    const backendSettings: Partial<GenerationConfig> & { system_prompt?: string } = {
      temperature: settings.temperature,
      max_tokens: validatedMaxTokens,
      top_p: settings.topP,
      top_k: settings.topK,
      frequency_penalty: settings.frequencyPenalty,
      presence_penalty: settings.presencePenalty,
      thinking_budget: settings.thinkingBudget,
      reasoning_effort: settings.reasoningEffort,
      stream: settings.streaming,
      stop_sequences: settings.stopSequences.length > 0 ? settings.stopSequences : undefined,
      system_prompt: settings.systemPrompt || undefined,
    };
    
    try {
      await apiClient.updateModelSettings(model.provider, model.id, backendSettings);
      console.log('[ParallelChat] Model settings saved to backend:', model.id);
      
      // Also update local cache
      const modelKey = `${model.provider}-${model.id}`;
      setPerModelSettings(prev => ({
        ...prev,
        [modelKey]: { ...settings, maxTokens: validatedMaxTokens }
      }));
    } catch (error) {
      console.error('Failed to save model settings:', error);
      setSaveError('Failed to save model settings');
    }
    
    setModelSettingsPopup(null);
  };

  // Delete a specific response from a turn (with Supabase sync)
  const deleteResponse = (turnId: string, responseIndex: number) => {
    setConversationHistory(prev => {
      const updated = prev.map(turn => {
        if (turn.id === turnId) {
          const responseToDelete = turn.responses[responseIndex];
          if (responseToDelete?.dbId) {
            deleteResponseFromSupabase(responseToDelete.dbId);
          }
          const newResponses = turn.responses.filter((_, idx) => idx !== responseIndex);
          return { ...turn, responses: newResponses };
        }
        return turn;
      }).filter(turn => turn.responses.length > 0); // Remove turn if no responses left
      
      return updated;
    });
  };

  // Move response up within the same turn
  const moveResponseUp = (turnId: string, responseIndex: number) => {
    if (responseIndex === 0) return;
    setConversationHistory(prev => prev.map(turn => {
      if (turn.id === turnId) {
        const newResponses = [...turn.responses];
        [newResponses[responseIndex - 1], newResponses[responseIndex]] = 
          [newResponses[responseIndex], newResponses[responseIndex - 1]];
        return { ...turn, responses: newResponses };
      }
      return turn;
    }));
  };

  // Move response down within the same turn
  const moveResponseDown = (turnId: string, responseIndex: number) => {
    const turn = conversationHistory.find(t => t.id === turnId);
    if (!turn || responseIndex >= turn.responses.length - 1) return;
    setConversationHistory(prev => prev.map(t => {
      if (t.id === turnId) {
        const newResponses = [...t.responses];
        [newResponses[responseIndex], newResponses[responseIndex + 1]] = 
          [newResponses[responseIndex + 1], newResponses[responseIndex]];
        return { ...t, responses: newResponses };
      }
      return t;
    }));
  };

  // Move entire turn up
  const moveTurnUp = (turnId: string) => {
    const turnIndex = conversationHistory.findIndex(t => t.id === turnId);
    if (turnIndex <= 0) return;
    setConversationHistory(prev => {
      const newHistory = [...prev];
      [newHistory[turnIndex - 1], newHistory[turnIndex]] = 
        [newHistory[turnIndex], newHistory[turnIndex - 1]];
      return newHistory;
    });
  };

  // Move entire turn down
  const moveTurnDown = (turnId: string) => {
    const turnIndex = conversationHistory.findIndex(t => t.id === turnId);
    if (turnIndex < 0 || turnIndex >= conversationHistory.length - 1) return;
    setConversationHistory(prev => {
      const newHistory = [...prev];
      [newHistory[turnIndex], newHistory[turnIndex + 1]] = 
        [newHistory[turnIndex + 1], newHistory[turnIndex]];
      return newHistory;
    });
  };

  // Drag & Drop handlers
  const handleDragStart = (turnId: string, responseIndex: number) => {
    setDraggedResponse({ turnId, responseIndex });
  };

  const handleDragOver = (e: React.DragEvent, turnId: string, responseIndex: number) => {
    e.preventDefault();
    if (draggedResponse && (draggedResponse.turnId !== turnId || draggedResponse.responseIndex !== responseIndex)) {
      setDragOverTarget({ turnId, responseIndex });
    }
  };

  const handleDragLeave = () => {
    setDragOverTarget(null);
  };

  const handleDrop = (targetTurnId: string, targetIndex: number) => {
    if (!draggedResponse) return;
    
    const { turnId: sourceTurnId, responseIndex: sourceIndex } = draggedResponse;
    
    if (sourceTurnId === targetTurnId) {
      // Same turn - reorder within turn
      setConversationHistory(prev => prev.map(turn => {
        if (turn.id === sourceTurnId) {
          const newResponses = [...turn.responses];
          const [movedResp] = newResponses.splice(sourceIndex, 1);
          newResponses.splice(targetIndex, 0, movedResp);
          return { ...turn, responses: newResponses };
        }
        return turn;
      }));
    } else {
      // Different turns - move response between turns
      setConversationHistory(prev => {
        let movedResponse: typeof prev[0]['responses'][0] | null = null;
        
        // First, remove from source
        const afterRemove = prev.map(turn => {
          if (turn.id === sourceTurnId) {
            movedResponse = turn.responses[sourceIndex];
            return {
              ...turn,
              responses: turn.responses.filter((_, idx) => idx !== sourceIndex)
            };
          }
          return turn;
        }).filter(turn => turn.responses.length > 0);
        
        // Then, add to target
        if (movedResponse) {
          return afterRemove.map(turn => {
            if (turn.id === targetTurnId) {
              const newResponses = [...turn.responses];
              newResponses.splice(targetIndex, 0, movedResponse!);
              return { ...turn, responses: newResponses };
            }
            return turn;
          });
        }
        
        return afterRemove;
      });
    }
    
    setDraggedResponse(null);
    setDragOverTarget(null);
  };

  const handleDragEnd = () => {
    setDraggedResponse(null);
    setDragOverTarget(null);
  };

  // ==================== TOUCH DRAG & DROP (Mobile) ====================
  
  // Register response element ref for hit testing
  const registerResponseRef = (turnId: string, idx: number, el: HTMLElement | null) => {
    const key = `${turnId}-${idx}`;
    if (el) {
      responseRefs.current.set(key, el);
    } else {
      responseRefs.current.delete(key);
    }
  };

  // Find which response element is under the touch point
  const findDropTarget = (x: number, y: number): {turnId: string; responseIndex: number} | null => {
    for (const [key, el] of responseRefs.current.entries()) {
      const rect = el.getBoundingClientRect();
      // Expand hit area slightly for easier dropping
      const padding = 10;
      if (
        x >= rect.left - padding &&
        x <= rect.right + padding &&
        y >= rect.top - padding &&
        y <= rect.bottom + padding
      ) {
        const [turnId, idx] = key.split('-');
        return { turnId, responseIndex: parseInt(idx, 10) };
      }
    }
    return null;
  };

  // Touch start - begin dragging
  const handleTouchStart = (e: React.TouchEvent, turnId: string, responseIndex: number) => {
    // Prevent text selection immediately
    e.preventDefault();
    
    // Long press to start drag (300ms)
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;
    const element = e.currentTarget as HTMLElement;
    
    // Store initial position for movement detection
    (element as any)._startX = startX;
    (element as any)._startY = startY;
    
    const longPressTimer = setTimeout(() => {
      // Vibrate if supported
      if (navigator.vibrate) navigator.vibrate(50);
      
      // Disable text selection on body
      document.body.classList.add('touch-dragging');
      
      setTouchDragging({
        turnId,
        responseIndex,
        startX,
        startY,
        currentX: startX,
        currentY: startY,
        element
      });
      
      // Prevent scrolling while dragging
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    }, 300);
    
    // Store timer to cancel on touchend/touchmove (short distance)
    (element as any)._longPressTimer = longPressTimer;
  };

  // Touch move - update position and find drop target
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchDragging) {
      // Cancel long press if moved too much
      const element = e.currentTarget as HTMLElement;
      const timer = (element as any)._longPressTimer;
      if (timer) {
        const touch = e.touches[0];
        const startX = (element as any)._startX || touch.clientX;
        const startY = (element as any)._startY || touch.clientY;
        const dist = Math.sqrt(
          Math.pow(touch.clientX - startX, 2) + 
          Math.pow(touch.clientY - startY, 2)
        );
        if (dist > 10) {
          clearTimeout(timer);
          (element as any)._longPressTimer = null;
        }
      }
      return;
    }
    
    e.preventDefault();
    const touch = e.touches[0];
    
    setTouchDragging(prev => prev ? {
      ...prev,
      currentX: touch.clientX,
      currentY: touch.clientY
    } : null);
    
    // Find drop target
    const target = findDropTarget(touch.clientX, touch.clientY);
    if (target && (target.turnId !== touchDragging.turnId || target.responseIndex !== touchDragging.responseIndex)) {
      setTouchDropTarget(target);
    } else {
      setTouchDropTarget(null);
    }
  };

  // Touch end - drop or cancel
  const handleTouchEnd = (e: React.TouchEvent) => {
    // Clear long press timer
    const element = e.currentTarget as HTMLElement;
    const timer = (element as any)._longPressTimer;
    if (timer) {
      clearTimeout(timer);
      (element as any)._longPressTimer = null;
    }
    
    if (!touchDragging) return;
    
    // Restore scrolling and text selection
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
    document.body.classList.remove('touch-dragging');
    
    // Perform drop if we have a target
    if (touchDropTarget) {
      handleDrop(touchDropTarget.turnId, touchDropTarget.responseIndex);
    }
    
    setTouchDragging(null);
    setTouchDropTarget(null);
  };

  // Touch cancel
  const handleTouchCancel = () => {
    const timer = (document as any)._longPressTimer;
    if (timer) clearTimeout(timer);
    
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
    document.body.classList.remove('touch-dragging');
    setTouchDragging(null);
    setTouchDropTarget(null);
  };

  // Regenerate a specific model's response (with Supabase sync)
  const regenerateResponse = async (turnId: string, responseIndex: number) => {
    const turn = conversationHistory.find(t => t.id === turnId);
    if (!turn || isLoading) return;
    
    const responseToRegenerate = turn.responses[responseIndex];
    const modelToRegenerate = responseToRegenerate.model;
    const enhancedPrompt = getEnhancedSystemPrompt();
    
    // Find history up to this turn (exclude this turn)
    const turnIndex = conversationHistory.findIndex(t => t.id === turnId);
    
    // Build history context only from turns before this one
    const historyBeforeTurn = conversationHistory.slice(0, turnIndex);
    const historyContext = historyBeforeTurn.length > 0 
      ? '\n\n[PREVIOUS CONVERSATION]:\n' + historyBeforeTurn.map(t => 
          `user: ${t.userMessage}\n\nassistant: ${t.responses.filter(r => r.enabled).map(r => r.content).join('\n---\n')}`
        ).join('\n\n') + '\n\n[END PREVIOUS CONVERSATION]\n'
      : '';
    
    // Set regenerating info BEFORE sending - this tells the useEffect to update instead of create new
    // Include dbId for Supabase update
    setRegeneratingInfo({ turnId, responseIndex, dbId: responseToRegenerate.dbId });
    
    // Mark the response as regenerating (visual feedback)
    setConversationHistory(prev => prev.map(t => {
      if (t.id === turnId) {
        const newResponses = [...t.responses];
        newResponses[responseIndex] = {
          ...newResponses[responseIndex],
          content: '⏳ Regenerating...',
        };
        return { ...t, responses: newResponses };
      }
      return t;
    }));
    
    // Send to single model
    await sendParallelMessages(
      historyContext + turn.userMessage, 
      [modelToRegenerate], 
      generationConfig, 
      enhancedPrompt,
      perModelSettings
    );
  };

  // Copy response content
  const copyResponse = async (content: string) => {
    await navigator.clipboard.writeText(content);
  };

  // Start editing a user message
  const startEditingMessage = (turnId: string, currentMessage: string) => {
    setEditingTurnId(turnId);
    setEditingMessage(currentMessage);
    // Focus textarea after render
    setTimeout(() => editTextareaRef.current?.focus(), 50);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingTurnId(null);
    setEditingMessage('');
  };

  // Save edited message and regenerate all responses
  const saveEditedMessage = async (turnId: string) => {
    const turn = conversationHistory.find(t => t.id === turnId);
    if (!turn || !editingMessage.trim() || isLoading) return;

    const newMessage = editingMessage.trim();
    
    // Update the message in history
    setConversationHistory(prev => prev.map(t => {
      if (t.id === turnId) {
        return { ...t, userMessage: newMessage };
      }
      return t;
    }));

    // TODO: Update in Supabase if needed
    
    cancelEditing();
    
    // Optionally regenerate all responses for this turn with the new message
    // This would require sending to all models again
    // For now, just update the message - user can manually regenerate
  };

  // Save and regenerate all responses with edited message
  const saveAndRegenerateAll = async (turnId: string) => {
    const turn = conversationHistory.find(t => t.id === turnId);
    if (!turn || !editingMessage.trim() || isLoading) return;

    const newMessage = editingMessage.trim();
    const modelsToRegenerate = turn.responses.map(r => r.model);
    const enhancedPrompt = getEnhancedSystemPrompt();
    
    // Find history up to this turn (exclude this turn)
    const turnIndex = conversationHistory.findIndex(t => t.id === turnId);
    const historyBeforeTurn = conversationHistory.slice(0, turnIndex);
    const historyContext = historyBeforeTurn.length > 0 
      ? '\n\n[PREVIOUS CONVERSATION]:\n' + historyBeforeTurn.map(t => 
          `user: ${t.userMessage}\n\nassistant: ${t.responses.filter(r => r.enabled).map(r => r.content).join('\n---\n')}`
        ).join('\n\n') + '\n\n[END PREVIOUS CONVERSATION]\n'
      : '';
    
    // Update the message
    setConversationHistory(prev => prev.map(t => {
      if (t.id === turnId) {
        return { 
          ...t, 
          userMessage: newMessage,
          responses: t.responses.map(r => ({
            ...r,
            content: '⏳ Regenerating with edited message...'
          }))
        };
      }
      return t;
    }));

    cancelEditing();
    
    // We need custom logic here - regenerate all responses in the turn
    // For simplicity, we'll store the turn info and handle in useEffect
    // Actually, let's just create a new "turn" after this one and delete this one
    // OR we can use the existing regenerate flow with a special flag
    
    // Simple approach: Clear this turn's responses and send new request
    setCurrentUserMessage(newMessage);
    
    // Remove this turn temporarily and add responses as they come
    setConversationHistory(prev => prev.filter(t => t.id !== turnId));
    
    await sendParallelMessages(
      historyContext + newMessage, 
      modelsToRegenerate, 
      generationConfig, 
      enhancedPrompt,
      perModelSettings
    );
  };

  // Open smart regenerate popup
  const openSmartRegeneratePopup = (turnId: string, responseIndex: number) => {
    setSmartRegeneratePopup({ turnId, responseIndex, customContext: '' });
  };

  // Execute smart regenerate with custom context
  const executeSmartRegenerate = async (customContext?: string) => {
    if (!smartRegeneratePopup) return;
    const { turnId, responseIndex } = smartRegeneratePopup;
    
    const turn = conversationHistory.find(t => t.id === turnId);
    if (!turn || isLoading) return;
    
    const responseToRegenerate = turn.responses[responseIndex];
    const modelToRegenerate = responseToRegenerate.model;
    const enhancedPrompt = getEnhancedSystemPrompt();
    
    // Build FULL context from ALL enabled responses across ALL turns
    const fullContext = conversationHistory.map(t => {
      const enabledResponses = t.responses.filter((r, idx) => {
        if (t.id === turnId && idx === responseIndex) return false;
        return r.enabled;
      });
      
      if (enabledResponses.length === 0 && t.id !== turnId) return null;
      
      const responsesText = enabledResponses.map(r => 
        `[${r.model.display_name || r.model.name}]: ${r.content}`
      ).join('\n\n---\n\n');
      
      return {
        userMessage: t.userMessage,
        responses: responsesText
      };
    }).filter(Boolean);
    
    let contextString = fullContext.length > 0
      ? '\n\n[FULL CONVERSATION CONTEXT - All enabled responses]:\n' + 
        fullContext.map(c => `USER: ${c!.userMessage}\n\nRESPONSES:\n${c!.responses}`).join('\n\n=====\n\n') +
        '\n\n[END CONTEXT]\n'
      : '';
    
    // Add custom context if provided
    if (customContext && customContext.trim()) {
      contextString += `\n\n[ADDITIONAL INSTRUCTIONS]:\n${customContext.trim()}\n\n`;
    }
    
    contextString += 'Now respond to this specific message:';
    
    // DEBUG: Log what's being sent to the model
    console.log('[Smart Regenerate] Full context being sent:');
    console.log('------- CONTEXT START -------');
    console.log(contextString + turn.userMessage);
    console.log('------- CONTEXT END -------');
    console.log('[Smart Regenerate] Enabled responses per turn:', fullContext.length);
    
    // Set regenerating info
    setRegeneratingInfo({ turnId, responseIndex, dbId: responseToRegenerate.dbId });
    
    // Mark as regenerating
    setConversationHistory(prev => prev.map(t => {
      if (t.id === turnId) {
        const newResponses = [...t.responses];
        newResponses[responseIndex] = {
          ...newResponses[responseIndex],
          content: customContext?.trim() 
            ? '✨ Smart regenerating with custom instructions...' 
            : '✨ Smart regenerating with full context...',
        };
        return { ...t, responses: newResponses };
      }
      return t;
    }));
    
    setSmartRegeneratePopup(null);
    
    await sendParallelMessages(
      contextString + turn.userMessage, 
      [modelToRegenerate], 
      generationConfig, 
      enhancedPrompt,
      perModelSettings
    );
  };

  const canSend = inputValue.trim() && selectedModels.length > 0 && !isLoading;

  // Check if there's anything to show in chat area
  const hasContent = conversationHistory.length > 0 || responses.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0 bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-border bg-background flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={cn(
            "p-1 sm:p-1.5 rounded",
            sharedHistoryMode ? "bg-green-500/20" : "bg-purple-500/20"
          )}>
            {sharedHistoryMode ? (
              <GitMerge size={16} className="text-green-500 sm:w-[18px] sm:h-[18px]" />
            ) : (
              <Layers size={16} className="text-purple-500 sm:w-[18px] sm:h-[18px]" />
            )}
          </div>
          <div className="hidden sm:block">
            <h2 className="text-sm font-semibold text-foreground">
              {sharedHistoryMode ? 'Brainstorm Mode' : 'Parallel Model Comparison'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {sharedHistoryMode 
                ? 'Shared memory across all models'
                : 'Compare responses side-by-side'}
            </p>
          </div>
          {/* Compact title for mobile */}
          <span className="text-xs font-medium text-foreground sm:hidden">
            {sharedHistoryMode ? 'Brainstorm' : 'Compare'}
          </span>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Conversation selector dropdown */}
          <div className="relative" ref={conversationListRef}>
            <button
              onClick={() => {
                setShowConversationList(!showConversationList);
                if (!showConversationList) loadSavedConversations();
              }}
              className={cn(
                "flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border"
              )}
              title="Load saved conversation"
            >
              <FolderOpen size={14} />
              <span className="max-w-[60px] sm:max-w-[100px] truncate hidden sm:inline">{conversationTitle}</span>
              <ChevronDown size={14} className={cn(
                "transition-transform",
                showConversationList && "rotate-180"
              )} />
            </button>
            
            {/* Dropdown menu */}
            {showConversationList && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-popover text-popover-foreground border border-border rounded-lg shadow-lg z-50 max-h-80 overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-2 border-b border-border">
                  <span className="text-xs font-medium text-muted-foreground">Saved Conversations</span>
                  <button
                    onClick={handleNewComparison}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-secondary text-primary"
                  >
                    <Plus size={12} />
                    New
                  </button>
                </div>
                
                {/* List */}
                <div className="overflow-y-auto flex-1">
                  {isLoadingConversations ? (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 size={16} className="animate-spin text-muted-foreground" />
                    </div>
                  ) : savedConversations.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      No saved conversations yet
                    </div>
                  ) : (
                    savedConversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={cn(
                          "flex items-center justify-between px-3 py-2 hover:bg-secondary/50 cursor-pointer group",
                          conv.id === supabaseConversationId && "bg-secondary"
                        )}
                      >
                        <div 
                          className="flex-1 min-w-0"
                          onClick={() => loadConversation(conv.id)}
                        >
                          <div className="flex items-center gap-2">
                            {conv.id === supabaseConversationId && (
                              <Check size={12} className="text-primary flex-shrink-0" />
                            )}
                            <span className="text-sm truncate">{conv.title}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                            {conv.shared_history_mode && (
                              <span className="flex items-center gap-0.5">
                                <GitMerge size={10} />
                                Brainstorm
                              </span>
                            )}
                            <span>{new Date(conv.updated_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        
                        {/* Delete button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Delete this conversation?')) {
                              deleteConversation(conv.id);
                            }
                          }}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 text-destructive transition-opacity"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          
          <button
            onClick={() => setSharedHistoryMode(!sharedHistoryMode)}
            className={cn(
              "flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
              sharedHistoryMode 
                ? "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/50 shadow-sm shadow-green-500/20"
                : "bg-muted text-muted-foreground hover:bg-muted/80 border-border hover:border-green-500/30"
            )}
            title={sharedHistoryMode 
              ? "Shared memory ON: Models can see each other's responses" 
              : "Click to enable shared memory - models will see previous responses"}
          >
            {sharedHistoryMode ? <GitMerge size={14} /> : <GitBranch size={14} />}
            <span className="hidden sm:inline">{sharedHistoryMode ? '🧠 Shared ON' : '💡 Enable Shared'}</span>
          </button>
          
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-lg hover:bg-muted transition-colors"
              title="Close parallel chat"
            >
              <X size={16} className="text-muted-foreground sm:w-[18px] sm:h-[18px]" />
            </button>
          )}
        </div>
      </div>

      {/* Save status bar */}
      {(isSaving || saveError || supabaseConversationId) && (
        <div className={cn(
          "px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs flex items-center gap-2 border-b flex-shrink-0",
          saveError ? "bg-destructive/10 border-destructive/20 text-destructive" : "bg-muted/50 border-border"
        )}>
          {isSaving && (
            <>
              <Loader2 size={12} className="animate-spin flex-shrink-0" />
              <span>Saving...</span>
            </>
          )}
          {saveError && (
            <>
              <AlertCircle size={12} className="flex-shrink-0" />
              <span className="truncate">{saveError}</span>
              <button 
                onClick={() => setSaveError(null)}
                className="ml-auto hover:text-foreground flex-shrink-0"
              >
                <X size={12} />
              </button>
            </>
          )}
          {!isSaving && !saveError && supabaseConversationId && (
            <>
              <Check size={12} className="text-green-500" />
              <span className="text-muted-foreground">Auto-saved to cloud</span>
            </>
          )}
        </div>
      )}

      {/* Selected Models Bar - показывает выбранные модели с настройками */}
      {selectedModels.length > 0 && (
        <div className="px-3 sm:px-4 py-2 border-b border-border bg-background/50 flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">
              Models:
            </span>
            {selectedModels.map((model) => (
              <div
                key={model.id}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium transition-all",
                  "bg-secondary/50 border-border hover:border-primary/30"
                )}
              >
                <Bot size={12} className={providerAccentColors[model.provider] || 'text-foreground/60'} />
                <span className={cn(
                  "max-w-[80px] sm:max-w-[120px] truncate",
                  providerAccentColors[model.provider]
                )}>
                  {model.display_name}
                </span>
                {/* Settings gear */}
                <button
                  onClick={() => openModelSettings(model)}
                  className="p-1 rounded hover:bg-white/10 text-foreground/40 hover:text-foreground transition-all"
                  title={`Settings for ${model.display_name}`}
                >
                  <Settings size={12} />
                </button>
              </div>
            ))}
            {selectedModels.length === 0 && (
              <span className="text-xs text-muted-foreground italic">
                Select models from the top menu ↑
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main chat area - scrollable with improved Mac scrolling */}
      <div 
        className="flex-1 overflow-y-auto min-h-0 scroll-container"
        style={{ 
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain'
        }}
      >
        {!hasContent ? (
          /* Empty state */
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md mx-auto px-4">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4",
                sharedHistoryMode ? "bg-green-500/10" : "bg-purple-500/10"
              )}>
                {sharedHistoryMode ? (
                  <GitMerge size={32} className="text-green-500" />
                ) : (
                  <Layers size={32} className="text-purple-500" />
                )}
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {sharedHistoryMode ? 'Brainstorm Mode' : 'Compare AI Models'}
              </h3>
              <p className="text-muted-foreground mb-6">
                {sharedHistoryMode 
                  ? 'All models share conversation history for collaborative problem-solving.'
                  : 'Select models below and send a message to compare responses.'}
              </p>
              
              {/* Quick load recent conversation */}
              {savedConversations.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2">Or continue a recent conversation:</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {savedConversations.slice(0, 3).map(conv => (
                      <button
                        key={conv.id}
                        onClick={() => loadConversation(conv.id)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted/50 transition-colors max-w-[150px] truncate"
                      >
                        {conv.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Chat history and current responses */
          <div className="p-4 space-y-4">
            {/* Previous conversation history */}
            {conversationHistory.map((turn, turnIndex) => (
              <div key={turn.id} className="space-y-3 group/turn relative">
                {/* Turn controls - move up/down */}
                <div className="absolute -left-12 top-0 flex flex-col gap-1 opacity-0 group-hover/turn:opacity-100 transition-opacity">
                  {turnIndex > 0 && (
                    <button
                      onClick={() => moveTurnUp(turn.id)}
                      className="p-1 rounded bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground"
                      title="Move turn up"
                    >
                      <ArrowUp size={12} />
                    </button>
                  )}
                  {turnIndex < conversationHistory.length - 1 && (
                    <button
                      onClick={() => moveTurnDown(turn.id)}
                      className="p-1 rounded bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground"
                      title="Move turn down"
                    >
                      <ArrowDown size={12} />
                    </button>
                  )}
                </div>
                
                {/* User message bubble - ChatGPT style with inline edit */}
                <div className="flex justify-end">
                  <div className="flex items-start gap-2 max-w-[80%] relative group/user">
                    {/* Action buttons - left side */}
                    <div className="opacity-0 group-hover/user:opacity-100 transition-opacity absolute -left-20 top-1 flex items-center gap-1">
                      {/* Delete turn button */}
                      <button
                        onClick={() => deleteTurn(turn.id)}
                        className="p-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive"
                        title="Delete this turn"
                      >
                        <Trash2 size={14} />
                      </button>
                      {/* Edit button */}
                      {editingTurnId !== turn.id && (
                        <button
                          onClick={() => startEditingMessage(turn.id, turn.userMessage)}
                          className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground"
                          title="Edit message"
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                    </div>
                    
                    {/* Message content - either text or edit textarea */}
                    {editingTurnId === turn.id ? (
                      <div className="bg-secondary dark:bg-[#2f2f2f] text-foreground rounded-2xl rounded-br-md px-3 py-2 w-full">
                        <textarea
                          ref={editTextareaRef}
                          value={editingMessage}
                          onChange={(e) => setEditingMessage(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') cancelEditing();
                            if (e.key === 'Enter' && e.ctrlKey) saveEditedMessage(turn.id);
                          }}
                          className="w-full text-sm bg-transparent resize-none focus:outline-none min-h-[60px] max-h-[200px]"
                          placeholder="Edit your message..."
                          rows={3}
                        />
                        <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-border/30">
                          <button
                            onClick={cancelEditing}
                            className="px-2 py-1 text-xs rounded bg-muted hover:bg-muted/80 text-muted-foreground"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveEditedMessage(turn.id)}
                            className="px-2 py-1 text-xs rounded bg-primary/10 hover:bg-primary/20 text-primary"
                            title="Save (Ctrl+Enter)"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => saveAndRegenerateAll(turn.id)}
                            className="px-2 py-1 text-xs rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-500 flex items-center gap-1"
                            title="Save and regenerate all responses"
                            disabled={isLoading}
                          >
                            <RefreshCw size={10} />
                            Regenerate All
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-secondary dark:bg-[#2f2f2f] text-foreground rounded-2xl rounded-br-sm px-4 py-3 shadow-sm">
                        <p className="text-[15px] whitespace-pre-wrap break-words leading-relaxed">{turn.userMessage}</p>
                      </div>
                    )}
                    
                    <div className="w-9 h-9 rounded-full bg-muted-foreground/60 dark:bg-zinc-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <User size={16} className="text-white dark:text-zinc-200" />
                    </div>
                  </div>
                </div>
                
                {/* Model responses - shown as a grid with interactive controls */}
                <div className="flex justify-start">
                  <div className="max-w-full w-full">
                    <div className={cn(
                      "grid gap-3 items-start", // items-start prevents stretching
                      turn.responses.length <= 2 ? "grid-cols-1 md:grid-cols-2" 
                        : turn.responses.length === 3 ? "grid-cols-1 md:grid-cols-3"
                        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
                    )}>
                      {turn.responses.map((resp, idx) => (
                        <div 
                          key={idx}
                          ref={(el) => registerResponseRef(turn.id, idx, el)}
                          draggable={typeof window !== 'undefined' && window.innerWidth >= 768}
                          onDragStart={() => handleDragStart(turn.id, idx)}
                          onDragOver={(e) => handleDragOver(e, turn.id, idx)}
                          onDragLeave={handleDragLeave}
                          onDrop={() => handleDrop(turn.id, idx)}
                          onDragEnd={handleDragEnd}
                          // Touch events for mobile drag & drop
                          onTouchStart={(e) => handleTouchStart(e, turn.id, idx)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
                          onTouchCancel={handleTouchCancel}
                          style={{ touchAction: 'pan-y pinch-zoom' }}
                          className={cn(
                            "rounded-2xl border px-4 py-4 group/resp relative transition-all duration-300 overflow-hidden flex flex-col select-none shadow-lg",
                            // Cards size based on content, earlier turns get max-height
                            turnIndex !== conversationHistory.length - 1 && "max-h-[200px]",
                            "md:cursor-grab md:active:cursor-grabbing",
                            resp.enabled 
                              ? cn(
                                  providerColors[resp.model.provider] || providerColors.ollama,
                                  providerGlowColors[resp.model.provider] || providerGlowColors.ollama,
                                  "hover:shadow-xl hover:scale-[1.01]"
                                )
                              : "bg-muted/20 border-border/30 opacity-50 grayscale-[30%]",
                            // Desktop drag states
                            draggedResponse?.turnId === turn.id && draggedResponse?.responseIndex === idx && "opacity-50 scale-95",
                            dragOverTarget?.turnId === turn.id && dragOverTarget?.responseIndex === idx && "ring-2 ring-primary/50 ring-offset-2 ring-offset-background",
                            // Touch drag states
                            touchDragging?.turnId === turn.id && touchDragging?.responseIndex === idx && "opacity-50 scale-95 z-50",
                            touchDropTarget?.turnId === turn.id && touchDropTarget?.responseIndex === idx && "ring-2 ring-primary/50 ring-offset-2 bg-primary/5",
                          )}
                        >
                          {/* Drag handle (desktop) & position controls - always visible on mobile */}
                          <div className={cn(
                            "absolute left-1 top-1/2 -translate-y-1/2 flex flex-col gap-1",
                            "opacity-100 sm:opacity-0 sm:group-hover/resp:opacity-100 transition-opacity"
                          )}>
                            {/* Drag handle - larger touch target, hidden on mobile */}
                            <div className="hidden md:flex p-1.5 cursor-grab">
                              <GripVertical size={16} className="text-muted-foreground" />
                            </div>
                            {/* Move buttons - always show, larger for touch */}
                            {idx > 0 && (
                              <button
                                onClick={() => moveResponseUp(turn.id, idx)}
                                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground touch-manipulation"
                                title="Move left"
                              >
                                <ArrowUp size={16} className="rotate-[-90deg]" />
                              </button>
                            )}
                            {idx < turn.responses.length - 1 && (
                              <button
                                onClick={() => moveResponseDown(turn.id, idx)}
                                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground touch-manipulation"
                                title="Move right"
                              >
                                <ArrowDown size={16} className="rotate-[-90deg]" />
                              </button>
                            )}
                          </div>
                          
                          {/* Response header with model name and action buttons */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 pl-6 sm:pl-0">
                              <div className={cn(
                                "w-7 h-7 rounded-lg flex items-center justify-center",
                                "bg-gradient-to-br from-white/10 to-white/5"
                              )}>
                                <Bot size={14} className={providerAccentColors[resp.model.provider] || 'text-foreground/60'} />
                              </div>
                              <div className="flex flex-col">
                                <span className={cn(
                                  "text-sm font-semibold tracking-tight",
                                  !resp.enabled && "line-through opacity-50",
                                  providerAccentColors[resp.model.provider]
                                )}>
                                  {resp.model.display_name}
                                </span>
                                <span className="text-[10px] text-foreground/40 uppercase tracking-wider">
                                  {resp.model.provider}
                                </span>
                              </div>
                              {/* Settings gear icon */}
                              <button
                                onClick={() => openModelSettings(resp.model)}
                                className="p-1.5 rounded-lg hover:bg-white/10 dark:hover:bg-white/10 text-foreground/50 hover:text-foreground transition-all touch-manipulation ml-1"
                                title={`Settings for ${resp.model.display_name}`}
                              >
                                <Settings size={14} />
                              </button>
                            </div>
                            
                            {/* Action buttons - modern pill style */}
                            <div className="flex items-center gap-0.5 bg-black/5 dark:bg-white/5 rounded-full p-0.5">
                              {/* Expand button */}
                              <button
                                onClick={() => setExpandedResponse({
                                  turnId: turn.id,
                                  responseIndex: idx,
                                  content: resp.content,
                                  model: resp.model
                                })}
                                className="p-2 rounded-full hover:bg-white/10 dark:hover:bg-white/10 text-foreground/60 hover:text-foreground transition-all touch-manipulation"
                                title="Expand"
                              >
                                <Maximize2 size={15} />
                              </button>
                              
                              {/* Copy button */}
                              <button
                                onClick={() => copyResponse(resp.content)}
                                className="p-2 rounded-full hover:bg-white/10 dark:hover:bg-white/10 text-foreground/60 hover:text-foreground transition-all touch-manipulation"
                                title="Copy"
                              >
                                <Copy size={15} />
                              </button>
                              
                              {/* Toggle visibility button */}
                              <button
                                onClick={() => toggleResponseEnabled(turn.id, idx)}
                                className={cn(
                                  "p-2 rounded-full transition-all touch-manipulation",
                                  resp.enabled 
                                    ? "hover:bg-white/10 text-foreground/60 hover:text-foreground"
                                    : "bg-emerald-500/20 text-emerald-400"
                                )}
                                title={resp.enabled ? "Hide" : "Show"}
                              >
                                {resp.enabled ? <EyeOff size={15} /> : <Eye size={15} />}
                              </button>
                              
                              {/* Regenerate button */}
                              <button
                                onClick={() => regenerateResponse(turn.id, idx)}
                                className="p-2 rounded-full hover:bg-sky-500/20 text-foreground/60 hover:text-sky-400 transition-all touch-manipulation"
                                title="Regenerate"
                                disabled={isLoading}
                              >
                                <RefreshCw size={15} />
                              </button>
                              
                              {/* Smart Regenerate */}
                              <div className="relative">
                                <button
                                  onClick={() => openSmartRegeneratePopup(turn.id, idx)}
                                  className="p-2 rounded-full hover:bg-violet-500/20 text-foreground/60 hover:text-violet-400 transition-all touch-manipulation"
                                  title="Smart regenerate"
                                  disabled={isLoading}
                                >
                                  <Sparkles size={16} />
                                </button>
                                
                                {/* Smart Regenerate Popup */}
                                {smartRegeneratePopup?.turnId === turn.id && smartRegeneratePopup?.responseIndex === idx && (
                                  <div 
                                    data-smart-regenerate-popup
                                    className="fixed sm:absolute inset-4 sm:inset-auto sm:right-0 sm:top-full sm:mt-1 sm:w-72 bg-popover text-popover-foreground border border-border rounded-lg shadow-xl z-50 p-3 flex flex-col"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-medium flex items-center gap-1">
                                        <Sparkles size={12} className="text-purple-500" />
                                        Smart Regenerate
                                      </span>
                                      <button 
                                        onClick={() => setSmartRegeneratePopup(null)}
                                        className="p-1 rounded hover:bg-muted text-muted-foreground"
                                      >
                                        <X size={16} />
                                      </button>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mb-2">
                                      Add custom instructions (optional).
                                    </p>
                                    <textarea
                                      value={smartRegeneratePopup.customContext}
                                      onChange={(e) => setSmartRegeneratePopup(prev => prev ? {...prev, customContext: e.target.value} : null)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') setSmartRegeneratePopup(null);
                                        if (e.key === 'Enter' && e.ctrlKey) executeSmartRegenerate(smartRegeneratePopup.customContext);
                                      }}
                                      placeholder="e.g. Be more concise..."
                                      className="flex-1 sm:flex-none w-full text-base sm:text-xs bg-secondary border border-border rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                                      rows={3}
                                      autoFocus
                                    />
                                    <div className="flex items-center justify-end gap-2 mt-3 sm:mt-2">
                                      <button
                                        onClick={() => setSmartRegeneratePopup(null)}
                                        className="px-3 py-2 sm:px-2 sm:py-1 text-sm sm:text-xs rounded bg-muted hover:bg-muted/80 text-muted-foreground"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => executeSmartRegenerate(smartRegeneratePopup.customContext)}
                                        className="px-3 py-2 sm:px-2 sm:py-1 text-sm sm:text-xs rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-500 flex items-center gap-1"
                                        disabled={isLoading}
                                      >
                                        <Sparkles size={12} />
                                        Go
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              {/* Delete response button */}
                              <button
                                onClick={() => deleteResponse(turn.id, idx)}
                                className="p-2 rounded-full hover:bg-rose-500/20 text-foreground/60 hover:text-rose-400 transition-all touch-manipulation"
                                title="Delete"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                          
                          {/* Thinking/Reasoning section - collapsible */}
                          {(resp.thinkingContent || (resp.meta?.thought_tokens && resp.meta.thought_tokens > 0)) && (
                            <ThinkingSection 
                              content={resp.thinkingContent || ''} 
                              tokens={resp.meta?.thought_tokens}
                            />
                          )}
                          
                          {/* Response content with Markdown - click to expand, last turn fully visible, others scrollable */}
                          <div 
                            onClick={() => setExpandedResponse({
                              turnId: turn.id,
                              responseIndex: idx,
                              content: resp.content,
                              model: resp.model
                            })}
                            className={cn(
                              "flex-1 min-h-0 cursor-pointer hover:bg-white/[0.02] rounded-lg transition-colors -mx-1 px-1",
                              resp.enabled ? "text-foreground/90" : "text-foreground/40",
                              // Only add scroll to earlier turns
                              turnIndex !== conversationHistory.length - 1 && "overflow-y-auto"
                            )}
                            style={{ 
                              overscrollBehavior: 'contain',
                              WebkitOverflowScrolling: 'touch'
                            }}
                          >
                            <MarkdownContent content={resp.content} />
                          </div>
                          
                          {/* Meta info footer - modern pill style */}
                          {resp.meta && (
                            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-white/5 text-[11px] text-foreground/40 flex-shrink-0">
                              {resp.meta.tokens_out !== undefined && (
                                <span className="text-emerald-400/70">↓{resp.meta.tokens_out}</span>
                              )}
                              {resp.meta.thought_tokens !== undefined && resp.meta.thought_tokens > 0 && (
                                <span className="text-violet-400/70">🧠{resp.meta.thought_tokens}</span>
                              )}
                              {resp.meta.estimated_cost !== undefined && resp.meta.estimated_cost !== null && (
                                <span className="text-amber-400/70">${resp.meta.estimated_cost.toFixed(4)}</span>
                              )}
                              {resp.meta.total_latency !== undefined && (
                                <span className="text-foreground/30">{resp.meta.total_latency.toFixed(1)}s</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Current turn - streaming responses */}
            {responses.length > 0 && (
              <div className="space-y-3">
                {/* Current user message - ChatGPT style */}
                <div className="flex justify-end">
                  <div className="flex items-start gap-2 max-w-[80%]">
                    <div className="bg-secondary dark:bg-[#2f2f2f] text-foreground rounded-2xl rounded-br-sm px-4 py-3 shadow-sm">
                      <p className="text-[15px] whitespace-pre-wrap break-words leading-relaxed">{currentUserMessage}</p>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-muted-foreground/60 dark:bg-zinc-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <User size={16} className="text-white dark:text-zinc-200" />
                    </div>
                  </div>
                </div>
                
                {/* Current model responses grid */}
                <div className="flex justify-start">
                  <div className="max-w-full w-full">
                    <ParallelResponseView responses={responses} />
                  </div>
                </div>
              </div>
            )}
            
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Input area - Modern 2026 style */}
      <div className="border-t border-white/5 bg-gradient-to-t from-background to-background/80 backdrop-blur-xl p-3 sm:p-4 flex-shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {/* Input form */}
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex items-end gap-2 bg-white/5 dark:bg-white/[0.03] rounded-2xl border border-white/10 p-2 shadow-xl backdrop-blur-sm">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedModels.length === 0
                  ? "Select models above..."
                  : `Message ${selectedModels.length} model${selectedModels.length > 1 ? 's' : ''}...`
              }
              className={cn(
                "flex-1 px-3 py-2.5 resize-none bg-transparent text-foreground placeholder:text-foreground/30",
                "focus:outline-none border-0 text-[16px] leading-relaxed", // 16px prevents iOS zoom
              )}
              rows={1}
              style={{ minHeight: '44px', maxHeight: '140px' }}
              disabled={selectedModels.length === 0 || isLoading}
            />

            <div className="flex items-center gap-1.5">
              {conversationHistory.length > 0 && !isLoading && (
                <Button
                  type="button"
                  onClick={handleNewComparison}
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 p-0 rounded-full hover:bg-white/10"
                  title="New conversation"
                >
                  <Plus size={18} />
                </Button>
              )}
              
              {isLoading ? (
                <Button
                  type="button"
                  onClick={cancelAll}
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 p-0 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-400"
                >
                  <Square size={18} />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!canSend}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-10 w-10 p-0 rounded-full transition-all duration-300",
                    canSend 
                      ? "bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 text-white shadow-lg shadow-violet-500/25" 
                      : "text-foreground/30"
                  )}
                >
                  <Send size={18} />
                </Button>
              )}
            </div>
          </div>
        </form>

        {/* Status bar */}
        {/* Status bar - compact on mobile */}
        <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground">
          <div className="flex items-center gap-2 sm:gap-3">
            {selectedModels.length > 0 && (
              <span className="flex items-center gap-1">
                <Layers size={10} className="sm:w-3 sm:h-3" />
                {selectedModels.length}
              </span>
            )}
            {/* Context stats - simplified on mobile */}
            {conversationHistory.length > 0 && (() => {
              const totalResponses = conversationHistory.reduce((acc, t) => acc + t.responses.length, 0);
              const enabledResponses = conversationHistory.reduce((acc, t) => acc + t.responses.filter(r => r.enabled).length, 0);
              return (
                <span className="flex items-center gap-1">
                  <Eye size={10} className={cn("sm:w-3 sm:h-3", enabledResponses > 0 && "text-green-500")} />
                  <span className={enabledResponses > 0 ? "text-green-500" : ""}>
                    {enabledResponses}/{totalResponses}
                  </span>
                </span>
              );
            })()}
            {isLoading && (
              <span className="flex items-center gap-1 text-purple-500">
                <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
                <span className="hidden sm:inline">Generating...</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {sharedHistoryMode && (
              <span className="flex items-center gap-1 text-green-500">
                <GitMerge size={10} className="sm:w-3 sm:h-3" />
                <span className="hidden sm:inline">Shared</span>
              </span>
            )}
            {responses.length > 0 && isLoading && (
              <span className="text-foreground/40">
                {responses.filter(r => !r.isStreaming && r.content).length}/{responses.length}
              </span>
            )}
          </div>
        </div>
      </div>
      
      {/* Expanded Response Modal - Modern fullscreen */}
      {expandedResponse && (
        <div 
          className="fixed inset-0 z-[200] bg-background/98 backdrop-blur-xl flex flex-col animate-in fade-in zoom-in-95 duration-300"
          onClick={() => setExpandedResponse(null)}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/5 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                "bg-gradient-to-br from-white/10 to-white/5"
              )}>
                <Bot size={20} className={providerAccentColors[expandedResponse.model.provider] || 'text-foreground/60'} />
              </div>
              <div>
                <span className={cn(
                  "font-semibold text-lg",
                  providerAccentColors[expandedResponse.model.provider]
                )}>
                  {expandedResponse.model.display_name}
                </span>
                <p className="text-xs text-foreground/40 uppercase tracking-wider">
                  {expandedResponse.model.provider}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  copyResponse(expandedResponse.content);
                }}
                className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-foreground/60 hover:text-foreground transition-all"
                title="Copy"
              >
                <Copy size={18} />
              </button>
              <button
                onClick={() => setExpandedResponse(null)}
                className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-foreground/60 hover:text-foreground transition-all"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          
          {/* Content - scrollable with Markdown */}
          <div 
            className="flex-1 overflow-y-auto p-4 sm:p-8 scroll-container"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-w-4xl mx-auto">
              <MarkdownContent 
                content={expandedResponse.content} 
                className="text-[16px] leading-[1.9]"
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Touch drag ghost overlay */}
      {touchDragging && (
        <div 
          ref={touchGhostRef}
          className="fixed pointer-events-none z-[100] bg-gradient-to-br from-violet-500/30 to-purple-500/30 border border-violet-400/50 rounded-xl px-4 py-3 shadow-2xl backdrop-blur-md"
          style={{
            left: touchDragging.currentX - 50,
            top: touchDragging.currentY - 30,
            minWidth: '120px',
            transform: 'translate(0, 0)',
          }}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <GripVertical size={16} />
            <span>Moving...</span>
          </div>
        </div>
      )}
      
      {/* Model Settings Popup */}
      {modelSettingsPopup && (
        <div 
          className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setModelSettingsPopup(null)}
        >
          <div 
            className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center",
                  "bg-gradient-to-br from-white/10 to-white/5"
                )}>
                  <Settings size={18} className={providerAccentColors[modelSettingsPopup.model.provider] || 'text-foreground/60'} />
                </div>
                <div>
                  <span className={cn(
                    "font-semibold",
                    providerAccentColors[modelSettingsPopup.model.provider]
                  )}>
                    {modelSettingsPopup.model.display_name}
                  </span>
                  <p className="text-[10px] text-foreground/40 uppercase tracking-wider">
                    Model Settings
                    {isLoadingModelSettings && <Loader2 size={10} className="inline ml-1 animate-spin" />}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModelSettingsPopup(null)}
                className="p-2 rounded-full hover:bg-white/10 text-foreground/60 hover:text-foreground transition-all"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Quick Presets */}
            <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary/20 flex-shrink-0">
              <span className="text-xs text-foreground/50">Quick:</span>
              <button
                onClick={() => setModelSettingsPopup(prev => prev ? {
                  ...prev,
                  settings: { 
                    ...prev.settings, 
                    temperature: 1.0, 
                    maxTokens: 32768,
                    topP: 1.0,
                    frequencyPenalty: 0,
                    presencePenalty: 0,
                    reasoningEffort: 'high',
                    thinkingBudget: -1,
                  }
                } : null)}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-r from-red-500 to-orange-500 text-white hover:opacity-90 transition-all"
              >
                🔥 MAX
              </button>
              <button
                onClick={() => setModelSettingsPopup(prev => prev ? {
                  ...prev,
                  settings: { 
                    ...prev.settings, 
                    temperature: 0.7, 
                    maxTokens: 8192,
                    topP: 0.95,
                    frequencyPenalty: 0,
                    presencePenalty: 0,
                    reasoningEffort: 'medium',
                    thinkingBudget: -1,
                  }
                } : null)}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:opacity-90 transition-all"
              >
                ⚖️ Balanced
              </button>
              <button
                onClick={() => setModelSettingsPopup(prev => prev ? {
                  ...prev,
                  settings: { 
                    ...prev.settings, 
                    temperature: 0.1, 
                    maxTokens: 1024,
                    topP: 0.5,
                    frequencyPenalty: 0.5,
                    presencePenalty: 0,
                    reasoningEffort: 'minimal',
                    thinkingBudget: 0,
                  }
                } : null)}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:opacity-90 transition-all"
              >
                ❄️ MIN
              </button>
            </div>
            
            {/* Content - scrollable */}
            <div className="p-4 space-y-5 overflow-y-auto flex-1">
              {/* System Prompt */}
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  System Prompt
                </label>
                <textarea
                  value={modelSettingsPopup.settings.systemPrompt}
                  onChange={(e) => setModelSettingsPopup(prev => prev ? {
                    ...prev,
                    settings: { ...prev.settings, systemPrompt: e.target.value }
                  } : null)}
                  placeholder="Enter custom system prompt for this model..."
                  className="w-full h-24 px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
                <p className="text-[10px] text-foreground/40 mt-1">
                  Leave empty to use global system prompt
                </p>
              </div>
              
              {/* Temperature */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-foreground/80">Temperature</label>
                  <span className="text-xs text-foreground/60 font-mono bg-secondary/50 px-2 py-0.5 rounded">
                    {modelSettingsPopup.settings.temperature.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={modelSettingsPopup.settings.temperature}
                  onChange={(e) => setModelSettingsPopup(prev => prev ? {
                    ...prev,
                    settings: { ...prev.settings, temperature: parseFloat(e.target.value) }
                  } : null)}
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] text-foreground/40 mt-1">
                  <span>Precise (0)</span>
                  <span>Creative (2)</span>
                </div>
              </div>
              
              {/* Max Tokens */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-foreground/80">Max Tokens</label>
                  <span className="text-xs text-foreground/60 font-mono bg-secondary/50 px-2 py-0.5 rounded">
                    {modelSettingsPopup.settings.maxTokens.toLocaleString()}
                  </span>
                </div>
                <input
                  type="range"
                  min="256"
                  max={getModelMaxOutputTokens(modelSettingsPopup.model)}
                  step="256"
                  value={Math.min(modelSettingsPopup.settings.maxTokens, getModelMaxOutputTokens(modelSettingsPopup.model))}
                  onChange={(e) => setModelSettingsPopup(prev => prev ? {
                    ...prev,
                    settings: { ...prev.settings, maxTokens: parseInt(e.target.value) }
                  } : null)}
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex items-center justify-between text-[10px] text-foreground/40 mt-1">
                  <span>Model limit: {getModelMaxOutputTokens(modelSettingsPopup.model).toLocaleString()}</span>
                  <span>Default: {getModelDefaultTokens(modelSettingsPopup.model).toLocaleString()}</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setModelSettingsPopup(prev => prev ? {
                      ...prev,
                      settings: { ...prev.settings, maxTokens: getModelDefaultTokens(modelSettingsPopup.model) }
                    } : null)}
                    className="px-2 py-1 text-[10px] rounded border border-green-500/30 hover:bg-green-500/10 text-green-400"
                  >
                    Default
                  </button>
                  <button
                    onClick={() => setModelSettingsPopup(prev => prev ? {
                      ...prev,
                      settings: { ...prev.settings, maxTokens: 4096 }
                    } : null)}
                    className="px-2 py-1 text-[10px] rounded border border-border hover:bg-secondary/50 text-foreground/60"
                  >
                    4K
                  </button>
                  <button
                    onClick={() => setModelSettingsPopup(prev => prev ? {
                      ...prev,
                      settings: { ...prev.settings, maxTokens: 8192 }
                    } : null)}
                    className="px-2 py-1 text-[10px] rounded border border-border hover:bg-secondary/50 text-foreground/60"
                  >
                    8K
                  </button>
                  <button
                    onClick={() => setModelSettingsPopup(prev => prev ? {
                      ...prev,
                      settings: { ...prev.settings, maxTokens: 16384 }
                    } : null)}
                    className="px-2 py-1 text-[10px] rounded border border-border hover:bg-secondary/50 text-foreground/60"
                  >
                    16K
                  </button>
                  <button
                    onClick={() => setModelSettingsPopup(prev => prev ? {
                      ...prev,
                      settings: { ...prev.settings, maxTokens: getModelMaxOutputTokens(modelSettingsPopup.model) }
                    } : null)}
                    className="px-2 py-1 text-[10px] rounded border border-blue-500/30 hover:bg-blue-500/10 text-blue-400"
                  >
                    MAX
                  </button>
                </div>
              </div>
              
              {/* Top P */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-foreground/80">Top P</label>
                  <span className="text-xs text-foreground/60 font-mono bg-secondary/50 px-2 py-0.5 rounded">
                    {modelSettingsPopup.settings.topP.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={modelSettingsPopup.settings.topP}
                  onChange={(e) => setModelSettingsPopup(prev => prev ? {
                    ...prev,
                    settings: { ...prev.settings, topP: parseFloat(e.target.value) }
                  } : null)}
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <p className="text-[10px] text-foreground/40 mt-1">Nucleus sampling - controls diversity</p>
              </div>
              
              {/* Frequency & Presence Penalty */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-foreground/80">Freq. Penalty</label>
                    <span className="text-[10px] text-foreground/60 font-mono">
                      {modelSettingsPopup.settings.frequencyPenalty.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.1"
                    value={modelSettingsPopup.settings.frequencyPenalty}
                    onChange={(e) => setModelSettingsPopup(prev => prev ? {
                      ...prev,
                      settings: { ...prev.settings, frequencyPenalty: parseFloat(e.target.value) }
                    } : null)}
                    className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-foreground/80">Pres. Penalty</label>
                    <span className="text-[10px] text-foreground/60 font-mono">
                      {modelSettingsPopup.settings.presencePenalty.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.1"
                    value={modelSettingsPopup.settings.presencePenalty}
                    onChange={(e) => setModelSettingsPopup(prev => prev ? {
                      ...prev,
                      settings: { ...prev.settings, presencePenalty: parseFloat(e.target.value) }
                    } : null)}
                    className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
              </div>
              
              {/* Provider-specific: Reasoning Effort (OpenAI) */}
              {modelSettingsPopup.model.provider === 'openai' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-foreground/80">Reasoning Effort</label>
                    <select
                      value={modelSettingsPopup.settings.reasoningEffort || ''}
                      onChange={(e) => setModelSettingsPopup(prev => prev ? {
                        ...prev,
                        settings: { 
                          ...prev.settings, 
                          reasoningEffort: (e.target.value as 'minimal' | 'medium' | 'high') || undefined 
                        }
                      } : null)}
                      className="text-xs bg-secondary border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">default</option>
                      <option value="minimal">minimal (fast)</option>
                      <option value="medium">medium</option>
                      <option value="high">high (deep)</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-foreground/40">Controls reasoning depth for GPT-5/o-series</p>
                </div>
              )}
              
              {/* Provider-specific: Thinking Budget (Gemini/DeepSeek) */}
              {(modelSettingsPopup.model.provider === 'gemini' || modelSettingsPopup.model.provider === 'deepseek') && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-foreground/80">Thinking Budget</label>
                    <span className="text-xs text-foreground/60 font-mono bg-secondary/50 px-2 py-0.5 rounded">
                      {modelSettingsPopup.settings.thinkingBudget === undefined || modelSettingsPopup.settings.thinkingBudget === -1 
                        ? 'auto' 
                        : modelSettingsPopup.settings.thinkingBudget === 0 
                          ? 'off' 
                          : modelSettingsPopup.settings.thinkingBudget.toLocaleString()}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-1"
                    max="24576"
                    step="1"
                    value={modelSettingsPopup.settings.thinkingBudget ?? -1}
                    onChange={(e) => setModelSettingsPopup(prev => prev ? {
                      ...prev,
                      settings: { ...prev.settings, thinkingBudget: parseInt(e.target.value) }
                    } : null)}
                    className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-violet-500"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setModelSettingsPopup(prev => prev ? {
                        ...prev,
                        settings: { ...prev.settings, thinkingBudget: -1 }
                      } : null)}
                      className="px-2 py-1 text-[10px] rounded border border-violet-500/30 hover:bg-violet-500/10 text-violet-400"
                    >
                      Auto (-1)
                    </button>
                    <button
                      onClick={() => setModelSettingsPopup(prev => prev ? {
                        ...prev,
                        settings: { ...prev.settings, thinkingBudget: 0 }
                      } : null)}
                      className="px-2 py-1 text-[10px] rounded border border-border hover:bg-secondary/50 text-foreground/60"
                    >
                      Off (0)
                    </button>
                    <button
                      onClick={() => setModelSettingsPopup(prev => prev ? {
                        ...prev,
                        settings: { ...prev.settings, thinkingBudget: 8192 }
                      } : null)}
                      className="px-2 py-1 text-[10px] rounded border border-border hover:bg-secondary/50 text-foreground/60"
                    >
                      8K
                    </button>
                  </div>
                  <p className="text-[10px] text-foreground/40 mt-1">-1 = dynamic, 0 = off, &gt;0 = fixed thinking tokens</p>
                </div>
              )}
              
              {/* Streaming Toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <label className="text-sm font-medium text-foreground/80">Streaming</label>
                  <p className="text-[10px] text-foreground/40">Enable real-time response streaming</p>
                </div>
                <button
                  onClick={() => setModelSettingsPopup(prev => prev ? {
                    ...prev,
                    settings: { ...prev.settings, streaming: !prev.settings.streaming }
                  } : null)}
                  className={cn(
                    "relative w-11 h-6 rounded-full transition-colors",
                    modelSettingsPopup.settings.streaming 
                      ? "bg-primary" 
                      : "bg-secondary"
                  )}
                >
                  <span className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform",
                    modelSettingsPopup.settings.streaming 
                      ? "translate-x-6" 
                      : "translate-x-1"
                  )} />
                </button>
              </div>
              
              {/* Stop Sequences */}
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Stop Sequences
                </label>
                <textarea
                  value={modelSettingsPopup.settings.stopSequences.join('\n')}
                  onChange={(e) => setModelSettingsPopup(prev => prev ? {
                    ...prev,
                    settings: { 
                      ...prev.settings, 
                      stopSequences: e.target.value.split('\n').filter(s => s.trim()) 
                    }
                  } : null)}
                  placeholder="One sequence per line (optional)&#10;e.g.&#10;---&#10;END"
                  className="w-full h-16 px-3 py-2 text-xs bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none font-mono"
                />
                <p className="text-[10px] text-foreground/40 mt-1">
                  Tokens where the API will stop generating (each line = one sequence)
                </p>
              </div>
              
              {/* Model Info */}
              <div className="mt-4 pt-3 border-t border-border/50">
                <div className="flex items-center justify-between text-[10px] text-foreground/40">
                  <span>Model Max Output:</span>
                  <span className="font-mono text-foreground/60">
                    {getModelMaxOutputTokens(modelSettingsPopup.model).toLocaleString()} tokens
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-foreground/40 mt-1">
                  <span>Context Length:</span>
                  <span className="font-mono text-foreground/60">
                    {(modelSettingsPopup.model.context_length || 0).toLocaleString()} tokens
                  </span>
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-border bg-secondary/30 flex-shrink-0">
              <button
                onClick={() => setModelSettingsPopup(null)}
                className="px-4 py-2 text-sm rounded-lg hover:bg-secondary text-foreground/60 hover:text-foreground transition-all"
              >
                Cancel
              </button>
              <button
                onClick={saveModelSettings}
                className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all font-medium"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParallelChatInterface;
