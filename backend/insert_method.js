const fs = require('fs');
const path = require('path');

const ragFilePath = path.join(__dirname, 'supabase_client', 'rag.py');

// Method to insert
const multiQuerySearchMethod = `
    def multi_query_search(
        self,
        query: str,
        user_email: str,
        num_queries: int = 4,
        results_per_query: int = 5,
        use_hybrid: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Multi-Query RAG: Generate multiple search queries from one question.
        
        This helps capture different aspects of the user's question and
        find documents that might be missed by a single query.
        
        Similar to LangChain's MultiQueryRetriever.
        """
        try:
            # Step 1: Generate multiple queries
            multi_query_prompt = f"""You are an AI language model assistant. Your task is to generate {num_queries} 
different versions of the given user question to retrieve relevant documents from a vector database.

By generating multiple perspectives on the user question, your goal is to help overcome some 
of the limitations of distance-based similarity search.

Provide these alternative questions separated by newlines.
Original question: {query}

Alternative questions:"""

            response = self.embedding_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": multi_query_prompt}],
                temperature=0.7,
                max_tokens=300
            )
            
            # Parse generated queries
            generated_text = response.choices[0].message.content.strip()
            queries = [q.strip() for q in generated_text.split('\\n') if q.strip()]
            queries = [query] + queries[:num_queries]  # Include original + generated
            
            logger.info(f"[RAG] Multi-query generated {len(queries)} queries")
            
            # Step 2: Search with each query
            all_results = []
            seen_chunks = set()
            
            for q in queries:
                if use_hybrid:
                    results = self.hybrid_search(q, user_email, limit=results_per_query)
                else:
                    results = self.search(q, user_email, limit=results_per_query)
                
                for r in results:
                    chunk_id = f"{r['document_id']}_{r['chunk_index']}"
                    if chunk_id not in seen_chunks:
                        seen_chunks.add(chunk_id)
                        r['matching_queries'] = [q]
                        all_results.append(r)
                    else:
                        # Find existing and add query
                        for existing in all_results:
                            if f"{existing['document_id']}_{existing['chunk_index']}" == chunk_id:
                                existing.setdefault('matching_queries', []).append(q)
                                break
            
            # Sort by number of matching queries (relevance across perspectives)
            all_results.sort(key=lambda x: len(x.get('matching_queries', [])), reverse=True)
            
            logger.info(f"[RAG] Multi-query found {len(all_results)} unique results")
            return all_results
            
        except Exception as e:
            logger.warning(f"Multi-query search failed, falling back to standard: {e}")
            if use_hybrid:
                return self.hybrid_search(query, user_email, limit=results_per_query * num_queries)
            return self.search(query, user_email, limit=results_per_query * num_queries)

`;

// Read the file
let content = fs.readFileSync(ragFilePath, 'utf8');

// Find where to insert (before ultimate_rag_search)
const insertMarker = '    def ultimate_rag_search(';

if (content.includes('def multi_query_search(')) {
    console.log('✅ multi_query_search method already exists!');
} else if (content.includes(insertMarker)) {
    // Insert before ultimate_rag_search
    content = content.replace(insertMarker, multiQuerySearchMethod + insertMarker);
    fs.writeFileSync(ragFilePath, content, 'utf8');
    console.log('✅ Successfully inserted multi_query_search method!');
    console.log('📍 Location: before ultimate_rag_search method');
} else {
    console.log('❌ Could not find insertion point (ultimate_rag_search)');
}

// Verify insertion
const newContent = fs.readFileSync(ragFilePath, 'utf8');
if (newContent.includes('def multi_query_search(')) {
    console.log('✅ Verification: multi_query_search method is now present');

    // Count lines
    const lines = newContent.split('\n').length;
    console.log(`📊 File now has ${lines} lines`);
} else {
    console.log('❌ Verification failed: method not found after insertion');
}
