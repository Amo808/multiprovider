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
from .debug_collector import (
    RAGDebugCollector,
    get_current_collector,
    new_collector,
    clear_collector
)
from .api import router as rag_router
from .parallel_conversations import (
    SupabaseParallelStore,
    get_parallel_store
)

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
    # Parallel Conversations
    "SupabaseParallelStore",
    "get_parallel_store",
    # RAG
    "RAGStore",
    "get_rag_store",
    # Debug Collector
    "RAGDebugCollector",
    "get_current_collector",
    "new_collector",
    "clear_collector",
    # API Router
    "rag_router"
]
