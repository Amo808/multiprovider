-- ============================================
-- STEP 6: Storage Buckets
-- ============================================

-- Create storage bucket for documents
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'documents',
    'documents',
    false,
    52428800, -- 50MB limit
    array['application/pdf', 'text/plain', 'text/markdown', 'application/msword', 
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/csv', 'application/json']
)
on conflict (id) do nothing;

-- Create storage bucket for user avatars
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'avatars',
    'avatars',
    true,
    5242880, -- 5MB limit
    array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do nothing;

-- Storage policies for documents bucket
create policy "Users can upload own documents"
    on storage.objects for insert
    with check (
        bucket_id = 'documents' 
        and (storage.foldername(name))[1] = auth.uid()::text
    );

create policy "Users can view own documents"
    on storage.objects for select
    using (
        bucket_id = 'documents' 
        and (storage.foldername(name))[1] = auth.uid()::text
    );

create policy "Users can delete own documents"
    on storage.objects for delete
    using (
        bucket_id = 'documents' 
        and (storage.foldername(name))[1] = auth.uid()::text
    );

-- Storage policies for avatars bucket (public read)
create policy "Anyone can view avatars"
    on storage.objects for select
    using (bucket_id = 'avatars');

create policy "Users can upload own avatar"
    on storage.objects for insert
    with check (
        bucket_id = 'avatars' 
        and (storage.foldername(name))[1] = auth.uid()::text
    );

create policy "Users can update own avatar"
    on storage.objects for update
    using (
        bucket_id = 'avatars' 
        and (storage.foldername(name))[1] = auth.uid()::text
    );
