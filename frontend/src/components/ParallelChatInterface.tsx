import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Square, Bot, Layers, X, GitMerge, GitBranch, User, Trash2, Eye, EyeOff, RefreshCw, Copy, FolderOpen, ChevronDown, Plus, Check, AlertCircle, Loader2, ArrowUp, ArrowDown, Sparkles, GripVertical, Brain, Edit2 } from 'lucide-react';
import { ModelInfo, GenerationConfig, Message } from '../types';
import { Button } from './ui/button';
import { ModelMultiSelector } from './ModelMultiSelector';
import { ParallelResponseView } from './ParallelResponseView';
import { useParallelChat } from '../hooks/useParallelChat';
import { cn } from '../lib/utils';
import { parallelAPI, ParallelConversation, ParallelTurn } from '../services/parallelConversationsAPI';

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

// Provider colors for history display
const providerColors: Record<string, string> = {
  openai: 'bg-green-500/10 border-green-500/30 text-green-600',
  anthropic: 'bg-orange-500/10 border-orange-500/30 text-orange-600',
  gemini: 'bg-blue-500/10 border-blue-500/30 text-blue-600',
  deepseek: 'bg-purple-500/10 border-purple-500/30 text-purple-600',
  ollama: 'bg-gray-500/10 border-gray-500/30 text-gray-600',
  groq: 'bg-red-500/10 border-red-500/30 text-red-600',
  mistral: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-600',
  chatgpt_pro: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600',
};

