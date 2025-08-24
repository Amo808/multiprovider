import React, { useState, useEffect } from 'react';
import { Sliders, RotateCcw, Save } from 'lucide-react';
import { GenerationConfig } from '../types';

interface GenerationSettingsProps {
  config: GenerationConfig;
  onConfigChange: (config: Partial<GenerationConfig>) => void;
  onSave?: () => void;
  onReset?: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  description?: string;
}

const Slider: React.FC<SliderProps> = ({ label, value, min, max, step, onChange, description }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
        <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
        style={{
          background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((value - min) / (max - min)) * 100}%, #e5e7eb ${((value - min) / (max - min)) * 100}%, #e5e7eb 100%)`
        }}
      />
      {description && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {description}
        </p>
      )}
    </div>
  );
};

export const GenerationSettings: React.FC<GenerationSettingsProps> = ({
  config,
  onConfigChange,
  onSave,
  onReset,
  isOpen,
  onToggle
}) => {
  const [localConfig, setLocalConfig] = useState<GenerationConfig>(config);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setLocalConfig(config);
    setHasChanges(false);
  }, [config]);

  const handleChange = (key: keyof GenerationConfig, value: any) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
    setHasChanges(true);
    onConfigChange({ [key]: value });
  };

  const handleSave = () => {
    if (onSave) {
      onSave();
      setHasChanges(false);
    }
  };

  const handleReset = () => {
    if (onReset) {
      onReset();
      setHasChanges(false);
    }
  };

  const handleStopSequenceChange = (sequences: string) => {
    const stopSequences = sequences
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    handleChange('stop_sequences', stopSequences.length > 0 ? stopSequences : undefined);
  };

  return (
    <div className="relative">
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <Sliders size={16} />
        <span>Generation Settings</span>
        {hasChanges && (
          <div className="w-2 h-2 bg-blue-500 rounded-full" />
        )}
      </button>

      {/* Settings Panel */}
      {isOpen && (
        <div className="absolute top-full mt-2 right-0 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Generation Settings
            </h3>
            <div className="flex items-center space-x-2">
              {onReset && (
                <button
                  onClick={handleReset}
                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="Reset to defaults"
                >
                  <RotateCcw size={16} />
                </button>
              )}
              {onSave && hasChanges && (
                <button
                  onClick={handleSave}
                  className="p-1.5 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                  title="Save changes"
                >
                  <Save size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4 max-h-96 overflow-y-auto">
            {/* Temperature */}
            <Slider
              label="Temperature"
              value={localConfig.temperature}
              min={0}
              max={2}
              step={0.01}
              onChange={(value) => handleChange('temperature', value)}
              description="Controls randomness. Lower values make output more focused and deterministic."
            />

            {/* Max Tokens */}
            <Slider
              label="Max Tokens"
              value={localConfig.max_tokens}
              min={1}
              max={8192}
              step={1}
              onChange={(value) => handleChange('max_tokens', value)}
              description="Maximum number of tokens to generate in the response."
            />

            {/* Top P */}
            <Slider
              label="Top P"
              value={localConfig.top_p}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) => handleChange('top_p', value)}
              description="Nucleus sampling. Controls diversity via cumulative probability."
            />

            {/* Top K */}
            {localConfig.top_k !== undefined && (
              <Slider
                label="Top K"
                value={localConfig.top_k}
                min={1}
                max={100}
                step={1}
                onChange={(value) => handleChange('top_k', value)}
                description="Limits the number of highest probability tokens to consider."
              />
            )}

            {/* Frequency Penalty */}
            {localConfig.frequency_penalty !== undefined && (
              <Slider
                label="Frequency Penalty"
                value={localConfig.frequency_penalty}
                min={-2}
                max={2}
                step={0.01}
                onChange={(value) => handleChange('frequency_penalty', value)}
                description="Reduces repetition of tokens based on their frequency."
              />
            )}

            {/* Presence Penalty */}
            {localConfig.presence_penalty !== undefined && (
              <Slider
                label="Presence Penalty"
                value={localConfig.presence_penalty}
                min={-2}
                max={2}
                step={0.01}
                onChange={(value) => handleChange('presence_penalty', value)}
                description="Reduces repetition of any token that has appeared."
              />
            )}

            {/* Streaming */}
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={localConfig.stream}
                  onChange={(e) => handleChange('stream', e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Enable Streaming
                </span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Stream response tokens as they are generated.
              </p>
            </div>

            {/* Stop Sequences */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Stop Sequences
              </label>
              <input
                type="text"
                placeholder="Enter sequences separated by commas"
                value={localConfig.stop_sequences?.join(', ') || ''}
                onChange={(e) => handleStopSequenceChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Sequences where the API will stop generating tokens.
              </p>
            </div>
          </div>

          {/* Save/Cancel Actions */}
          {hasChanges && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <span className="text-sm text-amber-600 dark:text-amber-400">
                You have unsaved changes
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setLocalConfig(config);
                    setHasChanges(false);
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
                {onSave && (
                  <button
                    onClick={handleSave}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Save
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={onToggle}
        />
      )}
    </div>
  );
};
