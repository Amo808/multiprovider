import { useState, useEffect, useCallback } from 'react';
import { 
  ChatInterface, 
  ProviderManager,
  UnlockModal,
  LoginModal,
  ConversationHistory,
  useConfig,
  useConversations,
  ModelInfo,
  ModelProvider,
  GenerationConfig,
  GenerationSettings
} from './components';
import { TopNavigation } from './components/TopNavigation';
import { CommandPalette } from './components/CommandPalette';
import { ToastProvider } from './components/ToastProvider';
import TokenCounter from './components/TokenCounter';
import { PresetPrompts } from './components/PresetPrompts';
import { apiClient } from './services/api';
import { Button } from './components/ui/button';
import { useTokenUsage } from './hooks/useTokenUsage';
import { useHealth } from './components';

interface Conversation { id: string; title: string; updatedAt: string }

function App() {
  // ========================= State Management =========================
  const [selectedModel, setSelectedModel] = useState<ModelInfo | undefined>();
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider | undefined>();
  const [showProviderManager, setShowProviderManager] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string>('default');
  const [conversations, setConversations] = useState<Conversation[]>([]);
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
  const [showCommand, setShowCommand] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [showGenerationSettings, setShowGenerationSettings] = useState(false);
  const { health } = useHealth();
  const { usage: tokenUsage, update: updateTokenUsage } = useTokenUsage();

  const DEV_MODE = import.meta.env.VITE_DEV_MODE === '1';

  // Helper to get auth headers (avoid TypeScript private access)
  const getAuthHeaders = () => {
    // @ts-expect-error accessing internal for convenience
    return apiClient['getHeaders'] ? (apiClient as { getHeaders: () => Record<string, string> }).getHeaders() : {};
  };

  // ========================= Hooks =========================
  const { config, loading: configLoading, error: configError, updateConfig, fetchConfig, updateGenerationConfig } = useConfig();
  const { deleteConversation: deleteConversationMessages } = useConversations();
  // System prompt per provider+model map
  const [systemPrompts, setSystemPrompts] = useState<Record<string,string>>({});
  const activeSystemPromptKey = `${selectedProvider||''}:${selectedModel?.id||''}`;
  const activeSystemPrompt = systemPrompts[activeSystemPromptKey] || '';

  // ========================= Auth Restore =========================
  useEffect(() => {
    apiClient.setUnauthorizedCallback(() => {
      console.log('Global 401 handler: logging out user');
      setIsAuthenticated(false);
      setUserEmail(null);
      localStorage.removeItem('jwt_token');
    });

    // In DEV_MODE, skip authentication and load config directly
    if (DEV_MODE) {
      console.log('DEV_MODE: Skipping authentication, setting as authenticated');
      setIsAuthenticated(true);
      setUserEmail('dev@example.com');
      fetchConfig();
      return;
    }

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
  }, [fetchConfig, DEV_MODE]);

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
        
interface BackendConversation {
  id: string;
  title?: string;
  updated_at?: string;
}

        if (backendConversations && backendConversations.length > 0) {
          // Transform backend data to frontend format
            const transformedConversations = backendConversations.map((conv: BackendConversation) => ({
            id: conv.id,
            title: conv.title || 'Untitled Conversation',
            updatedAt: conv.updated_at || new Date().toISOString()
          }));
          setConversations(transformedConversations);
          
          // Set current conversation to the most recent one if default is empty
          const defaultConv = transformedConversations.find((c: Conversation) => c.id === 'default');
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
      setConversations(prev => prev.map(conv => conv.id === conversationId ? { ...conv, title: newTitle, updatedAt: new Date().toISOString() } : conv));
    } else if (conversation) {
      setConversations(prev => prev.map(conv => conv.id === conversationId ? { ...conv, updatedAt: new Date().toISOString() } : conv));
    }
    // removed naive placeholder token update (now real aggregation handled via ChatInterface onTokenUsageUpdate)
  };

