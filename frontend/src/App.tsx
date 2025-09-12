import { useState, useEffect, useCallback, useMemo } from 'react';
import { Settings, Sun, Moon, Monitor, Menu, X } from 'lucide-react';
import { 
  ModelSelector, 
  ChatInterface, 
  GenerationSettings, 
  ProviderManager,
  UnlockModal,
  ConversationHistory,
  useConfig,
  useHealth,
  useConversations,
  ModelInfo,
  ModelProvider,
  GenerationConfig
} from './components';
import { useConversations as useApiConversations } from './hooks/useApi';
import { apiClient } from './services/api';

function App() {
  // State management
  const [selectedModel, setSelectedModel] = useState<ModelInfo | undefined>();
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider | undefined>();
  const [showProviderManager, setShowProviderManager] = useState(false);
  const [showGenerationSettings, setShowGenerationSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showHistory, setShowHistory] = useState(true); // Show history by default for Lobe Chat-like experience
  const [currentConversationId, setCurrentConversationId] = useState<string>('default');
  const [conversations, setConversations] = useState<Array<{id: string, title: string, updatedAt: string}>>([]);
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>(() => {
    // Load theme from localStorage or default to 'auto'
    try {
      const savedTheme = localStorage.getItem('theme');
      return (savedTheme as 'light' | 'dark' | 'auto') || 'auto';
    } catch {
      return 'auto';
    }
  });
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string>('');

  // API hooks
  const { config, loading: configLoading, error: configError, updateConfig, updateGenerationConfig } = useConfig();
  const { health } = useHealth();
  const { deleteConversation: deleteConversationMessages } = useConversations();
  const { deleteConversation: deleteConversationFromServer } = useApiConversations();

  // Initialize app
  useEffect(() => {
    // Apply theme
    const root = document.documentElement;
    console.log(`Applying theme: ${theme}`);
    
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      console.log(`Auto theme - system prefers dark: ${prefersDark}`);
      root.classList.toggle('dark', prefersDark);
    } else {
      const isDark = theme === 'dark';
      console.log(`Manual theme - applying dark: ${isDark}`);
      root.classList.toggle('dark', isDark);
    }
    
    console.log(`Root element classes: ${root.className}`);
    
    // Save theme to localStorage
    try {
      localStorage.setItem('theme', theme);
    } catch (error) {
      console.warn('Failed to save theme to localStorage:', error);
    }
  }, [theme]);

  // Load conversations from backend on app start
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const response = await fetch('/api/conversations');
        const data = await response.json();
        const { conversations: backendConversations } = data;
        
        if (backendConversations && backendConversations.length > 0) {
          // Transform backend data to frontend format
          const transformedConversations = backendConversations.map((conv: any) => ({
            id: conv.id,
            title: conv.title || 'Untitled Conversation',
            updatedAt: conv.updated_at || new Date().toISOString()
          }));
          setConversations(transformedConversations);
          
          // Set current conversation to the most recent one if default is empty
          const defaultConv = transformedConversations.find((c: any) => c.id === 'default');
          if (defaultConv) {
            setCurrentConversationId('default');
          } else if (transformedConversations.length > 0) {
            setCurrentConversationId(transformedConversations[0].id);
          }
        } else {
          // No conversations found, create a default one
          const defaultConversation = {
            id: 'default',
            title: 'New Conversation', 
            updatedAt: new Date().toISOString()
          };
          setConversations([defaultConversation]);
          setCurrentConversationId('default');
        }
      } catch (error) {
        console.warn('Failed to load conversations, using default:', error);
        // Fallback to default conversation
        const defaultConversation = {
          id: 'default',
          title: 'New Conversation', 
          updatedAt: new Date().toISOString()
        };
        setConversations([defaultConversation]);
        setCurrentConversationId('default');
      }
    };

    loadConversations();
  }, []); // Run once on app start

  // Set default model when config loads
  useEffect(() => {
    if (config && !selectedModel && !selectedProvider) {
      setSelectedProvider(config.activeProvider);
      const activeProviderConfig = config.providers[config.activeProvider];
      if (activeProviderConfig?.models?.length > 0) {
        const activeModelConfig = activeProviderConfig.models.find(m => m.id === config.activeModel);
        if (activeModelConfig) {
          setSelectedModel(activeModelConfig);
        }
      }
    }
  }, [config, selectedModel, selectedProvider]);

  // Debug logging for state changes
  useEffect(() => {
    console.log('State update - currentConversationId:', currentConversationId);
    console.log('State update - conversations:', conversations);
    console.log('State update - conversation exists:', conversations.some(conv => conv.id === currentConversationId));
  }, [currentConversationId, conversations]);

  // Debug config changes
  useEffect(() => {
    console.log('Config changed:', config);
    console.log('Config loading:', configLoading);
    console.log('Config error:', configError);
  }, [config, configLoading, configError]);

  // Handlers
  const handleModelChange = useCallback(async (model: ModelInfo) => {
    setSelectedModel(model);
    if (model.provider !== selectedProvider) {
      setSelectedProvider(model.provider);
    }
    
    // Update config without triggering full reload
    if (config) {
      try {
        await updateConfig({
          activeProvider: model.provider,
          activeModel: model.id
        });
      } catch (error) {
        console.error('Failed to update config:', error);
      }
    }
  }, [selectedProvider, config, updateConfig]);

  const handleProviderChange = useCallback(async (provider: ModelProvider) => {
    setSelectedProvider(provider);
    if (config) {
      try {
        await updateConfig({ activeProvider: provider });
      } catch (error) {
        console.error('Failed to update config:', error);
      }
    }
  }, [config, updateConfig]);

  const handleGenerationConfigChange = useCallback((newConfig: Partial<GenerationConfig>) => {
    // Update local config state immediately
    console.log('Generation config changed:', newConfig);
  }, []);

  const handleSaveGenerationSettings = async (settingsToSave: GenerationConfig) => {
    try {
      console.log('Saving generation settings:', settingsToSave);
      await updateGenerationConfig(settingsToSave);
      console.log('Generation settings saved successfully');
    } catch (error) {
      console.error('Failed to save generation settings:', error);
    }
  };

  // Handle API key missing error
  const handleApiKeyMissing = (message: string) => {
    console.log('App: API key missing callback called with message:', message);
    console.log('App: Current selectedProvider:', selectedProvider);
    console.log('App: Setting showUnlockModal to true');
    setPendingMessage(message);
    setShowUnlockModal(true);
    console.log('App: Modal state updated, showUnlockModal should be true');
  };

  // Handle successful API key input
  const handleUnlockSuccess = async (apiKey: string) => {
    console.log('App: handleUnlockSuccess called with provider:', selectedProvider);
    if (selectedProvider) {
      try {
        console.log('App: Calling updateProviderConfig...');
        await apiClient.updateProviderConfig(selectedProvider, { api_key: apiKey });
        console.log('App: API key updated successfully');
        
        setShowUnlockModal(false);
        console.log('App: Modal closed');
        
        // Refresh config to get updated provider status
        console.log('App: Refreshing page...');
        window.location.reload(); // Simple refresh for now
        
        // TODO: Re-send pending message
        console.log('API key saved, pending message:', pendingMessage);
        setPendingMessage('');
      } catch (error) {
        console.error('App: Failed to save API key:', error);
        // Show error to user instead of just throwing
        alert(`Failed to save API key: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error; // Let UnlockModal handle the error display
      }
    } else {
      console.error('App: No selectedProvider available!');
      alert('No provider selected');
    }
  };

  const handleUnlockCancel = () => {
    setShowUnlockModal(false);
    setPendingMessage('');
  };

  const toggleTheme = () => {
    const themes: Array<'light' | 'dark' | 'auto'> = ['light', 'dark', 'auto'];
    const currentIndex = themes.indexOf(theme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    console.log(`Theme changing from ${theme} to ${nextTheme}`);
    setTheme(nextTheme);
  };

  // Conversation handlers
  const handleNewConversation = async () => {
    const newId = `conv_${Date.now()}`;
    const newConversation = {
      id: newId,
      title: 'New Conversation',
      updatedAt: new Date().toISOString()
    };
    
    try {
      // Create conversation in backend
      await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newId,
          title: 'New Conversation'
        })
      });
      
      // Update local state
      setConversations(prev => [newConversation, ...prev]);
      setCurrentConversationId(newId);
    } catch (error) {
      console.error('Failed to create conversation:', error);
      // Still update local state for offline functionality
      setConversations(prev => [newConversation, ...prev]);
      setCurrentConversationId(newId);
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    setCurrentConversationId(conversationId);
  };

  const handleRenameConversation = async (conversationId: string, newTitle: string) => {
    try {
      // Update in backend
      await fetch(`/api/conversations/${conversationId}/title`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      });
      
      // Update local state
      setConversations(prev => 
        prev.map(conv => 
          conv.id === conversationId 
            ? { ...conv, title: newTitle, updatedAt: new Date().toISOString() }
            : conv
        )
      );
    } catch (error) {
      console.error('Failed to update conversation title:', error);
      // Still update local state for offline functionality  
      setConversations(prev => 
        prev.map(conv => 
          conv.id === conversationId 
            ? { ...conv, title: newTitle, updatedAt: new Date().toISOString() }
            : conv
        )
      );
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    if (conversations.length <= 1) return; // Keep at least one conversation
    
    try {
      console.log('Deleting conversation:', conversationId);
      console.log('Current conversations:', conversations);
      console.log('Current conversation ID:', currentConversationId);
      
      // Delete conversation on server first
      await deleteConversationFromServer(conversationId);
      
      // Calculate remaining conversations after deletion
      const remaining = conversations.filter(conv => conv.id !== conversationId);
      console.log('Remaining conversations after deletion:', remaining);
      
      // If we're deleting the current conversation, switch to another one first
      if (currentConversationId === conversationId) {
        if (remaining.length > 0) {
          console.log('Switching to conversation:', remaining[0].id);
          setCurrentConversationId(remaining[0].id);
          // Update conversations state after switching conversation
          setConversations(remaining);
        } else {
          // If no conversations left, create a new one
          console.log('No conversations left, creating new one');
          const newId = `conv_${Date.now()}`;
          const newConversation = {
            id: newId,
            title: 'New Conversation',
            updatedAt: new Date().toISOString()
          };
          
          try {
            // Create conversation in backend
            await fetch('/api/conversations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: newId,
                title: 'New Conversation'
              })
            });
          } catch (error) {
            console.error('Failed to create new conversation:', error);
          }
          
          // Switch to new conversation and update state atomically
          setCurrentConversationId(newId);
          setConversations([newConversation]);
        }
      } else {
        // Just update conversations state if not deleting current conversation
        setConversations(remaining);
      }
      
      // Delete conversation messages from local cache as well
      deleteConversationMessages(conversationId);
      
      console.log('Conversation deletion completed');
      
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      // Optionally show error to user
    }
  };

  // Update conversation title when first message is sent
  const handleUpdateConversationTitle = async (conversationId: string, message: string) => {
    const conversation = conversations.find(conv => conv.id === conversationId);
    if (conversation && conversation.title === 'New Conversation') {
      // Generate title from first message (first 50 characters)
      const newTitle = message.length > 50 ? message.substring(0, 50) + '...' : message;
      
      try {
        // Update in backend
        await fetch(`/api/conversations/${conversationId}/title`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle })
        });
      } catch (error) {
        console.error('Failed to update conversation title in backend:', error);
      }
      
      // Update local state
      setConversations(prev => 
        prev.map(conv => 
          conv.id === conversationId 
            ? { ...conv, title: newTitle, updatedAt: new Date().toISOString() }
            : conv
        )
      );
    } else if (conversation) {
      // Just update the timestamp locally 
      setConversations(prev => 
        prev.map(conv => 
          conv.id === conversationId 
            ? { ...conv, updatedAt: new Date().toISOString() }
            : conv
        )
      );
    }
  };

  const toggleHistorySidebar = () => {
    setShowHistory(!showHistory);
  };

  const getThemeIcon = () => {
    switch (theme) {
      case 'light': return <Sun size={16} />;
      case 'dark': return <Moon size={16} />;
      default: return <Monitor size={16} />;
    }
  };

  if (configLoading || !config) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          {configError ? (
            <>
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
              <p className="text-red-600 dark:text-red-400 mb-2">Failed to load configuration</p>
              <p className="text-gray-600 dark:text-gray-400 text-sm">{configError}</p>
            </>
          ) : (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Loading configuration...</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 lg:hidden"
            >
              {showSidebar ? <X size={20} /> : <Menu size={20} />}
            </button>
            <button
              onClick={toggleHistorySidebar}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors hidden lg:block"
              title="Toggle conversation history"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">AI</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Multi-Provider Chat
              </h1>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center space-x-3">
            {/* Health Status */}
            {health && (
              <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                health.status === 'healthy' 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
              }`}>
                {health.status}
              </div>
            )}

            {/* Model Selector */}
            <div className="hidden sm:block min-w-[300px]">
              <ModelSelector
                selectedModel={selectedModel}
                selectedProvider={selectedProvider}
                onModelChange={handleModelChange}
                onProviderChange={handleProviderChange}
                onManageProviders={() => setShowProviderManager(true)}
              />
            </div>

            {/* Generation Settings */}
            <GenerationSettings
              config={config.generation}
              currentProvider={selectedProvider}
              onConfigChange={handleGenerationConfigChange}
              onSave={handleSaveGenerationSettings}
              isOpen={showGenerationSettings}
              onToggle={() => setShowGenerationSettings(!showGenerationSettings)}
            />

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={`Theme: ${theme}`}
            >
              {getThemeIcon()}
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowProviderManager(true)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Manage Providers"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>

        {/* Mobile Model Selector */}
        <div className="sm:hidden mt-3">
          <ModelSelector
            selectedModel={selectedModel}
            selectedProvider={selectedProvider}
            onModelChange={handleModelChange}
            onProviderChange={handleProviderChange}
            onManageProviders={() => setShowProviderManager(true)}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex min-h-0 overflow-hidden">
        {/* Conversation History Sidebar - Desktop */}
        {showHistory && (
          <div className="hidden lg:block">
            <ConversationHistory
              conversations={conversations}
              currentConversationId={currentConversationId}
              onNewConversation={handleNewConversation}
              onSelectConversation={handleSelectConversation}
              onRenameConversation={handleRenameConversation}
              onDeleteConversation={handleDeleteConversation}
            />
          </div>
        )}

        {/* Sidebar - Mobile */}
        {showSidebar && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowSidebar(false)} />
            <div className="relative w-80 h-full bg-white dark:bg-gray-800 overflow-hidden flex flex-col">
              {/* Mobile Conversation History */}
              <div className="flex-1 overflow-y-auto">
                <ConversationHistory
                  conversations={conversations}
                  currentConversationId={currentConversationId}
                  onNewConversation={handleNewConversation}
                  onSelectConversation={(id: string) => {
                    handleSelectConversation(id);
                    setShowSidebar(false);
                  }}
                  onRenameConversation={handleRenameConversation}
                  onDeleteConversation={handleDeleteConversation}
                />
              </div>
              
              {/* Mobile Quick Actions */}
              <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setShowProviderManager(true);
                      setShowSidebar(false);
                    }}
                    className="w-full text-left px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                  >
                    Manage Providers
                  </button>
                  <button
                    onClick={() => {
                      setShowGenerationSettings(true);
                      setShowSidebar(false);
                    }}
                    className="w-full text-left px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                  >
                    Generation Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Chat Interface */}
        <div className="flex-1 flex flex-col min-h-0">
          {currentConversationId && conversations.some(conv => conv.id === currentConversationId) ? (
            <ChatInterface
              selectedModel={selectedModel}
              selectedProvider={selectedProvider}
              generationConfig={config.generation}
              onApiKeyMissing={handleApiKeyMissing}
              conversationId={currentConversationId}
              onMessageSent={handleUpdateConversationTitle}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Loading conversation...</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Provider Manager Modal */}
      {showProviderManager && (
        <div className="fixed inset-0 z-50">
          <ProviderManager onClose={() => setShowProviderManager(false)} />
        </div>
      )}

      {/* Unlock Modal */}
      {(() => {
        console.log('App render: showUnlockModal =', showUnlockModal, 'selectedProvider =', selectedProvider);
        return showUnlockModal && selectedProvider && (
          <UnlockModal
            isOpen={showUnlockModal}
            provider={selectedProvider}
            onClose={handleUnlockCancel}
            onSubmit={handleUnlockSuccess}
          />
        );
      })()}
    </div>
  );
}

export default App;