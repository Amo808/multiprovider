/**
 * RAGDebugPanel - Панель отладки и настройки RAG
 * Показывает все промпты, настройки и работу RAG в реальном времени
 */
import React, { useState, useEffect } from 'react';
import {
    Settings, Code, ChevronDown, ChevronRight,
    Copy, Check, Zap, Brain, Search, Clock
} from 'lucide-react';

interface RAGPrompts {
    task_instructions: Record<string, {
        emoji: string;
        name: string;
        prompt: string;
        description: string;
    }>;
    context_header: {
        name: string;
        prompt: string;
        description: string;
    };
    intent_analysis: {
        name: string;
        description: string;
        scopes: Record<string, string>;
    };
    search_strategies: Record<string, {
        name: string;
        description: string;
        prompt?: string;
        default_weights?: Record<string, number>;
    }>;
    defaults: Record<string, number | string | boolean>;
    modes: Record<string, {
        name: string;
        description: string;
        recommended?: boolean;
    }>;
}

interface RAGDebugPanelProps {
    isOpen: boolean;
    onClose: () => void;
    currentSettings?: {
        mode: string;
        max_chunks: number;
        min_similarity: number;
        keyword_weight: number;
        semantic_weight: number;
        use_rerank: boolean;
        // NEW: Chunk mode settings
        chunk_mode?: 'fixed' | 'percent' | 'adaptive';
        chunk_percent?: number;
        min_chunks?: number;
        max_chunks_limit?: number;
        // NEW: Orchestrator settings
        orchestrator?: {
            include_history?: boolean;
            history_limit?: number;
            include_memory?: boolean;
            adaptive_chunks?: boolean;
        };
    };
    lastDebugInfo?: Record<string, any>;
}

// Fallback data in case API fails
const FALLBACK_PROMPTS: RAGPrompts = {
    task_instructions: {
        summarize: { emoji: "📝", name: "Пересказ / Суммаризация", prompt: "📝 ЗАДАЧА: Перескажи/суммаризируй содержание ниже.", description: "Краткий пересказ или суммаризация текста" },
        analyze: { emoji: "🔍", name: "Глубокий анализ", prompt: "🔍 ЗАДАЧА: Проведи глубокий анализ текста - темы, смысл, подтекст.", description: "Подробный анализ тем, смысла и подтекста" },
        search: { emoji: "🔎", name: "Общий поиск", prompt: "", description: "Общий семантический поиск" }
    },
    context_header: {
        name: "Заголовок контекста",
        prompt: "Используй следующие фрагменты документов для ответа на вопрос пользователя.",
        description: "Инструкция для модели как использовать найденные документы"
    },
    intent_analysis: {
        name: "Анализ намерений",
        description: "AI анализирует запрос и определяет: scope (область), task (задачу), sections (разделы)",
        scopes: {
            single_section: "Один конкретный раздел/глава",
            full_document: "Весь документ целиком",
            search: "Поиск конкретной информации"
        }
    },
    search_strategies: {
        hybrid_search: { name: "Гибридный поиск", description: "Комбинация векторного и ключевого поиска" }
    },
    defaults: { max_chunks: 50, min_similarity: 0.4 },
    modes: {
        smart: { name: "Умный", description: "AI понимает запрос автоматически", recommended: true }
    }
};

