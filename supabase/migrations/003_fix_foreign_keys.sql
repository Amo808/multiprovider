-- Fix foreign key to reference public.users instead of auth.users
-- Run this in Supabase SQL Editor

-- Drop existing constraint
ALTER TABLE public.conversations 
DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;

-- Add new constraint referencing public.users
ALTER TABLE public.conversations 
ADD CONSTRAINT conversations_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES public.users(id) 
ON DELETE CASCADE;

-- Same for messages
ALTER TABLE public.messages 
DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey;

ALTER TABLE public.messages 
ADD CONSTRAINT messages_conversation_id_fkey 
FOREIGN KEY (conversation_id) 
REFERENCES public.conversations(id) 
ON DELETE CASCADE;

-- Same for documents
ALTER TABLE public.documents 
DROP CONSTRAINT IF EXISTS documents_user_id_fkey;

ALTER TABLE public.documents 
ADD CONSTRAINT documents_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES public.users(id) 
ON DELETE CASCADE;

-- Same for document_chunks
ALTER TABLE public.document_chunks 
DROP CONSTRAINT IF EXISTS document_chunks_document_id_fkey;

ALTER TABLE public.document_chunks 
ADD CONSTRAINT document_chunks_document_id_fkey 
FOREIGN KEY (document_id) 
REFERENCES public.documents(id) 
ON DELETE CASCADE;

-- Verify user exists
SELECT * FROM public.users WHERE email = 'dev@example.com';
