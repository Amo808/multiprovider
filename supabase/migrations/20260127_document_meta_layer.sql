-- Document Meta Layer
-- Stores high-level document structure and summaries for quick answers
-- without needing to load all chunks

-- Table for document metadata (table of contents, structure, summaries)
CREATE TABLE IF NOT EXISTS document_meta (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    
    -- Document structure
    total_chapters INTEGER DEFAULT 0,
    chapter_list JSONB DEFAULT '[]'::jsonb,  -- [{number: 1, title: "...", start_chunk: 0, end_chunk: 10}, ...]
    total_chunks INTEGER DEFAULT 0,
    total_chars INTEGER DEFAULT 0,
    total_pages INTEGER DEFAULT 0,
    
    -- Document type/category
    document_type TEXT DEFAULT 'unknown',  -- book, legal, article, code, etc.
    language TEXT DEFAULT 'unknown',
    
    -- High-level summaries
    document_summary TEXT,  -- Overall document summary (1-2 paragraphs)
    key_topics JSONB DEFAULT '[]'::jsonb,  -- ["topic1", "topic2", ...]
    
    -- Table of contents (full text if available)
    table_of_contents TEXT,
    
    -- Key entities extracted from document
    key_entities JSONB DEFAULT '[]'::jsonb,  -- [{type: "person", name: "..."}, ...]
    
    -- Timeline/dates if relevant
    key_dates JSONB DEFAULT '[]'::jsonb,  -- [{date: "2020-01-01", event: "..."}]
    
    -- For legal documents
    effective_date DATE,
    expiry_date DATE,
    jurisdiction TEXT,
    
    -- Chapter-level summaries for quick overview
    chapter_summaries JSONB DEFAULT '[]'::jsonb,  -- [{chapter: 1, summary: "..."}, ...]
    
    -- Processing status
    meta_status TEXT DEFAULT 'pending',  -- pending, processing, ready, error
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(document_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_document_meta_document_id ON document_meta(document_id);
CREATE INDEX IF NOT EXISTS idx_document_meta_user_id ON document_meta(user_id);
CREATE INDEX IF NOT EXISTS idx_document_meta_status ON document_meta(meta_status);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_document_meta_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_document_meta_updated_at ON document_meta;
CREATE TRIGGER trg_document_meta_updated_at
    BEFORE UPDATE ON document_meta
    FOR EACH ROW
    EXECUTE FUNCTION update_document_meta_updated_at();

-- Enable RLS
ALTER TABLE document_meta ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "Users can view their own document meta" ON document_meta;
CREATE POLICY "Users can view their own document meta"
    ON document_meta FOR SELECT
    USING (auth.uid()::text = user_id OR user_id = 'dev@example.com' OR user_id = 'dev-user');

DROP POLICY IF EXISTS "Users can insert their own document meta" ON document_meta;
CREATE POLICY "Users can insert their own document meta"
    ON document_meta FOR INSERT
    WITH CHECK (auth.uid()::text = user_id OR user_id = 'dev@example.com' OR user_id = 'dev-user');

DROP POLICY IF EXISTS "Users can update their own document meta" ON document_meta;
CREATE POLICY "Users can update their own document meta"
    ON document_meta FOR UPDATE
    USING (auth.uid()::text = user_id OR user_id = 'dev@example.com' OR user_id = 'dev-user');

DROP POLICY IF EXISTS "Users can delete their own document meta" ON document_meta;
CREATE POLICY "Users can delete their own document meta"
    ON document_meta FOR DELETE
    USING (auth.uid()::text = user_id OR user_id = 'dev@example.com' OR user_id = 'dev-user');

-- Grant permissions
GRANT ALL ON document_meta TO authenticated;
GRANT ALL ON document_meta TO service_role;
GRANT SELECT ON document_meta TO anon;