export const RAGDebugPanel: React.FC<RAGDebugPanelProps> = ({
    isOpen,
    onClose,
    currentSettings,
    lastDebugInfo
}) => {
    const [prompts, setPrompts] = useState<RAGPrompts | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'prompts' | 'strategies' | 'debug'>('prompts');
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['task_instructions']));
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            loadPrompts();
        }
    }, [isOpen]);

    const loadPrompts = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch('/api/rag/prompts');
            if (response.ok) {
                const data = await response.json();
                setPrompts(data);
            } else {
                setError(`HTTP ${response.status}: ${response.statusText}`);
                // Use fallback data
                setPrompts(FALLBACK_PROMPTS);
            }
        } catch (err) {
            console.error('Failed to load RAG prompts:', err);
            setError(err instanceof Error ? err.message : 'Ошибка загрузки');
            // Use fallback data
            setPrompts(FALLBACK_PROMPTS);
        } finally {
            setLoading(false);
        }
    };

    const toggleSection = (key: string) => {
        const newExpanded = new Set(expandedSections);
        if (newExpanded.has(key)) {
            newExpanded.delete(key);
        } else {
            newExpanded.add(key);
        }
        setExpandedSections(newExpanded);
    };

    const copyToClipboard = (text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-hidden">
            <div className="flex items-center justify-center min-h-screen p-4">
                {/* Overlay */}
                <div
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                    onClick={onClose}
                />

                {/* Panel */}
                <div className="relative w-full max-w-5xl max-h-[90vh] bg-gray-900 rounded-xl shadow-2xl border border-gray-700 flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
                        <div className="flex items-center gap-3">
                            <Settings size={20} className="text-purple-400" />
                            <div>
                                <h2 className="text-base font-semibold text-white">RAG Debug & Prompts</h2>
                                <p className="text-xs text-gray-400">Все промпты и настройки системы RAG</p>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex items-center gap-1 bg-gray-700/50 rounded-lg p-1">
                            <button
                                onClick={() => setActiveTab('prompts')}
                                className={`px-3 py-1.5 rounded text-sm transition-colors ${activeTab === 'prompts'
                                        ? 'bg-purple-500 text-white'
                                        : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                📝 Промпты
                            </button>
                            <button
                                onClick={() => setActiveTab('strategies')}
                                className={`px-3 py-1.5 rounded text-sm transition-colors ${activeTab === 'strategies'
                                        ? 'bg-purple-500 text-white'
                                        : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                🔍 Стратегии
                            </button>
                            <button
                                onClick={() => setActiveTab('debug')}
                                className={`px-3 py-1.5 rounded text-sm transition-colors ${activeTab === 'debug'
                                        ? 'bg-purple-500 text-white'
                                        : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                🐛 Debug
                            </button>
                        </div>

                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {error && (
                            <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm">
                                ⚠️ {error} (используются локальные данные)
                            </div>
                        )}
                        {loading ? (
                            <div className="flex items-center justify-center h-64">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" />
                            </div>
                        ) : activeTab === 'prompts' ? (
                            <PromptsTab
                                prompts={prompts}
                                expandedSections={expandedSections}
                                toggleSection={toggleSection}
                                copyToClipboard={copyToClipboard}
                                copiedKey={copiedKey}
                            />
                        ) : activeTab === 'strategies' ? (
                            <StrategiesTab
                                prompts={prompts}
                                copyToClipboard={copyToClipboard}
                                copiedKey={copiedKey}
                            />
                        ) : (
                            <DebugTab
                                currentSettings={currentSettings}
                                lastDebugInfo={lastDebugInfo}
                                prompts={prompts}
                            />
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-2.5 border-t border-gray-700 bg-gray-800/50">
                        <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>
                                💡 Эти промпты используются системой RAG для анализа запросов и поиска информации
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

// === PROMPTS TAB ===
const PromptsTab: React.FC<{
    prompts: RAGPrompts | null;
    expandedSections: Set<string>;
    toggleSection: (key: string) => void;
    copyToClipboard: (text: string, key: string) => void;
    copiedKey: string | null;
}> = ({ prompts, expandedSections, toggleSection, copyToClipboard, copiedKey }) => {
    if (!prompts) return <div className="text-gray-400">Загрузка...</div>;

    return (
        <div className="space-y-4">
            {/* Context Header */}
            <PromptSection
                title="📄 Заголовок контекста"
                description={prompts.context_header.description}
                prompt={prompts.context_header.prompt}
                isExpanded={expandedSections.has('context_header')}
                onToggle={() => toggleSection('context_header')}
                onCopy={() => copyToClipboard(prompts.context_header.prompt, 'context_header')}
                copied={copiedKey === 'context_header'}
            />

            {/* Task Instructions */}
            <div className="border border-gray-700 rounded-lg overflow-hidden">
                <button
                    onClick={() => toggleSection('task_instructions')}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-800 hover:bg-gray-800/80 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-gray-500">
                            {expandedSections.has('task_instructions') ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </span>
                        <span className="font-medium text-gray-200">🎯 Инструкции по задачам</span>
                        <span className="text-xs text-gray-500">({Object.keys(prompts.task_instructions).length} задач)</span>
                    </div>
                </button>

                {expandedSections.has('task_instructions') && (
                    <div className="p-4 space-y-3 bg-gray-900/50">
                        {Object.entries(prompts.task_instructions).map(([key, task]) => (
                            <div key={key} className="border border-gray-700/50 rounded-lg p-3 hover:border-gray-600 transition-colors">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{task.emoji}</span>
                                        <span className="font-medium text-gray-200">{task.name}</span>
                                        <span className="text-xs text-gray-500 bg-gray-700/50 px-2 py-0.5 rounded">{key}</span>
                                    </div>
                                    <button
                                        onClick={() => copyToClipboard(task.prompt, key)}
                                        className="p-1 hover:bg-gray-700 rounded text-gray-500 hover:text-gray-300"
                                    >
                                        {copiedKey === key ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                                    </button>
                                </div>
                                <p className="text-xs text-gray-400 mb-2">{task.description}</p>
                                {task.prompt && (
                                    <pre className="text-xs text-emerald-400 bg-gray-800/50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                                        {task.prompt}
                                    </pre>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Intent Analysis */}
            <div className="border border-gray-700 rounded-lg overflow-hidden">
                <button
                    onClick={() => toggleSection('intent_analysis')}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-800 hover:bg-gray-800/80 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-gray-500">
                            {expandedSections.has('intent_analysis') ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </span>
                        <Brain size={16} className="text-purple-400" />
                        <span className="font-medium text-gray-200">🧠 Анализ намерений (Intent Analysis)</span>
                    </div>
                </button>

                {expandedSections.has('intent_analysis') && (
                    <div className="p-4 bg-gray-900/50">
                        <p className="text-sm text-gray-400 mb-4">{prompts.intent_analysis.description}</p>

                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-gray-300">Области поиска (Scopes):</h4>
                            {Object.entries(prompts.intent_analysis.scopes).map(([key, desc]) => (
                                <div key={key} className="flex items-center gap-2 text-sm">
                                    <span className="text-sky-400 font-mono bg-gray-800 px-2 py-0.5 rounded">{key}</span>
                                    <span className="text-gray-400">→</span>
                                    <span className="text-gray-300">{desc}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Modes */}
            <div className="border border-gray-700 rounded-lg overflow-hidden">
                <button
                    onClick={() => toggleSection('modes')}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-800 hover:bg-gray-800/80 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-gray-500">
                            {expandedSections.has('modes') ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </span>
                        <Zap size={16} className="text-yellow-400" />
                        <span className="font-medium text-gray-200">⚡ Режимы RAG</span>
                    </div>
                </button>

                {expandedSections.has('modes') && (
                    <div className="p-4 bg-gray-900/50 grid grid-cols-2 gap-3">
                        {Object.entries(prompts.modes).map(([key, mode]) => (
                            <div
                                key={key}
                                className={`border rounded-lg p-3 ${mode.recommended
                                        ? 'border-green-500/50 bg-green-500/10'
                                        : 'border-gray-700/50 hover:border-gray-600'
                                    }`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium text-gray-200">{mode.name}</span>
                                    {mode.recommended && (
                                        <span className="text-xs text-green-400 bg-green-500/20 px-1.5 py-0.5 rounded">
                                            Рекомендуется
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-gray-400">{mode.description}</p>
                                <span className="text-xs text-gray-600 font-mono">{key}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// === STRATEGIES TAB ===
const StrategiesTab: React.FC<{
    prompts: RAGPrompts | null;
    copyToClipboard: (text: string, key: string) => void;
    copiedKey: string | null;
}> = ({ prompts, copyToClipboard, copiedKey }) => {
    if (!prompts) return <div className="text-gray-400">Загрузка...</div>;

    return (
        <div className="space-y-4">
            {Object.entries(prompts.search_strategies).map(([key, strategy]) => (
                <div key={key} className="border border-gray-700 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-gray-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Search size={16} className="text-blue-400" />
                            <span className="font-medium text-gray-200">{strategy.name}</span>
                            <span className="text-xs text-gray-500 bg-gray-700/50 px-2 py-0.5 rounded">{key}</span>
                        </div>
                        {strategy.prompt && (
                            <button
                                onClick={() => copyToClipboard(strategy.prompt!, key)}
                                className="p-1 hover:bg-gray-700 rounded text-gray-500 hover:text-gray-300"
                            >
                                {copiedKey === key ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                            </button>
                        )}
                    </div>

                    <div className="p-4 bg-gray-900/50">
                        <p className="text-sm text-gray-400 mb-3">{strategy.description}</p>

                        {strategy.default_weights && (
                            <div className="mb-3 flex gap-4">
                                {Object.entries(strategy.default_weights).map(([wKey, weight]) => (
                                    <div key={wKey} className="flex items-center gap-2">
                                        <span className="text-xs text-gray-400">{wKey}:</span>
                                        <span className="text-sm font-medium text-sky-400">{weight}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {strategy.prompt && (
                            <pre className="text-xs text-emerald-400 bg-gray-800/50 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                                {strategy.prompt}
                            </pre>
                        )}
                    </div>
                </div>
            ))}

            {/* Defaults */}
            <div className="border border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-800">
                    <div className="flex items-center gap-2">
                        <Settings size={16} className="text-gray-400" />
                        <span className="font-medium text-gray-200">Значения по умолчанию</span>
                    </div>
                </div>

                <div className="p-4 bg-gray-900/50 grid grid-cols-3 gap-4">
                    {Object.entries(prompts.defaults).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between p-2 bg-gray-800/50 rounded">
                            <span className="text-xs text-gray-400">{key}</span>
                            <span className="text-sm font-mono text-sky-400">{String(value)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// === DEBUG TAB ===
const DebugTab: React.FC<{
    currentSettings?: {
        mode: string;
        max_chunks: number;
        min_similarity: number;
        keyword_weight: number;
        semantic_weight: number;
        use_rerank: boolean;
        chunk_mode?: 'fixed' | 'percent' | 'adaptive';
        chunk_percent?: number;
        min_chunks?: number;
        max_chunks_limit?: number;
        orchestrator?: {
            include_history?: boolean;
            history_limit?: number;
            include_memory?: boolean;
            adaptive_chunks?: boolean;
        };
    };
    lastDebugInfo?: Record<string, any>;
    prompts: RAGPrompts | null;
}> = ({ currentSettings, lastDebugInfo, prompts }) => {
    const chunkModeLabels: Record<string, string> = {
        fixed: '📌 Фиксированное кол-во',
        percent: '📊 Процент документа',
        adaptive: '🧠 Адаптивный (AI)'
    };

    return (
        <div className="space-y-4">
            {/* Current Settings */}
            <div className="border border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-800">
                    <div className="flex items-center gap-2">
                        <Settings size={16} className="text-purple-400" />
                        <span className="font-medium text-gray-200">Текущие настройки</span>
                    </div>
                </div>

                <div className="p-4 bg-gray-900/50 space-y-4">
                    {currentSettings ? (
                        <>
                            {/* Main Settings */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="p-3 bg-gray-800/50 rounded-lg">
                                    <div className="text-xs text-gray-400 mb-1">Режим поиска</div>
                                    <div className="text-lg font-medium text-purple-400">
                                        {prompts?.modes[currentSettings.mode]?.name || currentSettings.mode}
                                    </div>
                                </div>
                                <div className="p-3 bg-gray-800/50 rounded-lg">
                                    <div className="text-xs text-gray-400 mb-1">Режим чанков</div>
                                    <div className="text-base font-medium text-sky-400">
                                        {chunkModeLabels[currentSettings.chunk_mode || 'adaptive']}
                                    </div>
                                </div>
                                <div className="p-3 bg-gray-800/50 rounded-lg">
                                    <div className="text-xs text-gray-400 mb-1">Мин. сходство</div>
                                    <div className="text-lg font-medium text-emerald-400">{(currentSettings.min_similarity * 100).toFixed(0)}%</div>
                                </div>
                            </div>

                            {/* Chunk Mode Details */}
                            <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                                <div className="text-xs text-purple-400 font-medium mb-2">📦 Настройки извлечения чанков</div>
                                <div className="grid grid-cols-4 gap-3 text-sm">
                                    {currentSettings.chunk_mode === 'fixed' && (
                                        <div>
                                            <span className="text-gray-400">Кол-во: </span>
                                            <span className="text-white font-medium">{currentSettings.max_chunks}</span>
                                        </div>
                                    )}
                                    {currentSettings.chunk_mode === 'percent' && (
                                        <div>
                                            <span className="text-gray-400">Процент: </span>
                                            <span className="text-white font-medium">{currentSettings.chunk_percent}%</span>
                                        </div>
                                    )}
                                    {currentSettings.chunk_mode === 'adaptive' && (
                                        <div>
                                            <span className="text-gray-400">Макс %: </span>
                                            <span className="text-white font-medium">{currentSettings.chunk_percent}%</span>
                                        </div>
                                    )}
                                    <div>
                                        <span className="text-gray-400">Мин: </span>
                                        <span className="text-white font-medium">{currentSettings.min_chunks || 5}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">Макс лимит: </span>
                                        <span className="text-white font-medium">{currentSettings.max_chunks_limit || 500}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Search Weights */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="p-3 bg-gray-800/50 rounded-lg">
                                    <div className="text-xs text-gray-400 mb-1">Вес семантики</div>
                                    <div className="text-lg font-medium text-blue-400">{(currentSettings.semantic_weight * 100).toFixed(0)}%</div>
                                </div>
                                <div className="p-3 bg-gray-800/50 rounded-lg">
                                    <div className="text-xs text-gray-400 mb-1">Вес ключевых слов</div>
                                    <div className="text-lg font-medium text-yellow-400">{(currentSettings.keyword_weight * 100).toFixed(0)}%</div>
                                </div>
                                <div className="p-3 bg-gray-800/50 rounded-lg">
                                    <div className="text-xs text-gray-400 mb-1">Rerank</div>
                                    <div className={`text-lg font-medium ${currentSettings.use_rerank ? 'text-green-400' : 'text-gray-500'}`}>
                                        {currentSettings.use_rerank ? '✓ Включен' : '✗ Выключен'}
                                    </div>
                                </div>
                            </div>

                            {/* Orchestrator Settings */}
                            {currentSettings.orchestrator && (
                                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                                    <div className="text-xs text-blue-400 font-medium mb-2">🤖 Оркестратор (AI Agent)</div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                        <div className="flex items-center gap-1.5">
                                            <span className={currentSettings.orchestrator.include_history ? 'text-green-400' : 'text-gray-500'}>
                                                {currentSettings.orchestrator.include_history ? '✓' : '✗'}
                                            </span>
                                            <span className="text-gray-300">История</span>
                                            {currentSettings.orchestrator.include_history && currentSettings.orchestrator.history_limit && (
                                                <span className="text-gray-500">({currentSettings.orchestrator.history_limit})</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className={currentSettings.orchestrator.include_memory ? 'text-green-400' : 'text-gray-500'}>
                                                {currentSettings.orchestrator.include_memory ? '✓' : '✗'}
                                            </span>
                                            <span className="text-gray-300">Память</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className={currentSettings.orchestrator.adaptive_chunks ? 'text-green-400' : 'text-gray-500'}>
                                                {currentSettings.orchestrator.adaptive_chunks ? '✓' : '✗'}
                                            </span>
                                            <span className="text-gray-300">Адаптивные чанки</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-gray-500 text-center py-4">
                            Настройки не заданы. Используются значения по умолчанию.
                        </div>
                    )}
                </div>
            </div>

            {/* Last Debug Info */}
            <div className="border border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-800">
                    <div className="flex items-center gap-2">
                        <Code size={16} className="text-green-400" />
                        <span className="font-medium text-gray-200">Последний RAG Debug</span>
                    </div>
                </div>

                <div className="p-4 bg-gray-900/50">
                    {lastDebugInfo ? (
                        <pre className="text-xs text-gray-300 bg-gray-800/50 p-3 rounded overflow-x-auto max-h-96">
                            {JSON.stringify(lastDebugInfo, null, 2)}
                        </pre>
                    ) : (
                        <div className="text-gray-500 text-center py-4">
                            Debug информация появится после первого RAG запроса.
                            <br />
                            <span className="text-xs">Включите debug_mode в настройках RAG для получения подробной информации.</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Tips */}
            <div className="border border-blue-500/30 bg-blue-500/10 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-400 mb-2">💡 Советы по настройке</h4>
                <ul className="text-xs text-gray-300 space-y-1">
                    <li>• <strong>Больше чанков (50-100)</strong> = больше информации, но медленнее и дороже</li>
                    <li>• <strong>Низкий порог сходства (20-40%)</strong> = больше результатов, возможен мусор</li>
                    <li>• <strong>Высокий вес семантики (70-90%)</strong> = лучше понимание смысла</li>
                    <li>• <strong>Высокий вес ключевых слов (50-70%)</strong> = точное совпадение терминов</li>
                    <li>• <strong>Rerank включен</strong> = LLM переоценивает результаты, дороже но точнее</li>
                </ul>
            </div>
        </div>
    );
};

// === PROMPT SECTION COMPONENT ===
const PromptSection: React.FC<{
    title: string;
    description: string;
    prompt: string;
    isExpanded: boolean;
    onToggle: () => void;
    onCopy: () => void;
    copied: boolean;
}> = ({ title, description, prompt, isExpanded, onToggle, onCopy, copied }) => (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
            onClick={onToggle}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-800 hover:bg-gray-800/80 transition-colors"
        >
            <div className="flex items-center gap-2">
                <span className="text-gray-500">
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <span className="font-medium text-gray-200">{title}</span>
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); onCopy(); }}
                className="p-1 hover:bg-gray-700 rounded text-gray-500 hover:text-gray-300"
            >
                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            </button>
        </button>

        {isExpanded && (
            <div className="p-4 bg-gray-900/50">
                <p className="text-sm text-gray-400 mb-3">{description}</p>
                <pre className="text-xs text-emerald-400 bg-gray-800/50 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                    {prompt}
                </pre>
            </div>
        )}
    </div>
);

export default RAGDebugPanel;
