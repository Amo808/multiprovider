/**
 * RAGContextInspector - Объединённая панель для просмотра RAG контекста и API запросов
 * 
 * Показывает полную цепочку:
 * 1. Исходный запрос пользователя
 * 2. RAG Pipeline (стратегия, чанки, документы)
 * 3. Финальный промпт который пошёл в модель
 * 4. API Request в JSON формате
 */
import React, { useState, useMemo } from 'react';
import {
    X, Copy, Check, Download, ChevronDown, ChevronRight,
    Search, Database, FileText, Zap, Brain, Clock, Hash,
    MessageSquare, Settings, GitBranch, Layers, Target,
    BookOpen, Filter, Sparkles
} from 'lucide-react';
import { Message, GenerationConfig, RAGDebugInfo } from '../types';

// ==================== TYPES ====================

interface RAGChunk {
    id?: string;
    content: string;
    metadata?: {
        source?: string;
        chapter?: string;
        page?: number;
        score?: number;
        document_id?: string;
    };
    similarity_score?: number;
    similarity?: number;
}

interface RAGContextInspectorProps {
    isOpen: boolean;
    onClose: () => void;
    // Current request data
    messages: Message[];
    currentInput?: string;
    generationConfig: GenerationConfig;
    systemPrompt?: string;
    // RAG data
    ragDebugInfo?: RAGDebugInfo | Record<string, any>;
    ragContext?: string;
    ragSources?: Array<{
        document_id: string;
        document_name?: string;
        chunk_index?: number;
        similarity: number;
        content_preview?: string;
    }>;
    // RAG Settings
    ragSettings?: {
        mode: string;
        chunk_mode?: string;
        chunk_percent?: number;
        max_chunks?: number;
        min_similarity?: number;
        use_rerank?: boolean;
    };
}

// ==================== COLOR THEMES ====================

const COLORS = {
    pipeline: {
        query: 'from-blue-500 to-cyan-500',
        strategy: 'from-purple-500 to-pink-500',
        retrieval: 'from-green-500 to-emerald-500',
        chunks: 'from-amber-500 to-orange-500',
        prompt: 'from-rose-500 to-red-500',
        api: 'from-indigo-500 to-violet-500',
    },
    badge: {
        blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        green: 'bg-green-500/20 text-green-400 border-green-500/30',
        amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        rose: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
        gray: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    }
};

// ==================== HELPER COMPONENTS ====================

const Badge: React.FC<{ color: keyof typeof COLORS.badge; children: React.ReactNode }> = ({ color, children }) => (
    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full border ${COLORS.badge[color]}`}>
        {children}
    </span>
);

const PipelineStep: React.FC<{
    step: number;
    title: string;
    icon: React.ReactNode;
    gradient: string;
    isLast?: boolean;
    children: React.ReactNode;
    defaultExpanded?: boolean;
    badge?: React.ReactNode;
}> = ({ step, title, icon, gradient, isLast, children, defaultExpanded = false, badge }) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    return (
        <div className="relative">
            {/* Connector line */}
            {!isLast && (
                <div className="absolute left-5 top-12 bottom-0 w-0.5 bg-gradient-to-b from-gray-600 to-gray-700" />
            )}

            <div className="relative z-10">
                {/* Header */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-800/50 rounded-lg transition-all group"
                >
                    {/* Step indicator */}
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white shadow-lg`}>
                        {icon}
                    </div>

                    <div className="flex-1 flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-mono">#{step}</span>
                        <span className="font-medium text-gray-200">{title}</span>
                        {badge}
                    </div>

                    <ChevronDown
                        size={16}
                        className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                </button>

                {/* Content */}
                {isExpanded && (
                    <div className="ml-[52px] mt-1 mb-4 p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
                        {children}
                    </div>
                )}
            </div>
        </div>
    );
};

const CodeBlock: React.FC<{ content: string; maxHeight?: string }> = ({
    content,
    maxHeight = '200px'
}) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group">
            <pre
                className={`text-xs font-mono bg-gray-900/50 p-3 rounded-lg overflow-auto border border-gray-700/50`}
                style={{ maxHeight }}
            >
                <code className="text-gray-300 whitespace-pre-wrap break-all">{content}</code>
            </pre>
            <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-1.5 bg-gray-700/80 hover:bg-gray-600 rounded text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
            >
                {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
            </button>
        </div>
    );
};

