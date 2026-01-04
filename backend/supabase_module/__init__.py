"""
Supabase integration module for MULTECH AI
Provides database, RAG, and user management functionality
"""
from .client import (
    get_supabase_client,
    get_supabase_service_client,
    get_authenticated_client,
    get_or_create_user,
    is_supabase_configured
)
from .conversations import (
    SupabaseConversationStore,
    get_supabase_conversation_store
)
from .rag import (
    RAGStore,
    get_rag_store
)
from .api import router as rag_router

__all__ = [
    # Client
    "get_supabase_client",
    "get_supabase_service_client", 
    "get_authenticated_client",
    "get_or_create_user",
    "is_supabase_configured",
    # Conversations
    "SupabaseConversationStore",
    "get_supabase_conversation_store",
    # RAG
    "RAGStore",
    "get_rag_store",
    # API Router
    "rag_router"
]
