# Database Setup for Multichat

## Overview

The application now uses database storage instead of file-based storage for better reliability and performance on deployment platforms like Render. It supports both SQLite (for local development) and PostgreSQL (for production).

## Local Development (SQLite)

SQLite is used by default for local development. The database file is created at `data/conversations.db`.

**No additional setup required** - SQLite is built into Python.

## Production Setup (PostgreSQL on Render)

### Step 1: Add PostgreSQL Add-on

1. Go to your Render Dashboard
2. Select your service
3. Click "Environment" tab
4. Add a new environment variable:
   - **Key**: `DATABASE_URL`
   - **Value**: Will be provided by Render when you add PostgreSQL

### Step 2: Add PostgreSQL Service

1. In your Render Dashboard, click "New +"
2. Select "PostgreSQL"
3. Choose a name (e.g., `multichat-db`)
4. Select the free tier
5. Click "Create Database"

### Step 3: Connect to Your App

1. Go to your PostgreSQL database dashboard
2. Copy the "External Database URL"
3. Go to your web service dashboard
4. In "Environment" tab, add or update:
   - **Key**: `DATABASE_URL`
   - **Value**: The database URL you copied

Example DATABASE_URL format:
```
postgresql://username:password@hostname:port/database_name
```

### Step 4: Deploy

The app will automatically:
- Detect the PostgreSQL connection
- Create necessary tables
- Migrate from file storage if needed

## Database Schema

### Conversations Table
```sql
CREATE TABLE conversations (
    id VARCHAR(255) PRIMARY KEY,
    title TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    message_count INTEGER DEFAULT 0
);
```

### Messages Table
```sql
CREATE TABLE messages (
    id VARCHAR(255) PRIMARY KEY,
    conversation_id VARCHAR(255) REFERENCES conversations(id),
    role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    meta JSONB, -- PostgreSQL / TEXT for SQLite
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Benefits

✅ **Reliable Persistence**: Data survives container restarts  
✅ **Concurrent Access**: Thread-safe database operations  
✅ **Better Performance**: Indexed queries for fast retrieval  
✅ **Conversation Isolation**: Each conversation_id has separate history  
✅ **Scalable**: Supports multiple users simultaneously  

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | SQLite | PostgreSQL connection URL |

## Migration

The app automatically migrates from file-based storage to database on first run. Your existing conversations will be preserved.

## Troubleshooting

### Connection Issues
- Verify `DATABASE_URL` format
- Check PostgreSQL service status on Render
- Ensure database allows external connections

### Performance
- Database includes indexes for fast message retrieval
- Connection pooling is handled automatically

### Backup
- Render PostgreSQL includes automatic backups
- For SQLite, backup the `data/conversations.db` file

## Manual Database Operations

For advanced users, you can connect to PostgreSQL directly:

```bash
# Connect to database (use your actual DATABASE_URL)
psql "postgresql://username:password@hostname:port/database_name"

# List conversations
SELECT * FROM conversations ORDER BY updated_at DESC;

# Count messages per conversation
SELECT c.title, COUNT(m.id) as message_count 
FROM conversations c 
LEFT JOIN messages m ON c.id = m.conversation_id 
GROUP BY c.id, c.title 
ORDER BY message_count DESC;
```
