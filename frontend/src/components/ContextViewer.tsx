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
  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);
  const isEmpty = isObject && Object.keys(value).length === 0;

  // Smart initial expand - COLLAPSED by default for better UX
  const getInitialExpanded = () => {
    // Root object - expanded
    if (depth === 0) return true;
    // Everything else - COLLAPSED (user clicks to expand)
    return false;
  };

  const [isExpanded, setIsExpanded] = useState(getInitialExpanded);
  const [showFullText, setShowFullText] = useState(false);

  const indent = depth * 16;

  // Render primitive values with smart truncation
  const renderValue = (val: any) => {
    if (val === null) return <span className="text-rose-400">null</span>;
    if (typeof val === 'boolean') return <span className="text-violet-400">{String(val)}</span>;
    if (typeof val === 'number') return <span className="text-amber-400">{val}</span>;
    if (typeof val === 'string') {
      // Always truncate long strings for preview
      const isLong = val.length > 100;

      // For long strings - show preview with expand button
      if (isLong && !showFullText) {
        return (
          <div className="inline-flex flex-col gap-1">
            <span className="text-emerald-400">
              "{val.slice(0, 80)}..."
              <span className="text-gray-500 text-xs ml-1">({val.length} chars)</span>
              <button
                onClick={(e) => { e.stopPropagation(); setShowFullText(true); }}
                className="text-xs text-blue-400 hover:text-blue-300 ml-2 px-2 py-0.5 bg-blue-500/10 rounded inline"
              >
                expand
              </button>
            </span>
          </div>
        );
      }

      // Full text (expanded)
      if (isLong && showFullText) {
        return (
          <div className="flex flex-col gap-1 mt-1">
            <pre className="text-emerald-400 whitespace-pre-wrap break-all text-xs bg-gray-800/50 p-2 rounded max-h-[400px] overflow-y-auto border border-gray-700">
              "{val}"
            </pre>
            <button
              onClick={(e) => { e.stopPropagation(); setShowFullText(false); }}
              className="text-xs text-gray-400 hover:text-gray-300 self-start px-2 py-0.5 bg-gray-500/10 rounded"
            >
              collapse
            </button>
          </div>
        );
      }

      return <span className="text-emerald-400">"{val}"</span>;
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
      // For message arrays, show detailed role preview
      if (entries.length > 0 && entries[0][1]?.role) {
        const roles = entries.map(e => e[1]?.role).filter(Boolean);
        const roleCount: Record<string, number> = {};
        roles.forEach(r => { roleCount[r] = (roleCount[r] || 0) + 1; });
        const summary = Object.entries(roleCount).map(([r, c]) => `${c} ${r}`).join(', ');
        return `${entries.length} msgs (${summary})`;
      }
      return `${entries.length} items`;
    }
    // For objects - show type and key preview
    const keys = Object.keys(value);
    if (keys.includes('role') && keys.includes('content')) {
      // This is a message object - show role and content preview
      const role = value.role || '';
      const content = typeof value.content === 'string' ? value.content : '';
      const contentPreview = content.slice(0, 60).replace(/\n/g, ' ') + (content.length > 60 ? '...' : '');
      return `${role}: "${contentPreview}"`;
    }
    // Default - show keys
    const keyPreview = keys.slice(0, 5).join(', ');
    return keyPreview + (keys.length > 5 ? ` +${keys.length - 5} more` : '');
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

// ==================== SYSTEM PROMPT WITH RAG HIGHLIGHTING ====================

interface SystemPromptViewerProps {
  content: string;
  ragContext?: string;
}

const SystemPromptViewer: React.FC<SystemPromptViewerProps> = ({ content }) => {
  const [showFullRag, setShowFullRag] = useState(false);
  const [copied, setCopied] = useState<'base' | 'rag' | null>(null);

  // Parse the system prompt to identify parts
  const parts = useMemo(() => {
    const startMarker = '--- RETRIEVED CONTEXT FROM DOCUMENTS ---';
    const endMarker = '--- END CONTEXT ---';

    const startIdx = content.indexOf(startMarker);
    const endIdx = content.indexOf(endMarker);

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      return {
        basePrompt: content.slice(0, startIdx).trim(),
        ragContent: content.slice(startIdx + startMarker.length, endIdx).trim(),
        afterRag: content.slice(endIdx + endMarker.length).trim(),
        hasRag: true
      };
    }

    // Check alternative RAG marker format
    const altMarker = '📚 ДОКУМЕНТ:';
    const altIdx = content.indexOf(altMarker);
    if (altIdx !== -1) {
      return {
        basePrompt: content.slice(0, altIdx).trim(),
        ragContent: content.slice(altIdx).trim(),
        afterRag: '',
        hasRag: true
      };
    }

    // No RAG content found
    return {
      basePrompt: content,
      ragContent: '',
      afterRag: '',
      hasRag: false
    };
  }, [content]);

  const handleCopy = useCallback((text: string, type: 'base' | 'rag') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const ragTokens = Math.round((parts.ragContent?.length || 0) / 4);
  const baseTokens = Math.round(parts.basePrompt.length / 4);

  return (
    <div className="space-y-3">
      {/* Base System Prompt */}
      <div className="border border-blue-500/30 rounded-lg overflow-hidden bg-blue-950/20">
        <div className="flex items-center justify-between px-3 py-2 bg-blue-900/30 border-b border-blue-500/30">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-blue-400" />
            <span className="text-sm font-medium text-blue-300">Base System Prompt</span>
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
              ~{baseTokens.toLocaleString()} tokens
            </span>
          </div>
          <button
            onClick={() => handleCopy(parts.basePrompt, 'base')}
            className="p-1 rounded hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 transition-colors"
            title="Copy base prompt"
          >
            {copied === 'base' ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
          </button>
        </div>
        <pre className="p-3 text-xs font-mono text-blue-200 whitespace-pre-wrap max-h-[200px] overflow-y-auto">
          {parts.basePrompt || '(empty)'}
        </pre>
      </div>

      {/* RAG Context - highlighted! */}
      {parts.hasRag && (
        <div className="border border-green-500/40 rounded-lg overflow-hidden bg-green-950/30 ring-2 ring-green-500/20">
          <div className="flex items-center justify-between px-3 py-2 bg-green-900/40 border-b border-green-500/40">
            <div className="flex items-center gap-2">
              <Database size={14} className="text-green-400" />
              <span className="text-sm font-medium text-green-300">📚 RAG Context</span>
              <span className="px-1.5 py-0.5 text-[10px] rounded bg-green-500/30 text-green-200 border border-green-500/40 animate-pulse">
                RETRIEVED FROM DOCUMENTS
              </span>
              <span className="px-1.5 py-0.5 text-[10px] rounded bg-green-500/20 text-green-300 border border-green-500/30">
                ~{ragTokens.toLocaleString()} tokens
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowFullRag(!showFullRag)}
                className="px-2 py-0.5 text-[10px] rounded bg-green-500/20 text-green-300 hover:bg-green-500/30 transition-colors"
              >
                {showFullRag ? 'Collapse' : 'Expand'}
              </button>
              <button
                onClick={() => handleCopy(parts.ragContent, 'rag')}
                className="p-1 rounded hover:bg-green-500/20 text-green-400 hover:text-green-300 transition-colors"
                title="Copy RAG context"
              >
                {copied === 'rag' ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          <div className="relative">
            {/* RAG content preview or full */
              <pre className={`p-3 text-xs font-mono text-green-200 whitespace-pre-wrap overflow-y-auto ${showFullRag ? 'max-h-[400px]' : 'max-h-[120px]'
                }`}>
                {parts.ragContent}
              </pre>}

            {/* Gradient overlay when collapsed */}
            {!showFullRag && parts.ragContent.length > 300 && (
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-green-950/90 to-transparent flex items-end justify-center pb-2">
                <button
                  onClick={() => setShowFullRag(true)}
                  className="px-3 py-1 text-[11px] rounded bg-green-500/30 text-green-200 hover:bg-green-500/40 transition-colors border border-green-500/40"
                >
                  Show full RAG context ({parts.ragContent.length} chars)
                </button>
              </div>
            )}
          </div>

          {/* Info footer */}
          <div className="px-3 py-1.5 bg-green-900/20 border-t border-green-500/30 text-[10px] text-green-400">
            💡 Этот контекст был извлечён из загруженных документов на основе вашего запроса
          </div>
        </div>
      )}

      {/* After RAG content (if any) */}
      {parts.afterRag && (
        <div className="border border-gray-600/30 rounded-lg overflow-hidden bg-gray-800/30">
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-700/30 border-b border-gray-600/30">
            <FileText size={14} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-300">Additional Instructions</span>
          </div>
          <pre className="p-3 text-xs font-mono text-gray-300 whitespace-pre-wrap max-h-[100px] overflow-y-auto">
            {parts.afterRag}
          </pre>
        </div>
      )}

      {/* No RAG indicator */}
      {!parts.hasRag && (
        <div className="border border-gray-600/30 rounded-lg px-3 py-2 bg-gray-800/20 text-xs text-gray-500 flex items-center gap-2">
          <Database size={14} />
          <span>No RAG context in this prompt</span>
        </div>
      )}
    </div>
  );
};

// ==================== SYSTEM PROMPT SECTION (Collapsible) ====================

interface SystemPromptSectionProps {
  systemContent: string;
  defaultExpanded?: boolean;
}

const SystemPromptSection: React.FC<SystemPromptSectionProps> = ({
  systemContent,
  defaultExpanded = true
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  // Check if has RAG
  const hasRag = systemContent.includes('--- RETRIEVED CONTEXT FROM DOCUMENTS ---') ||
    systemContent.includes('📚 ДОКУМЕНТ:');

  const totalTokens = Math.round(systemContent.length / 4);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(systemContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [systemContent]);

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
          <MessageSquare size={14} className="text-cyan-400" />
          <span className="text-sm font-medium text-gray-200">System Prompt</span>

          {hasRag && (
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-green-500/20 text-green-400 border border-green-500/30 animate-pulse">
              + RAG CONTEXT
            </span>
          )}

          <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-700/50 text-gray-500 border border-gray-600/50">
            ~{totalTokens.toLocaleString()} tokens
          </span>
        </div>

        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
            title="Copy full system prompt"
          >
            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-3 overflow-auto max-h-[60vh]">
          <SystemPromptViewer content={systemContent} />
        </div>
      )}
    </div>
  );
};

