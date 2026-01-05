import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Square, Bot, Layers, X, GitMerge, GitBranch, User, Trash2, Eye, EyeOff, RefreshCw, Copy, FolderOpen, ChevronDown, Plus, Check, AlertCircle, Loader2 } from 'lucide-react';
import { ModelInfo, GenerationConfig, Message } from '../types';
import { Button } from './ui/button';
import { ModelMultiSelector } from './ModelMultiSelector';
import { ParallelResponseView } from './ParallelResponseView';
import { useParallelChat } from '../hooks/useParallelChat';
import { cn } from '../lib/utils';
import { parallelAPI, ParallelConversation, ParallelTurn } from '../services/parallelConversationsAPI';

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
    meta?: {
      tokens_in?: number;
      tokens_out?: number;
      thought_tokens?: number;
      estimated_cost?: number;
      total_latency?: number;
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
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const conversationListRef = useRef<HTMLDivElement>(null);

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

  const canSend = inputValue.trim() && selectedModels.length > 0 && !isLoading;

  // Check if there's anything to show in chat area
  const hasContent = conversationHistory.length > 0 || responses.length > 0;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card flex-shrink-0">
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
                "bg-muted text-muted-foreground hover:bg-muted/80 border border-border"
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
              <div className="absolute right-0 top-full mt-1 w-72 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-80 overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-2 border-b border-border">
                  <span className="text-xs font-medium text-muted-foreground">Saved Conversations</span>
                  <button
                    onClick={handleNewComparison}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-muted text-primary"
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
                          "flex items-center justify-between px-3 py-2 hover:bg-muted/50 cursor-pointer group",
                          conv.id === supabaseConversationId && "bg-muted"
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
            {conversationHistory.map((turn) => (
              <div key={turn.id} className="space-y-3 group/turn">
                {/* User message bubble with delete button */}
                <div className="flex justify-end">
                  <div className="flex items-start gap-2 max-w-[80%] relative group/user">
                    {/* Delete turn button */}
                    <button
                      onClick={() => deleteTurn(turn.id)}
                      className="opacity-0 group-hover/user:opacity-100 transition-opacity p-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive absolute -left-10 top-1"
                      title="Delete this turn"
                    >
                      <Trash2 size={14} />
                    </button>
                    <div className="bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2">
                      <p className="text-sm whitespace-pre-wrap break-words">{turn.userMessage}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                      <User size={16} className="text-white" />
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
                          className={cn(
                            "rounded-lg border px-3 py-2 group/resp relative transition-all max-h-[300px] overflow-hidden flex flex-col",
                            resp.enabled 
                              ? providerColors[resp.model.provider] || providerColors.ollama
                              : "bg-muted/30 border-border/50 opacity-60",
                          )}
                        >
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
                              
                              {/* Regenerate button */}
                              <button
                                onClick={() => regenerateResponse(turn.id, idx)}
                                className="p-1 rounded hover:bg-blue-500/20 text-muted-foreground hover:text-blue-500 transition-colors"
                                title="Regenerate this response"
                                disabled={isLoading}
                              >
                                <RefreshCw size={12} />
                              </button>
                              
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
                {/* Current user message */}
                <div className="flex justify-end">
                  <div className="flex items-start gap-2 max-w-[80%]">
                    <div className="bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2">
                      <p className="text-sm whitespace-pre-wrap break-words">{currentUserMessage}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                      <User size={16} className="text-white" />
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

      {/* Input area */}
      <div className="border-t border-border bg-card p-4 flex-shrink-0 space-y-3">
        {/* Model selector */}
        <ModelMultiSelector
          availableModels={availableModels}
          selectedModels={selectedModels}
          onSelectionChange={setSelectedModels}
          maxSelections={4}
          disabled={isLoading}
        />

        {/* Input form */}
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="flex-1 relative">
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
                "w-full px-4 py-3 border rounded-lg resize-none",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring",
                "bg-background text-foreground placeholder:text-muted-foreground",
                "border-border",
                selectedModels.length > 0 && "border-purple-500/30"
              )}
              rows={1}
              style={{ minHeight: '48px', maxHeight: '120px' }}
              disabled={selectedModels.length === 0 || isLoading}
            />
          </div>

          <div className="flex gap-2">
            {conversationHistory.length > 0 && !isLoading && (
              <Button
                type="button"
                onClick={handleNewComparison}
                variant="outline"
                title="New conversation"
              >
                <Plus size={18} />
              </Button>
            )}
            
            {isLoading ? (
              <Button
                type="button"
                onClick={cancelAll}
                variant="destructive"
                className="px-6"
              >
                <Square size={18} />
                <span className="ml-2">Stop</span>
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={!canSend}
                className={cn(
                  "px-6",
                  canSend && "bg-purple-600 hover:bg-purple-700"
                )}
              >
                <Send size={18} />
              </Button>
            )}
          </div>
        </form>

        {/* Status bar */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {selectedModels.length > 0 && (
              <span className="flex items-center gap-1">
                <Layers size={12} />
                {selectedModels.length} model{selectedModels.length > 1 ? 's' : ''}
              </span>
            )}
            {isLoading && (
              <span className="flex items-center gap-1 text-purple-500">
                <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
                Generating...
              </span>
            )}
          </div>
          <div>
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
