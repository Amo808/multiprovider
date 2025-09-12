import React, { useState } from 'react';
import { useProviders, useModels } from '../hooks/useApi';
import { ModelProvider } from '../types';
import { ApiKeySettings } from './ApiKeySettings';

interface ProviderManagerProps {
  onClose?: () => void;
}

const ProviderCard: React.FC<{
  provider: any;
  onToggle: (providerId: ModelProvider, enabled: boolean) => void;
  onRefresh: (providerId: ModelProvider) => void;
  onTest: (providerId: ModelProvider) => void;
  onConfigureApiKey: (providerId: ModelProvider) => void;
}> = ({ provider, onToggle, onRefresh, onTest, onConfigureApiKey }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh(provider.id);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      await onTest(provider.id);
    } finally {
      setIsTesting(false);
    }
  };

  const getStatusColor = () => {
    if (provider.loading) return 'text-yellow-600';
    if (provider.error) return 'text-red-600';
    if (provider.connected && provider.enabled) return 'text-green-600';
    return 'text-gray-400';
  };

  const getStatusText = () => {
    if (provider.loading) return 'Loading...';
    if (provider.error) return 'Error';
    if (provider.connected && provider.enabled) return 'Connected';
    if (!provider.enabled) return 'Disabled';
    return 'Disconnected';
  };

  const getApiKeyStatus = () => {
    // Check if provider has API key configured
    if (provider.hasApiKey === true) {
      return { hasKey: true, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-900/20', hoverBg: 'hover:bg-green-100 dark:hover:bg-green-900/30' };
    } else if (provider.hasApiKey === false) {
      return { hasKey: false, color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-900/20', hoverBg: 'hover:bg-red-100 dark:hover:bg-red-900/30' };
    } else {
      // Default state when status is unknown
      return { hasKey: false, color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-50 dark:bg-purple-900/20', hoverBg: 'hover:bg-purple-100 dark:hover:bg-purple-900/30' };
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-semibold text-sm">
              {provider.id.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
              {provider.id}
            </h3>
            <p className={`text-sm ${getStatusColor()}`}>
              {getStatusText()}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onToggle(provider.id, !provider.enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              provider.enabled
                ? 'bg-blue-600'
                : 'bg-gray-200 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                provider.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {provider.error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-600 dark:text-red-400">
            {provider.error}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-4">
        <span>Models: {provider.modelsCount || 0}</span>
        {provider.lastCheck && (
          <span>Last check: {new Date(provider.lastCheck).toLocaleTimeString()}</span>
        )}
      </div>

      <div className="flex space-x-2">
        <button
          onClick={() => onConfigureApiKey(provider.id)}
          className={`flex-1 px-3 py-2 text-sm font-medium ${getApiKeyStatus().color} ${getApiKeyStatus().bgColor} rounded-md ${getApiKeyStatus().hoverBg} transition-colors flex items-center justify-center space-x-1`}
        >
          <span>API Key</span>
          <span className={`inline-block w-2 h-2 rounded-full ${getApiKeyStatus().hasKey ? 'bg-green-500' : 'bg-red-500'}`}></span>
        </button>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing || !provider.enabled}
          className="flex-1 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh Models'}
        </button>
        <button
          onClick={handleTest}
          disabled={isTesting || !provider.enabled}
          className="flex-1 px-3 py-2 text-sm font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-md hover:bg-green-100 dark:hover:bg-green-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isTesting ? 'Testing...' : 'Test Connection'}
        </button>
      </div>
    </div>
  );
};

const ModelsList: React.FC<{
  providerId: ModelProvider;
  onToggleModel: (providerId: ModelProvider, modelId: string, enabled: boolean) => void;
}> = ({ providerId, onToggleModel }) => {
  const { models, loading, error } = useModels(providerId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No models found for this provider
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-60 overflow-y-auto">
      {models.map((model) => (
        <div
          key={model.id}
          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-md"
        >
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <h4 className="font-medium text-gray-900 dark:text-white">
                {model.display_name || model.name}
              </h4>
              <span className={`px-2 py-1 text-xs rounded-full ${
                model.type === 'chat' 
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
              }`}>
                {model.type}
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Context: {model.context_length.toLocaleString()} tokens
              {model.supports_streaming && ' • Streaming'}
              {model.supports_vision && ' • Vision'}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onToggleModel(providerId, model.id, !model.enabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                model.enabled
                  ? 'bg-blue-600'
                  : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  model.enabled ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export const ProviderManager: React.FC<ProviderManagerProps> = ({ onClose }) => {
  const { providers, loading, error, toggleProvider, refreshModels, testProvider, fetchProviders } = useProviders();
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider | null>(null);
  const [showModels, setShowModels] = useState(false);
  const [showApiKeySettings, setShowApiKeySettings] = useState(false);
  const [apiKeyProvider, setApiKeyProvider] = useState<any>(null);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    providerId?: ModelProvider;
  } | null>(null);

  const showNotification = (type: 'success' | 'error' | 'info', message: string, providerId?: ModelProvider) => {
    setNotification({ type, message, providerId });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleToggleProvider = async (providerId: ModelProvider, enabled: boolean) => {
    try {
      await toggleProvider(providerId, enabled);
      showNotification('success', `Provider ${providerId} ${enabled ? 'enabled' : 'disabled'}`, providerId);
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Failed to toggle provider', providerId);
    }
  };

  const handleConfigureApiKey = (providerId: ModelProvider) => {
    const provider = providers.find(p => p.id === providerId);
    if (provider) {
      setApiKeyProvider(provider);
      setShowApiKeySettings(true);
    }
  };

  const handleApiKeySaved = async (_providerId: ModelProvider, _apiKey: string) => {
    // Refresh providers to get updated status
    console.log('ProviderManager: API key saved, refreshing providers...');
    try {
      await fetchProviders();
      console.log('ProviderManager: Providers refreshed successfully');
    } catch (error) {
      console.error('ProviderManager: Failed to refresh providers:', error);
    }
  };

  const handleRefreshModels = async (providerId: ModelProvider) => {
    try {
      const result = await refreshModels(providerId);
      const modelCount = (result as any).models_count || result.models?.length || 0;
      showNotification('success', `Models refreshed! Found ${modelCount} models.`, providerId);
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Failed to refresh models', providerId);
    }
  };

  const handleTestProvider = async (providerId: ModelProvider) => {
    try {
      const result = await testProvider(providerId);
      if (result.success) {
        showNotification('success', 'Connection test successful!', providerId);
      } else {
        showNotification('error', result.error || 'Connection test failed', providerId);
      }
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Connection test failed', providerId);
    }
  };

  const handleToggleModel = async (providerId: ModelProvider, modelId: string, enabled: boolean) => {
    try {
      // This would need to be implemented in the useModels hook
      console.log('Toggle model:', providerId, modelId, enabled);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to toggle model');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Back to Chat
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-50">
          <div className={`p-4 rounded-lg shadow-lg border max-w-sm ${
            notification.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
            notification.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
            'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            <div className="flex items-center space-x-2">
              <span className={`w-4 h-4 rounded-full flex-shrink-0 ${
                notification.type === 'success' ? 'bg-green-400' :
                notification.type === 'error' ? 'bg-red-400' :
                'bg-blue-400'
              }`}></span>
              <p className="text-sm font-medium">{notification.message}</p>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Provider Management
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Configure and manage AI providers and their models
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Back to Chat
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {providers.map((provider) => (
            <div key={provider.id}>
              <ProviderCard
                provider={provider}
                onToggle={handleToggleProvider}
                onRefresh={handleRefreshModels}
                onTest={handleTestProvider}
                onConfigureApiKey={handleConfigureApiKey}
              />
              {provider.enabled && (
                <button
                  onClick={() => {
                    setSelectedProvider(provider.id);
                    setShowModels(true);
                  }}
                  className="w-full mt-2 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Manage Models ({provider.modelsCount || 0})
                </button>
              )}
            </div>
          ))}
        </div>

        {showModels && selectedProvider && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white capitalize">
                  {selectedProvider} Models
                </h2>
                <button
                  onClick={() => {
                    setShowModels(false);
                    setSelectedProvider(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>
              <div className="p-6">
                <ModelsList
                  providerId={selectedProvider}
                  onToggleModel={handleToggleModel}
                />
              </div>
            </div>
          </div>
        )}

        {/* API Key Settings Modal */}
        {showApiKeySettings && apiKeyProvider && (
          <ApiKeySettings
            provider={apiKeyProvider}
            onClose={() => {
              setShowApiKeySettings(false);
              setApiKeyProvider(null);
            }}
            onSave={handleApiKeySaved}
          />
        )}
      </div>
    </div>
  );
};
