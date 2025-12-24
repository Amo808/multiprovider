/**
 * useRAG Hook
 * Provides RAG functionality for chat components
 */
import { useState, useCallback } from 'react';
import ragService, { Document, SearchResult, RAGContextResponse } from '../services/rag';

interface UseRAGOptions {
  autoSearch?: boolean;
  maxTokens?: number;
  useHybrid?: boolean;
}

interface UseRAGReturn {
  // State
  documents: Document[];
  selectedDocumentIds: string[];
  isLoading: boolean;
  error: string | null;
  ragContext: RAGContextResponse | null;
  
  // Actions
  loadDocuments: () => Promise<void>;
  selectDocument: (documentId: string) => void;
  deselectDocument: (documentId: string) => void;
  clearSelection: () => void;
  buildContext: (query: string) => Promise<string>;
  search: (query: string) => Promise<SearchResult[]>;
  
  // Status
  isConfigured: boolean;
}

export function useRAG(options: UseRAGOptions = {}): UseRAGReturn {
  const { maxTokens = 4000, useHybrid = true } = options;
  
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ragContext, setRagContext] = useState<RAGContextResponse | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);

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
    loadDocuments,
    selectDocument,
    deselectDocument,
    clearSelection,
    buildContext,
    search,
    isConfigured
  };
}

export default useRAG;
