import React, { useState, useEffect, useRef } from 'react';
import { Sliders, RotateCcw, Save } from 'lucide-react';
import { GenerationConfig, ModelProvider, ModelInfo } from '../types';
import { getModelMaxOutputTokens, getModelDefaultTokens, validateMaxTokens } from '../utils/modelLimits';

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

  // Keep track of previous provider and model to detect changes
  const previousProvider = useRef<ModelProvider | undefined>(currentProvider);
  const previousModel = useRef<string | undefined>(currentModel?.id);

  // Generate unique key for model-specific settings
  const getModelKey = (provider?: ModelProvider, modelId?: string) => {
    if (!provider || !modelId) return 'default';
    return `${provider}-${modelId}`;
  };

  // Load model-specific settings from localStorage
  const loadModelSettings = (provider?: ModelProvider, modelId?: string): Partial<GenerationConfig> => {
    try {
      const key = getModelKey(provider, modelId);
      const saved = localStorage.getItem(`model-settings-${key}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log(`LoadedModelSettings for ${key}:`, parsed);
        return parsed;
      }
    } catch (error) {
      console.warn('Failed to load model settings:', error);
    }
    return {};
  };

  // Save model-specific settings to localStorage
  const saveModelSettings = (provider?: ModelProvider, modelId?: string, settings?: Partial<GenerationConfig>) => {
    if (!provider || !modelId || !settings) return;

    try {
      const key = getModelKey(provider, modelId);
      // Only save the settings we want to remember per model
      const settingsToSave = {
        temperature: settings.temperature,
        max_tokens: settings.max_tokens,
        top_p: settings.top_p,
        presence_penalty: settings.presence_penalty,
        frequency_penalty: settings.frequency_penalty,
        thinking_budget: settings.thinking_budget,
        include_thoughts: settings.include_thoughts,
        reasoning_effort: settings.reasoning_effort,
        verbosity: settings.verbosity,
        cfg_scale: settings.cfg_scale,
        free_tool_calling: settings.free_tool_calling
      };
      localStorage.setItem(`model-settings-${key}`, JSON.stringify(settingsToSave));
      console.log(`SavedModelSettings for ${key}:`, settingsToSave);
    } catch (error) {
      console.warn('Failed to save model settings:', error);
    }
  };

  // Get max tokens based on current model - uses shared utility
  const getMaxTokens = () => {
    if (!currentModel) {
      // Fallback to provider defaults if no model
      switch (currentProvider) {
        case 'deepseek': return 8192;
        case 'openai': return 16384;
        case 'anthropic': return 64000;
        case 'gemini': return 32768;
        default: return 8192;
      }
    }
    return getModelMaxOutputTokens(currentModel);
  };

  // Get recommended default max tokens - uses shared utility
  const getRecommendedMaxTokens = () => {
    if (!currentModel) {
      return 4096; // Conservative default
    }
    return getModelDefaultTokens(currentModel);
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

  // Effect to handle provider/model changes with model-specific settings
  useEffect(() => {
    const currentModelId = currentModel?.id;
    const hasProviderChanged = previousProvider.current && previousProvider.current !== currentProvider;
    const hasModelChanged = previousModel.current && previousModel.current !== currentModelId;

    if (hasProviderChanged || hasModelChanged) {
      console.log(`GenerationSettings: Model changed from ${previousProvider.current}/${previousModel.current} to ${currentProvider}/${currentModelId}`);

      // Save current settings before switching
      if (previousProvider.current && previousModel.current) {
        saveModelSettings(previousProvider.current, previousModel.current, localConfig);
      }

      // Load saved settings for new model
      const savedSettings = loadModelSettings(currentProvider, currentModelId);

      // Get default max_tokens (use MAXIMUM, not recommended)
      const maxTokensLimit = getMaxTokens();

      // Validate saved max_tokens against model's actual limits
      const validatedMaxTokens = currentModel && savedSettings.max_tokens !== undefined
        ? validateMaxTokens(savedSettings.max_tokens, currentModel)
        : undefined;

      // Create new config with saved settings or defaults
      const newConfig = {
        ...localConfig,
        ...savedSettings,
        // Use validated max_tokens, or default to model's limit if not saved
        max_tokens: validatedMaxTokens ?? maxTokensLimit
      };

      console.log(`GenerationSettings: Applying settings for ${currentProvider}/${currentModelId}:`, {
        savedMaxTokens: savedSettings.max_tokens,
        validatedMaxTokens,
        maxTokensLimit,
        modelMaxOutput: currentModel?.max_output_tokens,
        finalMaxTokens: newConfig.max_tokens
      });
      setLocalConfig(newConfig);
      onConfigChange(newConfig);
    }

    // Update refs
    previousProvider.current = currentProvider;
    previousModel.current = currentModelId;
  }, [currentProvider, currentModel?.id]);

  // Separate effect to validate max_tokens doesn't exceed limits
  useEffect(() => {
    const maxTokensLimit = getMaxTokens();

    if (localConfig.max_tokens > maxTokensLimit) {
      console.log(`GenerationSettings: max_tokens ${localConfig.max_tokens} exceeds limit ${maxTokensLimit}, correcting to ${maxTokensLimit}`);
      const correctedConfig = { ...localConfig, max_tokens: maxTokensLimit };
      setLocalConfig(correctedConfig);
      onConfigChange({ max_tokens: maxTokensLimit });
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

    // Auto-save model-specific settings on change (debounced via localStorage)
    if (currentProvider && currentModel?.id) {
      saveModelSettings(currentProvider, currentModel.id, newConfig);
    }
  };

  const handleSave = async () => {
    if (onSave) {
      try {
        setSaving(true);
        await onSave(localConfig);
        setHasChanges(false);

        // Also save model-specific settings
        if (currentProvider && currentModel?.id) {
          saveModelSettings(currentProvider, currentModel.id, localConfig);
        }

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

          {/* Quick Presets */}
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
            <span className="text-xs text-gray-500 dark:text-gray-400">Quick:</span>
            <button
              onClick={() => {
                const maxTokensLimit = getMaxTokens();
                console.log(`[GenerationSettings] MAX preset: maxTokensLimit=${maxTokensLimit}, model=${currentModel?.id}`);
                const newConfig: GenerationConfig = {
                  ...localConfig,
                  temperature: 1.0,  // Maximum creativity
                  max_tokens: maxTokensLimit,  // Maximum output length
                  top_p: 1.0,  // No nucleus sampling restriction
                  top_k: undefined,  // No top-k restriction
                  frequency_penalty: 0,  // No frequency penalty
                  presence_penalty: 0,  // No presence penalty
                  // Advanced params for maximum output
                  reasoning_effort: 'high' as const,  // Maximum reasoning (for o1/o3/GPT-5)
                  verbosity: 'high' as const,  // Maximum verbosity (GPT-5)
                  thinking_budget: -1,  // Unlimited thinking (DeepSeek/Gemini)
                  include_thoughts: true,  // Show reasoning process
                  cfg_scale: undefined,  // No CFG restriction
                  free_tool_calling: true,  // Enable free tool calling
                };
                setLocalConfig(newConfig);
                onConfigChange(newConfig);
                setHasChanges(true);
                // Auto-save for model
                if (currentProvider && currentModel?.id) {
                  saveModelSettings(currentProvider, currentModel.id, newConfig);
                }
              }}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-gradient-to-r from-red-500 to-orange-500 text-white hover:from-red-600 hover:to-orange-600 shadow-sm transition-all"
              title={`🔥 MAXIMUM: temp=1.0, max_tokens=${getMaxTokens()}, reasoning=high, unlimited thinking`}
            >
              🔥 MAX
            </button>
            <button
              onClick={() => {
                const recommendedTokens = getRecommendedMaxTokens();
                const newConfig: GenerationConfig = {
                  ...localConfig,
                  temperature: 0.7,  // Balanced creativity
                  max_tokens: recommendedTokens,  // Reasonable output
                  top_p: 0.95,  // Slight nucleus sampling
                  top_k: undefined,
                  frequency_penalty: 0,
                  presence_penalty: 0,
                  reasoning_effort: 'medium' as const,
                  verbosity: 'medium' as const,
                  thinking_budget: -1,  // Auto thinking
                  include_thoughts: false,
                  cfg_scale: undefined,
                  free_tool_calling: false,
                };
                setLocalConfig(newConfig);
                onConfigChange(newConfig);
                setHasChanges(true);
                if (currentProvider && currentModel?.id) {
                  saveModelSettings(currentProvider, currentModel.id, newConfig);
                }
              }}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 shadow-sm transition-all"
              title="⚖️ Balanced: temp=0.7, recommended tokens, medium reasoning"
            >
              ⚖️ Balanced
            </button>
            <button
              onClick={() => {
                const newConfig: GenerationConfig = {
                  ...localConfig,
                  temperature: 0.1,  // Very deterministic
                  max_tokens: 1024,  // Short output
                  top_p: 0.5,  // Strict nucleus sampling
                  top_k: 10,  // Very limited sampling
                  frequency_penalty: 0.5,  // Reduce repetition
                  presence_penalty: 0,
                  reasoning_effort: 'minimal' as const,  // Fast, no deep reasoning
                  verbosity: 'low' as const,  // Concise
                  thinking_budget: 0,  // No extended thinking
                  include_thoughts: false,
                  cfg_scale: undefined,
                  free_tool_calling: false,
                };
                setLocalConfig(newConfig);
                onConfigChange(newConfig);
                setHasChanges(true);
                if (currentProvider && currentModel?.id) {
                  saveModelSettings(currentProvider, currentModel.id, newConfig);
                }
              }}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600 shadow-sm transition-all"
              title="❄️ Minimal: temp=0.1, 1K tokens, fast & deterministic"
            >
              ❄️ MIN
            </button>
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
