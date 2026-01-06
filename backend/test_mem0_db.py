import psycopg2

conn = psycopg2.connect('postgresql://postgres.bfljlugkastfqirgqqws:Dontplaywithme_12@aws-1-ap-south-1.pooler.supabase.com:5432/postgres')
cur = conn.cursor()

# Check if vector extension exists
cur.execute("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')")
vector_exists = cur.fetchone()[0]
print(f'pgvector extension: {"YES" if vector_exists else "NO - need to create"}')

# Check if mem0 table exists
cur.execute("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mem0')")
table_exists = cur.fetchone()[0]
print(f'mem0 table: {"YES" if table_exists else "NO - need to create"}')

conn.close()
print("\nConnection test completed!")
