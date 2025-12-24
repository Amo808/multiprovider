-- ============================================
-- STEP 7: Utility Views and Functions
-- ============================================

-- View: Conversations with message count and last message
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

-- View: Documents with chunk count
create or replace view public.documents_with_stats as
select
    d.*,
    count(dc.id) as chunk_count,
    u.display_name as owner_name
from public.documents d
left join public.document_chunks dc on d.id = dc.document_id
left join public.users u on d.user_id = u.id
group by d.id, u.display_name;

-- Function: Create new conversation with initial system message
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
    -- Create conversation
    insert into public.conversations (user_id, title, model, provider, system_prompt)
    values (p_user_id, p_title, p_model, p_provider, p_system_prompt)
    returning id into v_conversation_id;
    
    -- Add system message if prompt provided
    if p_system_prompt is not null then
        insert into public.messages (conversation_id, role, content)
        values (v_conversation_id, 'system', p_system_prompt);
    end if;
    
    return v_conversation_id;
end;
$$;

-- Function: Get conversation with all messages
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

-- Function: Clone a conversation
create or replace function clone_conversation(
    p_conversation_id uuid,
    p_new_user_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
    v_new_conversation_id uuid;
    v_original_user_id uuid;
begin
    -- Get original conversation
    select user_id into v_original_user_id
    from public.conversations
    where id = p_conversation_id;
    
    -- Clone conversation
    insert into public.conversations (user_id, title, model, provider, system_prompt, settings, metadata)
    select 
        coalesce(p_new_user_id, user_id),
        title || ' (Copy)',
        model,
        provider,
        system_prompt,
        settings,
        metadata
    from public.conversations
    where id = p_conversation_id
    returning id into v_new_conversation_id;
    
    -- Clone messages
    insert into public.messages (conversation_id, role, content, reasoning_content, model, provider, metadata)
    select 
        v_new_conversation_id,
        role,
        content,
        reasoning_content,
        model,
        provider,
        metadata
    from public.messages
    where conversation_id = p_conversation_id
    order by created_at;
    
    return v_new_conversation_id;
end;
$$;

-- Function: Delete old conversations (cleanup)
create or replace function cleanup_old_conversations(
    p_days_old integer default 30,
    p_user_id uuid default null
)
returns integer
language plpgsql
as $$
declare
    v_deleted_count integer;
begin
    with deleted as (
        delete from public.conversations
        where 
            is_archived = true
            and updated_at < now() - (p_days_old || ' days')::interval
            and (p_user_id is null or user_id = p_user_id)
        returning id
    )
    select count(*) into v_deleted_count from deleted;
    
    return v_deleted_count;
end;
$$;

-- Function: Get usage statistics
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
