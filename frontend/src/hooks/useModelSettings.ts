import { useState, useEffect, useCallback, useRef } from 'react';
import { GenerationConfig, ModelProvider, ModelInfo } from '../types';
import { apiClient } from '../services/api';

export interface ModelSettings extends Partial<GenerationConfig> {
  system_prompt?: string;
}

interface UseModelSettingsReturn {
  settings: ModelSettings;
  loading: boolean;
  error: string | null;
  updateSettings: (patch: Partial<ModelSettings>) => Promise<void>;
  saveSettings: () => Promise<void>;
  hasChanges: boolean;
  resetToDefaults: () => void;
  applyMaxPreset: () => void;
  applyBalancedPreset: () => void;
  applyMinPreset: () => void;
  currentPreset: 'MAX' | 'Balanced' | 'MIN' | 'Custom';
  cyclePreset: () => void;
}

/**
 * Calculate max output tokens for a model - centralized logic
 * This should be synced with UnifiedModelMenu.tsx getMaxTokensLimit()
 */
export const getMaxTokensForModel = (model?: ModelInfo): number => {
  if (!model) return 8192;
  if (model.max_output_tokens) return model.max_output_tokens;
  
  const provider = model.provider;
  const id = model.id;
  
  if (provider === 'deepseek') return id === 'deepseek-reasoner' ? 65536 : 32768;
  if (provider === 'openai') {
    if (id?.startsWith('o1') || id?.startsWith('o3') || id?.startsWith('o4')) return 100000;
    if (id?.startsWith('gpt-5')) return 100000;
    if (id?.includes('gpt-4o')) return 16384;
    return 4096;
  }
  if (provider === 'anthropic') return 8192;
  if (provider === 'gemini') return 65536;
  
  return model.context_length || 8192;
};

// Default MAX settings for new models - everything at maximum for best results
const getMaxDefaultSettings = (model?: ModelInfo): ModelSettings => {
  // Calculate max_tokens based on model's capabilities
  const maxTokens = getMaxTokensForModel(model);
  
  return {
    temperature: 1.0,              // Max creativity
    max_tokens: maxTokens,         // Max output for this model
    top_p: 1.0,                    // No restriction
    frequency_penalty: 0.0,        // No penalty
    presence_penalty: 0.0,         // No penalty
    stream: true,
    system_prompt: '',
    thinking_budget: -1,           // Unlimited thinking (for reasoning models)
    include_thoughts: true,        // Show reasoning process
    verbosity: 'high',             // Max verbosity (GPT-5)
    reasoning_effort: 'high',      // Max reasoning effort (o1/o3/GPT-5)
    cfg_scale: undefined,          // No CFG restriction
    free_tool_calling: true        // Enable free tool calling
  };
};

/**
 * Hook for managing per-model generation settings.
 * Settings are stored both in localStorage (for fast access) and on the backend (for persistence).
 * NEW: By default uses MAX settings for new models (max_tokens, thinking_budget, etc.)
 */