const ChunkCard: React.FC<{ chunk: RAGChunk; index: number }> = ({ chunk, index }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const score = chunk.similarity_score ?? chunk.similarity ?? chunk.metadata?.score ?? 0;
    const scorePercent = Math.round(score * 100);

    // Determine score color
    const scoreColor = scorePercent >= 70 ? 'text-green-400' : scorePercent >= 50 ? 'text-amber-400' : 'text-red-400';

    return (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 overflow-hidden">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-2 hover:bg-gray-700/30 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-mono w-6">#{index + 1}</span>
                    <span className="text-xs text-gray-400 truncate max-w-[200px]">
                        {chunk.metadata?.chapter || chunk.metadata?.source || 'Chunk'}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${scoreColor}`}>{scorePercent}%</span>
                    <ChevronRight size={14} className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </div>
            </button>

            {isExpanded && (
                <div className="px-3 pb-3 border-t border-gray-700/30">
                    {chunk.metadata && (
                        <div className="flex flex-wrap gap-1 my-2">
                            {chunk.metadata.source && (
                                <Badge color="blue">📄 {chunk.metadata.source}</Badge>
                            )}
                            {chunk.metadata.chapter && (
                                <Badge color="purple">📖 {chunk.metadata.chapter}</Badge>
                            )}
                            {chunk.metadata.page && (
                                <Badge color="gray">стр. {chunk.metadata.page}</Badge>
                            )}
                        </div>
                    )}
                    <p className="text-xs text-gray-300 whitespace-pre-wrap mt-2 max-h-32 overflow-y-auto">
                        {chunk.content.length > 500 ? chunk.content.slice(0, 500) + '...' : chunk.content}
                    </p>
                </div>
            )}
        </div>
    );
};

const StatCard: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string | number;
    color?: string;
}> = ({ icon, label, value, color = 'text-gray-200' }) => (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 rounded-lg">
        <span className="text-gray-500">{icon}</span>
        <div>
            <div className="text-[10px] text-gray-500 uppercase">{label}</div>
            <div className={`text-sm font-medium ${color}`}>{value}</div>
        </div>
    </div>
);

// ==================== MAIN COMPONENT ====================

export const RAGContextInspector: React.FC<RAGContextInspectorProps> = ({
    isOpen,
    onClose,
    messages,
    currentInput = '',
    generationConfig,
    systemPrompt = '',
    ragDebugInfo,
    ragContext = '',
    ragSources = [],
    ragSettings
}) => {
    const [activeTab, setActiveTab] = useState<'pipeline' | 'chunks' | 'api' | 'raw'>('pipeline');
    const [copied, setCopied] = useState(false);

    // Extract data from ragDebugInfo
    const debugData = useMemo(() => {
        if (!ragDebugInfo) return null;

        // Handle nested collector structure
        const collector = ragDebugInfo.collector || ragDebugInfo;
        const ragPipeline = collector.rag_pipeline || ragDebugInfo;

        return {
            // Original query
            originalQuery: ragDebugInfo.original_query || collector.input?.message || currentInput,

            // Strategy info
            strategy: ragDebugInfo.strategy || ragPipeline.strategy || ragSettings?.mode || 'unknown',
            autoDetected: ragDebugInfo.auto_detected_strategy,
            techniquesUsed: ragDebugInfo.techniques_used || [],

            // Search info
            searchMethod: ragDebugInfo.search_method || [],
            generatedQueries: ragDebugInfo.generated_queries || [],
            stepBackQuery: ragDebugInfo.step_back_query,

            // Results
            totalCandidates: ragDebugInfo.total_candidates || 0,
            afterRerank: ragDebugInfo.after_rerank || 0,

            // Chunks
            chunks: ragPipeline.chunks || ragDebugInfo.chunks || [],
            sources: ragPipeline.sources || ragSources,

            // Context
            contextText: ragPipeline.context?.context_text || ragContext,
            contextTokens: ragPipeline.context?.total_tokens,

            // Timing
            timing: ragDebugInfo.timing || ragPipeline.timing,

            // Full collector for raw view
            fullCollector: collector
        };
    }, [ragDebugInfo, ragContext, ragSources, ragSettings, currentInput]);

    // Build API request
    const apiRequest = useMemo(() => {
        const apiMessages: Array<{ role: string; content: string }> = [];

        // System message
        let systemContent = systemPrompt || 'You are a helpful AI assistant.';
        if (debugData?.contextText) {
            systemContent += `\n\n--- RETRIEVED CONTEXT FROM DOCUMENTS ---\n${debugData.contextText}\n--- END CONTEXT ---`;
        }
        apiMessages.push({ role: 'system', content: systemContent });

        // History
        messages.forEach(msg => {
            apiMessages.push({ role: msg.role, content: msg.content });
        });

        // Current input
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
    }, [messages, currentInput, generationConfig, systemPrompt, debugData]);

    // Token stats
    const tokenStats = useMemo(() => {
        const totalChars = JSON.stringify(apiRequest).length;
        const ragChars = debugData?.contextText?.length || 0;
        return {
            total: Math.round(totalChars / 4),
            rag: Math.round(ragChars / 4),
            messages: apiRequest.messages.length
        };
    }, [apiRequest, debugData]);

    // Copy handler
    const handleCopy = () => {
        const data = activeTab === 'raw' ? ragDebugInfo : apiRequest;
        navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Download handler
    const handleDownload = () => {
        const data = {
            timestamp: new Date().toISOString(),
            api_request: apiRequest,
            rag_debug: ragDebugInfo,
            rag_settings: ragSettings,
            token_stats: tokenStats
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rag-context-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-hidden">
            <div className="flex items-center justify-center min-h-screen p-4">
                {/* Overlay */}
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                    onClick={onClose}
                />

                {/* Panel */}
                <div className="relative w-full max-w-5xl max-h-[90vh] bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gradient-to-r from-gray-800 to-gray-900">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                <GitBranch size={20} className="text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">RAG Context Inspector</h2>
                                <p className="text-xs text-gray-400">Полная цепочка RAG pipeline → API Request</p>
                            </div>
                        </div>

                        {/* Quick stats */}
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 text-xs">
                                <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-800 text-gray-300">
                                    <MessageSquare size={12} />
                                    {tokenStats.messages} msgs
                                </span>
                                <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-800 text-gray-300">
                                    <Hash size={12} />
                                    ~{tokenStats.total.toLocaleString()} tok
                                </span>
                                {tokenStats.rag > 0 && (
                                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30">
                                        <Database size={12} />
                                        RAG {tokenStats.rag.toLocaleString()} tok
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-1 border-l border-gray-700 pl-3">
                                <button
                                    onClick={handleCopy}
                                    className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                                    title="Copy"
                                >
                                    {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                                </button>
                                <button
                                    onClick={handleDownload}
                                    className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                                    title="Download"
                                >
                                    <Download size={16} />
                                </button>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-gray-700 bg-gray-800/50">
                        {[
                            { id: 'pipeline' as const, label: '🔄 Pipeline', icon: <GitBranch size={14} /> },
                            { id: 'chunks' as const, label: '📦 Chunks', icon: <Layers size={14} />, count: debugData?.chunks?.length },
                            { id: 'api' as const, label: '⚡ API Request', icon: <Zap size={14} /> },
                            { id: 'raw' as const, label: '🔧 Raw JSON', icon: <FileText size={14} /> },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === tab.id
                                    ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-500/5'
                                    : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                {tab.icon}
                                {tab.label}
                                {tab.count !== undefined && (
                                    <span className="px-1.5 py-0.5 text-[10px] bg-gray-700 rounded">{tab.count}</span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {activeTab === 'pipeline' && (
                            <PipelineView debugData={debugData} ragSettings={ragSettings} />
                        )}

                        {activeTab === 'chunks' && (
                            <ChunksView chunks={debugData?.chunks || []} sources={debugData?.sources || ragSources} />
                        )}

                        {activeTab === 'api' && (
                            <ApiRequestView apiRequest={apiRequest} ragContext={debugData?.contextText} />
                        )}

                        {activeTab === 'raw' && (
                            <RawJsonView data={ragDebugInfo} />
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-2 border-t border-gray-700 bg-gray-800/50">
                        <div className="flex items-center justify-between text-xs text-gray-500">
                            <span className="flex items-center gap-2">
                                💡 Используйте вкладки для навигации по RAG pipeline
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
    );
};

// ==================== TAB VIEWS ====================

const PipelineView: React.FC<{
    debugData: any;
    ragSettings?: RAGContextInspectorProps['ragSettings'];
}> = ({ debugData, ragSettings }) => {
    if (!debugData) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <Database size={48} className="mb-4 opacity-50" />
                <p>Нет данных о RAG pipeline</p>
                <p className="text-xs mt-1">Включите RAG и отправьте запрос</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {/* Step 1: User Query */}
            <PipelineStep
                step={1}
                title="Запрос пользователя"
                icon={<MessageSquare size={18} />}
                gradient={COLORS.pipeline.query}
                defaultExpanded={true}
                badge={<Badge color="blue">INPUT</Badge>}
            >
                <div className="text-sm text-gray-300 bg-blue-500/10 p-3 rounded-lg border border-blue-500/20">
                    "{debugData.originalQuery}"
                </div>
            </PipelineStep>

            {/* Step 2: Strategy Selection */}
            <PipelineStep
                step={2}
                title="Выбор стратегии"
                icon={<Brain size={18} />}
                gradient={COLORS.pipeline.strategy}
                badge={<Badge color="purple">{debugData.strategy?.toUpperCase()}</Badge>}
            >
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <StatCard
                            icon={<Target size={14} />}
                            label="Стратегия"
                            value={debugData.strategy}
                            color="text-purple-400"
                        />
                        {debugData.autoDetected && (
                            <StatCard
                                icon={<Sparkles size={14} />}
                                label="Авто-определено"
                                value={debugData.autoDetected}
                                color="text-amber-400"
                            />
                        )}
                    </div>

                    {debugData.techniquesUsed?.length > 0 && (
                        <div>
                            <div className="text-xs text-gray-500 mb-1">Техники:</div>
                            <div className="flex flex-wrap gap-1">
                                {debugData.techniquesUsed.map((t: string, i: number) => (
                                    <Badge key={i} color="purple">{t}</Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    {ragSettings && (
                        <div className="text-xs text-gray-500 p-2 bg-gray-800/50 rounded">
                            <div className="grid grid-cols-3 gap-2">
                                <div>Режим чанков: <span className="text-purple-400">{ragSettings.chunk_mode}</span></div>
                                <div>% документа: <span className="text-purple-400">{ragSettings.chunk_percent}%</span></div>
                                <div>Rerank: <span className={ragSettings.use_rerank ? 'text-green-400' : 'text-gray-500'}>{ragSettings.use_rerank ? 'ON' : 'OFF'}</span></div>
                            </div>
                        </div>
                    )}
                </div>
            </PipelineStep>

            {/* Step 3: Query Generation (if any) */}
            {debugData.generatedQueries?.length > 0 && (
                <PipelineStep
                    step={3}
                    title="Генерация запросов"
                    icon={<Search size={18} />}
                    gradient={COLORS.pipeline.retrieval}
                    badge={<Badge color="green">{debugData.generatedQueries.length} queries</Badge>}
                >
                    <div className="space-y-2">
                        {debugData.generatedQueries.map((q: string, i: number) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                                <span className="text-gray-500 font-mono text-xs w-4">{i + 1}.</span>
                                <span className="text-gray-300">{q}</span>
                            </div>
                        ))}
                        {debugData.stepBackQuery && (
                            <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded">
                                <div className="text-xs text-amber-400 mb-1">Step-back query:</div>
                                <div className="text-sm text-gray-300">{debugData.stepBackQuery}</div>
                            </div>
                        )}
                    </div>
                </PipelineStep>
            )}

            {/* Step 4: Retrieval Results */}
            <PipelineStep
                step={debugData.generatedQueries?.length > 0 ? 4 : 3}
                title="Результаты поиска"
                icon={<Database size={18} />}
                gradient={COLORS.pipeline.chunks}
                badge={
                    <div className="flex gap-1">
                        <Badge color="amber">{debugData.totalCandidates} найдено</Badge>
                        {debugData.afterRerank > 0 && debugData.afterRerank !== debugData.totalCandidates && (
                            <Badge color="green">{debugData.afterRerank} после rerank</Badge>
                        )}
                    </div>
                }
            >
                <div className="grid grid-cols-3 gap-3">
                    <StatCard
                        icon={<Search size={14} />}
                        label="Методы поиска"
                        value={debugData.searchMethod?.join(', ') || 'hybrid'}
                    />
                    <StatCard
                        icon={<Filter size={14} />}
                        label="Кандидаты"
                        value={debugData.totalCandidates}
                        color="text-amber-400"
                    />
                    <StatCard
                        icon={<Target size={14} />}
                        label="После фильтрации"
                        value={debugData.afterRerank || debugData.chunks?.length || 0}
                        color="text-green-400"
                    />
                </div>

                {debugData.timing && (
                    <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                            <Clock size={10} />
                            Retrieval: {debugData.timing.retrieval_ms || '?'}ms
                        </span>
                        {debugData.timing.total_ms && (
                            <span>Total: {debugData.timing.total_ms}ms</span>
                        )}
                    </div>
                )}
            </PipelineStep>

            {/* Step 5: Context Building */}
            <PipelineStep
                step={debugData.generatedQueries?.length > 0 ? 5 : 4}
                title="Формирование контекста"
                icon={<BookOpen size={18} />}
                gradient={COLORS.pipeline.prompt}
                isLast={true}
                badge={
                    debugData.contextTokens ? (
                        <Badge color="rose">~{debugData.contextTokens} tokens</Badge>
                    ) : null
                }
            >
                {debugData.contextText ? (
                    <div className="space-y-2">
                        <div className="text-xs text-gray-500">
                            Контекст ({debugData.contextText.length} символов, ~{Math.round(debugData.contextText.length / 4)} токенов)
                        </div>
                        <CodeBlock
                            content={debugData.contextText.length > 2000
                                ? debugData.contextText.slice(0, 2000) + '\n\n... (обрезано для отображения)'
                                : debugData.contextText}
                            maxHeight="300px"
                        />
                    </div>
                ) : (
                    <div className="text-sm text-gray-500">Контекст не сформирован</div>
                )}
            </PipelineStep>
        </div>
    );
};

const ChunksView: React.FC<{
    chunks: RAGChunk[];
    sources: any[];
}> = ({ chunks, sources }) => {
    const allChunks = chunks.length > 0 ? chunks : sources;

    if (!allChunks || allChunks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <Layers size={48} className="mb-4 opacity-50" />
                <p>Нет данных о чанках</p>
                <p className="text-xs mt-1">Чанки появятся после RAG запроса</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Stats */}
            <div className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg">
                <StatCard icon={<Layers size={14} />} label="Всего чанков" value={allChunks.length} color="text-purple-400" />
                <StatCard
                    icon={<Target size={14} />}
                    label="Средний score"
                    value={`${Math.round(allChunks.reduce((acc, c) => acc + (c.similarity_score || c.similarity || 0), 0) / allChunks.length * 100)}%`}
                    color="text-green-400"
                />
            </div>

            {/* Chunks list */}
            <div className="space-y-2">
                {allChunks.map((chunk, index) => (
                    <ChunkCard key={chunk.id || index} chunk={chunk} index={index} />
                ))}
            </div>
        </div>
    );
};

const ApiRequestView: React.FC<{
    apiRequest: any;
    ragContext?: string;
}> = ({ apiRequest, ragContext }) => {
    const [showSystemFull, setShowSystemFull] = useState(false);

    return (
        <div className="space-y-4">
            {/* Overview */}
            <div className="grid grid-cols-4 gap-3">
                <StatCard icon={<Settings size={14} />} label="Model" value={apiRequest.model} />
                <StatCard icon={<Zap size={14} />} label="Temperature" value={apiRequest.temperature} color="text-amber-400" />
                <StatCard icon={<Hash size={14} />} label="Max Tokens" value={apiRequest.max_tokens} color="text-blue-400" />
                <StatCard icon={<MessageSquare size={14} />} label="Messages" value={apiRequest.messages.length} color="text-purple-400" />
            </div>

            {/* Messages breakdown */}
            <div className="space-y-3">
                {apiRequest.messages.map((msg: any, index: number) => (
                    <div key={index} className="bg-gray-800/50 rounded-lg border border-gray-700/50 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-gray-800">
                            <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 text-xs font-medium rounded ${msg.role === 'system'
                                    ? 'bg-purple-500/20 text-purple-400'
                                    : msg.role === 'user'
                                        ? 'bg-blue-500/20 text-blue-400'
                                        : 'bg-green-500/20 text-green-400'
                                    }`}>
                                    {msg.role}
                                </span>
                                <span className="text-xs text-gray-500">{msg.content.length} chars</span>
                            </div>
                            {msg.role === 'system' && ragContext && (
                                <button
                                    onClick={() => setShowSystemFull(!showSystemFull)}
                                    className="text-xs text-purple-400 hover:text-purple-300"
                                >
                                    {showSystemFull ? 'Свернуть' : 'Показать полностью'}
                                </button>
                            )}
                        </div>
                        <div className="p-3">
                            <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                                {msg.role === 'system' && !showSystemFull && msg.content.length > 500
                                    ? msg.content.slice(0, 500) + '\n\n... [показать полностью]'
                                    : msg.content}
                            </pre>
                        </div>
                    </div>
                ))}
            </div>

            {/* Full JSON */}
            <div>
                <div className="text-xs text-gray-500 mb-2">Полный API Request (JSON):</div>
                <CodeBlock content={JSON.stringify(apiRequest, null, 2)} maxHeight="300px" />
            </div>
        </div>
    );
};

const RawJsonView: React.FC<{ data: any }> = ({ data }) => {
    if (!data) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <FileText size={48} className="mb-4 opacity-50" />
                <p>Нет RAG debug данных</p>
            </div>
        );
    }

    return (
        <div>
            <div className="text-xs text-gray-500 mb-2">Полные RAG Debug данные:</div>
            <CodeBlock content={JSON.stringify(data, null, 2)} maxHeight="calc(90vh - 250px)" />
        </div>
    );
};

export default RAGContextInspector;
