-- =============================================================================
-- Migration: Fix Document Chunks - Add user_id column
-- =============================================================================
-- Run this in Supabase SQL Editor
-- =============================================================================

-- Add missing columns to documents table FIRST
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS file_hash TEXT;

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS storage_path TEXT;

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS total_chunks INTEGER DEFAULT 0;

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS total_characters INTEGER DEFAULT 0;

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS estimated_pages INTEGER DEFAULT 1;

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Copy filename to name if name is null
UPDATE documents 
SET name = original_filename 
WHERE name IS NULL AND original_filename IS NOT NULL;

-- Add user_id column to document_chunks if not exists
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Populate user_id from documents table
UPDATE document_chunks c
SET user_id = d.user_id
FROM documents d
WHERE c.document_id = d.id
AND c.user_id IS NULL;

-- Add more columns that were missing
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS page_number INTEGER;

ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS paragraph_number INTEGER;

ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS section_title TEXT;

ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS chunk_type TEXT DEFAULT 'content';

ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS line_start INTEGER;

ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS line_end INTEGER;

ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS char_start INTEGER;

ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS char_end INTEGER;

ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS word_count INTEGER;

-- Add columns to documents table if missing
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS total_chunks INTEGER DEFAULT 0;

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS total_characters INTEGER DEFAULT 0;

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS estimated_pages INTEGER DEFAULT 1;

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS name TEXT;

-- Copy filename to name if name is null
UPDATE documents 
SET name = original_filename 
WHERE name IS NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_chunks_user_id ON document_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_page ON document_chunks(page_number);
CREATE INDEX IF NOT EXISTS idx_chunks_section ON document_chunks(section_title);

-- =============================================================================
-- Update RPC function to handle existing structure
-- =============================================================================

-- Drop old function if exists
DROP FUNCTION IF EXISTS search_document_chunks_v2(vector(1536), INT, TEXT, TEXT, FLOAT);
DROP FUNCTION IF EXISTS match_documents(vector, INT, TEXT, TEXT, FLOAT);

-- Create search function that works with existing 1536-dim embeddings
CREATE OR REPLACE FUNCTION search_document_chunks_v2(
    query_embedding vector(1536),
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
    section_title TEXT,
    chunk_type TEXT,
    chunk_index INTEGER,
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
        dc.section_title,
        dc.chunk_type,
        dc.chunk_index,
        (1 - (dc.embedding <=> query_embedding))::FLOAT AS similarity,
        dc.metadata
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    WHERE 
        (filter_user_id IS NULL OR d.user_id = filter_user_id)
        AND (filter_document_id IS NULL OR dc.document_id = filter_document_id)
        AND dc.embedding IS NOT NULL
        AND (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION search_document_chunks_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION search_document_chunks_v2 TO service_role;

-- =============================================================================
-- Hybrid search function
-- =============================================================================

DROP FUNCTION IF EXISTS hybrid_search_chunks_v2(TEXT, vector(1536), INT, TEXT, TEXT, FLOAT, FLOAT);

CREATE OR REPLACE FUNCTION hybrid_search_chunks_v2(
    query_text TEXT,
    query_embedding vector(1536),
    match_count INT DEFAULT 10,
    filter_user_id TEXT DEFAULT NULL,
    filter_document_id TEXT DEFAULT NULL,
    vector_weight FLOAT DEFAULT 0.7,
    keyword_weight FLOAT DEFAULT 0.3
)
RETURNS TABLE (
    id TEXT,
    document_id TEXT,
    document_name TEXT,
    content TEXT,
    page_number INTEGER,
    section_title TEXT,
    chunk_index INTEGER,
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
            COALESCE(d.name, d.original_filename) AS doc_name,
            dc.content,
            dc.page_number,
            dc.section_title,
            dc.chunk_index,
            (1 - (dc.embedding <=> query_embedding))::FLOAT AS vec_score
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE 
            (filter_user_id IS NULL OR d.user_id = filter_user_id)
            AND (filter_document_id IS NULL OR dc.document_id = filter_document_id)
            AND dc.embedding IS NOT NULL
    ),
    keyword_results AS (
        SELECT 
            dc.id,
            ts_rank_cd(to_tsvector('simple', dc.content), plainto_tsquery('simple', query_text))::FLOAT AS kw_score
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE 
            (filter_user_id IS NULL OR d.user_id = filter_user_id)
            AND (filter_document_id IS NULL OR dc.document_id = filter_document_id)
    )
    SELECT 
        v.id,
        v.document_id,
        v.doc_name AS document_name,
        v.content,
        v.page_number,
        v.section_title,
        v.chunk_index,
        v.vec_score AS vector_score,
        COALESCE(k.kw_score, 0)::FLOAT AS keyword_score,
        (vector_weight * v.vec_score + keyword_weight * COALESCE(k.kw_score, 0))::FLOAT AS combined_score
    FROM vector_results v
    LEFT JOIN keyword_results k ON v.id = k.id
    ORDER BY (vector_weight * v.vec_score + keyword_weight * COALESCE(k.kw_score, 0)) DESC
    LIMIT match_count;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION hybrid_search_chunks_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION hybrid_search_chunks_v2 TO service_role;

-- =============================================================================
-- Full-text search index
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_chunks_content_fts ON document_chunks 
USING gin(to_tsvector('simple', content));

COMMENT ON FUNCTION search_document_chunks_v2 IS 'Vector similarity search for document chunks (1536 dim)';
COMMENT ON FUNCTION hybrid_search_chunks_v2 IS 'Combined vector + keyword search';