export function useModelSettings(
  provider: ModelProvider | undefined,
  modelId: string | undefined,
  model?: ModelInfo  // NEW: pass model info to calculate proper max values
): UseModelSettingsReturn {
  const [settings, setSettings] = useState<ModelSettings>(() => getMaxDefaultSettings(model));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Track previous provider/model to detect changes
  const prevProviderRef = useRef<ModelProvider | undefined>();
  const prevModelIdRef = useRef<string | undefined>();
  const pendingSettingsRef = useRef<ModelSettings | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Generate storage key
  const getStorageKey = useCallback((p?: ModelProvider, m?: string) => {
    if (!p || !m) return null;
    return `model-settings:${p}:${m}`;
  }, []);
  
  // Get MAX default settings for current model
  const getMaxDefaults = useCallback(() => {
    return getMaxDefaultSettings(model);
  }, [model]);
  
  // Load settings from localStorage (fast) and then from backend (authoritative)
  const loadSettings = useCallback(async () => {
    if (!provider || !modelId) {
      setSettings(getMaxDefaults());
      return;
    }
    
    const storageKey = getStorageKey(provider, modelId);
    const maxDefaults = getMaxDefaults();
    
    // FIRST: Immediately load from localStorage for instant UI update
    if (storageKey) {
      try {
        const cached = localStorage.getItem(storageKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          console.log(`[useModelSettings] Instant load from localStorage for ${provider}:${modelId}:`, parsed);
          // Merge with MAX defaults - existing saved values take priority
          setSettings({ ...maxDefaults, ...parsed });
        } else {
          // No cache - use MAX defaults for new models
          console.log(`[useModelSettings] No cache found, applying MAX defaults for ${provider}:${modelId}`);
          setSettings(maxDefaults);
          // Save MAX defaults to localStorage immediately
          localStorage.setItem(storageKey, JSON.stringify(maxDefaults));
        }
      } catch (cacheError) {
        console.warn('[useModelSettings] Failed to load from localStorage:', cacheError);
        setSettings(maxDefaults);
      }
    } else {
      setSettings(maxDefaults);
    }
    
    // THEN: fetch from backend (authoritative source) - will override localStorage if different
    setLoading(true);
    setError(null);
    
    try {
      const data = await apiClient.getModelSettings(provider, modelId);
      const backendSettings = data.settings || {};
      console.log(`[useModelSettings] Loaded from backend for ${provider}:${modelId}:`, backendSettings);
      console.log(`[useModelSettings] Backend system_prompt for ${provider}:${modelId}:`, backendSettings.system_prompt || 'EMPTY');
      
      // If backend has no settings (empty or all defaults), use MAX defaults instead
      const backendKeys = Object.keys(backendSettings) as Array<keyof ModelSettings>;
      const hasRealBackendSettings = backendKeys.some(key => 
        backendSettings[key] !== undefined && backendSettings[key] !== null
      );
      
      const mergedSettings = hasRealBackendSettings 
        ? { ...maxDefaults, ...backendSettings }
        : maxDefaults;
      
      setSettings(mergedSettings);
      
      // Update localStorage cache
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(mergedSettings));
      }
      
      // If backend was empty, save MAX defaults to backend
      if (!hasRealBackendSettings) {
        console.log(`[useModelSettings] Backend empty, saving MAX defaults for ${provider}:${modelId}`);
        await apiClient.updateModelSettings(provider, modelId, maxDefaults);
      }
    } catch (e) {
      console.error('[useModelSettings] Failed to load from backend:', e);
      // We already loaded from localStorage above, so just log the error
      // The localStorage values will be used as fallback
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
      setHasChanges(false);
    }
  }, [provider, modelId, getStorageKey, getMaxDefaults]);
  
  // Save settings to backend (debounced)
  const saveToBackend = useCallback(async (settingsToSave: ModelSettings) => {
    if (!provider || !modelId) return;
    
    try {
      await apiClient.updateModelSettings(provider, modelId, settingsToSave);
      console.log(`[useModelSettings] Saved to backend for ${provider}:${modelId}`);
      setHasChanges(false);
    } catch (e) {
      console.error('[useModelSettings] Failed to save to backend:', e);
      setError(e instanceof Error ? e.message : 'Failed to save settings');
    }
  }, [provider, modelId]);
  
  // Update settings (local + debounced backend save)
  const updateSettings = useCallback(async (patch: Partial<ModelSettings>) => {
    if (!provider || !modelId) return;
    
    const storageKey = getStorageKey(provider, modelId);
    
    setSettings(prev => {
      const updated = { ...prev, ...patch };
      
      // Save to localStorage immediately
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch (e) {
          console.warn('[useModelSettings] Failed to save to localStorage:', e);
        }
      }
      
      // Queue for backend save (debounced)
      pendingSettingsRef.current = updated;
      
      return updated;
    });
    
    setHasChanges(true);
    
    // Debounce backend save
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      if (pendingSettingsRef.current) {
        saveToBackend(pendingSettingsRef.current);
        pendingSettingsRef.current = null;
      }
    }, 500);
  }, [provider, modelId, getStorageKey, saveToBackend]);
  
  // Force save now
  const saveSettings = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    await saveToBackend(settings);
  }, [settings, saveToBackend]);
  
  // Reset to MAX defaults
  const resetToDefaults = useCallback(() => {
    const maxDefaults = getMaxDefaults();
    setSettings(maxDefaults);
    setHasChanges(true);
    
    const storageKey = getStorageKey(provider, modelId);
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(maxDefaults));
    }
    
    // Also save to backend
    if (provider && modelId) {
      saveToBackend(maxDefaults);
    }
  }, [provider, modelId, getStorageKey, getMaxDefaults, saveToBackend]);
  
  // Apply MAX preset (same as reset now, but explicit action)
  const applyMaxPreset = useCallback(() => {
    resetToDefaults();
  }, [resetToDefaults]);
  
  // Apply Balanced preset - moderate values
  const applyBalancedPreset = useCallback(() => {
    const maxTokens = model?.max_output_tokens || model?.context_length || 8192;
    const balancedSettings: ModelSettings = {
      temperature: 0.7,                    // Balanced creativity
      max_tokens: Math.floor(maxTokens / 2), // Half of max
      top_p: 0.9,                          // Slight restriction
      frequency_penalty: 0.3,              // Slight penalty
      presence_penalty: 0.3,               // Slight penalty
      stream: true,
      system_prompt: settings.system_prompt, // Keep current system prompt
      thinking_budget: 10000,              // Limited thinking
      include_thoughts: true,              // Still show reasoning
      verbosity: 'medium',                 // Medium verbosity
      reasoning_effort: 'medium',          // Medium reasoning
      cfg_scale: undefined,
      free_tool_calling: true
    };
    
    setSettings(balancedSettings);
    setHasChanges(true);
    
    const storageKey = getStorageKey(provider, modelId);
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(balancedSettings));
    }
    
    if (provider && modelId) {
      saveToBackend(balancedSettings);
    }
  }, [model, settings.system_prompt, provider, modelId, getStorageKey, saveToBackend]);
  
  // Apply MIN preset - minimal/economical values
  const applyMinPreset = useCallback(() => {
    const minSettings: ModelSettings = {
      temperature: 0.3,                    // Low creativity, more deterministic
      max_tokens: 1024,                    // Minimal output
      top_p: 0.5,                          // More restricted
      frequency_penalty: 0.5,              // Higher penalty
      presence_penalty: 0.5,               // Higher penalty
      stream: true,
      system_prompt: settings.system_prompt, // Keep current system prompt
      thinking_budget: 1000,               // Minimal thinking
      include_thoughts: false,             // Don't show reasoning (faster)
      verbosity: 'low',                    // Low verbosity
      reasoning_effort: 'minimal',         // Minimal reasoning
      cfg_scale: undefined,
      free_tool_calling: false
    };
    
    setSettings(minSettings);
    setHasChanges(true);
    
    const storageKey = getStorageKey(provider, modelId);
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(minSettings));
    }
    
    if (provider && modelId) {
      saveToBackend(minSettings);
    }
  }, [settings.system_prompt, provider, modelId, getStorageKey, saveToBackend]);
  
  // Determine current preset based on settings
  const currentPreset = useCallback((): 'MAX' | 'Balanced' | 'MIN' | 'Custom' => {
    const maxTokens = model?.max_output_tokens || model?.context_length || 8192;
    
    // Check MAX preset
    if (
      settings.temperature === 1.0 &&
      settings.max_tokens === maxTokens &&
      settings.verbosity === 'high' &&
      settings.reasoning_effort === 'high'
    ) {
      return 'MAX';
    }
    
    // Check Balanced preset (allow some tolerance)
    if (
      settings.temperature === 0.7 &&
      Math.abs((settings.max_tokens || 0) - Math.floor(maxTokens / 2)) < 100 &&
      settings.verbosity === 'medium' &&
      settings.reasoning_effort === 'medium'
    ) {
      return 'Balanced';
    }
    
    // Check MIN preset
    if (
      settings.temperature === 0.3 &&
      settings.max_tokens === 1024 &&
      settings.verbosity === 'low' &&
      settings.reasoning_effort === 'minimal'
    ) {
      return 'MIN';
    }
    
    return 'Custom';
  }, [settings, model]);
  
  // Cycle through presets: MAX → Balanced → MIN → MAX
  const cyclePreset = useCallback(() => {
    const current = currentPreset();
    console.log('[useModelSettings] Cycling preset from:', current);
    
    switch (current) {
      case 'MAX':
        applyBalancedPreset();
        break;
      case 'Balanced':
        applyMinPreset();
        break;
      case 'MIN':
      case 'Custom':
      default:
        applyMaxPreset();
        break;
    }
  }, [currentPreset, applyMaxPreset, applyBalancedPreset, applyMinPreset]);
  
  // Load settings when provider/model changes
  useEffect(() => {
    const providerChanged = prevProviderRef.current !== provider;
    const modelChanged = prevModelIdRef.current !== modelId;
    
    if (providerChanged || modelChanged) {
      console.log(`[useModelSettings] Provider/model changed: ${prevProviderRef.current}:${prevModelIdRef.current} -> ${provider}:${modelId}`);
      
      // Save pending changes before switching
      if (pendingSettingsRef.current && prevProviderRef.current && prevModelIdRef.current) {
        saveToBackend(pendingSettingsRef.current);
        pendingSettingsRef.current = null;
      }
      
      prevProviderRef.current = provider;
      prevModelIdRef.current = modelId;
      
      loadSettings();
    }
  }, [provider, modelId, loadSettings, saveToBackend]);
  
  // NOTE: Removed auto-update of max_tokens when model info changes
  // This was causing conflicts with user-set presets (MIN/Balanced)
  // Users can manually reset to MAX if they want maximum tokens
  
  // Initial load
  useEffect(() => {
    if (provider && modelId) {
      loadSettings();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);
  
  return {
    settings,
    loading,
    error,
    updateSettings,
    saveSettings,
    hasChanges,
    resetToDefaults,
    applyMaxPreset,
    applyBalancedPreset,
    applyMinPreset,
    currentPreset: currentPreset(),
    cyclePreset
  };
}

export default useModelSettings;
