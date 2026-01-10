/**
 * RAGUnifiedButton - единая кнопка для всех RAG настроек
 * 
 * Объединяет в себе:
 * - Включение/выключение RAG
 * - Выбор документов
 * - Выбор режима поиска
 * - Настройки чанков и поиска
 * - Debug панель
 */
import React, { useState, useRef, useEffect } from 'react';
import {
    FileText,
    ChevronDown,
    Check,
    Bug,
    X,
    Database,
    Hash,
    Percent,
    Brain,
    Search,
    Zap,
    RotateCcw,
    Info,
    Settings,
    History,
    Cpu,
    Globe,
    Sparkles
} from 'lucide-react';
import {
    RAGSettings,
    RAG_PRESETS,
    DEFAULT_RAG_SETTINGS,
    ChunkMode
} from './RAGSettingsPanel';

// RAG modes
export type RAGMode = 'off' | 'auto' | 'smart' | 'basic' | 'advanced' | 'ultimate' | 'hyde' | 'agentic' | 'full' | 'chapter';

const RAG_MODES: { value: RAGMode; label: string; description: string; icon: string }[] = [
    { value: 'smart', label: 'Умный', description: 'AI понимает запрос автоматически', icon: '🧠' },
    { value: 'auto', label: 'Авто', description: 'Автоматический выбор стратегии', icon: '✨' },
    { value: 'full', label: 'Полный', description: 'Загрузить весь документ', icon: '📚' },
    { value: 'chapter', label: 'По главам', description: 'Работа с отдельными главами', icon: '📖' },
    { value: 'basic', label: 'Базовый', description: 'Быстрый гибридный поиск', icon: '⚡' },
    { value: 'advanced', label: 'Расширенный', description: 'Multi-query + rerank', icon: '🔍' },
    { value: 'ultimate', label: 'Максимальный', description: 'Авто-выбор лучшей стратегии', icon: '🎯' },
    { value: 'hyde', label: 'HyDE', description: 'Для структурных запросов', icon: '📐' },
    { value: 'agentic', label: 'Агент', description: 'AI агент итеративного поиска', icon: '🤖' },
];

interface RAGUnifiedButtonProps {
    // RAG state
    enabled: boolean;
    onEnableChange: (enabled: boolean) => void;

    // Mode
    mode: RAGMode;
    onModeChange: (mode: RAGMode) => void;

    // Settings
    settings: RAGSettings;
    onSettingsChange: (settings: RAGSettings) => void;

    // Documents
    documentsCount: number;
    documents: Array<{ id: string; filename: string }>;
    selectedDocumentIds: string[];
    onDocumentToggle: (docId: string) => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;

    // Debug
    onOpenDebug?: () => void;

    // Prompts Editor
    onOpenPromptsEditor?: () => void;

    // Disabled state
    disabled?: boolean;
}

// Tabs for the popup
type TabId = 'documents' | 'mode' | 'settings' | 'prompts';

