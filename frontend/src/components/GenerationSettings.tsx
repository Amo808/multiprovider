import React, { useState, useEffect, useRef } from 'react';
import { Sliders, RotateCcw, Save } from 'lucide-react';
import { GenerationConfig, ModelProvider, ModelInfo } from '../types';

interface GenerationSettingsProps {
  config: GenerationConfig;
  currentProvider?: ModelProvider;
  currentModel?: ModelInfo;
  onConfigChange: (config: Partial<GenerationConfig>) => void;
  onSave?: (config: GenerationConfig) => Promise<void>;
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
  currentProvider,
  currentModel,
  onConfigChange,
  onSave,
  onReset,
  isOpen,
  onToggle
}) => {
  const [localConfig, setLocalConfig] = useState<GenerationConfig>(config);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Keep track of previous provider to detect changes
  const previousProvider = useRef<ModelProvider | undefined>(currentProvider);

  // Get max tokens based on current model and provider
  const getMaxTokens = () => {
    // First priority: use model-specific max_output_tokens if available
    if (currentModel?.max_output_tokens) {
      return currentModel.max_output_tokens;
    }
    
    // Second priority: use model-specific recommended max
    if (currentModel?.recommended_max_tokens) {
      return currentModel.recommended_max_tokens;
    }
    
    // Third priority: provider-specific defaults based on official documentation
    switch (currentProvider) {
      case 'deepseek':
        // DeepSeek official limits from API docs:
        // deepseek-chat (Non-thinking): DEFAULT 4K, MAXIMUM 8K
        // deepseek-reasoner (Thinking): DEFAULT 32K, MAXIMUM 64K
        if (currentModel?.name?.toLowerCase().includes('reasoner') || 
            currentModel?.id?.toLowerCase().includes('reasoner') ||
            currentModel?.name?.toLowerCase().includes('r1')) {
          return 65536; // deepseek-reasoner: 64K max
        }
        return 8192; // deepseek-chat: 8K max
      case 'openai':
        return 131072; // GPT-5 supports up to 128k tokens
      case 'anthropic':
        // Claude models official limits from Anthropic docs:
        // Claude Opus 4.1: 32K max output tokens
        // Claude Sonnet 4.5 & Haiku 4.5: 64K max output tokens
        if (currentModel?.name?.toLowerCase().includes('opus') || 
            currentModel?.id?.toLowerCase().includes('opus')) {
          return 32000; // Claude Opus: exactly 32K max (API enforced)
        }
        if (currentModel?.name?.toLowerCase().includes('sonnet') || 
            currentModel?.id?.toLowerCase().includes('sonnet') ||
            currentModel?.name?.toLowerCase().includes('haiku') || 
            currentModel?.id?.toLowerCase().includes('haiku')) {
          return 64000; // Claude Sonnet 4.5 & Haiku 4.5: 64K max
        }
        return 64000; // Default for newer Claude models
      case 'gemini':
        return 32768;  // Gemini models limit
      default:
        return 8192;   // Conservative default
    }
  };

  // Get recommended default max tokens based on model type
  const getRecommendedMaxTokens = () => {
    switch (currentProvider) {
      case 'deepseek':
        // DeepSeek recommendations from docs:
        if (currentModel?.name?.toLowerCase().includes('reasoner') || 
            currentModel?.id?.toLowerCase().includes('reasoner') ||
            currentModel?.name?.toLowerCase().includes('r1')) {
          return 32768; // deepseek-reasoner: DEFAULT 32K
        }
        return 4096; // deepseek-chat: DEFAULT 4K
      case 'openai':
        return 4096; // Reasonable default for most use cases
      case 'anthropic':
        // Claude recommended defaults based on model type:
        if (currentModel?.name?.toLowerCase().includes('opus') || 
            currentModel?.id?.toLowerCase().includes('opus')) {
          return 8192; // Claude Opus: higher default for complex reasoning tasks
        }
        if (currentModel?.name?.toLowerCase().includes('sonnet') || 
            currentModel?.id?.toLowerCase().includes('sonnet')) {
          return 8192; // Claude Sonnet: good balance for coding and agents
        }
        if (currentModel?.name?.toLowerCase().includes('haiku') || 
            currentModel?.id?.toLowerCase().includes('haiku')) {
          return 4096; // Claude Haiku: optimized for speed, smaller outputs
        }
        return 6144; // Default for other Claude models
      case 'gemini':
        return 4096; // Reasonable default
      default:
        return 4096; // Conservative default
    }
  };

  // Get minimum tokens
  const getMinTokens = () => {
    return 1; // Universal minimum
  };

  useEffect(() => {
    // Only reset local config if:
    // 1. There are no pending changes AND not currently saving, OR
    // 2. The config has been significantly updated (different values)
    if (!hasChanges && !saving) {
      console.log('GenerationSettings: Updating localConfig from config prop');
      setLocalConfig(config);
    } else {
      console.log('GenerationSettings: Skipping config update - hasChanges:', hasChanges, 'saving:', saving);
    }
  }, [config, hasChanges, saving]);

  // Separate effect to track provider changes and reset max_tokens
  useEffect(() => {
    if (previousProvider.current && previousProvider.current !== currentProvider) {
      const recommendedTokens = getRecommendedMaxTokens();
      console.log(`GenerationSettings: Provider changed from ${previousProvider.current} to ${currentProvider}, resetting max_tokens to ${recommendedTokens}`);
      
      const newConfig = { ...localConfig, max_tokens: recommendedTokens };
      setLocalConfig(newConfig);
      onConfigChange({ max_tokens: recommendedTokens });
    }
    previousProvider.current = currentProvider;
  }, [currentProvider]);

  // Separate effect to validate max_tokens doesn't exceed limits
  useEffect(() => {
    const maxTokensLimit = getMaxTokens();
    const recommendedTokens = getRecommendedMaxTokens();
    
    if (localConfig.max_tokens > maxTokensLimit) {
      console.log(`GenerationSettings: max_tokens ${localConfig.max_tokens} exceeds limit ${maxTokensLimit}, correcting to ${recommendedTokens}`);
      const correctedConfig = { ...localConfig, max_tokens: recommendedTokens };
      setLocalConfig(correctedConfig);
      onConfigChange({ max_tokens: recommendedTokens });
    }
  }, [currentModel, localConfig.max_tokens]);

  // Debug logging
  useEffect(() => {
    console.log('GenerationSettings Debug:', {
      currentProvider,
      previousProvider: previousProvider.current,
      currentMaxTokens: localConfig.max_tokens,
      recommendedTokens: getRecommendedMaxTokens(),
      maxTokens: getMaxTokens(),
      modelName: currentModel?.name
    });
  }, [currentProvider, currentModel, localConfig.max_tokens]);

  const handleChange = (key: keyof GenerationConfig, value: any) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
    setHasChanges(true);
    onConfigChange({ [key]: value });
  };

  const handleSave = async () => {
    if (onSave) {
      try {
        setSaving(true);
        await onSave(localConfig);
        setHasChanges(false);
        // Update the local config to match what was saved
        // This ensures the form shows the saved values
        setLocalConfig(localConfig);
      } catch (error) {
        console.error('Failed to save generation settings:', error);
        // Don't reset hasChanges on error so user can try again
      } finally {
        setSaving(false);
      }
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

            {/* GPT-5 Verbosity */}
            {currentProvider === 'openai' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center justify-between">
                  <span>Verbosity (GPT-5)</span>
                  <select
                    value={localConfig.verbosity || ''}
                    onChange={(e) => handleChange('verbosity', e.target.value || undefined)}
                    className="ml-2 text-xs border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                  >
                    <option value="">default</option>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">Scales output length/detail without editing prompt.</p>
              </div>
            )}

            {/* GPT-5 Reasoning Effort */}
            {currentProvider === 'openai' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center justify-between">
                  <span>Reasoning Effort</span>
                  <select
                    value={localConfig.reasoning_effort || ''}
                    onChange={(e) => handleChange('reasoning_effort', e.target.value || undefined)}
                    className="ml-2 text-xs border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                  >
                    <option value="">default</option>
                    <option value="minimal">minimal</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">minimal = fastest (few/no reasoning tokens).</p>
              </div>
            )}

            {/* CFG Scale */}
            {currentProvider === 'openai' && (
              <Slider
                label="CFG Scale"
                value={localConfig.cfg_scale || 0}
                min={0}
                max={10}
                step={0.1}
                onChange={(value) => handleChange('cfg_scale', value === 0 ? undefined : value)}
                description="Experimental guidance strength for constrained outputs (placeholder)."
              />
            )}

            {/* Free Tool Calling */}
            {currentProvider === 'openai' && (
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={!!localConfig.free_tool_calling}
                    onChange={(e) => handleChange('free_tool_calling', e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Free-Form Tool Calling</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">Allow raw text payload to custom tools (no JSON wrapping).</p>
              </div>
            )}

            {/* Grammar Definition (collapsible) */}
            {currentProvider === 'openai' && (
              <details className="border border-gray-200 dark:border-gray-700 rounded-md p-2">
                <summary className="text-sm font-medium cursor-pointer text-gray-700 dark:text-gray-300">Grammar (CFG/Lark) Definition</summary>
                <textarea
                  className="mt-2 w-full h-24 text-xs font-mono p-2 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                  placeholder="Optional Lark grammar definition..."
                  value={localConfig.grammar_definition || ''}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleChange('grammar_definition', e.target.value || undefined)}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">Provide Lark grammar to constrain output (future enforcement).</p>
              </details>
            )}

            {/* Tools JSON */}
            {currentProvider === 'openai' && (
              <details className="border border-gray-200 dark:border-gray-700 rounded-md p-2">
                <summary className="text-sm font-medium cursor-pointer text-gray-700 dark:text-gray-300">Tools (JSON)</summary>
                <textarea
                  className="mt-2 w-full h-24 text-xs font-mono p-2 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                  placeholder='[ { "type": "custom", "name": "code_exec", "description": "Executes python" } ]'
                  value={(() => { try { return localConfig.tools ? JSON.stringify(localConfig.tools, null, 2) : ''; } catch { return ''; } })()}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    if (!val) return handleChange('tools', undefined);
                    try {
                      const parsed = JSON.parse(val);
                      if (Array.isArray(parsed)) handleChange('tools', parsed);
                    } catch {
                      // ignore parse errors silently
                    }
                  }}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">Define custom tools (use type 'custom' for free-form calls).</p>
              </details>
            )}

            {/* Thinking Budget (Gemini) */}
            {currentProvider === 'gemini' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Thinking Budget
                  </label>
                  <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                    {localConfig.thinking_budget === undefined ? 'auto(-1)' : localConfig.thinking_budget}
                  </span>
                </div>
                <input
                  type="range"
                  min={-1}
                  max={24576}
                  step={1}
                  value={localConfig.thinking_budget ?? -1}
                  onChange={(e) => handleChange('thinking_budget', Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${(((localConfig.thinking_budget ?? -1) + 1) / (24576 + 1)) * 100}%, #e5e7eb ${(((localConfig.thinking_budget ?? -1) + 1) / (24576 + 1)) * 100}%, #e5e7eb 100%)`
                  }}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <span className="block">Controls Gemini reasoning depth:</span>
                  <span className="block">-1 = Dynamic (model decides), 0 = Off, {'>'}0 = fixed thinking tokens.</span>
                </p>
                <div className="flex items-center space-x-2 pt-1">
                  <button
                    onClick={() => handleChange('thinking_budget', -1)}
                    className="px-2 py-1 text-xs rounded border border-purple-300 dark:border-purple-600 text-purple-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30"
                  >Auto (-1)</button>
                  <button
                    onClick={() => handleChange('thinking_budget', 0)}
                    className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >Off (0)</button>
                  <button
                    onClick={() => handleChange('thinking_budget', 4096)}
                    className="px-2 py-1 text-xs rounded border border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                  >4K</button>
                  <button
                    onClick={() => handleChange('thinking_budget', 8192)}
                    className="px-2 py-1 text-xs rounded border border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                  >8K</button>
                </div>
                <label className="flex items-center space-x-2 pt-2">
                  <input
                    type="checkbox"
                    checked={!!localConfig.include_thoughts}
                    onChange={(e) => handleChange('include_thoughts', e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-purple-600 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                  />
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    Include thought summary (if supported)
                  </span>
                </label>
              </div>
            )}

            {/* Max Tokens */}
            <div className="space-y-2">
              <Slider
                label="Max Tokens"
                value={localConfig.max_tokens}
                min={getMinTokens()}
                max={getMaxTokens()}
                step={1}
                onChange={(value) => handleChange('max_tokens', value)}
                description={`Model: ${currentModel?.name || currentProvider || 'Unknown'} | Recommended: ${getRecommendedMaxTokens()} | Maximum: ${getMaxTokens()}`}
              />
              {/* Quick preset buttons */}
              <div className="flex items-center space-x-2 pt-1">
                <button
                  onClick={() => handleChange('max_tokens', getRecommendedMaxTokens())}
                  className="px-2 py-1 text-xs rounded border border-green-300 dark:border-green-600 text-green-600 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/30"
                  title={`Set to recommended default: ${getRecommendedMaxTokens()}`}
                >
                  Default ({getRecommendedMaxTokens()})
                </button>
                <button
                  onClick={() => handleChange('max_tokens', getMaxTokens())}
                  className="px-2 py-1 text-xs rounded border border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                  title={`Set to maximum: ${getMaxTokens()}`}
                >
                  Max ({getMaxTokens()})
                </button>
              </div>
            </div>

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
                    disabled={saving}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-1"
                  >
                    {saving && (
                      <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent" />
                    )}
                    <span>{saving ? 'Saving...' : 'Save'}</span>
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
