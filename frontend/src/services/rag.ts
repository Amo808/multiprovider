/**
 * RAG (Retrieval-Augmented Generation) API Service
 * Handles document upload, processing, and search
 */

import { extractTextFromPDF, textToFile, isPDF } from '../utils/pdfUtils';

const API_BASE_URL = '/api/rag';

export interface Document {
  id: string;
  name: string;
  content_type: string;
  file_size: number;
  status: 'pending' | 'processing' | 'ready' | 'error';
  total_chunks?: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  document_id: string;
  document_name: string;
  content: string;
  chunk_index: number;
  similarity: number;
}

export interface SearchResponse {
  results: SearchResult[];
  context: string;
}

export interface RAGContextResponse {
  context: string;
  sources: {
    document_id: string;
    document_name: string;
    chunk_index: number;
    similarity: number;
  }[];
}

class RAGService {
  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('jwt_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private getUserEmail(): string {
    // Get user email from stored auth info
    const authData = localStorage.getItem('auth_user');
    if (authData) {
      try {
        const user = JSON.parse(authData);
        return user.email || 'dev@example.com';
      } catch {
        return 'dev@example.com';
      }
    }
    return 'dev@example.com';
  }

  /**
   * Check RAG system status
   */
  async getStatus(): Promise<{ configured: boolean; supported_types: string[] }> {
    const response = await fetch(`${API_BASE_URL}/status`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get RAG status: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Upload a document for RAG processing
   * For PDFs: automatically extracts text with OCR fallback for scanned documents
   * 
   * @param file - File to upload
   * @param metadata - Optional metadata
   * @param onProgress - Progress callback (0-100)
   * @param onStatus - Status message callback
   * @param conversationId - Optional conversation ID to link document to specific chat
   */
  async uploadDocument(
    file: File,
    metadata?: Record<string, any>,
    onProgress?: (progress: number) => void,
    onStatus?: (status: string) => void,
    conversationId?: string  // NEW: Link to specific conversation
  ): Promise<Document> {
    let fileToUpload = file;

    // For PDFs, extract text with OCR fallback
    if (isPDF(file)) {
      onStatus?.('Extracting text from PDF...');
      try {
        const result = await extractTextFromPDF(file, (progress) => {
          // Map PDF progress to 0-50% range
          const mappedProgress = Math.round(progress.progress * 0.5);
          onProgress?.(mappedProgress);
          onStatus?.(progress.message);
        });

        // Convert extracted text to .txt file for upload
        fileToUpload = textToFile(result.text, file.name);

        // Add OCR info to metadata
        metadata = {
          ...metadata,
          original_filename: file.name,
          original_type: 'application/pdf',
          used_ocr: result.usedOCR,
          ocr_pages: result.ocrPages,
          page_count: result.pageCount
        };

        onStatus?.(result.usedOCR
          ? `OCR extracted text from ${result.ocrPages.length} pages`
          : 'Text extracted successfully'
        );
      } catch (err) {
        console.error('[RAG] PDF extraction failed:', err);
        // Fall back to uploading original PDF
        onStatus?.('PDF extraction failed, uploading original...');
      }
    }

    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('user_email', this.getUserEmail());

    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    // Add conversation_id if provided
    if (conversationId) {
      formData.append('conversation_id', conversationId);
    }

    onStatus?.('Uploading to server...');

    // Use XMLHttpRequest for progress tracking
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          // Map upload progress to 50-100% range (after PDF extraction)
          const progress = 50 + Math.round((event.loaded / event.total) * 50);
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            onStatus?.('Upload complete');
            resolve(response.document);
          } catch (e) {
            reject(new Error('Invalid response format'));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.detail || `Upload failed: ${xhr.statusText}`));
          } catch {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      xhr.open('POST', `${API_BASE_URL}/documents/upload`);

      // Add auth headers
      const authHeaders = this.getAuthHeaders();
      Object.entries(authHeaders).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      xhr.send(formData);
    });
  }

  /**
   * List all documents for current user, optionally filtered by conversation
   * 
   * @param status - Filter by status
   * @param limit - Max documents to return
   * @param conversationId - Optional conversation ID to filter documents
   */
  async listDocuments(status?: string, limit: number = 50, conversationId?: string): Promise<Document[]> {
    const params = new URLSearchParams({
      user_email: this.getUserEmail(),
      limit: limit.toString(),
    });

    if (status) {
      params.append('status', status);
    }

    // Add conversation_id filter if provided
    if (conversationId) {
      params.append('conversation_id', conversationId);
    }

    const response = await fetch(`${API_BASE_URL}/documents?${params}`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to list documents: ${response.statusText}`);
    }

    const data = await response.json();
    return data.documents;
  }

  /**
   * Get a specific document
   */
  async getDocument(documentId: string): Promise<Document> {
    const params = new URLSearchParams({
      user_email: this.getUserEmail(),
    });

    const response = await fetch(`${API_BASE_URL}/documents/${documentId}?${params}`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get document: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Delete a document
   */
  async deleteDocument(documentId: string): Promise<void> {
    const params = new URLSearchParams({
      user_email: this.getUserEmail(),
    });

    const response = await fetch(`${API_BASE_URL}/documents/${documentId}?${params}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete document: ${response.statusText}`);
    }
  }

  /**
   * Search documents
   */
  async search(
    query: string,
    options?: {
      documentIds?: string[];
      limit?: number;
      threshold?: number;
      useHybrid?: boolean;
    }
  ): Promise<SearchResponse> {
    const response = await fetch(`${API_BASE_URL}/search?user_email=${this.getUserEmail()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({
        query,
        document_ids: options?.documentIds,
        limit: options?.limit ?? 5,
        threshold: options?.threshold ?? 0.5,
        use_hybrid: options?.useHybrid ?? true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Build RAG context for a query
   */
  async buildContext(
    query: string,
    options?: {
      documentIds?: string[];
      maxTokens?: number;
      useHybrid?: boolean;
    }
  ): Promise<RAGContextResponse> {
    const response = await fetch(`${API_BASE_URL}/context?user_email=${this.getUserEmail()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({
        query,
        document_ids: options?.documentIds,
        max_tokens: options?.maxTokens ?? 4000,
        use_hybrid: options?.useHybrid ?? true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to build context: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Reprocess a failed document
   */
  async reprocessDocument(documentId: string): Promise<{ success: boolean; chunks_created: number }> {
    const params = new URLSearchParams({
      user_email: this.getUserEmail(),
    });

    const response = await fetch(`${API_BASE_URL}/reprocess/${documentId}?${params}`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to reprocess document: ${response.statusText}`);
    }

    return response.json();
  }
}

// Export singleton instance
export const ragService = new RAGService();
export default ragService;
