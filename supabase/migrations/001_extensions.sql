-- ============================================
-- STEP 1: Enable Required Extensions
-- ============================================

-- Enable pgvector for embeddings and vector search
create extension if not exists vector;

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Enable pg_trgm for text search (optional but recommended)
create extension if not exists pg_trgm;
