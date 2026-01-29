/**
 * RAGSettingsPanel Component
 * Advanced RAG settings for fine-tuning retrieval behavior
 * 
 * Key settings:
 * - max_chunks: Number of chunks to retrieve (5-100)
 * - min_similarity: Minimum similarity threshold (0.1-0.9)
 * - keyword_weight: Weight for keyword/BM25 search (0-1)
 * - semantic_weight: Weight for semantic/vector search (0-1)
 * - use_rerank: Whether to use LLM reranking
 */
import React, { useState, useMemo } from 'react';
import {
    Settings2,
    Sliders,
    Search,
    Zap,
    Info,
    ChevronDown,
    ChevronUp,
    RotateCcw,
    Database,
    Percent,
    Scale,
    Sparkles,
    Brain,
    History,
    Cpu,
    Globe
} from 'lucide-react';

// Chunk retrieval mode - simplified: only percent or adaptive
export type ChunkMode = 'fixed' | 'percent' | 'adaptive';  // 'fixed' kept for backward compatibility

// Embedding provider options - OpenAI only (local models removed)
export type EmbeddingProvider = 'openai';

// Embedding model options - OpenAI models only
export const EMBEDDING_MODELS: { id: string; name: string; dimensions: number }[] = [
    { id: 'text-embedding-3-small', name: 'text-embedding-3-small (рекомендуется)', dimensions: 1536 },
    { id: 'text-embedding-3-large', name: 'text-embedding-3-large (точнее, дороже)', dimensions: 3072 },
    { id: 'text-embedding-ada-002', name: 'text-embedding-ada-002 (legacy)', dimensions: 1536 },
];

// Orchestrator settings for AI agent logic
export interface RAGOrchestratorSettings {
    include_history: boolean;        // Include conversation history
    history_limit: number;           // Max messages from history
    include_memory: boolean;         // Use long-term memory (Mem0)
    adaptive_chunks: boolean;        // AI decides how many chunks needed
    enable_web_search: boolean;      // Allow web search (future)
    enable_code_execution: boolean;  // Allow code execution (future)
}

export interface RAGSettings {
    // === EMBEDDING SETTINGS ===
    embedding_provider: EmbeddingProvider;  // 'openai' or 'local'
    embedding_model: string;                // Model ID for embeddings

    // === CHUNK MODE ===
    chunk_mode: ChunkMode;           // "fixed", "percent", "adaptive"
    max_chunks: number;              // For fixed mode (legacy)
    chunk_percent: number;           // For percent mode (0-100%)
    min_chunks: number;              // Minimum chunks even for small queries
    max_chunks_limit: number;        // Hard limit (absolute number)
    max_percent_limit: number;       // Hard limit (% of document) - NEW!

    // === SEARCH SETTINGS ===
    min_similarity: number;
    keyword_weight: number;
    semantic_weight: number;
    use_rerank: boolean;
    include_metadata: boolean;
    debug_mode: boolean;

    // === ORCHESTRATOR ===
    orchestrator: RAGOrchestratorSettings;
}

// Default orchestrator settings
export const DEFAULT_ORCHESTRATOR_SETTINGS: RAGOrchestratorSettings = {
    include_history: true,
    history_limit: 10,
    include_memory: false,  // Disabled by default - user must opt-in
    adaptive_chunks: true,
    enable_web_search: false,
    enable_code_execution: false
};