export const RAGUnifiedButton: React.FC<RAGUnifiedButtonProps> = ({
    enabled,
    onEnableChange,
    mode,
    onModeChange,
    settings,
    onSettingsChange,
    documentsCount,
    documents,
    selectedDocumentIds,
    onDocumentToggle,
    onSelectAll,
    onDeselectAll,
    onOpenDebug,
    onOpenPromptsEditor,
    disabled = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<TabId>('documents');
    const popupRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Close popup when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (isOpen &&
                popupRef.current &&
                !popupRef.current.contains(e.target as Node) &&
                buttonRef.current &&
                !buttonRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const selectedCount = selectedDocumentIds.length;
    const allSelected = selectedCount === documents.length && documents.length > 0;

    // Get current mode info
    const currentModeInfo = RAG_MODES.find(m => m.value === mode);

    return (
        <div className="relative">
            {/* Main button - compact on mobile */}
            <button
                ref={buttonRef}
                onClick={() => setIsOpen(!isOpen)}
                disabled={disabled}
                className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-all ${enabled
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    : 'bg-secondary/50 text-muted-foreground border border-border hover:border-purple-500/30'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                title={enabled ? 'Настроить RAG' : 'Включить поиск по документам'}
            >
                <FileText size={14} className="sm:w-4 sm:h-4" />
                <span className="hidden xs:inline">RAG</span>
                {enabled && documentsCount > 0 && (
                    <span className="bg-purple-500/30 px-1 sm:px-1.5 py-0.5 rounded text-[10px] sm:text-xs">
                        {selectedCount > 0 && selectedCount < documentsCount
                            ? `${selectedCount}/${documentsCount}`
                            : documentsCount}
                    </span>
                )}
                <ChevronDown size={12} className={`transition-transform hidden sm:block ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Unified Popup */}
            {isOpen && (
                <>
                    {/* Backdrop for mobile */}
                    <div
                        className="fixed inset-0 z-40 bg-black/20 md:bg-transparent"
                        onClick={() => setIsOpen(false)}
                    />

                    <div
                        ref={popupRef}
                        className="fixed md:absolute bottom-0 md:bottom-full left-0 right-0 md:left-auto md:right-auto md:mb-2 
              w-full md:w-96 max-h-[80vh] md:max-h-[70vh] bg-card border border-border 
              rounded-t-2xl md:rounded-xl shadow-2xl z-50 flex flex-col
              animate-in slide-in-from-bottom-4 md:slide-in-from-bottom-2 duration-200"
                    >
                        {/* Header with toggle and close */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30 rounded-t-2xl md:rounded-t-xl">
                            <div className="flex items-center gap-3">
                                <FileText size={18} className="text-purple-400" />
                                <span className="font-semibold text-foreground">RAG Settings</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Power toggle */}
                                <button
                                    onClick={() => onEnableChange(!enabled)}
                                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${enabled
                                        ? 'bg-purple-500 text-white'
                                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    {enabled ? 'ON' : 'OFF'}
                                </button>
                                {/* Debug button */}
                                {onOpenDebug && (
                                    <button
                                        onClick={() => {
                                            onOpenDebug();
                                            setIsOpen(false);
                                        }}
                                        className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-purple-400 transition-colors"
                                        title="Debug панель"
                                    >
                                        <Bug size={16} />
                                    </button>
                                )}
                                {/* Close button */}
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-colors md:hidden"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Tabs */}
                        {enabled && (
                            <div className="flex border-b border-border">
                                {[
                                    { id: 'documents' as TabId, label: '📄 Док.', count: documentsCount },
                                    { id: 'mode' as TabId, label: '🎯 Режим' },
                                    { id: 'settings' as TabId, label: '⚙️ Настр.' },
                                    { id: 'prompts' as TabId, label: '📝 Промпты' },
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => {
                                            if (tab.id === 'prompts' && onOpenPromptsEditor) {
                                                onOpenPromptsEditor();
                                                setIsOpen(false);
                                            } else {
                                                setActiveTab(tab.id);
                                            }
                                        }}
                                        className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${activeTab === tab.id
                                            ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-500/5'
                                            : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                    >
                                        {tab.label}
                                        {tab.count !== undefined && (
                                            <span className="ml-1 text-[10px] bg-secondary px-1 rounded">{tab.count}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Tab content with scroll */}
                        <div className="flex-1 overflow-y-auto overscroll-contain">
                            {!enabled ? (
                                <div className="p-6 text-center">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-500/10 flex items-center justify-center">
                                        <FileText size={32} className="text-purple-400" />
                                    </div>
                                    <h3 className="text-lg font-semibold mb-2">RAG выключен</h3>
                                    <p className="text-sm text-muted-foreground mb-4">
                                        Включите RAG чтобы использовать поиск по вашим документам при генерации ответов
                                    </p>
                                    <button
                                        onClick={() => onEnableChange(true)}
                                        className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                                    >
                                        Включить RAG
                                    </button>
                                </div>
                            ) : activeTab === 'documents' ? (
                                <DocumentsTab
                                    documents={documents}
                                    selectedDocumentIds={selectedDocumentIds}
                                    onDocumentToggle={onDocumentToggle}
                                    onSelectAll={onSelectAll}
                                    onDeselectAll={onDeselectAll}
                                    allSelected={allSelected}
                                />
                            ) : activeTab === 'mode' ? (
                                <ModeTab
                                    mode={mode}
                                    onModeChange={onModeChange}
                                    currentModeInfo={currentModeInfo}
                                />
                            ) : (
                                <SettingsTab
                                    settings={settings}
                                    onChange={onSettingsChange}
                                />
                            )}
                        </div>

                        {/* Footer status */}
                        {enabled && (
                            <div className="px-4 py-2 border-t border-border bg-secondary/20 text-xs text-muted-foreground">
                                <div className="flex items-center justify-between">
                                    <span>
                                        {currentModeInfo?.icon} {currentModeInfo?.label} • {selectedCount || 'все'} док.
                                    </span>
                                    <span>
                                        ~{settings.chunk_mode === 'fixed'
                                            ? `${settings.max_chunks} чанков`
                                            : settings.chunk_mode === 'percent'
                                                ? `${settings.chunk_percent}% док.`
                                                : 'адаптивно'}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

// === Documents Tab ===
const DocumentsTab: React.FC<{
    documents: Array<{ id: string; filename: string }>;
    selectedDocumentIds: string[];
    onDocumentToggle: (docId: string) => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
    allSelected: boolean;
}> = ({ documents, selectedDocumentIds, onDocumentToggle, onSelectAll, onDeselectAll, allSelected }) => {
    const selectedCount = selectedDocumentIds.length;

    return (
        <div className="p-3">
            {/* Quick actions */}
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground">
                    {selectedCount === 0 ? 'Все документы активны' : `Выбрано: ${selectedCount} из ${documents.length}`}
                </span>
                <div className="flex gap-2">
                    <button
                        onClick={onSelectAll}
                        disabled={allSelected}
                        className="text-xs text-purple-400 hover:text-purple-300 disabled:opacity-50"
                    >
                        Выбрать все
                    </button>
                    <span className="text-muted-foreground">•</span>
                    <button
                        onClick={onDeselectAll}
                        disabled={selectedCount === 0}
                        className="text-xs text-purple-400 hover:text-purple-300 disabled:opacity-50"
                    >
                        Сбросить
                    </button>
                </div>
            </div>

            {/* Document list */}
            <div className="space-y-1">
                {documents.map((doc) => {
                    const isSelected = selectedDocumentIds.includes(doc.id);
                    return (
                        <button
                            key={doc.id}
                            onClick={() => onDocumentToggle(doc.id)}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${isSelected
                                ? 'bg-purple-500/20 border border-purple-500/30'
                                : 'bg-secondary/30 border border-transparent hover:border-border'
                                }`}
                        >
                            <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-purple-500 text-white' : 'bg-secondary border border-border'
                                }`}>
                                {isSelected && <Check size={12} />}
                            </div>
                            <span className="text-sm truncate">📄 {doc.filename}</span>
                        </button>
                    );
                })}
            </div>

            {documents.length === 0 && (
                <div className="text-center py-6 text-muted-foreground">
                    <FileText size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Нет загруженных документов</p>
                </div>
            )}
        </div>
    );
};

// === Mode Tab ===
const ModeTab: React.FC<{
    mode: RAGMode;
    onModeChange: (mode: RAGMode) => void;
    currentModeInfo?: typeof RAG_MODES[0];
}> = ({ mode, onModeChange, currentModeInfo }) => {
    return (
        <div className="p-3">
            <div className="grid grid-cols-2 gap-2">
                {RAG_MODES.map((m) => (
                    <button
                        key={m.value}
                        onClick={() => onModeChange(m.value)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-all ${mode === m.value
                            ? 'bg-purple-500/20 border border-purple-500/50 text-purple-400'
                            : 'bg-secondary/30 border border-transparent hover:border-border text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        <span className="text-lg">{m.icon}</span>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{m.label}</div>
                        </div>
                    </button>
                ))}
            </div>

            {/* Current mode description */}
            {currentModeInfo && (
                <div className="mt-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{currentModeInfo.icon}</span>
                        <span className="font-medium text-purple-400">{currentModeInfo.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{currentModeInfo.description}</p>
                </div>
            )}
        </div>
    );
};

// === Settings Tab ===
const SettingsTab: React.FC<{
    settings: RAGSettings;
    onChange: (settings: RAGSettings) => void;
}> = ({ settings, onChange }) => {
    const [showPresets, setShowPresets] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showOrchestrator, setShowOrchestrator] = useState(false);

    // Check if weights are balanced
    const weightsSum = settings.keyword_weight + settings.semantic_weight;
    const weightsValid = Math.abs(weightsSum - 1) < 0.01;

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

    return (
        <div className="p-3 space-y-4">
            {/* Presets */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">🎯 Быстрые пресеты</span>
                    <button
                        onClick={() => onChange(DEFAULT_RAG_SETTINGS)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                        <RotateCcw size={10} />
                        Сброс
                    </button>
                </div>
                <div className="flex flex-wrap gap-1">
                    {Object.entries(RAG_PRESETS).slice(0, 4).map(([key, preset]) => (
                        <button
                            key={key}
                            onClick={() => onChange({ ...settings, ...preset.settings })}
                            className="px-2 py-1 text-xs bg-secondary/50 hover:bg-secondary rounded-lg transition-colors"
                        >
                            {preset.icon} {preset.name}
                        </button>
                    ))}
                    <button
                        onClick={() => setShowPresets(!showPresets)}
                        className="px-2 py-1 text-xs text-purple-400 hover:text-purple-300"
                    >
                        {showPresets ? 'Меньше' : 'Ещё...'}
                    </button>
                </div>
                {showPresets && (
                    <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(RAG_PRESETS).slice(4).map(([key, preset]) => (
                            <button
                                key={key}
                                onClick={() => onChange({ ...settings, ...preset.settings })}
                                className="px-2 py-1 text-xs bg-secondary/50 hover:bg-secondary rounded-lg transition-colors"
                            >
                                {preset.icon} {preset.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Chunk mode */}
            <div>
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                    <Database size={12} />
                    Режим контекста
                </span>
                <div className="flex gap-1">
                    {[
                        { mode: 'fixed' as ChunkMode, label: 'Фикс', icon: <Hash size={12} />, desc: 'Точное число чанков' },
                        { mode: 'percent' as ChunkMode, label: '%', icon: <Percent size={12} />, desc: 'Процент документа' },
                        { mode: 'adaptive' as ChunkMode, label: 'AI', icon: <Brain size={12} />, desc: 'AI решает' },
                    ].map(({ mode, label, icon, desc }) => (
                        <button
                            key={mode}
                            onClick={() => onChange({ ...settings, chunk_mode: mode })}
                            title={desc}
                            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-all ${settings.chunk_mode === mode
                                ? 'bg-purple-500/20 border border-purple-500/50 text-purple-400'
                                : 'bg-secondary/30 border border-transparent text-muted-foreground hover:bg-secondary/50'
                                }`}
                        >
                            {icon}
                            {label}
                        </button>
                    ))}
                </div>

                {/* Mode-specific settings */}
                <div className="mt-2 space-y-2">
                    {settings.chunk_mode === 'fixed' && (
                        <SliderSetting
                            label="Количество чанков"
                            value={settings.max_chunks}
                            min={5}
                            max={200}
                            step={5}
                            onChange={(v) => onChange({ ...settings, max_chunks: v })}
                        />
                    )}
                    {settings.chunk_mode === 'percent' && (
                        <>
                            <SliderSetting
                                label="% документа"
                                value={settings.chunk_percent}
                                min={5}
                                max={100}
                                step={5}
                                onChange={(v) => onChange({ ...settings, chunk_percent: v })}
                                format={(v) => `${v}%`}
                            />
                            <SliderSetting
                                label="Макс. лимит"
                                value={settings.max_chunks_limit}
                                min={50}
                                max={1000}
                                step={50}
                                onChange={(v) => onChange({ ...settings, max_chunks_limit: v })}
                            />
                        </>
                    )}
                    {settings.chunk_mode === 'adaptive' && (
                        <>
                            <div className="text-xs text-purple-400 bg-purple-500/10 px-2 py-1.5 rounded-lg">
                                <Brain size={12} className="inline mr-1" />
                                AI автоматически определяет объём контекста
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <SliderSetting
                                    label="Мин. чанков"
                                    value={settings.min_chunks}
                                    min={1}
                                    max={20}
                                    step={1}
                                    onChange={(v) => onChange({ ...settings, min_chunks: v })}
                                />
                                <SliderSetting
                                    label="Макс. %"
                                    value={settings.chunk_percent}
                                    min={10}
                                    max={100}
                                    step={10}
                                    onChange={(v) => onChange({ ...settings, chunk_percent: v })}
                                    format={(v) => `${v}%`}
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Similarity threshold */}
            <SliderSetting
                label="Порог релевантности"
                value={settings.min_similarity}
                min={0.1}
                max={0.9}
                step={0.05}
                onChange={(v) => onChange({ ...settings, min_similarity: v })}
                format={(v) => `${Math.round(v * 100)}%`}
            />

            {/* Search weights */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground">⚖️ Баланс поиска</span>
                    {!weightsValid && (
                        <button onClick={normalizeWeights} className="text-[10px] text-amber-400">
                            <Info size={10} className="inline mr-0.5" />
                            Норм.
                        </button>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <SliderSetting
                        label="Ключевые"
                        value={settings.keyword_weight}
                        min={0}
                        max={1}
                        step={0.1}
                        onChange={(v) => onChange({ ...settings, keyword_weight: v })}
                        format={(v) => `${Math.round(v * 100)}%`}
                        icon={<Search size={10} />}
                    />
                    <SliderSetting
                        label="Семантика"
                        value={settings.semantic_weight}
                        min={0}
                        max={1}
                        step={0.1}
                        onChange={(v) => onChange({ ...settings, semantic_weight: v })}
                        format={(v) => `${Math.round(v * 100)}%`}
                        icon={<Zap size={10} />}
                    />
                </div>
            </div>

            {/* Basic Toggles */}
            <div className="flex flex-wrap gap-2">
                <ToggleChip
                    label="Rerank"
                    checked={settings.use_rerank}
                    onChange={(v) => onChange({ ...settings, use_rerank: v })}
                />
                <ToggleChip
                    label="Metadata"
                    checked={settings.include_metadata}
                    onChange={(v) => onChange({ ...settings, include_metadata: v })}
                />
                <ToggleChip
                    label="Debug"
                    checked={settings.debug_mode}
                    onChange={(v) => onChange({ ...settings, debug_mode: v })}
                />
            </div>

            {/* === ORCHESTRATOR SETTINGS === */}
            <div className="border-t border-border pt-3">
                <button
                    onClick={() => setShowOrchestrator(!showOrchestrator)}
                    className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                    <span className="flex items-center gap-1">
                        <Cpu size={12} />
                        🤖 Оркестратор AI
                    </span>
                    <ChevronDown size={14} className={`transition-transform ${showOrchestrator ? 'rotate-180' : ''}`} />
                </button>

                {showOrchestrator && (
                    <div className="mt-3 space-y-2 pl-1">
                        <ToggleRow
                            label="История диалога"
                            description="Включать предыдущие сообщения"
                            checked={settings.orchestrator.include_history}
                            onChange={(v) => onChange({
                                ...settings,
                                orchestrator: { ...settings.orchestrator, include_history: v }
                            })}
                            icon={<History size={12} />}
                        />
                        {settings.orchestrator.include_history && (
                            <SliderSetting
                                label="Макс. сообщений"
                                value={settings.orchestrator.history_limit}
                                min={1}
                                max={50}
                                step={1}
                                onChange={(v) => onChange({
                                    ...settings,
                                    orchestrator: { ...settings.orchestrator, history_limit: v }
                                })}
                            />
                        )}
                        <ToggleRow
                            label="Долгосрочная память"
                            description="Использовать Mem0 для памяти"
                            checked={settings.orchestrator.include_memory}
                            onChange={(v) => onChange({
                                ...settings,
                                orchestrator: { ...settings.orchestrator, include_memory: v }
                            })}
                            icon={<Brain size={12} />}
                        />
                        <ToggleRow
                            label="Авто-поиск"
                            description="Автоматически искать в документах"
                            checked={settings.orchestrator.auto_retrieve}
                            onChange={(v) => onChange({
                                ...settings,
                                orchestrator: { ...settings.orchestrator, auto_retrieve: v }
                            })}
                            icon={<Search size={12} />}
                        />
                        <ToggleRow
                            label="Адаптивные чанки"
                            description="AI определяет количество контекста"
                            checked={settings.orchestrator.adaptive_chunks}
                            onChange={(v) => onChange({
                                ...settings,
                                orchestrator: { ...settings.orchestrator, adaptive_chunks: v }
                            })}
                            icon={<Sparkles size={12} />}
                        />
                        <ToggleRow
                            label="Веб-поиск"
                            description="Поиск в интернете (beta)"
                            checked={settings.orchestrator.enable_web_search}
                            onChange={(v) => onChange({
                                ...settings,
                                orchestrator: { ...settings.orchestrator, enable_web_search: v }
                            })}
                            icon={<Globe size={12} />}
                        />
                    </div>
                )}
            </div>

            {/* === ADVANCED SETTINGS === */}
            <div className="border-t border-border pt-3">
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                    <span className="flex items-center gap-1">
                        <Settings size={12} />
                        ⚙️ Расширенные настройки
                    </span>
                    <ChevronDown size={14} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                </button>

                {showAdvanced && (
                    <div className="mt-3 space-y-3 pl-1">
                        <SliderSetting
                            label="Мин. чанков"
                            value={settings.min_chunks}
                            min={1}
                            max={50}
                            step={1}
                            onChange={(v) => onChange({ ...settings, min_chunks: v })}
                        />
                        <SliderSetting
                            label="Макс. лимит чанков"
                            value={settings.max_chunks_limit}
                            min={50}
                            max={1000}
                            step={50}
                            onChange={(v) => onChange({ ...settings, max_chunks_limit: v })}
                        />
                        <div className="text-xs text-muted-foreground bg-secondary/30 p-2 rounded-lg">
                            💡 Расширенные настройки для тонкой настройки поведения RAG при работе с большими документами
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// === Helper components ===
const SliderSetting: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    format?: (value: number) => string;
    icon?: React.ReactNode;
}> = ({ label, value, min, max, step, onChange, format, icon }) => {
    const percentage = ((value - min) / (max - min)) * 100;

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                    {icon}
                    {label}
                </span>
                <span className="font-mono text-purple-400">{format ? format(value) : value}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer"
                style={{
                    background: `linear-gradient(to right, rgb(168, 85, 247) ${percentage}%, rgb(55, 65, 81) ${percentage}%)`
                }}
            />
        </div>
    );
};

const ToggleChip: React.FC<{
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => (
    <button
        onClick={() => onChange(!checked)}
        className={`px-2 py-1 text-xs rounded-lg transition-all ${checked
            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
            : 'bg-secondary/30 text-muted-foreground border border-transparent hover:border-border'
            }`}
    >
        {checked ? '✓' : '○'} {label}
    </button>
);

const ToggleRow: React.FC<{
    label: string;
    description?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    icon?: React.ReactNode;
}> = ({ label, description, checked, onChange, icon }) => (
    <div className="flex items-center justify-between py-1.5">
        <div className="flex items-center gap-2">
            {icon && <span className="text-purple-400">{icon}</span>}
            <div>
                <span className="text-xs font-medium text-foreground">{label}</span>
                {description && (
                    <p className="text-[10px] text-muted-foreground">{description}</p>
                )}
            </div>
        </div>
        <button
            onClick={() => onChange(!checked)}
            className={`
        relative inline-flex h-5 w-9 items-center rounded-full transition-colors
        ${checked ? 'bg-purple-500' : 'bg-secondary'}
      `}
        >
            <span
                className="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform"
                style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
            />
        </button>
    </div>
);

export default RAGUnifiedButton;
