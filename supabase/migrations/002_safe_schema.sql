-- ============================================
-- MULTECH AI - Supabase Database Schema
-- SAFE VERSION - can be run multiple times
-- ============================================

-- 1. Enable required extensions
create extension if not exists vector;
create extension if not exists "uuid-ossp";

-- ============================================
-- 2. USER PROFILES (extends Supabase Auth)
-- ============================================
create table if not exists public.user_profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  display_name text,
  avatar_url text,
  settings jsonb default '{
    "theme": "dark",
    "language": "en",
    "default_model": null,
    "default_provider": null
  }'::jsonb,
  usage_stats jsonb default '{
    "total_tokens": 0,
    "total_cost": 0,
    "messages_count": 0
  }'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trigger to auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- 3. USER API KEYS (encrypted storage)
-- ============================================
create table if not exists public.user_api_keys (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users on delete cascade not null,
  provider text not null,
  encrypted_key text not null,
  is_valid boolean default true,
  last_used_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, provider)
);

-- ============================================
-- 4. CONVERSATIONS
-- ============================================
create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users on delete cascade not null,
  title text default 'New Conversation',
  model text,
  provider text,
  system_prompt text,
  settings jsonb default '{}'::jsonb,
  message_count integer default 0,
  total_tokens integer default 0,
  total_cost numeric(10, 6) default 0,
  is_archived boolean default false,
  is_pinned boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_conversations_user_id on public.conversations(user_id);
create index if not exists idx_conversations_updated_at on public.conversations(updated_at desc);

-- ============================================
-- 5. MESSAGES
-- ============================================
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references public.conversations on delete cascade not null,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_messages_conversation_id on public.messages(conversation_id);
create index if not exists idx_messages_created_at on public.messages(created_at);

-- Trigger to update conversation stats
create or replace function public.update_conversation_stats()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update public.conversations
    set 
      message_count = message_count + 1,
      total_tokens = total_tokens + coalesce((new.meta->>'tokens_in')::int, 0) + coalesce((new.meta->>'tokens_out')::int, 0),
      total_cost = total_cost + coalesce((new.meta->>'estimated_cost')::numeric, 0),
      updated_at = now()
    where id = new.conversation_id;
  elsif TG_OP = 'DELETE' then
    update public.conversations
    set 
      message_count = greatest(0, message_count - 1),
      updated_at = now()
    where id = old.conversation_id;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

drop trigger if exists on_message_change on public.messages;
create trigger on_message_change
  after insert or delete on public.messages
  for each row execute procedure public.update_conversation_stats();

-- ============================================
-- 6. DOCUMENTS (for RAG)
-- ============================================
create table if not exists public.documents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  file_type text,
  file_size bigint,
  storage_path text,
  status text default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  error_message text,
  chunk_count integer default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_documents_user_id on public.documents(user_id);
create index if not exists idx_documents_status on public.documents(status);

-- ============================================
-- 7. DOCUMENT CHUNKS (with embeddings for RAG)
-- ============================================
create table if not exists public.document_chunks (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid references public.documents on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536),
  token_count integer,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_document_chunks_document_id on public.document_chunks(document_id);
create index if not exists idx_document_chunks_user_id on public.document_chunks(user_id);

