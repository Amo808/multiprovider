-- ============================================
-- MIGRATION: Change ID columns from UUID to TEXT
-- This allows frontend to use any string ID format
-- Run this in Supabase SQL Editor
-- ============================================

-- IMPORTANT: This migration recreates tables with TEXT ids
-- Make sure to backup data first if needed!

-- Step 1: Drop dependent objects (views, functions that reference these tables)
DROP VIEW IF EXISTS public.conversations_with_stats CASCADE;
DROP VIEW IF EXISTS public.documents_with_stats CASCADE;
DROP FUNCTION IF EXISTS public.create_conversation_with_system CASCADE;
DROP FUNCTION IF EXISTS public.get_conversation_with_messages CASCADE;
DROP FUNCTION IF EXISTS public.clone_conversation CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_old_conversations CASCADE;
DROP FUNCTION IF EXISTS public.get_usage_stats CASCADE;

-- Step 2: Backup existing data (if any)
CREATE TABLE IF NOT EXISTS public._backup_users AS SELECT * FROM public.users;
CREATE TABLE IF NOT EXISTS public._backup_conversations AS SELECT * FROM public.conversations;
CREATE TABLE IF NOT EXISTS public._backup_messages AS SELECT * FROM public.messages;
CREATE TABLE IF NOT EXISTS public._backup_documents AS SELECT * FROM public.documents;
CREATE TABLE IF NOT EXISTS public._backup_document_chunks AS SELECT * FROM public.document_chunks;

-- Step 3: Drop existing tables (cascade will handle foreign keys)
DROP TABLE IF EXISTS public.document_chunks CASCADE;
DROP TABLE IF EXISTS public.documents CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- Step 4: Recreate tables with TEXT id columns

-- Users table
CREATE TABLE public.users (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email text UNIQUE NOT NULL,
    display_name text,
    avatar_url text,
    preferences jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    last_login_at timestamptz
);

-- Conversations table  
CREATE TABLE public.conversations (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title text NOT NULL DEFAULT 'New Conversation',
    model text,
    provider text,
    system_prompt text,
    settings jsonb DEFAULT '{}',
    metadata jsonb DEFAULT '{}',
    is_archived boolean DEFAULT false,
    is_pinned boolean DEFAULT false,
    total_tokens integer DEFAULT 0,
    total_cost decimal(10,6) DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Messages table
CREATE TABLE public.messages (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    conversation_id text NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
    content text NOT NULL,
    reasoning_content text,
    model text,
    provider text,
    tokens_input integer,
    tokens_output integer,
    tokens_reasoning integer,
    latency_ms integer,
    tool_calls jsonb,
    tool_results jsonb,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

-- Documents table (for RAG)
CREATE TABLE public.documents (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    filename text NOT NULL,
    original_filename text,
    file_type text,
    file_size integer,
    storage_path text,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'error')),
    error_message text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Document chunks table (for RAG vector search)
CREATE TABLE public.document_chunks (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    document_id text NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    embedding vector(1536),
    token_count integer,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

-- Step 5: Create indexes
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON public.conversations(updated_at DESC);
CREATE INDEX idx_conversations_is_archived ON public.conversations(is_archived);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);
CREATE INDEX idx_messages_role ON public.messages(role);
CREATE INDEX idx_documents_user_id ON public.documents(user_id);
CREATE INDEX idx_documents_status ON public.documents(status);
CREATE INDEX idx_document_chunks_document_id ON public.document_chunks(document_id);

-- Vector similarity search index (if pgvector is available)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON public.document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create vector index: %', SQLERRM;
END $$;

-- Step 6: Recreate views
CREATE OR REPLACE VIEW public.conversations_with_stats AS
SELECT
    c.*,
    count(m.id) as message_count,
    max(m.created_at) as last_message_at,
    (
        SELECT content 
        FROM public.messages 
        WHERE conversation_id = c.id 
        ORDER BY created_at DESC 
        LIMIT 1
    ) as last_message_preview
FROM public.conversations c
LEFT JOIN public.messages m ON c.id = m.conversation_id
GROUP BY c.id;

CREATE OR REPLACE VIEW public.documents_with_stats AS
SELECT
    d.*,
    count(dc.id) as chunk_count,
    u.display_name as owner_name
FROM public.documents d
LEFT JOIN public.document_chunks dc ON d.id = dc.document_id
LEFT JOIN public.users u ON d.user_id = u.id
GROUP BY d.id, u.display_name;

-- Step 7: Recreate utility functions
CREATE OR REPLACE FUNCTION create_conversation_with_system(
    p_user_id text,
    p_title text DEFAULT 'New Conversation',
    p_system_prompt text DEFAULT null,
    p_model text DEFAULT null,
    p_provider text DEFAULT null
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_conversation_id text;
BEGIN
    v_conversation_id := 'conv_' || extract(epoch from now())::bigint::text || '_' || substr(md5(random()::text), 1, 8);
    
    INSERT INTO public.conversations (id, user_id, title, model, provider, system_prompt)
    VALUES (v_conversation_id, p_user_id, p_title, p_model, p_provider, p_system_prompt);
    
    IF p_system_prompt IS NOT NULL THEN
        INSERT INTO public.messages (conversation_id, role, content)
        VALUES (v_conversation_id, 'system', p_system_prompt);
    END IF;
    
    RETURN v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_conversation_with_messages(p_conversation_id text)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
    v_result json;
BEGIN
    SELECT json_build_object(
        'conversation', row_to_json(c),
        'messages', COALESCE(
            (
                SELECT json_agg(row_to_json(m) ORDER BY m.created_at)
                FROM public.messages m
                WHERE m.conversation_id = c.id
            ),
            '[]'::json
        )
    )
    INTO v_result
    FROM public.conversations c
    WHERE c.id = p_conversation_id;
    
    RETURN v_result;
END;
$$;

-- Step 8: Disable RLS for now (development mode)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks DISABLE ROW LEVEL SECURITY;

-- Step 9: Grant permissions
GRANT ALL ON public.users TO anon, authenticated, service_role;
GRANT ALL ON public.conversations TO anon, authenticated, service_role;
GRANT ALL ON public.messages TO anon, authenticated, service_role;
GRANT ALL ON public.documents TO anon, authenticated, service_role;
GRANT ALL ON public.document_chunks TO anon, authenticated, service_role;

-- Step 10: Clean up backup tables (uncomment after verifying migration worked)
-- DROP TABLE IF EXISTS public._backup_users;
-- DROP TABLE IF EXISTS public._backup_conversations;
-- DROP TABLE IF EXISTS public._backup_messages;
-- DROP TABLE IF EXISTS public._backup_documents;
-- DROP TABLE IF EXISTS public._backup_document_chunks;

-- Done!
SELECT 'Migration completed! Tables now use TEXT ids instead of UUID.' as status;
