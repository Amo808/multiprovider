import React, { useState, useMemo, useCallback } from 'react';
import {
  Eye, Download, X, Copy, Check,
  ChevronDown, ChevronRight, Zap, Code,
  MessageSquare, Database, FileText, Clock, Hash
} from 'lucide-react';
import { Message, GenerationConfig } from '../types';

// ==================== TYPES ====================

interface RAGChunk {
  id: string;
  content: string;
  metadata?: {
    source?: string;
    chapter?: string;
    page?: number;
    score?: number;
  };
  similarity_score?: number;
}

interface RAGDebugInfo {
  intent?: {
    query: string;
    detected_intent?: string;
    keywords?: string[];
  };
  structure?: {
    total_chunks: number;
    chapters?: string[];
    document_type?: string;
  };
  retrieval?: {
    query: string;
    top_k: number;
    threshold?: number;
    results_count: number;
  };
  chunks?: RAGChunk[];
  context?: {
    total_tokens?: number;
    context_text?: string;
  };
  timing?: {
    retrieval_ms?: number;
    processing_ms?: number;
    total_ms?: number;
  };
}

interface ContextViewerProps {
  messages: Message[];
  currentInput?: string;
  generationConfig: GenerationConfig;
  systemPrompt?: string;
  ragDebugInfo?: RAGDebugInfo;
  ragContext?: string;
  className?: string;
}

// ==================== N8N-STYLE JSON TREE VIEWER ====================

interface JsonNodeProps {
  keyName?: string;
  value: any;
  depth?: number;
  isLast?: boolean;
}

