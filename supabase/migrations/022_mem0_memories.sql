-- ============================================
-- Mem0 Memory Table for Supabase
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Ensure pgvector extension is enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Create memories table
-- Note: Mem0 will auto-create this table, but you can create it manually for control
CREATE TABLE IF NOT EXISTS public.mem0 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User identifier (string format for flexibility)
    user_id TEXT NOT NULL,
    
    -- The extracted memory/fact
    memory TEXT NOT NULL,
    
    -- Unique hash for deduplication
    hash TEXT UNIQUE NOT NULL,
    
    -- Vector embedding for semantic search (1536 dims for OpenAI)
    embedding VECTOR(1536),
    
    -- Additional metadata (JSON)
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 3: Create indexes for performance

-- Index on user_id for filtering
CREATE INDEX IF NOT EXISTS idx_mem0_user_id 
    ON public.mem0(user_id);

-- Index on hash for deduplication lookups
CREATE INDEX IF NOT EXISTS idx_mem0_hash 
    ON public.mem0(hash);

-- HNSW index for fast vector similarity search
-- This is crucial for semantic search performance
CREATE INDEX IF NOT EXISTS idx_mem0_embedding_hnsw 
    ON public.mem0 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Step 4: Create updated_at trigger
CREATE OR REPLACE FUNCTION update_mem0_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_mem0_updated_at ON public.mem0;

CREATE TRIGGER trigger_mem0_updated_at
    BEFORE UPDATE ON public.mem0
    FOR EACH ROW
    EXECUTE FUNCTION update_mem0_updated_at();

-- Step 5: Optional - Helper function for semantic search
CREATE OR REPLACE FUNCTION search_mem0_memories(
    p_user_id TEXT,
    p_query_embedding VECTOR(1536),
    p_limit INTEGER DEFAULT 10,
    p_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    id UUID,
    memory TEXT,
    metadata JSONB,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.memory,
        m.metadata,
        (1 - (m.embedding <=> p_query_embedding))::FLOAT AS similarity
    FROM public.mem0 m
    WHERE m.user_id = p_user_id
      AND (1 - (m.embedding <=> p_query_embedding)) > p_threshold
    ORDER BY m.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Add comment
COMMENT ON TABLE public.mem0 IS 'Mem0 semantic memory storage - automatically extracted facts and user preferences';

-- Verification query
SELECT 'Mem0 table created successfully!' AS status;
SELECT COUNT(*) AS memory_count FROM public.mem0;
