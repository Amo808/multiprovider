-- ============================================
-- STEP 2: Users, Conversations, Messages
-- ============================================

-- Users table (extends Supabase Auth)
create table if not exists public.users (
    id uuid primary key default uuid_generate_v4(),
    auth_id uuid unique references auth.users(id) on delete cascade,
    email text unique,
    display_name text,
    avatar_url text,
    preferences jsonb default '{}'::jsonb,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Conversations (chat sessions)
create table if not exists public.conversations (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references public.users(id) on delete cascade,
    title text not null default 'New Conversation',
    model text,
    provider text,
    system_prompt text,
    settings jsonb default '{}'::jsonb,
    metadata jsonb default '{}'::jsonb,
    is_archived boolean default false,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Messages within conversations
create table if not exists public.messages (
    id uuid primary key default uuid_generate_v4(),
    conversation_id uuid references public.conversations(id) on delete cascade not null,
    role text not null check (role in ('user', 'assistant', 'system', 'tool')),
    content text not null,
    reasoning_content text,
    model text,
    provider text,
    tokens_input integer,
    tokens_output integer,
    tokens_reasoning integer,
    latency_ms integer,
    tool_calls jsonb,
    tool_results jsonb,
    metadata jsonb default '{}'::jsonb,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Indexes for performance
create index if not exists idx_conversations_user_id on public.conversations(user_id);
create index if not exists idx_conversations_created_at on public.conversations(created_at desc);
create index if not exists idx_messages_conversation_id on public.messages(conversation_id);
create index if not exists idx_messages_created_at on public.messages(created_at);
create index if not exists idx_messages_role on public.messages(role);

-- Updated_at triggers
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger update_users_updated_at
    before update on public.users
    for each row execute function update_updated_at_column();

create trigger update_conversations_updated_at
    before update on public.conversations
    for each row execute function update_updated_at_column();

create trigger update_messages_updated_at
    before update on public.messages
    for each row execute function update_updated_at_column();