const JsonNode: React.FC<JsonNodeProps> = ({ keyName, value, depth = 0, isLast = true }) => {
  // Auto-expand important keys at any depth
  const shouldAutoExpand = () => {
    if (depth < 2) return true;
    // Always expand messages array and its contents
    if (keyName === 'messages') return true;
    if (keyName === 'content' || keyName === 'role') return true;
    // Expand objects inside messages
    if (depth <= 4 && typeof value === 'object') return true;
    return false;
  };
  
  const [isExpanded, setIsExpanded] = useState(shouldAutoExpand());

  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);
  const isEmpty = isObject && Object.keys(value).length === 0;

  const indent = depth * 16;

  // Render primitive values - NO TRUNCATION in tree view for full visibility
  const renderValue = (val: any) => {
    if (val === null) return <span className="text-rose-400">null</span>;
    if (typeof val === 'boolean') return <span className="text-violet-400">{String(val)}</span>;
    if (typeof val === 'number') return <span className="text-amber-400">{val}</span>;
    if (typeof val === 'string') {
      // For very long strings, show them in a scrollable pre block
      if (val.length > 1000) {
        return (
          <div className="flex flex-col">
            <span className="text-gray-500 text-xs mb-1">({val.length} chars)</span>
            <pre className="text-emerald-400 whitespace-pre-wrap break-all text-xs bg-gray-800/50 p-2 rounded max-h-96 overflow-y-auto">
              "{val}"
            </pre>
          </div>
        );
      }
      return (
        <span className="text-emerald-400 break-all whitespace-pre-wrap">
          "{val}"
          {val.length > 200 && <span className="text-gray-500 text-xs ml-1">({val.length} chars)</span>}
        </span>
      );
    }
    return <span className="text-gray-400">{String(val)}</span>;
  };

  // Empty object/array
  if (isEmpty) {
    return (
      <div className="flex items-start py-0.5" style={{ paddingLeft: indent }}>
        {keyName && <span className="text-sky-400">"{keyName}"</span>}
        {keyName && <span className="text-gray-400 mx-1">:</span>}
        <span className="text-gray-400">{isArray ? '[]' : '{}'}</span>
        {!isLast && <span className="text-gray-400">,</span>}
      </div>
    );
  }

  // Primitive value
  if (!isObject) {
    return (
      <div className="flex items-start py-0.5 flex-wrap" style={{ paddingLeft: indent }}>
        {keyName && <span className="text-sky-400">"{keyName}"</span>}
        {keyName && <span className="text-gray-400 mx-1">:</span>}
        {renderValue(value)}
        {!isLast && <span className="text-gray-400">,</span>}
      </div>
    );
  }

  // Object or Array
  const entries = isArray ? value.map((v: any, i: number) => [i, v]) : Object.entries(value);
  const bracketOpen = isArray ? '[' : '{';
  const bracketClose = isArray ? ']' : '}';

  // Generate preview for collapsed objects
  const getCollapsedPreview = () => {
    if (isArray) {
      // For message arrays, show role preview
      if (entries.length > 0 && entries[0][1]?.role) {
        const roles = entries.map(e => e[1]?.role).filter(Boolean).slice(0, 3);
        return `${entries.length} messages: ${roles.join(', ')}${entries.length > 3 ? '...' : ''}`;
      }
      return `${entries.length} items`;
    }
    // For objects, show keys preview
    const keys = Object.keys(value).slice(0, 4);
    if (keys.includes('role') && keys.includes('content')) {
      // This is a message object
      const role = value.role || '';
      const contentPreview = typeof value.content === 'string' 
        ? value.content.slice(0, 50) + (value.content.length > 50 ? '...' : '')
        : '';
      return `${role}: "${contentPreview}"`;
    }
    return keys.join(', ') + (Object.keys(value).length > 4 ? '...' : '');
  };

  return (
    <div>
      <div
        className="flex items-center py-0.5 cursor-pointer hover:bg-gray-800/50 rounded"
        style={{ paddingLeft: indent }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="w-4 h-4 flex items-center justify-center mr-1 text-gray-500">
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        {keyName && <span className="text-sky-400">"{keyName}"</span>}
        {keyName && <span className="text-gray-400 mx-1">:</span>}
        <span className="text-gray-400">{bracketOpen}</span>
        {!isExpanded && (
          <>
            <span className="text-gray-500 mx-1 text-xs truncate max-w-md">
              {getCollapsedPreview()}
            </span>
            <span className="text-gray-400">{bracketClose}</span>
          </>
        )}
        {!isExpanded && !isLast && <span className="text-gray-400">,</span>}
      </div>

      {isExpanded && (
        <>
          {entries.map((entry, idx: number) => (
            <JsonNode
              key={entry[0]}
              keyName={isArray ? undefined : String(entry[0])}
              value={entry[1]}
              depth={depth + 1}
              isLast={idx === entries.length - 1}
            />
          ))}
          <div style={{ paddingLeft: indent }}>
            <span className="text-gray-400 ml-5">{bracketClose}</span>
            {!isLast && <span className="text-gray-400">,</span>}
          </div>
        </>
      )}
    </div>
  );
};

// ==================== COLLAPSIBLE JSON SECTION ====================

interface JsonSectionProps {
  data: any;
  title: string;
  icon?: React.ReactNode;
  defaultExpanded?: boolean;
  badge?: string;
  badgeColor?: string;
}

