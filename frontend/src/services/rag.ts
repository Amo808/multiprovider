/**
 * RAG (Retrieval-Augmented Generation) API Service
 * Handles document upload, processing, and search
 */

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
   */
  async uploadDocument(
    file: File,
    metadata?: Record<string, any>,
    onProgress?: (progress: number) => void
  ): Promise<Document> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_email', this.getUserEmail());
    
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    // Use XMLHttpRequest for progress tracking
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
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
   * List all documents for current user
   */
  async listDocuments(status?: string, limit: number = 50): Promise<Document[]> {
    const params = new URLSearchParams({
      user_email: this.getUserEmail(),
      limit: limit.toString(),
    });
    
    if (status) {
      params.append('status', status);
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
