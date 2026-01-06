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
  type?: string; // Error type (e.g., "API_KEY_MISSING")
  stage_message?: string; // For Deep Research stages
  heartbeat?: string; // For heartbeat/keepalive messages
  streaming_ready?: boolean; // Backend ready to stream
  first_content?: boolean; // First content chunk signal
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
export interface RAGConfig {
  enabled?: boolean;
  mode?: 'auto' | 'manual' | 'off';
  document_ids?: string[];
  max_chunks?: number;
  min_similarity?: number;
  use_rerank?: boolean;
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
