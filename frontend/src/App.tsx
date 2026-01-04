import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ChatInterface, 
  ProviderManager,
  UnlockModal,
  LoginModal,
  ConversationHistory,
  useConfig,
  ModelInfo,
  ModelProvider,
  GenerationConfig
} from './components';
import { useConversationsContext } from './contexts/ConversationsContext';
import { TopNavigation } from './components/TopNavigation';
import { CommandPalette } from './components/CommandPalette';
import { ToastProvider } from './components/ToastProvider';
import { PresetPrompts } from './components/PresetPrompts';
import { ParallelChatInterface } from './components/ParallelChatInterface';
import { apiClient } from './services/api';
import { useTokenUsage } from './hooks/useTokenUsage';
import { useModelSettings } from './hooks/useModelSettings';
import { useGlobalSystemPrompt } from './hooks/useGlobalSystemPrompt';
import { useHealth } from './components';

interface Conversation { id: string; title: string; updatedAt: string }

type ChatMode = 'single' | 'parallel';

function App() {
  // ========================= State Management =========================
  const [selectedModel, setSelectedModel] = useState<ModelInfo | undefined>();
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider | undefined>();
  const [showProviderManager, setShowProviderManager] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string>('default');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [chatMode, setChatMode] = useState<ChatMode>('single');
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
  const { health } = useHealth();
  const { usage: tokenUsage, update: updateTokenUsage } = useTokenUsage();

  const DEV_MODE = import.meta.env.VITE_DEV_MODE === '1';

  // Helper to get auth headers (avoid TypeScript private access)
  const getAuthHeaders = () => {
    // @ts-expect-error accessing internal for convenience
    return apiClient['getHeaders'] ? (apiClient as { getHeaders: () => Record<string, string> }).getHeaders() : {};
  };

  // ========================= Hooks =========================
  const { config, loading: configLoading, error: configError, updateConfig, fetchConfig } = useConfig();
  const { 
    deleteConversation: deleteConversationMessages, 
    createBranchConversation,
    conversations: conversationMessages 
  } = useConversationsContext();
  
  // Per-model settings hook - manages generation settings + system prompt per model
  // Pass selectedModel to calculate proper max values for each model
  const { 
    settings: modelSettings, 
    loading: modelSettingsLoading,
    updateSettings: updateModelSettings,
    hasChanges: modelSettingsHasChanges,
    applyMaxPreset,
    cyclePreset,
    currentPreset
  } = useModelSettings(selectedProvider, selectedModel?.id, selectedModel);
  
  // Global system prompt hook - applies to ALL models
  const {
    globalPrompt,
    loading: globalPromptLoading,
    error: globalPromptError,
    setGlobalPrompt,
    saveGlobalPrompt,
    hasChanges: globalPromptHasChanges
  } = useGlobalSystemPrompt();
  
  // Per-model system prompt (from model settings)
  const modelSystemPrompt = modelSettings.system_prompt || '';
  
  // Combined system prompt: Global + Per-Model (OpenRouter style)
  // Final prompt = [Global prompt] + "\n\n" + [Per-model prompt]
  const combinedSystemPrompt = useMemo(() => {
    const parts = [globalPrompt, modelSystemPrompt].filter(Boolean);
    return parts.join('\n\n---\n\n');
  }, [globalPrompt, modelSystemPrompt]);
  
  // Build effective generation config from model settings
  const effectiveGenerationConfig: GenerationConfig = {
    temperature: modelSettings.temperature ?? config?.generation?.temperature ?? 0.7,
    max_tokens: modelSettings.max_tokens ?? config?.generation?.max_tokens ?? 8192,
    top_p: modelSettings.top_p ?? config?.generation?.top_p ?? 1.0,
    frequency_penalty: modelSettings.frequency_penalty ?? config?.generation?.frequency_penalty ?? 0,
    presence_penalty: modelSettings.presence_penalty ?? config?.generation?.presence_penalty ?? 0,
    stream: modelSettings.stream ?? config?.generation?.stream ?? true,
    thinking_budget: modelSettings.thinking_budget ?? config?.generation?.thinking_budget,
    include_thoughts: modelSettings.include_thoughts ?? config?.generation?.include_thoughts ?? false,
    verbosity: modelSettings.verbosity ?? config?.generation?.verbosity,
    reasoning_effort: modelSettings.reasoning_effort ?? config?.generation?.reasoning_effort,
    cfg_scale: modelSettings.cfg_scale ?? config?.generation?.cfg_scale,
    free_tool_calling: modelSettings.free_tool_calling ?? config?.generation?.free_tool_calling ?? false
  };

  // Collect all available models from all providers
  const allAvailableModels = useMemo(() => {
    if (!config?.providers) return [];
    const models: ModelInfo[] = [];
    Object.values(config.providers).forEach(provider => {
      if (provider.enabled && provider.models) {
        models.push(...provider.models.filter(m => m.enabled !== false));
      }
    });
    return models;
  }, [config?.providers]);

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
    const body = document.body;
    const appElement = document.getElementById('root');
    console.log(`Applying theme: ${theme}`);
    
    // Remove all theme classes first
    root.classList.remove('dark', 'light');
    body.classList.remove('dark', 'light');
    if (appElement) appElement.classList.remove('dark', 'light');
    
    // Clear any forced styles
    root.style.backgroundColor = '';
    body.style.backgroundColor = '';
    root.style.color = '';
    body.style.color = '';
    if (appElement) {
      appElement.style.backgroundColor = '';
      appElement.style.color = '';
    }
    
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      console.log(`Auto theme - system prefers dark: ${prefersDark}`);
      if (prefersDark) {
        root.classList.add('dark');
        body.classList.add('dark');
        if (appElement) appElement.classList.add('dark');
      } else {
        root.classList.add('light');
        body.classList.add('light');
        if (appElement) appElement.classList.add('light');
      }
    } else if (theme === 'dark') {
      console.log(`Manual dark theme - applying dark mode`);
      root.classList.add('dark');
      body.classList.add('dark');
      if (appElement) appElement.classList.add('dark');
    } else if (theme === 'light') {
      console.log(`Manual light theme - applying light mode`);
      root.classList.add('light');
      body.classList.add('light');
      if (appElement) appElement.classList.add('light');
    }
    
    console.log(`Root element classes: ${root.className}`);
    console.log(`Body element classes: ${body.className}`);
    
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

  // Branch from a specific message in conversation - creates new conversation with history up to that point
  const handleBranchFromMessage = async (sourceConversationId: string, messageIndex: number) => {
    const newId = `conv_${Date.now()}`;
    
    // Get source conversation messages from context
    const sourceMessages = conversationMessages[sourceConversationId]?.messages || [];
    if (sourceMessages.length === 0) {
      console.warn('No messages in source conversation to branch from');
      return;
    }
    
    // Messages up to and including the selected index
    const branchedMessages = sourceMessages.slice(0, messageIndex + 1);
    
    // Generate title from first user message or use default
    const firstUserMessage = branchedMessages.find((m: { role: string; content: string }) => m.role === 'user');
    const branchTitle = firstUserMessage 
      ? `Branch: ${firstUserMessage.content.slice(0, 30)}${firstUserMessage.content.length > 30 ? '...' : ''}`
      : 'Branch from conversation';
    
    const newConversation = {
      id: newId,
      title: branchTitle,
      updatedAt: new Date().toISOString()
    };
    
    try {
      // Create new conversation in backend with the branched messages
      await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          id: newId,
          title: branchTitle,
          messages: branchedMessages
        })
      });
      
      // Create branch conversation in context (this also sets messages)
      createBranchConversation(sourceConversationId, messageIndex, newId);
      
      // Add to UI conversations list and switch to new conversation
      setConversations(prev => [newConversation, ...prev]);
      setCurrentConversationId(newId);
      
      console.log(`[App] Created branch conversation ${newId} with ${branchedMessages.length} messages`);
    } catch (error) {
      console.error('Failed to create branch conversation:', error);
      // Still create locally even if backend fails
      createBranchConversation(sourceConversationId, messageIndex, newId);
      setConversations(prev => [newConversation, ...prev]);
      setCurrentConversationId(newId);
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
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          {configError ? (
            <>
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
              <p className="text-red-600 dark:text-red-400 mb-2">Failed to load configuration</p>
              <p className="text-muted-foreground text-sm">{configError}</p>
            </>
          ) : (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading configuration...</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ========================= Main UI =========================
  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
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
        onSelectModel={handleModelChange}
        onChangeGeneration={async (patch) => {
          try { 
            await updateModelSettings(patch); 
          } catch(e) { 
            console.error(e); 
          }
        }}
        // Combined system prompt for display (Global + Per-Model)
        systemPrompt={combinedSystemPrompt}
        // Per-model system prompt change handler
        onChangeSystemPrompt={(p: string) => { updateModelSettings({ system_prompt: p }); }}
        // Global system prompt props
        globalPrompt={globalPrompt}
        onChangeGlobalPrompt={setGlobalPrompt}
        onSaveGlobalPrompt={saveGlobalPrompt}
        globalPromptHasChanges={globalPromptHasChanges}
        // Per-model prompt props
        modelPrompt={modelSystemPrompt}
        modelPromptHasChanges={modelSettingsHasChanges}
        tokenUsage={tokenUsage}
        generationConfig={effectiveGenerationConfig}
        health={health}
        onApplyMaxPreset={applyMaxPreset}
        onCyclePreset={cyclePreset}
        currentPreset={currentPreset}
      />
      <div className="flex items-center gap-2 px-4 py-1 text-xs border-b border-border bg-background">
        <button onClick={() => setShowHistory(h => !h)} className="px-2 py-1 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium">{showHistory ? 'Hide' : 'Show'} History</button>
        {/* Chat mode toggle */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setChatMode('single')}
            className={`px-2 py-1 rounded font-medium transition-colors ${chatMode === 'single' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Single
          </button>
          <button
            onClick={() => setChatMode('parallel')}
            className={`px-2 py-1 rounded font-medium transition-colors ${chatMode === 'parallel' ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Compare
          </button>
        </div>
        
        <span className="ml-auto"></span>
        
        {/* Status indicators */}
        {globalPromptLoading && <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 animate-pulse text-[10px]">Loading global prompt...</span>}
        {globalPromptError && <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[10px]">⚠️ Prompt error</span>}
        {globalPromptHasChanges && !globalPromptLoading && <span className="px-2 py-1 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 text-[10px]">🌍 Global unsaved</span>}
        {modelSettingsLoading && <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 animate-pulse text-[10px]">Loading settings...</span>}
        {modelSettingsHasChanges && !modelSettingsLoading && <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-[10px]">🎯 Model unsaved</span>}
      </div>
      <main className="flex-1 flex min-h-0 overflow-hidden">
        {showHistory && chatMode === 'single' && (
          <ConversationHistory
            conversations={conversations}
            currentConversationId={currentConversationId}
            onNewConversation={handleNewConversation}
            onSelectConversation={handleSelectConversation}
            onRenameConversation={handleRenameConversation}
            onDeleteConversation={handleDeleteConversation}
          />
        )}
        <div className="flex-1 flex flex-col min-h-0">
          {chatMode === 'parallel' ? (
            <ParallelChatInterface
              availableModels={allAvailableModels}
              generationConfig={effectiveGenerationConfig}
              systemPrompt={combinedSystemPrompt}
              onClose={() => setChatMode('single')}
            />
          ) : currentConversationId && conversations.some(c => c.id === currentConversationId) ? (
            <>
              <ChatInterface
                selectedModel={selectedModel}
                selectedProvider={selectedProvider}
                generationConfig={effectiveGenerationConfig}
                conversationId={currentConversationId}
                onMessageSent={handleUpdateConversationTitle}
                onTokenUsageUpdate={updateTokenUsage}
                systemPrompt={combinedSystemPrompt}
                onConfigChange={updateModelSettings}
                onBranchFrom={handleBranchFromMessage}
              />
              <div className="px-4 pb-3"><PresetPrompts onInsert={(t: string) => { const ev = new CustomEvent('insert-preset', { detail: t }); window.dispatchEvent(ev); }} /></div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading conversation...</p>
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