import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, GitMerge, Layers, Loader2 } from 'lucide-react';
import { parallelAPI, ParallelConversation } from '../services/parallelConversationsAPI';

interface ParallelConversationHistoryProps {
  currentConversationId: string | null;
  onNewConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
  onConversationDeleted?: (conversationId: string) => void;
}

export const ParallelConversationHistory: React.FC<ParallelConversationHistoryProps> = ({
  currentConversationId,
  onNewConversation,
  onSelectConversation,
  onConversationDeleted
}) => {
  const [conversations, setConversations] = useState<ParallelConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await parallelAPI.listConversations(50, 0);
      setConversations(data);
    } catch (err) {
      console.error('Failed to load parallel conversations:', err);
      setError('Failed to load conversations');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Refresh when current conversation changes
  useEffect(() => {
    if (currentConversationId) {
      loadConversations();
    }
  }, [currentConversationId, loadConversations]);

  const handleDelete = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    if (!confirm('Delete this parallel conversation?')) return;
    
    try {
      await parallelAPI.deleteConversation(conversationId);
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      onConversationDeleted?.(conversationId);
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="w-[280px] sm:w-64 md:w-72 lg:w-80 h-full bg-background border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-purple-500" />
            <h2 className="text-lg font-semibold text-foreground">
              Parallel Chats
            </h2>
          </div>
          <button
            onClick={onNewConversation}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
            title="New Parallel Chat"
          >
            <Plus size={18} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Multi-model comparison sessions
        </p>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="animate-spin text-muted-foreground" size={24} />
          </div>
        ) : error ? (
          <div className="p-4 text-center">
            <p className="text-sm text-destructive mb-2">{error}</p>
            <button
              onClick={loadConversations}
              className="text-xs text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center">
            <Layers size={48} className="mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground mb-2">No parallel chats yet</p>
            <button
              onClick={onNewConversation}
              className="text-xs text-primary hover:underline"
            >
              Start a new comparison
            </button>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => onSelectConversation(conversation.id)}
                className={`group relative flex items-center p-3 rounded-lg cursor-pointer transition-colors ${
                  conversation.id === currentConversationId
                    ? 'bg-purple-500/10 border-l-2 border-purple-500'
                    : 'hover:bg-secondary'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {conversation.shared_history_mode ? (
                      <GitMerge size={14} className="text-green-500 flex-shrink-0" />
                    ) : (
                      <Layers size={14} className="text-purple-500 flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate text-foreground">
                      {conversation.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {formatTime(conversation.updated_at)}
                    </span>
                    {conversation.shared_history_mode && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">
                        Brainstorm
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Delete button */}
                <button
                  onClick={(e) => handleDelete(e, conversation.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all"
                  title="Delete conversation"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Footer with refresh */}
      <div className="p-2 border-t border-border">
        <button
          onClick={loadConversations}
          disabled={isLoading}
          className="w-full text-xs text-muted-foreground hover:text-foreground py-2 rounded hover:bg-secondary transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Loading...' : 'Refresh list'}
        </button>
      </div>
    </div>
  );
};

export default ParallelConversationHistory;
