/**
 * useRAG Hook
 * Provides RAG functionality for chat components
 * 
 * Extended with advanced settings:
 * - max_chunks: Number of chunks to retrieve (5-100)
 * - min_similarity: Minimum similarity threshold (0.1-0.9)
 * - keyword_weight: Weight for keyword/BM25 search (0-1)
 * - semantic_weight: Weight for semantic/vector search (0-1)
 * - use_rerank: Whether to use LLM reranking
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import ragService, { Document, SearchResult, RAGContextResponse } from '../services/rag';
import { RAGConfig } from '../types';
import { RAGSettings, DEFAULT_RAG_SETTINGS } from '../components/RAGSettingsPanel';

// RAG search modes (when RAG is enabled)
// 'off' is handled separately via ragEnabled flag
export type RAGSearchMode = 'off' | 'auto' | 'smart' | 'basic' | 'advanced' | 'ultimate' | 'hyde' | 'agentic' | 'full' | 'chapter';

interface UseRAGOptions {
  autoSearch?: boolean;
  maxTokens?: number;
  useHybrid?: boolean;
  defaultEnabled?: boolean;
  defaultMode?: RAGSearchMode;
  defaultSettings?: Partial<RAGSettings>;
}

interface UseRAGReturn {
  // State
  documents: Document[];
  selectedDocumentIds: string[];
  isLoading: boolean;
  error: string | null;
  ragContext: RAGContextResponse | null;

  // RAG Config for requests
  ragConfig: RAGConfig;
  ragEnabled: boolean;
  ragMode: RAGSearchMode;
  ragSettings: RAGSettings;

  // Actions
  loadDocuments: () => Promise<void>;
  selectDocument: (documentId: string) => void;
  deselectDocument: (documentId: string) => void;
  clearSelection: () => void;
  buildContext: (query: string) => Promise<string>;
  search: (query: string) => Promise<SearchResult[]>;
  setRagEnabled: (enabled: boolean) => void;
  setRagMode: (mode: RAGSearchMode) => void;
  setRagSettings: (settings: RAGSettings) => void;
  updateRagSettings: (partial: Partial<RAGSettings>) => void;

  // Status
  isConfigured: boolean;
  documentsCount: number;
}

// Storage key for persisting RAG settings
const RAG_SETTINGS_KEY = 'rag_settings';
const RAG_SETTINGS_VERSION = 7; // v7: RESET - ensure max_percent_limit is synced with chunk_percent

// Load settings from localStorage
const loadStoredSettings = (): RAGSettings => {
  try {
    const stored = localStorage.getItem(RAG_SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Check version - if outdated, return defaults
      if (parsed._version !== RAG_SETTINGS_VERSION) {
        console.info('[RAG] Settings version mismatch (stored:', parsed._version, 'current:', RAG_SETTINGS_VERSION, '), resetting to defaults');
        localStorage.removeItem(RAG_SETTINGS_KEY);
        return DEFAULT_RAG_SETTINGS;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _version, ...settings } = parsed;
      const merged = { ...DEFAULT_RAG_SETTINGS, ...settings };

      // SYNC: Ensure max_percent_limit and chunk_percent are the same
      // Use whichever is larger (user intent)
      const syncedPercent = Math.max(merged.max_percent_limit || 30, merged.chunk_percent || 30);
      merged.max_percent_limit = syncedPercent;
      merged.chunk_percent = syncedPercent;

      console.log('[RAG] Settings loaded from localStorage:', {
        chunk_mode: merged.chunk_mode,
        max_chunks: merged.max_chunks,
        min_chunks: merged.min_chunks,
        max_chunks_limit: merged.max_chunks_limit,
        max_percent_limit: merged.max_percent_limit,  // MAIN setting
        chunk_percent: merged.chunk_percent,
        min_similarity: merged.min_similarity
      });
      return merged;
    }
  } catch (e) {
    console.warn('Failed to load RAG settings from localStorage:', e);
  }
  console.log('[RAG] Using default settings');
  return DEFAULT_RAG_SETTINGS;
};

// Save settings to localStorage
const saveSettings = (settings: RAGSettings) => {
  try {
    // Add version to saved settings
    const toSave = { ...settings, _version: RAG_SETTINGS_VERSION };
    localStorage.setItem(RAG_SETTINGS_KEY, JSON.stringify(toSave));
    console.log('[RAG] Settings saved:', {
      chunk_mode: settings.chunk_mode,
      max_chunks: settings.max_chunks,
      min_chunks: settings.min_chunks,
      max_chunks_limit: settings.max_chunks_limit,
      max_percent_limit: settings.max_percent_limit,  // MAIN setting
      chunk_percent: settings.chunk_percent,
      min_similarity: settings.min_similarity
    });
  } catch (e) {
    console.warn('Failed to save RAG settings to localStorage:', e);
  }
};

export function useRAG(options: UseRAGOptions = {}): UseRAGReturn {
  const {
    maxTokens = 4000,
    useHybrid = true,
    defaultEnabled = true,
    defaultMode = 'smart',
    defaultSettings
  } = options;

  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ragContext, setRagContext] = useState<RAGContextResponse | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);

  // RAG configuration state
  const [ragEnabled, setRagEnabled] = useState(defaultEnabled);
  const [ragMode, setRagMode] = useState<RAGSearchMode>(defaultMode);

  // Advanced RAG settings - persisted in localStorage
  const [ragSettings, setRagSettingsState] = useState<RAGSettings>(() => ({
    ...loadStoredSettings(),
    ...defaultSettings
  }));

  // Persist settings on change
  const setRagSettings = useCallback((settings: RAGSettings) => {
    setRagSettingsState(settings);
    saveSettings(settings);
  }, []);

  // Partial update helper
  const updateRagSettings = useCallback((partial: Partial<RAGSettings>) => {
    setRagSettings({ ...ragSettings, ...partial });
  }, [ragSettings, setRagSettings]);

  // Build RAG config for API requests - now uses ragSettings with all new fields
  const ragConfig: RAGConfig = useMemo(() => ({
    enabled: ragEnabled && documents.length > 0,
    mode: ragMode,
    document_ids: selectedDocumentIds.length > 0 ? selectedDocumentIds : undefined,

    // Chunk mode settings
    chunk_mode: ragSettings.chunk_mode,
    max_chunks: ragSettings.max_chunks,
    chunk_percent: ragSettings.chunk_percent,
    min_chunks: ragSettings.min_chunks,
    max_chunks_limit: ragSettings.max_chunks_limit,
    max_percent_limit: ragSettings.max_percent_limit,  // MAIN user-facing limit!

    // Search settings
    min_similarity: ragSettings.min_similarity,
    use_rerank: ragSettings.use_rerank,
    keyword_weight: ragSettings.keyword_weight,
    semantic_weight: ragSettings.semantic_weight,
    include_metadata: ragSettings.include_metadata,
    debug_mode: ragSettings.debug_mode,

    // Orchestrator settings
    orchestrator: ragSettings.orchestrator ? {
      include_history: ragSettings.orchestrator.include_history,
      history_limit: ragSettings.orchestrator.history_limit,
      include_memory: ragSettings.orchestrator.include_memory,
      auto_retrieve: ragSettings.orchestrator.auto_retrieve,
      adaptive_chunks: ragSettings.orchestrator.adaptive_chunks,
      enable_web_search: ragSettings.orchestrator.enable_web_search,
      enable_code_execution: ragSettings.orchestrator.enable_code_execution,
    } : undefined
  }), [ragEnabled, documents.length, ragMode, selectedDocumentIds, ragSettings]);

  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check if RAG is configured
      const status = await ragService.getStatus();
      setIsConfigured(status.configured);

      if (status.configured) {
        const docs = await ragService.listDocuments('ready');
        setDocuments(docs);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load documents');
      setIsConfigured(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load documents on mount
  useEffect(() => {
    loadDocuments();
  }, []);

  const selectDocument = useCallback((documentId: string) => {
    setSelectedDocumentIds(prev =>
      prev.includes(documentId) ? prev : [...prev, documentId]
    );
  }, []);

  const deselectDocument = useCallback((documentId: string) => {
    setSelectedDocumentIds(prev => prev.filter(id => id !== documentId));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedDocumentIds([]);
    setRagContext(null);
  }, []);

  const buildContext = useCallback(async (query: string): Promise<string> => {
    if (selectedDocumentIds.length === 0) {
      // If no documents selected, search all documents
      try {
        const response = await ragService.buildContext(query, {
          maxTokens,
          useHybrid
        });
        setRagContext(response);
        return response.context;
      } catch (err: any) {
        console.error('Failed to build context:', err);
        return '';
      }
    }

    try {
      const response = await ragService.buildContext(query, {
        documentIds: selectedDocumentIds,
        maxTokens,
        useHybrid
      });
      setRagContext(response);
      return response.context;
    } catch (err: any) {
      setError(err.message || 'Failed to build context');
      return '';
    }
  }, [selectedDocumentIds, maxTokens, useHybrid]);

  const search = useCallback(async (query: string): Promise<SearchResult[]> => {
    try {
      const response = await ragService.search(query, {
        documentIds: selectedDocumentIds.length > 0 ? selectedDocumentIds : undefined,
        useHybrid
      });
      return response.results;
    } catch (err: any) {
      setError(err.message || 'Search failed');
      return [];
    }
  }, [selectedDocumentIds, useHybrid]);

  return {
    documents,
    selectedDocumentIds,
    isLoading,
    error,
    ragContext,
    ragConfig,
    ragEnabled,
    ragMode,
    ragSettings,
    loadDocuments,
    selectDocument,
    deselectDocument,
    clearSelection,
    buildContext,
    search,
    setRagEnabled,
    setRagMode,
    setRagSettings,
    updateRagSettings,
    isConfigured,
    documentsCount: documents.length
  };
}

export default useRAG;
