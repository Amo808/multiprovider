import React, { useState, useEffect } from 'react';
import { History, Trash2, Search, Calendar, MessageSquare } from 'lucide-react';
import { apiClient } from '../services/api';

interface HistoryManagerProps {
  onClose: () => void;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  provider?: string;
  model?: string;
}

export const HistoryManager: React.FC<HistoryManagerProps> = ({ onClose }) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      // Use getHistory instead of getSessions for now
      const data = await apiClient.getHistory();
      // Transform data to match our interface
      const transformedSessions = data.map((message: any, index: number) => ({
        id: message.conversation_id || `session-${index}`,
        title: `Chat ${index + 1}`,
        createdAt: message.timestamp || new Date().toISOString(),
        updatedAt: message.timestamp || new Date().toISOString(),
        messageCount: 1,
        provider: message.provider,
        model: message.model
      }));
      setSessions(transformedSessions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chat history');
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this chat session?')) {
      return;
    }

    try {
      // Use clearHistory for specific conversation for now
      await apiClient.clearHistory(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete session');
    }
  };

  const clearAllHistory = async () => {
    if (!confirm('Are you sure you want to delete ALL chat history? This cannot be undone.')) {
      return;
    }

    try {
      await apiClient.clearHistory();
      setSessions([]);
      alert('All chat history cleared successfully');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to clear history');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffHours < 48) return 'Yesterday';
    return date.toLocaleDateString();
  };

  const filteredSessions = sessions.filter(session =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    session.provider?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    session.model?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    loadSessions();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-3">
            <History className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Chat History
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Manage your chat sessions and conversation history
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={clearAllHistory}
              className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <Trash2 size={16} />
              <span>Clear All</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to Chat
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <MessageSquare className="w-6 h-6 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Sessions</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">{sessions.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <Calendar className="w-6 h-6 text-green-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">This Week</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">
                  {sessions.filter(s => {
                    const weekAgo = new Date();
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    return new Date(s.updatedAt) > weekAgo;
                  }).length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <MessageSquare className="w-6 h-6 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Messages</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">
                  {sessions.reduce((sum, s) => sum + (s.messageCount || 0), 0)}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <Search className="w-6 h-6 text-orange-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Filtered</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">{filteredSessions.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Sessions List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
              <button
                onClick={loadSessions}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                {searchQuery ? 'No conversations match your search' : 'No chat history found'}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-blue-600 hover:text-blue-700 underline"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredSessions.map((session) => (
                <div key={session.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                          {session.title || `Chat ${session.id.slice(0, 8)}`}
                        </h3>
                        {session.provider && (
                          <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                            {session.provider}
                          </span>
                        )}
                        {session.model && (
                          <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                            {session.model}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                        <span>
                          <MessageSquare className="inline w-4 h-4 mr-1" />
                          {session.messageCount || 0} messages
                        </span>
                        <span>
                          <Calendar className="inline w-4 h-4 mr-1" />
                          {formatDate(session.updatedAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => deleteSession(session.id)}
                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Delete session"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
