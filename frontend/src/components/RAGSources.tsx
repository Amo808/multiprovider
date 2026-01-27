/**
 * RAGSources Component
 * Displays RAG document sources with citations under chat messages
 */
import React, { useState, useRef, useEffect } from 'react';
import { RAGSource } from '../types';
import { FileText, ChevronDown, ChevronUp, Check } from 'lucide-react';

interface RAGSourcesProps {
    sources: RAGSource[];
    compact?: boolean;
}

export const RAGSources: React.FC<RAGSourcesProps> = ({ sources, compact = false }) => {
    const [expanded, setExpanded] = useState(false);

    if (!sources || sources.length === 0) return null;

    const displaySources = compact && !expanded ? sources.slice(0, 2) : sources;
    const hasMore = compact && sources.length > 2;

    return (
        <div className="mt-3 border-t border-border/50 pt-3">
            <div className="flex items-center gap-2 mb-2">
                <FileText size={14} className="text-purple-400" />
                <span className="text-xs font-medium text-muted-foreground">
                    Источники ({sources.length})
                </span>
                {hasMore && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="ml-auto flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                        {expanded ? (
                            <>
                                <ChevronUp size={14} />
                                Свернуть
                            </>
                        ) : (
                            <>
                                <ChevronDown size={14} />
                                Показать все
                            </>
                        )}
                    </button>
                )}
            </div>

            <div className="space-y-2">
                {displaySources.map((source, idx) => (
                    <SourceCard key={`${source.document_id}-${source.chunk_index}`} source={source} index={idx} />
                ))}
            </div>
        </div>
    );
};

interface SourceCardProps {
    source: RAGSource;
    index: number;
}

