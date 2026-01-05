import React, { useState } from 'react';
import { MessageSquare, Plus, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react';

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface ConversationHistoryProps {
  conversations: Conversation[];
  currentConversationId: string;
  onNewConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
  onRenameConversation: (conversationId: string, newTitle: string) => void;
  onDeleteConversation: (conversationId: string) => void;
}

export const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  conversations,
  currentConversationId,
  onNewConversation,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [showDropdown, setShowDropdown] = useState<string | null>(null);

  const handleStartEdit = (conversation: Conversation) => {
    setEditingId(conversation.id);
    setEditingTitle(conversation.title);
    setShowDropdown(null);
  };

  const handleSaveEdit = () => {
    if (editingId && editingTitle.trim()) {
      onRenameConversation(editingId, editingTitle.trim());
    }
    setEditingId(null);
    setEditingTitle('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingTitle('');
  };

  const handleDelete = (conversationId: string) => {
    onDeleteConversation(conversationId);
    setShowDropdown(null);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) { // Within a week
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="w-[75vw] max-w-[320px] sm:w-64 md:w-72 lg:w-80 h-full bg-background border-r border-border flex flex-col rounded-r-2xl shadow-lg sm:rounded-none sm:shadow-none">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            Conversations
          </h2>
          <button
            onClick={onNewConversation}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
            title="New Conversation"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1 p-2">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`group relative flex items-center p-3 rounded-lg cursor-pointer transition-colors ${
                conversation.id === currentConversationId
                  ? 'bg-primary/10 border-l-2 border-primary'
                  : 'hover:bg-secondary'
              }`}
            >
              <div
                className="flex-1 min-w-0"
                onClick={() => onSelectConversation(conversation.id)}
              >
                <div className="flex items-center space-x-2">
                  <MessageSquare size={16} className="text-muted-foreground flex-shrink-0" />
                  {editingId === conversation.id ? (
                    <div className="flex-1 flex items-center space-x-2">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                        className="flex-1 px-2 py-1 text-sm bg-background border border-border rounded text-foreground"
                        autoFocus
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveEdit();
                        }}
                        className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                      >
                        ✓
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelEdit();
                        }}
                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {conversation.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatTime(conversation.updatedAt)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {editingId !== conversation.id && (
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDropdown(showDropdown === conversation.id ? null : conversation.id);
                    }}
                    className="p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreHorizontal size={14} />
                  </button>

                  {showDropdown === conversation.id && (
                    <div className="absolute right-0 top-8 z-50 w-32 bg-popover rounded-md shadow-lg border border-border py-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(conversation);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-popover-foreground hover:bg-accent flex items-center space-x-2"
                      >
                        <Pencil size={14} />
                        <span>Rename</span>
                      </button>
                      {conversations.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Are you sure you want to delete this conversation?')) {
                              handleDelete(conversation.id);
                            }
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-accent flex items-center space-x-2"
                        >
                          <Trash2 size={14} />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {conversations.length === 0 && (
            <div className="text-center py-8">
              <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">No conversations yet</p>
              <button
                onClick={onNewConversation}
                className="mt-2 text-primary text-sm hover:underline"
              >
                Start your first conversation
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
