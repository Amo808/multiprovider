-- ============================================
-- COMPLETE SUPABASE SCHEMA FOR MULTIPROVIDER
-- Run this entire file in Supabase SQL Editor
-- ============================================

-- ============================================
-- STEP 1: Enable Required Extensions
-- ============================================

create extension if not exists vector;
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;

-- ============================================
-- STEP 2: Users, Conversations, Messages
-- ============================================

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

create index if not exists idx_conversations_user_id on public.conversations(user_id);
create index if not exists idx_conversations_created_at on public.conversations(created_at desc);
create index if not exists idx_messages_conversation_id on public.messages(conversation_id);
create index if not exists idx_messages_created_at on public.messages(created_at);

create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists update_users_updated_at on public.users;
create trigger update_users_updated_at
    before update on public.users
    for each row execute function update_updated_at_column();

drop trigger if exists update_conversations_updated_at on public.conversations;
create trigger update_conversations_updated_at
    before update on public.conversations
    for each row execute function update_updated_at_column();

drop trigger if exists update_messages_updated_at on public.messages;
create trigger update_messages_updated_at
    before update on public.messages
    for each row execute function update_updated_at_column();

-- ============================================
-- STEP 3: RAG Tables (Documents & Embeddings)
-- ============================================

create table if not exists public.documents (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references public.users(id) on delete cascade,
    name text not null,
    storage_path text,
    content_type text,
    file_size integer,
    file_hash text,
    total_chunks integer default 0,
    status text default 'pending' check (status in ('pending', 'processing', 'ready', 'error')),
    error_message text,
    metadata jsonb default '{}'::jsonb,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table if not exists public.document_chunks (
    id uuid primary key default uuid_generate_v4(),
    document_id uuid references public.documents(id) on delete cascade,
    content text not null,
    embedding vector(1536),
    chunk_index integer not null,
    start_char integer,
    end_char integer,
    metadata jsonb default '{}'::jsonb,
    created_at timestamp with time zone default now()
);

create index if not exists idx_documents_user_id on public.documents(user_id);
create index if not exists idx_documents_status on public.documents(status);
create index if not exists idx_document_chunks_document_id on public.document_chunks(document_id);

create index if not exists idx_document_chunks_embedding on public.document_chunks 
    using hnsw (embedding vector_cosine_ops);

drop trigger if exists update_documents_updated_at on public.documents;
create trigger update_documents_updated_at
    before update on public.documents
    for each row execute function update_updated_at_column();

-- ============================================
-- STEP 4: Vector Search Functions
-- ============================================

create or replace function match_documents(
    query_embedding vector(1536),
    match_count int default 5,
    filter_user_id uuid default null,
    filter_document_id uuid default null,
    similarity_threshold float default 0.0
)
returns table (
    id uuid,
    document_id uuid,
    content text,
    chunk_index integer,
    metadata jsonb,
    similarity float
)
language plpgsql
as $$
begin
    return query
    select
        dc.id,
        dc.document_id,
        dc.content,
        dc.chunk_index,
        dc.metadata,
        1 - (dc.embedding <=> query_embedding) as similarity
    from public.document_chunks dc
    inner join public.documents d on dc.document_id = d.id
    where
        d.status = 'ready'
        and (filter_user_id is null or d.user_id = filter_user_id)
        and (filter_document_id is null or dc.document_id = filter_document_id)
        and 1 - (dc.embedding <=> query_embedding) > similarity_threshold
    order by dc.embedding <=> query_embedding
    limit match_count;
end;
$$;

create or replace function hybrid_search(
    query_text text,
    query_embedding vector(1536),
    match_count int default 5,
    filter_user_id uuid default null,
    keyword_weight float default 0.3,
    semantic_weight float default 0.7
)
returns table (
    id uuid,
    document_id uuid,
    content text,
    chunk_index integer,
    metadata jsonb,
    similarity float,
    keyword_rank float,
    combined_score float
)
language plpgsql
as $$
begin
    return query
    with semantic_results as (
        select
            dc.id,
            dc.document_id,
            dc.content,
            dc.chunk_index,
            dc.metadata,
            1 - (dc.embedding <=> query_embedding) as similarity
        from public.document_chunks dc
        inner join public.documents d on dc.document_id = d.id
        where
            d.status = 'ready'
            and (filter_user_id is null or d.user_id = filter_user_id)
    ),
    keyword_results as (
        select
            dc.id,
            ts_rank_cd(to_tsvector('english', dc.content), plainto_tsquery('english', query_text)) as kw_rank
        from public.document_chunks dc
        inner join public.documents d on dc.document_id = d.id
        where
            d.status = 'ready'
            and (filter_user_id is null or d.user_id = filter_user_id)
            and to_tsvector('english', dc.content) @@ plainto_tsquery('english', query_text)
    )
    select
        sr.id,
        sr.document_id,
        sr.content,
        sr.chunk_index,
        sr.metadata,
        sr.similarity,
        coalesce(kr.kw_rank, 0) as keyword_rank,
        (semantic_weight * sr.similarity + keyword_weight * coalesce(kr.kw_rank, 0)) as combined_score
    from semantic_results sr
    left join keyword_results kr on sr.id = kr.id
    order by combined_score desc
    limit match_count;
end;
$$;

-- ============================================
-- STEP 5: Row Level Security (RLS)
-- ============================================

alter table public.users enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

create or replace function get_current_user_id()
returns uuid
language sql
stable
as $$
    select id from public.users where auth_id = auth.uid()
$$;

-- Users policies
drop policy if exists "Users can view own profile" on public.users;
create policy "Users can view own profile"
    on public.users for select
    using (auth_id = auth.uid());

drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile"
    on public.users for update
    using (auth_id = auth.uid());

drop policy if exists "Users can insert own profile" on public.users;
create policy "Users can insert own profile"
    on public.users for insert
    with check (auth_id = auth.uid());

-- Conversations policies
drop policy if exists "Users can view own conversations" on public.conversations;
create policy "Users can view own conversations"
    on public.conversations for select
    using (user_id = get_current_user_id());

drop policy if exists "Users can create own conversations" on public.conversations;
create policy "Users can create own conversations"
    on public.conversations for insert
    with check (user_id = get_current_user_id());

drop policy if exists "Users can update own conversations" on public.conversations;
create policy "Users can update own conversations"
    on public.conversations for update
    using (user_id = get_current_user_id());

drop policy if exists "Users can delete own conversations" on public.conversations;
create policy "Users can delete own conversations"
    on public.conversations for delete
    using (user_id = get_current_user_id());

-- Messages policies
drop policy if exists "Users can view messages in own conversations" on public.messages;
create policy "Users can view messages in own conversations"
    on public.messages for select
    using (
        conversation_id in (
            select id from public.conversations
            where user_id = get_current_user_id()
        )
    );

drop policy if exists "Users can insert messages in own conversations" on public.messages;
create policy "Users can insert messages in own conversations"
    on public.messages for insert
    with check (
        conversation_id in (
            select id from public.conversations
            where user_id = get_current_user_id()
        )
    );

drop policy if exists "Users can update messages in own conversations" on public.messages;
create policy "Users can update messages in own conversations"
    on public.messages for update
    using (
        conversation_id in (
            select id from public.conversations
            where user_id = get_current_user_id()
        )
    );

drop policy if exists "Users can delete messages in own conversations" on public.messages;
create policy "Users can delete messages in own conversations"
    on public.messages for delete
    using (
        conversation_id in (
            select id from public.conversations
            where user_id = get_current_user_id()
        )
    );

-- Documents policies
drop policy if exists "Users can view own documents" on public.documents;
create policy "Users can view own documents"
    on public.documents for select
    using (user_id = get_current_user_id());

drop policy if exists "Users can upload own documents" on public.documents;
create policy "Users can upload own documents"
    on public.documents for insert
    with check (user_id = get_current_user_id());

drop policy if exists "Users can update own documents" on public.documents;
create policy "Users can update own documents"
    on public.documents for update
    using (user_id = get_current_user_id());

drop policy if exists "Users can delete own documents" on public.documents;
create policy "Users can delete own documents"
    on public.documents for delete
    using (user_id = get_current_user_id());

-- Document chunks policies
drop policy if exists "Users can view chunks of own documents" on public.document_chunks;
create policy "Users can view chunks of own documents"
    on public.document_chunks for select
    using (
        document_id in (
            select id from public.documents
            where user_id = get_current_user_id()
        )
    );

drop policy if exists "System can insert chunks" on public.document_chunks;
create policy "System can insert chunks"
    on public.document_chunks for insert
    with check (
        document_id in (
            select id from public.documents
            where user_id = get_current_user_id()
        )
    );

drop policy if exists "System can delete chunks" on public.document_chunks;
create policy "System can delete chunks"
    on public.document_chunks for delete
    using (
        document_id in (
            select id from public.documents
            where user_id = get_current_user_id()
        )
    );

-- ============================================
-- STEP 6: Storage Buckets (run separately if needed)
-- ============================================

-- Note: Storage bucket creation may need to be done via Supabase Dashboard
-- or with appropriate permissions. Uncomment if running with admin access:

-- insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- values (
--     'documents',
--     'documents',
--     false,
--     52428800,
--     array['application/pdf', 'text/plain', 'text/markdown', 'application/msword', 
--           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
--           'text/csv', 'application/json']
-- )
-- on conflict (id) do nothing;

-- ============================================
-- STEP 7: Utility Functions
-- ============================================

create or replace view public.conversations_with_stats as
select
    c.*,
    count(m.id) as message_count,
    max(m.created_at) as last_message_at,
    (
        select content 
        from public.messages 
        where conversation_id = c.id 
        order by created_at desc 
        limit 1
    ) as last_message_preview
from public.conversations c
left join public.messages m on c.id = m.conversation_id
group by c.id;

create or replace function create_conversation_with_system(
    p_user_id uuid,
    p_title text default 'New Conversation',
    p_system_prompt text default null,
    p_model text default null,
    p_provider text default null
)
returns uuid
language plpgsql
as $$
declare
    v_conversation_id uuid;
begin
    insert into public.conversations (user_id, title, model, provider, system_prompt)
    values (p_user_id, p_title, p_model, p_provider, p_system_prompt)
    returning id into v_conversation_id;
    
    if p_system_prompt is not null then
        insert into public.messages (conversation_id, role, content)
        values (v_conversation_id, 'system', p_system_prompt);
    end if;
    
    return v_conversation_id;
end;
$$;

create or replace function get_conversation_with_messages(p_conversation_id uuid)
returns json
language plpgsql
as $$
declare
    v_result json;
begin
    select json_build_object(
        'conversation', row_to_json(c),
        'messages', coalesce(
            (
                select json_agg(row_to_json(m) order by m.created_at)
                from public.messages m
                where m.conversation_id = c.id
            ),
            '[]'::json
        )
    )
    into v_result
    from public.conversations c
    where c.id = p_conversation_id;
    
    return v_result;
end;
$$;

create or replace function get_usage_stats(p_user_id uuid)
returns json
language plpgsql
as $$
begin
    return json_build_object(
        'total_conversations', (
            select count(*) from public.conversations where user_id = p_user_id
        ),
        'total_messages', (
            select count(*) from public.messages m
            inner join public.conversations c on m.conversation_id = c.id
            where c.user_id = p_user_id
        ),
        'total_documents', (
            select count(*) from public.documents where user_id = p_user_id
        ),
        'total_chunks', (
            select count(*) from public.document_chunks dc
            inner join public.documents d on dc.document_id = d.id
            where d.user_id = p_user_id
        ),
        'total_tokens_input', (
            select coalesce(sum(m.tokens_input), 0) from public.messages m
            inner join public.conversations c on m.conversation_id = c.id
            where c.user_id = p_user_id
        ),
        'total_tokens_output', (
            select coalesce(sum(m.tokens_output), 0) from public.messages m
            inner join public.conversations c on m.conversation_id = c.id
            where c.user_id = p_user_id
        )
    );
end;
$$;

-- ============================================
-- DONE! Schema ready for use
-- ============================================
