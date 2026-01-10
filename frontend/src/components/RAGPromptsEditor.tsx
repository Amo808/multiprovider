/**
 * RAGPromptsEditor - Редактор промптов RAG
 * 
 * Позволяет редактировать все промпты, стратегии и настройки RAG
 * Изменения сохраняются на бэкенд в rag_prompts.json
 * 
 * ПОРЯДОК РАБОТЫ RAG:
 * 1. Intent Analysis → анализ запроса пользователя
 * 2. Search Strategy → выбор стратегии поиска (HyDE, Multi-Query и т.д.)
 * 3. Context Building → формирование контекста с заголовком
 * 4. Task Instructions → добавление инструкций для задачи
 */
import React, { useState, useEffect } from 'react';
import {
    Save, RefreshCw, X, ChevronDown, ChevronRight,
    Edit2, Check, AlertCircle, Loader2, ArrowRight, Zap
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
        system_prompt?: string;
        prompt: string;  // Main intent analysis prompt
        scopes: Record<string, string>;
    };
    search_strategies: Record<string, {
        name: string;
        description: string;
        prompt?: string;
        default_weights?: Record<string, number>;
    }>;
    defaults: Record<string, number | string | boolean>;
    orchestrator?: Record<string, any>;
    modes?: Record<string, {
        name: string;
        description: string;
        recommended?: boolean;
    }>;
}

interface RAGPromptsEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved?: () => void; // callback after successful save
}

