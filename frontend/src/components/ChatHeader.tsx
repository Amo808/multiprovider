import React from 'react';
import { ModelSelector } from './ModelSelector';
import { ChatSettings } from './ChatSettings';
import { ModelInfo, ModelProvider, ProviderStatus, GenerationConfig } from '../types';

interface ChatHeaderProps {
  providers: ProviderStatus[];
  selectedModel?: ModelInfo;
  selectedProvider?: ModelProvider;
  onModelChange: (model: ModelInfo) => void;
  onProviderChange?: (provider: ModelProvider) => void;
  config: GenerationConfig;
  onConfigChange: (config: Partial<GenerationConfig>) => void;
  onClearHistory: () => void;
  onManageProviders?: () => void;
  messageCount?: number;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  selectedModel,
  selectedProvider,
  onModelChange,
  onProviderChange,
  config,
  onConfigChange,
  onClearHistory,
  onManageProviders,
  messageCount = 0
}) => {
  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex items-center justify-between">
        {/* Left: Model Selector */}
        <div className="flex-1 max-w-md">
          <ModelSelector
            selectedModel={selectedModel}
            selectedProvider={selectedProvider}
            onModelChange={onModelChange}
            onProviderChange={onProviderChange}
            onManageProviders={onManageProviders}
          />
        </div>

        {/* Center: Chat Info */}
        <div className="text-center">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">AI Chat</div>
          {messageCount > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {messageCount} messages
            </div>
          )}
          {selectedModel && selectedProvider && (
            <div className="text-xs text-gray-400 dark:text-gray-500">
              {selectedModel.display_name} • {selectedProvider.toUpperCase()}
            </div>
          )}
        </div>

        {/* Right: Settings */}
        <div className="flex items-center space-x-2">
          <ChatSettings
            config={config}
            onConfigChange={onConfigChange}
            onClearHistory={onClearHistory}
          />
        </div>
      </div>
    </div>
  );
};
