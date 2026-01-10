// Core Types
export type ModelProvider =
  | 'deepseek'
  | 'openai'
  | 'chatgpt_pro'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'groq'
  | 'mistral';

export type ModelType = 'chat' | 'embedding' | 'image' | 'audio';

export interface GoogleCredentialResponse {
  credential?: string;
  clientId?: string;
  select_by?: string;
}

export interface ConversationData {
  id: string;
  title: string;
  updated_at: string;
  created_at?: string;
}

export interface ExtendedMessageMeta {
  tokens_in?: number;
  tokens_out?: number;
  model?: string;
  provider?: ModelProvider;
  estimated_cost?: number;
  deep_research?: boolean;
  stage?: string;
  progress?: number;
  reasoning?: boolean;
  thought_tokens?: number; // Gemini thought tokens
  thinking_tokens_used?: number; // Gemini effective thinking usage
  tool_calls?: { call_id: string; name?: string; input?: string }[]; // Responses API tool calls
  // Reasoning/thinking content
  reasoning_content?: string; // DeepSeek reasoning content
  thought_content?: string; // Full thought content at end
  thinking?: string; // Thinking/reasoning content chunk
  total_latency?: number; // Total response time in seconds
  // RAG sources
  rag_sources?: RAGSource[];
  rag_enabled?: boolean;
  rag_context_preview?: string; // Preview of the context sent to model
  rag_context_full?: string; // Full context for debug mode
  rag_debug?: RAGDebugInfo; // Debug info about search queries and methods
  system_prompt_preview?: string; // Preview of the full system prompt
  system_prompt_full?: string; // Full system prompt with RAG context for debug
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  meta?: ExtendedMessageMeta;
}

export interface ChatResponse {
  content?: string;
  id?: string;
  done?: boolean;
  error?: string;
  type?: string; // Error type (e.g., "API_KEY_MISSING") or event type (e.g., "rag_context")
  stage_message?: string; // For Deep Research stages
  heartbeat?: string; // For heartbeat/keepalive messages
  ping?: boolean; // For heartbeat ping events
  streaming_ready?: boolean; // Backend ready to stream
  first_content?: boolean; // First content chunk signal
  // RAG context info (sent at start of generation)
  rag_sources?: RAGSource[];
  rag_context_preview?: string;
  rag_context_full?: string; // Full context for debug mode
  rag_context_length?: number;
  chunks_count?: number;
  debug?: RAGDebugInfo; // Debug info about search queries and methods
  system_prompt_preview?: string; // Preview of the system prompt
  system_prompt_full?: string; // Full system prompt with RAG context for debug
  system_prompt_length?: number;
  meta?: {
    tokens_in?: number;
    tokens_out?: number;
    model?: string;
    provider?: ModelProvider;
    estimated_cost?: number;
    deep_research?: boolean;
    stage?: string;
    progress?: number;
    reasoning?: boolean;
    thought_tokens?: number; // Gemini/DeepSeek thought token usage
    thinking_tokens_used?: number; // Gemini effective thinking usage
    thinking?: string; // Thinking/reasoning content chunk
    reasoning_content?: string; // DeepSeek reasoning content
    thought_content?: string; // Full thought content at end
    tool_calls?: { call_id: string; name?: string; input?: string }[]; // Responses API tool calls
    // RAG sources in final response
    rag_sources?: RAGSource[];
    rag_enabled?: boolean;
    rag_context_preview?: string;
  };
}

// Provider and Model Configuration
export interface ModelInfo {
  id: string;
  name: string;
  display_name: string;
  provider: ModelProvider;
  context_length: number;
  supports_streaming: boolean;
  supports_functions?: boolean;
  supports_vision?: boolean;
  type: ModelType;
  enabled?: boolean;
  pricing?: {
    input_tokens: number;
    output_tokens: number;
  };
  max_output_tokens?: number;  // Maximum output tokens for this model
  recommended_max_tokens?: number;  // Recommended max for quality
}

export interface ProviderConfig {
  id: ModelProvider;
  name: string;
  enabled: boolean;
  logo: string;
  description: string;
  keyVaults: KeyVaults;
  settings: ProviderSettings;
  fetchOnClient?: boolean;
  models: ModelInfo[];
}

export interface KeyVaults {
  apiKey?: string;
  baseURL?: string;
  endpoint?: string;
  // Provider-specific keys
  accessKeyId?: string; // AWS Bedrock
  secretAccessKey?: string; // AWS Bedrock
  region?: string; // AWS/Azure
  apiVersion?: string; // Azure
}

export interface ProviderSettings {
  showApiKey?: boolean;
  showModelFetcher?: boolean;
  disableBrowserRequest?: boolean;
  supportResponsesApi?: boolean;
  proxyUrl?: string;
  searchMode?: 'none' | 'builtin' | 'internal';
}

// Application Configuration
export interface AppConfig {
  activeProvider: ModelProvider;
  activeModel: string;
  providers: Record<ModelProvider, ProviderConfig>;
  generation: GenerationConfig;
  ui: UIConfig;
  system?: SystemConfig;
}

