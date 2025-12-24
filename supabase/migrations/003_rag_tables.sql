-- ============================================
-- STEP 3: RAG Tables (Documents & Embeddings)
-- ============================================

-- Documents (uploaded files)
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

-- Document chunks with embeddings (LangChain compatible)
-- Using 1536 dimensions for OpenAI text-embedding-3-small
-- Can be adjusted for other models (e.g., 3072 for text-embedding-3-large)
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

-- Alternative: LangChain's default table structure (for direct compatibility)
create table if not exists public.langchain_pg_collection (
    uuid uuid primary key default uuid_generate_v4(),
    name varchar(255) unique not null,
    cmetadata jsonb
);

create table if not exists public.langchain_pg_embedding (
    uuid uuid primary key default uuid_generate_v4(),
    collection_id uuid references public.langchain_pg_collection(uuid) on delete cascade,
    document text,
    embedding vector(1536),
    cmetadata jsonb
);

-- Indexes for RAG
create index if not exists idx_documents_user_id on public.documents(user_id);
create index if not exists idx_documents_status on public.documents(status);
create index if not exists idx_document_chunks_document_id on public.document_chunks(document_id);

-- HNSW index for fast similarity search (pgvector)
create index if not exists idx_document_chunks_embedding on public.document_chunks 
    using hnsw (embedding vector_cosine_ops);

create index if not exists idx_langchain_embedding on public.langchain_pg_embedding 
    using hnsw (embedding vector_cosine_ops);

-- Triggers
create trigger update_documents_updated_at
    before update on public.documents
    for each row execute function update_updated_at_column();
