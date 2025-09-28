import { useState, useEffect, useCallback } from 'react';
import { Settings, Sun, Moon, Monitor, Menu, X } from 'lucide-react';
import { 
  ModelSelector, 
  ChatInterface, 
  GenerationSettings, 
  ProviderManager,
  UnlockModal,
  LoginModal,
  ConversationHistory,
  useConfig,
  useHealth,
  useConversations,
  ModelInfo,
  ModelProvider,
  GenerationConfig
} from './components';
import { apiClient } from './services/api';

function App() {
  // ========================= State Management =========================
  const [selectedModel, setSelectedModel] = useState<ModelInfo | undefined>();
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider | undefined>();
  const [showProviderManager, setShowProviderManager] = useState(false);
  const [showGenerationSettings, setShowGenerationSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Helper to get auth headers (avoid TypeScript private access)
  const getAuthHeaders = () => {
    // @ts-ignore accessing internal for convenience
    return apiClient['getHeaders'] ? (apiClient as any).getHeaders() : {};
  };

  // ========================= Hooks =========================
  const { config, loading: configLoading, error: configError, updateConfig, updateGenerationConfig, fetchConfig } = useConfig({ skipInitialFetch: true });
  const { health } = useHealth();
  const { deleteConversation: deleteConversationMessages } = useConversations();

  // ========================= Auth Restore =========================
  useEffect(() => {
    apiClient.setUnauthorizedCallback(() => {
      console.log('Global 401 handler: logging out user');
      setIsAuthenticated(false);
      setUserEmail(null);
      localStorage.removeItem('jwt_token');
    });

    try {
      const jwt = localStorage.getItem('jwt_token');
      console.log('Auth restore: token present?', !!jwt);
      if (jwt) {
        apiClient.setAuthHeadersProvider(() => ({ Authorization: `Bearer ${jwt}` }));
        setIsAuthenticated(true);
        // fetch user email first to verify token
        fetch('/auth/me', { headers: { Authorization: `Bearer ${jwt}` }} )
          .then(r => {
            if (!r.ok) throw new Error('me failed');
            return r.json();
          })
          .then(d => {
            setUserEmail(d?.email || null);
            // only fetch config after confirming token works
            fetchConfig();
          })
          .catch(err => {
            console.log('Auth restore /auth/me failed, clearing token', err);
            localStorage.removeItem('jwt_token');
            setIsAuthenticated(false);
          });
      }
    } catch { /* ignore */ }
  }, [fetchConfig]);

  // ========================= Theme Handling =========================
  useEffect(() => {
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

  // ========================= Load Conversations =========================
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const response = await fetch('/api/conversations', { headers: getAuthHeaders() });
        // Fallback: if 401, show login modal
        if (response.status === 401) {
          setIsAuthenticated(false);
          return;
        }
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

    if (isAuthenticated && conversations.length === 0) {
      loadConversations();
    }
  }, [isAuthenticated, conversations.length]); // Run once on app start

  // ========================= Initial Model Selection =========================
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

  // ========================= Debugging =========================
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

  // ========================= Handlers =========================
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
        console.log('App: Refreshing configuration...');
        // Instead of reloading the page, refetch the config
        try {
          await apiClient.getConfig();
          console.log('App: Config refreshed successfully');
        } catch (error) {
          console.error('App: Failed to refresh config:', error);
        }
        
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

  // ========================= Conversation Handlers =========================
  const handleNewConversation = async () => {
    const newId = `conv_${Date.now()}`;
    const newConversation = {
      id: newId,
      title: 'New Conversation',
      updatedAt: new Date().toISOString()
    };
    
    try {
      await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          id: newId,
          title: 'New Conversation'
        })
      });
      
      setConversations(prev => [newConversation, ...prev]);
      setCurrentConversationId(newId);
    } catch (error) {
      console.error('Failed to create conversation:', error);
      setConversations(prev => [newConversation, ...prev]);
      setCurrentConversationId(newId);
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    setCurrentConversationId(conversationId);
  };

  const handleRenameConversation = async (conversationId: string, newTitle: string) => {
    try {
      await fetch(`/api/conversations/${conversationId}/title`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ title: newTitle })
      });
      
      setConversations(prev => 
        prev.map(conv => 
          conv.id === conversationId 
            ? { ...conv, title: newTitle, updatedAt: new Date().toISOString() }
            : conv
        )
      );
    } catch (error) {
      console.error('Failed to update conversation title:', error);
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
    if (conversations.length <= 1) return; 
    
    try {
      console.log('Deleting conversation:', conversationId);
      console.log('Current conversations:', conversations);
      console.log('Current conversation ID:', currentConversationId);
      
      await fetch(`/api/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      
      const remaining = conversations.filter(conv => conv.id !== conversationId);
      console.log('Remaining conversations after deletion:', remaining);
      
      if (currentConversationId === conversationId) {
        if (remaining.length > 0) {
          console.log('Switching to conversation:', remaining[0].id);
          setCurrentConversationId(remaining[0].id);
          setConversations(remaining);
        } else {
          console.log('No conversations left, creating new one');
          const newId = `conv_${Date.now()}`;
          const newConversation = {
            id: newId,
            title: 'New Conversation',
            updatedAt: new Date().toISOString()
          };
          
          try {
            await fetch('/api/conversations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
              body: JSON.stringify({
                id: newId,
                title: 'New Conversation'
              })
            });
          } catch (error) {
            console.error('Failed to create new conversation:', error);
          }
          
          setCurrentConversationId(newId);
          setConversations([newConversation]);
        }
      } else {
        setConversations(remaining);
      }
      
      deleteConversationMessages(conversationId);
      
      console.log('Conversation deletion completed');
      
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const handleUpdateConversationTitle = async (conversationId: string, message: string) => {
    const conversation = conversations.find(conv => conv.id === conversationId);
    if (conversation && conversation.title === 'New Conversation') {
      const newTitle = message.length > 50 ? message.substring(0, 50) + '...' : message;
      
      try {
        await fetch(`/api/conversations/${conversationId}/title`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ title: newTitle })
        });
      } catch (error) {
        console.error('Failed to update conversation title in backend:', error);
      }
      
      setConversations(prev => 
        prev.map(conv => 
          conv.id === conversationId 
            ? { ...conv, title: newTitle, updatedAt: new Date().toISOString() }
            : conv
        )
      );
    } else if (conversation) {
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

  // ========================= Auth Handlers =========================
  const handleGoogleCredential = useCallback(async (resp: any) => {
    console.log('[GIS] credential received', resp ? Object.keys(resp) : 'no resp');
    try {
      if (!resp?.credential) {
        console.error('[GIS] missing credential field');
        return;
      }
      
      console.log('[GIS] sending request to /auth/google...');
      
      // Добавляем таймаут для запроса
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 секунд таймаут
      
      try {
        const r = await fetch('/auth/google', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ id_token: resp.credential }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        console.log('[GIS] backend response status:', r.status);
        
        if (!r.ok) { 
          const errorText = await r.text();
          console.error('[GIS] backend /auth/google failed', r.status, errorText); 
          throw new Error(`Google auth failed: ${r.status} ${errorText}`); 
        }
        
        const data = await r.json();
        const token = data.access_token;
        console.log('[GIS] backend token received, length=', token?.length);
        
        localStorage.setItem('jwt_token', token);
        apiClient.setAuthHeadersProvider(() => ({ Authorization: `Bearer ${token}` }));
        setIsAuthenticated(true);
        
        console.log('[GIS] calling /auth/me...');
        const me = await fetch('/auth/me', { headers: { Authorization: `Bearer ${token}` }});
        if (me.ok) {
          const d = await me.json();
          setUserEmail(d?.email || null);
          console.log('[GIS] user email set:', d?.email);
        } else {
          console.warn('[GIS] /auth/me failed', me.status);
        }
        
        console.log('[GIS] fetching config...');
        await fetchConfig();
        console.log('[GIS] auth flow completed successfully');
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError?.name === 'AbortError') {
          console.error('[GIS] request timed out after 10 seconds');
          throw new Error('Authentication request timed out');
        }
        throw fetchError;
      }
    } catch (e: any) {
      console.error('[GIS] Google login error', e);
      // Можно показать пользователю ошибку
      alert(`Login failed: ${e?.message || 'Unknown error'}`);
    }
  }, [fetchConfig]);

  // Expose callback only (initialization handled inside LoginModal)
  useEffect(() => {
    (window as any).handleGoogleCredential = handleGoogleCredential;
  }, [handleGoogleCredential]);

  // ========================= Loading / Auth UI =========================
  if (!isAuthenticated) {
    // Показываем модальное окно только если нет токена в localStorage
    const hasStoredToken = Boolean(localStorage.getItem('jwt_token'));
    if (!hasStoredToken) {
      return (
        <LoginModal
          isOpen={true}
          error={undefined}
          onGoogleCredential={handleGoogleCredential}
        />
      );
    } else {
      // Если токен есть, но мы не аутентифицированы, показываем загрузку
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Verifying authentication...</p>
          </div>
        </div>
      );
    }
  }

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

  // ========================= Main UI =========================
  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 lg:hidden">
              {showSidebar ? <X size={20}/> : <Menu size={20}/>}
            </button>
            <button onClick={toggleHistorySidebar} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 hidden lg:block" title="Toggle conversation history">
              <Menu size={20}/>
            </button>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">AI</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Multi-Provider Chat</h1>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {health && (
              <div className={`px-2 py-1 rounded-full text-xs font-medium ${health.status === 'healthy' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>{health.status}</div>
            )}
            <div className="hidden sm:block min-w-[300px]">
              <ModelSelector
                selectedModel={selectedModel}
                selectedProvider={selectedProvider}
                onModelChange={handleModelChange}
                onProviderChange={handleProviderChange}
                onManageProviders={() => setShowProviderManager(true)}
              />
            </div>
            <GenerationSettings
              config={config.generation}
              currentProvider={selectedProvider}
              onConfigChange={handleGenerationConfigChange}
              onSave={handleSaveGenerationSettings}
              isOpen={showGenerationSettings}
              onToggle={() => setShowGenerationSettings(!showGenerationSettings)}
            />
            <button onClick={toggleTheme} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700" title={`Theme: ${theme}`}>{getThemeIcon()}</button>
            {userEmail && <span className="text-xs text-gray-500 dark:text-gray-400 hidden md:inline">{userEmail}</span>}
            <button
              onClick={() => { localStorage.removeItem('jwt_token'); setIsAuthenticated(false); setUserEmail(null); }}
              className="p-2 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30"
              title="Logout"
            >
              <span className="text-xs font-medium">Logout</span>
            </button>
            <button onClick={() => setShowProviderManager(true)} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700" title="Manage Providers">
              <Settings size={16}/>
            </button>
          </div>
        </div>
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

      <main className="flex-1 flex min-h-0 overflow-hidden">
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
        {showSidebar && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowSidebar(false)} />
            <div className="relative w-80 h-full bg-white dark:bg-gray-800 overflow-hidden flex flex-col">
              <div className="flex-1 overflow-y-auto">
                <ConversationHistory
                  conversations={conversations}
                  currentConversationId={currentConversationId}
                  onNewConversation={handleNewConversation}
                  onSelectConversation={(id: string) => { handleSelectConversation(id); setShowSidebar(false); }}
                  onRenameConversation={handleRenameConversation}
                  onDeleteConversation={handleDeleteConversation}
                />
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                <div className="space-y-2">
                  <button onClick={() => { setShowProviderManager(true); setShowSidebar(false); }} className="w-full text-left px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">Manage Providers</button>
                  <button onClick={() => { setShowGenerationSettings(true); setShowSidebar(false); }} className="w-full text-left px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">Generation Settings</button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="flex-1 flex flex-col min-h-0">
          {currentConversationId && conversations.some(c => c.id === currentConversationId) ? (
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

      {showProviderManager && (
        <div className="fixed inset-0 z-50">
          <ProviderManager onClose={() => setShowProviderManager(false)} />
        </div>
      )}

      {showUnlockModal && selectedProvider && (
        <UnlockModal
          isOpen={showUnlockModal}
          provider={selectedProvider}
          onClose={handleUnlockCancel}
          onSubmit={handleUnlockSuccess}
        />
      )}
    </div>
  );
}

export default App;