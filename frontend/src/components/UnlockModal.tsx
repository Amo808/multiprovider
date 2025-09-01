import React, { useState } from 'react';
import { X, Key, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { ModelProvider } from '../types';

interface UnlockModalProps {
  isOpen: boolean;
  provider: ModelProvider;
  onClose: () => void;
  onSubmit: (apiKey: string) => Promise<void>;
  error?: string;
}

export const UnlockModal: React.FC<UnlockModalProps> = ({
  isOpen,
  provider,
  onClose,
  onSubmit,
  error
}) => {
  console.log('UnlockModal: Rendering with props:', { isOpen, provider, hasOnClose: !!onClose, hasOnSubmit: !!onSubmit, error });
  
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    
    console.log('UnlockModal: Submitting API key for provider:', provider);
    setIsSubmitting(true);
    try {
      console.log('UnlockModal: Calling onSubmit with API key');
      await onSubmit(apiKey.trim());
      console.log('UnlockModal: onSubmit completed successfully');
      setApiKey('');
    } catch (err) {
      console.error('UnlockModal: Error during submission:', err);
      // Error handled by parent
    } finally {
      setIsSubmitting(false);
      console.log('UnlockModal: Submission finished, isSubmitting set to false');
    }
  };

  const handleClose = () => {
    setApiKey('');
    setShowApiKey(false);
    onClose();
  };

  if (!isOpen) {
    console.log('UnlockModal: Not open, isOpen=', isOpen, 'returning null');
    return null;
  }

  console.log('UnlockModal: Rendering modal for provider:', provider);

  const providerInfo = {
    deepseek: {
      name: 'DeepSeek',
      placeholder: 'sk-xxxxxxxxxxxxxxxx',
      description: 'Enter your DeepSeek API key to start chatting',
      getKeyUrl: 'https://platform.deepseek.com/api_keys'
    },
    openai: {
      name: 'OpenAI',
      placeholder: 'sk-xxxxxxxxxxxxxxxx',
      description: 'Enter your OpenAI API key to start chatting',
      getKeyUrl: 'https://platform.openai.com/api-keys'
    },
    chatgpt_pro: {
      name: 'ChatGPT Pro',
      placeholder: 'sk-xxxxxxxxxxxxxxxx',
      description: 'Enter your ChatGPT Pro API key to start chatting',
      getKeyUrl: 'https://platform.openai.com/api-keys'
    },
    anthropic: {
      name: 'Anthropic',
      placeholder: 'sk-ant-xxxxxxxxxxxxxxxx',
      description: 'Enter your Anthropic API key to start chatting',
      getKeyUrl: 'https://console.anthropic.com/dashboard'
    },
    gemini: {
      name: 'Google Gemini',
      placeholder: 'AIzaSxxxxxxxxxxxxxxxx',
      description: 'Enter your Google Gemini API key to start chatting',
      getKeyUrl: 'https://makersuite.google.com/app/apikey'
    },
    groq: {
      name: 'Groq',
      placeholder: 'gsk_xxxxxxxxxxxxxxxx',
      description: 'Enter your Groq API key to start chatting',
      getKeyUrl: 'https://console.groq.com/keys'
    },
    mistral: {
      name: 'Mistral AI',
      placeholder: 'xxxxxxxxxxxxxxxx',
      description: 'Enter your Mistral AI API key to start chatting',
      getKeyUrl: 'https://console.mistral.ai/'
    },
    ollama: {
      name: 'Ollama',
      placeholder: 'No API key required',
      description: 'Ollama runs locally and doesn\'t require an API key',
      getKeyUrl: '#'
    }
  };

  const info = providerInfo[provider] || providerInfo.deepseek;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Key className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                API Key Required
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {info.name}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* API Key Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={info.placeholder}
                className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                         placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                required={provider !== 'ollama'}
                disabled={provider === 'ollama'}
              />
              {provider !== 'ollama' && (
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 transition-colors"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {info.description}
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
              </div>
            </div>
          )}

          {/* Get API Key Link */}
          {provider !== 'ollama' && info.getKeyUrl !== '#' && (
            <div className="text-center">
              <a
                href={info.getKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline transition-colors"
              >
                Don't have an API key? Get one here →
              </a>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-3 text-gray-700 dark:text-gray-300 border border-gray-300 
                       dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 
                       transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={(provider !== 'ollama' && !apiKey.trim()) || isSubmitting}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 
                       text-white rounded-lg transition-colors font-medium 
                       disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                'Confirm'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