const JsonSection: React.FC<JsonSectionProps> = ({
  data,
  title,
  icon,
  defaultExpanded = true,
  badge,
  badgeColor = 'gray'
}) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [viewMode, setViewMode] = useState<'tree' | 'raw'>('tree');

  const jsonString = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  const stats = useMemo(() => {
    const chars = jsonString.length;
    const tokens = Math.round(chars / 4);
    const lines = jsonString.split('\n').length;
    return { chars, tokens, lines };
  }, [jsonString]);

  // Syntax highlighting for raw view
  const highlightedJson = useMemo(() => {
    return jsonString
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"([^"]+)":/g, '<span class="text-sky-400">"$1"</span>:')
      .replace(/: "([^"]*)"/g, ': <span class="text-emerald-400">"$1"</span>')
      .replace(/: (-?\d+\.?\d*)/g, ': <span class="text-amber-400">$1</span>')
      .replace(/: (true|false)/g, ': <span class="text-violet-400">$1</span>')
      .replace(/: (null)/g, ': <span class="text-rose-400">$1</span>');
  }, [jsonString]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [jsonString]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [jsonString, title]);

  const badgeColors: Record<string, string> = {
    green: 'bg-green-500/20 text-green-400 border-green-500/30',
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    gray: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  };

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden bg-gray-900 mb-3">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 bg-gray-800 border-b border-gray-700 cursor-pointer hover:bg-gray-800/80 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-500">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
          {icon}
          <span className="text-sm font-medium text-gray-200">{title}</span>

          {badge && (
            <span className={`px-1.5 py-0.5 text-[10px] rounded border ${badgeColors[badgeColor]}`}>
              {badge}
            </span>
          )}

          <div className="flex items-center gap-1.5 ml-2">
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-700/50 text-gray-500 border border-gray-600/50">
              {stats.lines} lines
            </span>
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-700/50 text-gray-500 border border-gray-600/50">
              ~{stats.tokens.toLocaleString()} tok
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-700/50 rounded p-0.5 mr-2">
            <button
              onClick={() => setViewMode('tree')}
              className={`px-2 py-0.5 text-[10px] rounded transition-colors ${viewMode === 'tree' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
            >
              Tree
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`px-2 py-0.5 text-[10px] rounded transition-colors ${viewMode === 'raw' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
            >
              Raw
            </button>
          </div>

          <button
            onClick={handleDownload}
            className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
            title="Download JSON"
          >
            <Download size={12} />
          </button>
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
            title="Copy JSON"
          >
            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="overflow-auto max-h-[50vh] bg-gray-900">
          {viewMode === 'tree' ? (
            <div className="p-3 font-mono text-xs">
              <JsonNode value={data} />
            </div>
          ) : (
            <pre
              className="p-3 text-xs font-mono text-gray-300 whitespace-pre overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: highlightedJson }}
            />
          )}
        </div>
      )}
    </div>
  );
};

// ==================== MAIN CONTEXT VIEWER COMPONENT ====================

