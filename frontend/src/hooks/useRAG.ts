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
  conversationId?: string;  // NEW: Filter documents by conversation
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
  conversationId: string | undefined;  // NEW: Current conversation ID

  // Actions
  loadDocuments: (conversationId?: string) => Promise<void>;  // UPDATED: Optional conversation filter
  selectDocument: (documentId: string) => void;
  deselectDocument: (documentId: string) => void;
  clearSelection: () => void;
  buildContext: (query: string) => Promise<string>;
  search: (query: string) => Promise<SearchResult[]>;
  setRagEnabled: (enabled: boolean) => void;
  setRagMode: (mode: RAGSearchMode) => void;
  setRagSettings: (settings: RAGSettings) => void;
  updateRagSettings: (partial: Partial<RAGSettings>) => void;
  setConversationId: (id: string | undefined) => void;  // NEW: Change conversation context

  // Status
  isConfigured: boolean;
  documentsCount: number;
}

// Storage key for persisting RAG settings
const RAG_SETTINGS_KEY = 'rag_settings';
const RAG_ENABLED_KEY = 'rag_enabled';
const RAG_SELECTED_DOCS_KEY = 'rag_selected_docs';
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
    defaultEnabled = false,  // RAG DISABLED by default - user must explicitly enable
    defaultMode = 'smart',
    defaultSettings,
    conversationId: initialConversationId  // NEW: Initial conversation ID
  } = options;

  // Conversation ID state - documents are per-conversation
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>(() => {
    // Load selected documents from localStorage - now per conversation
    try {
      const key = initialConversationId
        ? `${RAG_SELECTED_DOCS_KEY}_${initialConversationId}`
        : RAG_SELECTED_DOCS_KEY;
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          console.log('[RAG] Loaded selected documents from localStorage:', parsed, 'for conversation:', initialConversationId);
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[RAG] Failed to load selected documents:', e);
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ragContext, setRagContext] = useState<RAGContextResponse | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);

  // RAG configuration state - load from localStorage
  const [ragEnabled, setRagEnabledState] = useState(() => {
    try {
      const stored = localStorage.getItem(RAG_ENABLED_KEY);
      if (stored !== null) {
        const enabled = JSON.parse(stored);
        console.log('[RAG] Loaded ragEnabled from localStorage:', enabled);
        return enabled;
      }
    } catch (e) {
      console.warn('[RAG] Failed to load ragEnabled:', e);
    }
    return defaultEnabled;
  });

  // Wrapper for setRagEnabled that persists to localStorage
  const setRagEnabled = useCallback((enabled: boolean) => {
    setRagEnabledState(enabled);
    try {
      localStorage.setItem(RAG_ENABLED_KEY, JSON.stringify(enabled));
      console.log('[RAG] Saved ragEnabled to localStorage:', enabled);
    } catch (e) {
      console.warn('[RAG] Failed to save ragEnabled:', e);
    }
  }, []);

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
        // Load documents filtered by conversation if conversationId is provided
        const docs = await ragService.listDocuments('ready', 50, conversationId);
        setDocuments(docs);
        console.log(`[RAG] Loaded ${docs.length} documents for conversation: ${conversationId || 'ALL'}`);

        // Clean up selectedDocumentIds - remove any that no longer exist
        const existingDocIds = new Set(docs.map(d => d.id));
        setSelectedDocumentIds(prev => {
          const filtered = prev.filter(id => existingDocIds.has(id));
          if (filtered.length !== prev.length) {
            console.log('[RAG] Cleaned up selected documents - removed non-existent docs');
            // Save cleaned list (per conversation)
            const key = conversationId
              ? `${RAG_SELECTED_DOCS_KEY}_${conversationId}`
              : RAG_SELECTED_DOCS_KEY;
            try {
              localStorage.setItem(key, JSON.stringify(filtered));
            } catch (e) {
              console.warn('[RAG] Failed to save cleaned documents:', e);
            }
          }
          return filtered;
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load documents');
      setIsConfigured(false);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  // Reload documents when conversation changes
  useEffect(() => {
    loadDocuments();
    // Also reload selected documents for this conversation
    const key = conversationId
      ? `${RAG_SELECTED_DOCS_KEY}_${conversationId}`
      : RAG_SELECTED_DOCS_KEY;
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setSelectedDocumentIds(parsed);
          console.log('[RAG] Loaded selected documents for conversation:', conversationId, parsed);
        }
      } else {
        setSelectedDocumentIds([]);
      }
    } catch (e) {
      console.warn('[RAG] Failed to load selected documents:', e);
      setSelectedDocumentIds([]);
    }
  }, [conversationId, loadDocuments]);

  // Helper to save selected documents to localStorage (per conversation)
  const saveSelectedDocs = useCallback((docs: string[]) => {
    const key = conversationId
      ? `${RAG_SELECTED_DOCS_KEY}_${conversationId}`
      : RAG_SELECTED_DOCS_KEY;
    try {
      localStorage.setItem(key, JSON.stringify(docs));
      console.log('[RAG] Saved selected documents to localStorage:', docs, 'for conversation:', conversationId);
    } catch (e) {
      console.warn('[RAG] Failed to save selected documents:', e);
    }
  }, [conversationId]);

  const selectDocument = useCallback((documentId: string) => {
    setSelectedDocumentIds(prev => {
      if (prev.includes(documentId)) return prev;
      const newList = [...prev, documentId];
      saveSelectedDocs(newList);
      return newList;
    });
  }, [saveSelectedDocs]);

  const deselectDocument = useCallback((documentId: string) => {
    setSelectedDocumentIds(prev => {
      const newList = prev.filter(id => id !== documentId);
      saveSelectedDocs(newList);
      return newList;
    });
  }, [saveSelectedDocs]);

  const clearSelection = useCallback(() => {
    setSelectedDocumentIds([]);
    saveSelectedDocs([]);
    setRagContext(null);
  }, [saveSelectedDocs]);

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
    conversationId,        // NEW: Current conversation ID
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
    setConversationId,     // NEW: Change conversation context
    isConfigured,
    documentsCount: documents.length
  };
}

export default useRAG;
