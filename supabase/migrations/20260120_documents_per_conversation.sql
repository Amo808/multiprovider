-- =============================================================================
-- Migration: Add conversation_id to documents for per-chat document ownership
-- =============================================================================
-- This makes documents belong to specific conversations instead of being global
-- Updated: 2026-01-21 - Trigger Render redeploy
-- =============================================================================

-- Add conversation_id column to rag_documents
ALTER TABLE rag_documents 
ADD COLUMN IF NOT EXISTS conversation_id TEXT;

-- Create index for conversation queries
CREATE INDEX IF NOT EXISTS idx_rag_documents_conversation 
ON rag_documents(conversation_id) 
WHERE conversation_id IS NOT NULL;

-- Create composite index for user + conversation queries
CREATE INDEX IF NOT EXISTS idx_rag_documents_user_conversation 
ON rag_documents(user_id, conversation_id);

-- Also add to document_chunks for direct queries
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS conversation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_chunks_conversation 
ON document_chunks(conversation_id) 
WHERE conversation_id IS NOT NULL;

-- =============================================================================
-- Update search function to filter by conversation_id
-- =============================================================================

-- Drop existing function if exists
DROP FUNCTION IF EXISTS search_document_chunks_by_conversation(TEXT, vector(384), TEXT, FLOAT, INT);

-- Create new function with conversation filtering
CREATE OR REPLACE FUNCTION search_document_chunks_by_conversation(
    p_user_id TEXT,
    p_query_embedding vector(384),
    p_conversation_id TEXT DEFAULT NULL,
    p_match_threshold FLOAT DEFAULT 0.5,
    p_match_count INT DEFAULT 10
)
RETURNS TABLE (
    id TEXT,
    document_id TEXT,
    content TEXT,
    page_number INTEGER,
    section_title TEXT,
    chunk_type TEXT,
    metadata JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql
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
        dc.metadata,
        1 - (dc.embedding <=> p_query_embedding) as similarity
    FROM document_chunks dc
    JOIN rag_documents rd ON dc.document_id = rd.id
    WHERE 
        dc.user_id = p_user_id
        AND rd.status = 'ready'
        AND (p_conversation_id IS NULL OR dc.conversation_id = p_conversation_id)
        AND dc.embedding IS NOT NULL
        AND 1 - (dc.embedding <=> p_query_embedding) > p_match_threshold
    ORDER BY dc.embedding <=> p_query_embedding
    LIMIT p_match_count;
END;
$$;

-- =============================================================================
-- Update list documents function
-- =============================================================================

DROP FUNCTION IF EXISTS list_documents_by_conversation(TEXT, TEXT, TEXT, INT);

CREATE OR REPLACE FUNCTION list_documents_by_conversation(
    p_user_id TEXT,
    p_conversation_id TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_limit INT DEFAULT 50
)
RETURNS TABLE (
    id TEXT,
    user_id TEXT,
    conversation_id TEXT,
    name TEXT,
    file_type TEXT,
    file_size_bytes INTEGER,
    total_chunks INTEGER,
    status TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rd.id,
        rd.user_id,
        rd.conversation_id,
        rd.name,
        rd.file_type,
        rd.file_size_bytes,
        rd.total_chunks,
        rd.status,
        rd.created_at,
        rd.updated_at
    FROM rag_documents rd
    WHERE 
        rd.user_id = p_user_id
        AND (p_conversation_id IS NULL OR rd.conversation_id = p_conversation_id)
        AND (p_status IS NULL OR rd.status = p_status)
    ORDER BY rd.created_at DESC
    LIMIT p_limit;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON COLUMN rag_documents.conversation_id IS 'Links document to specific conversation. NULL means global/all conversations.';
COMMENT ON COLUMN document_chunks.conversation_id IS 'Links chunk to specific conversation for faster filtering.';
