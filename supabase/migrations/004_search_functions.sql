-- ============================================
-- STEP 4: Vector Search Functions
-- ============================================

-- Main vector similarity search function
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

-- Hybrid search (vector + keyword)
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

-- LangChain compatible search function
create or replace function match_langchain_documents(
    query_embedding vector(1536),
    match_count int default 5,
    filter_collection_name text default null
)
returns table (
    id uuid,
    content text,
    metadata jsonb,
    similarity float
)
language plpgsql
as $$
begin
    return query
    select
        le.uuid as id,
        le.document as content,
        le.cmetadata as metadata,
        1 - (le.embedding <=> query_embedding) as similarity
    from public.langchain_pg_embedding le
    left join public.langchain_pg_collection lc on le.collection_id = lc.uuid
    where filter_collection_name is null or lc.name = filter_collection_name
    order by le.embedding <=> query_embedding
    limit match_count;
end;
$$;

-- Function to search within a specific conversation's context
create or replace function search_conversation_context(
    p_conversation_id uuid,
    query_embedding vector(1536),
    match_count int default 3
)
returns table (
    message_id uuid,
    role text,
    content text,
    similarity float
)
language plpgsql
as $$
begin
    -- This would require message embeddings, which can be added later
    -- For now, return recent messages
    return query
    select
        m.id as message_id,
        m.role,
        m.content,
        1.0::float as similarity
    from public.messages m
    where m.conversation_id = p_conversation_id
    order by m.created_at desc
    limit match_count;
end;
$$;
