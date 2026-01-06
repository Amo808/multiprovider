"""
Check existing tables and structure in Supabase
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment
load_dotenv(Path(__file__).parent / ".env")

import psycopg2

DATABASE_URL = os.getenv("MEM0_DATABASE_URL")

def check_tables():
    print("=" * 60)
    print("Checking Supabase tables...")
    print("=" * 60)
    
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        # Get all tables
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """)
        
        tables = cur.fetchall()
        print(f"\n📋 Tables in database ({len(tables)}):")
        for t in tables:
            print(f"   - {t[0]}")
        
        # Check if rag_documents exists
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'rag_documents';
        """)
        rag_docs_cols = cur.fetchall()
        
        if rag_docs_cols:
            print(f"\n📄 rag_documents columns:")
            for col in rag_docs_cols:
                print(f"   - {col[0]}: {col[1]}")
        else:
            print("\n⚠️ rag_documents table NOT FOUND")
        
        # Check if document_chunks exists
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'document_chunks';
        """)
        chunks_cols = cur.fetchall()
        
        if chunks_cols:
            print(f"\n📄 document_chunks columns:")
            for col in chunks_cols:
                print(f"   - {col[0]}: {col[1]}")
        else:
            print("\n⚠️ document_chunks table NOT FOUND")
        
        # Check documents table (old RAG)
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'documents';
        """)
        docs_cols = cur.fetchall()
        
        if docs_cols:
            print(f"\n📄 documents columns (old RAG):")
            for col in docs_cols:
                print(f"   - {col[0]}: {col[1]}")
        
        cur.close()
        conn.close()
        print("\n✅ Database check complete!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    check_tables()
