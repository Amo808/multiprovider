-- =============================================================================
-- Migration: Advanced Document RAG with Vector Search (FIXED)
-- =============================================================================
-- This creates tables for storing document chunks with embeddings
-- for precise citation-based RAG search
-- =============================================================================

-- Enable pgvector extension if not exists
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- Drop existing objects if they exist (for clean re-run)
-- =============================================================================
DROP TRIGGER IF EXISTS trigger_update_document_on_chunk_insert ON document_chunks;
DROP TRIGGER IF EXISTS trigger_update_document_on_chunk_delete ON document_chunks;
DROP FUNCTION IF EXISTS update_document_timestamp_insert();
DROP FUNCTION IF EXISTS update_document_timestamp_delete();
DROP FUNCTION IF EXISTS search_document_chunks(vector(384), INT, TEXT, TEXT, FLOAT);
DROP FUNCTION IF EXISTS get_document_with_chunks(TEXT, TEXT);
DROP FUNCTION IF EXISTS hybrid_search_chunks(TEXT, vector(384), INT, TEXT, TEXT, FLOAT, FLOAT);

-- =============================================================================
-- Document Metadata Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS rag_documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    file_path TEXT,
    file_type TEXT,
    file_size_bytes INTEGER,
    total_chunks INTEGER DEFAULT 0,
    total_characters INTEGER DEFAULT 0,
    estimated_pages INTEGER DEFAULT 1,
    status TEXT DEFAULT 'processing', -- processing, ready, error
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user queries
CREATE INDEX IF NOT EXISTS idx_rag_documents_user ON rag_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_rag_documents_status ON rag_documents(status);

-- =============================================================================
-- Document Chunks Table (with embeddings)
-- =============================================================================
CREATE TABLE IF NOT EXISTS document_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    
    -- Content
    content TEXT NOT NULL,
    content_hash TEXT, -- For deduplication
    
    -- Vector embedding (384 for MiniLM, 1536 for OpenAI)
    embedding vector(384), -- Using MiniLM dimension
    
    -- Citation metadata
    page_number INTEGER,
    paragraph_number INTEGER,
    section_title TEXT,
    line_start INTEGER,
    line_end INTEGER,
    char_start INTEGER,
    char_end INTEGER,
    word_count INTEGER,
    
    -- Hierarchy
    parent_chunk_id TEXT,
    chunk_type TEXT DEFAULT 'content', -- title, section, subsection, content
    chunk_index INTEGER, -- Order within document
    
    -- Additional metadata (JSON)
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient retrieval
CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_user ON document_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_section ON document_chunks(section_title);
CREATE INDEX IF NOT EXISTS idx_chunks_page ON document_chunks(page_number);

-- =============================================================================
-- Search History (for analytics and improving search)
-- =============================================================================
CREATE TABLE IF NOT EXISTS rag_search_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    query TEXT NOT NULL,
    query_embedding vector(384),
    results_count INTEGER,
    top_document_ids TEXT[],
    search_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_history_user ON rag_search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_time ON rag_search_history(created_at DESC);

-- =============================================================================
-- Full-text search index for keyword search (create before functions)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_chunks_content_fts ON document_chunks 
USING gin(to_tsvector('russian', content));

-- =============================================================================
-- RPC Functions for Vector Search
-- =============================================================================

