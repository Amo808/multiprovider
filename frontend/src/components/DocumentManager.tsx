/**
 * DocumentManager Component
 * Handles document upload, listing, and management for RAG
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ragService, Document } from '../services/rag';

interface DocumentManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onDocumentSelect?: (documentId: string) => void;
}

type TabType = 'upload' | 'documents' | 'search';

const DocumentManager: React.FC<DocumentManagerProps> = ({
  isOpen,
  onClose,
  onDocumentSelect
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('documents');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [ragStatus, setRagStatus] = useState<{ configured: boolean; supported_types: string[] } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  // Load RAG status and documents on mount
  useEffect(() => {
    if (isOpen) {
      loadStatus();
      loadDocuments();
    }
  }, [isOpen]);

  const loadStatus = async () => {
    try {
      const status = await ragService.getStatus();
      setRagStatus(status);
    } catch (err) {
      console.error('Failed to load RAG status:', err);
    }
  };

  const loadDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const docs = await ragService.listDocuments();
      setDocuments(docs);
    } catch (err: any) {
      setError(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        await ragService.uploadDocument(file, undefined, (progress) => {
          setUploadProgress(progress);
        });
      }
      
      // Refresh document list
      await loadDocuments();
      setActiveTab('documents');
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    
    try {
      await ragService.deleteDocument(documentId);
      setDocuments(docs => docs.filter(d => d.id !== documentId));
    } catch (err: any) {
      setError(err.message || 'Delete failed');
    }
  };

  const handleReprocess = async (documentId: string) => {
    try {
      await ragService.reprocessDocument(documentId);
      await loadDocuments();
    } catch (err: any) {
      setError(err.message || 'Reprocess failed');
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    setError(null);
    
    try {
      const response = await ragService.search(searchQuery, { limit: 10 });
      setSearchResults(response.results);
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      ready: 'bg-green-500',
      processing: 'bg-yellow-500',
      pending: 'bg-blue-500',
      error: 'bg-red-500'
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs text-white ${colors[status] || 'bg-gray-500'}`}>
        {status}
      </span>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div 
        className="bg-[#1a1a2e] rounded-2xl w-[800px] max-h-[80vh] overflow-hidden shadow-2xl border border-white/10"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-xl font-semibold text-white">📚 Document Manager</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          {(['documents', 'upload', 'search'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-purple-400 border-b-2 border-purple-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab === 'documents' && '📄 Documents'}
              {tab === 'upload' && '⬆️ Upload'}
              {tab === 'search' && '🔍 Search'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-140px)]">
          {/* Error display */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error}
              <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-white">×</button>
            </div>
          )}

          {/* RAG not configured warning */}
          {ragStatus && !ragStatus.configured && (
            <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg text-yellow-400 text-sm">
              ⚠️ RAG system is not configured. Please set up Supabase credentials.
            </div>
          )}

          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 bg-purple-500/20 border-2 border-dashed border-purple-500 rounded-lg flex items-center justify-center z-10">
              <div className="text-purple-400 text-lg font-medium">Drop files here to upload</div>
            </div>
          )}

          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <div className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-4xl mb-4">📭</p>
                  <p>No documents yet</p>
                  <button
                    onClick={() => setActiveTab('upload')}
                    className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white text-sm transition-colors"
                  >
                    Upload your first document
                  </button>
                </div>
              ) : (
                documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="text-2xl">
                        {doc.content_type?.includes('pdf') ? '📕' : 
                         doc.content_type?.includes('word') ? '📘' :
                         doc.content_type?.includes('markdown') ? '📝' : '📄'}
                      </div>
                      <div>
                        <div className="font-medium text-white">{doc.name}</div>
                        <div className="text-xs text-gray-400 space-x-2">
                          <span>{formatFileSize(doc.file_size)}</span>
                          <span>•</span>
                          <span>{doc.total_chunks || 0} chunks</span>
                          <span>•</span>
                          {getStatusBadge(doc.status)}
                        </div>
                        {doc.error_message && (
                          <div className="text-xs text-red-400 mt-1">{doc.error_message}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {doc.status === 'error' && (
                        <button
                          onClick={() => handleReprocess(doc.id)}
                          className="p-2 hover:bg-white/10 rounded-lg text-yellow-400 transition-colors"
                          title="Reprocess"
                        >
                          🔄
                        </button>
                      )}
                      {onDocumentSelect && doc.status === 'ready' && (
                        <button
                          onClick={() => onDocumentSelect(doc.id)}
                          className="p-2 hover:bg-white/10 rounded-lg text-green-400 transition-colors"
                          title="Use in chat"
                        >
                          ✓
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="p-2 hover:bg-white/10 rounded-lg text-red-400 transition-colors"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
                  isDragging ? 'border-purple-500 bg-purple-500/10' : 'border-white/20 hover:border-white/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ragStatus?.supported_types?.join(',') || '.pdf,.txt,.md,.docx,.csv,.json'}
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className="hidden"
                />
                
                {uploading ? (
                  <div className="space-y-4">
                    <div className="text-4xl animate-bounce">📤</div>
                    <div className="text-white">Uploading...</div>
                    <div className="w-full bg-white/10 rounded-full h-2">
                      <div 
                        className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <div className="text-gray-400 text-sm">{uploadProgress}%</div>
                  </div>
                ) : (
                  <>
                    <div className="text-4xl mb-4">📁</div>
                    <p className="text-white mb-2">Drag and drop files here</p>
                    <p className="text-gray-400 text-sm mb-4">or</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition-colors"
                    >
                      Browse Files
                    </button>
                    <p className="text-gray-500 text-xs mt-4">
                      Supported: PDF, TXT, Markdown, DOCX, CSV, JSON (max 50MB)
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Search Tab */}
          {activeTab === 'search' && (
            <div className="space-y-4">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search your documents..."
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
                <button
                  onClick={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white transition-colors"
                >
                  {searching ? '...' : '🔍 Search'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-gray-400 text-sm">Results ({searchResults.length})</h3>
                  {searchResults.map((result, index) => (
                    <div
                      key={index}
                      className="p-4 bg-white/5 rounded-xl border border-white/10"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-purple-400 text-sm font-medium">
                          📄 {result.document_name}
                        </span>
                        <span className="text-gray-500 text-xs">
                          {(result.similarity * 100).toFixed(1)}% match
                        </span>
                      </div>
                      <p className="text-gray-300 text-sm line-clamp-3">
                        {result.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {searchResults.length === 0 && searchQuery && !searching && (
                <div className="text-center py-8 text-gray-400">
                  No results found for "{searchQuery}"
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentManager;
