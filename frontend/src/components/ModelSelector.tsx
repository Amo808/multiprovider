import React, { useState, useCallback } from 'react';
import { ChevronDown, Bot, Check, Settings, Zap, Eye, Image } from 'lucide-react';
import { ModelInfo, ModelProvider } from '../types';
import { useModels, useProviders } from '../hooks/useApi';

interface ModelSelectorProps {
  selectedModel?: ModelInfo;
  selectedProvider?: ModelProvider;
  onModelChange: (model: ModelInfo) => void;
  onProviderChange?: (provider: ModelProvider) => void;
  onManageProviders?: () => void;
}

const ModelIcon: React.FC<{ model: ModelInfo }> = ({ model }) => {
  if (model.supports_vision) return <Eye size={14} className="text-blue-500" />;
  if (model.type === 'image') return <Image size={14} className="text-purple-500" />;
  if (model.supports_streaming) return <Zap size={14} className="text-green-500" />;
  return <Bot size={14} className="text-gray-500" />;
};

const ProviderBadge: React.FC<{ provider: ModelProvider }> = ({ provider }) => {
  const getProviderColor = (provider: ModelProvider) => {
    const colors = {
      deepseek: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      openai: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      anthropic: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      gemini: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      ollama: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
      groq: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      mistral: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    };
    return colors[provider] || colors.ollama;
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getProviderColor(provider)}`}>
      {provider.toUpperCase()}
    </span>
  );
};

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  selectedProvider,
  onModelChange,
  onProviderChange,
  onManageProviders
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { providers } = useProviders();
  const { models } = useModels();

  const enabledProviders = providers.filter(p => p.enabled);
  const availableModels = models.filter(m => m.enabled);

  // Group models by provider
  const modelsByProvider = availableModels.reduce((acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  }, {} as Record<ModelProvider, ModelInfo[]>);

  const handleModelSelect = useCallback((model: ModelInfo) => {
    onModelChange(model);
    if (onProviderChange && model.provider !== selectedProvider) {
      onProviderChange(model.provider);
    }
    setIsOpen(false);
  }, [onModelChange, onProviderChange, selectedProvider]);

  return (
    <div className="relative">
      {/* Selected Model Display */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-3 w-full p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
      >
        <div className="flex items-center space-x-2">
          {selectedModel ? (
            <ModelIcon model={selectedModel} />
          ) : (
            <Bot size={16} className="text-gray-400" />
          )}
        </div>
        <div className="flex-1 text-left">
          <div className="font-medium text-gray-900 dark:text-white">
            {selectedModel?.display_name || selectedModel?.name || 'Select Model'}
          </div>
          {selectedModel && (
            <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
              <ProviderBadge provider={selectedModel.provider} />
              <span>•</span>
              <span>{selectedModel.context_length.toLocaleString()} tokens</span>
              {selectedModel.supports_streaming && (
                <>
                  <span>•</span>
                  <span className="text-green-600 dark:text-green-400">Streaming</span>
                </>
              )}
              {selectedModel.supports_vision && (
                <>
                  <span>•</span>
                  <span className="text-blue-600 dark:text-blue-400">Vision</span>
                </>
              )}
            </div>
          )}
        </div>
        <ChevronDown 
          size={16} 
          className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          {availableModels.length === 0 ? (
            <div className="p-6 text-center">
              <Bot size={32} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No models available</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">
                Configure providers to get started
              </p>
              {onManageProviders && (
                <button
                  onClick={() => {
                    onManageProviders();
                    setIsOpen(false);
                  }}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                >
                  <Settings size={14} />
                  <span>Manage Providers</span>
                </button>
              )}
            </div>
          ) : (
            <div className="py-2">
              {Object.entries(modelsByProvider)
                .filter(([providerId]) => enabledProviders.some(p => p.id === providerId))
                .map(([providerId, providerModels]) => {
                  const provider = providers.find(p => p.id === providerId);
                  if (!provider) return null;

                  return (
                    <div key={providerId} className="border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                      {/* Provider Header */}
                      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-600">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300 text-sm capitalize">
                              {provider.id}
                            </span>
                            <span className={`w-2 h-2 rounded-full ${
                              provider.connected ? 'bg-green-500' : 'bg-red-500'
                            }`} />
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {providerModels.length} model{providerModels.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      
                      {/* Models List */}
                      {providerModels.map((model) => (
                        <button
                          key={model.id}
                          onClick={() => handleModelSelect(model)}
                          className="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-center justify-between group"
                        >
                          <div className="flex items-center space-x-3 flex-1">
                            <ModelIcon model={model} />
                            <div className="flex-1">
                              <div className="font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                {model.display_name || model.name}
                              </div>
                              <div className="flex items-center space-x-3 text-sm text-gray-500 dark:text-gray-400">
                                <span>{model.context_length.toLocaleString()} tokens</span>
                                <span className={`px-1.5 py-0.5 text-xs rounded ${
                                  model.type === 'chat' 
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' 
                                    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                }`}>
                                  {model.type}
                                </span>
                                {model.supports_functions && (
                                  <span className="text-xs text-purple-600 dark:text-purple-400">Functions</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {selectedModel?.id === model.id && (
                            <Check size={16} className="text-blue-600 dark:text-blue-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })
              }
              
              {/* Manage Providers Button */}
              {onManageProviders && (
                <div className="p-2 border-t border-gray-100 dark:border-gray-700">
                  <button
                    onClick={() => {
                      onManageProviders();
                      setIsOpen(false);
                    }}
                    className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                  >
                    <Settings size={14} />
                    <span>Manage Providers</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};
