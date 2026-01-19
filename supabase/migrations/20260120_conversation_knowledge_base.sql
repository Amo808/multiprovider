-- =====================================================
-- Conversation Knowledge Base Schema
-- =====================================================
-- 1. Documents belong to conversations (not global)
-- 2. Chat history is indexed like documents
-- 3. Unified search across both sources
-- =====================================================

-- Create enum for chunk type
CREATE TYPE chunk_type AS ENUM ('message', 'document');

-- =====================================================
-- Table: conversation_documents
-- Documents attached to specific conversations
-- =====================================================
CREATE TABLE IF NOT EXISTS conversation_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- File info
    filename TEXT NOT NULL,
    content_type TEXT DEFAULT 'text/plain',
    file_size INTEGER DEFAULT 0,
    content_hash TEXT,  -- SHA256 for deduplication
    
    -- Processing status
    status TEXT DEFAULT 'pending',  -- pending, processing, indexed, error
    error_message TEXT,
    chunks_count INTEGER DEFAULT 0,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Foreign key to conversations
    CONSTRAINT fk_conversation
        FOREIGN KEY (conversation_id) 
        REFERENCES conversations(id) 
        ON DELETE CASCADE
);

-- Index for fast lookup by conversation
CREATE INDEX IF NOT EXISTS idx_conv_docs_conversation 
    ON conversation_documents(conversation_id);

CREATE INDEX IF NOT EXISTS idx_conv_docs_user 
    ON conversation_documents(user_id);

CREATE INDEX IF NOT EXISTS idx_conv_docs_hash 
    ON conversation_documents(content_hash);

-- =====================================================
-- Table: conversation_chunks (unified)
-- Chunks from both messages AND documents
-- =====================================================
CREATE TABLE IF NOT EXISTS conversation_chunks (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Chunk type: 'message' or 'document'
    chunk_type chunk_type NOT NULL DEFAULT 'message',
    chunk_index INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL,
    
    -- Message-specific fields (null for documents)
    message_id TEXT,
    role TEXT,  -- 'user', 'assistant', 'system'
    
    -- Document-specific fields (null for messages)
    document_id UUID REFERENCES conversation_documents(id) ON DELETE CASCADE,
    filename TEXT,
    
    -- Embedding for semantic search
    embedding vector(1536),  -- OpenAI text-embedding-3-small
    tokens_count INTEGER,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Foreign key to conversations
    CONSTRAINT fk_conversation_chunks
        FOREIGN KEY (conversation_id) 
        REFERENCES conversations(id) 
        ON DELETE CASCADE
);

-- Indexes for fast search
CREATE INDEX IF NOT EXISTS idx_chunks_conversation 
    ON conversation_chunks(conversation_id);

CREATE INDEX IF NOT EXISTS idx_chunks_type 
    ON conversation_chunks(chunk_type);

CREATE INDEX IF NOT EXISTS idx_chunks_message 
    ON conversation_chunks(message_id) 
    WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_document 
    ON conversation_chunks(document_id) 
    WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_user 
    ON conversation_chunks(user_id);

-- Vector similarity index (HNSW for fast ANN search)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding 
    ON conversation_chunks 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- =====================================================
-- Function: search_conversation_chunks
-- Unified search across messages and documents
-- =====================================================
CREATE OR REPLACE FUNCTION search_conversation_chunks(
    p_conversation_id TEXT,
    p_query_embedding vector(1536),
    p_limit INTEGER DEFAULT 10,
    p_min_similarity FLOAT DEFAULT 0.5
)
RETURNS TABLE (
    id TEXT,
    conversation_id TEXT,
    chunk_type TEXT,
    chunk_index INTEGER,
    content TEXT,
    message_id TEXT,
    role TEXT,
    document_id UUID,
    filename TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cc.id,
        cc.conversation_id,
        cc.chunk_type::TEXT,
        cc.chunk_index,
        cc.content,
        cc.message_id,
        cc.role,
        cc.document_id,
        cc.filename,
        cc.metadata,
        cc.created_at,
        1 - (cc.embedding <=> p_query_embedding) AS similarity
    FROM conversation_chunks cc
    WHERE cc.conversation_id = p_conversation_id
      AND cc.embedding IS NOT NULL
      AND 1 - (cc.embedding <=> p_query_embedding) >= p_min_similarity
    ORDER BY cc.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Function: search_all_user_conversations
-- Search across all user's conversations
-- =====================================================
CREATE OR REPLACE FUNCTION search_all_user_conversations(
    p_user_id UUID,
    p_query_embedding vector(1536),
    p_limit INTEGER DEFAULT 20,
    p_min_similarity FLOAT DEFAULT 0.5
)
RETURNS TABLE (
    id TEXT,
    conversation_id TEXT,
    chunk_type TEXT,
    chunk_index INTEGER,
    content TEXT,
    message_id TEXT,
    role TEXT,
    document_id UUID,
    filename TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cc.id,
        cc.conversation_id,
        cc.chunk_type::TEXT,
        cc.chunk_index,
        cc.content,
        cc.message_id,
        cc.role,
        cc.document_id,
        cc.filename,
        cc.metadata,
        cc.created_at,
        1 - (cc.embedding <=> p_query_embedding) AS similarity
    FROM conversation_chunks cc
    WHERE cc.user_id = p_user_id
      AND cc.embedding IS NOT NULL
      AND 1 - (cc.embedding <=> p_query_embedding) >= p_min_similarity
    ORDER BY cc.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- RLS Policies
-- =====================================================

-- Enable RLS
ALTER TABLE conversation_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_chunks ENABLE ROW LEVEL SECURITY;

-- Documents: users can only see their own
CREATE POLICY "Users can view own documents"
    ON conversation_documents FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
    ON conversation_documents FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
    ON conversation_documents FOR DELETE
    USING (auth.uid() = user_id);

-- Chunks: users can only see their own
CREATE POLICY "Users can view own chunks"
    ON conversation_chunks FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chunks"
    ON conversation_chunks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own chunks"
    ON conversation_chunks FOR DELETE
    USING (auth.uid() = user_id);

-- =====================================================
-- Trigger: Update updated_at on documents
-- =====================================================
CREATE OR REPLACE FUNCTION update_conversation_document_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_document_timestamp
    BEFORE UPDATE ON conversation_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_document_timestamp();

-- =====================================================
-- Backwards compatibility: alias old function name
-- =====================================================
CREATE OR REPLACE FUNCTION search_conversation_history(
    p_conversation_id TEXT,
    p_query_embedding vector(1536),
    p_limit INTEGER DEFAULT 10,
    p_min_similarity FLOAT DEFAULT 0.5
)
RETURNS TABLE (
    id TEXT,
    conversation_id TEXT,
    chunk_type TEXT,
    chunk_index INTEGER,
    content TEXT,
    message_id TEXT,
    role TEXT,
    document_id UUID,
    filename TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ,
    similarity FLOAT
) AS $$
BEGIN
    -- Alias to unified function
    RETURN QUERY
    SELECT * FROM search_conversation_chunks(
        p_conversation_id,
        p_query_embedding,
        p_limit,
        p_min_similarity
    );
END;
$$ LANGUAGE plpgsql;
