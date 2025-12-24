# Supabase Setup for MultiProvider

## 🚀 Quick Start

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the project to initialize (~2 minutes)
3. Go to **Project Settings** → **API** and copy:
   - `Project URL` (e.g., `https://xxxxx.supabase.co`)
   - `anon public` key
   - `service_role` key (keep this secret!)

### 2. Run Database Migration

1. Go to **SQL Editor** in your Supabase Dashboard
2. Copy the contents of `000_complete_schema.sql`
3. Paste and run the entire script
4. You should see "Success" message

### 3. Create Storage Buckets (Manual)

Go to **Storage** in Supabase Dashboard:

1. Click "New bucket"
2. Create bucket named `documents`:
   - Private (not public)
   - File size limit: 50MB
   - Allowed MIME types: `application/pdf, text/plain, text/markdown, text/csv, application/json`

3. Create bucket named `avatars`:
   - Public
   - File size limit: 5MB
   - Allowed MIME types: `image/jpeg, image/png, image/gif, image/webp`

### 4. Configure Environment Variables

Create `.env` file in the backend directory:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI (for embeddings)
OPENAI_API_KEY=your-openai-key
```

For the frontend, add to `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## 📊 Schema Overview

### Tables

| Table | Description |
|-------|-------------|
| `users` | User profiles (extends Supabase Auth) |
| `conversations` | Chat sessions |
| `messages` | Individual messages with reasoning support |
| `documents` | Uploaded files for RAG |
| `document_chunks` | Text chunks with vector embeddings |

### Key Functions

| Function | Description |
|----------|-------------|
| `match_documents(embedding, count)` | Vector similarity search |
| `hybrid_search(text, embedding, count)` | Combined keyword + vector search |
| `create_conversation_with_system(...)` | Create new conversation with system prompt |
| `get_conversation_with_messages(id)` | Get full conversation as JSON |
| `get_usage_stats(user_id)` | Get user's usage statistics |

## 🔒 Security

Row Level Security (RLS) is enabled on all tables:

- Users can only access their own data
- Service role key bypasses RLS (use for backend operations)
- Anonymous access is disabled by default

## 🔍 RAG Pipeline

1. **Upload**: User uploads document → stored in Supabase Storage
2. **Process**: Backend extracts text → chunks with overlap
3. **Embed**: Each chunk → OpenAI embedding (1536 dimensions)
4. **Store**: Chunks + embeddings → `document_chunks` table
5. **Search**: Query → embedding → `match_documents()` → relevant chunks
6. **Generate**: Chunks + query → LLM → response

## 📁 File Structure

```
supabase/
├── migrations/
│   ├── 000_complete_schema.sql    # Full schema (run this)
│   ├── 001_extensions.sql         # pgvector, uuid-ossp
│   ├── 002_chat_tables.sql        # users, conversations, messages
│   ├── 003_rag_tables.sql         # documents, chunks
│   ├── 004_search_functions.sql   # match_documents, hybrid_search
│   ├── 005_rls_policies.sql       # Row Level Security
│   ├── 006_storage.sql            # Storage buckets
│   └── 007_utilities.sql          # Views and helper functions
└── README.md                      # This file
```

## 🧪 Testing

After setup, test with SQL Editor:

```sql
-- Check extensions
SELECT * FROM pg_extension WHERE extname IN ('vector', 'uuid-ossp');

-- Check tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';

-- Check functions
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public';

-- Test vector search (empty result is OK)
SELECT * FROM match_documents(
    '[0.1, 0.2, ...]'::vector(1536),  -- Replace with actual embedding
    5
);
```

## 🔗 Integration

### Python Backend

```python
from supabase import create_client

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Create conversation
result = supabase.table('conversations').insert({
    'user_id': user_id,
    'title': 'New Chat'
}).execute()

# Vector search
result = supabase.rpc('match_documents', {
    'query_embedding': embedding,
    'match_count': 5
}).execute()
```

### TypeScript Frontend

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Get conversations
const { data } = await supabase
  .from('conversations')
  .select('*')
  .order('updated_at', { ascending: false })

// Subscribe to realtime changes
supabase
  .channel('messages')
  .on('postgres_changes', { 
    event: 'INSERT', 
    schema: 'public', 
    table: 'messages' 
  }, handleNewMessage)
  .subscribe()
```

## 🆘 Troubleshooting

### "permission denied for schema public"
- Make sure you're using the service_role key for backend operations
- Check that RLS policies are correctly set up

### "function match_documents does not exist"
- Run the complete schema SQL again
- Check for any errors in the SQL Editor output

### "vector type does not exist"
- pgvector extension not enabled
- Run: `CREATE EXTENSION IF NOT EXISTS vector;`

### Storage upload fails
- Check bucket exists and has correct permissions
- Verify file size is under limit
- Check MIME type is allowed