-- Vector index (recreate to ensure it's correct)
drop index if exists idx_document_chunks_embedding;
create index idx_document_chunks_embedding 
  on public.document_chunks 
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Update document chunk count trigger
create or replace function public.update_document_chunk_count()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update public.documents
    set chunk_count = chunk_count + 1, updated_at = now()
    where id = new.document_id;
  elsif TG_OP = 'DELETE' then
    update public.documents
    set chunk_count = greatest(0, chunk_count - 1), updated_at = now()
    where id = old.document_id;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

drop trigger if exists on_chunk_change on public.document_chunks;
create trigger on_chunk_change
  after insert or delete on public.document_chunks
  for each row execute procedure public.update_document_chunk_count();

-- ============================================
-- 8. RAG SEARCH FUNCTION
-- ============================================
create or replace function public.match_documents(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count int default 5,
  p_user_id uuid default null,
  p_document_ids uuid[] default null
)
returns table (
  id uuid,
  document_id uuid,
  document_name text,
  content text,
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
    d.name as document_name,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  where 
    (p_user_id is null or dc.user_id = p_user_id)
    and (p_document_ids is null or dc.document_id = any(p_document_ids))
    and d.status = 'ready'
    and 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ============================================
-- 9. HYBRID SEARCH FUNCTION
-- ============================================
create or replace function public.hybrid_search(
  query_text text,
  query_embedding vector(1536),
  match_count int default 5,
  p_user_id uuid default null,
  keyword_weight float default 0.3,
  semantic_weight float default 0.7
)
returns table (
  id uuid,
  document_id uuid,
  document_name text,
  content text,
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
      d.name as document_name,
      dc.content,
      dc.metadata,
      1 - (dc.embedding <=> query_embedding) as similarity
    from public.document_chunks dc
    join public.documents d on d.id = dc.document_id
    where 
      (p_user_id is null or dc.user_id = p_user_id)
      and d.status = 'ready'
    order by dc.embedding <=> query_embedding
    limit match_count * 3
  ),
  keyword_results as (
    select
      dc.id,
      ts_rank(to_tsvector('english', dc.content), plainto_tsquery('english', query_text)) as keyword_rank
    from public.document_chunks dc
    join public.documents d on d.id = dc.document_id
    where 
      (p_user_id is null or dc.user_id = p_user_id)
      and d.status = 'ready'
      and to_tsvector('english', dc.content) @@ plainto_tsquery('english', query_text)
  )
  select
    sr.id,
    sr.document_id,
    sr.document_name,
    sr.content,
    sr.metadata,
    sr.similarity,
    coalesce(kr.keyword_rank, 0) as keyword_rank,
    (sr.similarity * semantic_weight + coalesce(kr.keyword_rank, 0) * keyword_weight) as combined_score
  from semantic_results sr
  left join keyword_results kr on kr.id = sr.id
  order by combined_score desc
  limit match_count;
end;
$$;

-- ============================================
-- 10. ROW LEVEL SECURITY (RLS) - SAFE VERSION
-- ============================================

-- Enable RLS on all tables
alter table public.user_profiles enable row level security;
alter table public.user_api_keys enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

-- Drop existing policies first, then recreate
drop policy if exists "Users can view own profile" on public.user_profiles;
drop policy if exists "Users can update own profile" on public.user_profiles;
drop policy if exists "Users can insert own profile" on public.user_profiles;

create policy "Users can view own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.user_profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.user_profiles for insert
  with check (auth.uid() = id);

-- API Keys policies
drop policy if exists "Users can manage own API keys" on public.user_api_keys;
create policy "Users can manage own API keys"
  on public.user_api_keys for all
  using (auth.uid() = user_id);

-- Conversations policies
drop policy if exists "Users can manage own conversations" on public.conversations;
create policy "Users can manage own conversations"
  on public.conversations for all
  using (auth.uid() = user_id);

-- Messages policies
drop policy if exists "Users can manage messages in own conversations" on public.messages;
create policy "Users can manage messages in own conversations"
  on public.messages for all
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

-- Documents policies
drop policy if exists "Users can manage own documents" on public.documents;
create policy "Users can manage own documents"
  on public.documents for all
  using (auth.uid() = user_id);

-- Document Chunks policies
drop policy if exists "Users can manage own document chunks" on public.document_chunks;
create policy "Users can manage own document chunks"
  on public.document_chunks for all
  using (auth.uid() = user_id);

-- ============================================
-- 11. HELPER FUNCTIONS
-- ============================================

-- Get user's usage statistics
create or replace function public.get_user_stats(p_user_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  result json;
begin
  select json_build_object(
    'conversations_count', (select count(*) from public.conversations where user_id = p_user_id),
    'messages_count', (select count(*) from public.messages m join public.conversations c on c.id = m.conversation_id where c.user_id = p_user_id),
    'documents_count', (select count(*) from public.documents where user_id = p_user_id and status = 'ready'),
    'total_chunks', (select coalesce(sum(chunk_count), 0) from public.documents where user_id = p_user_id),
    'total_tokens', (select coalesce(sum(total_tokens), 0) from public.conversations where user_id = p_user_id),
    'total_cost', (select coalesce(sum(total_cost), 0) from public.conversations where user_id = p_user_id)
  ) into result;
  return result;
end;
$$;

-- ============================================
-- DONE! Schema is ready.
-- ============================================
