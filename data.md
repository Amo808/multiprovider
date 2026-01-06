Retrieve & Re-Rank
In Semantic Search we have shown how to use SentenceTransformer to compute embeddings for queries, sentences, and paragraphs and how to use this for semantic search. For complex search tasks, for example question answering retrieval, the search can significantly be improved by using Retrieve & Re-Rank.

Retrieve & Re-Rank Pipeline
The following pipeline for Information Retrieval / Question Answering Retrieval works very well. All components are provided and explained in this article:

InformationRetrieval

Given a search query, we first use a retrieval system that retrieves a large list of e.g. 100 possible hits which are potentially relevant for the query. For the retrieval, we can use either lexical search, e.g. with a vector engine like Elasticsearch, or we can use dense retrieval with a SentenceTransformer (a.k.a. bi-encoder). However, the retrieval system might retrieve documents that are not that relevant for the search query. Hence, in a second stage, we use a re-ranker based on a CrossEncoder that scores the relevancy of all candidates for the given search query. The output will be a ranked list of hits we can present to the user.

Retrieval: Bi-Encoder
For the retrieval of the candidate set, we can either use lexical search (e.g. Elasticsearch), or we can use a bi-encoder which is implemented in Sentence Transformers.

Lexical search looks for literal matches of the query words in your document collection. It will not recognize synonyms, acronyms or spelling variations. In contrast, semantic search (or dense retrieval) encodes the search query into vector space and retrieves the document embeddings that are close in vector space.

SemanticSearch

Semantic search overcomes the shortcomings of lexical search and can recognize synonym and acronyms. Have a look at the semantic search article for different options to implement semantic search.

Re-Ranker: Cross-Encoder
The retriever has to be efficient for large document collections with millions of entries. However, it might return irrelevant candidates. A re-ranker based on a Cross-Encoder can substantially improve the final results for the user. The query and a possible document is passed simultaneously to transformer network, which then outputs a single score between 0 and 1 indicating how relevant the document is for the given query.

CrossEncoder

The advantage of Cross-Encoders is the higher performance, as they perform attention across the query and the document. Scoring thousands or millions of (query, document)-pairs would be rather slow. Hence, we use the retriever to create a set of e.g. 100 possible candidates which are then re-ranked by the Cross-Encoder.

Example Scripts
retrieve_rerank_simple_wikipedia.ipynb [ Colab Version ]: This script uses the smaller Simple English Wikipedia as document collection to provide answers to user questions / search queries. First, we split all Wikipedia articles into paragraphs and encode them with a bi-encoder. If a new query / question is entered, it is encoded by the same bi-encoder and the paragraphs with the highest cosine-similarity are retrieved (see semantic search). Next, the retrieved candidates are scored by a Cross-Encoder re-ranker and the 5 passages with the highest score from the Cross-Encoder are presented to the user.

in_document_search_crossencoder.py: If you only have a small set of paragraphs, we don’t do the retrieval stage. This is for example the case if you want to perform search within a single document. In this example, we take the Wikipedia article about Europe and split it into paragraphs. Then, the search query / question and all paragraphs are scored using the Cross-Encoder re-ranker. The most relevant passages for the query are returned.

Pre-trained Bi-Encoders (Retrieval)
The bi-encoder produces embeddings independently for your paragraphs and for your search queries. You can use it like this:

from sentence_transformers import SentenceTransformer

model = SentenceTransformer("multi-qa-mpnet-base-dot-v1")

docs = [
    "My first paragraph. That contains information",
    "Python is a programming language.",
]
document_embeddings = model.encode(docs)

query = "What is Python?"
query_embedding = model.encode(query)
For more details how to compare the embeddings, see semantic search.

We provide pre-trained models based on:

MS MARCO: 500k real user queries from Bing search engine. See MS MARCO models

Pre-trained Cross-Encoders (Re-Ranker)
For pre-trained Cross Encoder models, see: MS MARCO Cross-Encoders


Over the years, I have collaborated closely with ML engineering leaders across various industries, guiding them on how to make the right chunking strategy decisions for their Retrieval-Augmented Generation (RAG) use cases. One of the biggest challenges I’ve observed is the lack of clear, practical guidance on how to effectively structure and segment source documents to maximize retrieval quality and LLM performance.

To bridge this gap, I embarked on a journey to document the best practices and implementation strategies for optimal chunking in RAG workflows — specifically on Databricks. This guide is the culmination of that effort, providing a comprehensive breakdown of leading chunking techniques, practical code examples, and industry-proven methodologies to help you build high-performance RAG systems in 2025 and beyond.

If you’re looking to refine your RAG pipeline, ensure efficient retrieval, and avoid common pitfalls in chunking, this guide has everything you need.


Why Chunking Matters in RAG
Chunking is simply the act of splitting larger documents into smaller units (“chunks”). Each chunk can be individually indexed, embedded, and retrieved. Because RAG pipelines often rely on retrieval from vector databases and large language models (LLMs) with limited context windows, smart chunking can make all the difference in delivering relevant, context-rich answers.

According to an article by UnDatas, “The main goal of chunking is to segment complex data into more digestible pieces. This improves retrieval accuracy and reduces computational overhead.”

Key reasons to invest in a strong chunking strategy include:

Context Window Constraints: Both embedding models and LLMs have strict context size limits. Well-sized chunks ensure no chunk exceeds these boundaries.
Improved Retrieval Efficiency: Precise and smaller chunks often mean faster lookups and better recall.
Computational Optimization: Appropriate chunk sizes can reduce unnecessary processing.
Enhanced Relevance: Maintaining semantic integrity ensures more accurate matches and ultimately better answers.
Where Chunking Fits in the RAG Pipeline
A typical RAG system consists of:

Indexing — Convert documents into vector embeddings and store them in a vector database.
Retrieval — Query the database for the most relevant chunks.
Augmentation — Inject retrieved chunks into the LLM prompt.
Generation — Prompt the LLM to produce a final, context-informed response.
Chunking happens in the preprocessing stage (part of the indexing workflow). Its quality directly affects the retrieval phase, shaping how relevant or comprehensive the context is for downstream generation.

Overview of Chunking Strategies
1. Fixed-Size Chunking
Concept
This is the simplest approach, segmenting text into equally sized pieces (using character, token, or word counts). Often, an overlap is introduced to maintain continuity of ideas.

Example with LangChain (Character-based):

from langchain_text_splitters import CharacterTextSplitter
from langchain_core.documents import Document

