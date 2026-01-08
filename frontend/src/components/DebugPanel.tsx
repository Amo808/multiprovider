/**
 * DebugPanel - компонент для отображения debug информации RAG pipeline в стиле n8n
 * Показывает все этапы обработки запроса с раскрываемыми секциями
 * Включает JSON редактор и превью контекста
 * 
 * Основные режимы:
 * - Pipeline: пошаговое отображение RAG этапов
 * - Context: полная разбивка контекста (что отправляется в API)
 * - API: полный JSON payload для API
 * - JSON: полный debug JSON
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    ChevronRight,
    ChevronDown,
    Copy,
    Check,
    Brain,
    FileText,
    Search,
    FileCode,
    Edit,
    Send,
    MessageSquare,
    BarChart3,
    ArrowRight,
    Book,
    Clock,
    Zap,
    Eye,
    Code,
    Download,
    Maximize2,
    Minimize2,
    Layers,
    Database,
    History,
    Settings,
    CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ==================== TYPES ====================

interface IntentAnalysis {
    original_query: string;
    detected_scope: string;
    detected_sections: string[];
    detected_task: string;
    reasoning: string;
    tokens_used: number;
    latency_ms: number;
}

interface DocumentStructure {
    document_id: string;
    document_name: string;
    total_chunks: number;
    detected_chapters: Array<{
        number: string;
        title: string;
        start_chunk: number;
        end_chunk: number;
    }>;
    detected_structure_type: string;
}

interface RetrievalInfo {
    strategy_used: string;
    techniques_applied: string[];
    generated_queries: string[];
    hypothetical_document: string;
    agent_iterations: Array<{
        query: string;
        results_count: number;
    }>;
    step_back_query: string;
    latency_ms: number;
}

interface ChunkItem {
    chunk_index: number;
    document_id: string;
    document_name: string;
    chapter: string;
    similarity_score: number;
    rerank_score: number | null;
    content_preview: string;
    full_content: string;
    metadata: Record<string, any>;
}

interface ChunksInfo {
    total_retrieved: number;
    total_chars: number;
    estimated_tokens: number;
    items: ChunkItem[];
}

interface ContextBuilding {
    raw_context_chars: number;
    final_context_chars: number;
    compression_applied: boolean;
    compression_ratio: number;
    context_preview: string;
    full_context?: string;  // полный контекст для API Request debug
}

interface ModelMessage {
    role: string;
    content: string;
    content_preview: string;
}

interface ModelRequest {
    model: string;
    messages: ModelMessage[];
    temperature: number;
    max_tokens: number;
    total_input_tokens: number;
    total_input_chars: number;
    full_json: Record<string, any>;
}

interface TokenUsage {
    input: number;
    output: number;
    reasoning: number;
    total: number;
}

interface ModelResponse {
    content: string;
    content_preview: string;
    tokens_used: TokenUsage;
    latency_ms: number;
    model_used: string;
    finish_reason: string;
}

interface Summary {
    total_tokens: number;
    total_cost_usd: number;
    total_latency_ms: number;
    rag_overhead_ms: number;
    model_latency_ms: number;
}

interface RAGPipeline {
    intent_analysis: IntentAnalysis;
    document_structure: DocumentStructure;
    retrieval: RetrievalInfo;
    chunks: ChunksInfo;
    context_building: ContextBuilding;
}

interface InputInfo {
    user_message: string;
    conversation_id: string;
    model: string;
    rag_enabled: boolean;
    rag_mode: string;
    memory_mode: string;
}

export interface RequestDebugInfo {
    timestamp: string;
    request_id: string;
    input: InputInfo;
    rag_pipeline: RAGPipeline;
    model_request: ModelRequest;
    model_response: ModelResponse;
    summary: Summary;
}

interface DebugPanelProps {
    debugInfo: RequestDebugInfo | null;
    isOpen: boolean;
    onClose: () => void;
}

// ==================== HELPER COMPONENTS ====================

// Tab types for main view switching
type MainViewTab = 'pipeline' | 'context' | 'api' | 'json';

// Tab button component
const ViewTabButton: React.FC<{
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    badge?: string | number;
}> = ({ active, onClick, icon, label, badge }) => (
    <button
        onClick={onClick}
        className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-all border",
            active
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "hover:bg-muted text-muted-foreground border-transparent hover:border-border"
        )}
    >
        {icon}
        <span className="font-medium">{label}</span>
        {badge !== undefined && (
            <Badge variant={active ? "secondary" : "outline"} className="ml-1 text-xs">
                {badge}
            </Badge>
        )}
    </button>
);

// Enhanced JSON Viewer with syntax highlighting
const JsonViewer: React.FC<{
    data: any;
    maxHeight?: string;
    title?: string;
    showToolbar?: boolean;
}> = ({ data, maxHeight = "300px", title, showToolbar = true }) => {
    const [copied, setCopied] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const jsonString = useMemo(() => {
        try {
            return JSON.stringify(data, null, 2);
        } catch {
            return String(data);
        }
    }, [data]);

    // Simple syntax highlighting
    const highlightedJson = useMemo(() => {
        return jsonString
            .replace(/"([^"]+)":/g, '<span class="text-blue-400">"$1"</span>:')
            .replace(/: "([^"]*)"(,?)/g, ': <span class="text-green-400">"$1"</span>$2')
            .replace(/: (\d+)(,?)/g, ': <span class="text-orange-400">$1</span>$2')
            .replace(/: (true|false)(,?)/g, ': <span class="text-purple-400">$1</span>$2')
            .replace(/: (null)(,?)/g, ': <span class="text-red-400">$1</span>$2');
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
        a.download = `${title || 'debug'}-${new Date().toISOString().slice(0, 19)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [jsonString, title]);

    const stats = useMemo(() => {
        const chars = jsonString.length;
        const tokens = Math.round(chars / 4);
        const lines = jsonString.split('\n').length;
        return { chars, tokens, lines };
    }, [jsonString]);

    return (
        <div className="relative border rounded-lg overflow-hidden bg-zinc-900">
            {showToolbar && (
                <div className="flex items-center justify-between px-3 py-2 bg-zinc-800 border-b border-zinc-700">
                    <div className="flex items-center gap-2">
                        {title && <span className="text-sm font-medium text-zinc-300">{title}</span>}
                        <Badge variant="outline" className="text-xs bg-zinc-700 border-zinc-600">
                            {stats.lines} lines
                        </Badge>
                        <Badge variant="outline" className="text-xs bg-zinc-700 border-zinc-600">
                            ~{stats.tokens.toLocaleString()} tokens
                        </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-zinc-400 hover:text-zinc-100"
                            onClick={() => setExpanded(!expanded)}
                            title={expanded ? "Collapse" : "Expand"}
                        >
                            {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-zinc-400 hover:text-zinc-100"
                            onClick={handleDownload}
                            title="Download JSON"
                        >
                            <Download className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-zinc-400 hover:text-zinc-100"
                            onClick={handleCopy}
                            title="Copy JSON"
                        >
                            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </Button>
                    </div>
                </div>
            )}
            <pre
                className="p-3 text-xs overflow-auto font-mono text-zinc-300"
                style={{ maxHeight: expanded ? '80vh' : maxHeight }}
                dangerouslySetInnerHTML={{ __html: highlightedJson }}
            />
        </div>
    );
};

interface CollapsibleSectionProps {
    title: string;
    icon: React.ReactNode;
    badge?: string | number;
    badgeVariant?: "default" | "secondary" | "destructive" | "outline";
    children: React.ReactNode;
    defaultOpen?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
    title,
    icon,
    badge,
    badgeVariant = "secondary",
    children,
    defaultOpen = false,
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-lg mb-2">
            <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        {icon}
                        <span className="font-medium">{title}</span>
                    </div>
                    {badge !== undefined && (
                        <Badge variant={badgeVariant}>{badge}</Badge>
                    )}
                </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="px-3 pb-3 pt-0">
                    {children}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
};

// ==================== SECTION COMPONENTS ====================

const InputSection: React.FC<{ input: InputInfo }> = ({ input }) => (
    <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Сообщение:</span>
            <span className="font-mono bg-muted px-2 py-1 rounded text-xs">
                {input.user_message?.slice(0, 100)}{input.user_message?.length > 100 ? '...' : ''}
            </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
            <div>
                <span className="text-muted-foreground">Модель:</span>{' '}
                <Badge variant="outline">{input.model || 'N/A'}</Badge>
            </div>
            <div>
                <span className="text-muted-foreground">RAG режим:</span>{' '}
                <Badge variant="secondary">{input.rag_mode || 'auto'}</Badge>
            </div>
            <div>
                <span className="text-muted-foreground">Память:</span>{' '}
                <Badge variant="outline">{input.memory_mode || 'M'}</Badge>
            </div>
            <div>
                <span className="text-muted-foreground">RAG:</span>{' '}
                <Badge variant={input.rag_enabled ? "default" : "destructive"}>
                    {input.rag_enabled ? 'Вкл' : 'Выкл'}
                </Badge>
            </div>
        </div>
    </div>
);

const IntentSection: React.FC<{ intent: IntentAnalysis }> = ({ intent }) => (
    <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
            <div>
                <span className="text-muted-foreground">Scope:</span>{' '}
                <Badge>{intent.detected_scope || 'search'}</Badge>
            </div>
            <div>
                <span className="text-muted-foreground">Task:</span>{' '}
                <Badge variant="secondary">{intent.detected_task || 'search'}</Badge>
            </div>
        </div>

        {intent.detected_sections?.length > 0 && (
            <div>
                <span className="text-muted-foreground">Секции:</span>{' '}
                {intent.detected_sections.map((s, i) => (
                    <Badge key={i} variant="outline" className="ml-1">{s}</Badge>
                ))}
            </div>
        )}

        {intent.reasoning && (
            <div className="bg-muted p-2 rounded text-xs">
                <span className="text-muted-foreground">Рассуждение:</span>{' '}
                {intent.reasoning}
            </div>
        )}

        <div className="flex gap-4 text-xs text-muted-foreground">
            <span>⏱️ {intent.latency_ms || 0}ms</span>
            <span>🔢 {intent.tokens_used || 0} токенов</span>
        </div>
    </div>
);

const DocumentStructureSection: React.FC<{ structure: DocumentStructure }> = ({ structure }) => (
    <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
            <div>
                <span className="text-muted-foreground">Документ:</span>{' '}
                <span className="font-medium">{structure.document_name || 'N/A'}</span>
            </div>
            <div>
                <span className="text-muted-foreground">Тип:</span>{' '}
                <Badge variant="outline">{structure.detected_structure_type || 'unknown'}</Badge>
            </div>
        </div>

        <div>
            <span className="text-muted-foreground">Всего чанков:</span>{' '}
            <Badge variant="secondary">{structure.total_chunks || 0}</Badge>
        </div>

        {structure.detected_chapters?.length > 0 && (
            <div>
                <span className="text-muted-foreground block mb-1">Главы ({structure.detected_chapters.length}):</span>
                <div className="max-h-32 overflow-y-auto bg-muted rounded p-2">
                    {structure.detected_chapters.slice(0, 10).map((ch, i) => (
                        <div key={i} className="text-xs py-0.5">
                            <Badge variant="outline" className="mr-1">{ch.number}</Badge>
                            {ch.title && <span>{ch.title}</span>}
                            <span className="text-muted-foreground ml-2">
                                (chunks {ch.start_chunk}-{ch.end_chunk})
                            </span>
                        </div>
                    ))}
                    {structure.detected_chapters.length > 10 && (
                        <div className="text-xs text-muted-foreground">
                            ...и ещё {structure.detected_chapters.length - 10}
                        </div>
                    )}
                </div>
            </div>
        )}
    </div>
);

const RetrievalSection: React.FC<{ retrieval: RetrievalInfo }> = ({ retrieval }) => (
    <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Стратегия:</span>{' '}
            <Badge>{retrieval.strategy_used || 'auto'}</Badge>
        </div>

        {retrieval.techniques_applied?.length > 0 && (
            <div>
                <span className="text-muted-foreground">Техники:</span>{' '}
                {retrieval.techniques_applied.map((t, i) => (
                    <Badge key={i} variant="secondary" className="ml-1">{t}</Badge>
                ))}
            </div>
        )}

        {retrieval.generated_queries?.length > 0 && (
            <div>
                <span className="text-muted-foreground block mb-1">Сгенерированные запросы:</span>
                <div className="bg-muted rounded p-2 space-y-1">
                    {retrieval.generated_queries.map((q, i) => (
                        <div key={i} className="text-xs font-mono">• {q}</div>
                    ))}
                </div>
            </div>
        )}

        {retrieval.step_back_query && (
            <div>
                <span className="text-muted-foreground">Step-back запрос:</span>{' '}
                <span className="font-mono text-xs">{retrieval.step_back_query}</span>
            </div>
        )}

        {retrieval.hypothetical_document && (
            <div>
                <span className="text-muted-foreground block mb-1">HyDE документ:</span>
                <div className="bg-muted rounded p-2 text-xs max-h-24 overflow-y-auto">
                    {retrieval.hypothetical_document}
                </div>
            </div>
        )}

        {retrieval.agent_iterations?.length > 0 && (
            <div>
                <span className="text-muted-foreground block mb-1">Итерации агента:</span>
                <div className="space-y-1">
                    {retrieval.agent_iterations.map((it, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                            <Badge variant="outline">{i + 1}</Badge>
                            <span>{it.query}</span>
                            <Badge variant="secondary">{it.results_count} результатов</Badge>
                        </div>
                    ))}
                </div>
            </div>
        )}

        <div className="text-xs text-muted-foreground">
            ⏱️ {retrieval.latency_ms || 0}ms
        </div>
    </div>
);

const ChunksSection: React.FC<{ chunks: ChunksInfo }> = ({ chunks }) => {
    const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set());

    const toggleChunk = (index: number) => {
        setExpandedChunks(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    return (
        <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2">
                <div>
                    <span className="text-muted-foreground">Найдено:</span>{' '}
                    <Badge>{chunks.total_retrieved || 0}</Badge>
                </div>
                <div>
                    <span className="text-muted-foreground">Символов:</span>{' '}
                    <Badge variant="secondary">{(chunks.total_chars || 0).toLocaleString()}</Badge>
                </div>
                <div>
                    <span className="text-muted-foreground">Токенов:</span>{' '}
                    <Badge variant="outline">~{(chunks.estimated_tokens || 0).toLocaleString()}</Badge>
                </div>
            </div>

            {chunks.items?.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                    {chunks.items.map((chunk, i) => (
                        <div key={i} className="border rounded p-2">
                            <div
                                className="flex items-center justify-between cursor-pointer"
                                onClick={() => toggleChunk(i)}
                            >
                                <div className="flex items-center gap-2">
                                    {expandedChunks.has(i) ?
                                        <ChevronDown className="w-3 h-3" /> :
                                        <ChevronRight className="w-3 h-3" />
                                    }
                                    <Badge variant="outline" className="text-xs">#{chunk.chunk_index}</Badge>
                                    <span className="text-xs text-muted-foreground">{chunk.document_name}</span>
                                    {chunk.chapter && (
                                        <Badge variant="secondary" className="text-xs">Гл. {chunk.chapter}</Badge>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                        sim: {chunk.similarity_score?.toFixed(3)}
                                    </span>
                                    {chunk.rerank_score !== null && (
                                        <span className="text-xs text-muted-foreground">
                                            rank: {chunk.rerank_score?.toFixed(1)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className={cn(
                                "mt-2 text-xs bg-muted rounded p-2 font-mono",
                                expandedChunks.has(i) ? "" : "max-h-16 overflow-hidden"
                            )}>
                                {expandedChunks.has(i) ? chunk.full_content : chunk.content_preview}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const ContextBuildingSection: React.FC<{ context: ContextBuilding }> = ({ context }) => (
    <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
            <div>
                <span className="text-muted-foreground">Исходный размер:</span>{' '}
                <Badge variant="outline">{(context.raw_context_chars || 0).toLocaleString()} симв.</Badge>
            </div>
            <div>
                <span className="text-muted-foreground">Финальный размер:</span>{' '}
                <Badge>{(context.final_context_chars || 0).toLocaleString()} симв.</Badge>
            </div>
        </div>

        <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Сжатие:</span>{' '}
            <Badge variant={context.compression_applied ? "default" : "secondary"}>
                {context.compression_applied ? 'Да' : 'Нет'}
            </Badge>
            {context.compression_applied && (
                <span className="text-xs text-muted-foreground">
                    (ratio: {context.compression_ratio?.toFixed(2) || 1}x)
                </span>
            )}
        </div>

        {context.context_preview && (
            <div>
                <span className="text-muted-foreground block mb-1">Превью контекста:</span>
                <div className="bg-muted rounded p-2 text-xs max-h-32 overflow-y-auto font-mono">
                    {context.context_preview}
                </div>
            </div>
        )}
    </div>
);

const ModelRequestSection: React.FC<{ request: ModelRequest }> = ({ request }) => (
    <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
            <div>
                <span className="text-muted-foreground">Модель:</span>{' '}
                <Badge>{request.model || 'N/A'}</Badge>
            </div>
            <div>
                <span className="text-muted-foreground">Температура:</span>{' '}
                <Badge variant="outline">{request.temperature || 0.7}</Badge>
            </div>
            <div>
                <span className="text-muted-foreground">Макс. токенов:</span>{' '}
                <Badge variant="secondary">{(request.max_tokens || 0).toLocaleString()}</Badge>
            </div>
            <div>
                <span className="text-muted-foreground">Input токенов:</span>{' '}
                <Badge>~{(request.total_input_tokens || 0).toLocaleString()}</Badge>
            </div>
        </div>

        {request.messages?.length > 0 && (
            <div>
                <span className="text-muted-foreground block mb-1">
                    Сообщения ({request.messages.length}):
                </span>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                    {request.messages.map((msg, i) => (
                        <div key={i} className="border rounded p-2">
                            <Badge variant={msg.role === 'system' ? 'default' : msg.role === 'user' ? 'secondary' : 'outline'}>
                                {msg.role}
                            </Badge>
                            <div className="mt-1 text-xs bg-muted rounded p-2 max-h-24 overflow-y-auto font-mono">
                                {msg.content_preview || msg.content?.slice(0, 300)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {Object.keys(request.full_json || {}).length > 0 && (
            <Collapsible>
                <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full">
                        <FileCode className="w-4 h-4 mr-2" />
                        Полный JSON запроса
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                    <JsonViewer data={request.full_json} maxHeight="200px" />
                </CollapsibleContent>
            </Collapsible>
        )}
    </div>
);

const ModelResponseSection: React.FC<{ response: ModelResponse }> = ({ response }) => (
    <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
            <div>
                <span className="text-muted-foreground">Модель:</span>{' '}
                <Badge>{response.model_used || 'N/A'}</Badge>
            </div>
            <div>
                <span className="text-muted-foreground">Завершение:</span>{' '}
                <Badge variant={response.finish_reason === 'stop' ? 'default' : 'secondary'}>
                    {response.finish_reason || 'N/A'}
                </Badge>
            </div>
        </div>

        <div className="flex gap-2 flex-wrap">
            <Badge variant="outline">
                ⬇️ Input: {(response.tokens_used?.input || 0).toLocaleString()}
            </Badge>
            <Badge variant="outline">
                ⬆️ Output: {(response.tokens_used?.output || 0).toLocaleString()}
            </Badge>
            {response.tokens_used?.reasoning > 0 && (
                <Badge variant="outline">
                    🧠 Reasoning: {response.tokens_used.reasoning.toLocaleString()}
                </Badge>
            )}
            <Badge>
                Σ Total: {(response.tokens_used?.total || 0).toLocaleString()}
            </Badge>
        </div>

        <div className="text-xs text-muted-foreground">
            ⏱️ {response.latency_ms || 0}ms
        </div>

        {response.content_preview && (
            <div>
                <span className="text-muted-foreground block mb-1">Превью ответа:</span>
                <div className="bg-muted rounded p-2 text-xs max-h-32 overflow-y-auto">
                    {response.content_preview}
                </div>
            </div>
        )}
    </div>
);

// ==================== CONTEXT PREVIEW COMPONENT ====================
// Shows exactly what will be sent to the AI model with full breakdown

interface ContextPreviewProps {
    modelRequest: ModelRequest;
    ragPipeline: RAGPipeline;
    input: InputInfo;
}

const ContextPreviewSection: React.FC<ContextPreviewProps> = ({ modelRequest, ragPipeline, input }) => {
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['system']));

    const toggleSection = (section: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(section)) {
                next.delete(section);
            } else {
                next.add(section);
            }
            return next;
        });
    };

    // Calculate stats for each message type
    const messageStats = useMemo(() => {
        const messages = modelRequest?.messages || [];
        const stats = {
            system: { count: 0, chars: 0, tokens: 0, content: '' },
            user: { count: 0, chars: 0, tokens: 0, messages: [] as string[] },
            assistant: { count: 0, chars: 0, tokens: 0, messages: [] as string[] },
            total: { chars: 0, tokens: 0 }
        };

        messages.forEach((msg: ModelMessage) => {
            const content = msg.content || '';
            const chars = content.length;
            const tokens = Math.round(chars / 4);

            if (msg.role === 'system') {
                stats.system.count++;
                stats.system.chars += chars;
                stats.system.tokens += tokens;
                stats.system.content = content;
            } else if (msg.role === 'user') {
                stats.user.count++;
                stats.user.chars += chars;
                stats.user.tokens += tokens;
                stats.user.messages.push(content);
            } else if (msg.role === 'assistant') {
                stats.assistant.count++;
                stats.assistant.chars += chars;
                stats.assistant.tokens += tokens;
                stats.assistant.messages.push(content);
            }

            stats.total.chars += chars;
            stats.total.tokens += tokens;
        });

        return stats;
    }, [modelRequest?.messages]);

    // Parse system prompt to identify RAG context
    const systemPromptParts = useMemo(() => {
        const content = messageStats.system.content;
        if (!content) return { instruction: '', ragContext: '', other: '' };

        // Try to find RAG context markers
        const ragMarkers = [
            '--- START CONTEXT ---',
            '---CONTEXT---',
            '<context>',
            'RELEVANT INFORMATION:',
            'Based on the following context',
        ];

        let ragContext = '';
        let instruction = content;

        for (const marker of ragMarkers) {
            const idx = content.indexOf(marker);
            if (idx !== -1) {
                instruction = content.slice(0, idx).trim();
                ragContext = content.slice(idx).trim();
                break;
            }
        }

        return { instruction, ragContext, other: '' };
    }, [messageStats.system.content]);

    const ragContextChars = ragPipeline?.context_building?.final_context_chars || 0;
    const ragContextTokens = Math.round(ragContextChars / 4);

    return (
        <div className="space-y-4">
            {/* Overview Stats */}
            <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg p-4 border">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Eye className="w-4 h-4" />
                        Что отправляется в модель
                    </h3>
                    <Badge variant="outline" className="text-xs">
                        {modelRequest?.model || 'N/A'}
                    </Badge>
                </div>
                <div className="grid grid-cols-4 gap-3 text-center">
                    <div className="bg-background/50 rounded p-2">
                        <div className="text-lg font-bold text-blue-500">
                            {messageStats.total.tokens.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">Input токенов</div>
                    </div>
                    <div className="bg-background/50 rounded p-2">
                        <div className="text-lg font-bold text-green-500">
                            {messageStats.total.chars.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">Символов</div>
                    </div>
                    <div className="bg-background/50 rounded p-2">
                        <div className="text-lg font-bold text-purple-500">
                            {(modelRequest?.messages?.length || 0)}
                        </div>
                        <div className="text-xs text-muted-foreground">Сообщений</div>
                    </div>
                    <div className="bg-background/50 rounded p-2">
                        <div className="text-lg font-bold text-orange-500">
                            {ragContextTokens.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">RAG токенов</div>
                    </div>
                </div>
            </div>

            {/* Context Composition */}
            <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Состав контекста
                </h4>

                {/* System Prompt */}
                <div className="border rounded-lg overflow-hidden">
                    <div
                        className="flex items-center justify-between p-3 bg-blue-500/10 cursor-pointer hover:bg-blue-500/20 transition-colors"
                        onClick={() => toggleSection('system')}
                    >
                        <div className="flex items-center gap-2">
                            {expandedSections.has('system') ?
                                <ChevronDown className="w-4 h-4" /> :
                                <ChevronRight className="w-4 h-4" />
                            }
                            <Settings className="w-4 h-4 text-blue-500" />
                            <span className="font-medium">System Prompt</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                                {messageStats.system.chars.toLocaleString()} симв.
                            </Badge>
                            <Badge className="text-xs">
                                ~{messageStats.system.tokens.toLocaleString()} токенов
                            </Badge>
                        </div>
                    </div>
                    {expandedSections.has('system') && (
                        <div className="p-3 bg-muted/30">
                            {systemPromptParts.instruction && (
                                <div className="mb-3">
                                    <div className="text-xs font-medium text-muted-foreground mb-1">
                                        📋 Инструкция:
                                    </div>
                                    <div className="bg-background rounded p-2 text-xs font-mono max-h-32 overflow-auto">
                                        {systemPromptParts.instruction.slice(0, 500)}
                                        {systemPromptParts.instruction.length > 500 && '...'}
                                    </div>
                                </div>
                            )}
                            {systemPromptParts.ragContext && (
                                <div>
                                    <div className="text-xs font-medium text-muted-foreground mb-1">
                                        📚 RAG Контекст в System:
                                    </div>
                                    <div className="bg-green-500/10 border border-green-500/30 rounded p-2 text-xs font-mono max-h-48 overflow-auto">
                                        {systemPromptParts.ragContext.slice(0, 1000)}
                                        {systemPromptParts.ragContext.length > 1000 && '...'}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* RAG Context */}
                {ragContextChars > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                        <div
                            className="flex items-center justify-between p-3 bg-green-500/10 cursor-pointer hover:bg-green-500/20 transition-colors"
                            onClick={() => toggleSection('rag')}
                        >
                            <div className="flex items-center gap-2">
                                {expandedSections.has('rag') ?
                                    <ChevronDown className="w-4 h-4" /> :
                                    <ChevronRight className="w-4 h-4" />
                                }
                                <Database className="w-4 h-4 text-green-500" />
                                <span className="font-medium">RAG Context</span>
                                <Badge variant="secondary" className="text-xs">
                                    {ragPipeline?.chunks?.total_retrieved || 0} чанков
                                </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                    {ragContextChars.toLocaleString()} симв.
                                </Badge>
                                <Badge className="text-xs bg-green-600">
                                    ~{ragContextTokens.toLocaleString()} токенов
                                </Badge>
                            </div>
                        </div>
                        {expandedSections.has('rag') && (
                            <div className="p-3 bg-muted/30">
                                <div className="text-xs text-muted-foreground mb-2">
                                    Стратегия: <Badge variant="outline">{ragPipeline?.retrieval?.strategy_used || 'auto'}</Badge>
                                    {ragPipeline?.context_building?.compression_applied && (
                                        <Badge variant="secondary" className="ml-2">
                                            Сжато {ragPipeline?.context_building?.compression_ratio?.toFixed(1)}x
                                        </Badge>
                                    )}
                                </div>
                                <div className="bg-green-500/10 border border-green-500/30 rounded p-2 text-xs font-mono max-h-48 overflow-auto">
                                    {ragPipeline?.context_building?.context_preview || 'Превью недоступно'}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Conversation History */}
                {(messageStats.user.count > 1 || messageStats.assistant.count > 0) && (
                    <div className="border rounded-lg overflow-hidden">
                        <div
                            className="flex items-center justify-between p-3 bg-purple-500/10 cursor-pointer hover:bg-purple-500/20 transition-colors"
                            onClick={() => toggleSection('history')}
                        >
                            <div className="flex items-center gap-2">
                                {expandedSections.has('history') ?
                                    <ChevronDown className="w-4 h-4" /> :
                                    <ChevronRight className="w-4 h-4" />
                                }
                                <History className="w-4 h-4 text-purple-500" />
                                <span className="font-medium">История диалога</span>
                                <Badge variant="secondary" className="text-xs">
                                    {messageStats.user.count + messageStats.assistant.count - 1} сообщений
                                </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                    {(messageStats.user.chars + messageStats.assistant.chars).toLocaleString()} симв.
                                </Badge>
                            </div>
                        </div>
                        {expandedSections.has('history') && (
                            <div className="p-3 bg-muted/30 space-y-2 max-h-64 overflow-auto">
                                {modelRequest?.messages?.filter((m: ModelMessage) => m.role !== 'system').map((msg: ModelMessage, i: number) => (
                                    <div key={i} className={cn(
                                        "rounded p-2 text-xs",
                                        msg.role === 'user' ? "bg-blue-500/10 border-l-2 border-blue-500" : "bg-gray-500/10 border-l-2 border-gray-500"
                                    )}>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge variant={msg.role === 'user' ? 'default' : 'secondary'} className="text-xs">
                                                {msg.role === 'user' ? '👤 User' : '🤖 Assistant'}
                                            </Badge>
                                            <span className="text-muted-foreground">
                                                {msg.content?.length || 0} симв.
                                            </span>
                                        </div>
                                        <div className="font-mono">
                                            {msg.content_preview || msg.content?.slice(0, 200)}
                                            {(msg.content?.length || 0) > 200 && '...'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Current User Message */}
                <div className="border rounded-lg overflow-hidden">
                    <div
                        className="flex items-center justify-between p-3 bg-orange-500/10 cursor-pointer hover:bg-orange-500/20 transition-colors"
                        onClick={() => toggleSection('current')}
                    >
                        <div className="flex items-center gap-2">
                            {expandedSections.has('current') ?
                                <ChevronDown className="w-4 h-4" /> :
                                <ChevronRight className="w-4 h-4" />
                            }
                            <MessageSquare className="w-4 h-4 text-orange-500" />
                            <span className="font-medium">Текущий запрос</span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                            {input?.user_message?.length || 0} симв.
                        </Badge>
                    </div>
                    {expandedSections.has('current') && (
                        <div className="p-3 bg-muted/30">
                            <div className="bg-orange-500/10 border border-orange-500/30 rounded p-2 text-sm">
                                {input?.user_message || 'N/A'}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Token Distribution Chart */}
            <div className="border rounded-lg p-3">
                <h4 className="text-sm font-medium mb-2">📊 Распределение токенов</h4>
                <div className="h-4 rounded-full overflow-hidden flex bg-muted">
                    {messageStats.system.tokens > 0 && (
                        <div
                            className="bg-blue-500 h-full transition-all"
                            style={{ width: `${(messageStats.system.tokens / messageStats.total.tokens) * 100}%` }}
                            title={`System: ${messageStats.system.tokens} токенов`}
                        />
                    )}
                    {ragContextTokens > 0 && (
                        <div
                            className="bg-green-500 h-full transition-all"
                            style={{ width: `${(ragContextTokens / messageStats.total.tokens) * 100}%` }}
                            title={`RAG: ${ragContextTokens} токенов`}
                        />
                    )}
                    {(messageStats.user.tokens + messageStats.assistant.tokens - (input?.user_message?.length || 0) / 4) > 0 && (
                        <div
                            className="bg-purple-500 h-full transition-all"
                            style={{ width: `${((messageStats.user.tokens + messageStats.assistant.tokens) / messageStats.total.tokens) * 100}%` }}
                            title={`History: ${messageStats.user.tokens + messageStats.assistant.tokens} токенов`}
                        />
                    )}
                </div>
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded bg-blue-500" /> System
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded bg-green-500" /> RAG
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded bg-purple-500" /> History
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded bg-orange-500" /> Query
                    </div>
                </div>
            </div>
        </div>
    );
};

// ==================== API REQUEST PREVIEW ====================

const ApiRequestPreview: React.FC<{ modelRequest: ModelRequest; debugInfo: RequestDebugInfo }> = ({ modelRequest, debugInfo }) => {
    const [copied, setCopied] = useState(false);

    // Build actual API payload
    const apiPayload = useMemo(() => {
        return {
            model: modelRequest?.model,
            messages: modelRequest?.messages?.map((m: ModelMessage) => ({
                role: m.role,
                content: m.content
            })),
            temperature: modelRequest?.temperature,
            max_tokens: modelRequest?.max_tokens,
            // Add other common parameters
            stream: true,
        };
    }, [modelRequest]);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(JSON.stringify(apiPayload, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [apiPayload]);

    const handleDownload = useCallback(() => {
        const blob = new Blob([JSON.stringify(apiPayload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `api-request-${debugInfo?.request_id?.slice(0, 8) || 'unknown'}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [apiPayload, debugInfo?.request_id]);

    return (
        <div className="space-y-4">
            {/* Request Info */}
            <div className="bg-gradient-to-r from-orange-500/10 to-red-500/10 rounded-lg p-4 border">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Send className="w-4 h-4" />
                        API Request
                    </h3>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleCopy}>
                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleDownload}>
                            <Download className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                    <div>
                        <span className="text-muted-foreground">Model:</span>{' '}
                        <Badge>{modelRequest?.model || 'N/A'}</Badge>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Temperature:</span>{' '}
                        <Badge variant="outline">{modelRequest?.temperature || 0.7}</Badge>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Max Tokens:</span>{' '}
                        <Badge variant="secondary">{modelRequest?.max_tokens?.toLocaleString() || 'N/A'}</Badge>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-muted-foreground">Ready to send</span>
                    <Badge variant="outline" className="ml-auto">
                        ~{modelRequest?.total_input_tokens?.toLocaleString() || 0} input tokens
                    </Badge>
                </div>
            </div>

            {/* Full JSON Payload */}
            <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    Полный JSON payload
                </h4>
                <JsonViewer
                    data={apiPayload}
                    maxHeight="500px"
                    title="API Request"
                    showToolbar={true}
                />
            </div>

            {/* cURL Example */}
            <div className="border rounded-lg p-3">
                <h4 className="text-sm font-medium mb-2">📋 cURL команда</h4>
                <div className="bg-zinc-900 rounded p-3 text-xs font-mono text-zinc-300 overflow-x-auto">
                    <pre>{`curl -X POST "https://api.openai.com/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer \$OPENAI_API_KEY" \\
  -d '${JSON.stringify(apiPayload).slice(0, 200)}...'`}</pre>
                </div>
            </div>
        </div>
    );
};

const SummarySection: React.FC<{ summary: Summary }> = ({ summary }) => (
    <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-primary">
                    {(summary.total_tokens || 0).toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">Всего токенов</div>
            </div>
            <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-600">
                    ${(summary.total_cost_usd || 0).toFixed(4)}
                </div>
                <div className="text-xs text-muted-foreground">Стоимость</div>
            </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="flex items-center gap-1">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Всего:</span>{' '}
                <Badge variant="outline">{summary.total_latency_ms || 0}ms</Badge>
            </div>
            <div className="flex items-center gap-1">
                <Search className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">RAG:</span>{' '}
                <Badge variant="secondary">{summary.rag_overhead_ms || 0}ms</Badge>
            </div>
            <div className="flex items-center gap-1">
                <Zap className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Модель:</span>{' '}
                <Badge>{summary.model_latency_ms || 0}ms</Badge>
            </div>
        </div>
    </div>
);

// ==================== MAIN COMPONENT ====================

export const DebugPanel: React.FC<DebugPanelProps> = ({ debugInfo, isOpen, onClose }) => {
    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState<MainViewTab>('pipeline');

    const handleCopyAll = useCallback(() => {
        if (debugInfo) {
            navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [debugInfo]);

    if (!debugInfo) return null;

    const { input, rag_pipeline, model_request, model_response, summary } = debugInfo;

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[700px] sm:w-[800px] sm:max-w-none">
                <SheetHeader className="pb-4 border-b">
                    <div className="flex items-center justify-between">
                        <SheetTitle className="flex items-center gap-2">
                            <BarChart3 className="w-5 h-5" />
                            🔧 Debug Panel
                        </SheetTitle>
                        <Button variant="outline" size="sm" onClick={handleCopyAll}>
                            {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                            {copied ? 'Скопировано!' : 'Копировать всё'}
                        </Button>
                    </div>
                    <SheetDescription className="flex items-center justify-between">
                        <span>Request ID: {debugInfo.request_id?.slice(0, 8)}... | {debugInfo.timestamp}</span>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline">{summary?.total_tokens?.toLocaleString() || 0} токенов</Badge>
                            <Badge variant="secondary">{summary?.total_latency_ms || 0}ms</Badge>
                        </div>
                    </SheetDescription>
                </SheetHeader>

                {/* Tab Navigation */}
                <div className="flex items-center gap-2 py-3 border-b overflow-x-auto">
                    <ViewTabButton
                        active={activeTab === 'pipeline'}
                        onClick={() => setActiveTab('pipeline')}
                        icon={<Layers className="w-4 h-4" />}
                        label="Pipeline"
                    />
                    <ViewTabButton
                        active={activeTab === 'context'}
                        onClick={() => setActiveTab('context')}
                        icon={<Eye className="w-4 h-4" />}
                        label="Context"
                        badge={`${((rag_pipeline?.context_building?.final_context_chars || 0) / 1000).toFixed(0)}K`}
                    />
                    <ViewTabButton
                        active={activeTab === 'api'}
                        onClick={() => setActiveTab('api')}
                        icon={<Send className="w-4 h-4" />}
                        label="API"
                    />
                    <ViewTabButton
                        active={activeTab === 'json'}
                        onClick={() => setActiveTab('json')}
                        icon={<FileCode className="w-4 h-4" />}
                        label="Full JSON"
                    />
                </div>

                <ScrollArea className="h-[calc(100vh-200px)] pr-4">
                    <div className="py-4">
                        {/* Pipeline View - Default */}
                        {activeTab === 'pipeline' && (
                            <div className="space-y-2">
                                {/* Summary at top for quick overview */}
                                <CollapsibleSection
                                    title="📊 Summary"
                                    icon={<BarChart3 className="w-4 h-4" />}
                                    badge={`${(summary?.total_tokens || 0).toLocaleString()} токенов`}
                                    defaultOpen={true}
                                >
                                    <SummarySection summary={summary || {}} />
                                </CollapsibleSection>

                                {/* Input */}
                                <CollapsibleSection
                                    title="📥 Input"
                                    icon={<ArrowRight className="w-4 h-4" />}
                                >
                                    <InputSection input={input || {}} />
                                </CollapsibleSection>

                                {/* RAG Pipeline */}
                                <CollapsibleSection
                                    title="🧠 Intent Analysis"
                                    icon={<Brain className="w-4 h-4" />}
                                    badge={rag_pipeline?.intent_analysis?.detected_scope}
                                >
                                    <IntentSection intent={rag_pipeline?.intent_analysis || {}} />
                                </CollapsibleSection>

                                <CollapsibleSection
                                    title="📚 Document Structure"
                                    icon={<Book className="w-4 h-4" />}
                                    badge={`${rag_pipeline?.document_structure?.total_chunks || 0} чанков`}
                                >
                                    <DocumentStructureSection structure={rag_pipeline?.document_structure || {}} />
                                </CollapsibleSection>

                                <CollapsibleSection
                                    title="🔍 Retrieval Strategy"
                                    icon={<Search className="w-4 h-4" />}
                                    badge={rag_pipeline?.retrieval?.strategy_used}
                                >
                                    <RetrievalSection retrieval={rag_pipeline?.retrieval || {}} />
                                </CollapsibleSection>

                                <CollapsibleSection
                                    title="📄 Retrieved Chunks"
                                    icon={<FileText className="w-4 h-4" />}
                                    badge={rag_pipeline?.chunks?.total_retrieved || 0}
                                >
                                    <ChunksSection chunks={rag_pipeline?.chunks || {}} />
                                </CollapsibleSection>

                                <CollapsibleSection
                                    title="📝 Context Building"
                                    icon={<Edit className="w-4 h-4" />}
                                    badge={`${((rag_pipeline?.context_building?.final_context_chars || 0) / 1000).toFixed(1)}K`}
                                >
                                    <ContextBuildingSection context={rag_pipeline?.context_building || {}} />
                                </CollapsibleSection>

                                {/* Model Request/Response */}
                                <CollapsibleSection
                                    title="📤 Model Request"
                                    icon={<Send className="w-4 h-4" />}
                                    badge={model_request?.model}
                                >
                                    <ModelRequestSection request={model_request || {}} />
                                </CollapsibleSection>

                                <CollapsibleSection
                                    title="📨 Model Response"
                                    icon={<MessageSquare className="w-4 h-4" />}
                                    badge={`${model_response?.tokens_used?.total || 0} токенов`}
                                >
                                    <ModelResponseSection response={model_response || {}} />
                                </CollapsibleSection>
                            </div>
                        )}

                        {/* Context Preview View */}
                        {activeTab === 'context' && (
                            <ContextPreviewSection
                                modelRequest={model_request || {}}
                                ragPipeline={rag_pipeline || {}}
                                input={input || {}}
                            />
                        )}

                        {/* API Request View */}
                        {activeTab === 'api' && (
                            <ApiRequestPreview
                                modelRequest={model_request || {}}
                                debugInfo={debugInfo}
                            />
                        )}

                        {/* Full JSON View */}
                        {activeTab === 'json' && (
                            <div className="space-y-4">
                                <div className="bg-gradient-to-r from-gray-500/10 to-slate-500/10 rounded-lg p-4 border">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="font-semibold flex items-center gap-2">
                                            <FileCode className="w-4 h-4" />
                                            Полный Debug JSON
                                        </h3>
                                        <div className="text-xs text-muted-foreground">
                                            {JSON.stringify(debugInfo).length.toLocaleString()} bytes
                                        </div>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Полная информация о запросе, RAG pipeline и ответе модели
                                    </p>
                                </div>
                                <JsonViewer
                                    data={debugInfo}
                                    maxHeight="600px"
                                    title="Full Debug Info"
                                    showToolbar={true}
                                />
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
};

export default DebugPanel;