interface GoogleCredentialResponse {
  credential?: string;
}

  // ========================= Auth Handlers =========================
  const handleGoogleCredential = useCallback(async (resp: GoogleCredentialResponse) => {
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
      } catch (fetchError: unknown) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.error('[GIS] request timed out after 10 seconds');
          throw new Error('Authentication request timed out');
        }
        throw fetchError;
      }
    } catch (e: unknown) {
      console.error('[GIS] Google login error', e);
      // Можно показать пользователю ошибку
      alert(`Login failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }, [fetchConfig]);

  // Expose callback only (initialization handled inside LoginModal)
  useEffect(() => {
    (window as unknown as Window & { handleGoogleCredential: typeof handleGoogleCredential }).handleGoogleCredential = handleGoogleCredential;
  }, [handleGoogleCredential]);

  // ========================= Keyboard Shortcuts =========================
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setShowCommand(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ========================= Loading / Auth UI =========================
  if (!isAuthenticated && !DEV_MODE) {
    return (
      <LoginModal
        isOpen={true}
        error={undefined}
        onGoogleCredential={() => {}}
      />
    );
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
      <ToastProvider />
      <TopNavigation
        config={config}
        selectedModel={selectedModel}
        selectedProvider={selectedProvider}
        userEmail={userEmail}
        theme={theme}
        onThemeToggle={toggleTheme}
        onSettingsClick={() => setShowProviderManager(true)}
        onLogout={() => { localStorage.removeItem('jwt_token'); setIsAuthenticated(false); setUserEmail(null); }}
        onMenuToggle={() => setShowSidebar(prev => !prev)}
        onGenSettings={() => setShowGenerationSettings(s => !s)}
        onSelectModel={handleModelChange}
        onChangeGeneration={async (patch) => {
          try { await updateGenerationConfig(patch); } catch(e){ console.error(e); }
        }}
        systemPrompt={activeSystemPrompt}
        onChangeSystemPrompt={(p: string) => { setSystemPrompts(prev => ({ ...prev, [activeSystemPromptKey]: p })); }}
      />
      {showGenerationSettings && (
        <div className="absolute top-16 right-4 z-40">
          <GenerationSettings
            config={config.generation}
            currentProvider={selectedProvider}
            currentModel={selectedModel}
            onConfigChange={() => {}}
            onSave={async (gc: GenerationConfig) => { await apiClient.updateGenerationConfig(gc); }}
            isOpen={true}
            onToggle={() => setShowGenerationSettings(false)}
          />
        </div>
      )}
      <div className="flex items-center gap-2 px-4 py-1 text-xs border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <button onClick={() => setShowHistory(h => !h)} className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium">{showHistory ? 'Hide' : 'Show'} History</button>
        {health && <span className={`px-2 py-1 rounded-full font-medium ${health.status === 'healthy' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>API {health.status}</span>}
      </div>
      <main className="flex-1 flex min-h-0 overflow-hidden">
        {showHistory && (
          <ConversationHistory
            conversations={conversations}
            currentConversationId={currentConversationId}
            onNewConversation={handleNewConversation}
            onSelectConversation={handleSelectConversation}
            onRenameConversation={handleRenameConversation}
            onDeleteConversation={handleDeleteConversation}
          />
        )}
        {showSidebar && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowSidebar(false)} />
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
              <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-2">
                <Button variant="ghost" className="w-full justify-start" onClick={() => { setShowProviderManager(true); setShowSidebar(false); }}>Manage Providers</Button>
              </div>
            </div>
          </div>
        )}
        <div className="flex-1 flex flex-col min-h-0">
          {currentConversationId && conversations.some(c => c.id === currentConversationId) ? (
            <>
              <ChatInterface
                selectedModel={selectedModel}
                selectedProvider={selectedProvider}
                generationConfig={config.generation}
                conversationId={currentConversationId}
                onMessageSent={handleUpdateConversationTitle}
                onTokenUsageUpdate={updateTokenUsage}
                systemPrompt={activeSystemPrompt}
              />
              <div className="px-4 pb-3"><TokenCounter usage={tokenUsage} model={selectedModel?.display_name} maxTokens={selectedModel?.max_output_tokens || selectedModel?.context_length} /></div>
              <div className="px-4 pb-3"><PresetPrompts onInsert={(t: string) => { const ev = new CustomEvent('insert-preset', { detail: t }); window.dispatchEvent(ev); }} /></div>
            </>
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
        <div className="fixed inset-0 z-50"><ProviderManager onClose={() => setShowProviderManager(false)} /></div>
      )}
      {showUnlockModal && selectedProvider && (
        <UnlockModal isOpen={showUnlockModal} provider={selectedProvider} onClose={handleUnlockCancel} onSubmit={handleUnlockSuccess} />
      )}
      <CommandPalette
        open={showCommand}
        onOpenChange={setShowCommand}
        models={selectedProvider ? config.providers[selectedProvider].models : []}
        onSelectModel={handleModelChange}
        onNewConversation={handleNewConversation}
        onClearCurrent={() => { const ev = new Event('clear-current-conversation'); window.dispatchEvent(ev); }}
        onOpenSettings={() => setShowProviderManager(true)}
      />
    </div>
  );
}

export default App;