-- Function: Search chunks by vector similarity
CREATE OR REPLACE FUNCTION search_document_chunks(
    query_embedding vector(384),
    match_count INT DEFAULT 10,
    filter_user_id TEXT DEFAULT NULL,
    filter_document_id TEXT DEFAULT NULL,
    similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
    id TEXT,
    document_id TEXT,
    content TEXT,
    page_number INTEGER,
    paragraph_number INTEGER,
    section_title TEXT,
    chunk_type TEXT,
    similarity FLOAT,
    metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dc.id,
        dc.document_id,
        dc.content,
        dc.page_number,
        dc.paragraph_number,
        dc.section_title,
        dc.chunk_type,
        (1 - (dc.embedding <=> query_embedding))::FLOAT AS similarity,
        dc.metadata
    FROM document_chunks dc
    WHERE 
        (filter_user_id IS NULL OR dc.user_id = filter_user_id)
        AND (filter_document_id IS NULL OR dc.document_id = filter_document_id)
        AND dc.embedding IS NOT NULL
        AND (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Function: Get document with all chunks
CREATE OR REPLACE FUNCTION get_document_with_chunks(
    doc_id TEXT,
    user_id_filter TEXT
)
RETURNS TABLE (
    document_id TEXT,
    document_name TEXT,
    chunk_id TEXT,
    content TEXT,
    page_number INTEGER,
    section_title TEXT,
    chunk_index INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id AS document_id,
        d.name AS document_name,
        c.id AS chunk_id,
        c.content,
        c.page_number,
        c.section_title,
        c.chunk_index
    FROM rag_documents d
    LEFT JOIN document_chunks c ON c.document_id = d.id
    WHERE d.id = doc_id AND d.user_id = user_id_filter
    ORDER BY c.chunk_index;
END;
$$;

-- Function: Hybrid search (combines keyword + vector)
CREATE OR REPLACE FUNCTION hybrid_search_chunks(
    query_text TEXT,
    query_embedding vector(384),
    match_count INT DEFAULT 10,
    filter_user_id TEXT DEFAULT NULL,
    filter_document_id TEXT DEFAULT NULL,
    vector_weight FLOAT DEFAULT 0.7,
    keyword_weight FLOAT DEFAULT 0.3
)
RETURNS TABLE (
    id TEXT,
    document_id TEXT,
    content TEXT,
    page_number INTEGER,
    section_title TEXT,
    vector_score FLOAT,
    keyword_score FLOAT,
    combined_score FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH vector_results AS (
        SELECT 
            dc.id,
            dc.document_id,
            dc.content,
            dc.page_number,
            dc.section_title,
            (1 - (dc.embedding <=> query_embedding))::FLOAT AS vec_score
        FROM document_chunks dc
        WHERE 
            (filter_user_id IS NULL OR dc.user_id = filter_user_id)
            AND (filter_document_id IS NULL OR dc.document_id = filter_document_id)
            AND dc.embedding IS NOT NULL
    ),
    keyword_results AS (
        SELECT 
            dc.id,
            ts_rank_cd(to_tsvector('russian', dc.content), plainto_tsquery('russian', query_text))::FLOAT AS kw_score
        FROM document_chunks dc
        WHERE 
            (filter_user_id IS NULL OR dc.user_id = filter_user_id)
            AND (filter_document_id IS NULL OR dc.document_id = filter_document_id)
    )
    SELECT 
        v.id,
        v.document_id,
        v.content,
        v.page_number,
        v.section_title,
        v.vec_score AS vector_score,
        COALESCE(k.kw_score, 0)::FLOAT AS keyword_score,
        (vector_weight * v.vec_score + keyword_weight * COALESCE(k.kw_score, 0))::FLOAT AS combined_score
    FROM vector_results v
    LEFT JOIN keyword_results k ON v.id = k.id
    ORDER BY (vector_weight * v.vec_score + keyword_weight * COALESCE(k.kw_score, 0)) DESC
    LIMIT match_count;
END;
$$;

-- =============================================================================
-- Triggers (FIXED - separate for INSERT and DELETE)
-- =============================================================================

-- Function for INSERT trigger
CREATE OR REPLACE FUNCTION update_document_timestamp_insert()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE rag_documents 
    SET updated_at = NOW(),
        total_chunks = (SELECT COUNT(*) FROM document_chunks WHERE document_id = NEW.document_id)
    WHERE id = NEW.document_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function for DELETE trigger  
CREATE OR REPLACE FUNCTION update_document_timestamp_delete()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE rag_documents 
    SET updated_at = NOW(),
        total_chunks = (SELECT COUNT(*) FROM document_chunks WHERE document_id = OLD.document_id)
    WHERE id = OLD.document_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER trigger_update_document_on_chunk_insert
    AFTER INSERT ON document_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_document_timestamp_insert();

CREATE TRIGGER trigger_update_document_on_chunk_delete
    AFTER DELETE ON document_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_document_timestamp_delete();

-- =============================================================================
-- Row Level Security
-- =============================================================================
ALTER TABLE rag_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_search_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own documents" ON rag_documents;
DROP POLICY IF EXISTS "Users can insert own documents" ON rag_documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON rag_documents;
DROP POLICY IF EXISTS "Users can update own documents" ON rag_documents;
DROP POLICY IF EXISTS "Service role full access documents" ON rag_documents;

DROP POLICY IF EXISTS "Users can view own chunks" ON document_chunks;
DROP POLICY IF EXISTS "Users can insert own chunks" ON document_chunks;
DROP POLICY IF EXISTS "Users can delete own chunks" ON document_chunks;
DROP POLICY IF EXISTS "Service role full access chunks" ON document_chunks;

DROP POLICY IF EXISTS "Users can view own search history" ON rag_search_history;
DROP POLICY IF EXISTS "Users can insert own search history" ON rag_search_history;
DROP POLICY IF EXISTS "Service role full access search history" ON rag_search_history;

-- Documents: users can only see their own
CREATE POLICY "Users can view own documents" ON rag_documents
    FOR SELECT USING (user_id = coalesce(auth.uid()::text, 'dev@example.com'));

CREATE POLICY "Users can insert own documents" ON rag_documents
    FOR INSERT WITH CHECK (user_id = coalesce(auth.uid()::text, 'dev@example.com'));

CREATE POLICY "Users can update own documents" ON rag_documents
    FOR UPDATE USING (user_id = coalesce(auth.uid()::text, 'dev@example.com'));

CREATE POLICY "Users can delete own documents" ON rag_documents
    FOR DELETE USING (user_id = coalesce(auth.uid()::text, 'dev@example.com'));

-- Chunks: same policies
CREATE POLICY "Users can view own chunks" ON document_chunks
    FOR SELECT USING (user_id = coalesce(auth.uid()::text, 'dev@example.com'));

CREATE POLICY "Users can insert own chunks" ON document_chunks
    FOR INSERT WITH CHECK (user_id = coalesce(auth.uid()::text, 'dev@example.com'));

CREATE POLICY "Users can delete own chunks" ON document_chunks
    FOR DELETE USING (user_id = coalesce(auth.uid()::text, 'dev@example.com'));

-- Search history policies
CREATE POLICY "Users can view own search history" ON rag_search_history
    FOR SELECT USING (user_id = coalesce(auth.uid()::text, 'dev@example.com'));

CREATE POLICY "Users can insert own search history" ON rag_search_history
    FOR INSERT WITH CHECK (user_id = coalesce(auth.uid()::text, 'dev@example.com'));

-- Service role can do everything
CREATE POLICY "Service role full access documents" ON rag_documents
    FOR ALL USING (current_setting('role', true) = 'service_role');

CREATE POLICY "Service role full access chunks" ON document_chunks
    FOR ALL USING (current_setting('role', true) = 'service_role');

CREATE POLICY "Service role full access search history" ON rag_search_history
    FOR ALL USING (current_setting('role', true) = 'service_role');

-- =============================================================================
-- Vector Index (create AFTER data exists, or use CREATE INDEX CONCURRENTLY)
-- For now, create without CONCURRENTLY since table is empty
-- =============================================================================
-- Note: IVFFlat requires data to build the index efficiently
-- For empty tables, we'll skip this and let queries use sequential scan
-- The index should be created after loading initial data:
-- CREATE INDEX idx_chunks_embedding ON document_chunks 
-- USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- =============================================================================
-- Grant permissions to authenticated and service roles
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON rag_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON document_chunks TO authenticated;
GRANT SELECT, INSERT ON rag_search_history TO authenticated;

GRANT ALL ON rag_documents TO service_role;
GRANT ALL ON document_chunks TO service_role;
GRANT ALL ON rag_search_history TO service_role;

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON TABLE rag_documents IS 'Stores uploaded documents metadata for RAG';
COMMENT ON TABLE document_chunks IS 'Stores document chunks with embeddings for vector search';
COMMENT ON TABLE rag_search_history IS 'Stores search queries for analytics';
COMMENT ON FUNCTION search_document_chunks IS 'Vector similarity search for document chunks';
COMMENT ON FUNCTION hybrid_search_chunks IS 'Combined vector + keyword search';
COMMENT ON FUNCTION get_document_with_chunks IS 'Get document with all its chunks';