def perform_fixed_size_chunking(document, chunk_size=1000, chunk_overlap=200:disappointed_face:
    """
    Performs fixed-size chunking on a document with specified overlap.
    
    Args:
        document (str): The text document to process
        chunk_size (int): The target size of each chunk in characters
        chunk_overlap (int): The number of characters of overlap between chunks
        
    Returns:
        list: The chunked documents with metadata
    """
    # Create the text splitter with optimal parameters
    text_splitter = CharacterTextSplitter(
        separator="\n\n",
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len
    )
    
    # Split the text into chunks
    chunks = text_splitter.split_text(document)
    print(f"Document split into {len(chunks)} chunks")
    
    # Convert to Document objects with metadata
    documents = []
    for i, chunk in enumerate(chunks):
        doc = Document(
            page_content=chunk,
            metadata={
                "chunk_id": i,
                "total_chunks": len(chunks),
                "chunk_size": len(chunk),
                "chunk_type": "fixed-size"
            }
        )
        documents.append(doc)
    
    return documents

# Example usage
if __name__ == "__main__":
    
    # Create the dummy document
    document = create_dummy_document()
    
    # Process with fixed-size chunking
    chunked_docs = perform_fixed_size_chunking(
        document,
        chunk_size=1000,
        chunk_overlap=200
    )
    
    # Display results
    print("\n----- CHUNKING RESULTS -----")
    print(f"Total chunks: {len(chunked_docs)}")
    
    # Print an example chunk
    print("\n----- EXAMPLE CHUNK -----")
    middle_chunk_idx = len(chunked_docs) // 2
    example_chunk = chunked_docs[middle_chunk_idx]
    print(f"Chunk {middle_chunk_idx} content ({len(example_chunk.page_content)} characters):")
    print("-" * 40)
    print(example_chunk.page_content)
    print("-" * 40)
    print(f"Metadata: {example_chunk.metadata}")
    
    # For integration with Databricks Vector Search
    print("\nThese documents are ready for embedding and storage in Databricks Vector Search")
    print("Example next steps:")
    print("1. Create embeddings using the Databricks embedding endpoint")
    print("2. Store documents and embeddings in Delta table")
    print("3. Create Vector Search index for retrieval")
Advantages

Straightforward and easy to implement.
Uniform chunk size simplifies batch operations.
Works decently for content that doesn’t heavily rely on semantic context.
Drawbacks

May cut off sentences or paragraphs abruptly.
Ignores natural semantic breaks.
Relevant information can end up scattered across chunks.
Best Fit: Relatively uniform documents with consistent formatting, such as simple logs or straightforward text.

2. Semantic Chunking
Concept
Instead of arbitrarily slicing text by length, semantic chunking splits documents at logical boundaries (e.g., sentences, paragraphs, or sections). Often, consecutive segments that are highly similar may be merged, providing coherent text blocks.

Example with LangChain (Recursive approach):

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
import re

def perform_semantic_chunking(document, chunk_size=500, chunk_overlap=100:disappointed_face:
    """
    Performs semantic chunking on a document using recursive character splitting 
    at logical text boundaries.
    
    Args:
        document (str): The text document to process
        chunk_size (int): The target size of each chunk in characters
        chunk_overlap (int): The number of characters of overlap between chunks
        
    Returns:
        list: The semantically chunked documents with metadata
    """
    # Create the text splitter with semantic separators
    text_splitter = RecursiveCharacterTextSplitter(
        separators=["\n\n", "\n", ". ", " ", ""],
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len
    )
    
    # Split the text into semantic chunks
    semantic_chunks = text_splitter.split_text(document)
    print(f"Document split into {len(semantic_chunks)} semantic chunks")
    
    # Determine section titles for enhanced metadata
    section_patterns = [
        r'^#+\s+(.+)$',      # Markdown headers
        r'^.+\n[=\-]{2,}$',  # Underlined headers
        r'^[A-Z\s]+:$'       # ALL CAPS section titles
    ]
    
    # Convert to Document objects with enhanced metadata
    documents = []
    current_section = "Introduction"
    
    for i, chunk in enumerate(semantic_chunks):
        # Try to identify section title from chunk
        chunk_lines = chunk.split('\n')
        for line in chunk_lines:
            for pattern in section_patterns:
                match = re.match(pattern, line, re.MULTILINE)
                if match:
                    current_section = match.group(0)
                    break
        
        # Calculate semantic density (ratio of non-stopwords to total words)
        words = re.findall(r'\b\w+\b', chunk.lower())
        stopwords = ['the', 'and', 'is', 'of', 'to', 'a', 'in', 'that', 'it', 'with', 'as', 'for']
        content_words = [w for w in words if w not in stopwords]
        semantic_density = len(content_words) / max(1, len(words))
        
        doc = Document(
            page_content=chunk,
            metadata={
                "chunk_id": i,
                "total_chunks": len(semantic_chunks),
                "chunk_size": len(chunk),
                "chunk_type": "semantic",
                "section": current_section,
                "semantic_density": round(semantic_density, 2)
            }
        )
        documents.append(doc)
    
    return documents

# Example usage with Databricks integration
if __name__ == "__main__":

    # Create the dummy document
    document = create_dummy_document()
    
    # Process with semantic chunking
    chunked_docs = perform_semantic_chunking(
        document,
        chunk_size=500,
        chunk_overlap=100
    )
    
    # Display results
    print("\n----- CHUNKING RESULTS -----")
    print(f"Total semantic chunks: {len(chunked_docs)}")
    
    # Print an example chunk
    print("\n----- EXAMPLE SEMANTIC CHUNK -----")
    middle_chunk_idx = len(chunked_docs) // 2
    example_chunk = chunked_docs[middle_chunk_idx]
    print(f"Chunk {middle_chunk_idx} content ({len(example_chunk.page_content)} characters):")
    print("-" * 40)
    print(example_chunk.page_content)
    print("-" * 40)
    print(f"Metadata: {example_chunk.metadata}")
    
    # Optional: Calculate section distribution for analysis
    section_counts = {}
    for doc in chunked_docs:
        section = doc.metadata["section"]
        section_counts[section] = section_counts.get(section, 0) + 1
    
    print("\n----- SECTION DISTRIBUTION -----")
    for section, count in section_counts.items():
        print(f"{section}: {count} chunks")
    
    # For integration with Databricks embeddings
    print("\nTo integrate with Databricks:")
    print("1. Create embeddings using the Databricks embedding API:")
    print("   from langchain_community.embeddings import DatabricksEmbeddings")
    print("   embeddings = DatabricksEmbeddings(endpoint='databricks-bge-large-en')")
    print("2. Store documents and embeddings in Delta table")
    print("3. Create Vector Search index using the semantic metadata for filtering")
Advantages

Preserves the flow of ideas.
Keeps related concepts together, boosting retrieval accuracy.
Helpful for documents like articles or academic papers that have clear sections.
Drawbacks

More complex to implement.
Yields variable chunk sizes.
Slightly higher computational requirements.
Best Fit: Well-structured, narrative, or academic documents where continuity is crucial.

3. Recursive Chunking
Concept
Recursive chunking relies on a hierarchy of separators. The algorithm attempts to split on high-level separators first, then moves to increasingly finer separators if chunks remain too large.

Example for Python code:

from langchain_text_splitters import RecursiveCharacterTextSplitter, Language
from langchain_core.documents import Document
import re

def perform_code_chunking(code_document, language="python", chunk_size=100, chunk_overlap=15:disappointed_face:
    """
    Performs recursive chunking on code documents using language-aware splitting.
    
    Args:
        code_document (str): The code document to process
        language (str): Programming language of the code
        chunk_size (int): The target size of each chunk in characters
        chunk_overlap (int): The number of characters of overlap between chunks
        
    Returns:
        list: The chunked code as Document objects with metadata
    """
    # Create language-specific splitter using the updated API
    if language.lower() == "python":
        code_splitter = RecursiveCharacterTextSplitter.from_language(
            language=Language.PYTHON,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap
        )
    elif language.lower() == "javascript":
        code_splitter = RecursiveCharacterTextSplitter.from_language(
            language=Language.JS,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap
        )
    elif language.lower() == "java":
        code_splitter = RecursiveCharacterTextSplitter.from_language(
            language=Language.JAVA,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap
        )
    elif language.lower() == "go":
        code_splitter = RecursiveCharacterTextSplitter.from_language(
            language=Language.GO,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap
        )
    elif language.lower() == "rust":
        code_splitter = RecursiveCharacterTextSplitter.from_language(
            language=Language.RUST,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap
        )
    else:
        # Fallback to generic code splitting
        code_splitter = RecursiveCharacterTextSplitter(
            separators=["\nclass ", "\ndef ", "\n\n", "\n", " ", ""],
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len
        )
        
    # Split the code into chunks
    code_chunks = code_splitter.split_text(code_document)
    print(f"Code document split into {len(code_chunks)} chunks")
    
    # Extract functions and classes for better metadata
    documents = []
    for i, chunk in enumerate(code_chunks):
        # Try to identify code structure
        function_match = re.search(r'def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', chunk)
        class_match = re.search(r'class\s+([a-zA-Z_][a-zA-Z0-9_]*)', chunk)
        import_match = re.search(r'import\s+([a-zA-Z_][a-zA-Z0-9_\.]*)', chunk)
        
        # Determine chunk type
        chunk_type = "code_segment"
        if function_match:
            chunk_type = "function"
            structure_name = function_match.group(1)
        elif class_match:
            chunk_type = "class"
            structure_name = class_match.group(1)
        elif import_match:
            chunk_type = "import"
            structure_name = import_match.group(1)
        else:
            structure_name = f"segment_{i}"
        
        # Create document with enhanced metadata
        doc = Document(
            page_content=chunk,
            metadata={
                "chunk_id": i,
                "total_chunks": len(code_chunks),
                "language": language,
                "chunk_type": chunk_type,
                "structure_name": structure_name,
                "lines": chunk.count('\n') + 1
            }
        )
        documents.append(doc)
    
    return documents

# Create an example Python document for testing
def create_python_document():
    """
    Creates a sample Python document for testing code chunking.
    """
    python_code = """
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report

# Load and prepare data
def load_data(filepath):
    \"\"\"
    Load data from CSV file
    
    Args:
        filepath: Path to the CSV file
        
    Returns:
        Pandas DataFrame containing the data
    \"\"\"
    df = pd.read_csv(filepath)
    print(f"Loaded data with {df.shape[0]} rows and {df.shape[1]} columns")
    return df

def preprocess_data(df, target_column):
    \"\"\"
    Preprocess the data for training
    
    Args:
        df: Input DataFrame
        target_column: Name of the target column
        
    Returns:
        X, y for model training
    \"\"\"
    # Handle missing values
    df = df.fillna(df.mean())
    
    # Split features and target
    X = df.drop(target_column, axis=1)
    y = df[target_column]
    
    return X, y

class ModelTrainer:
    \"\"\"
    Class to handle model training and evaluation
    \"\"\"
    def __init__(self, model_type='rf', random_state=42):
        \"\"\"Initialize the trainer\"\"\"
        self.random_state = random_state
        if model_type == 'rf':
            self.model = RandomForestClassifier(random_state=random_state)
        else:
            raise ValueError(f"Unsupported model type: {model_type}")
    
    def train(self, X, y, test_size=0.2):
        \"\"\"Train the model with train-test split\"\"\"
        # Split the data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=self.random_state
        )
        
        # Train the model
        self.model.fit(X_train, y_train)
        
        # Evaluate
        train_preds = self.model.predict(X_train)
        test_preds = self.model.predict(X_test)
        
        train_acc = accuracy_score(y_train, train_preds)
        test_acc = accuracy_score(y_test, test_preds)
        
        print(f"Training accuracy: {train_acc:.4f}")
        print(f"Testing accuracy: {test_acc:.4f}")
        
        return {
            'model': self.model,
            'X_test': X_test,
            'y_test': y_test,
            'test_acc': test_acc
        }
    
    def get_feature_importance(self, feature_names):
        \"\"\"Get feature importance from the model\"\"\"
        if not hasattr(self.model, 'feature_importances_'):
            raise ValueError("Model doesn't have feature importances")
        
        importances = self.model.feature_importances_
        indices = np.argsort(importances)[::-1]
        
        result = []
        for i in indices:
            result.append({
                'feature': feature_names[i],
                'importance': importances[i]
            })
        
        return result

# Main execution
if __name__ == "__main__":
    # Example usage
    filepath = "data/dataset.csv"
    df = load_data(filepath)
    
    X, y = preprocess_data(df, target_column="target")
    
    trainer = ModelTrainer(model_type='rf')
    results = trainer.train(X, y, test_size=0.25)
    
    # Print feature importance
    importances = trainer.get_feature_importance(X.columns)
    print("\\nFeature Importance:")
    for item in importances[:5]:
        print(f"- {item['feature']}: {item['importance']:.4f}")
"""
    return python_code

# Example usage with Databricks integration
if __name__ == "__main__":
    # Create Python code document
    python_document = create_python_document()
    
    # Process with code chunking
    chunked_docs = perform_code_chunking(
        python_document,
        language="python",
        chunk_size=100,
        chunk_overlap=15
    )
    
    # Display results
    print("\n----- CHUNKING RESULTS -----")
    print(f"Total code chunks: {len(chunked_docs)}")
    
    # Print chunk types distribution
    chunk_types = {}
    for doc in chunked_docs:
        chunk_type = doc.metadata["chunk_type"]
        chunk_types[chunk_type] = chunk_types.get(chunk_type, 0) + 1
    
    print("\n----- CODE STRUCTURE BREAKDOWN -----")
    for chunk_type, count in chunk_types.items():
        print(f"{chunk_type}: {count} chunks")
    
    # Print an example function chunk
    print("\n----- EXAMPLE FUNCTION CHUNK -----")
    function_chunks = [doc for doc in chunked_docs if doc.metadata["chunk_type"] == "function"]
    if function_chunks:
        example_chunk = function_chunks[0]
        print(f"Function: {example_chunk.metadata['structure_name']}")
        print("-" * 40)
        print(example_chunk.page_content)
        print("-" * 40)
    
    # For integration with Databricks
    print("\nTo use with Databricks:")
    print("1. Store code chunks in Delta table with metadata")
    print("2. Create embeddings using:")
    print("   from langchain_community.embeddings import DatabricksEmbeddings")
    print("   embeddings = DatabricksEmbeddings(endpoint='databricks-bge-large-en')")
    print("3. Create Vector Search index for code retrieval")
    print("4. Use function/class metadata for filtering during retrieval")
Advantages

Creates more context-aware splits than simple fixed-size approaches.
Especially powerful for structured text or code, where block-based splitting is crucial.
Drawbacks

More complicated to configure.
Requires domain-specific separators for best results (like “def” or “class” in Python).
Best Fit: Technical documents with a clear structure, especially code repositories or structured reports.

4. Adaptive Chunking
Concept
Adaptive chunking changes chunk sizes based on text complexity. Simpler sections become larger chunks, denser or more intricate sections become smaller chunks.

Example (pseudo-code style):

import re
import nltk
from nltk.tokenize import sent_tokenize
from langchain_core.documents import Document
from langchain_text_splitters import TextSplitter
import numpy as np

# You might need to download NLTK resources in Databricks
# This can be run once at the start of your notebook
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

class AdaptiveTextSplitter(TextSplitter:disappointed_face:
    """
    Custom text splitter that adapts chunk sizes based on text complexity.
    """
    
    def __init__(
        self,
        min_chunk_size: int = 300,
        max_chunk_size: int = 1000,
        min_chunk_overlap: int = 30,
        max_chunk_overlap: int = 150,
        complexity_measure: str = "lexical_density",
        length_function=len,
        **kwargs
    :disappointed_face:
        """Initialize with parameters for adaptive chunking.
        
        Args:
            min_chunk_size: Minimum size for chunks with highest complexity
            max_chunk_size: Maximum size for chunks with lowest complexity
            min_chunk_overlap: Minimum overlap between chunks
            max_chunk_overlap: Maximum overlap for complex chunks
            complexity_measure: Method to measure text complexity 
                                (options: "lexical_density", "sentence_length", "combined")
            length_function: Function to measure text length
        """
        super().__init__(**kwargs)
        self.min_chunk_size = min_chunk_size
        self.max_chunk_size = max_chunk_size
        self.min_chunk_overlap = min_chunk_overlap
        self.max_chunk_overlap = max_chunk_overlap
        self.complexity_measure = complexity_measure
        self.length_function = length_function
    
    def analyze_complexity(self, text: str) -> float:
        """
        Analyze the complexity of text and return a score between 0 and 1.
        Higher score means more complex text.
        """
        if not text.strip():
            return 0.0
        
        # Lexical density: ratio of unique words to total words
        if self.complexity_measure == "lexical_density" or self.complexity_measure == "combined":
            words = re.findall(r'\b\w+\b', text.lower())
            if not words:
                lex_density = 0
            else:
                unique_words = set(words)
                lex_density = len(unique_words) / len(words)
            
            # Normalize between 0 and 1, assuming max lex_density of 0.8
            lex_density = min(1.0, lex_density / 0.8)
        else:
            lex_density = 0
        
        # Average sentence length as a complexity factor
        if self.complexity_measure == "sentence_length" or self.complexity_measure == "combined":
            sentences = sent_tokenize(text)
            if not sentences:
                sent_complexity = 0
            else:
                avg_length = sum(len(s) for s in sentences) / len(sentences)
                # Normalize with assumption that 200 char is complex
                sent_complexity = min(1.0, avg_length / 200)
        else:
            sent_complexity = 0
        
        # Combined measure
        if self.complexity_measure == "combined":
            return (lex_density + sent_complexity) / 2
        elif self.complexity_measure == "lexical_density":
            return lex_density
        else:  # sentence_length
            return sent_complexity
    
    def split_text(self, text: str) -> list[str]:
        """Split text into chunks based on adaptive sizing."""
        if not text:
            return []
            
        # First split text into sentences
        sentences = sent_tokenize(text)
        chunks = []
        current_chunk = []
        current_size = 0
        current_complexity = 0.5  # Start with medium complexity
        
        for sentence in sentences:
            sentence_len = self.length_function(sentence)
            
            # Skip empty sentences
            if sentence_len == 0:
                continue
                
            # Analyze sentence complexity
            sentence_complexity = self.analyze_complexity(sentence)
            
            # Update running complexity average
            if current_chunk:
                current_complexity = (current_complexity + sentence_complexity) / 2
            else:
                current_complexity = sentence_complexity
                
            # Calculate target size based on complexity
            # More complex text gets smaller chunks
            target_size = self.max_chunk_size - (current_complexity * (self.max_chunk_size - self.min_chunk_size))
            
            # Calculate adaptive overlap
            target_overlap = self.min_chunk_overlap + (current_complexity * (self.max_chunk_overlap - self.min_chunk_overlap))
            
            # Check if adding this sentence would exceed the target size
            if current_size + sentence_len > target_size and current_chunk:
                # Join current chunk and add to results
                chunks.append(" ".join(current_chunk))
                
                # Start new chunk with overlap
                overlap_size = 0
                overlap_chunk = []
                
                # Add sentences from the end of the previous chunk for overlap
                for prev_sentence in reversed(current_chunk):
                    if overlap_size + self.length_function(prev_sentence) <= target_overlap:
                        overlap_chunk.insert(0, prev_sentence)
                        overlap_size += self.length_function(prev_sentence)
                    else:
                        break
                
                # Start new chunk with the overlap plus the current sentence
                current_chunk = overlap_chunk + [sentence]
                current_size = sum(self.length_function(s) for s in current_chunk)
            else:
                # Add sentence to current chunk
                current_chunk.append(sentence)
                current_size += sentence_len
        
        # Add the last chunk if it exists
        if current_chunk:
            chunks.append(" ".join(current_chunk))
        
        return chunks
    
    def create_documents(self, texts: list[str], metadatas: list[dict] = None) -> list[Document]:
        """Create Document objects with complexity metadata."""
        documents = []
        
        for i, text in enumerate(texts):
            # Calculate text complexity for metadata
            complexity = self.analyze_complexity(text)
            
            # Create base metadata
            metadata = {
                "chunk_id": i,
                "total_chunks": len(texts),
                "chunk_size": self.length_function(text),
                "chunk_type": "adaptive",
                "text_complexity": round(complexity, 3),
            }
            
            # Add any additional metadata
            if metadatas and i < len(metadatas):
                metadata.update(metadatas[i])
            
            doc = Document(page_content=text, metadata=metadata)
            documents.append(doc)
        
        return documents

def perform_adaptive_chunking(document, min_size=300, max_size=1000, 
                              min_overlap=30, max_overlap=150,
                              complexity_measure="combined":disappointed_face:
    """
    Performs adaptive chunking on a document, with chunk size varying by text complexity.
    
    Args:
        document (str): The text document to process
        min_size (int): Minimum chunk size for complex sections
        max_size (int): Maximum chunk size for simple sections
        min_overlap (int): Minimum overlap between chunks
        max_overlap (int): Maximum overlap for complex chunks
        complexity_measure (str): Method to measure complexity
        
    Returns:
        list: The adaptively chunked documents with metadata
    """
    # Create the adaptive text splitter
    splitter = AdaptiveTextSplitter(
        min_chunk_size=min_size,
        max_chunk_size=max_size,
        min_chunk_overlap=min_overlap,
        max_chunk_overlap=max_overlap,
        complexity_measure=complexity_measure
    )
    
    # Split the document into chunks
    chunks = splitter.split_text(document)
    print(f"Document split into {len(chunks)} adaptive chunks")
    
    # Create Document objects with complexity metadata
    documents = splitter.create_documents(chunks)
    
    # Add additional metrics
    chunk_sizes = [doc.metadata["chunk_size"] for doc in documents]
    if chunk_sizes:
        avg_size = sum(chunk_sizes) / len(chunk_sizes)
        for doc in documents:
            doc.metadata["avg_chunk_size"] = round(avg_size, 1)
            doc.metadata["size_vs_avg"] = round(doc.metadata["chunk_size"] / avg_size, 2)
    
    return documents

# Example usage with Databricks integration
if __name__ == "__main__":
    # Create the dummy document
    document = create_dummy_document()

    # Process with adaptive chunking
    chunked_docs = perform_adaptive_chunking(
        document,
        min_size=300,
        max_size=1000,
        complexity_measure="combined"
    )
    
    # Display results
    print("\n----- CHUNKING RESULTS -----")
    print(f"Total adaptive chunks: {len(chunked_docs)}")
    
    # Calculate complexity stats
    complexities = [doc.metadata["text_complexity"] for doc in chunked_docs]
    sizes = [doc.metadata["chunk_size"] for doc in chunked_docs]
    
    print("\n----- COMPLEXITY ANALYSIS -----")
    print(f"Average complexity: {sum(complexities)/len(complexities):.3f}")
    print(f"Min complexity: {min(complexities):.3f}")
    print(f"Max complexity: {max(complexities):.3f}")
    
    print("\n----- SIZE ANALYSIS -----")
    print(f"Average chunk size: {sum(sizes)/len(sizes):.1f} characters")
    print(f"Min chunk size: {min(sizes)} characters")
    print(f"Max chunk size: {max(sizes)} characters")
    
    # Print examples of high and low complexity chunks
    high_complex_idx = complexities.index(max(complexities))
    low_complex_idx = complexities.index(min(complexities))
    
    print("\n----- HIGHEST COMPLEXITY CHUNK -----")
    print(f"Complexity: {chunked_docs[high_complex_idx].metadata['text_complexity']}")
    print(f"Size: {chunked_docs[high_complex_idx].metadata['chunk_size']} characters")
    print("-" * 40)
    print(chunked_docs[high_complex_idx].page_content[:200] + "...")
    
    print("\n----- LOWEST COMPLEXITY CHUNK -----")
    print(f"Complexity: {chunked_docs[low_complex_idx].metadata['text_complexity']}")
    print(f"Size: {chunked_docs[low_complex_idx].metadata['chunk_size']} characters")
    print("-" * 40)
    print(chunked_docs[low_complex_idx].page_content[:200] + "...")
    
    # For integration with Databricks Vector Search
    print("\nTo integrate with Databricks:")
    print("1. Create embeddings using DatabricksEmbeddings")
    print("2. Store documents and embeddings in a Delta table")
    print("3. Create a Vector Search index with complexity filtering capability")
    print("4. During retrieval, consider filtering by complexity for specific use cases")
Advantages

Dynamically allocates resources to complex sections.
Reduces unnecessary token usage on simpler parts.
Can provide a more nuanced approach to chunking.
Drawbacks

Requires a “complexity” function or metric.
More difficult to debug or tune.
Demands more computation up front.
Best Fit: Mixed-content documents with varying degrees of complexity, such as technical handbooks containing both simple descriptions and advanced in-depth analyses.

5. Context-Enriched Chunking
Concept
Context-enriched methods attach additional metadata or summaries to each chunk. By doing so, retrieval models have more background for each chunk, leading to improved understanding during generation.

Example (using a windowed summarization approach):

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain.chains.combine_documents.stuff import StuffDocumentsChain
from langchain.chains.llm import LLMChain
from langchain.prompts import PromptTemplate
from langchain_community.chat_models import ChatDatabricks
from langchain_core.documents import Document
import numpy as np

def perform_context_enriched_chunking(document, chunk_size=500, chunk_overlap=50, 
                                     window_size=1, summarize=True:disappointed_face:
    """
    Performs context-enriched chunking by attaching summaries from neighboring chunks.
    
    Args:
        document (str): The text document to process
        chunk_size (int): Base size for each chunk
        chunk_overlap (int): Overlap between chunks
        window_size (int): Number of chunks to include on each side for context
        summarize (bool): Whether to summarize context (True) or use raw text (False)
        
    Returns:
        list: The enriched document chunks with metadata
    """
    # Initialize the Databricks model
    chat_model = ChatDatabricks(
        endpoint="databricks-meta-llama-3-3-70b-instruct",
        temperature=0.1,
        max_tokens=250,
    )

    # Create text splitter with optimal parameters
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ".", " ", ""]
    )

    # Split the document into base chunks
    base_chunks = splitter.split_text(document)
    print(f"Document split into {len(base_chunks)} base chunks")

    # Create a summarization chain
    summary_prompt = PromptTemplate.from_template(
        "Provide a brief summary of the following text:\n\n{text}\n\nSummary:"
    )
    summary_chain = LLMChain(llm=chat_model, prompt=summary_prompt)
    combine_documents_chain = StuffDocumentsChain(
        llm_chain=summary_chain,
        document_variable_name="text"
    )

    # Process chunks with contextual windows
    enriched_documents = []
    for i, chunk in enumerate(base_chunks):
        print(f"Processing chunk {i+1}/{len(base_chunks)}")
        
        # Define window around current chunk
        window_start = max(0, i - window_size)
        window_end = min(len(base_chunks), i + window_size + 1)
        window = base_chunks[window_start:window_end]
        
        # Extract context (excluding the current chunk)
        context_chunks = [c for j, c in enumerate(window) if j != i - window_start]
        context_text = " ".join(context_chunks)
        
        # Prepare metadata
        metadata = {
            "chunk_id": i,
            "total_chunks": len(base_chunks),
            "chunk_size": len(chunk),
            "window_start_idx": window_start,
            "window_end_idx": window_end - 1,
            "has_context": len(context_chunks) > 0
        }
        
        # Handle context based on whether summarization is enabled
        if context_chunks and summarize:
            try:
                # Convert to Document objects for the summarization chain
                context_docs = [Document(page_content=context_text)]
                
                # Summarize neighbor chunks for context
                context_summary = combine_documents_chain.invoke(context_docs)
                metadata["context"] = context_summary
                metadata["context_type"] = "summary"
                
                # Create enriched text
                enriched_text = f"Context: {context_summary}\n\nContent: {chunk}"
                
            except Exception as e:
                print(f"Summarization error for chunk {i}: {e}")
                # Fallback to raw context
                metadata["context"] = context_text
                metadata["context_type"] = "raw_text"
                metadata["summary_error"] = str(e)
                enriched_text = f"Context: {context_text}\n\nContent: {chunk}"
        
        elif context_chunks:
            # Use raw context without summarization
            metadata["context"] = context_text
            metadata["context_type"] = "raw_text"
            enriched_text = f"Context: {context_text}\n\nContent: {chunk}"
        
        else:
            # No context available
            metadata["context"] = ""
            metadata["context_type"] = "none"
            enriched_text = chunk
        
        # Create Document object
        doc = Document(
            page_content=enriched_text,
            metadata=metadata
        )
        
        enriched_documents.append(doc)
    
    return enriched_documents

# Mock implementation for testing without Databricks
class MockChatModel:
    """Mock LLM for testing without Databricks."""
    def __init__(self, **kwargs:disappointed_face:
        self.kwargs = kwargs
    
    def invoke(self, input_text:disappointed_face:
        """Generate a simple summary based on the first few words."""
        if isinstance(input_text, list) and hasattr(input_text[0], 'page_content':disappointed_face:
            text = input_text[0].page_content
        else:
            text = str(input_text)
        
        # Extract first sentence or first 50 characters for mock summary
        first_sentence = text.split('.')[0]
        return f"Summary: {first_sentence[:100]}..."

def perform_context_enriched_chunking_mock(document, chunk_size=500, chunk_overlap=50, 
                                          window_size=1:disappointed_face:
    """
    Mock implementation of context-enriched chunking for testing without Databricks.
    """
    # Create text splitter
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ".", " ", ""]
    )

    # Split the document into base chunks
    base_chunks = splitter.split_text(document)
    print(f"Document split into {len(base_chunks)} base chunks")
    
    # Create a mock summarization function
    def mock_summarize(text:disappointed_face:
        first_sentence = text.split('.')[0]
        return f"Summary: {first_sentence[:100]}..."
    
    # Process chunks with contextual windows
    enriched_documents = []
    for i, chunk in enumerate(base_chunks):
        # Define window around current chunk
        window_start = max(0, i - window_size)
        window_end = min(len(base_chunks), i + window_size + 1)
        window = base_chunks[window_start:window_end]
        
        # Extract context (excluding the current chunk)
        context_chunks = [c for j, c in enumerate(window) if j != i - window_start]
        context_text = " ".join(context_chunks)
        
        # Generate mock summary for context
        if context_chunks:
            context_summary = mock_summarize(context_text)
            metadata = {
                "chunk_id": i,
                "total_chunks": len(base_chunks),
                "context": context_summary,
                "context_type": "summary"
            }
            enriched_text = f"Context: {context_summary}\n\nContent: {chunk}"
        else:
            metadata = {
                "chunk_id": i,
                "total_chunks": len(base_chunks),
                "context": "",
                "context_type": "none"
            }
            enriched_text = chunk
        
        # Create Document object
        doc = Document(
            page_content=enriched_text,
            metadata=metadata
        )
        
        enriched_documents.append(doc)
    
    return enriched_documents

# Example usage
if __name__ == "__main__":

    # Create the dummy document
    document = create_dummy_document()
    
    # Use mock version for testing without Databricks
    print("Using mock implementation for testing...")
    enriched_docs = perform_context_enriched_chunking_mock(
        document,
        chunk_size=500,
        chunk_overlap=50,
        window_size=1
    )
    
    # Display results
    print("\n----- CHUNKING RESULTS -----")
    print(f"Total enriched chunks: {len(enriched_docs)}")
    
    # Print an example chunk with its context
    print("\n----- EXAMPLE ENRICHED CHUNK -----")
    middle_chunk_idx = len(enriched_docs) // 2
    example_chunk = enriched_docs[middle_chunk_idx]
    print(f"Chunk {middle_chunk_idx} with context:")
    print("-" * 40)
    print(example_chunk.page_content)
    print("-" * 40)
    print(f"Metadata: {example_chunk.metadata}")
    
    print("\nTo use with Databricks:")
    print("1. Replace 'perform_context_enriched_chunking_mock' with 'perform_context_enriched_chunking'")
    print("2. Ensure your Databricks endpoint is correctly configured")
    print("3. Store documents with context in Delta table")
    print("4. Create embeddings that include the context information")
Advantages

Helps maintain coherence across different parts of the document.
Can boost retrieval performance in queries that span multiple segments.
Drawbacks

Increases both storage and memory requirements.
Additional preprocessing layer adds complexity.
Can introduce repetitive information if not carefully managed.
Best Fit: Documents where understanding the interplay between sections is crucial (e.g., multi-chapter reports or interconnected research papers).

6. AI-Driven Dynamic Chunking
Concept
AI-based chunking leverages an LLM to detect natural breakpoints in the text, ensuring each chunk encapsulates complete ideas. The approach adjusts chunk size on the fly based on conceptual density.

Example:

from langchain_community.chat_models import ChatDatabricks
from langchain.prompts import ChatPromptTemplate
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
import json
import re

def perform_ai_driven_chunking(document, max_chunks=20, fallback_chunk_size=1000:disappointed_face:
    """
    Uses an LLM to intelligently chunk content based on semantic boundaries.
    
    Args:
        document (str): The text document to process
        max_chunks (int): Maximum number of chunks to create
        fallback_chunk_size (int): Chunk size to use if LLM chunking fails
        
    Returns:
        list: The semantically chunked documents with metadata
    """
    # Initialize the Databricks LLM
    llm = ChatDatabricks(
        endpoint="databricks-meta-llama-3-3-70b-instruct",
        temperature=0.1,
        max_tokens=4000  # Increased to handle longer outputs
    )
    
    # Create a chat prompt template for the chunking task
    chunking_prompt = ChatPromptTemplate.from_template("""
    You are a document processing expert. Your task is to break down the following document into 
    at most {max_chunks} meaningful chunks. Follow these guidelines:
    
    1. Each chunk should contain complete ideas or concepts
    2. More complex sections should be in smaller chunks
    3. Preserve headers with their associated content
    4. Keep related information together
    5. Maintain the original order of the document
    
    DOCUMENT:
    {document}
    
    Return ONLY a valid JSON array of strings, where each string is a chunk.
    Format your response as:
    ```json
    [
      "chunk1 text",
      "chunk2 text",
      ...
    ]
    ```
    
    Do not include any explanations or additional text outside the JSON array.
    """)
    
    # Create the chain
    chunking_chain = chunking_prompt | llm
    
    try:
        # Invoke the LLM to get chunking suggestions
        response = chunking_chain.invoke({"document": document, "max_chunks": max_chunks})
        
        # Extract JSON from the response
        content = response.content
        
        # Find JSON array in the response (looking for text between [ and ])
        json_match = re.search(r'\[\s*".*"\s*\]', content, re.DOTALL)
        if json_match:
            content = json_match.group(0)
        
        # Try to parse the JSON response
        chunks = json.loads(content)
        print(f"Successfully chunked document into {len(chunks)} AI-driven chunks")
        
        # Create Document objects with metadata
        documents = []
        for i, chunk in enumerate(chunks):
            # Calculate relative position for tracking
            position = i / len(chunks)
            
            # Analyze chunk complexity based on length and unique word density
            words = re.findall(r'\b\w+\b', chunk.lower())
            unique_words = set(words)
            word_density = len(unique_words) / max(1, len(words))
            
            doc = Document(
                page_content=chunk,
                metadata={
                    "chunk_id": i,
                    "total_chunks": len(chunks),
                    "chunk_size": len(chunk),
                    "chunk_type": "ai_driven",
                    "document_position": round(position, 2),
                    "word_count": len(words),
                    "unique_words": len(unique_words),
                    "word_density": round(word_density, 2)
                }
            )
            documents.append(doc)
        
        return documents
            
    except Exception as e:
        print(f"LLM chunking failed: {e}")
        print("Falling back to basic chunking")
        return fallback_chunking(document, chunk_size=fallback_chunk_size)

def fallback_chunking(document, chunk_size=1000, chunk_overlap=100:disappointed_face:
    """
    Fallback method if LLM chunking fails.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    
    chunks = splitter.split_text(document)
    print(f"Fallback chunking created {len(chunks)} chunks")
    
    # Convert to Document objects
    documents = []
    for i, chunk in enumerate(chunks):
        doc = Document(
            page_content=chunk,
            metadata={
                "chunk_id": i,
                "total_chunks": len(chunks),
                "chunk_size": len(chunk),
                "chunk_type": "fallback",
                "document_position": round(i / len(chunks), 2)
            }
        )
        documents.append(doc)
    
    return documents

# Mock implementation for testing without Databricks
def perform_ai_driven_chunking_mock(document, max_chunks=20:disappointed_face:
    """
    Mock version of AI-driven chunking for testing without Databricks.
    Uses paragraph-based chunking as a simple approximation of LLM chunking.
    """
    # Simple chunking by paragraphs for the mock
    paragraphs = document.split("\n\n")
    
    # Combine very short paragraphs
    chunks = []
    current_chunk = ""
    
    for para in paragraphs:
        if not para.strip():
            continue
            
        if len(current_chunk) + len(para) < 500:
            current_chunk += para + "\n\n"
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = para + "\n\n"
    
    if current_chunk:
        chunks.append(current_chunk.strip())
    
    # Ensure we don't exceed max_chunks
    if len(chunks) > max_chunks:
        # Combine chunks to reduce count
        new_chunks = []
        chunks_per_group = len(chunks) // max_chunks + 1
        
        for i in range(0, len(chunks), chunks_per_group):
            group = chunks[i:i + chunks_per_group]
            new_chunks.append("\n\n".join(group))
        
        chunks = new_chunks
    
    print(f"Mock AI chunking created {len(chunks)} chunks")
    
    # Create Document objects
    documents = []
    for i, chunk in enumerate(chunks):
        # Calculate relative position
        position = i / len(chunks)
        
        # Basic text analytics
        words = re.findall(r'\b\w+\b', chunk.lower())
        unique_words = set(words)
        word_density = len(unique_words) / max(1, len(words))
        
        doc = Document(
            page_content=chunk,
            metadata={
                "chunk_id": i,
                "total_chunks": len(chunks),
                "chunk_size": len(chunk),
                "chunk_type": "mock_ai_driven",
                "document_position": round(position, 2),
                "word_count": len(words),
                "unique_words": len(unique_words),
                "word_density": round(word_density, 2)
            }
        )
        documents.append(doc)
    
    return documents

# Example usage
if __name__ == "__main__":
    # Import the dummy document creation function
    
    # Create the dummy document
    document = create_dummy_document()
    
    # Use mock version for testing without Databricks
    print("Using mock implementation for testing...")
    chunked_docs = perform_ai_driven_chunking_mock(document, max_chunks=10)
    
    # Display results
    print("\n----- CHUNKING RESULTS -----")
    print(f"Total chunks: {len(chunked_docs)}")
    
    # Print an example chunk
    print("\n----- EXAMPLE CHUNK -----")
    middle_chunk_idx = len(chunked_docs) // 2
    example_chunk = chunked_docs[middle_chunk_idx]
    print(f"Chunk {middle_chunk_idx}:")
    print("-" * 40)
    print(example_chunk.page_content[:200] + "..." if len(example_chunk.page_content) > 200 
          else example_chunk.page_content)
    print("-" * 40)
    print(f"Metadata: {example_chunk.metadata}")
    
    print("\nTo use with Databricks:")
    print("1. Replace 'perform_ai_driven_chunking_mock' with 'perform_ai_driven_chunking'")
    print("2. Ensure your Databricks endpoint is correctly configured")
    print("3. Consider adjusting max_chunks based on your document size")
Advantages

Highly adaptive, capturing semantic nuance.
Can significantly enhance retrieval accuracy.
Especially useful for complex, multi-topic documents.
Drawbacks

Relies on the performance of the underlying LLM.
Potentially expensive in terms of compute and API calls.
Harder to standardize or replicate consistently.
Best Fit: Projects with generous compute budgets and a critical need for accurate, context-driven chunk segmentation.

Factors to Consider When Choosing a Chunking Strategy
Document Structure & Type
Structured text (reports, articles): Semantic/recursive chunking.
Code or highly technical docs: Recursive, language-specific chunking.
Mixed or unstructured content: AI-driven or context-enriched chunking.
2. Query Complexity

Straightforward, fact-based queries: Smaller, more direct chunks.
Multifaceted, analytical queries: Larger, context-preserving chunks.
Queries spanning multiple concepts: Strategies that keep related data together.
3. Model Constraints

Pay attention to context window sizes of both LLMs and embedding models.
Keep an eye on token usage to avoid excessive costs.
4. Performance Requirements

Latency-sensitive use cases: Lighter, simpler chunking for fast retrieval.
Accuracy-critical domains: More advanced or context-enriched chunking.
Resource-limited settings: Favor straightforward methods like fixed-size or basic semantic splits.
How to Evaluate Chunking Approaches
Quantitative Metrics
Context Precision: How precisely do the chunks contain relevant info without adding unnecessary data?
Context Recall: How fully do the chunks capture all critical info for a query?
Processing Efficiency: How quickly can chunks be generated and retrieved?
Resource Utilization: CPU, memory, and storage overhead.
Sample Evaluation Framework
import time
import pandas as pd
import matplotlib.pyplot as plt
import re
from collections import Counter


def calculate_keyword_coverage(chunks, keywords:disappointed_face:
    """
    Calculate what percentage of keywords appear in at least one chunk.
    
    Args:
        chunks (list): List of text chunks
        keywords (list): List of keywords to search for
        
    Returns:
        float: Percentage of keywords covered (0-1)
    """
    # Convert chunks to lowercase for case-insensitive matching
    lowercase_chunks = [chunk.lower() for chunk in chunks]
    lowercase_keywords = [keyword.lower() for keyword in keywords]
    
    # Count how many keywords appear in at least one chunk
    keywords_found = 0
    for keyword in lowercase_keywords:
        if any(keyword in chunk for chunk in lowercase_chunks):
            keywords_found += 1
    
    # Calculate coverage
    coverage = keywords_found / max(1, len(keywords))
    return coverage

def calculate_chunk_coherence(chunks:disappointed_face:
    """
    Calculate the average coherence of chunks based on sentence completeness.
    
    Args:
        chunks (list): List of text chunks
        
    Returns:
        float: Coherence score (0-1)
    """
    # Count incomplete sentences at chunk boundaries
    incomplete_boundaries = 0
    
    for chunk in chunks:
        # Check if chunk starts with lowercase letter or continuation punctuation
        if chunk and (chunk[0].islower() or chunk[0] in ',;:)]}':disappointed_face:
            incomplete_boundaries += 1
        
        # Check if chunk ends without proper sentence-ending punctuation
        if chunk and not re.search(r'[.!?]\s*$', chunk):
            incomplete_boundaries += 1
    
    # Calculate coherence (lower incomplete_boundaries = higher coherence)
    max_boundaries = len(chunks) * 2  # Start and end of each chunk
    coherence = 1 - (incomplete_boundaries / max(1, max_boundaries))
    return coherence

def calculate_concept_splitting(chunks, key_phrases:disappointed_face:
    """
    Calculate how often key phrases are split across chunks.
    
    Args:
        chunks (list): List of text chunks
        key_phrases (list): List of important phrases that should stay together
        
    Returns:
        float: Non-splitting score (0-1), higher is better
    """
    # Count how many key phrases are split
    split_phrases = 0
    
    for phrase in key_phrases:
        phrase_lower = phrase.lower()
        
        # Check if phrase appears completely in any chunk
        complete_in_chunk = any(phrase_lower in chunk.lower() for chunk in chunks)
        
        # Check if parts of the phrase appear in different chunks
        words = phrase_lower.split()
        if len(words) > 1:
            parts_in_different_chunks = False
            
            for i in range(len(words) - 1:disappointed_face:
                part1 = " ".join(words[:i+1])
                part2 = " ".join(words[i+1:])
                
                for j, chunk1 in enumerate(chunks):
                    if part1 in chunk1.lower():
                        for chunk2 in chunks[j+1:]:
                            if part2 in chunk2.lower() and part1 not in chunk2.lower():
                                parts_in_different_chunks = True
                                break
            
            if parts_in_different_chunks and not complete_in_chunk:
                split_phrases += 1
    
    # Calculate non-splitting score
    non_splitting = 1 - (split_phrases / max(1, len(key_phrases)))
    return non_splitting

def evaluate_chunking_strategies(document, keywords, key_phrases, chunking_strategies:disappointed_face:
    """
    Evaluates chunking strategies with custom metrics.
    
    Args:
        document (str): Document to chunk
        keywords (list): Important keywords for coverage metric
        key_phrases (list): Important phrases for concept splitting metric
        chunking_strategies (dict): Dictionary of chunking strategies with parameters
        
    Returns:
        pd.DataFrame: Results of the evaluation
    """
    results = []
    
    for name, strategy in chunking_strategies.items():
        print(f"Evaluating strategy: {name}")
        start_time = time.time()
        
        # Perform chunking based on strategy type
        if strategy["type"] == "fixed":
            chunks = perform_fixed_size_chunking(
                document, 
                chunk_size=strategy.get("size", 1000),
                chunk_overlap=strategy.get("overlap", 0)
            )
        elif strategy["type"] == "semantic":
            chunks = perform_semantic_chunking(
                document,
                chunk_size=strategy.get("size", 500),
                chunk_overlap=strategy.get("overlap", 100)
            )
        elif strategy["type"] == "recursive":
            chunks = perform_code_chunking(
                document,
                language=strategy.get("language", "python"),
                chunk_size=strategy.get("size", 100),
                chunk_overlap=strategy.get("overlap", 15)
            )
        elif strategy["type"] == "adaptive":
            chunks = perform_adaptive_chunking(
                document,
                min_size=strategy.get("min_size", 300),
                max_size=strategy.get("max_size", 1000),
                complexity_measure=strategy.get("complexity_measure", "combined")
            )
        elif strategy["type"] == "context_enriched":
            chunks = perform_context_enriched_chunking(
                document,
                chunk_size=strategy.get("size", 500),
                chunk_overlap=strategy.get("overlap", 50),
                window_size=strategy.get("window_size", 1)
            )
        elif strategy["type"] == "ai_driven":
            chunks = perform_ai_driven_chunking(
                document,
                max_chunks=strategy.get("max_chunks", 10)
            )
        else:
            raise ValueError(f"Unknown chunking strategy type: {strategy['type']}")
        
        # Record processing time
        processing_time = time.time() - start_time
        
        # Convert to text for evaluation if they're Document objects
        chunk_texts = []
        for chunk in chunks:
            if hasattr(chunk, 'page_content':disappointed_face:
                chunk_texts.append(chunk.page_content)
            else:
                chunk_texts.append(chunk)
        
        # Calculate custom metrics
        keyword_coverage = calculate_keyword_coverage(chunk_texts, keywords)
        chunk_coherence = calculate_chunk_coherence(chunk_texts)
        concept_integrity = calculate_concept_splitting(chunk_texts, key_phrases)
        
        # Calculate chunk statistics
        total_chunks = len(chunks)
        
        # Get chunk sizes
        if hasattr(chunks[0], 'page_content':disappointed_face:
            chunk_sizes = [len(chunk.page_content) for chunk in chunks]
        else:
            chunk_sizes = [len(chunk) for chunk in chunks]
            
        avg_chunk_size = sum(chunk_sizes) / len(chunk_sizes)
        chunk_size_std = (sum((size - avg_chunk_size) ** 2 for size in chunk_sizes) / len(chunk_sizes)) ** 0.5
        size_consistency = 1 - (chunk_size_std / max(1, avg_chunk_size))
        
        # Store results
        results.append({
            "strategy": name,
            "processing_time": round(processing_time, 2),
            "keyword_coverage": round(keyword_coverage, 2),
            "chunk_coherence": round(chunk_coherence, 2),
            "concept_integrity": round(concept_integrity, 2),
            "size_consistency": round(size_consistency, 2),
            "total_chunks": total_chunks,
            "avg_chunk_size": round(avg_chunk_size, 2)
        })
    
    # Convert to DataFrame
    results_df = pd.DataFrame(results)
    return results_df

def visualize_results(results_df:disappointed_face:
    """
    Creates visualizations of the evaluation results.
    
    Args:
        results_df (pd.DataFrame): Evaluation results
    """
    # Set up the figure
    fig, axs = plt.subplots(2, 3, figsize=(18, 12))
    
    # Plot processing time
    axs[0, 0].bar(results_df['strategy'], results_df['processing_time'])
    axs[0, 0].set_title('Processing Time (seconds)')
    axs[0, 0].set_ylabel('Time (s)')
    axs[0, 0].set_xticklabels(results_df['strategy'], rotation=45, ha='right')
    
    # Plot quality metrics
    axs[0, 1].bar(results_df['strategy'], results_df['keyword_coverage'])
    axs[0, 1].set_title('Keyword Coverage')
    axs[0, 1].set_ylabel('Score (0-1)')
    axs[0, 1].set_xticklabels(results_df['strategy'], rotation=45, ha='right')
    
    # Plot concept integrity
    axs[0, 2].bar(results_df['strategy'], results_df['concept_integrity'])
    axs[0, 2].set_title('Concept Integrity')
    axs[0, 2].set_ylabel('Score (0-1)')
    axs[0, 2].set_xticklabels(results_df['strategy'], rotation=45, ha='right')
    
    # Plot chunk coherence
    axs[1, 0].bar(results_df['strategy'], results_df['chunk_coherence'])
    axs[1, 0].set_title('Chunk Coherence')
    axs[1, 0].set_ylabel('Score (0-1)')
    axs[1, 0].set_xticklabels(results_df['strategy'], rotation=45, ha='right')
    
    # Plot total chunks
    axs[1, 1].bar(results_df['strategy'], results_df['total_chunks'])
    axs[1, 1].set_title('Total Number of Chunks')
    axs[1, 1].set_ylabel('Count')
    axs[1, 1].set_xticklabels(results_df['strategy'], rotation=45, ha='right')
    
    # Plot size consistency
    axs[1, 2].bar(results_df['strategy'], results_df['size_consistency'])
    axs[1, 2].set_title('Chunk Size Consistency')
    axs[1, 2].set_ylabel('Score (0-1)')
    axs[1, 2].set_xticklabels(results_df['strategy'], rotation=45, ha='right')
    
    plt.tight_layout()
    plt.show()

# Example usage
if __name__ == "__main__":
    # Create test document
    document = create_dummy_document()
    
    # Define important keywords for evaluation
    keywords = [
        "machine learning", "supervised learning", "unsupervised learning", 
        "neural networks", "LLMs", "fine-tuning", "pre-training",
        "reinforcement learning", "multimodal learning", "federated learning",
        "clustering", "classification", "regression", "PCA"
    ]
    
    # Define key phrases that should remain together
    key_phrases = [
        "Large Language Models",
        "Reinforcement Learning from Human Feedback",
        "Principal Component Analysis",
        "Support Vector Machines",
        "decision becomes more difficult",
        "train-test split",
        "natural language processing"
    ]
    
    # Define chunking strategies to evaluate
    chunking_strategies = {
        "fixed_500": {
            "type": "fixed", 
            "size": 500, 
            "overlap": 0
        },
        "fixed_500_overlap_100": {
            "type": "fixed", 
            "size": 500, 
            "overlap": 100
        },
        "semantic_500": {
            "type": "semantic", 
            "size": 500, 
            "overlap": 100
        },
        "adaptive_300_1000": {
            "type": "adaptive", 
            "min_size": 300, 
            "max_size": 1000,
            "complexity_measure": "combined"
        },
        "context_enriched_500": {
            "type": "context_enriched", 
            "size": 500, 
            "overlap": 50,
            "window_size": 1
        },
        "ai_driven_10": {
            "type": "ai_driven", 
            "max_chunks": 10
        }
    }
    
    # Run evaluation
    results_df = evaluate_chunking_strategies(document, keywords, key_phrases, chunking_strategies)
    
    # Print results
    print("\n----- EVALUATION RESULTS -----")
    print(results_df)
    
    # Create visualizations
    try:
        visualize_results(results_df)
    except Exception as e:
        print(f"Visualization error: {e}")
    
    # Export results to CSV
    results_df.to_csv("chunking_evaluation_results.csv", index=False)
    print("\nResults exported to 'chunking_evaluation_results.csv'")
A study from MongoDB suggests that when handling Python documentation, a language-specific recursive splitter (chunk size of ~100 tokens and overlap of ~15 tokens) often yields the best combination of context precision and recall.

Best Practices & Implementation Guidelines
Begin with Baseline Testing
Start simple (e.g., fixed-size chunking with different chunk and overlap sizes). Gather metrics to establish a reference point before introducing complexity.
from langchain_text_splitters import CharacterTextSplitter

def perform_baseline_testing(document:disappointed_face:
    """Test different chunk sizes and overlaps to establish a baseline."""
    test_sizes = [100, 200, 500, 1000]
    results = []
    
    for size in test_sizes:
        splitter = CharacterTextSplitter(
            chunk_size=size,
            chunk_overlap=int(size * 0.2),
            separator="\n\n"
        )
        
        chunks = splitter.split_text(document)
        
        results.append({
            "chunk_size": size,
            "overlap": int(size * 0.2),
            "num_chunks": len(chunks),
            "avg_chunk_length": sum(len(c) for c in chunks) / len(chunks)
        })
        
    return results
2. Optimize Chunk Size & Overlap

General text: 200–500 tokens, 10–20% overlap.
Code or very technical content: 100–200 tokens, 15–25% overlap.
Narrative content: 500–1000 tokens to preserve context.
from langchain_text_splitters import RecursiveCharacterTextSplitter

def optimize_chunking_by_content_type(document, content_type:disappointed_face:
    """Apply optimized chunking based on content type."""
    if content_type == "general":
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=400,
            chunk_overlap=60,  # ~15% overlap
            separators=["\n\n", "\n", ". ", " ", ""]
        )
    elif content_type == "technical":
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=150,
            chunk_overlap=30,  # ~20% overlap
            separators=["\n\n", "\n", ". ", " ", ""]
        )
    elif content_type == "narrative":
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=800,
            chunk_overlap=100,  # ~12.5% overlap
            separators=["\n\n", "\n", ". ", " ", ""]
        )
    
    return splitter.split_text(document)
3. Use Hybrid Methods Where Appropriate
If a single document includes standard text, tables, and code, treat each section with a suitable approach.

from langchain_text_splitters import RecursiveCharacterTextSplitter, Language
import re

def hybrid_chunking(document:disappointed_face:
    """Process different sections of a document with appropriate methods."""
    # Detect section types (simplified example)
    sections = []
    current_section = {"type": "text", "content": ""}
    
    for line in document.split('\n':disappointed_face:
        if re.match(r'```python|```js|```java', line):
            # Start a new code section
            if current_section["content"]:
                sections.append(current_section)
            current_section = {"type": "code", "language": line.strip('`'), "content": ""}
        elif re.match(r'```', line) and current_section["type"] == "code":
            # End code section
            if current_section["content"]:
                sections.append(current_section)
            current_section = {"type": "text", "content": ""}
        elif re.match(r'\|.*\|.*\|', line):
            # Likely a markdown table
            if current_section["type"] != "table":
                if current_section["content"]:
                    sections.append(current_section)
                current_section = {"type": "table", "content": line + "\n"}
            else:
                current_section["content"] += line + "\n"
        else:
            current_section["content"] += line + "\n"
    
    # Add the last section
    if current_section["content"]:
        sections.append(current_section)
    
    # Process each section with appropriate chunker
    chunks = []
    for section in sections:
        if section["type"] == "code":
            code_splitter = RecursiveCharacterTextSplitter.from_language(
                language=Language.PYTHON,  # Simplified, should match actual language
                chunk_size=100,
                chunk_overlap=20
            )
            section_chunks = code_splitter.split_text(section["content"])
        elif section["type"] == "table":
            # Special handling for tables - keep them intact
            section_chunks = [section["content"]]
        else:
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=400,
                chunk_overlap=50,
                separators=["\n\n", "\n", ". ", " ", ""]
            )
            section_chunks = text_splitter.split_text(section["content"])
        
        # Add metadata about section type
        for i, chunk in enumerate(section_chunks):
            chunks.append({
                "content": chunk,
                "type": section["type"],
                "index": i,
                "total": len(section_chunks)
            })
    
    return chunks
4. Add Metadata to Chunks
Storing metadata (e.g., section title, document type, date) helps with filtering and contextual retrieval.

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
import re

def chunks_with_metadata(document, title, document_type, date:disappointed_face:
    """Create chunks with rich metadata."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50
    )
    
    # Extract headings for better section tracking
    headings = {}
    current_position = 0
    for match in re.finditer(r'(#{1,6})\s+(.*?)\s*$', document, re.MULTILINE):
        heading_level = len(match.group(1))
        heading_text = match.group(2)
        headings[match.start()] = {
            "level": heading_level,
            "text": heading_text
        }
    
    # Create basic chunks first
    text_chunks = splitter.split_text(document)
    
    # Convert to Document objects with metadata
    doc_chunks = []
    for i, chunk in enumerate(text_chunks):
        # Find the most recent heading before this chunk
        chunk_start_pos = document.find(chunk)
        current_heading = None
        for pos, heading in sorted(headings.items()):
            if pos <= chunk_start_pos:
                current_heading = heading
            else:
                break
        
        # Create metadata
        metadata = {
            "chunk_id": i,
            "document_title": title,
            "document_type": document_type,
            "date": date,
            "total_chunks": len(text_chunks)
        }
        
        # Add section information if available
        if current_heading:
            metadata["section"] = current_heading["text"]
            metadata["section_level"] = current_heading["level"]
        
        # Create Document object
        doc = Document(page_content=chunk, metadata=metadata)
        doc_chunks.append(doc)
    
    return doc_chunks
5. Preserve Semantic Boundaries
Avoid prematurely cutting in the middle of a sentence or important paragraph.

import nltk
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Download NLTK data if not already available
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

def semantic_boundary_chunking(document, target_size=500:disappointed_face:
    """Create chunks that respect sentence boundaries."""
    # First tokenize into sentences
    sentences = nltk.sent_tokenize(document)
    
    chunks = []
    current_chunk = []
    current_size = 0
    
    for sentence in sentences:
        sentence_len = len(sentence)
        
        # If adding this sentence would exceed target size and we already have content
        if current_size + sentence_len > target_size and current_chunk:
            # Join current sentences and add to chunks
            chunks.append(" ".join(current_chunk))
            current_chunk = [sentence]
            current_size = sentence_len
        else:
            current_chunk.append(sentence)
            current_size += sentence_len
    
    # Add the last chunk if it exists
    if current_chunk:
        chunks.append(" ".join(current_chunk))
    
    return chunks
6. Handle Structured Content Separately
For documents that include images, tables, or code blocks, combine specialized processing logic with your chunking approach.

def process_structured_content(document:disappointed_face:
    """Handle different types of structured content."""
    import re
    from langchain_text_splitters import RecursiveCharacterTextSplitter, Language
    
    # Define pattern for various structured content
    patterns = {
        "table": r'\|.*\|.*\|[\s\S]*?\n\n',
        "code_block": r'```[\s\S]*?```',
        "image": r'!\[.*?\]\(.*?\)'
    }
    
    # Extract structured content and replace with placeholders
    structured_parts = {}
    placeholder_count = 0
    modified_document = document
    
    for content_type, pattern in patterns.items():
        matches = re.finditer(pattern, document, re.MULTILINE)
        for match in matches:
            placeholder = f"[PLACEHOLDER_{placeholder_count}]"
            placeholder_count += 1
            structured_parts[placeholder] = {
                "type": content_type,
                "content": match.group(0)
            }
            modified_document = modified_document.replace(match.group(0), placeholder)
    
    # Chunk the modified document
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50
    )
    base_chunks = text_splitter.split_text(modified_document)
    
    # Replace placeholders and process structured content appropriately
    final_chunks = []
    for chunk in base_chunks:
        current_chunk = chunk
        for placeholder, content_data in structured_parts.items():
            if placeholder in chunk:
                if content_data["type"] == "code_block":
                    # Keep code blocks intact
                    code_content = content_data["content"]
                    current_chunk = current_chunk.replace(placeholder, code_content)
                elif content_data["type"] == "table":
                    # Keep tables intact
                    table_content = content_data["content"]
                    current_chunk = current_chunk.replace(placeholder, table_content)
                elif content_data["type"] == "image":
                    # Replace image references with metadata
                    image_ref = content_data["content"]
                    image_alt = re.search(r'!\[(.*?)\]', image_ref)
                    alt_text = image_alt.group(1) if image_alt else "image"
                    current_chunk = current_chunk.replace(
                        placeholder, f"[Image description: {alt_text}]"
                    )
        
        final_chunks.append(current_chunk)
    
    return final_chunks
7. Continuous Feedback & Refinement
Maintain a feedback loop using real-world queries and user interactions. Refine chunking configurations based on what chunks are retrieved and how effectively they answer questions.

def evaluate_chunking_performance(queries, retrieved_chunks, user_ratings:disappointed_face:
    """Analyze and refine chunking based on user feedback."""
    
    chunk_effectiveness = {}
    
    # Analyze which chunks were most useful for which queries
    for query, chunks, rating in zip(queries, retrieved_chunks, user_ratings):
        for chunk in chunks:
            chunk_id = chunk.metadata.get("chunk_id", "unknown")
            
            if chunk_id not in chunk_effectiveness:
                chunk_effectiveness[chunk_id] = {
                    "query_count": 0,
                    "total_rating": 0,
                    "queries": []
                }
            
            chunk_effectiveness[chunk_id]["query_count"] += 1
            chunk_effectiveness[chunk_id]["total_rating"] += rating
            chunk_effectiveness[chunk_id]["queries"].append(query)
    
    # Calculate average ratings and identify patterns
    refinement_suggestions = []
    
    for chunk_id, stats in chunk_effectiveness.items():
        if stats["query_count"] > 0:
            avg_rating = stats["total_rating"] / stats["query_count"]
            
            # Analyze low-performing chunks
            if avg_rating < 3:  # Assuming 1-5 rating scale
                refinement_suggestions.append({
                    "chunk_id": chunk_id,
                    "avg_rating": avg_rating,
                    "issue": "Low performance across queries",
                    "suggestion": "Consider refining this chunk or checking content quality"
                })
            
            # Look for content type patterns
            query_keywords = " ".join(stats["queries"]).lower()
            if "code" in query_keywords and avg_rating < 4:
                refinement_suggestions.append({
                    "chunk_id": chunk_id,
                    "avg_rating": avg_rating,
                    "issue": "Poor performance on code-related queries",
                    "suggestion": "Use code-specific chunking for this section"
                })
    
    return refinement_suggestions
Advanced Techniques & Emerging Trends
Domain-Specific Chunking
Legal, medical, or financial documents often have domain-specific layouts (e.g., legal “clauses” or medical “sections”). Tailor chunking to each domain’s conventions.
Multi-Modal Chunking
If you have images, tables, and text in the same source, convert each into a textual or descriptive format that your model can handle, possibly using an LLM to generate textual summaries of non-text elements.
Dynamic Query-Aware Chunking
Adjust chunk sizes or selection dynamically based on query patterns or user context. For instance, small precise chunks might be ideal for straightforward factual queries, while broader semantic chunks might benefit exploratory or conceptually complex questions.
Neural Chunking Models
Specialized neural models can learn to predict optimal chunk boundaries. These advanced classifiers can balance semantic coherence and chunk length better than rule-based methods.
Hierarchical Chunking
Build multi-level chunk hierarchies that preserve document structure (e.g., major sections, subsections, paragraphs). This can be particularly useful when dealing with lengthy or multi-layered texts.
Conclusion
An effective chunking strategy is vital for any RAG system, as it directly impacts how documents are segmented and retrieved. The best approach depends on your specific domain, data structure, and performance needs. The key takeaways:

There’s No Universal Strategy: Each method — from fixed-size to AI-driven dynamic chunking — has trade-offs. Experiment to see what works best.
Balance Size and Semantics: Strive to keep chunks large enough for meaningful context but small enough to remain computationally efficient.
Preserve Context: Break text at natural boundaries when possible, and consider adding contextual metadata for better retrieval.
Iterate Continuously: Always monitor real-world retrieval performance and refine your chunking strategies as your application evolves.
Hybrid Approaches Excel: When in doubt, mix and match strategies to handle different content types optimally.
If you’re interested in scaling Python methods to run efficiently on Databricks using Pandas UDFs, check out my other articles: All You Need to Know About Writing Custom UDFs Using Python in Apache Spark 3.0

(Note: Code examples are indicative. Exact usage may vary based on your project’s environment and dependencies.)


1 Comment
sridharplv
 sridharplv
Valued Contributor II
‎04-18-2025 11:52 AM
‎04-18-2025 11:52 AM
Thank you for the detailed explanation of chunking strategies with code. 

You must be a registered user to add a comment. If you've already registered, sign in. Otherwise, register and sign in.

ContextualCompressionRetriever
class langchain.retrievers.contextual_compression.ContextualCompressionRetriever[source]
Bases: BaseRetriever

Retriever that wraps a base retriever and compresses the results.

Note

ContextualCompressionRetriever implements the standard Runnable Interface. 🏃

The Runnable Interface has additional methods that are available on runnables, such as with_types, with_retry, assign, bind, get_graph, and more.

param base_compressor: BaseDocumentCompressor [Required]
Compressor for compressing retrieved documents.

param base_retriever: Runnable[str, List[Document]] [Required]
Base Retriever to use for getting relevant documents.

param metadata: Dict[str, Any] | None = None
Optional metadata associated with the retriever. Defaults to None. This metadata will be associated with each call to this retriever, and passed as arguments to the handlers defined in callbacks. You can use these to eg identify a specific instance of a retriever with its use case.

param tags: List[str] | None = None
Optional list of tags associated with the retriever. Defaults to None. These tags will be associated with each call to this retriever, and passed as arguments to the handlers defined in callbacks. You can use these to eg identify a specific instance of a retriever with its use case.

async abatch(inputs: List[Input], config: RunnableConfig | List[RunnableConfig] | None = None, *, return_exceptions: bool = False, **kwargs: Any | None) → List[Output]
Default implementation runs ainvoke in parallel using asyncio.gather.

The default implementation of batch works well for IO bound runnables.

Subclasses should override this method if they can batch more efficiently; e.g., if the underlying Runnable uses an API which supports a batch mode.

Parameters
:
inputs (List[Input]) – A list of inputs to the Runnable.

config (RunnableConfig | List[RunnableConfig] | None) – A config to use when invoking the Runnable. The config supports standard keys like ‘tags’, ‘metadata’ for tracing purposes, ‘max_concurrency’ for controlling how much work to do in parallel, and other keys. Please refer to the RunnableConfig for more details. Defaults to None.

return_exceptions (bool) – Whether to return exceptions instead of raising them. Defaults to False.

kwargs (Any | None) – Additional keyword arguments to pass to the Runnable.

Returns
:
A list of outputs from the Runnable.

Return type
:
List[Output]

async abatch_as_completed(inputs: Sequence[Input], config: RunnableConfig | Sequence[RunnableConfig] | None = None, *, return_exceptions: bool = False, **kwargs: Any | None) → AsyncIterator[Tuple[int, Output | Exception]]
Run ainvoke in parallel on a list of inputs, yielding results as they complete.

Parameters
:
inputs (Sequence[Input]) – A list of inputs to the Runnable.

config (RunnableConfig | Sequence[RunnableConfig] | None) – A config to use when invoking the Runnable. The config supports standard keys like ‘tags’, ‘metadata’ for tracing purposes, ‘max_concurrency’ for controlling how much work to do in parallel, and other keys. Please refer to the RunnableConfig for more details. Defaults to None. Defaults to None.

return_exceptions (bool) – Whether to return exceptions instead of raising them. Defaults to False.

kwargs (Any | None) – Additional keyword arguments to pass to the Runnable.

Yields
:
A tuple of the index of the input and the output from the Runnable.

Return type
:
AsyncIterator[Tuple[int, Output | Exception]]

async aget_relevant_documents(query: str, *, callbacks: Callbacks = None, tags: List[str] | None = None, metadata: Dict[str, Any] | None = None, run_name: str | None = None, **kwargs: Any) → List[Document]
Deprecated since version langchain-core==0.1.46: Use ainvoke instead.

Asynchronously get documents relevant to a query.

Users should favor using .ainvoke or .abatch rather than aget_relevant_documents directly.

Parameters
:
query (str) – string to find relevant documents for.

callbacks (Callbacks) – Callback manager or list of callbacks.

tags (Optional[List[str]]) – Optional list of tags associated with the retriever. These tags will be associated with each call to this retriever, and passed as arguments to the handlers defined in callbacks. Defaults to None.

metadata (Optional[Dict[str, Any]]) – Optional metadata associated with the retriever. This metadata will be associated with each call to this retriever, and passed as arguments to the handlers defined in callbacks. Defaults to None.

run_name (Optional[str]) – Optional name for the run. Defaults to None.

kwargs (Any) – Additional arguments to pass to the retriever.

Returns
:
List of relevant documents.

Return type
:
List[Document]

async ainvoke(input: str, config: RunnableConfig | None = None, **kwargs: Any) → List[Document]
Asynchronously invoke the retriever to get relevant documents.

Main entry point for asynchronous retriever invocations.

Parameters
:
input (str) – The query string.

config (RunnableConfig | None) – Configuration for the retriever. Defaults to None.

kwargs (Any) – Additional arguments to pass to the retriever.

Returns
:
List of relevant documents.

Return type
:
List[Document]

Examples:

await retriever.ainvoke("query")
async astream(input: Input, config: RunnableConfig | None = None, **kwargs: Any | None) → AsyncIterator[Output]
Default implementation of astream, which calls ainvoke. Subclasses should override this method if they support streaming output.

Parameters
:
input (Input) – The input to the Runnable.

config (RunnableConfig | None) – The config to use for the Runnable. Defaults to None.

kwargs (Any | None) – Additional keyword arguments to pass to the Runnable.

Yields
:
The output of the Runnable.

Return type
:
AsyncIterator[Output]

astream_events(input: Any, config: RunnableConfig | None = None, *, version: Literal['v1', 'v2'], include_names: Sequence[str] | None = None, include_types: Sequence[str] | None = None, include_tags: Sequence[str] | None = None, exclude_names: Sequence[str] | None = None, exclude_types: Sequence[str] | None = None, exclude_tags: Sequence[str] | None = None, **kwargs: Any) → AsyncIterator[StandardStreamEvent | CustomStreamEvent]
Beta

This API is in beta and may change in the future.

Generate a stream of events.

Use to create an iterator over StreamEvents that provide real-time information about the progress of the Runnable, including StreamEvents from intermediate results.

A StreamEvent is a dictionary with the following schema:

event: str - Event names are of the
format: on_[runnable_type]_(start|stream|end).

name: str - The name of the Runnable that generated the event.

run_id: str - randomly generated ID associated with the given execution of
the Runnable that emitted the event. A child Runnable that gets invoked as part of the execution of a parent Runnable is assigned its own unique ID.

parent_ids: List[str] - The IDs of the parent runnables that
generated the event. The root Runnable will have an empty list. The order of the parent IDs is from the root to the immediate parent. Only available for v2 version of the API. The v1 version of the API will return an empty list.

tags: Optional[List[str]] - The tags of the Runnable that generated
the event.

metadata: Optional[Dict[str, Any]] - The metadata of the Runnable
that generated the event.

data: Dict[str, Any]

Below is a table that illustrates some evens that might be emitted by various chains. Metadata fields have been omitted from the table for brevity. Chain definitions have been included after the table.

ATTENTION This reference table is for the V2 version of the schema.

event

name

chunk

input

output

on_chat_model_start

[model name]

{“messages”: [[SystemMessage, HumanMessage]]}

on_chat_model_stream

[model name]

AIMessageChunk(content=”hello”)

on_chat_model_end

[model name]

{“messages”: [[SystemMessage, HumanMessage]]}

AIMessageChunk(content=”hello world”)

on_llm_start

[model name]

{‘input’: ‘hello’}

on_llm_stream

[model name]

‘Hello’

on_llm_end

[model name]

‘Hello human!’

on_chain_start

format_docs

on_chain_stream

format_docs

“hello world!, goodbye world!”

on_chain_end

format_docs

[Document(…)]

“hello world!, goodbye world!”

on_tool_start

some_tool

{“x”: 1, “y”: “2”}

on_tool_end

some_tool

{“x”: 1, “y”: “2”}

on_retriever_start

[retriever name]

{“query”: “hello”}

on_retriever_end

[retriever name]

{“query”: “hello”}

[Document(…), ..]

on_prompt_start

[template_name]

{“question”: “hello”}

on_prompt_end

[template_name]

{“question”: “hello”}

ChatPromptValue(messages: [SystemMessage, …])

In addition to the standard events, users can also dispatch custom events (see example below).

Custom events will be only be surfaced with in the v2 version of the API!

A custom event has following format:

Attribute

Type

Description

name

str

A user defined name for the event.

data

Any

The data associated with the event. This can be anything, though we suggest making it JSON serializable.

Here are declarations associated with the standard events shown above:

format_docs:

def format_docs(docs: List[Document]) -> str:
    '''Format the docs.'''
    return ", ".join([doc.page_content for doc in docs])

format_docs = RunnableLambda(format_docs)
some_tool:

@tool
def some_tool(x: int, y: str) -> dict:
    '''Some_tool.'''
    return {"x": x, "y": y}
prompt:

template = ChatPromptTemplate.from_messages(
    [("system", "You are Cat Agent 007"), ("human", "{question}")]
).with_config({"run_name": "my_template", "tags": ["my_template"]})
Example:

from langchain_core.runnables import RunnableLambda

async def reverse(s: str) -> str:
    return s[::-1]

chain = RunnableLambda(func=reverse)

events = [
    event async for event in chain.astream_events("hello", version="v2")
]

# will produce the following events (run_id, and parent_ids
# has been omitted for brevity):
[
    {
        "data": {"input": "hello"},
        "event": "on_chain_start",
        "metadata": {},
        "name": "reverse",
        "tags": [],
    },
    {
        "data": {"chunk": "olleh"},
        "event": "on_chain_stream",
        "metadata": {},
        "name": "reverse",
        "tags": [],
    },
    {
        "data": {"output": "olleh"},
        "event": "on_chain_end",
        "metadata": {},
        "name": "reverse",
        "tags": [],
    },
]
Example: Dispatch Custom Event

from langchain_core.callbacks.manager import (
    adispatch_custom_event,
)
from langchain_core.runnables import RunnableLambda, RunnableConfig
import asyncio


async def slow_thing(some_input: str, config: RunnableConfig) -> str:
    """Do something that takes a long time."""
    await asyncio.sleep(1) # Placeholder for some slow operation
    await adispatch_custom_event(
        "progress_event",
        {"message": "Finished step 1 of 3"},
        config=config # Must be included for python < 3.10
    )
    await asyncio.sleep(1) # Placeholder for some slow operation
    await adispatch_custom_event(
        "progress_event",
        {"message": "Finished step 2 of 3"},
        config=config # Must be included for python < 3.10
    )
    await asyncio.sleep(1) # Placeholder for some slow operation
    return "Done"

slow_thing = RunnableLambda(slow_thing)

async for event in slow_thing.astream_events("some_input", version="v2"):
    print(event)
Parameters
:
input (Any) – The input to the Runnable.

config (RunnableConfig | None) – The config to use for the Runnable.

version (Literal['v1', 'v2']) – The version of the schema to use either v2 or v1. Users should use v2. v1 is for backwards compatibility and will be deprecated in 0.4.0. No default will be assigned until the API is stabilized. custom events will only be surfaced in v2.

include_names (Sequence[str] | None) – Only include events from runnables with matching names.

include_types (Sequence[str] | None) – Only include events from runnables with matching types.

include_tags (Sequence[str] | None) – Only include events from runnables with matching tags.

exclude_names (Sequence[str] | None) – Exclude events from runnables with matching names.

exclude_types (Sequence[str] | None) – Exclude events from runnables with matching types.

exclude_tags (Sequence[str] | None) – Exclude events from runnables with matching tags.

kwargs (Any) – Additional keyword arguments to pass to the Runnable. These will be passed to astream_log as this implementation of astream_events is built on top of astream_log.

Yields
:
An async stream of StreamEvents.

Raises
:
NotImplementedError – If the version is not v1 or v2.

Return type
:
AsyncIterator[StandardStreamEvent | CustomStreamEvent]

batch(inputs: List[Input], config: RunnableConfig | List[RunnableConfig] | None = None, *, return_exceptions: bool = False, **kwargs: Any | None) → List[Output]
Default implementation runs invoke in parallel using a thread pool executor.

The default implementation of batch works well for IO bound runnables.

Subclasses should override this method if they can batch more efficiently; e.g., if the underlying Runnable uses an API which supports a batch mode.

Parameters
:
inputs (List[Input]) –

config (RunnableConfig | List[RunnableConfig] | None) –

return_exceptions (bool) –

kwargs (Any | None) –

Return type
:
List[Output]

batch_as_completed(inputs: Sequence[Input], config: RunnableConfig | Sequence[RunnableConfig] | None = None, *, return_exceptions: bool = False, **kwargs: Any | None) → Iterator[Tuple[int, Output | Exception]]
Run invoke in parallel on a list of inputs, yielding results as they complete.

Parameters
:
inputs (Sequence[Input]) –

config (RunnableConfig | Sequence[RunnableConfig] | None) –

return_exceptions (bool) –

kwargs (Any | None) –

Return type
:
Iterator[Tuple[int, Output | Exception]]

configurable_alternatives(which: ConfigurableField, *, default_key: str = 'default', prefix_keys: bool = False, **kwargs: Runnable[Input, Output] | Callable[[], Runnable[Input, Output]]) → RunnableSerializable[Input, Output]
Configure alternatives for Runnables that can be set at runtime.

Parameters
:
which (ConfigurableField) – The ConfigurableField instance that will be used to select the alternative.

default_key (str) – The default key to use if no alternative is selected. Defaults to “default”.

prefix_keys (bool) – Whether to prefix the keys with the ConfigurableField id. Defaults to False.

**kwargs (Runnable[Input, Output] | Callable[[], Runnable[Input, Output]]) – A dictionary of keys to Runnable instances or callables that return Runnable instances.

Returns
:
A new Runnable with the alternatives configured.

Return type
:
RunnableSerializable[Input, Output]

from langchain_anthropic import ChatAnthropic
from langchain_core.runnables.utils import ConfigurableField
from langchain_openai import ChatOpenAI

model = ChatAnthropic(
    model_name="claude-3-sonnet-20240229"
).configurable_alternatives(
    ConfigurableField(id="llm"),
    default_key="anthropic",
    openai=ChatOpenAI()
)

# uses the default model ChatAnthropic
print(model.invoke("which organization created you?").content)

# uses ChatOpenAI
print(
    model.with_config(
        configurable={"llm": "openai"}
    ).invoke("which organization created you?").content
)
configurable_fields(**kwargs: ConfigurableField | ConfigurableFieldSingleOption | ConfigurableFieldMultiOption) → RunnableSerializable[Input, Output]
Configure particular Runnable fields at runtime.

Parameters
:
**kwargs (ConfigurableField | ConfigurableFieldSingleOption | ConfigurableFieldMultiOption) – A dictionary of ConfigurableField instances to configure.

Returns
:
A new Runnable with the fields configured.

Return type
:
RunnableSerializable[Input, Output]

from langchain_core.runnables import ConfigurableField
from langchain_openai import ChatOpenAI

model = ChatOpenAI(max_tokens=20).configurable_fields(
    max_tokens=ConfigurableField(
        id="output_token_number",
        name="Max tokens in the output",
        description="The maximum number of tokens in the output",
    )
)

# max_tokens = 20
print(
    "max_tokens_20: ",
    model.invoke("tell me something about chess").content
)

# max_tokens = 200
print("max_tokens_200: ", model.with_config(
    configurable={"output_token_number": 200}
    ).invoke("tell me something about chess").content
)
get_relevant_documents(query: str, *, callbacks: Callbacks = None, tags: List[str] | None = None, metadata: Dict[str, Any] | None = None, run_name: str | None = None, **kwargs: Any) → List[Document]
Deprecated since version langchain-core==0.1.46: Use invoke instead.

Retrieve documents relevant to a query.

Users should favor using .invoke or .batch rather than get_relevant_documents directly.

Parameters
:
query (str) – string to find relevant documents for.

callbacks (Callbacks) – Callback manager or list of callbacks. Defaults to None.

tags (Optional[List[str]]) – Optional list of tags associated with the retriever. These tags will be associated with each call to this retriever, and passed as arguments to the handlers defined in callbacks. Defaults to None.

metadata (Optional[Dict[str, Any]]) – Optional metadata associated with the retriever. This metadata will be associated with each call to this retriever, and passed as arguments to the handlers defined in callbacks. Defaults to None.

run_name (Optional[str]) – Optional name for the run. Defaults to None.

kwargs (Any) – Additional arguments to pass to the retriever.

Returns
:
List of relevant documents.

Return type
:
List[Document]

invoke(input: str, config: RunnableConfig | None = None, **kwargs: Any) → List[Document]
Invoke the retriever to get relevant documents.

Main entry point for synchronous retriever invocations.

Parameters
:
input (str) – The query string.

config (RunnableConfig | None) – Configuration for the retriever. Defaults to None.

kwargs (Any) – Additional arguments to pass to the retriever.

Returns
:
List of relevant documents.

Return type
:
List[Document]

Examples:

retriever.invoke("query")
stream(input: Input, config: RunnableConfig | None = None, **kwargs: Any | None) → Iterator[Output]
Default implementation of stream, which calls invoke. Subclasses should override this method if they support streaming output.

Parameters
:
input (Input) – The input to the Runnable.

config (RunnableConfig | None) – The config to use for the Runnable. Defaults to None.

kwargs (Any | None) – Additional keyword arguments to pass to the Runnable.

Yields
:
The output of the Runnable.

Return type
:
Iterator[Output]

to_json() → SerializedConstructor | SerializedNotImplemented
Serialize the Runnable to JSON.

Returns
:
A JSON-serializable representation of the Runnable.

Return type
:
SerializedConstructor | SerializedNotImplemented

Examples using ContextualCompressionRetriever

Maximizing RAG efficiency: A comparative analysis of RAG methods
Published online by Cambridge University Press:  30 October 2024

Tolga Şakar
Open the ORCID record for Tolga Şakar[Opens in a new window]
 and
Hakan Emekci
Open the ORCID record for Hakan Emekci[Opens in a new window]

Show author details
Article
Figures
Supplementary materials
Metrics

Save PDF

Share

Cite

Rights & Permissions
[Opens in a new window]
Abstract
This paper addresses the optimization of retrieval-augmented generation (RAG) processes by exploring various methodologies, including advanced RAG methods. The research, driven by the need to enhance RAG processes as highlighted by recent studies, involved a grid-search optimization of 23,625 iterations. We evaluated multiple RAG methods across different vectorstores, embedding models, and large language models, using cross-domain datasets and contextual compression filters. The findings emphasize the importance of balancing context quality with similarity-based ranking methods, as well as understanding tradeoffs between similarity scores, token usage, runtime, and hardware utilization. Additionally, contextual compression filters were found to be crucial for efficient hardware utilization and reduced token consumption, despite the evident impacts on similarity scores, which may be acceptable depending on specific use cases and RAG methods.

Keywords
Large Language Models
Vector Databases
Retrieval-Augmented Generation
Contextual Compression
Embedding Models
Information
Type
Article
Information
Natural Language Processing , Volume 31 , Issue 1 , January 2025 , pp. 1 - 25
DOI: https://doi.org/10.1017/nlp.2024.53[Opens in a new window]
Check for updates
Creative Commons
Creative Common License - CCCreative Common License - BY
This is an Open Access article, distributed under the terms of the Creative Commons Attribution licence (https://creativecommons.org/licenses/by/4.0/), which permits unrestricted re-use, distribution and reproduction, provided the original article is properly cited.
Copyright
© The Author(s), 2024. Published by Cambridge University Press
1. Introduction
The use of goal-oriented large language models (LLMs) (Devlin et al. Reference Devlin, Chang, Lee and Toutanova2019; Brown et al. Reference Brown, Mann, Ryder, Subbiah, Kaplan, Dhariwal and Neelakantan2020; Chowdhery et al. 2022), coupled with diverse LLM-oriented frameworks, is continually broadening the spectrum of AI applications, enhancing the proficiency of LLMs across complex tasks (Wei et al. Reference Wei, Wang, Schuurmans, Bosma, Ichter, Xia, Chi, Le and Zhou2022). Contemporary LLMs demonstrate remarkable capabilities, from answering questions about legal documents with latent provenance (Jeong Reference Jeong2023; Nigam et al. Reference Nigam, Mishra, Mishra, Shallum and Bhattacharya2023; Cui et al. Reference Cui, Li, Yan, Chen and Yuan2023) to chatbots adept at generating programing code (Vaithilingam et al. Reference Vaithilingam, Zhang and Glassman2022). However, this increased capability also introduces additional complexities. Emerging LLMs, formidable in conventional text-based tasks, necessitate external resources to adapt to evolving knowledge.

To address this challenge, non-parametric retrieval-based methodologies, exemplified by retrieval-augmented generation (RAG) (Lewis et al. Reference Lewis, Perez, Piktus, Petroni, Karpukhin, Goyal and Küttler2020), are becoming integral to the latest LLM applications, especially for domain-specific tasks (Vaithilingam et al. Reference Vaithilingam, Zhang and Glassman2022; Manathunga and Illangasekara Reference Manathunga and Illangasekara2023; Nigam et al. Reference Nigam, Mishra, Mishra, Shallum and Bhattacharya2023; Pesaru et al. Reference Pesaru, Gill and Tangella2023; Peng et al. Reference Peng, Liu, Yang, Yuan and Li2023; Gupta Reference Gupta2023). The evolution of AI-stack applications underscores the critical role of fine-tuning RAG methods in updating the knowledge base of LLMs (Choi et al. Reference Choi, Jung, Suh and Rhee2021; Lin et al. Reference Lin, Pradeep, Teofili and Xian2023; Konstantinos and Pouwelse Andriopoulos and Johan Reference Andriopoulos and Johan2023). Retrieval-based applications demand optimization when searching the most relevant passages, or top-K vectors, through semantic similarity search.

Querying multi-document vectors and augmenting LLMs with relevant context introduce dependencies on both time and token limits. The ‘bi-encoder’ retrieval models (refer to Figure 1) leverage cutting-edge approximate nearest-neighbor search algorithms (Jégou et al. Reference Jégou, Douze and Schmid2011). However, diverse data structures (e.g., multimedia, tables, graphs, charts, and unstructured text) pose additional challenges, including the potential generation of hallucinative responses (Sean et al. 2019; Konstantinos and Pouwelse Andriopoulos and Johan Reference Andriopoulos and Johan2023) and the risk of surpassing LLM token limits (Roychowdhury et al. Reference Roychowdhury, Alvarez, Moore, Krema, Gelpi, Rodriguez, Rodriguez, Cabrejas, Serrano, Agrawal and Mukherjee2023). Overcoming the hallucination problem and staying within the token generation limit is a difficult task. The tradeoff is that once the retrieval process is complete and top-K documents are obtained by the search algorithm, the total number of tokens sent may exceed the token limit for the specific LLM in use.

On the other hand, constraining the retrieval capabilities may limit the LLM’s ability to successfully generate the relevant response based on the restrained context. Optimizing the tradeoff requires an in-depth analysis involving various processes, including experimenting with diverse and hardware-optimized search algorithms (Chen et al. Reference Chen, Chen, Zou, Li, Lu and Zhao2019; Zhang and He, Reference Zhang and He2019; Malkov and Yashunin Reference Malkov and Yashunin2020; Johnson et al. Reference Johnson, Douze and Jégou2021; Lin et al. Reference Lin, Pradeep, Teofili and Xian2023), applying embedding filters based on similarity score threshold, and routing the LLM inputs and outputs along with the filtered context. These processes play a crucial role in fine-tuning LLM responses by optimizing the retrieval process. In the pursuit of optimization, commonly known vector databases, such as Pinecone (Sage Reference Sage2023), ChromaDB, FAISS, Weaviate, and Qdrant, find application for various reasons. These databases are classified based on criteria like scalability, ease of use (versatile Application Programming Interface [API] support), filtering options, security, efficiency, and speed (Han et al. Reference Han, Liu and Wang2023). The integration of these databases into the LLM operational pipeline not only enhances the overall efficiency and effectiveness of retrieval-based methodologies but also contributes significantly to the optimization of LLM performance.

Optimization initiates with document preprocessing. Chunking the multi-document into smaller paragraphs and overlapping the chunks (sentence tokens) could potentially affect the retrieval process since the embedded documents in the vector space are selected as a candidate context by the search algorithm (Schwaber-Cohen Reference Schwaber-Cohen2023; Zhou et al. Reference Zhou, Li and Liu2023). Chunks and overlapping chunk hyper-parameters control the granularity of text splitting, making fine-tuning crucial, especially when dealing with documents of a similar or reasonably uniform format (Schwaber-Cohen Reference Schwaber-Cohen2023). In addition to optimizing data preprocessing, there are various known RAG methodologies, such as ‘Stuff’, ‘Refine’, ‘Map Reduce’, ‘Map Re-rank’, ‘Query Step-Down’, and ‘Reciprocal RAG’ (refer to Figures 2.4.1–2.5.3), which significantly impact vectorstore scalability, semantic retrieval speed, and token budgeting. When making an LLM call, RAG methods either feed the retrieved documents as the unfiltered context to the call or apply re-ranking within the retrieved context based on the highest individual similarity for each document vector. More importantly, in multi-document tasks, fine-tuning the context routing in the LLM call sequence can dramatically affect the response generation time, hardware resources, and token budgeting (Nair et al. Reference Nair, Somasundaram, Saxena and Goswami2023). Despite the recognition of the importance of optimizing RAG processes in numerous papers (Vaithilingam et al. Reference Vaithilingam, Zhang and Glassman2022; Nair et al. Reference Nair, Somasundaram, Saxena and Goswami2023; Topsakal and Akinci Reference Topsakal and Akinci2023; Manathunga and Illangasekara Reference Manathunga and Illangasekara2023; Nigam et al. Reference Nigam, Mishra, Mishra, Shallum and Bhattacharya2023; Pesaru et al. Reference Pesaru, Gill and Tangella2023; Peng et al. Reference Peng, Liu, Yang, Yuan and Li2023; Konstantinos and Pouwelse, Andriopoulos and Johan Reference Andriopoulos and Johan2023; Roychowdhury et al. Reference Roychowdhury, Alvarez, Moore, Krema, Gelpi, Rodriguez, Rodriguez, Cabrejas, Serrano, Agrawal and Mukherjee2023), there remains a notable gap in previous work on the methods of optimization. Therefore, this paper aims to illuminate the process of optimizing RAG processes to improve LLM responses.

2. Materials and methodology
2.1 Retrieval-augmented generation
RAG method enables continuous updates and data freshness for question-answering chatbots by retrieving latent documents as provenance, without the need of re-training or fine-tuning the LLMs for domain-specific tasks. First-generation RAG models tackled challenges (Mialon et al. Reference Mialon, Dessí, Lomeli, Nalmpantis, Pasunuru, Raileanu and Rozière2023) in knowledge-intensive text generation tasks by combining a parametric pretrained sequence-to-sequence BART model (refer to Figure 1) (Sutskever et al. Reference Sutskever, Vinyals and Le2014; Lewis et al. Reference Lewis, Liu, Goyal, Ghazvininejad, Mohamed, Levy, Stoyanov and Zettlemoyer2019) with a non-parametric memory. This memory is a vectorized dense representation of latent documents from Wikipedia, accessed through a pretrained neural retriever (Lewis et al. Reference Lewis, Perez, Piktus, Petroni, Karpukhin, Goyal and Küttler2020). This integration of a sequence-to-sequence encoder and a top-K document index enables token generation based on latent provenance augmented with context from the query. The ‘Retrieval and Generation’ sequence efficiently produces output by leveraging both the pretrained sequence-to-sequence model and the non-parametric memory with a probabilistic model (refer to Figure 1).



Figure 1. First-generation retrieval-augmented generation (RAG) methodology: Non-parametric RAG with a parametric sequence-to-sequence model. (Refer to RAG for knowledge-intensive natural language processing tasks.

The non-parametric retriever conditions latent provenance on the input query (  ), and subsequently, the parametric sequence-to-sequence model (  ) is then conditioned on this new information along with the input (  ) to generate the output response  . The combined probabilistic model then marginalizes to approximate the top-  documents (latent documents). This can occur either on a per-output basis, meaning that a single latent document is responsible for all output generation, or different indexed documents are responsible for different output generations. Subsequently, the parameterized  generates the  token based on the top-  context from a previous token,  ,  ,  , where x is the original input, and z is a retriever document (refer to Figure 1).

Recent advancements in retrieval methods involve prominent embedding models, which are extensively trained on a large corpus of data in diverse languages. Notably, a significant shift has occurred, with a preference for LLMs over traditional models like sequence-to-sequence for token generation in the context of RAG. This transition builds on the foundations laid by first-generation RAG models, expanding the possibilities for more efficient and versatile text generation using latent documents as provenance. The latest RAG methods (refer to Figures 2.4.1–2.5.3) used in LLM-powered chatbots involve much more sophisticated retrieval processes. Using frameworks such as LangChain and LlAma-index, LLMs can now have direct access to SQL, vectorstores, Google search results, and various APIs. This increased capacity in generating more accurate results by having access to concurrent information allows LLMs to expand their knowledge base for domain-specific tasks. Moreover, using embedding filters provided by frameworks, RAG processes can become even more efficient in terms of retrieval speed when querying from vector databases. Embedding filters apply thresholds during the similarity search process to select text vectors (embeddings) that have similarity scores above the threshold while removing the redundant vectors, achieving efficiency in both retrieval speed and token budgeting.

2.2 Vectorstores
Vectorstores, playing a crucial role in RAG-based LLM applications, are distinguished by their proficiency in executing fast and precise similarity searches and retrievals. Unlike traditional databases reliant on exact matches, vector databases assess similarity based on vector distance and embedding filters, enabling the capture of semantic and contextual meaning (Han et al. Reference Han, Liu and Wang2023) (refer to Figure 2). This positions them as pivotal components in the ongoing effort to optimize the intricate interplay between language models and retrieval methodologies.



Figure 2. Schema for searching and matching similar context from vector database based on user query.

Prominent vector databases, such as FAISS, Pinecone, and ChromaDB, find applications in various domains, each offering key differentiators. FAISS, acknowledged as a leading vector database, excels in high-speed vector indexing for similarity searches. Its memory-efficient search algorithm enables the handling of high-dimensional data without compromising speed and efficiency (Johnson et al. 2019). Adding to the strengths of FAISS, Pinecone emerges as a notable choice, providing a high-level API service and delivering comparable performance to FAISS in similarity searches (Sage Reference Sage2023). However, as a managed service, Pinecone raises scalability concerns. Limitations on the number of queries pose a barrier to large-scale data processing needs, especially for high-volume applications.

Unlike Pinecone, ChromaDB is an open-source vector database that offers more flexibility in terms of scalability and usage. This open-source nature facilitates adaptability to different needs and use cases, making it a compelling option for customization and control over vector database infrastructure. Semantic similarity search is the retrieval of information or data based on semantic relationships that go beyond exact keyword or text matching. It focuses on understanding the contextual and conceptual relationships between words, phrases, or documents. A specific application within semantic similarity search is the exploration of semantic connections between embeddings.

Vector representations (embeddings) of words, phrases, or documents are used for similarity-based search. The process begins by converting documents or text into vectors using an embedding model. Then, similarity search algorithms identify the vectors most similar to the query based on various metrics, such as cosine similarity. In the final step, the output contains the response corresponding to the most similar vectors within the vector space. When calculating the similarity, cosine similarity is especially effective in this context as it measures the cosine of the angle between two vectors, providing a normalized measure that captures the directional similarity between vectors. This property makes it particularly useful for evaluating the similarity of embeddings in semantic search tasks.

Cosine similarity
Cosine similarity measures the cosine of the angle between two vectors. Given two vectors  and  in a vector space:


•  and  are vectors in a vector space.

•  and  are the components of vectors  and  at index  , respectively.

•  is the dimensionality (number of components) of the vectors.

• The numerator  represents the dot product of vectors  and  .

• The denominators  represent the Euclidean magnitudes (lengths) of vectors  and  , respectively.

2.3 Search algorithms
At the forefront of enhancing retrieval efficiency and speed, search algorithms play a pivotal role. Specifically, tree-based algorithms are widely employed in vector databases to measure the distance between similar top-K vectors. Nearest neighbor search (NNS) (Chen et al. Reference Chen, Chen, Zou, Li, Lu and Zhao2019; Zhang and He Reference Zhang and He2019; Malkov and Yashunin Reference Malkov and Yashunin2020; Han et al. Reference Han, Liu and Wang2023) identifies the data points in a dataset that are nearest to a particular query point, often based on a distance measure such as Euclidean distance or cosine similarity. Exact closest neighbor search uses methods like linear search or tree-based structures like kd-trees (Bentley Reference Bentley1975; Dolatshah, Hadian, and Minaei-Bidgoli Reference Dolatshah, Hadian and Minaei-Bidgoli2015; Ghojogh, Sharifian, and Mohammadzade Reference Ghojogh, Sharifian and Mohammadzade2018) to identify the genuine nearest neighbors without approximations. However, the computational complexity of accurate search might be prohibitive for big or high-dimensional data sets.

Approximate NNS (ANNS) (Zhang and He Reference Zhang and He2019; Christiani Reference Christiani2019; Li and Hu Reference Li and Hu2020; Singh et al. Reference Singh, Subramanya, Krishnaswamy and Simhadri2021), on the other hand, achieves a compromise between accuracy and efficiency. By adopting index structures such as locality-sensitive hashing (LSH) (Dasgupta, Kumar, and Sarlos Reference Dasgupta, Kumar and Sarlos2011), or graph-based techniques, it trades some precision for quicker retrieval. ANNS is especially beneficial in situations involving high-volume or high-dimensional data sets, such as picture retrieval, recommendation systems, and similarity search in massive text corpora. To meet the issues of both precise and ANNS, several methods such as k-d trees, LSH, and tree-based structures are utilized, with tradeoffs to fit specific use cases and computational restrictions.



Figure 3. Semantic similarity search process when finding top-K documents in a vector space based on input query to assign score-weighted ranks.

The process of similarity search begins by transmitting the vector embeddings of the input query to a preexisting vector store, which contains embeddings of various documents (Feature Embeddings) (refer to Figure 3). The initial step involves identifying the most similar vector embeddings within the available vector space. Subsequently, upon locating the most relevant or top-K documents, these documents are retrieved and ranked based on their individual cosine similarity to the input query (see: Figure 3). This retrieval mechanism is fundamental to every RAG methodology. Consequently, the similarity search and retrieval processes are indispensable and necessitate thorough evaluation and optimization.

2.4 RAG methods
Various RAG methods offer distinct benefits when augmenting LLMs with latent information. Selecting the appropriate RAG method is crucial for optimizing retrieval speed, token budgeting, and response accuracy. RAG methods, such as Stuff, Refine, Map Reduce, and Map Re-rank can directly influence the number of top-K documents, retrieval speed, the number of input tokens used for generation, and response time. Therefore, optimizing the RAG methods to suit the specific task is of utmost importance.

2.4.1 Stuff method
The stuff method is the most straightforward RAG technique for updating the knowledge base of an LLM with latent information (refer to Figure 4). The query received from the user is sent to the existing vector store to search for similar content based on the specified number of documents. These documents are then incorporated into the system prompt template as context, which the LLM uses to generate a response. This method aims to enable LLMs to generate well-structured responses based on all relevant information within the entire context. However, the Stuff method also presents cost-efficiency challenges. Providing an LLM with multiple contexts could potentially increase token usage, as both input and output tokens will be significantly higher unless limited by max token hyperparameter. It is generally an appropriate option for applications where RAG processes do not involve long documents (Nair et al. Reference Nair, Somasundaram, Saxena and Goswami2023, LangChain n.d.).



Figure 4. Stuff retrieval-augmented generation method.

Moreover, the context window of the selected LLM plays a crucial role, as certain models have quite a limited context window, such as GPT-3.5-Turbo with only a 4096 context token limit. Therefore, the more documents retrieved from the vector store, the more likely the context window limit will be reached.

2.4.2 Refine method
The refine method, in contrast to the ’Stuff’ method, creates an answer by iteratively looping over the input documents and refining its response (refer to Figure 5) (LangChain n.d.). Essentially, after the first iteration, an additional context is generated from LLM call using  . The generated context from  is then inserted into the successor system prompt template as additional context, along with the next document context in the iteration (  ), and then with the combined context (  ) and the user query, another answer is created. This loop continues until the specified number of top-K documents is reached. Because the refine method only sends a single document to the LLM at a time, it is ideally suited for applications that require the analysis of more documents than the model can accommodate, which addresses the token context window issue. The clear disadvantage is that this method will make significantly more LLM calls, which is not ideal for token budgeting and response time. On the other hand, the final response will be ‘refined’ due to the enriched context supplied from predecessor LLM calls using numerous documents.



Figure 5. Refine retrieval-augmented generation method.

2.4.3 Map-reduce method
In the ‘Map Reduce’ method, similar to ’Refine’, each document is iteratively used to generate a response (refer to Figure 6) (LangChain n.d.). However, one key difference in this method is that, rather than combining predecessor context with the successor, the final responses are ‘mapped’ together (refer to Figure 6). These mapped responses are then used as the final context when generating the ‘reduced’ response. In the initial phase of the map-reduce process, RAG method is systematically applied to each document independently (mapping phase), with the resulting output from the method treated as a single document. Subsequently, all newly generated documents are directed to a separate chain designed to consolidate them into a single output (reduce step). The Map Reduce method is suitable for tasks involving short documents, containing only a few pages per document. Longer contexts or long documents might cause the LLM to reach its token context window limit.



Figure 6. Map Reduce method.

Moreover, if the LLM is not limited by a maximum token hyperparameter or is not instructed to provide concise and short answers, the ‘reduced’ context could also cause token context limit issues, even if not caused by the document itself.

2.4.4 Map re-rank method
This method closely resembles the Map Reduce method but incorporates a filtering application on each  based on an assigned cosine similarity score, which ranks each response from highest to lowest in terms of similarity to the query (refer to Figure 7) (LangChain n.d.). The map re-rank documents chain initiates a preliminary query on each document, aiming not only to perform a task but also to assign a confidence score to each answer. The answer with the highest score is then provided as the output.



Figure 7. Map re-rank Method.

2.5 Advanced RAG
The RAG methods discussed in Section 2.4 (2.4.1– 2.4.4) primarily address issues related to the quality of the final response. However, another significant challenge during retrieval stems from the ambiguous nature of queries. This ambiguity can result in relevant information being overlooked during retrieval, leading to the inclusion of irrelevant documents as context during generation (LangChain n.d.; Zheng et al. Reference Zheng, Mishra, Chen, Cheng, Chi, Le and Zhou2023; Rackauckas Reference Rackauckas2024).

To enhance response accuracy and quality, and to prevent irrelevant documents from being inserted into the system prompt as context, more advanced methodologies are needed. These include filtering out irrelevant documents, creating alternative questions based on the original and then ranking each answer based on similarity (similar to the ‘Map Re-rank’ method), or generating less abstract alternatives of the input query and then proceeding with answer generation. Filtering irrelevant documents by applying similarity score thresholds can potentially exclude irrelevant documents and enable the retriever to insert only relevant documents as context. Moreover, with similarity filtering applied, token usage efficiency is achieved by limiting input token usage during filtering.



Figure 8. Impact of ambiguous vs specific query on retrieval.

Another approach involves populating the input query with less abstract alternative questions to address the ambiguity issue (refer to Figure 8). Attaching a question ‘generator chain’ could potentially provide more relevant questions that align more closely with the actual intent of the original query. This reduction in abstraction could be achieved by providing a set of instructions for the generator chain to generate questions based on the content available in the vector store. Consequently, the generator chain would not produce irrelevant questions. One drawback of this approach is that each query results in a total of  LLM calls.

•  : The number of generator chain calls per user query.

•  : The number of alternative questions generated per user query.

To exemplify, in a scenario where each query is decomposed (generated by the ‘generator chain’) into four different alternatives, and for each generated question, there will be four standalone RAG chain calls, totaling up to five calls for each query received from the user.

Alternatively, the generated questions and their follow-up answers could be ranked based on how closely the answers match the original query. While this approach would result in more LLM calls and could potentially address the ambiguity issue and improve response quality, it would also deteriorate token usage efficiency and runtime performance.

2.5.1 Contextual compression
Contextual compression resolves the problem of inserting irrelevant documents caused by the ambiguous nature of a query by compressing retrieved documents based on the cosine similarity score between the query and each document (LangChain n.d.). The Contextual Compression retriever sends queries to the vector store, which initially filters out documents through the Document Compressor. This first step shortens the document list by eliminating irrelevant content or documents based on the specified similarity threshold. Subsequently, if needed, the Redundancy Compressor can be applied as a second step to perform further similarity filtering on the retrieved documents, compressing the context even more (refer to Figure 9).

Selecting an appropriate document chain is essential. Enhancing this process with contextual filters on embeddings, based on similarity scores, can significantly reduce both input and output token generation. However, applying embedding filters necessitates a careful balance between the threshold score in similarity search and the relevancy of the response. As the similarity threshold scores increase, the number of context documents decreases, thereby affecting the relevance and comprehensiveness of the responses.



Figure 9. Contextual Compressor method applied on top-K documents.

Utilizing Contextual Compression along with various RAG methods could potentially provide further efficiency in both input token and output token generation.

2.5.2 Query step-down
To address the issue of ambiguity, the ‘Query Step-Down’ method offers a potential solution by generating variant questions based on the content within the documents (refer to Figure 10) (Zheng et al. Reference Zheng, Mishra, Chen, Cheng, Chi, Le and Zhou2023). This approach can be particularly useful for domain-specific tasks where users may lack sufficient information about the content.



Figure 10. Query Step-Down method.

The Query Step-down process initiates a ‘generator chain’ tasked with formulating questions based on the content available within the documents and the user query. Subsequently, for each generated question, the vector store is employed to retrieve the top-k documents corresponding to each  . To further optimize this approach, employing diverse RAG methods could enhance various aspects such as response time, token usage, and hardware utilization. Given the high volume of LLM calls made during each conversational transaction, reducing the context retrieved from the vector store through advanced methodologies (e.g., Contextual Compression) could address efficiency concerns effectively.

2.5.3 Reciprocal RAG
Reciprocal RAG, akin to the ‘Query Step-Down’ method, addresses the issue of ambiguity through a similarity score-based ranking process. Rather than aggregating all generated responses for each produced query to form a final answer, reciprocal RAG employs a ranking mechanism—comparable to ‘Map Re-Rank’—to selectively filter and retain only the most pertinent or relevant answers from the pool of possible responses (refer to Figure 11). This method potentially reduces token usage by prioritizing relevance and precision in the final output (Rackauckas Reference Rackauckas2024).



Figure 11. Reciprocal retrieval-augmented generation method.

3. Data
This paper utilizes three domain-specific datasets. The first dataset, the Docugami Knowledge Graph RAG dataset, includes 20 PDF documents containing SEC 10Q filings from companies such as Apple, Amazon, Nvidia, and Intel. These 10Q filings cover the period from Q3 2022 to Q3 2023. The dataset comprises 196 questions derived from the documents, with reference answers generated by GPT-4. The second dataset employed is the Llama2 Paper dataset, which consists of the Llama2 ArXiv PDF as the document, along with 100 questions and GPT-4 generated reference answers. The third dataset utilized is the MedQA dataset, a medical examination QA dataset. This dataset focuses on the real-world English subset in MedQA, featuring questions from the US Medical Licensing Examination (MedQA-US), including 1273 four-option test samples.

The significance of utilizing diverse datasets in optimizing RAG processes is rooted in the complex nature of the content within each dataset. These datasets often contain a variety of elements, including numerical values, multilingual terms, mathematical expressions, equations, and technical terminology. Given the distinct nature of these documents, optimizing the RAG processes becomes crucial. This optimization ensures efficient handling of the retrieval process during subsequent analysis. To process the data, we initially split the characters into tokens based on 1000 chunk size along with 100 overlapping chunks for each dataset. We employed the tiktoken encoder and the Recursive Character Split method for recursive splitting, ensuring that splits do not exceed the specified chunk size. The subsequent merging of these splits together completes the data processing steps.

In the next step, a grid search optimization was conducted, exploring different datasets, vector databases, RAG methods, LLMs, Embedding Models, and embedding filter scores. RAG performance was assessed by measuring the cosine similarity between the embedded LLM answer and the reference answer from each dataset and question-answer pairs.

Additionally, various performance metrics were created to monitor parameters such as run time (sec), central processing unit (CPU) usage (%), memory usage (%), token usage, and cosine similarity scores. Token usage calculation was done by applying the following formula:  , where  is the token usage at the  th iteration, and  is the length of the response generated by LLM for the  iteration.

4. Results
A comprehensive set of 23,625 grid-search iterations was conducted to obtain the results presented herein. Various embedding models were employed, including OpenAI’s flagship embedding model (text-embedding-v3-large), BAAI’s (Beijing Academy of Artificial Intelligence) open-source bge-en-small, and Cohere’s cohere-en-v3. The LLMs used in this study comprised GPT-3.5, GPT-4o-mini, and Cohere’s Command-R. For vectorstores, we utilized ChromaDB, FAISS, and Pinecone. Additionally, seven different RAG methodologies were implemented to complete the trials, and lastly, we deployed a wide range of contextual compression filters. In total, 42.12 million embedding tokens and 18.46 million tokens (combined input and output) were generated by the deployed LLMs. The cumulative runtime for all iterations was approximately 112 uninterrupted hours.

4.1 Similarity score performances
We implemented a range of RAG methodologies, LLMs, embedding models, and datasets to determine which combination would produce the highest similarity score. Among the RAG methods, Reciprocal RAG emerged as the most effective with a  similarity (Figure 12), followed by Step-Down (  ), Stuff (  ), and Map Reduce (  ) methodologies. As elaborated in Section 2.5.3, Reciprocal RAG aims to populate input queries based on the content within the documents and the generated alternative questions. Each question is then queried within the vectorstore to generate an answer. Subsequently, all generated answers are filtered based on a desired number of documents or similarity score. We used 50  similarity threshold, which is the default value across all iterations where Reciprocal RAG method is utilized.

This filtering step is particularly advantageous in scenarios where some of the generated questions may be less pertinent to the original query. By omitting the answers and documents retrieved from less-relevant and populated queries (refer to Section 2.5.3), this filtering process ensures that only the most relevant information is retained. This distinguishes Reciprocal RAG from the Step-Down method, which aggregates all answers without filtering (refer to Section 2.5.2), as well as from other methodologies that do not adequately address or aim to resolve query ambiguity.



Figure 12. Median run time (sec) comparisons by retrieval-augmented generation methods, datasets, embedding models, and large language models.

In the evaluation of LLMs, Cohere’s Command-R model stands out as the top performer, achieving an impressive similarity score of 83  , which is 2.4  higher than that of GPT-3.5 and 3.75  higher than GPT-4o-Mini (refer to Figure 12). The significance of employing various LLMs is underscored when tested against different datasets across diverse domains. For instance, 10Q documents, which predominantly contain financial information such as income statements and balance sheets, are largely composed of numerical data. Similarly, LLama2 documents include not only numerical values but also mathematical expressions, notations, and formulas. Consequently, any errors in generation by an LLM when dealing with complex or challenging contexts could substantially impact the similarity score. Furthermore, MedQA documents are replete with technical and multilingual terminology, primarily in Latin. Certain LLMs may not be extensively trained on such documents or may have been trained on a smaller corpus of similar content compared to other datasets. Therefore, evaluating different datasets enables a comprehensive capability comparison of various LLMs, particularly in tasks such as accurately handling numerical values, mathematical expressions, and multilingual terminology.

In the evaluation of embedding models, BAAI’s ’Bge-en-small’ model demonstrated remarkable performance, achieving a median similarity score of 94  . This score is notably 20.5  higher than Cohere’s flagship embedding model ’Cohere-en-v3’ and 22  higher than OpenAI’s flagship embedding model ’Text-embedding-v3-large’ (refer to Figure 12). The significance of embedding models is paramount, extending beyond the initial conversion of documents into dense vector representations (embeddings) to encompass the retrieval of semantically meaningful text from the vector space (vectorstore). Embedding models trained for complex tasks—such as capturing semantic relationships between textual and numerical data, mathematical expressions, or multilingual texts—introduce additional considerations for enhancing the processes and efficiency of RAG systems.

Upon all possible iterations and datasets, ’Reciprocal RAG’ achieved the highest similarity score (Median score: 97.1  , Std:  0.015) across both Dokugami’s 10Q and Llama2 datasets, yet not the lowest run time (sec) or token usage (refer to Table 1). The tradeoff between response accuracy, run time, and token usage plays crucial significance when designing RAG process for specific tasks.

Table 1. Similarity scores, run time, and token usage for various retrieval-augmented generation methods across different datasets. The datasets used in this study differ in complexity and domain specificity, thus the results are separated and evaluated separately


As a result, we concluded that in RAG-based applications where response accuracy is paramount, Reciprocal RAG yields the best performances. RAG processes that might require the highest possible response accuracy could involve financial, insurance, and research-related documents. On the other hand, in applications where response time and token usage are more significant, such as building chatbots for high volume usages, ’Stuff’ method could be utilized, since it yielded the 70.5  lower token usage, along with 38.9  faster response time, while only giving up 7.2  response accuracy compared to ‘Reciprocal RAG’ (refer to Table 1).

Additionally, in terms of minimizing token usage, the ’Map Re-rank’ method demonstrated exceptional performance. It achieved similarity scores of 83.0  and 82.7  with the Llama2 and 10Q documents, respectively, while generating only 418 and 308 output tokens.

All RAG methods exhibited significantly lower similarity scores—some even yielding the poorest results—when applied to the MedQA dataset. This outcome can be primarily attributed to the dataset’s nature, which involves challenging question-and-answer pairs within a highly specialized domain. MedQA documents focus on medical surgery content, where abstract or nuanced questions can substantially alter the expected answers, presenting a more formidable challenge for RAG-based applications. Consequently, methods designed to address ambiguity yielded higher similarity scores, with ’Step-Down’ achieving 67.8  and ‘Reciprocal’ attaining 67.3  (refer to Table 1), compared to other methodologies that do not address such ambiguity. Moreover, ‘Map Re-rank’ yielded the lowest score on MedQA dataset with only 14.8  similarity. These results underscore the importance of retrieving the correct documents with sufficient context, highlighting that filtering context for LLMs prior to generation is not of even greater significance than the quality context. The results demonstrate that even with less content if it is irrelevant, the performance is adversely affected.

4.2 Hardware utilization
Another critical aspect of this research is to assess how various LLMs, embedding models, datasets, and RAG methods impact hardware consumption, including CPU (  ) usage, memory (  ) usage, and runtime. Hardware utilization becomes increasingly significant when deploying RAG-based applications for high-volume usage.



Figure 13. Median run time (sec) comparisons by retrieval-augmented generation methods, datasets, embedding models, and large language models.

Further, we evaluated hardware utilization across three categories: runtime (in seconds), which measures the speed of obtaining an answer; CPU usage (percentage), which indicates the proportion of the workload handled by the CPU; and memory usage, which assesses the memory consumption during retrieval. Additionally, we considered the impact of different LLMs, embedding models, RAG methods, and datasets on these metrics.

We observed that the ’Step-Down’ method resulted in the highest median run time of 34.33 s, whereas the ’Stuff’ method exhibited the lowest run time at 14.29 s (refer to Figure 13). As detailed in Table 1, the difference in similarity scores between the top-performing methods is only 7.2  compared to the ’Stuff’ method. Additionally, the ’Stuff’ method demonstrated a 71.7  improvement in token usage efficiency relative to the top-performing method. Despite being the simplest approach and not addressing query ambiguity, the ’Stuff’ method proves to be the most efficient, albeit with marginally lower similarity scores.

Furthermore, the comparative results revealed that among the embedding models, Cohere’s ’Cohere-en-v3’ exhibited the slowest median run time of 20.19 s, whereas OpenAI’s ‘Text-embedding-v3-large’ demonstrated the fastest median run time of 18.55 s, achieving a 0.91  improvement in run time efficiency (refer to Figure 13). The inclusion of embedding models in the experiment was intended to assess which model could achieve the most rapid run time. This aspect is crucial for high-volume and high-scale applications with even denser vectorstores.

Additionally, we assessed the run time differences among various LLMs. The OpenAI GPT-3.5-Turbo model emerged as the top performer in terms of generation time, with a median run time of 18.15 s. This model achieved generation times that were 9.7  and 17.0  faster compared to GPT-4o-Mini and Command-R, respectively (refer to Figure 13). Achieving rapid generation times is particularly crucial for applications such as educational chatbots, where swift responses are needed to accommodate lower attention spans. Moreover, the tradeoff between run time and response accuracy becomes more pronounced as tasks or domains vary. In cases where the primary goal is to mitigate response hallucination or address query ambiguity, generation time may be of lesser concern. Conversely, chatbot applications designed for roles such as information desks or promotional purposes, such as university promotion, may tolerate certain levels of response hallucination in favor of minimizing response time.

Table 2. Utilization metrics for various embedding models and large language models




Figure 14. Median CPU (  ) usage comparisons by retrieval-augmented generation methods, datasets, embedding models, and large language models.

We also evaluated the performance of different embedding models and LLM combinations in terms of hardware utilization. GPT-3.5-Turbo, when paired with ‘Bge-en-small‘, achieved the fastest run time of 17.55  5.92 s, though it did not exhibit the lowest CPU utilization percentage (refer to Table 2). Generally, GPT-3.5-Turbo is identified as the fastest in response time, but the choice of embedding model also significantly impacts this efficiency. The difference in run time for GPT-3.5-Turbo, when used with various embedding models, is 3.7  between the fastest and slowest configurations (refer to Figure 14). Considering CPU and memory usage–critical factors for cloud-deployed applications handling high-volume requests–we concluded that the ‘Text-embedding-v3-large’ embedding model when used with the GPT-3.5-Turbo LLM, results in the lowest CPU  usage. This configuration sacrifices only 3.7  of run time compared to the fastest setup, which is GPT-3.5-Turbo paired with ‘Bge-en-small’ (refer to Table 2).

4.3 Vector databases
Another aspect of our evaluation involved identifying which combination of vectorstores and embedding models provides the lowest run time while also minimizing hardware utilization. This configuration is crucial for achieving cost-efficiency in high-volume, scalable, and cloud-deployed applications. Notably, maintaining scalability of the vectorstore without significantly compromising performance is essential, as the primary goal of RAG is to expand the vectorstore with additional documents. The performance metrics displayed in Table 3 underscore the significance of selecting the appropriate vectorstore and embedding model combination, as variations in run time, CPU usage, and memory usage are evident across different setups. For instance, ChromaDB paired with the ’Text-embedding-v3-large’ model exhibits a median run time of 18.34  6.21 s, alongside a median CPU usage of 1.50  and virtually negligible memory usage.

Table 3. Performance metrics for vectorstore systems with different embedding models


Conversely, the combination of FAISS and the ’Cohere-en-v3’ model results in a higher median run time of 33.60  7.69 s and an increased memory usage of 0.15  , along with a relatively high CPU demand compared the remaining configurations. These discrepancies highlight that a tailored approach in configuring vectorstores and embedding models is essential for optimizing performance parameters critical to RAG tasks. Thus, identifying the best configuration can significantly enhance processing efficiency, resource management, and overall system responsiveness, which are crucial for high-volume and large-scale RAG-based applications. Upon further examination of various RAG methodologies and vectorstores, we observed that the ’Stuff’ method, when combined with the Pinecone vectorstore, achieved the lowest run time, averaging 12.14  1.136 s (refer to Figure 15). Conversely, despite being one of the top performers in terms of similarity scores, the ’Step-Down’ method consistently resulted in the slowest run times, regardless of the vectorstore configuration.



Figure 15. Median run time (sec), CPU, and memory usage comparisons by retrieval-augmented generation methods on different vectorstores.

Additionally, the discrepancy between response accuracy and hardware utilization becomes more pronounced when considering CPU (  ) and Memory (  ) usages, as displayed in Figure 15 for both the Reciprocal and Step-Down RAG methodologies. Although both methodologies demonstrate impressive performances in similarity scores (refer to Table 1), they are also concluded to be the most demanding in terms of hardware utilization. These results signify the importance of selecting a suitable configuration for RAG applications, which utterly depends on the use case and available resources. These findings underscore the critical importance of selecting an appropriate configuration for RAG applications, which should be determined based on the specific use case and available resources. We also observed that across all RAG methodologies, ChromaDB yielded the lowest run time, CPU (  ), and memory (  ) consumption (refer to Table 4) with 18.63  9.73, 1.80  2.13, and 0.0  0.31, run time (sec), CPU (  ), and memory (  ) usage, respectively.

Table 4. Performance metrics for vectorstore systems


Considering the above factors, the optimal configuration of the RAG method, LLM, embedding model, and vector store is highly dependent on the specific use case. However, the combination of the ’Stuff’ method, ‘GPT-3.5-Turbo’ as the LLM, ‘ChromaDB’ vector store, and ‘Bge-en-small’ embedding model demonstrated better performance, exhibiting lower median scores in runtime, CPU usage (  ), and memory usage (  ).

4.4 Embedding filters
To enhance each RAG methodology, we applied Contextual Compression (see Section 2.5.1) to each retrieval process. This approach aimed to reduce token usage, lower run times, and improve similarity score performance. Due to the delicate balance between filters—such as similarity and redundancy thresholds—and the similarity between document embeddings in vectorspace and user queries, we conducted a grid search over a range of filters on each RAG method and different datasets. Starting from 0.5 for similarity and redundancy scores to 0.9, we used a step value of 0.1 to derive the results presented below (refer to Table 5).

Table 5. Comparison of Contextual Compression on median and standard deviation of token usage, run time, and score


Note:  Contextual Compression method applied

As highlighted in Table 5, we achieved significant efficiency in token usage and runtime across various RAG methods. With the ‘Map Reduce’ method, we observed an 8.99  reduction in token usage and a 7.2  decrease in runtime. Conversely, the ‘Map Re-rank’ method did not show improvements in token usage or runtime; however, it concluded with lower standard deviations. Moreover, the ’Reciprocal’ method demonstrated substantial efficiency with a 12.5  reduction in token usage and a 4.40  decrease in runtime. Similarly, the ’Refine’ method resulted in an impressive 18.6  reduction in token usage and a 3.05  improvement in runtime. Additionally, the ’Step-Down’ method achieved an 8.04  reduction in token usage and a notable 13.98  improvement in runtime. Lastly, the ’Stuff’ method did not show a median improvement in token usage; however, it achieved a 13.18  reduction in standard deviation and a 1.39  improvement in runtime.

While filtering out document embeddings below a certain threshold value, some valuable information might not retrieved by the retriever. This issue is particularly pronounced when similarity scores are evaluated after applying the contextual compression filters. Our analysis indicates that across all RAG methods, the similarity score deteriorates, emphasizing the tradeoff between response accuracy and resource management once again. Specifically, in the ’Map Reduce’ method, the similarity score deteriorated by 4.7  , in ’Map Re-rank’ by 7.89  , in ’Reciprocal’ by 7.69  , in ’Refine’ by 7.59  , and in ’Stuff’ by a notable 17.44  (refer to Table 6).

Table 6. Comparison of run time, score, and similarity threshold


Note:  Contextual Compression method applied

As discussed in Section 2.5.1, contextual compression filters out irrelevant documents by evaluating document embeddings based on their similarity scores relative to the user query. If certain document embeddings contain both valuable and irrelevant information, they may be filtered out due to a lower overall similarity score resulting from the redundant information within. Consequently, the retrieved document may lack sufficient information to provide adequate context for the LLM to generate a relevant answer. Furthermore, applying a redundancy threshold adds another layer of filtering, potentially excluding additional documents and limiting the LLM’s context to generate a comprehensive response. This issue, where documents contain dispersed and mixed information, significantly deteriorates the response accuracy performance when contextual compression is applied. As observed in Table 6, we conclude that the optimal configuration of both similarity and redundancy threshold filters varies significantly depending on the quality of the documents or whether there is a disparity of information within documents.

Our findings indicate that each dataset possesses distinct optimal filter thresholds, beyond which performance significantly deteriorates due to sufficient information not being available at higher thresholds when generating adequate responses. For the 10Q dataset, we determined that a similarity threshold of 80  and a redundancy threshold of 80  would limit the deterioration in similarity score to 5.08  . In the case of the Llama2 dataset, we concluded that the optimal threshold values are 70  for similarity and 80  for redundancy. Lastly, for the MedQA dataset, a lower threshold value was required to mitigate deterioration, with the best configuration being 50  for similarity and 60  for redundancy, resulting in a 15.7  reduction in similarity score performance (refer to Table 6). Beyond these optimal filtering values, or thresholds, we observed a significant decline in the similarity score. This decline is attributable to either an insufficient number of relevant documents or the omission of critical information buried within other irrelevant document embeddings. (refer to Table 6).

In essence, contextual compression should be employed to achieve a balance between token usage, run-time, and similarity score. However, this balance must be carefully fine-tuned to minimize the deterioration of the similarity score.

5. Conclusion
In addressing the existing gap in research on the optimization of RAG processes, this paper embarked on a comprehensive exploration of various methodologies, particularly focusing on RAG methods, vector databases/stores, LLMs, embedding models, and datasets. The motivation stemmed from the recognized significance of optimizing and improving RAG processes, as underscored by numerous studies (Vaithilingam et al. Reference Vaithilingam, Zhang and Glassman2022; Nair et al. Reference Nair, Somasundaram, Saxena and Goswami2023; Topsakal and Akinci Reference Topsakal and Akinci2023; Manathunga and Illangasekara Reference Manathunga and Illangasekara2023; Nigam et al. Reference Nigam, Mishra, Mishra, Shallum and Bhattacharya2023; Pesaru et al. Reference Pesaru, Gill and Tangella2023; Peng et al. Reference Peng, Liu, Yang, Yuan and Li2023; Konstantinos and Pouwelse Andriopoulos and Johan Reference Andriopoulos and Johan2023; Roychowdhury et al. Reference Roychowdhury, Alvarez, Moore, Krema, Gelpi, Rodriguez, Rodriguez, Cabrejas, Serrano, Agrawal and Mukherjee2023).

Through a comprehensive grid-search optimization encompassing 23,625 iterations, we conducted a series of experiments to evaluate the performance of various RAG methods (Map Re-rank, Stuff, Map Reduce, Refine, Query Step-Down, Reciprocal). These experiments involved different vectorstores (ChromaDB, FAISS, and Pinecone), embedding models (Bge-en-small, Cohere-en-v3, and Text-embedding-v3-large), LLMs (Command-R, GPT-3.5-Turbo, and GPT-4o-Mini), datasets (Dokugami 10Q, LLama2, and MedQA), and contextual compression filters (Similarity and Redundancy Thresholds).

Our findings highlight the significance of optimizing the parameters involved in developing RAG-based applications. Specifically, we emphasize aspects such as response accuracy (similarity score performance), vectorstore scalability, hardware utilizations; run-time efficiency, CPU(  ), and Memory(  ) usages. These considerations are crucial under various conditions, including different embedding models, diverse datasets across various domains, different LLMs, and various RAG methodologies.

The results of our grid-search optimization highlight the significance of context quality over similarity-based ranking processes or other methods that aggregate all responses iteratively as the final output. Specifically, context quality demonstrates greater importance than simply applying similarity-based methods, which may result in only marginal improvements in similarity scores by excluding less relevant context from the rankings. Additionally, the discussion on the distinction between ambiguity and specificity in user queries (see Section 2.5) further emphasizes the need for increased focus on this methodology. Methods addressing the ’ambiguity’ issue yield higher similarity scores (refer to Table 1) compared to those that do not address it. However, a higher similarity score incurs a cost, creating a tradeoff between response accuracy (represented by the similarity score) and resource management, which includes run-time, token usage, and hardware utilization (see Sections 4.1 –4.4). To address this issue, our objective was to determine the optimal configurations that balance similarity score performance with run-time efficiency, vectorstore scalability, token usage, as well as CPU and memory usage. The results revealed nuanced performances across different iterations.

In our evaluations for RAG methods, The ’Reciprocal’ method emerged as a particularly effective approach, demonstrating higher similarity score compared to other methods, achieving up to 91  (see Figure 13 and Table 1). However, this method also led to an increased number of LLM calls, resulting in greater token usage and extended run time, as it addresses the query-ambiguity problem (refer to Section 2.5.3, Figure 14). In contrast, although the ’Stuff’ method does not address query-ambiguity issue, it exhibited an acceptably lower similarity score performance compared to that of the ’Reciprocal’ RAG method while only sacrificing 7.2  performance, while cutting down token usage by 71.3  and improving run time by 33.89  (see Table 1 and Figure 14). Moreover, we also observed that, when inadequate context is retrieved, regardless of any post-retrieval ranking processes, the response accuracy significantly deteriorates across all datasets (refer to Table 1), especially with ’Map Re-rank’ method and MedQA dataset.

In consideration of hardware utilization, our analysis reveals that GPT-3.5-Turbo, when employed with the ’Bge-en-small’ embedding model, demonstrated a median run-time performance of 17.55  5.92 s, alongside a CPU usage of 2.95   8.31. Conversely, when integrated with the ’Text-embedding-v3-large’ embedding model, we noted a marginal 3.99  reduction in runtime, paired with a significant 52.5  enhancement in CPU usage efficiency for GPT-3.5-Turbo. This underscores the importance of selecting the optimal configuration of embedding models and LLMs to achieve scalability improvements in high-volume RAG-based applications.

Furthermore, we conclude that vectorstores (vector databases) also play a crucial role in optimizing hardware utilization. Notably, the ChromaDB vectorstore demonstrated superior performance in terms of runtime, CPU, and memory usage across all iterations with different embedding models and vectorstores. Specifically, when employed with the ’Text-embedding-v3-large’ embedding model, ChromaDB achieved a runtime as low as 18.34  6.21 s, and a CPU usage of 1.50   1.93. These results put forth another aspect of developing RAG-based applications with more scalable and stable configurations in order to expand the capabilities of RAG processes.

In contextual compression evaluations, we observed that the tradeoff between similarity score performance and runtime, along with token usage, necessitates a tailored optimization process due to the sensitive nature of similarity search. Inadequate context can significantly deteriorate similarity scores due to the application of higher filters (refer to Table 6) where we can observe the evident reduction in similarity score performances, such as 5.08  for 10Q, 9.18  for Llama2 and 15.7  for MedQA datasets. Conversely, identifying the most optimal configuration can substantially reduce both token usage and runtime. This highlights the necessity of deploying contextual compression for specific use cases where slight deteriorations in similarity scores can be tolerated in exchange for lower runtime and token usage (refer to Tables 5 and 6).

In light of our findings, it is evident that optimizing RAG-based applications is essential, given the critical role that parameters such as similarity score performance, run-time efficiency, vectorstore scalability, token usage, and CPU and memory utilization play in the effectiveness of various tools, AI chatbots, and AI agents. Consequently, we emphasize the importance of further research into optimizing RAG processes, which could lead to significant advancements in performance.

Supplementary material
The supplementary material for this article can be found at https://doi.org/10.1017/nlp.2024.53.

References

Andriopoulos, K. and Johan, P. (2023). Augmenting LLMs with knowledge: a survey on hallucination prevention. arXiv. https://doi.org/10.48550/arXiv.2309.16459.CrossRefGoogle Scholar

Bentley, J.L. (1975). Multidimensional binary search trees used for associative searching. Communications of the ACM 18, 509–517. https://doi.org/10.1145/361002.361007.CrossRefGoogle Scholar

Brown, T., Mann, B., Ryder, N., Subbiah, M., Kaplan, J.D., Dhariwal, P. and Neelakantan, A. (2020). Language models are few-shot learners. Advances in Neural Information Processing Systems 33, 1877–1901 Google Scholar

Chen, W., Chen, J., Zou, F., Li, Y.-F., Lu, P. and Zhao, W. (2019). RobustiQ: a robust ANN search method for billion-scale similarity search on GPUs. Proceedings of the 2019 International Conference On Multimedia Retrieval (pp. 132–140). https://doi.org/10.1145/3323873.3325018.CrossRefGoogle Scholar

Choi, J., Jung, E., Suh, J. and Rhee, W. (2021). Improving bi-encoder document ranking models with two rankers and multi-teacher distillation. In Proceedings of the 44th International ACM SIGIR Conference On Research and Development in Information Retrieval, 2192–2196. https://doi.org/10.1145/3404835.3463076CrossRefGoogle Scholar
Chowdhery, A., Narang, S., Devlin, J., Bosma, M., Mishra, G., Roberts, A. and Barham, P. (2023). PaLM: scaling language modeling with pathways. Journal of Machine Learning Research 24, 1–113.Google Scholar

Christiani, T. (2019). Fast locality-sensitive hashing frameworks for approximate near neighbor search. In Amato G., Gennaro C., Oria V. and Radovanović M. (eds), Similarity Search and Applications. Springer International Publishing, pp. 3–17. https://doi.org/10.1007/978-3-030-32047-81.CrossRefGoogle Scholar

Cui, J., Li, Z., Yan, Y., Chen, B. and Yuan, L. (2023). ChatLaw: open-source legal large language model with integrated external knowledge bases. https://doi.org/10.48550/arXiv.2306.16092.CrossRefGoogle Scholar

Dasgupta, A., Kumar, R. and Sarlos, T. (2011). Fast locality-sensitive hashing, In Proceedings of the 17th ACM SIGKDD International Conference On Knowledge Discovery and Data Mining, 1073–1081. https://doi.org/10.1145/2020408.2020578,CrossRefGoogle Scholar

Devlin, J., Chang, M.-W., Lee, K. and Toutanova, K. (2019). BERT: pre-training of deep bidirectional transformers for language understanding. arXiv. https://doi.org/10.48550/arXiv.1810.04805.CrossRefGoogle Scholar

Dolatshah, M., Hadian, A. and Minaei-Bidgoli, B. (2015). Ball*-tree: efficient spatial indexing for constrained nearest-neighbor search in metric spaces. https://doi.org/10.48550/arXiv.1511.00628. arXiv: 1511.00628.CrossRefGoogle Scholar

Ghojogh, B., Sharifian, S. and Mohammadzade, H. (2018). Tree-based optimization: a meta-algorithm for metaheuristic optimization, arXiv: 1809.09284.Google Scholar

Gupta, Utkarsh (2023). GPT-investAR: enhancing stock investment strategies through annual report analysis with large language models. SSRN Electronic Journal, arXiv: 2309.03079.Google Scholar

Han, Yikun, Liu, Chunjiang and Wang, Pengfei (2023). A comprehensive survey on vector database: storage and retrieval technique, Challenge. arXiv, 2023-10-18.Google Scholar

Jégou, H., Douze, M., Schmid, C. (2011). Product quantization for nearest neighbor search. IEEE Transactions On Pattern Analysis and Machine Intelligence 33, 117–128. https://doi.org/10.1109/TPAMI.2010.57.CrossRefGoogle ScholarPubMed

Jeong, Cheonsu (2023). A study on the implementation of generative AI services using an enterprise data-based LLM application architecture. arXiv. https://doi.org/10.48550/arXiv.2309.CrossRefGoogle Scholar

Johnson, J., Douze, M. and Jégou, H. (2021). Billion-scale similarity search with GPUs. IEEE Transactions On Big Data 7, 535–547.CrossRefGoogle Scholar
LangChain, . (n.d.) MapRerankDocumentsChain documentation. langChain API documentation. Available at: https://api.python.langchain.com/en/latest/chains/langchain.chains.combine_documents.map_rerank.MapRerankDocumentsChain.html#langchain.chains.combine_documents.map_rerank.MapRerankDocumentsChain.Google Scholar
LangChain, . (n.d.) Contextual compression documentation. langChain API documentation. Available at: https://python.langchain.com/v0.1/docs/modules/data_connection/retrievers/contextual_compression/.Google Scholar
LangChain, . (n.d.) MapReduceDocumentsChain documentation. langChain API documentation. Available at: https://api.python.langchain.com/en/latest/chains/langchain.chains.combine_documents.map_reduce.MapReduceDocumentsChain.html#langchain.chains.combine_documents.map_reduce.MapReduceDocumentsChain.Google Scholar
LangChain, . (n.d.) RefineDocumentsChain documentation. langChain API documentation. Available at: https://api.python.langchain.com/en/latest/chains/langchain.chains.combine_documents.refine.RefineDocumentsChain.html#langchain.chains.combine_documents.refine.RefineDocumentsChain.Google Scholar
LangChain, . (n.d.) StuffDocumentsChain documentation. langChain API documentation, Available at: https://api.python.langchain.com/en/latest/chains/langchain.chains.combine_documents.stuff.StuffDocumentsChain.html#langchain.chains.combine_documents.stuff.StuffDocumentsChain.Google Scholar

Lewis, M., Liu, Y., Goyal, N., Ghazvininejad, M., Mohamed, A., Levy, O., Stoyanov, V. and Zettlemoyer, L. (2019). BART: denoising sequence-to-sequence pre-training for natural language generation, Translation, and and Comprehension. arXiv, 1910.13461.Google Scholar

Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N. and Küttler, H. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. In Advances in Neural Information Processing Systems, 33, Curran Associates, Inc, pp. 9459–9474.Google Scholar

Li, L. and Hu, Q. (2020). Optimized high order product quantization for approximate nearest neighbors search. Frontiers of Computer Science 14, 259–272.CrossRefGoogle Scholar

Lin, Jimmy, Pradeep, Ronak, Teofili, Tommaso and Xian, Jasper (2023). Vector search with openAI embeddings: lucene is all you need. arXiv, https://doi.org/10.48550/arXiv.2308.14963 August 28, 2023.Google Scholar

Malkov, Y. A. and Yashunin, D. A. (2020). Efficient and robust approximate nearest neighbor search using hierarchical navigable small world graphs. IEEE Transactions On Pattern Analysis and Machine Intelligence 42, 824–836.CrossRefGoogle ScholarPubMed

Manathunga, S. S. and Illangasekara, Y. A. (2023). Retrieval augmented generation and representative vector summarization for large unstructured textual data in medical education. arXiv, arXiv: 2308.00479.Google Scholar

Mialon, G., Dessí, R., Lomeli, M., Nalmpantis, C., Pasunuru, R., Raileanu, R., Rozière, B., (2023). Augmented language models: a survey. arXiv,Google Scholar

Nair, I., Somasundaram, S., Saxena, A. and Goswami, K. (2023). Drilling down into the discourse structure with LLMs for long document question answering. arXiv, 14593–14606, 2311.13565.Google Scholar

Nigam, S. K., Mishra, S. K., Mishra, A. K., Shallum, N. and Bhattacharya, A. (2023). Legal question-answering in the Indian context: efficacy, challenges, and potential of modern AI models. arXiv, preprint arXiv: 2309.14735.Google Scholar

Peng, R., Liu, K., Yang, P., Yuan, Z. and Li, S. (2023). Embedding-based retrieval with LLM for effective agriculture information extracting from unstructured data. arXiv, 2308.03107, https://arxiv.org/abs/2308.03107 Google Scholar

Pesaru, A., Gill, T. and Tangella, A. (2023). AI assistant for document management using lang chain and pinecone. International Research Journal of Modernization in Engineering Technology and Science.Google Scholar

Rackauckas, Z. (2024). Rag-fusion: a new take on retrieval-augmented generation. International Journal On Natural Language Computing 13, 37–47, arXiv preprint arXiv: 2402.03367.CrossRefGoogle Scholar

Roychowdhury, S., Alvarez, A., Moore, B., Krema, M., Gelpi, M. P., Rodriguez, F. M., Rodriguez, A., Cabrejas, J. R., Serrano, P. M., Agrawal, P. and Mukherjee, A. (2023). Hallucination-minimized Data-to-answer Framework for Financial Decision-makers, arXiv, 2311.07592.Google Scholar

Sage, A. (2023). Great algorithms are not enough —, pinecone, Retrieved December 19, 2023.Google Scholar

Schwaber-Cohen, R. (2023). Chunking strategies for LLM applications, Pinecone, Retrieved December 13, 2023,Google Scholar

Singh, A., Subramanya, S. J., Krishnaswamy, R. and Simhadri, H. V. (2021). FreshDiskANN: a fast and streaming similarity search, arXiv, preprint arXiv: 2105.09613.Google Scholar

Sutskever, Ilya, Vinyals, Oriol and Le, Quoc V. (2014). Sequence to sequence learning with neural networks, arXiv, 1409.3215. arXiv.Google Scholar

Topsakal, O. and Akinci, T. C. (2023). Creating large language model applications utilizing langChain: a primer on developing LLM apps fast. International Conference On Applied Engineering and Natural Sciences 1050–1056.CrossRefGoogle Scholar

Vaithilingam, P., Zhang, T. and Glassman, E. L. (2022). Evaluating the Usability of Code Generation Tools Powered by Large Language Models. In Extended Abstracts of the 2022 CHI Conference on Human Factors in Computing Systems CrossRefGoogle Scholar

Wei, J., Wang, X., Schuurmans, D., Bosma, M., Ichter, B., Xia, F., Chi, E., Le, Q. V. and Zhou, D. (2022). Chain-of-thought prompting elicits reasoning in large language models. Advances in Neural Information Processing Systems 35, 24824–24837.Google Scholar

Zhang, M. and He, Y. (2019). GRIP: Multi-Store Capacity-Optimized High-Performance Nearest Neighbor Search for Vector Search Engine. In Proceedings of the 28th ACM International Conference on Information and Knowledge Management, pp. 1673–1682.CrossRefGoogle Scholar

Zheng, H. S., Mishra, S., Chen, X., Cheng, H. T., Chi, E. H., Le, Q. V. and Zhou, D. (2023). Take a step back: evoking reasoning via abstraction in large language models. arXiv, preprint arXiv: 2310.06117.Google Scholar

Zhou, X., Li, G. and Liu, Z. (2023). Llm as dba. arXiv preprint arXiv:2308.05481.Google Scholar

How I Built a Prompt Compressor That Reduces LLM Token Costs Without Losing Meaning
#
llm
#
promptengineering
#
nlp
#
python
Tools like LLMLingua (by Microsoft) use language models to compress prompts by learning which parts can be dropped while preserving meaning. It’s powerful — but also relies on another LLM to optimize prompts for the LLM.

I wanted to try something different: a lightweight, rule-based semantic compressor that doesn't require training or GPUs — just smart heuristics, NLP tools like spaCy, and a deep respect for meaning.

The Challenge: Every Token Costs
In the world of Large Language Models (LLMs), every token comes with a price tag. For organizations running thousands of prompts daily, these costs add up quickly. But what if we could reduce these costs without sacrificing the quality of interactions?

Real Results: Beyond Theory
Our experimental Semantic Prompt Compressor has shown promising results in real-world testing. Analyzing 135 diverse prompts, we achieved:

22.42% average compression ratio
Reduction from 4,986 → 3,868 tokens
1,118 tokens saved while maintaining meaning
Over 95% preservation of named entities and technical terms
Example 1
Original (33 tokens):
"I've been considering the role of technology in mental health treatment.
How might virtual therapy and digital interventions evolve?
I'm interested in both current applications and future possibilities."
_
Compressed (12 tokens):
_"I've been considering role of technology in mental health treatment."

Compression ratio: 63.64%

Example 2
Original (29 tokens):
"All these apps keep asking for my location.
What are they actually doing with this information?
I'm curious about the balance between convenience and privacy."

Compressed (14 tokens):
"apps keep asking for my location. What are they doing with information."

Compression ratio: 51.72%

The Cost Impact
Let’s translate these results into real business scenarios.

Customer Support AI
(100,000 queries/day):

Avg. 200 tokens per query
GPT-4 API cost: $0.03 / 1K tokens
Without compression:

20M tokens/day → $600/day → $18,000/month
With 22.42% compression:
15.5M tokens/day → $465/day
Monthly savings: $4,050
How It Works: A Three-Layer Approach
Rules Layer
We implemented a configurable rule system instead of using a black-box ML model. For example:

Replace “Could you explain” with “explain”

Replace “Hello, I was wondering” with “I wonder”

rule_groups:
remove_fillers:
enabled: true
patterns:
- pattern: "Could you explain"
replacement: "explain"
remove_greetings:
enabled: true
patterns:
- pattern: "Hello, I was wondering"
replacement: "I wonder"

spaCy NLP Layer
We leverage spaCy’s linguistic analysis for intelligent compression:

Named Entity Recognition to preserve key terms
Dependency parsing for sentence structure
POS tagging to remove non-essential parts
Compound-word preservation for technical terms
Entity Preservation Layer
We ensure critical information is not lost:

Technical terms (e.g., "5G", "TCP/IP")
Named entities (companies, people, places)
Numerical values and measurements
Domain-specific vocabulary
Real-World Applications
_Customer Support
_

Compress user queries while maintaining context
Preserve product-specific language
Reduce support costs, maintain quality
_Content Moderation
_

Efficiently process user reports
Maintain critical context
Cost-effective scaling
Technical Documentation
Compress API or doc queries
Preserve code snippets and terms
Cut costs without losing accuracy
Beyond Simple Compression
What makes our approach unique?
Intelligent Preservation — Maintains technical accuracy and key data

Configurable Rules — Domain-adaptable, transparent, and editable

Transparent Processing — Understandable and debuggable

Current Limitations
Requires domain-specific tuning
Conservative in technical contexts
Manual rule editing still helpful
Entity preservation may be overly cautious
Future Development
ML-based adaptive compression
Domain-specific profiles
Real-time compression
LLM platform integrations
Custom vocabulary modules Conclusion
The results from our testing show that intelligent semantic prompt compression is not only possible — it's practical.

With a 22.42% average compression ratio and high semantic preservation, LLM-based systems can reduce API costs while maintaining clarity and intent.

Whether you're building support bots, moderation tools, or technical assistants, prompt compression could be a key layer in your stack.

Project on GitHub:
github.com/metawake/prompt_compressor
(Open source, transparent, and built for experimentation.)