// ==================== MAIN CONTEXT VIEWER COMPONENT ====================

// Helper function to extract RAG context from system message
const extractRagContextFromSystemMessage = (content: string): string => {
  const startMarker = '--- RETRIEVED CONTEXT FROM DOCUMENTS ---';
  const endMarker = '--- END CONTEXT ---';

  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return content.slice(startIdx + startMarker.length, endIdx).trim();
  }

  // Try alternative marker format
  const altStartMarker = '📚 ДОКУМЕНТ:';
  const altStartIdx = content.indexOf(altStartMarker);
  if (altStartIdx !== -1) {
    // Return everything from marker to end (or to end context marker if present)
    return content.slice(altStartIdx).trim();
  }

  return '';
};

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

  // Find RAG context from various sources
  const effectiveRagContext = useMemo(() => {
    // 1. Use provided ragContext prop if available
    if (ragContext && ragContext.trim()) {
      return ragContext;
    }

    // 2. Try to extract from ragDebugInfo
    if (ragDebugInfo?.context?.context_text) {
      return ragDebugInfo.context.context_text;
    }

    // 3. Try to extract from last assistant message's meta
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant?.meta?.rag_context_full) {
      return lastAssistant.meta.rag_context_full as string;
    }

    // 4. Try to extract from system_prompt_full in last assistant message meta
    const systemPromptFull = lastAssistant?.meta?.system_prompt_full as string | undefined;
    if (systemPromptFull && systemPromptFull.includes('--- RETRIEVED CONTEXT FROM DOCUMENTS ---')) {
      return extractRagContextFromSystemMessage(systemPromptFull);
    }

    // 5. Try to extract from system prompt prop if it already contains RAG context
    if (systemPrompt && systemPrompt.includes('--- RETRIEVED CONTEXT FROM DOCUMENTS ---')) {
      return extractRagContextFromSystemMessage(systemPrompt);
    }

    return '';
  }, [ragContext, ragDebugInfo, messages, systemPrompt]);

  // Find the full system prompt (with RAG context) from various sources
  const effectiveSystemPrompt = useMemo(() => {
    // 1. Try to get full system prompt from last assistant message's meta
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant?.meta?.system_prompt_full) {
      return lastAssistant.meta.system_prompt_full as string;
    }

    // 2. Use the provided system prompt as base
    let basePrompt = systemPrompt || 'You are a helpful AI assistant.';

    // 3. If we have RAG context and system prompt doesn't already contain it, add it
    const systemAlreadyHasRag = basePrompt.includes('--- RETRIEVED CONTEXT FROM DOCUMENTS ---') ||
      basePrompt.includes('📚 ДОКУМЕНТ:');

    if (effectiveRagContext && !systemAlreadyHasRag) {
      basePrompt += `\n\n--- RETRIEVED CONTEXT FROM DOCUMENTS ---\n${effectiveRagContext}\n--- END CONTEXT ---`;
    }

    return basePrompt;
  }, [systemPrompt, effectiveRagContext, messages]);

  // Build the EXACT API request that will be sent
  const apiRequest = useMemo(() => {
    const apiMessages: Array<{
      role: string;
      content: string;
      _rag_injected?: boolean;
      _content_breakdown?: {
        base_system_prompt: string;
        rag_context?: string;
        rag_context_tokens?: number;
        rag_context_chars?: number;
        detection_method?: string | null;
        after_rag?: string;
      };
    }> = [];

    // Parse system prompt to identify RAG parts
    const parseSystemPrompt = (content: string) => {
      // Method 1: Standard RAG markers
      const startMarker = '--- RETRIEVED CONTEXT FROM DOCUMENTS ---';
      const endMarker = '--- END CONTEXT ---';
      const startIdx = content.indexOf(startMarker);
      const endIdx = content.indexOf(endMarker);

      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        return {
          basePrompt: content.slice(0, startIdx).trim(),
          ragContent: content.slice(startIdx + startMarker.length, endIdx).trim(),
          afterRag: content.slice(endIdx + endMarker.length).trim(),
          hasRag: true,
          markerType: 'standard'
        };
      }

      // Method 2: Task + Chapter markers (📝 ЗАДАЧА + 📖 ГЛАВА)
      const taskMarker = '📝 ЗАДАЧА:';
      const chapterMarker = '📖 ГЛАВА';
      const taskIdx = content.indexOf(taskMarker);
      const chapterIdx = content.indexOf(chapterMarker);
      
      if (taskIdx !== -1 || chapterIdx !== -1) {
        // Find the earliest RAG marker
        const ragStartIdx = taskIdx !== -1 ? taskIdx : chapterIdx;
        return {
          basePrompt: content.slice(0, ragStartIdx).trim(),
          ragContent: content.slice(ragStartIdx).trim(),
          afterRag: '',
          hasRag: true,
          markerType: 'task_chapter'
        };
      }

      // Method 3: Alternative document marker
      const altMarker = '📚 ДОКУМЕНТ:';
      const altIdx = content.indexOf(altMarker);
      if (altIdx !== -1) {
        return {
          basePrompt: content.slice(0, altIdx).trim(),
          ragContent: content.slice(altIdx).trim(),
          afterRag: '',
          hasRag: true,
          markerType: 'document'
        };
      }

      // Method 4: Check for any injected document content (heuristic)
      // Look for patterns like "ГЛАВА", "Глава N:", numbered sections, etc.
      const docPatterns = [
        /\n\nГЛАВА\s+\d+/i,
        /\n\n(Раздел|Статья|Пункт)\s+\d+/i,
        /\n\n[А-Я][а-я]+\s+\d+\.\s/
      ];
      
      for (const pattern of docPatterns) {
        const match = content.match(pattern);
        if (match && match.index !== undefined && match.index > 50) {
          // Found document content after some base prompt
          return {
            basePrompt: content.slice(0, match.index).trim(),
            ragContent: content.slice(match.index).trim(),
            afterRag: '',
            hasRag: true,
            markerType: 'heuristic'
          };
        }
      }

      return { basePrompt: content, ragContent: '', afterRag: '', hasRag: false, markerType: null };
    };

    const parsed = parseSystemPrompt(effectiveSystemPrompt);

    // 1. System message with structured breakdown
    // If RAG is present, replace RAG content in `content` with placeholder to avoid duplication
    let displayContent = effectiveSystemPrompt;
    if (parsed.hasRag && parsed.ragContent) {
      // Replace RAG content with a placeholder in the displayed content
      displayContent = displayContent.replace(
        parsed.ragContent,
        `[📚 RAG CONTEXT: ${parsed.ragContent.length} chars / ~${Math.round(parsed.ragContent.length / 4)} tokens — см. _content_breakdown.rag_context]`
      );
    }

    const systemMessage: typeof apiMessages[0] = {
      role: 'system',
      content: displayContent
    };

    // Add breakdown metadata if RAG is present
    if (parsed.hasRag) {
      systemMessage._rag_injected = true;
      systemMessage._content_breakdown = {
        base_system_prompt: parsed.basePrompt,
        rag_context: parsed.ragContent,
        rag_context_tokens: Math.round(parsed.ragContent.length / 4),
        rag_context_chars: parsed.ragContent.length,
        detection_method: parsed.markerType,
        ...(parsed.afterRag ? { after_rag: parsed.afterRag } : {})
      };
    }

    apiMessages.push(systemMessage);

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
      stream: generationConfig.stream,
      // Top-level RAG indicator
      _rag_context_included: parsed.hasRag,
      ...(parsed.hasRag ? {
        _rag_summary: {
          rag_tokens: Math.round(parsed.ragContent.length / 4),
          base_prompt_tokens: Math.round(parsed.basePrompt.length / 4),
          total_system_tokens: Math.round(effectiveSystemPrompt.length / 4)
        }
      } : {})
    };
  }, [messages, currentInput, generationConfig, effectiveSystemPrompt]);

  // Token estimates
  const tokenStats = useMemo(() => {
    const totalChars = JSON.stringify(apiRequest).length;
    const totalTokens = Math.round(totalChars / 4);

    const systemChars = apiRequest.messages[0]?.content?.length || 0;
    const systemTokens = Math.round(systemChars / 4);

    // Calculate RAG tokens from effective context (either from prop or extracted)
    const ragChars = effectiveRagContext?.length || 0;
    const ragTokens = Math.round(ragChars / 4);

    return {
      total: totalTokens,
      system: systemTokens,
      rag: ragTokens,
      messages: apiRequest.messages.length
    };
  }, [apiRequest, effectiveRagContext]);

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
                    {effectiveRagContext && (
                      <span className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/20 text-green-400 border border-green-500/30">
                        <Database size={12} />
                        RAG ({Math.round(effectiveRagContext.length / 4).toLocaleString()} tok)
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

                {/* SECTION 4: System Prompt with RAG Highlighting */}
                <div className="border border-gray-700 rounded-lg overflow-hidden bg-gray-900 mb-3">
                  <div className="flex items-center justify-between px-3 py-2.5 bg-gray-800 border-b border-gray-700">
                    <div className="flex items-center gap-2">
                      <MessageSquare size={14} className="text-blue-400" />
                      <span className="text-sm font-medium text-gray-200">System Prompt with RAG Highlighting</span>
                    </div>
                  </div>
                  <div className="p-3">
                    <SystemPromptViewer content={effectiveSystemPrompt} ragContext={effectiveRagContext} />
                  </div>
                </div>

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