// Preset configurations for different use cases
export const RAG_PRESETS: Record<string, { name: string; description: string; icon: string; settings: Partial<RAGSettings> }> = {
    balanced: {
        name: 'Сбалансированный',
        description: 'Оптимальный баланс между точностью и полнотой',
        icon: '⚖️',
        settings: {
            chunk_mode: 'adaptive',
            chunk_percent: 30,
            max_percent_limit: 30,
            min_similarity: 0.4,
            keyword_weight: 0.3,
            semantic_weight: 0.7,
            use_rerank: true
        }
    },
    full_document: {
        name: 'Весь документ',
        description: 'Использовать 100% документа (для малых книг)',
        icon: '📚',
        settings: {
            chunk_mode: 'percent',
            chunk_percent: 100,
            max_percent_limit: 100,
            min_similarity: 0.1,
            keyword_weight: 0.2,
            semantic_weight: 0.8,
            use_rerank: false
        }
    },
    maximum: {
        name: 'Максимум информации',
        description: 'Больше контекста, ниже порог — ничего не упустить',
        icon: '🔥',
        settings: {
            chunk_mode: 'percent',
            chunk_percent: 60,
            max_percent_limit: 60,
            min_similarity: 0.2,
            keyword_weight: 0.4,
            semantic_weight: 0.6,
            use_rerank: true
        }
    },
    precise: {
        name: 'Точный поиск',
        description: 'Только высокорелевантные результаты',
        icon: '🎯',
        settings: {
            chunk_mode: 'adaptive',
            chunk_percent: 15,
            max_percent_limit: 15,
            min_similarity: 0.7,
            keyword_weight: 0.2,
            semantic_weight: 0.8,
            use_rerank: true
        }
    },
    keyword_focus: {
        name: 'Ключевые слова',
        description: 'Упор на точное совпадение терминов',
        icon: '🔤',
        settings: {
            chunk_mode: 'adaptive',
            chunk_percent: 25,
            max_percent_limit: 25,
            min_similarity: 0.35,
            keyword_weight: 0.6,
            semantic_weight: 0.4,
            use_rerank: true
        }
    },
    semantic_focus: {
        name: 'Смысловой поиск',
        description: 'Упор на понимание контекста',
        icon: '🧠',
        settings: {
            chunk_mode: 'adaptive',
            chunk_percent: 40,
            max_percent_limit: 40,
            min_similarity: 0.35,
            keyword_weight: 0.1,
            semantic_weight: 0.9,
            use_rerank: true
        }
    },
    fast: {
        name: 'Быстрый',
        description: 'Минимум обработки для скорости',
        icon: '⚡',
        settings: {
            chunk_mode: 'adaptive',
            chunk_percent: 10,
            max_percent_limit: 10,
            min_similarity: 0.5,
            keyword_weight: 0.3,
            semantic_weight: 0.7,
            use_rerank: false
        }
    }
};

export const DEFAULT_RAG_SETTINGS: RAGSettings = {
    // Embedding settings - OpenAI by default (requires OPENAI_API_KEY in backend/.env)
    embedding_provider: 'openai',
    embedding_model: 'text-embedding-3-small',

    // Chunk mode settings - DEFAULT: 100% of document with fixed percent mode
    chunk_mode: 'percent',    // Fixed percent mode by default (not adaptive)
    max_chunks: 10000,        // Legacy - kept for backward compatibility with backend
    chunk_percent: 100,       // For percent mode - 100% of document by default
    min_chunks: 5,            // Minimum chunks even for small queries
    max_chunks_limit: 10000,  // Hard limit (absolute number) - internal safety limit
    max_percent_limit: 100,   // Main user-facing setting: 100% of document by default

    // Search settings
    min_similarity: 0.4,      // 40% similarity threshold
    keyword_weight: 0.3,      // 30% keyword search
    semantic_weight: 0.7,     // 70% semantic search
    use_rerank: true,         // Enable LLM reranking by default
    include_metadata: true,
    debug_mode: false,

    // Orchestrator
    orchestrator: DEFAULT_ORCHESTRATOR_SETTINGS
};

interface RAGSettingsPanelProps {
    settings: RAGSettings;
    onChange: (settings: RAGSettings) => void;
    disabled?: boolean;
    compact?: boolean;
    className?: string;
}

// Slider component for numeric settings
const SettingSlider: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    disabled?: boolean;
    icon?: React.ReactNode;
    description?: string;
    format?: (value: number) => string;
    color?: string;
    showExample?: string;  // NEW: показать пример расчёта
}> = ({ label, value, min, max, step, onChange, disabled, icon, description, format, color = 'purple', showExample }) => {
    const percentage = ((value - min) / (max - min)) * 100;

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    {icon && <span className={`text-${color}-400`}>{icon}</span>}
                    <span className="text-sm font-medium text-foreground">{label}</span>
                </div>
                <span className={`text-sm font-mono font-bold text-${color}-400`}>
                    {format ? format(value) : value}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                disabled={disabled}
                className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                    background: `linear-gradient(to right, rgb(168, 85, 247) ${percentage}%, rgb(55, 65, 81) ${percentage}%)`
                }}
            />
            {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
            )}
            {showExample && (
                <p className="text-xs text-purple-400/70 italic">{showExample}</p>
            )}
        </div>
    );
};