export interface GenerationConfig {
  temperature: number;
  max_tokens: number;
  top_p: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop_sequences?: string[];
  stream: boolean;
  // Gemini thinking extensions
  thinking_budget?: number; // -1 dynamic, 0 off, >0 fixed
  include_thoughts?: boolean; // request thought summary (if supported)
  // GPT-5 extensions
  verbosity?: 'low' | 'medium' | 'high';
  reasoning_effort?: 'minimal' | 'medium' | 'high';
  cfg_scale?: number;
  free_tool_calling?: boolean;
  grammar_definition?: string;
  tools?: Array<Record<string, unknown>>; // was any[]
}

export interface UIConfig {
  theme: 'light' | 'dark' | 'auto';
  fontSize: number;
  language: string;
  enableMarkdown: boolean;
  enableLatex: boolean;
  compactMode: boolean;
}

export interface SystemConfig {
  system_prompt?: string;
  max_context_tokens: number;
  auto_save: boolean;
  conversations_limit: number;
}

// Runtime States
export interface ProviderStatus {
  id: ModelProvider;
  enabled: boolean;
  connected: boolean;
  loading: boolean;
  error?: string;
  lastCheck?: string;
  modelsCount: number;
}

export interface ModelCard {
  id: string;
  name: string;
  provider: ModelProvider;
  type: ModelType;
  contextLength: number;
  enabled: boolean;
  isCustom?: boolean;
  deploymentName?: string; // Azure
  params?: Record<string, unknown>; // was Record<string, any>
}

// API Request/Response Types
export interface RAGOrchestratorConfig {
  include_history?: boolean;        // Include conversation history
  history_limit?: number;           // Max messages from history (0 = disabled)
  include_memory?: boolean;         // Use long-term memory (Mem0)
  auto_retrieve?: boolean;          // Automatically search documents
  adaptive_chunks?: boolean;        // AI decides how many chunks (3% or 50%)
  enable_web_search?: boolean;      // Allow web search (future)
  enable_code_execution?: boolean;  // Allow code execution (future)
}

export interface RAGConfig {
  enabled?: boolean;
  mode?: 'off' | 'auto' | 'smart' | 'basic' | 'advanced' | 'ultimate' | 'hyde' | 'agentic' | 'full' | 'chapter';
  document_ids?: string[];

  // === CHUNK RETRIEVAL SETTINGS ===
  // Mode: "fixed" (exact count) or "percent" (% of document) or "adaptive" (AI decides)
  chunk_mode?: 'fixed' | 'percent' | 'adaptive';
  max_chunks?: number;              // Used when chunk_mode="fixed" (legacy)
  chunk_percent?: number;           // Used when chunk_mode="percent" (0-100%)
  min_chunks?: number;              // Minimum chunks even for small queries
  max_chunks_limit?: number;        // Internal safety limit (absolute number)
  max_percent_limit?: number;       // MAIN user-facing setting: max % of document to use

  min_similarity?: number;
  use_rerank?: boolean;
  // Advanced options (like n8n)
  include_metadata?: boolean;  // Include document metadata in results
  keyword_weight?: number;     // Weight for keyword search (0-1), default 0.3
  semantic_weight?: number;    // Weight for semantic search (0-1), default 0.7

  // === ORCHESTRATOR SETTINGS ===
  orchestrator?: RAGOrchestratorConfig;

  // Debug option - shows FULL prompt sent to model
  debug_mode?: boolean;        // When true, returns full system prompt + history in response
}

export interface RAGSource {
  index: number;
  document_id: string;
  document_name?: string;
  section?: string;
  page?: number;
  chunk_index?: number;
  similarity: number;
  citation: string;
  rerank_score?: number;
  matching_queries?: string[]; // Queries that matched this chunk (for multi-query)
  content_preview?: string; // Preview of the chunk content
}

export interface RAGDebugInfo {
  original_query: string;
  generated_queries: string[];
  total_candidates: number;
  after_rerank: number;
  search_method: string[];
  strategy?: string;
  auto_detected_strategy?: string;
  techniques_used?: string[];
  step_back_query?: string;
  search_history?: Array<{ query: string; results_count: number }>;
  agent_iterations?: number;
  // Debug collector - подробная информация о RAG pipeline
  collector?: {
    timestamp: string;
    request_id: string;
    input: any;
    rag_pipeline: any;
    model_request: any;
    model_response: any;
    summary: any;
  };
  // Прочие поля для совместимости со старым кодом
  [key: string]: any;
}

export interface SendMessageRequest {
  message: string;
  provider: ModelProvider;
  model: string;
  conversation_id?: string;
  config?: Partial<GenerationConfig>;
  system_prompt?: string;
  rag?: RAGConfig;
}

export interface ProviderListResponse {
  providers: ProviderStatus[];
}

export interface ModelsResponse {
  models: ModelInfo[];
  provider: ModelProvider;
}

export interface ConfigResponse {
  config: AppConfig;
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  version: string;
  providers: Record<ModelProvider, boolean>;
  uptime: number;
}
