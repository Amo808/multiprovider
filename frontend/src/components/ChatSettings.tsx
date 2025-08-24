import React, { useState } from 'react';
import { Settings, Sliders, Trash2 } from 'lucide-react';
import { GenerationConfig } from '../types';

interface ChatSettingsProps {
  config: GenerationConfig;
  onConfigChange: (config: Partial<GenerationConfig>) => void;
  onClearHistory: () => void;
}

export const ChatSettings: React.FC<ChatSettingsProps> = ({
  config,
  onConfigChange,
  onClearHistory
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const updateConfig = (key: keyof GenerationConfig, value: any) => {
    onConfigChange({
      [key]: value
    });
  };

  return (
    <div className="relative">
      {/* Settings Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        title="Chat Settings"
      >
        <Settings size={20} />
      </button>

      {/* Settings Panel */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-4">
            <div className="flex items-center space-x-2 mb-4">
              <Sliders size={18} className="text-blue-600" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Generation Settings</h3>
            </div>

            {/* Temperature */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Temperature
                </label>
                <span className="text-sm text-gray-500 dark:text-gray-400">{config.temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={config.temperature}
                onChange={(e) => updateConfig('temperature', parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
                <span>Precise</span>
                <span>Creative</span>
              </div>
            </div>

            {/* Max Tokens */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Max Tokens
                </label>
                <span className="text-sm text-gray-500">{config.max_tokens}</span>
              </div>
              <input
                type="range"
                min="256"
                max="16384"
                step="256"
                value={config.max_tokens}
                onChange={(e) => updateConfig('max_tokens', parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>256</span>
                <span>16K</span>
              </div>
            </div>

            {/* Top P */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Top P
                </label>
                <span className="text-sm text-gray-500">{config.top_p}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={config.top_p}
                onChange={(e) => updateConfig('top_p', parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0.0</span>
                <span>1.0</span>
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-gray-200 pt-4">
              <button
                onClick={() => {
                  onClearHistory();
                  setIsOpen(false);
                }}
                className="flex items-center space-x-2 w-full p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
                <span>Clear Chat History</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Custom CSS for sliders */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .slider::-webkit-slider-thumb {
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #0ea5e9;
            cursor: pointer;
            border: 2px solid #ffffff;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          
          .slider::-webkit-slider-track {
            width: 100%;
            height: 8px;
            cursor: pointer;
            background: #e5e7eb;
            border-radius: 4px;
          }
          
          .slider::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #0ea5e9;
            cursor: pointer;
            border: 2px solid #ffffff;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
        `
      }} />
    </div>
  );
};
