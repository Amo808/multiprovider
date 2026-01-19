-- Migration: Add conversation-scoped documents and conversation history RAG
-- Date: 2026-01-20
-- Purpose: 
--   1. Documents can be scoped to specific conversations
--   2. Chat history is indexed as RAG chunks for semantic search

-- 0. Drop old functions if they exist (to allow changing return type)
DROP FUNCTION IF EXISTS search_conversation_history(TEXT, vector, INTEGER, FLOAT);
DROP FUNCTION IF EXISTS search_conversation_history(TEXT, vector, INTEGER, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS get_recent_conversation_context(TEXT, INTEGER);

-- 1. Add conversation_id to documents (optional - null means global/user-level)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS conversation_id TEXT;
CREATE INDEX IF NOT EXISTS idx_documents_conversation ON documents(conversation_id);

-- 2. Create table for conversation history chunks (RAG over chat history)
CREATE TABLE IF NOT EXISTS conversation_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id TEXT NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,           -- Original message ID
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    chunk_index INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL,
    embedding vector(1536),             -- OpenAI text-embedding-3-small
    tokens_count INTEGER,               -- Token count for this chunk
    metadata JSONB DEFAULT '{}',        -- Extra info: timestamp, model, etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Composite unique constraint
    UNIQUE(conversation_id, message_id, chunk_index)
);

-- Indexes for conversation chunks
CREATE INDEX IF NOT EXISTS idx_conv_chunks_conversation ON conversation_chunks(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_chunks_user ON conversation_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_chunks_message ON conversation_chunks(message_id);
CREATE INDEX IF NOT EXISTS idx_conv_chunks_role ON conversation_chunks(role);

-- Vector index for semantic search
CREATE INDEX IF NOT EXISTS idx_conv_chunks_embedding 
ON conversation_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 3. Function to search conversation history by semantic similarity
CREATE OR REPLACE FUNCTION search_conversation_history(
    p_conversation_id TEXT,
    p_query_embedding vector(1536),
    p_limit INTEGER DEFAULT 10,
    p_min_similarity FLOAT DEFAULT 0.5
)
RETURNS TABLE (
    id UUID,
    message_id TEXT,
    role TEXT,
    chunk_index INTEGER,
    content TEXT,
    similarity FLOAT,
    metadata JSONB,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cc.id,
        cc.message_id,
        cc.role,
        cc.chunk_index,
        cc.content,
        1 - (cc.embedding <=> p_query_embedding) AS similarity,
        cc.metadata,
        cc.created_at
    FROM conversation_chunks cc
    WHERE cc.conversation_id = p_conversation_id
      AND cc.embedding IS NOT NULL
      AND 1 - (cc.embedding <=> p_query_embedding) >= p_min_similarity
    ORDER BY cc.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$;

-- 4. Function to get recent conversation context (last N messages, ordered)
CREATE OR REPLACE FUNCTION get_recent_conversation_context(
    p_conversation_id TEXT,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    message_id TEXT,
    role TEXT,
    content TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Get unique messages (combine chunks), ordered by time
    RETURN QUERY
    SELECT DISTINCT ON (cc.message_id)
        cc.message_id,
        cc.role,
        -- Combine all chunks for this message
        string_agg(cc.content, '' ORDER BY cc.chunk_index) AS content,
        MIN(cc.created_at) AS created_at
    FROM conversation_chunks cc
    WHERE cc.conversation_id = p_conversation_id
    GROUP BY cc.message_id, cc.role
    ORDER BY cc.message_id, MIN(cc.created_at) DESC
    LIMIT p_limit;
END;
$$;

-- 5. Add RLS policies for conversation_chunks
ALTER TABLE conversation_chunks ENABLE ROW LEVEL SECURITY;

-- Users can only see their own conversation chunks
CREATE POLICY "Users can view own conversation chunks"
ON conversation_chunks FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own conversation chunks"
ON conversation_chunks FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own conversation chunks"
ON conversation_chunks FOR DELETE
USING (user_id = auth.uid());

-- Service role can do everything
CREATE POLICY "Service role full access to conversation_chunks"
ON conversation_chunks FOR ALL
USING (auth.role() = 'service_role');

-- 6. Update documents RLS to include conversation_id filtering
-- (existing policies should still work, but we add conversation-aware ones)

COMMENT ON TABLE conversation_chunks IS 'Stores conversation history as RAG-searchable chunks. Each message is split into chunks with embeddings for semantic search.';
COMMENT ON COLUMN conversation_chunks.conversation_id IS 'The chat/conversation this chunk belongs to';
COMMENT ON COLUMN conversation_chunks.message_id IS 'Original message ID from the chat';
COMMENT ON COLUMN conversation_chunks.role IS 'Message role: user, assistant, or system';
COMMENT ON COLUMN conversation_chunks.chunk_index IS 'Index of this chunk within the message (0-based)';
COMMENT ON COLUMN conversation_chunks.embedding IS 'Vector embedding for semantic search';
