import React, { useState } from 'react';
import { Eye, Download, X, Copy } from 'lucide-react';
import { Message, GenerationConfig } from '../types';

interface ContextViewerProps {
  messages: Message[];
  currentInput?: string;
  generationConfig: GenerationConfig;
  systemPrompt?: string; // Add system prompt prop
  className?: string;
}

export const ContextViewer: React.FC<ContextViewerProps> = ({
  messages,
  currentInput = '',
  generationConfig,
  systemPrompt = '',
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'api' | 'metadata' | 'full'>('api');

  // Build the context that would be sent to API
  const buildContext = () => {
    // Build the messages array as it would be sent to API
    const apiMessages = [];
    
    // Add system message - use actual systemPrompt or default
    apiMessages.push({
      role: 'system',
      content: systemPrompt || 'You are a helpful AI assistant.'
    });
    
    // Add conversation history
    messages.forEach(msg => {
      apiMessages.push({
        role: msg.role,
        content: msg.content
      });
    });
    
    // Add current input if provided
    if (currentInput.trim()) {
      apiMessages.push({
        role: 'user',
        content: currentInput.trim()
      });
    }

    const fullContext = {
      // What will be sent to the API
      apiRequest: {
        messages: apiMessages,
        model: 'current-selected-model',
        temperature: generationConfig.temperature,
        max_tokens: generationConfig.max_tokens,
        top_p: generationConfig.top_p,
        stream: generationConfig.stream
      },
      // Metadata for debugging
      metadata: {
        conversationMessages: messages.length,
        currentInputLength: currentInput.length,
        totalCharacters: messages.reduce((acc, msg) => acc + (msg.content?.length || 0), 0) + currentInput.length,
        estimatedTokens: Math.ceil((messages.reduce((acc, msg) => acc + (msg.content?.length || 0), 0) + currentInput.length) / 4),
        messageProviders: [...new Set(messages.filter(m => m.meta?.provider).map(m => m.meta!.provider))],
        timestamp: new Date().toISOString()
      },
      // Full conversation context for reference
      fullConversation: {
        messages: messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          provider: msg.meta?.provider,
          model: msg.meta?.model,
          tokens: msg.meta?.tokens_in || msg.meta?.tokens_out || null
        })),
        pendingInput: currentInput || null
      }
    };
    
    return fullContext;
  };

  const context = buildContext();
  const getContextForTab = () => {
    switch (activeTab) {
      case 'api':
        return context.apiRequest;
      case 'metadata':
        return context.metadata;
      case 'full':
        return context.fullConversation;
      default:
        return context.apiRequest;
    }
  };
  
  const contextJson = JSON.stringify(getContextForTab(), null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(contextJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy context:', error);
    }
  };

  const handleDownload = () => {
    const fullContext = {
      ...context,
      exportedAt: new Date().toISOString(),
      exportedTab: activeTab
    };
    const blob = new Blob([JSON.stringify(fullContext, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-context-${activeTab}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hasMessages = messages.length > 0 || currentInput.trim().length > 0;

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={!hasMessages}
        className={`p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        title="View request context"
      >
        <Eye size={18} />
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            {/* Overlay */}
            <div 
              className="fixed inset-0 transition-opacity bg-black bg-opacity-50"
              onClick={() => setIsOpen(false)}
            />

            {/* Modal Content */}
            <div className="relative inline-block w-full max-w-4xl p-6 my-8 text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-lg">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Request Context Preview
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    This is what will be sent with your next message
                  </p>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                  <div className="text-sm font-medium text-blue-600 dark:text-blue-400">
                    Messages
                  </div>
                  <div className="text-2xl font-bold text-blue-800 dark:text-blue-200">
                    {context.metadata.conversationMessages}
                  </div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                  <div className="text-sm font-medium text-green-600 dark:text-green-400">
                    Est. Tokens
                  </div>
                  <div className="text-2xl font-bold text-green-800 dark:text-green-200">
                    {context.metadata.estimatedTokens}
                  </div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
                  <div className="text-sm font-medium text-purple-600 dark:text-purple-400">
                    Characters
                  </div>
                  <div className="text-2xl font-bold text-purple-800 dark:text-purple-200">
                    {context.metadata.totalCharacters.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-2 mb-4">
                <button
                  onClick={handleCopy}
                  className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Copy size={16} />
                  <span>{copied ? 'Copied!' : 'Copy JSON'}</span>
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Download size={16} />
                  <span>Download</span>
                </button>
              </div>

              {/* Tabs */}
              <div className="flex space-x-1 mb-4 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                <button
                  onClick={() => setActiveTab('api')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'api'
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  API Request
                </button>
                <button
                  onClick={() => setActiveTab('metadata')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'metadata'
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  Metadata
                </button>
                <button
                  onClick={() => setActiveTab('full')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'full'
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  Full Context
                </button>
              </div>

              {/* Tab Description */}
              <div className="mb-3 text-sm text-gray-600 dark:text-gray-400">
                {activeTab === 'api' && '📡 Exact payload that will be sent to the AI API'}
                {activeTab === 'metadata' && '📊 Statistics and debugging information about the request'}
                {activeTab === 'full' && '💬 Complete conversation history with all metadata'}
              </div>

              {/* JSON Content */}
              <div className="relative">
                <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-auto max-h-96 text-sm font-mono text-gray-800 dark:text-gray-200">
                  {contextJson}
                </pre>
              </div>

              {/* Footer */}
              <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                💡 This preview shows the exact data that will be sent to the AI model with your next message
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
