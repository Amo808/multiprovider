const fs = require('fs');
const path = 'supabase_client/rag.py';
let content = fs.readFileSync(path, 'utf8');

// Код для двухэтапной умной выборки чанков
const smartSelectionCode = `
    # ==================== TWO-STAGE SMART CHUNK SELECTION ====================
    
    def get_chunk_summaries(
        self,
        user_email: str,
        document_ids: Optional[List[str]] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get lightweight chunk summaries for smart selection.
        Returns only metadata and first ~200 chars of content (no embeddings).
        This is much faster and cheaper than loading full chunks.
        """
        user_id = self._get_user_id(user_email)
        
        query = self.client.table("document_chunks")\\
            .select("id, document_id, chunk_index, metadata, content")\\
            .order("chunk_index", desc=False)\\
            .limit(limit)
        
        # Filter by document IDs if specified
        if document_ids:
            query = query.in_("document_id", document_ids)
        
        result = query.execute()
        chunks = result.data or []
        
        # Get document names
        if chunks:
            doc_ids = list(set(c["document_id"] for c in chunks))
            docs = self.client.table("documents")\\
                .select("id, name")\\
                .in_("id", doc_ids)\\
                .eq("user_id", user_id)\\
                .execute()
            doc_names = {d["id"]: d["name"] for d in (docs.data or [])}
        else:
            doc_names = {}
        
        # Build lightweight summaries
        summaries = []
        for chunk in chunks:
            metadata = chunk.get("metadata", {}) or {}
            content_preview = chunk["content"][:200].strip()
            if len(chunk["content"]) > 200:
                content_preview += "..."
            
            summaries.append({
                "id": chunk["id"],
                "document_id": chunk["document_id"],
                "document_name": doc_names.get(chunk["document_id"], "Unknown"),
                "chunk_index": chunk["chunk_index"],
                "chapter": metadata.get("chapter_number") or metadata.get("chapter_title"),
                "section": metadata.get("section_header"),
                "position_percent": metadata.get("position_percent", 0),
                "content_preview": content_preview
            })
        
        return summaries
    
    def ai_select_relevant_chunks(
        self,
        query: str,
        chunk_summaries: List[Dict],
        max_chunks: int = 10
    ) -> List[str]:
        """
        Use AI to select the most relevant chunks based on their summaries/metadata.
        Returns list of chunk IDs that the AI deemed relevant.
        
        This is the "smart selection" step - AI analyzes descriptions,
        not full content, making it fast and cheap.
        """
        if not chunk_summaries:
            return []
        
        # Build concise descriptions for AI
        descriptions = []
        for i, cs in enumerate(chunk_summaries):
            desc = f"[{i}] Doc: {cs['document_name']}"
            if cs.get("chapter"):
                desc += f" | Chapter: {cs['chapter']}"
            if cs.get("section"):
                desc += f" | Section: {cs['section']}"
            desc += f" | Position: {cs['position_percent']}%"
            desc += f"\\nPreview: {cs['content_preview']}"
            descriptions.append(desc)
        
        chunks_text = "\\n\\n".join(descriptions)
        
        prompt = f"""You are a document retrieval expert. Analyze the following chunk descriptions and select which ones are most likely to contain relevant information for the user's question.

USER QUESTION: {query}

AVAILABLE CHUNKS:
{chunks_text}

INSTRUCTIONS:
1. Read each chunk's metadata (document name, chapter, section) and preview text
2. Select chunks that are most likely to contain the answer or relevant context
3. Consider selecting chunks from different parts of the document for comprehensive coverage
4. Select up to {max_chunks} chunks maximum

Return ONLY a JSON array of chunk indices (numbers in brackets), like: [0, 3, 5, 7]
No explanation, just the array of numbers."""

        try:
            response = self.embedding_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=100
            )
            
            import json
            indices_text = response.choices[0].message.content.strip()
            # Extract JSON array from response
            if '[' in indices_text:
                indices_text = indices_text[indices_text.index('['):indices_text.rindex(']')+1]
            selected_indices = json.loads(indices_text)
            
            # Validate indices and get chunk IDs
            selected_ids = []
            for idx in selected_indices:
                if isinstance(idx, int) and 0 <= idx < len(chunk_summaries):
                    selected_ids.append(chunk_summaries[idx]["id"])
            
            logger.info(f"[RAG] AI selected {len(selected_ids)} chunks out of {len(chunk_summaries)} candidates")
            return selected_ids
            
        except Exception as e:
            logger.warning(f"AI chunk selection failed: {e}")
            # Fallback: return first max_chunks chunk IDs
            return [cs["id"] for cs in chunk_summaries[:max_chunks]]
    
    def get_chunks_by_ids(
        self,
        chunk_ids: List[str],
        user_email: str
    ) -> List[Dict[str, Any]]:
        """
        Load full content of specific chunks by their IDs.
        This is the "second stage" - loading only the chunks AI selected.
        """
        if not chunk_ids:
            return []
        
        user_id = self._get_user_id(user_email)
        
        # Get chunks
        result = self.client.table("document_chunks")\\
            .select("id, document_id, chunk_index, content, metadata")\\
            .in_("id", chunk_ids)\\
            .execute()
        
        chunks = result.data or []
        
        # Get document names
        if chunks:
            doc_ids = list(set(c["document_id"] for c in chunks))
            docs = self.client.table("documents")\\
                .select("id, name")\\
                .in_("id", doc_ids)\\
                .eq("user_id", user_id)\\
                .execute()
            doc_names = {d["id"]: d["name"] for d in (docs.data or [])}
            
            for chunk in chunks:
                chunk["document_name"] = doc_names.get(chunk["document_id"], "Unknown")
        
        # Sort by original order (chunk_index)
        chunks.sort(key=lambda x: (x.get("document_id", ""), x.get("chunk_index", 0)))
        
        return chunks
    
    def smart_two_stage_search(
        self,
        query: str,
        user_email: str,
        document_ids: Optional[List[str]] = None,
        initial_candidates: int = 50,
        final_chunks: int = 10
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Two-stage smart chunk selection:
        
        Stage 1: Get lightweight chunk summaries (fast, cheap)
        Stage 2: AI selects relevant chunks by analyzing metadata/previews
        Stage 3: Load full content only for selected chunks
        
        Benefits:
        - AI can see document structure (chapters, sections)
        - AI makes informed decisions based on context, not just similarity
        - Much cheaper than loading full content for reranking
        - Works great for structural questions ("what's in chapter 5?")
        
        Args:
            query: User's question
            user_email: User email for filtering
            document_ids: Optional document filter
            initial_candidates: How many chunks to show AI for selection
            final_chunks: Max chunks for AI to select
        
        Returns:
            Tuple of (selected_chunks, debug_info)
        """
        debug_info = {
            "stage1_candidates": 0,
            "stage2_selected": 0,
            "method": "smart_two_stage"
        }
        
        # Stage 1: Get chunk summaries (lightweight)
        logger.info(f"[RAG] Smart search Stage 1: Getting {initial_candidates} chunk summaries")
        summaries = self.get_chunk_summaries(
            user_email=user_email,
            document_ids=document_ids,
            limit=initial_candidates
        )
        debug_info["stage1_candidates"] = len(summaries)
        
        if not summaries:
            return [], debug_info
        
        # Stage 2: AI selects relevant chunks
        logger.info(f"[RAG] Smart search Stage 2: AI selecting from {len(summaries)} candidates")
        selected_ids = self.ai_select_relevant_chunks(
            query=query,
            chunk_summaries=summaries,
            max_chunks=final_chunks
        )
        debug_info["stage2_selected"] = len(selected_ids)
        
        if not selected_ids:
            # Fallback to similarity search if AI selection failed
            logger.warning("[RAG] AI selection returned no chunks, falling back to similarity search")
            return self.search(query, user_email, document_ids, limit=final_chunks), debug_info
        
        # Stage 3: Load full content for selected chunks
        logger.info(f"[RAG] Smart search Stage 3: Loading {len(selected_ids)} selected chunks")
        chunks = self.get_chunks_by_ids(selected_ids, user_email)
        
        return chunks, debug_info
    
    def hybrid_smart_search(
        self,
        query: str,
        user_email: str,
        document_ids: Optional[List[str]] = None,
        use_smart_selection: bool = True,
        candidates: int = 50,
        final_chunks: int = 10
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Combined search that uses both similarity AND smart selection:
        
        1. First, do similarity search to get candidates
        2. Then, use AI to filter/reorder based on metadata understanding
        
        This combines the best of both worlds:
        - Similarity search finds semantically relevant content
        - AI selection filters by document structure and context
        """
        debug_info = {
            "method": "hybrid_smart" if use_smart_selection else "similarity_only"
        }
        
        # Step 1: Similarity search for candidates
        similarity_results = self.hybrid_search(
            query=query,
            user_email=user_email,
            limit=candidates
        )
        debug_info["similarity_candidates"] = len(similarity_results)
        
        if not similarity_results:
            return [], debug_info
        
        if not use_smart_selection:
            return similarity_results[:final_chunks], debug_info
        
        # Step 2: Build summaries from similarity results
        summaries = []
        for i, r in enumerate(similarity_results):
            metadata = r.get("metadata", {}) or {}
            content_preview = r["content"][:200].strip()
            if len(r["content"]) > 200:
                content_preview += "..."
            
            summaries.append({
                "id": r.get("id") or f"sim_{i}",
                "original_index": i,
                "document_id": r["document_id"],
                "document_name": r.get("document_name", "Unknown"),
                "chunk_index": r.get("chunk_index", 0),
                "chapter": metadata.get("chapter_number") or metadata.get("chapter_title"),
                "section": metadata.get("section_header"),
                "position_percent": metadata.get("position_percent", 0),
                "similarity_score": r.get("similarity") or r.get("combined_score", 0),
                "content_preview": content_preview
            })
        
        # Step 3: AI selects best chunks
        selected_ids = self.ai_select_relevant_chunks(
            query=query,
            chunk_summaries=summaries,
            max_chunks=final_chunks
        )
        debug_info["ai_selected"] = len(selected_ids)
        
        # Map selected IDs back to original results
        id_to_index = {s["id"]: s["original_index"] for s in summaries}
        selected_results = []
        for sel_id in selected_ids:
            if sel_id in id_to_index:
                selected_results.append(similarity_results[id_to_index[sel_id]])
        
        return selected_results if selected_results else similarity_results[:final_chunks], debug_info

`;

// Найдём место для вставки - перед "# ==================== ITERATIVE PROCESSING"
const insertMarker = '    # ==================== ITERATIVE PROCESSING FOR LARGE DOCUMENTS ====================';

if (content.includes(insertMarker)) {
    content = content.replace(insertMarker, smartSelectionCode + '\n' + insertMarker);
    fs.writeFileSync(path, content);
    console.log('✅ Smart two-stage chunk selection added to rag.py!');
    console.log('Added methods:');
    console.log('  - get_chunk_summaries() - get lightweight chunk metadata');
    console.log('  - ai_select_relevant_chunks() - AI picks best chunks by descriptions');
    console.log('  - get_chunks_by_ids() - load full content of selected chunks');
    console.log('  - smart_two_stage_search() - main two-stage search');
    console.log('  - hybrid_smart_search() - similarity + AI selection combined');
} else {
    console.log('❌ Could not find insertion point in rag.py');
    console.log('Looking for: "# ==================== ITERATIVE PROCESSING FOR LARGE DOCUMENTS"');
}