const SourceCard: React.FC<SourceCardProps> = ({ source, index }) => {
    // Calculate relevance color
    const getRelevanceColor = (similarity: number) => {
        if (similarity >= 0.8) return 'text-green-400 bg-green-500/10 border-green-500/30';
        if (similarity >= 0.6) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
        return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
    };

    const relevanceClass = getRelevanceColor(source.similarity);
    const relevancePercent = Math.round(source.similarity * 100);

    return (
        <div className="group rounded-lg bg-secondary/30 border border-border/50 hover:border-purple-500/30 transition-all">
            <div className="flex items-start gap-3 p-2.5">
                {/* Index badge */}
                <span className="flex-shrink-0 w-5 h-5 rounded bg-purple-500/20 text-purple-400 text-xs font-medium flex items-center justify-center">
                    {source.index || index + 1}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground truncate">
                            📄 {source.document_name || 'Document'}
                        </span>
                        {source.section && (
                            <span className="text-xs text-muted-foreground">
                                § {source.section}
                            </span>
                        )}
                        {source.page && (
                            <span className="text-xs text-muted-foreground">
                                стр. {source.page}
                            </span>
                        )}
                    </div>

                    {/* Chunk info */}
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                            Фрагмент {(source.chunk_index || 0) + 1}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${relevanceClass}`}>
                            {relevancePercent}% релевантность
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

/**
 * RAG Status Indicator - shows when RAG is active during message send
 */
export const RAGStatusIndicator: React.FC<{ active: boolean; documentsCount?: number }> = ({
    active,
    documentsCount
}) => {
    if (!active) return null;

    return (
        <div className="flex items-center gap-2 text-xs text-purple-400 bg-purple-500/10 px-2 py-1 rounded-full">
            <FileText size={12} />
            <span>RAG активен</span>
            {documentsCount !== undefined && (
                <span className="text-purple-300">({documentsCount} док.)</span>
            )}
        </div>
    );
};

/**
 * RAG Toggle - allows user to enable/disable RAG with document selection and mode
 */
export type RAGMode = 'off' | 'auto' | 'smart' | 'basic' | 'advanced' | 'ultimate' | 'hyde' | 'agentic' | 'full' | 'chapter';

// Упрощённый набор режимов
const RAG_MODES: { value: RAGMode; label: string; description: string; icon: string }[] = [
    { value: 'smart', label: 'Умный', description: 'AI сам выбирает лучшую стратегию', icon: '🧠' },
    { value: 'full', label: 'Полный', description: 'Весь документ целиком', icon: '📚' },
    { value: 'chapter', label: 'По главам', description: 'Работа с конкретными главами', icon: '📖' },
    { value: 'basic', label: 'Базовый', description: 'Быстрый простой поиск', icon: '⚡' },
    { value: 'advanced', label: 'Расширенный', description: 'Multi-query + переранжирование', icon: '🔬' },
    { value: 'agentic', label: 'Агент', description: 'Итеративный поиск для сложных вопросов', icon: '🤖' },
];

interface RAGToggleProps {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    documentsCount?: number;
    documents?: Array<{ id: string; filename: string; enabled?: boolean }>;
    selectedDocumentIds?: string[];
    onDocumentToggle?: (docId: string) => void;
    onSelectAll?: () => void;
    onDeselectAll?: () => void;
    mode?: RAGMode;
    onModeChange?: (mode: RAGMode) => void;
}

export const RAGToggle: React.FC<RAGToggleProps> = ({
    enabled,
    onChange,
    documentsCount,
    documents = [],
    selectedDocumentIds = [],
    onDocumentToggle,
    onSelectAll,
    onDeselectAll,
    mode = 'ultimate',
    onModeChange
}) => {
    const [showPopup, setShowPopup] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Close popup when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (showPopup &&
                popupRef.current &&
                !popupRef.current.contains(e.target as Node) &&
                buttonRef.current &&
                !buttonRef.current.contains(e.target as Node)) {
                setShowPopup(false);
            }
        };
        window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, [showPopup]);

    const hasDocuments = documents.length > 0;
    const selectedCount = selectedDocumentIds.length;
    const allSelected = selectedCount === documents.length && documents.length > 0;

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                onClick={() => {
                    if (hasDocuments && onDocumentToggle) {
                        setShowPopup(!showPopup);
                    } else {
                        onChange(!enabled);
                    }
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${enabled
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    : 'bg-secondary/50 text-muted-foreground border border-border hover:border-purple-500/30'
                    }`}
                title={enabled ? 'Настроить RAG' : 'Включить поиск по документам'}
            >
                <FileText size={16} />
                <span>RAG</span>
                {enabled && documentsCount !== undefined && documentsCount > 0 && (
                    <span className="bg-purple-500/30 px-1.5 py-0.5 rounded text-xs">
                        {selectedCount > 0 && selectedCount < documentsCount
                            ? `${selectedCount}/${documentsCount}`
                            : documentsCount}
                    </span>
                )}
                {hasDocuments && onDocumentToggle && (
                    <ChevronDown size={14} className={`transition-transform ${showPopup ? 'rotate-180' : ''}`} />
                )}
            </button>

            {/* Document Selection Popup */}
            {showPopup && hasDocuments && (
                <div
                    ref={popupRef}
                    className="absolute bottom-full mb-2 left-0 w-80 bg-card border border-border rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
                >
                    <div className="p-3 border-b border-border">
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm">📚 RAG Documents</span>
                            <button
                                onClick={() => onChange(!enabled)}
                                className={`px-2 py-1 text-xs rounded-md transition-colors ${enabled
                                    ? 'bg-purple-500 text-white'
                                    : 'bg-secondary text-muted-foreground'
                                    }`}
                            >
                                {enabled ? 'ON' : 'OFF'}
                            </button>
                        </div>
                        {enabled && (
                            <div className="flex gap-2 mt-2">
                                <button
                                    onClick={onSelectAll}
                                    disabled={allSelected}
                                    className="text-[10px] text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                                >
                                    Select all
                                </button>
                                <span className="text-muted-foreground">•</span>
                                <button
                                    onClick={onDeselectAll}
                                    disabled={selectedCount === 0}
                                    className="text-[10px] text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                                >
                                    Deselect all
                                </button>
                            </div>
                        )}
                    </div>

                    {/* RAG Mode Selector */}
                    {enabled && onModeChange && (
                        <div className="p-3 border-b border-border">
                            <span className="text-xs font-medium text-muted-foreground mb-2 block">Search Mode</span>
                            <div className="grid grid-cols-2 gap-1.5">
                                {RAG_MODES.map((m) => (
                                    <button
                                        key={m.value}
                                        onClick={() => onModeChange(m.value)}
                                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition-all text-xs ${mode === m.value
                                            ? 'bg-purple-500/20 border border-purple-500/50 text-purple-400'
                                            : 'bg-secondary/50 border border-transparent hover:border-border text-muted-foreground hover:text-foreground'
                                            }`}
                                        title={m.description}
                                    >
                                        <span>{m.icon}</span>
                                        <span className="font-medium">{m.label}</span>
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2">
                                {RAG_MODES.find(m => m.value === mode)?.description}
                            </p>
                        </div>
                    )}

                    {enabled && (
                        <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                            {documents.map((doc) => {
                                const isSelected = selectedDocumentIds.includes(doc.id);
                                return (
                                    <button
                                        key={doc.id}
                                        onClick={() => onDocumentToggle?.(doc.id)}
                                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${isSelected
                                            ? 'bg-purple-500/20 border border-purple-500/30'
                                            : 'bg-secondary/30 border border-transparent hover:border-border'
                                            }`}
                                    >
                                        <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-purple-500 text-white' : 'bg-secondary border border-border'
                                            }`}>
                                            {isSelected && <Check size={12} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className="text-xs font-medium truncate block">
                                                📄 {doc.filename}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {!enabled && (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                            Включите RAG чтобы выбрать документы для поиска
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default RAGSources;
