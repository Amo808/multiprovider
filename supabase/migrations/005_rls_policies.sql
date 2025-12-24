-- ============================================
-- STEP 5: Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.langchain_pg_collection enable row level security;
alter table public.langchain_pg_embedding enable row level security;

-- Helper function to get current user's internal ID
create or replace function get_current_user_id()
returns uuid
language sql
stable
as $$
    select id from public.users where auth_id = auth.uid()
$$;

-- =====================
-- USERS POLICIES
-- =====================
create policy "Users can view own profile"
    on public.users for select
    using (auth_id = auth.uid());

create policy "Users can update own profile"
    on public.users for update
    using (auth_id = auth.uid());

create policy "Users can insert own profile"
    on public.users for insert
    with check (auth_id = auth.uid());

-- =====================
-- CONVERSATIONS POLICIES
-- =====================
create policy "Users can view own conversations"
    on public.conversations for select
    using (user_id = get_current_user_id());

create policy "Users can create own conversations"
    on public.conversations for insert
    with check (user_id = get_current_user_id());

create policy "Users can update own conversations"
    on public.conversations for update
    using (user_id = get_current_user_id());

create policy "Users can delete own conversations"
    on public.conversations for delete
    using (user_id = get_current_user_id());

-- =====================
-- MESSAGES POLICIES
-- =====================
create policy "Users can view messages in own conversations"
    on public.messages for select
    using (
        conversation_id in (
            select id from public.conversations
            where user_id = get_current_user_id()
        )
    );

create policy "Users can insert messages in own conversations"
    on public.messages for insert
    with check (
        conversation_id in (
            select id from public.conversations
            where user_id = get_current_user_id()
        )
    );

create policy "Users can update messages in own conversations"
    on public.messages for update
    using (
        conversation_id in (
            select id from public.conversations
            where user_id = get_current_user_id()
        )
    );

create policy "Users can delete messages in own conversations"
    on public.messages for delete
    using (
        conversation_id in (
            select id from public.conversations
            where user_id = get_current_user_id()
        )
    );

-- =====================
-- DOCUMENTS POLICIES
-- =====================
create policy "Users can view own documents"
    on public.documents for select
    using (user_id = get_current_user_id());

create policy "Users can upload own documents"
    on public.documents for insert
    with check (user_id = get_current_user_id());

create policy "Users can update own documents"
    on public.documents for update
    using (user_id = get_current_user_id());

create policy "Users can delete own documents"
    on public.documents for delete
    using (user_id = get_current_user_id());

-- =====================
-- DOCUMENT_CHUNKS POLICIES
-- =====================
create policy "Users can view chunks of own documents"
    on public.document_chunks for select
    using (
        document_id in (
            select id from public.documents
            where user_id = get_current_user_id()
        )
    );

create policy "System can insert chunks"
    on public.document_chunks for insert
    with check (
        document_id in (
            select id from public.documents
            where user_id = get_current_user_id()
        )
    );

create policy "System can delete chunks"
    on public.document_chunks for delete
    using (
        document_id in (
            select id from public.documents
            where user_id = get_current_user_id()
        )
    );

-- =====================
-- SERVICE ROLE BYPASS
-- =====================
-- Note: Service role automatically bypasses RLS
-- For backend operations, use the service_role key

-- =====================
-- ANONYMOUS ACCESS (if needed for demo)
-- =====================
-- Uncomment these if you want to allow anonymous access for development

-- create policy "Allow anonymous read conversations"
--     on public.conversations for select
--     using (auth.uid() is null);

-- create policy "Allow anonymous insert conversations"
--     on public.conversations for insert
--     with check (auth.uid() is null and user_id is null);