export const RAGPromptsEditor: React.FC<RAGPromptsEditorProps> = ({
    isOpen,
    onClose,
    onSaved
}) => {
    const [prompts, setPrompts] = useState<RAGPrompts | null>(null);
    const [originalPrompts, setOriginalPrompts] = useState<RAGPrompts | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['task_instructions']));
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadPrompts();
        }
    }, [isOpen]);

    // Track changes
    useEffect(() => {
        if (prompts && originalPrompts) {
            setHasChanges(JSON.stringify(prompts) !== JSON.stringify(originalPrompts));
        }
    }, [prompts, originalPrompts]);

    const loadPrompts = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch('/api/rag/prompts');
            if (response.ok) {
                const data = await response.json();
                // API returns {success: true, prompts: {...}} or just the prompts object
                const promptsData = data.prompts || data;
                setPrompts(promptsData);
                setOriginalPrompts(JSON.parse(JSON.stringify(promptsData))); // Deep copy
            } else {
                setError(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (err) {
            console.error('Failed to load RAG prompts:', err);
            setError(err instanceof Error ? err.message : 'Ошибка загрузки');
        } finally {
            setLoading(false);
        }
    };

    const savePrompts = async () => {
        if (!prompts) return;

        try {
            setSaving(true);
            setError(null);
            setSuccess(null);

            const response = await fetch('/api/rag/prompts', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prompts }),
            });

            if (response.ok) {
                setSuccess('Промпты успешно сохранены!');
                setOriginalPrompts(JSON.parse(JSON.stringify(prompts)));
                setHasChanges(false);
                onSaved?.();
                setTimeout(() => setSuccess(null), 3000);
            } else {
                const data = await response.json();
                setError(data.detail || 'Ошибка сохранения');
            }
        } catch (err) {
            console.error('Failed to save RAG prompts:', err);
            setError(err instanceof Error ? err.message : 'Ошибка сохранения');
        } finally {
            setSaving(false);
        }
    };

    const resetChanges = () => {
        if (originalPrompts) {
            setPrompts(JSON.parse(JSON.stringify(originalPrompts)));
            setHasChanges(false);
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

    const updateTaskInstruction = (key: string, field: string, value: string) => {
        if (!prompts) return;
        setPrompts({
            ...prompts,
            task_instructions: {
                ...prompts.task_instructions,
                [key]: {
                    ...prompts.task_instructions[key],
                    [field]: value
                }
            }
        });
    };

    const updateSearchStrategy = (key: string, field: string, value: string) => {
        if (!prompts) return;
        setPrompts({
            ...prompts,
            search_strategies: {
                ...prompts.search_strategies,
                [key]: {
                    ...prompts.search_strategies[key],
                    [field]: value
                }
            }
        });
    };

    const updateContextHeader = (field: string, value: string) => {
        if (!prompts) return;
        setPrompts({
            ...prompts,
            context_header: {
                ...prompts.context_header,
                [field]: value
            }
        });
    };

    const updateDefault = (key: string, value: number | string | boolean) => {
        if (!prompts) return;
        setPrompts({
            ...prompts,
            defaults: {
                ...prompts.defaults,
                [key]: value
            }
        });
    };

    const updateIntentAnalysis = (field: string, value: string) => {
        if (!prompts) return;
        setPrompts({
            ...prompts,
            intent_analysis: {
                ...prompts.intent_analysis,
                [field]: value
            }
        });
    };

    const updateIntentAnalysisScope = (key: string, value: string) => {
        if (!prompts) return;
        setPrompts({
            ...prompts,
            intent_analysis: {
                ...prompts.intent_analysis,
                scopes: {
                    ...prompts.intent_analysis.scopes,
                    [key]: value
                }
            }
        });
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

                {/* Editor Panel */}
                <div className="relative w-full max-w-4xl max-h-[90vh] bg-gray-900 rounded-xl shadow-2xl border border-gray-700 flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
                        <div className="flex items-center gap-3">
                            <Edit2 size={20} className="text-purple-400" />
                            <div>
                                <h2 className="text-base font-semibold text-white">RAG Prompts Editor</h2>
                                <p className="text-xs text-gray-400">
                                    Редактирование промптов RAG-пайплайна
                                    {hasChanges && <span className="text-yellow-400 ml-2">• несохранённые изменения</span>}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Reset button */}
                            {hasChanges && (
                                <button
                                    onClick={resetChanges}
                                    className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                                >
                                    <RefreshCw size={14} />
                                    Сбросить
                                </button>
                            )}

                            {/* Save button */}
                            <button
                                onClick={savePrompts}
                                disabled={saving || !hasChanges}
                                className={`px-4 py-1.5 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors ${hasChanges
                                    ? 'bg-purple-500 text-white hover:bg-purple-600'
                                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    }`}
                            >
                                {saving ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        Сохранение...
                                    </>
                                ) : (
                                    <>
                                        <Save size={14} />
                                        Сохранить
                                    </>
                                )}
                            </button>

                            {/* Close button */}
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* RAG Pipeline Visual */}
                    <div className="px-4 py-3 bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-b border-gray-700">
                        <div className="text-xs text-gray-400 mb-2">📊 Порядок работы RAG-пайплайна:</div>
                        <div className="flex items-center justify-center gap-1 text-xs flex-wrap">
                            <span className="px-2 py-1 bg-purple-500/30 text-purple-300 rounded border border-purple-500/50">
                                1️⃣ Intent Analysis
                            </span>
                            <ArrowRight size={14} className="text-gray-500" />
                            <span className="px-2 py-1 bg-blue-500/30 text-blue-300 rounded border border-blue-500/50">
                                2️⃣ Search Strategy
                            </span>
                            <ArrowRight size={14} className="text-gray-500" />
                            <span className="px-2 py-1 bg-green-500/30 text-green-300 rounded border border-green-500/50">
                                3️⃣ Context Header
                            </span>
                            <ArrowRight size={14} className="text-gray-500" />
                            <span className="px-2 py-1 bg-yellow-500/30 text-yellow-300 rounded border border-yellow-500/50">
                                4️⃣ Task Instructions
                            </span>
                            <ArrowRight size={14} className="text-gray-500" />
                            <span className="px-2 py-1 bg-emerald-500/30 text-emerald-300 rounded border border-emerald-500/50">
                                <Zap size={12} className="inline mr-1" />LLM
                            </span>
                        </div>
                    </div>

                    {/* Alerts */}
                    {error && (
                        <div className="mx-4 mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="mx-4 mt-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm flex items-center gap-2">
                            <Check size={16} />
                            {success}
                        </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {loading ? (
                            <div className="flex items-center justify-center h-64">
                                <Loader2 size={32} className="animate-spin text-purple-400" />
                            </div>
                        ) : prompts ? (
                            <>
                                {/* 1️⃣ Intent Analysis - ПЕРВЫЙ ШАГ: АНАЛИЗ НАМЕРЕНИЙ */}
                                <Section
                                    title="1️⃣ 🧠 Анализ намерений (Intent Analysis)"
                                    description="ПЕРВЫЙ ШАГ: AI анализирует запрос пользователя и определяет что искать"
                                    expanded={expandedSections.has('intent_analysis')}
                                    onToggle={() => toggleSection('intent_analysis')}
                                >
                                    <div className="space-y-4">
                                        {/* Пояснение */}
                                        <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg text-xs text-purple-300">
                                            <strong>Как работает:</strong> Когда пользователь отправляет запрос, этот промпт анализирует его и определяет:
                                            <ul className="list-disc ml-4 mt-1">
                                                <li><strong>scope</strong> - область поиска (глава, весь документ, поиск)</li>
                                                <li><strong>task</strong> - тип задачи (суммаризация, анализ, поиск данных)</li>
                                                <li><strong>sections</strong> - конкретные разделы документа</li>
                                            </ul>
                                        </div>

                                        {/* Name & Description */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Название</label>
                                                <input
                                                    type="text"
                                                    value={prompts.intent_analysis?.name || ''}
                                                    onChange={(e) => updateIntentAnalysis('name', e.target.value)}
                                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Описание</label>
                                                <input
                                                    type="text"
                                                    value={prompts.intent_analysis?.description || ''}
                                                    onChange={(e) => updateIntentAnalysis('description', e.target.value)}
                                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm"
                                                />
                                            </div>
                                        </div>

                                        {/* System Prompt (optional) */}
                                        {prompts.intent_analysis?.system_prompt !== undefined && (
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">System Prompt (опционально)</label>
                                                <textarea
                                                    value={prompts.intent_analysis.system_prompt || ''}
                                                    onChange={(e) => updateIntentAnalysis('system_prompt', e.target.value)}
                                                    rows={2}
                                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm font-mono resize-y"
                                                    placeholder="Системный промпт для анализа намерений..."
                                                />
                                            </div>
                                        )}

                                        {/* MAIN PROMPT */}
                                        <div>
                                            <label className="block text-xs text-purple-400 mb-1 font-semibold">
                                                🎯 ГЛАВНЫЙ ПРОМПТ АНАЛИЗА
                                            </label>
                                            <div className="text-xs text-gray-500 mb-2">
                                                Переменные: {'{query}'} = запрос пользователя, {'{structure_desc}'} = структура документа
                                            </div>
                                            <textarea
                                                value={prompts.intent_analysis?.prompt || ''}
                                                onChange={(e) => updateIntentAnalysis('prompt', e.target.value)}
                                                rows={12}
                                                className="w-full px-3 py-2 bg-gray-800 border border-purple-500/50 rounded-lg text-white text-sm font-mono resize-y"
                                                placeholder="Промпт анализа намерений..."
                                            />
                                        </div>

                                        {/* Scopes */}
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-2">Области поиска (scopes)</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {prompts.intent_analysis?.scopes && Object.entries(prompts.intent_analysis.scopes).map(([key, desc]) => (
                                                    <div key={key} className="flex items-center gap-2">
                                                        <span className="text-xs text-purple-400 font-mono w-32">{key}:</span>
                                                        <input
                                                            type="text"
                                                            value={desc}
                                                            onChange={(e) => updateIntentAnalysisScope(key, e.target.value)}
                                                            className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-300 text-xs"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </Section>

                                {/* 2️⃣ Search Strategies */}
                                <Section
                                    title="2️⃣ 🔍 Стратегии поиска"
                                    description="ВТОРОЙ ШАГ: Выбор метода поиска в документах (HyDE, Multi-Query, Reranker)"
                                    expanded={expandedSections.has('search_strategies')}
                                    onToggle={() => toggleSection('search_strategies')}
                                >
                                    <div className="space-y-4">
                                        {/* Пояснение */}
                                        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-300">
                                            <strong>Как работает:</strong> После определения намерения, система выбирает стратегию поиска:
                                            <ul className="list-disc ml-4 mt-1">
                                                <li><strong>HyDE</strong> - генерирует гипотетический ответ для лучшего поиска</li>
                                                <li><strong>Multi-Query</strong> - создаёт несколько вариантов запроса</li>
                                                <li><strong>Reranker</strong> - переоценивает релевантность результатов</li>
                                            </ul>
                                        </div>

                                        {Object.entries(prompts.search_strategies).map(([key, strategy]) => (
                                            <div key={key} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-white">{strategy.name}</span>
                                                        <span className="text-xs text-gray-500 font-mono">{key}</span>
                                                    </div>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={strategy.description}
                                                    onChange={(e) => updateSearchStrategy(key, 'description', e.target.value)}
                                                    className="w-full mb-2 px-2 py-1 bg-gray-700/50 border border-gray-600 rounded text-gray-300 text-sm"
                                                />
                                                {strategy.prompt !== undefined && (
                                                    <textarea
                                                        value={strategy.prompt}
                                                        onChange={(e) => updateSearchStrategy(key, 'prompt', e.target.value)}
                                                        rows={4}
                                                        className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm font-mono resize-y"
                                                        placeholder="Промпт стратегии..."
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </Section>

                                {/* 3️⃣ Context Header */}
                                <Section
                                    title="3️⃣ 📄 Заголовок контекста"
                                    description="ТРЕТИЙ ШАГ: Инструкция для модели как использовать найденные документы"
                                    expanded={expandedSections.has('context_header')}
                                    onToggle={() => toggleSection('context_header')}
                                >
                                    <div className="space-y-3">
                                        {/* Пояснение */}
                                        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-xs text-green-300">
                                            <strong>Как работает:</strong> Этот текст добавляется перед найденными фрагментами документов.
                                            Он объясняет модели как использовать контекст и цитировать источники.
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Название</label>
                                            <input
                                                type="text"
                                                value={prompts.context_header.name}
                                                onChange={(e) => updateContextHeader('name', e.target.value)}
                                                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Промпт</label>
                                            <textarea
                                                value={prompts.context_header.prompt}
                                                onChange={(e) => updateContextHeader('prompt', e.target.value)}
                                                rows={4}
                                                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm font-mono resize-y"
                                            />
                                        </div>
                                    </div>
                                </Section>

                                {/* 4️⃣ Task Instructions */}
                                <Section
                                    title="4️⃣ 📝 Инструкции для задач"
                                    description="ЧЕТВЁРТЫЙ ШАГ: Специальные инструкции в зависимости от типа задачи"
                                    expanded={expandedSections.has('task_instructions')}
                                    onToggle={() => toggleSection('task_instructions')}
                                >
                                    <div className="space-y-4">
                                        {/* Пояснение */}
                                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-xs text-yellow-300">
                                            <strong>Как работает:</strong> В зависимости от определённой задачи (task из шага 1),
                                            добавляются специальные инструкции. Например, для "find_data" - инструкции искать числа и факты.
                                        </div>

                                        {Object.entries(prompts.task_instructions).map(([key, task]) => (
                                            <div key={key} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-lg">{task.emoji}</span>
                                                    <input
                                                        type="text"
                                                        value={task.name}
                                                        onChange={(e) => updateTaskInstruction(key, 'name', e.target.value)}
                                                        className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                                                    />
                                                    <span className="text-xs text-gray-500 font-mono">{key}</span>
                                                </div>
                                                <textarea
                                                    value={task.prompt}
                                                    onChange={(e) => updateTaskInstruction(key, 'prompt', e.target.value)}
                                                    rows={3}
                                                    placeholder="Промпт для этой задачи..."
                                                    className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm font-mono resize-y"
                                                />
                                                <input
                                                    type="text"
                                                    value={task.description}
                                                    onChange={(e) => updateTaskInstruction(key, 'description', e.target.value)}
                                                    placeholder="Описание..."
                                                    className="w-full mt-2 px-2 py-1 bg-gray-700/50 border border-gray-600 rounded text-gray-400 text-xs"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </Section>

                                {/* 5️⃣ Defaults */}
                                <Section
                                    title="5️⃣ ⚙️ Настройки по умолчанию"
                                    description="Значения по умолчанию для RAG параметров (применяются ко всем шагам)"
                                    expanded={expandedSections.has('defaults')}
                                    onToggle={() => toggleSection('defaults')}
                                >
                                    <div className="grid grid-cols-2 gap-3">
                                        {Object.entries(prompts.defaults).map(([key, value]) => (
                                            <div key={key} className="flex items-center gap-2">
                                                <label className="text-sm text-gray-400 w-40">{key}:</label>
                                                {typeof value === 'boolean' ? (
                                                    <button
                                                        onClick={() => updateDefault(key, !value)}
                                                        className={`px-3 py-1 rounded text-sm ${value
                                                            ? 'bg-green-500/20 text-green-400'
                                                            : 'bg-gray-700 text-gray-400'
                                                            }`}
                                                    >
                                                        {value ? 'ON' : 'OFF'}
                                                    </button>
                                                ) : typeof value === 'number' ? (
                                                    <input
                                                        type="number"
                                                        value={value}
                                                        onChange={(e) => updateDefault(key, parseFloat(e.target.value) || 0)}
                                                        className="w-24 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                                                        step={value < 1 ? 0.1 : 1}
                                                    />
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={value as string}
                                                        onChange={(e) => updateDefault(key, e.target.value)}
                                                        className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </Section>
                            </>
                        ) : (
                            <div className="text-center text-gray-400 py-8">
                                Не удалось загрузить промпты
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};


// Helper component for collapsible sections
const Section: React.FC<{
    title: string;
    description: string;
    expanded: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}> = ({ title, description, expanded, onToggle, children }) => (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
            onClick={onToggle}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/50 hover:bg-gray-800 transition-colors"
        >
            <div className="flex items-center gap-3">
                {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                <div className="text-left">
                    <div className="text-sm font-medium text-white">{title}</div>
                    <div className="text-xs text-gray-500">{description}</div>
                </div>
            </div>
        </button>
        {expanded && (
            <div className="p-4 bg-gray-900/50">
                {children}
            </div>
        )}
    </div>
);

export default RAGPromptsEditor;
