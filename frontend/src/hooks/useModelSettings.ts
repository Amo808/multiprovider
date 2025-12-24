import { useState, useEffect, useCallback, useRef } from 'react';
import { GenerationConfig, ModelProvider } from '../types';
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
}

const DEFAULT_SETTINGS: ModelSettings = {
  temperature: 0.7,
  max_tokens: 8192,
  top_p: 1.0,
  frequency_penalty: 0.0,
  presence_penalty: 0.0,
  stream: true,
  system_prompt: '',
  thinking_budget: undefined,
  include_thoughts: false,
  verbosity: undefined,
  reasoning_effort: undefined,
  cfg_scale: undefined,
  free_tool_calling: false
};

/**
 * Hook for managing per-model generation settings.
 * Settings are stored both in localStorage (for fast access) and on the backend (for persistence).
 */
export function useModelSettings(
  provider: ModelProvider | undefined,
  modelId: string | undefined
): UseModelSettingsReturn {
  const [settings, setSettings] = useState<ModelSettings>(DEFAULT_SETTINGS);
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
  
  // Load settings from localStorage (fast) and then from backend (authoritative)
  const loadSettings = useCallback(async () => {
    if (!provider || !modelId) {
      setSettings(DEFAULT_SETTINGS);
      return;
    }
    
    const storageKey = getStorageKey(provider, modelId);
    
    // Then, fetch from backend (authoritative source) - always prioritize backend
    setLoading(true);
    setError(null);
    
    try {
      const data = await apiClient.getModelSettings(provider, modelId);
      const backendSettings = data.settings || {};
      console.log(`[useModelSettings] Loaded from backend for ${provider}:${modelId}:`, backendSettings);
      
      const mergedSettings = { ...DEFAULT_SETTINGS, ...backendSettings };
      setSettings(mergedSettings);
      
      // Update localStorage cache
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(mergedSettings));
      }
    } catch (e) {
      console.error('[useModelSettings] Failed to load from backend:', e);
      
      // Fallback to localStorage only on error
      if (storageKey) {
        try {
          const cached = localStorage.getItem(storageKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            console.log(`[useModelSettings] Fallback to localStorage for ${provider}:${modelId}:`, parsed);
            setSettings({ ...DEFAULT_SETTINGS, ...parsed });
          }
        } catch (cacheError) {
          console.warn('[useModelSettings] Failed to load from localStorage:', cacheError);
        }
      }
      // On error, keep localStorage cached values if available
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
      setHasChanges(false);
    }
  }, [provider, modelId, getStorageKey]);
  
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
  
  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    setHasChanges(true);
    
    const storageKey = getStorageKey(provider, modelId);
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
  }, [provider, modelId, getStorageKey]);
  
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
    resetToDefaults
  };
}

export default useModelSettings;
