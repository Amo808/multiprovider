-- ============================================
-- MIGRATION: Add missing columns to all tables
-- Run this in Supabase SQL Editor
-- ============================================

-- ======================
-- MESSAGES TABLE
-- ======================
DO $$ 
BEGIN
    -- Add reasoning_content column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'messages' 
                   AND column_name = 'reasoning_content') THEN
        ALTER TABLE public.messages ADD COLUMN reasoning_content text;
    END IF;
    
    -- Add model column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'messages' 
                   AND column_name = 'model') THEN
        ALTER TABLE public.messages ADD COLUMN model text;
    END IF;
    
    -- Add provider column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'messages' 
                   AND column_name = 'provider') THEN
        ALTER TABLE public.messages ADD COLUMN provider text;
    END IF;
    
    -- Add tokens_input column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'messages' 
                   AND column_name = 'tokens_input') THEN
        ALTER TABLE public.messages ADD COLUMN tokens_input integer;
    END IF;
    
    -- Add tokens_output column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'messages' 
                   AND column_name = 'tokens_output') THEN
        ALTER TABLE public.messages ADD COLUMN tokens_output integer;
    END IF;
    
    -- Add tokens_reasoning column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'messages' 
                   AND column_name = 'tokens_reasoning') THEN
        ALTER TABLE public.messages ADD COLUMN tokens_reasoning integer;
    END IF;
    
    -- Add latency_ms column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'messages' 
                   AND column_name = 'latency_ms') THEN
        ALTER TABLE public.messages ADD COLUMN latency_ms integer;
    END IF;
    
    -- Add tool_calls column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'messages' 
                   AND column_name = 'tool_calls') THEN
        ALTER TABLE public.messages ADD COLUMN tool_calls jsonb;
    END IF;
    
    -- Add tool_results column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'messages' 
                   AND column_name = 'tool_results') THEN
        ALTER TABLE public.messages ADD COLUMN tool_results jsonb;
    END IF;
    
    -- Add metadata column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'messages' 
                   AND column_name = 'metadata') THEN
        ALTER TABLE public.messages ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
    END IF;
    
    -- Add updated_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'messages' 
                   AND column_name = 'updated_at') THEN
        ALTER TABLE public.messages ADD COLUMN updated_at timestamp with time zone default now();
    END IF;
    
    RAISE NOTICE 'Messages table columns updated successfully';
END $$;

-- ======================
-- CONVERSATIONS TABLE
-- ======================
DO $$ 
BEGIN
    -- Add is_archived column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'conversations' 
                   AND column_name = 'is_archived') THEN
        ALTER TABLE public.conversations ADD COLUMN is_archived boolean DEFAULT false;
    END IF;
    
    -- Add system_prompt column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'conversations' 
                   AND column_name = 'system_prompt') THEN
        ALTER TABLE public.conversations ADD COLUMN system_prompt text;
    END IF;
    
    -- Add settings column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'conversations' 
                   AND column_name = 'settings') THEN
        ALTER TABLE public.conversations ADD COLUMN settings jsonb DEFAULT '{}'::jsonb;
    END IF;
    
    -- Add metadata column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'conversations' 
                   AND column_name = 'metadata') THEN
        ALTER TABLE public.conversations ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
    END IF;
    
    RAISE NOTICE 'Conversations table columns updated successfully';
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_role ON public.messages(role);
CREATE INDEX IF NOT EXISTS idx_conversations_is_archived ON public.conversations(is_archived);

-- Verify the structure
SELECT 'messages' as table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'messages'
UNION ALL
SELECT 'conversations' as table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'conversations'
ORDER BY table_name, column_name;