export const ParallelChatInterface: React.FC<ParallelChatInterfaceProps> = ({
  availableModels,
  generationConfig,
  systemPrompt,
  onClose,
  initialConversationId,
  onConversationChange,
}) => {
  const [selectedModels, setSelectedModels] = useState<ModelInfo[]>([]);
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
  
  // Drag & Drop state
  const [draggedResponse, setDraggedResponse] = useState<{turnId: string; responseIndex: number} | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{turnId: string; responseIndex: number} | null>(null);
  
  // Inline Edit state for user messages
  const [editingTurnId, setEditingTurnId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState('');
  
  // Custom context popup for smart regenerate
  const [smartRegeneratePopup, setSmartRegeneratePopup] = useState<{
    turnId: string;
    responseIndex: number;
    customContext: string;
  } | null>(null);
  
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
      enhancedPrompt
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
      enhancedPrompt
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
      enhancedPrompt
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
      enhancedPrompt
    );
  };

  const canSend = inputValue.trim() && selectedModels.length > 0 && !isLoading;

  // Check if there's anything to show in chat area
  const hasContent = conversationHistory.length > 0 || responses.length > 0;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={cn(
            "p-1.5 rounded",
            sharedHistoryMode ? "bg-green-500/20" : "bg-purple-500/20"
          )}>
            {sharedHistoryMode ? (
              <GitMerge size={18} className="text-green-500" />
            ) : (
              <Layers size={18} className="text-purple-500" />
            )}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {sharedHistoryMode ? 'Brainstorm Mode' : 'Parallel Model Comparison'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {sharedHistoryMode 
                ? 'Shared memory across all models'
                : 'Compare responses side-by-side'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Conversation selector dropdown */}
          <div className="relative" ref={conversationListRef}>
            <button
              onClick={() => {
                setShowConversationList(!showConversationList);
                if (!showConversationList) loadSavedConversations();
              }}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border"
              )}
              title="Load saved conversation"
            >
              <FolderOpen size={14} />
              <span className="max-w-[100px] truncate">{conversationTitle}</span>
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
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
              sharedHistoryMode 
                ? "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/50 shadow-sm shadow-green-500/20"
                : "bg-muted text-muted-foreground hover:bg-muted/80 border-border hover:border-green-500/30"
            )}
            title={sharedHistoryMode 
              ? "Shared memory ON: Models can see each other's responses" 
              : "Click to enable shared memory - models will see previous responses"}
          >
            {sharedHistoryMode ? <GitMerge size={14} /> : <GitBranch size={14} />}
            <span>{sharedHistoryMode ? '🧠 Shared ON' : '💡 Enable Shared Memory'}</span>
          </button>
          
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title="Close parallel chat"
            >
              <X size={18} className="text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Save status bar */}
      {(isSaving || saveError || supabaseConversationId) && (
        <div className={cn(
          "px-4 py-1.5 text-xs flex items-center gap-2 border-b",
          saveError ? "bg-destructive/10 border-destructive/20 text-destructive" : "bg-muted/50 border-border"
        )}>
          {isSaving && (
            <>
              <Loader2 size={12} className="animate-spin" />
              <span>Saving...</span>
            </>
          )}
          {saveError && (
            <>
              <AlertCircle size={12} />
              <span>{saveError}</span>
              <button 
                onClick={() => setSaveError(null)}
                className="ml-auto hover:text-foreground"
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

      {/* Main chat area - scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
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
                      <div className="bg-secondary dark:bg-[#2f2f2f] text-foreground rounded-2xl rounded-br-md px-4 py-2">
                        <p className="text-sm whitespace-pre-wrap break-words">{turn.userMessage}</p>
                      </div>
                    )}
                    
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <User size={16} className="text-primary-foreground" />
                    </div>
                  </div>
                </div>
                
                {/* Model responses - shown as a grid with interactive controls */}
                <div className="flex justify-start">
                  <div className="max-w-full w-full">
                    <div className={cn(
                      "grid gap-2",
                      turn.responses.length <= 2 ? "grid-cols-1 md:grid-cols-2" 
                        : turn.responses.length === 3 ? "grid-cols-1 md:grid-cols-3"
                        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
                    )}>
                      {turn.responses.map((resp, idx) => (
                        <div 
                          key={idx}
                          draggable
                          onDragStart={() => handleDragStart(turn.id, idx)}
                          onDragOver={(e) => handleDragOver(e, turn.id, idx)}
                          onDragLeave={handleDragLeave}
                          onDrop={() => handleDrop(turn.id, idx)}
                          onDragEnd={handleDragEnd}
                          className={cn(
                            "rounded-lg border px-3 py-2 group/resp relative transition-all max-h-[300px] overflow-hidden flex flex-col cursor-grab active:cursor-grabbing",
                            resp.enabled 
                              ? providerColors[resp.model.provider] || providerColors.ollama
                              : "bg-muted/30 border-border/50 opacity-60",
                            draggedResponse?.turnId === turn.id && draggedResponse?.responseIndex === idx && "opacity-50 scale-95",
                            dragOverTarget?.turnId === turn.id && dragOverTarget?.responseIndex === idx && "ring-2 ring-primary ring-offset-2",
                          )}
                        >
                          {/* Drag handle & position controls */}
                          <div className="absolute left-1 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover/resp:opacity-100 transition-opacity">
                            <GripVertical size={10} className="text-muted-foreground cursor-grab" />
                            {idx > 0 && (
                              <button
                                onClick={() => moveResponseUp(turn.id, idx)}
                                className="p-0.5 rounded hover:bg-background/50 text-muted-foreground hover:text-foreground"
                                title="Move left"
                              >
                                <ArrowUp size={10} className="rotate-[-90deg]" />
                              </button>
                            )}
                            {idx < turn.responses.length - 1 && (
                              <button
                                onClick={() => moveResponseDown(turn.id, idx)}
                                className="p-0.5 rounded hover:bg-background/50 text-muted-foreground hover:text-foreground"
                                title="Move right"
                              >
                                <ArrowDown size={10} className="rotate-[-90deg]" />
                              </button>
                            )}
                          </div>
                          
                          {/* Response header with model name and action buttons */}
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-xs font-medium flex items-center gap-1">
                              <Bot size={12} />
                              <span className={cn(!resp.enabled && "line-through")}>{resp.model.display_name}</span>
                              {!resp.enabled && (
                                <span className="text-[10px] text-muted-foreground ml-1">(hidden)</span>
                              )}
                            </div>
                            
                            {/* Action buttons - visible on hover */}
                            <div className="flex items-center gap-0.5 opacity-0 group-hover/resp:opacity-100 transition-opacity">
                              {/* Copy button */}
                              <button
                                onClick={() => copyResponse(resp.content)}
                                className="p-1 rounded hover:bg-background/50 text-muted-foreground hover:text-foreground transition-colors"
                                title="Copy response"
                              >
                                <Copy size={12} />
                              </button>
                              
                              {/* Toggle visibility button */}
                              <button
                                onClick={() => toggleResponseEnabled(turn.id, idx)}
                                className={cn(
                                  "p-1 rounded transition-colors",
                                  resp.enabled 
                                    ? "hover:bg-background/50 text-muted-foreground hover:text-foreground"
                                    : "hover:bg-green-500/20 text-green-500"
                                )}
                                title={resp.enabled ? "Hide from context" : "Include in context"}
                              >
                                {resp.enabled ? <EyeOff size={12} /> : <Eye size={12} />}
                              </button>
                              
                              {/* Simple Regenerate button */}
                              <button
                                onClick={() => regenerateResponse(turn.id, idx)}
                                className="p-1 rounded hover:bg-blue-500/20 text-muted-foreground hover:text-blue-500 transition-colors"
                                title="Regenerate (uses context before this turn)"
                                disabled={isLoading}
                              >
                                <RefreshCw size={12} />
                              </button>
                              
                              {/* Smart Regenerate - uses ALL enabled responses */}
                              <div className="relative">
                                <button
                                  onClick={() => openSmartRegeneratePopup(turn.id, idx)}
                                  className="p-1 rounded hover:bg-purple-500/20 text-muted-foreground hover:text-purple-500 transition-colors"
                                  title="✨ Smart regenerate (uses ALL enabled responses as context)"
                                  disabled={isLoading}
                                >
                                  <Sparkles size={12} />
                                </button>
                                
                                {/* Smart Regenerate Popup */}
                                {smartRegeneratePopup?.turnId === turn.id && smartRegeneratePopup?.responseIndex === idx && (
                                  <div 
                                    data-smart-regenerate-popup
                                    className="absolute right-0 top-full mt-1 w-72 bg-popover text-popover-foreground border border-border rounded-lg shadow-xl z-50 p-3"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-medium flex items-center gap-1">
                                        <Sparkles size={12} className="text-purple-500" />
                                        Smart Regenerate
                                      </span>
                                      <button 
                                        onClick={() => setSmartRegeneratePopup(null)}
                                        className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mb-2">
                                      Add custom instructions (optional). All enabled responses will be used as context.
                                    </p>
                                    <textarea
                                      value={smartRegeneratePopup.customContext}
                                      onChange={(e) => setSmartRegeneratePopup(prev => prev ? {...prev, customContext: e.target.value} : null)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') setSmartRegeneratePopup(null);
                                        if (e.key === 'Enter' && e.ctrlKey) executeSmartRegenerate(smartRegeneratePopup.customContext);
                                      }}
                                      placeholder="e.g. Focus more on technical details, be more concise..."
                                      className="w-full text-xs bg-secondary border border-border rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                                      rows={3}
                                      autoFocus
                                    />
                                    <div className="flex items-center justify-end gap-2 mt-2">
                                      <button
                                        onClick={() => setSmartRegeneratePopup(null)}
                                        className="px-2 py-1 text-xs rounded bg-muted hover:bg-muted/80 text-muted-foreground"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => executeSmartRegenerate(smartRegeneratePopup.customContext)}
                                        className="px-2 py-1 text-xs rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-500 flex items-center gap-1"
                                        disabled={isLoading}
                                      >
                                        <Sparkles size={10} />
                                        {smartRegeneratePopup.customContext?.trim() ? 'Regenerate' : 'Quick Regenerate'}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              {/* Delete response button */}
                              <button
                                onClick={() => deleteResponse(turn.id, idx)}
                                className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                                title="Delete this response"
                              >
                                <Trash2 size={12} />
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
                          
                          {/* Response content - scrollable */}
                          <div className={cn(
                            "text-sm whitespace-pre-wrap break-words flex-1 overflow-y-auto min-h-0",
                            resp.enabled ? "text-foreground" : "text-muted-foreground"
                          )}>
                            {resp.content}
                          </div>
                          
                          {/* Meta info footer - always at bottom */}
                          {resp.meta && (
                            <div className="flex items-center gap-2 mt-2 pt-1 border-t border-border/30 text-[10px] text-muted-foreground flex-shrink-0">
                              {resp.meta.tokens_out !== undefined && (
                                <span className="text-green-500">↓{resp.meta.tokens_out}</span>
                              )}
                              {resp.meta.thought_tokens !== undefined && resp.meta.thought_tokens > 0 && (
                                <span className="text-purple-500">🧠{resp.meta.thought_tokens}</span>
                              )}
                              {resp.meta.estimated_cost !== undefined && resp.meta.estimated_cost !== null && (
                                <span className="text-yellow-500">${resp.meta.estimated_cost.toFixed(4)}</span>
                              )}
                              {resp.meta.total_latency !== undefined && (
                                <span>{resp.meta.total_latency.toFixed(1)}s</span>
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
                    <div className="bg-secondary dark:bg-[#2f2f2f] text-foreground rounded-2xl rounded-br-md px-4 py-2">
                      <p className="text-sm whitespace-pre-wrap break-words">{currentUserMessage}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <User size={16} className="text-primary-foreground" />
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

      {/* Input area - ChatGPT style */}
      <div className="border-t border-border bg-background p-4 flex-shrink-0 space-y-3">
        {/* Model selector */}
        <ModelMultiSelector
          availableModels={availableModels}
          selectedModels={selectedModels}
          onSelectionChange={setSelectedModels}
          maxSelections={4}
          disabled={isLoading}
        />

        {/* Input form - ChatGPT style */}
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex items-end gap-2 bg-secondary dark:bg-[#2f2f2f] rounded-2xl border border-border p-2">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedModels.length === 0
                  ? "Select at least one model to start..."
                  : `Send to ${selectedModels.length} model${selectedModels.length > 1 ? 's' : ''}...`
              }
              className={cn(
                "flex-1 px-3 py-2 resize-none bg-transparent text-foreground placeholder:text-muted-foreground",
                "focus:outline-none border-0",
              )}
              rows={1}
              style={{ minHeight: '40px', maxHeight: '120px' }}
              disabled={selectedModels.length === 0 || isLoading}
            />

            <div className="flex items-center gap-1">
              {conversationHistory.length > 0 && !isLoading && (
                <Button
                  type="button"
                  onClick={handleNewComparison}
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 rounded-full"
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
                  className="h-9 w-9 p-0 rounded-full bg-destructive/10 hover:bg-destructive/20 text-destructive"
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
                    "h-9 w-9 p-0 rounded-full transition-colors",
                    canSend 
                      ? "bg-purple-600 hover:bg-purple-700 text-white" 
                      : "text-muted-foreground"
                  )}
                >
                  <Send size={18} />
                </Button>
              )}
            </div>
          </div>
        </form>

        {/* Status bar */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            {selectedModels.length > 0 && (
              <span className="flex items-center gap-1">
                <Layers size={12} />
                {selectedModels.length} model{selectedModels.length > 1 ? 's' : ''}
              </span>
            )}
            {/* Context stats */}
            {conversationHistory.length > 0 && (() => {
              const totalResponses = conversationHistory.reduce((acc, t) => acc + t.responses.length, 0);
              const enabledResponses = conversationHistory.reduce((acc, t) => acc + t.responses.filter(r => r.enabled).length, 0);
              return (
                <span className="flex items-center gap-1">
                  <Eye size={12} className={enabledResponses > 0 ? "text-green-500" : ""} />
                  <span className={enabledResponses > 0 ? "text-green-500" : ""}>
                    {enabledResponses}/{totalResponses} in context
                  </span>
                </span>
              );
            })()}
            {isLoading && (
              <span className="flex items-center gap-1 text-purple-500">
                <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
                Generating...
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {sharedHistoryMode && (
              <span className="flex items-center gap-1 text-green-500">
                <GitMerge size={12} />
                Shared context
              </span>
            )}
            {responses.length > 0 && isLoading && (
              <span>
                {responses.filter(r => !r.isStreaming && r.content).length}/{responses.length} complete
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParallelChatInterface;
