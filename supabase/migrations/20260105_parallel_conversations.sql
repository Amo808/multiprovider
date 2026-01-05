-- Migration: Create parallel_conversations table for parallel chat mode
-- Date: 2026-01-05

-- Create parallel_conversations table
-- NOTE: user_id is TEXT to match users.id type (see 009_change_id_to_text.sql)
CREATE TABLE IF NOT EXISTS parallel_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'Parallel Chat',
    shared_history_mode BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create parallel_turns table (each user message + responses)
CREATE TABLE IF NOT EXISTS parallel_turns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES parallel_conversations(id) ON DELETE CASCADE,
    user_message TEXT NOT NULL,
    turn_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create parallel_responses table (each model's response within a turn)
CREATE TABLE IF NOT EXISTS parallel_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turn_id UUID NOT NULL REFERENCES parallel_turns(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    model_name TEXT NOT NULL,
    provider TEXT NOT NULL,
    content TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    tokens_in INTEGER,
    tokens_out INTEGER,
    thought_tokens INTEGER,
    estimated_cost DECIMAL(10, 6),
    total_latency DECIMAL(10, 3),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_parallel_conversations_user_id ON parallel_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_parallel_turns_conversation_id ON parallel_turns(conversation_id);
CREATE INDEX IF NOT EXISTS idx_parallel_turns_order ON parallel_turns(conversation_id, turn_order);
CREATE INDEX IF NOT EXISTS idx_parallel_responses_turn_id ON parallel_responses(turn_id);

-- RLS Policies
ALTER TABLE parallel_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE parallel_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE parallel_responses ENABLE ROW LEVEL SECURITY;

-- Users can only see their own parallel conversations
CREATE POLICY "Users can view own parallel conversations"
    ON parallel_conversations FOR SELECT
    USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own parallel conversations"
    ON parallel_conversations FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own parallel conversations"
    ON parallel_conversations FOR UPDATE
    USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own parallel conversations"
    ON parallel_conversations FOR DELETE
    USING (auth.uid()::text = user_id);

-- Turns policies (via conversation ownership)
CREATE POLICY "Users can view turns in own conversations"
    ON parallel_turns FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM parallel_conversations pc
            WHERE pc.id = parallel_turns.conversation_id
            AND pc.user_id = auth.uid()::text
        )
    );

CREATE POLICY "Users can insert turns in own conversations"
    ON parallel_turns FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM parallel_conversations pc
            WHERE pc.id = parallel_turns.conversation_id
            AND pc.user_id = auth.uid()::text
        )
    );

CREATE POLICY "Users can update turns in own conversations"
    ON parallel_turns FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM parallel_conversations pc
            WHERE pc.id = parallel_turns.conversation_id
            AND pc.user_id = auth.uid()::text
        )
    );

CREATE POLICY "Users can delete turns in own conversations"
    ON parallel_turns FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM parallel_conversations pc
            WHERE pc.id = parallel_turns.conversation_id
            AND pc.user_id = auth.uid()::text
        )
    );

-- Responses policies (via turn -> conversation ownership)
CREATE POLICY "Users can view responses in own conversations"
    ON parallel_responses FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM parallel_turns pt
            JOIN parallel_conversations pc ON pc.id = pt.conversation_id
            WHERE pt.id = parallel_responses.turn_id
            AND pc.user_id = auth.uid()::text
        )
    );

CREATE POLICY "Users can insert responses in own conversations"
    ON parallel_responses FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM parallel_turns pt
            JOIN parallel_conversations pc ON pc.id = pt.conversation_id
            WHERE pt.id = parallel_responses.turn_id
            AND pc.user_id = auth.uid()::text
        )
    );

CREATE POLICY "Users can update responses in own conversations"
    ON parallel_responses FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM parallel_turns pt
            JOIN parallel_conversations pc ON pc.id = pt.conversation_id
            WHERE pt.id = parallel_responses.turn_id
            AND pc.user_id = auth.uid()::text
        )
    );

CREATE POLICY "Users can delete responses in own conversations"
    ON parallel_responses FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM parallel_turns pt
            JOIN parallel_conversations pc ON pc.id = pt.conversation_id
            WHERE pt.id = parallel_responses.turn_id
            AND pc.user_id = auth.uid()::text
        )
    );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_parallel_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE parallel_conversations
    SET updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update conversation timestamp when turns are added
CREATE TRIGGER trigger_update_parallel_conversation_timestamp
    AFTER INSERT OR UPDATE ON parallel_turns
    FOR EACH ROW
    EXECUTE FUNCTION update_parallel_conversation_timestamp();
