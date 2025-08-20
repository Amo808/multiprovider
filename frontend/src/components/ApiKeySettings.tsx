import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Key, CheckCircle, AlertCircle } from 'lucide-react';
import { ModelProvider } from '../types';
import { apiClient } from '../services/api';

interface ApiKeySettingsProps {
  provider: any;
  onClose?: () => void;
  onSave?: (providerId: ModelProvider, apiKey: string) => void;
}

export const ApiKeySettings: React.FC<ApiKeySettingsProps> = ({ 
  provider, 
  onClose, 
  onSave 
}) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid?: boolean; error?: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load current API key (masked)
  useEffect(() => {
    // This would typically fetch from config, but for now just show placeholder
    if (provider.config_valid) {
      setApiKey('••••••••••••••••••••••••••••••••');
    }
  }, [provider]);

  const handleValidateKey = async () => {
    if (!apiKey || apiKey.startsWith('••••')) return;

    setIsValidating(true);
    setValidationResult(null);

    try {
      const result = await apiClient.validateApiKey(provider.id, apiKey);
      setValidationResult(result);
    } catch (error) {
      setValidationResult({ 
        valid: false, 
        error: error instanceof Error ? error.message : 'Validation failed' 
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSaveKey = async () => {
    if (!apiKey || apiKey.startsWith('••••')) return;

    setIsSaving(true);
    try {
      await apiClient.updateProviderConfig(provider.id, { 
        api_key: apiKey,
        enabled: true 
      });
      
      if (onSave) {
        onSave(provider.id, apiKey);
      }
      
      if (onClose) {
        onClose();
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save API key');
    } finally {
      setIsSaving(false);
    }
  };

  const getProviderInfo = () => {
    const providerInfo: Record<string, { name: string; keyFormat: string; helpUrl: string }> = {
      deepseek: {
        name: 'DeepSeek',
        keyFormat: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        helpUrl: 'https://platform.deepseek.com/api_keys'
      },
      openai: {
        name: 'OpenAI',
        keyFormat: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        helpUrl: 'https://platform.openai.com/api-keys'
      },
      anthropic: {
        name: 'Anthropic',
        keyFormat: 'sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        helpUrl: 'https://console.anthropic.com/settings/keys'
      }
    };

    return providerInfo[provider.id.toLowerCase()] || {
      name: provider.name,
      keyFormat: 'Your API key format',
      helpUrl: '#'
    };
  };

  const providerInfo = getProviderInfo();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center space-x-3 mb-4">
            <Key className="text-blue-600" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {providerInfo.name} API Key
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Configure your API key for {providerInfo.name}
              </p>
            </div>
          </div>

          {/* API Key Input */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setValidationResult(null);
                  }}
                  placeholder={providerInfo.keyFormat}
                  className="w-full px-3 py-2 pr-20 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                />
                <div className="absolute inset-y-0 right-0 flex items-center space-x-1 pr-3">
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Get your API key from{' '}
                <a 
                  href={providerInfo.helpUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  {providerInfo.name} Dashboard
                </a>
              </p>
            </div>

            {/* Validation Result */}
            {validationResult && (
              <div className={`flex items-center space-x-2 p-3 rounded-md ${
                validationResult.valid 
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
              }`}>
                {validationResult.valid ? (
                  <CheckCircle size={16} />
                ) : (
                  <AlertCircle size={16} />
                )}
                <span className="text-sm">
                  {validationResult.valid 
                    ? 'API key is valid' 
                    : validationResult.error || 'Invalid API key'
                  }
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={handleValidateKey}
                disabled={isValidating || !apiKey || apiKey.startsWith('••••')}
                className="flex-1 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isValidating ? 'Validating...' : 'Validate Key'}
              </button>
              <button
                onClick={handleSaveKey}
                disabled={isSaving || !apiKey || apiKey.startsWith('••••')}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save Key'}
              </button>
            </div>

            {/* Cancel Button */}
            <button
              onClick={onClose}
              className="w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
