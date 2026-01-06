import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api';
import { largeStorage } from '../lib/largeStorage';

interface UseGlobalSystemPromptReturn {
  globalPrompt: string;
  loading: boolean;
  error: string | null;
  setGlobalPrompt: (prompt: string) => void;
  saveGlobalPrompt: () => Promise<void>;
  hasChanges: boolean;
}

const STORAGE_KEY = 'global-system-prompt';

/**
 * Hook for managing global system prompt that applies to ALL models.
 * This is like OpenRouter's "System Prompt" that gets prepended to every request.
 * Per-model prompts are added AFTER this global prompt.
 * Uses IndexedDB for large prompts (>100KB) to avoid Chrome localStorage limits.
 */
export function useGlobalSystemPrompt(): UseGlobalSystemPromptReturn {
  const [globalPrompt, setGlobalPromptState] = useState<string>('');
  const [savedPrompt, setSavedPrompt] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load from storage and backend on mount
  useEffect(() => {
    const loadPrompt = async () => {
      setLoading(true);
      
      // First, load from storage for instant UI (supports large data via IndexedDB)
      try {
        const cached = await largeStorage.getItem(STORAGE_KEY);
        if (cached) {
          setGlobalPromptState(cached);
          setSavedPrompt(cached);
        }
      } catch (e) {
        console.warn('[useGlobalSystemPrompt] Failed to load from storage:', e);
      }
      
      // Then fetch from backend (authoritative)
      try {
        const response = await apiClient.getGlobalSystemPrompt();
        const backendPrompt = response?.prompt || '';
        setGlobalPromptState(backendPrompt);
        setSavedPrompt(backendPrompt);
        if (backendPrompt) {
          await largeStorage.setItem(STORAGE_KEY, backendPrompt);
        }
      } catch (e) {
        // Fallback: try to get from config
        try {
          const config = await apiClient.getConfig();
          const backendPrompt = config?.system?.system_prompt || '';
          if (backendPrompt) {
            setGlobalPromptState(backendPrompt);
            setSavedPrompt(backendPrompt);
            await largeStorage.setItem(STORAGE_KEY, backendPrompt);
          }
        } catch (e2) {
          console.error('[useGlobalSystemPrompt] Failed to load from backend:', e2);
          setError(e2 instanceof Error ? e2.message : 'Failed to load global prompt');
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadPrompt();
  }, []);

  const setGlobalPrompt = useCallback((prompt: string) => {
    setGlobalPromptState(prompt);
    // Save to storage immediately for quick access (uses IndexedDB for large data)
    largeStorage.setItem(STORAGE_KEY, prompt).catch(e => {
      console.warn('[useGlobalSystemPrompt] Failed to save to storage:', e);
    });
  }, []);

  const saveGlobalPrompt = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      await apiClient.updateGlobalSystemPrompt(globalPrompt);
      setSavedPrompt(globalPrompt);
      console.log('[useGlobalSystemPrompt] Saved global prompt to backend');
    } catch (e) {
      console.error('[useGlobalSystemPrompt] Failed to save to backend:', e);
      setError(e instanceof Error ? e.message : 'Failed to save global prompt');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [globalPrompt]);

  const hasChanges = globalPrompt !== savedPrompt;

  return {
    globalPrompt,
    loading,
    error,
    setGlobalPrompt,
    saveGlobalPrompt,
    hasChanges
  };
}

export default useGlobalSystemPrompt;