// Toggle switch component
const SettingToggle: React.FC<{
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    icon?: React.ReactNode;
    description?: string;
}> = ({ label, checked, onChange, disabled, icon, description }) => (
    <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-1.5">
            {icon && <span className="text-purple-400">{icon}</span>}
            <div>
                <span className="text-sm font-medium text-foreground">{label}</span>
                {description && (
                    <p className="text-xs text-muted-foreground">{description}</p>
                )}
            </div>
        </div>
        <button
            onClick={() => onChange(!checked)}
            disabled={disabled}
            className={`
        relative inline-flex h-5 w-9 items-center rounded-full transition-colors
        ${checked ? 'bg-purple-500' : 'bg-secondary'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
        >
            <span
                className={`
          inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform
          ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}
        `}
                style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
            />
        </button>
    </div>
);

export const RAGSettingsPanel: React.FC<RAGSettingsPanelProps> = ({
    settings,
    onChange,
    disabled = false,
    compact = false,
    className = ''
}) => {
    const [isExpanded, setIsExpanded] = useState(!compact);
    const [showPresets, setShowPresets] = useState(false);

    // Calculate estimated tokens based on chunks
    const estimatedTokens = useMemo(() => {
        // Rough estimate: ~400 tokens per chunk average
        return settings.max_chunks * 400;
    }, [settings.max_chunks]);

    // Check if weights are balanced
    const weightsSum = settings.keyword_weight + settings.semantic_weight;
    const weightsValid = Math.abs(weightsSum - 1) < 0.01;

    const handlePresetSelect = (presetKey: string) => {
        const preset = RAG_PRESETS[presetKey];
        if (preset) {
            onChange({
                ...settings,
                ...preset.settings
            });
        }
        setShowPresets(false);
    };

    const handleReset = () => {
        onChange(DEFAULT_RAG_SETTINGS);
    };

    // Normalize weights to sum to 1
    const normalizeWeights = () => {
        const sum = settings.keyword_weight + settings.semantic_weight;
        if (sum > 0) {
            onChange({
                ...settings,
                keyword_weight: Number((settings.keyword_weight / sum).toFixed(2)),
                semantic_weight: Number((settings.semantic_weight / sum).toFixed(2))
            });
        }
    };

    if (compact && !isExpanded) {
        return (
            <button
                onClick={() => setIsExpanded(true)}
                disabled={disabled}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg 
          bg-secondary/50 hover:bg-secondary/70 text-muted-foreground hover:text-foreground
          transition-colors disabled:opacity-50 ${className}`}
            >
                <Sliders size={14} />
                <span>RAG: {settings.max_chunks} чанков</span>
                <ChevronDown size={12} />
            </button>
        );
    }

    return (
        <div className={`bg-card border border-border rounded-lg overflow-hidden max-h-[70vh] flex flex-col ${className}`}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-secondary/30 border-b border-border flex-shrink-0">
                <div className="flex items-center gap-2">
                    <Settings2 size={18} className="text-purple-400" />
                    <span className="font-medium text-foreground">Настройки RAG</span>
                    <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded">
                        ~{estimatedTokens.toLocaleString()} токенов
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {/* Presets dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowPresets(!showPresets)}
                            disabled={disabled}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-purple-500/20 hover:bg-purple-500/30 
                text-purple-400 rounded-lg transition-colors disabled:opacity-50"
                        >
                            <Sparkles size={12} />
                            Пресеты
                            <ChevronDown size={10} />
                        </button>
                        {showPresets && (
                            <div className="absolute right-0 top-full mt-1 w-64 bg-popover border border-border rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                                {Object.entries(RAG_PRESETS).map(([key, preset]) => (
                                    <button
                                        key={key}
                                        onClick={() => handlePresetSelect(key)}
                                        className="w-full flex items-start gap-2 px-3 py-2 hover:bg-secondary/50 transition-colors text-left"
                                    >
                                        <span className="text-lg">{preset.icon}</span>
                                        <div className="flex-1">
                                            <div className="text-sm font-medium text-foreground">{preset.name}</div>
                                            <div className="text-xs text-muted-foreground">{preset.description}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Reset button */}
                    <button
                        onClick={handleReset}
                        disabled={disabled}
                        className="p-1.5 hover:bg-secondary/50 text-muted-foreground hover:text-foreground 
              rounded transition-colors disabled:opacity-50"
                        title="Сбросить к умолчаниям"
                    >
                        <RotateCcw size={14} />
                    </button>

                    {compact && (
                        <button
                            onClick={() => setIsExpanded(false)}
                            className="p-1.5 hover:bg-secondary/50 text-muted-foreground hover:text-foreground rounded transition-colors"
                        >
                            <ChevronUp size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Settings content - scrollable */}
            <div className="p-4 space-y-5 overflow-y-auto flex-1">
                {/* === EMBEDDING MODEL SETTINGS === */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Cpu size={14} />
                        Модель эмбеддингов (OpenAI)
                    </div>

                    <div className="p-3 bg-secondary/30 rounded-lg space-y-3">
                        {/* Model selector - OpenAI only */}
                        <div>
                            <select
                                value={settings.embedding_model}
                                onChange={(e) => onChange({ ...settings, embedding_model: e.target.value })}
                                disabled={disabled}
                                className="w-full px-3 py-1.5 text-sm bg-secondary border border-border rounded-lg 
                                    text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50
                                    disabled:opacity-50"
                            >
                                {EMBEDDING_MODELS.map(model => (
                                    <option key={model.id} value={model.id}>
                                        {model.name}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-muted-foreground mt-1">
                                ⚠️ Требуется OPENAI_API_KEY в backend/.env
                            </p>
                        </div>
                    </div>
                </div>

                {/* === CHUNK MODE SELECTOR === */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Database size={14} />
                        Режим извлечения контекста
                    </div>

                    {/* Mode selector buttons - simplified: only percent and adaptive */}
                    <div className="flex gap-2">
                        {[
                            { mode: 'percent' as ChunkMode, label: 'Фиксированный %', icon: <Percent size={14} />, description: 'Всегда брать заданный процент документа' },
                            { mode: 'adaptive' as ChunkMode, label: 'Умный', icon: <Brain size={14} />, description: 'AI решает сколько нужно' },
                        ].map(({ mode, label, icon, description }) => (
                            <button
                                key={mode}
                                onClick={() => onChange({ ...settings, chunk_mode: mode })}
                                disabled={disabled}
                                className={`
                  flex-1 flex flex-col items-center gap-1 px-3 py-2 rounded-lg border transition-all
                  ${settings.chunk_mode === mode
                                        ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                                        : 'bg-secondary/30 border-border text-muted-foreground hover:bg-secondary/50'
                                    }
                  ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
                                title={description}
                            >
                                {icon}
                                <span className="text-xs font-medium">{label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Mode-specific settings */}
                    {/* Note: 'fixed' mode is hidden but kept for backward compatibility */}
                    {settings.chunk_mode === 'fixed' && (
                        <SettingSlider
                            label="Сколько контекста брать"
                            value={settings.max_percent_limit}
                            min={5}
                            max={100}
                            step={5}
                            onChange={(value) => onChange({ ...settings, max_percent_limit: value, chunk_mode: 'percent' })}
                            disabled={disabled}
                            icon={<Percent size={14} />}
                            format={(v) => `${v}%`}
                            description="Процент от документа"
                            showExample="Пример: документ 500 страниц → 20% = ~100 страниц контекста"
                        />
                    )}

                    {settings.chunk_mode === 'percent' && (
                        <>
                            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                                <p className="text-xs text-muted-foreground">
                                    Всегда берётся заданный процент документа, независимо от сложности вопроса.
                                </p>
                            </div>
                            <SettingSlider
                                label="Сколько контекста брать"
                                value={settings.chunk_percent}
                                min={5}
                                max={100}
                                step={5}
                                onChange={(value) => onChange({ ...settings, chunk_percent: value, max_percent_limit: value })}
                                disabled={disabled}
                                icon={<Percent size={14} />}
                                format={(v) => `${v}%`}
                                description="Процент от всего документа"
                                showExample="Пример: документ 500 страниц → 20% = ~100 страниц контекста"
                            />
                        </>
                    )}

                    {settings.chunk_mode === 'adaptive' && (
                        <>
                            <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                                <div className="flex items-center gap-2 text-sm text-purple-400 mb-2">
                                    <Brain size={14} />
                                    <span className="font-medium">AI сам решает</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Простой вопрос → мало контекста. Сложный анализ → больше контекста.
                                    Ты задаёшь только границы.
                                </p>
                            </div>
                            <SettingSlider
                                label="Максимум контекста"
                                value={settings.max_percent_limit}
                                min={10}
                                max={100}
                                step={5}
                                onChange={(value) => onChange({ ...settings, max_percent_limit: value, chunk_percent: value })}
                                disabled={disabled}
                                icon={<Percent size={14} />}
                                format={(v) => `до ${v}%`}
                                description="AI не возьмёт больше этого"
                                showExample="Пример: документ 500 стр, лимит 30% → макс ~150 стр"
                            />
                        </>
                    )}

                    {/* Similarity threshold */}
                    <SettingSlider
                        label="Порог релевантности"
                        value={settings.min_similarity}
                        min={0.1}
                        max={0.9}
                        step={0.05}
                        onChange={(value) => onChange({ ...settings, min_similarity: value })}
                        disabled={disabled}
                        icon={<Percent size={14} />}
                        format={(v) => `${Math.round(v * 100)}%`}
                        description="Ниже порог = больше результатов (включая менее релевантные)"
                    />
                </div>

                {/* Search weights */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Scale size={14} />
                            Баланс поиска
                        </div>
                        {!weightsValid && (
                            <button
                                onClick={normalizeWeights}
                                className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                            >
                                <Info size={12} />
                                Нормализовать
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <SettingSlider
                            label="Ключевые слова"
                            value={settings.keyword_weight}
                            min={0}
                            max={1}
                            step={0.1}
                            onChange={(value) => onChange({ ...settings, keyword_weight: value })}
                            disabled={disabled}
                            icon={<Search size={14} />}
                            format={(v) => `${Math.round(v * 100)}%`}
                            color="blue"
                        />

                        <SettingSlider
                            label="Семантика"
                            value={settings.semantic_weight}
                            min={0}
                            max={1}
                            step={0.1}
                            onChange={(value) => onChange({ ...settings, semantic_weight: value })}
                            disabled={disabled}
                            icon={<Zap size={14} />}
                            format={(v) => `${Math.round(v * 100)}%`}
                            color="green"
                        />
                    </div>

                    <div className="h-2 flex rounded-full overflow-hidden bg-secondary">
                        <div
                            className="bg-blue-500 transition-all"
                            style={{ width: `${settings.keyword_weight * 100}%` }}
                        />
                        <div
                            className="bg-green-500 transition-all"
                            style={{ width: `${settings.semantic_weight * 100}%` }}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                        <span className="text-blue-400">■</span> Ключевые слова (точное совпадение) + {' '}
                        <span className="text-green-400">■</span> Семантика (смысл)
                    </p>
                </div>

                {/* === ORCHESTRATOR SETTINGS === */}
                <div className="space-y-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Cpu size={14} />
                        AI Оркестратор (Agent Logic)
                    </div>

                    <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg mb-3">
                        <p className="text-xs text-muted-foreground">
                            Оркестратор решает: брать ли историю диалога, идти ли в память, делать ли retrieval в документах,
                            какие инструменты использовать.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <SettingToggle
                            label="История диалога"
                            checked={settings.orchestrator?.include_history ?? true}
                            onChange={(checked) => onChange({
                                ...settings,
                                orchestrator: { ...DEFAULT_ORCHESTRATOR_SETTINGS, ...settings.orchestrator, include_history: checked }
                            })}
                            disabled={disabled}
                            icon={<History size={14} />}
                        />

                        <SettingToggle
                            label="Долгосрочная память"
                            checked={settings.orchestrator?.include_memory ?? false}
                            onChange={(checked) => onChange({
                                ...settings,
                                orchestrator: { ...DEFAULT_ORCHESTRATOR_SETTINGS, ...settings.orchestrator, include_memory: checked }
                            })}
                            disabled={disabled}
                            icon={<Brain size={14} />}
                        />

                        <SettingToggle
                            label="Адаптивные чанки"
                            checked={settings.orchestrator?.adaptive_chunks ?? true}
                            onChange={(checked) => onChange({
                                ...settings,
                                orchestrator: { ...DEFAULT_ORCHESTRATOR_SETTINGS, ...settings.orchestrator, adaptive_chunks: checked }
                            })}
                            disabled={disabled}
                            icon={<Sparkles size={14} />}
                        />
                    </div>

                    {settings.orchestrator?.include_history && (
                        <SettingSlider
                            label="Лимит истории (для модели)"
                            value={settings.orchestrator?.history_limit ?? 10}
                            min={0}
                            max={50}
                            step={5}
                            onChange={(value) => onChange({
                                ...settings,
                                orchestrator: { ...DEFAULT_ORCHESTRATOR_SETTINGS, ...settings.orchestrator, history_limit: value }
                            })}
                            disabled={disabled}
                            icon={<History size={14} />}
                            description="Сколько последних сообщений видит модель (0 = без лимита). Все сообщения видны в UI."
                        />
                    )}

                    {/* Future tools (disabled for now) */}
                    <div className="pt-2 opacity-50">
                        <p className="text-xs text-muted-foreground mb-2">Будущие инструменты:</p>
                        <div className="grid grid-cols-2 gap-3">
                            <SettingToggle
                                label="Web Search"
                                checked={settings.orchestrator?.enable_web_search ?? false}
                                onChange={(checked) => onChange({
                                    ...settings,
                                    orchestrator: { ...DEFAULT_ORCHESTRATOR_SETTINGS, ...settings.orchestrator, enable_web_search: checked }
                                })}
                                disabled={true}
                                icon={<Globe size={14} />}
                            />

                            <SettingToggle
                                label="Code Execution"
                                checked={settings.orchestrator?.enable_code_execution ?? false}
                                onChange={(checked) => onChange({
                                    ...settings,
                                    orchestrator: { ...DEFAULT_ORCHESTRATOR_SETTINGS, ...settings.orchestrator, enable_code_execution: checked }
                                })}
                                disabled={true}
                                icon={<Cpu size={14} />}
                            />
                        </div>
                    </div>
                </div>

                {/* Toggles */}
                <div className="space-y-2 pt-2 border-t border-border">
                    <SettingToggle
                        label="LLM Ререйтинг"
                        checked={settings.use_rerank}
                        onChange={(checked) => onChange({ ...settings, use_rerank: checked })}
                        disabled={disabled}
                        icon={<Sparkles size={14} />}
                        description="AI переоценивает релевантность (+качество, -скорость)"
                    />

                    <SettingToggle
                        label="Метаданные документов"
                        checked={settings.include_metadata}
                        onChange={(checked) => onChange({ ...settings, include_metadata: checked })}
                        disabled={disabled}
                        icon={<Info size={14} />}
                        description="Включать информацию об источнике (глава, страница)"
                    />

                    <SettingToggle
                        label="Debug режим"
                        checked={settings.debug_mode}
                        onChange={(checked) => onChange({ ...settings, debug_mode: checked })}
                        disabled={disabled}
                        icon={<Settings2 size={14} />}
                        description="Показывать полный промпт в ответе"
                    />
                </div>
            </div>
        </div>
    );
};

/**
 * Compact inline settings for chat input area
 */
export const RAGSettingsInline: React.FC<{
    settings: RAGSettings;
    onChange: (settings: RAGSettings) => void;
    disabled?: boolean;
}> = ({ settings, onChange, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={disabled}
                className={`
          flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors
          ${isOpen
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                        : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary/70 border border-transparent'
                    }
          disabled:opacity-50
        `}
                title="Настройки RAG"
            >
                <Sliders size={12} />
                <span>{settings.max_chunks}</span>
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40 bg-black/20 md:bg-transparent"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="fixed md:absolute bottom-0 md:bottom-full left-0 right-0 md:left-auto md:right-0 md:mb-2 z-50 w-full md:w-80 max-h-[80vh]">
                        <RAGSettingsPanel
                            settings={settings}
                            onChange={onChange}
                            disabled={disabled}
                            compact={false}
                            className="shadow-xl rounded-t-2xl md:rounded-lg"
                        />
                    </div>
                </>
            )}
        </div>
    );
};

export default RAGSettingsPanel;