export const ContextViewer: React.FC<ContextViewerProps> = ({
  messages,
  currentInput = '',
  generationConfig,
  systemPrompt = '',
  ragDebugInfo,
  ragContext = '',
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Build the EXACT API request that will be sent
  const apiRequest = useMemo(() => {
    const apiMessages: Array<{ role: string; content: string }> = [];

    // 1. System message with RAG context embedded
    let fullSystemPrompt = systemPrompt || 'You are a helpful AI assistant.';
    if (ragContext) {
      fullSystemPrompt += `\n\n--- RETRIEVED CONTEXT FROM DOCUMENTS ---\n${ragContext}\n--- END CONTEXT ---`;
    }
    apiMessages.push({ role: 'system', content: fullSystemPrompt });

    // 2. Conversation history
    messages.forEach(msg => {
      apiMessages.push({ role: msg.role, content: msg.content });
    });

    // 3. Current input (if any)
    if (currentInput.trim()) {
      apiMessages.push({ role: 'user', content: currentInput.trim() });
    }

    return {
      model: 'current-model',
      messages: apiMessages,
      temperature: generationConfig.temperature,
      max_tokens: generationConfig.max_tokens,
      top_p: generationConfig.top_p,
      stream: generationConfig.stream
    };
  }, [messages, currentInput, generationConfig, systemPrompt, ragContext]);

  // Token estimates
  const tokenStats = useMemo(() => {
    const totalChars = JSON.stringify(apiRequest).length;
    const totalTokens = Math.round(totalChars / 4);

    const systemChars = apiRequest.messages[0]?.content?.length || 0;
    const systemTokens = Math.round(systemChars / 4);

    const ragChars = ragContext?.length || 0;
    const ragTokens = Math.round(ragChars / 4);

    return {
      total: totalTokens,
      system: systemTokens,
      rag: ragTokens,
      messages: apiRequest.messages.length
    };
  }, [apiRequest, ragContext]);

  // Full debug payload
  const fullDebugPayload = useMemo(() => ({
    _info: "Полный debug payload - содержит API запрос + RAG debug + метаданные",
    timestamp: new Date().toISOString(),
    api_request: apiRequest,
    rag_debug: ragDebugInfo || null,
    token_estimates: tokenStats,
    config: {
      temperature: generationConfig.temperature,
      max_tokens: generationConfig.max_tokens
    }
  }), [apiRequest, ragDebugInfo, tokenStats, generationConfig]);

  const handleCopyAll = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(fullDebugPayload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [fullDebugPayload]);

  const handleDownloadAll = useCallback(() => {
    const blob = new Blob([JSON.stringify(fullDebugPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `full-context-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [fullDebugPayload]);

  const hasContent = messages.length > 0 || currentInput.trim().length > 0;

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={!hasContent}
        className={`p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        title="View full context (JSON)"
      >
        <Eye size={18} />
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="flex items-center justify-center min-h-screen p-4">
            {/* Overlay */}
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-4xl max-h-[90vh] bg-gray-900 rounded-xl shadow-2xl border border-gray-700 flex flex-col overflow-hidden">

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
                <div className="flex items-center gap-3">
                  <Code size={20} className="text-blue-400" />
                  <div>
                    <h2 className="text-base font-semibold text-white">Context Inspector</h2>
                    <p className="text-xs text-gray-400">Полный контекст запроса к AI модели</p>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 px-2 py-1 rounded bg-gray-700/50 text-gray-300">
                      <MessageSquare size={12} />
                      {tokenStats.messages} msgs
                    </span>
                    <span className="flex items-center gap-1 px-2 py-1 rounded bg-gray-700/50 text-gray-300">
                      <Hash size={12} />
                      ~{tokenStats.total.toLocaleString()} tokens
                    </span>
                    {ragContext && (
                      <span className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/20 text-green-400 border border-green-500/30">
                        <Database size={12} />
                        RAG включён
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 border-l border-gray-700 pl-3">
                    <button
                      onClick={handleCopyAll}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs transition-colors"
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? 'Скопировано!' : 'Copy All'}
                    </button>
                    <button
                      onClick={handleDownloadAll}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs transition-colors"
                    >
                      <Download size={12} />
                    </button>
                    <button
                      onClick={() => setIsOpen(false)}
                      className="p-1.5 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition-colors ml-2"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-4">

                {/* SECTION 1: API Request - главное! */}
                <JsonSection
                  data={apiRequest}
                  title="API Request"
                  icon={<Zap size={14} className="text-yellow-400" />}
                  defaultExpanded={true}
                  badge="ОТПРАВЛЯЕТСЯ В МОДЕЛЬ"
                  badgeColor="yellow"
                />

                {/* SECTION 2: RAG Debug (if available) */}
                {ragDebugInfo && (
                  <JsonSection
                    data={ragDebugInfo}
                    title="RAG Debug Info"
                    icon={<Database size={14} className="text-green-400" />}
                    defaultExpanded={false}
                    badge="DEBUG"
                    badgeColor="green"
                  />
                )}

                {/* SECTION 3: Full Payload */}
                <JsonSection
                  data={fullDebugPayload}
                  title="Full Debug Payload"
                  icon={<FileText size={14} className="text-purple-400" />}
                  defaultExpanded={false}
                  badge="ВСЁ ВМЕСТЕ"
                  badgeColor="purple"
                />

              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-gray-700 bg-gray-800/50">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    💡 <strong className="text-gray-400">API Request</strong> — это точный JSON, который отправляется в AI модель.
                    Раскройте <code className="text-sky-400">messages</code> чтобы увидеть полный контекст.
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {new Date().toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
