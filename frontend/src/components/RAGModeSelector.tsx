/**
 * RAGModeSelector Component
 * UI for selecting RAG mode in chat
 */
import React from 'react';
import {
    Book,
    Search,
    Sparkles,
    Zap,
    FileText,
    BookOpen,
    Bot,
    Lightbulb,
    XCircle,
    Brain
} from 'lucide-react';

export type RAGMode = 'off' | 'auto' | 'smart' | 'basic' | 'advanced' | 'ultimate' | 'hyde' | 'agentic' | 'full' | 'chapter';

interface RAGModeOption {
    id: RAGMode;
    name: string;
    description: string;
    icon: React.ReactNode;
    badge?: string;
    recommended?: boolean;
}

const RAG_MODES: RAGModeOption[] = [
    {
        id: 'smart',
        name: '🧠 Умный',
        description: 'AI понимает любой запрос: главы, сравнения, лазейки в законах',
        icon: <Brain size={16} />,
        badge: '🚀',
        recommended: true
    },
    {
        id: 'auto',
        name: 'Авто',
        description: 'Автоматический выбор стратегии',
        icon: <Sparkles size={16} />
    },
    {
        id: 'full',
        name: 'Вся книга',
        description: 'Загрузить весь документ',
        icon: <Book size={16} />,
        badge: '📚'
    },
    {
        id: 'chapter',
        name: 'По главам',
        description: 'Работа с отдельными главами',
        icon: <BookOpen size={16} />,
        badge: '📖'
    },
    {
        id: 'ultimate',
        name: 'Ультиматум',
        description: 'Авто-выбор лучшей стратегии',
        icon: <Zap size={16} />
    },
    {
        id: 'hyde',
        name: 'HyDE',
        description: 'Для структурных запросов',
        icon: <Lightbulb size={16} />
    },
    {
        id: 'agentic',
        name: 'Агент',
        description: 'Итеративный поиск для сложных вопросов',
        icon: <Bot size={16} />
    },
    {
        id: 'advanced',
        name: 'Продвинутый',
        description: 'Multi-query + reranking',
        icon: <Search size={16} />
    },
    {
        id: 'basic',
        name: 'Базовый',
        description: 'Быстрый простой поиск',
        icon: <FileText size={16} />
    },
    {
        id: 'off',
        name: 'Выкл',
        description: 'Без документов',
        icon: <XCircle size={16} />
    }
];

interface RAGModeSelectorProps {
    currentMode: RAGMode;
    onModeChange: (mode: RAGMode) => void;
    hasDocuments: boolean;
    disabled?: boolean;
    compact?: boolean;
}

export const RAGModeSelector: React.FC<RAGModeSelectorProps> = ({
    currentMode,
    onModeChange,
    hasDocuments,
    disabled = false,
    compact = false
}) => {
    const currentModeInfo = RAG_MODES.find(m => m.id === currentMode) || RAG_MODES[0];

    if (compact) {
        return (
            <div className="relative inline-block">
                <select
                    value={currentMode}
                    onChange={(e) => onModeChange(e.target.value as RAGMode)}
                    disabled={disabled || !hasDocuments}
                    className="appearance-none bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-sm 
                     text-foreground cursor-pointer hover:bg-secondary/70 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed
                     focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                >
                    {RAG_MODES.map((mode) => (
                        <option key={mode.id} value={mode.id}>
                            {mode.badge || ''} {mode.name}
                        </option>
                    ))}
                </select>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                    {currentModeInfo.icon}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <FileText size={16} className="text-purple-400" />
                RAG Режим
                {!hasDocuments && (
                    <span className="text-xs text-muted-foreground">(нет документов)</span>
                )}
            </div>

            <div className="grid grid-cols-3 gap-2">
                {RAG_MODES.map((mode) => (
                    <button
                        key={mode.id}
                        onClick={() => onModeChange(mode.id)}
                        disabled={disabled || !hasDocuments}
                        className={`
              flex flex-col items-center gap-1 p-2 rounded-lg border transition-all
              ${currentMode === mode.id
                                ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                                : 'bg-secondary/30 border-border/50 text-muted-foreground hover:bg-secondary/50 hover:border-border'
                            }
              ${(disabled || !hasDocuments) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              ${mode.recommended ? 'ring-1 ring-green-500/30' : ''}
            `}
                        title={mode.description}
                    >
                        <div className="flex items-center gap-1">
                            {mode.icon}
                            {mode.badge && <span className="text-xs">{mode.badge}</span>}
                        </div>
                        <span className="text-xs font-medium">{mode.name}</span>
                    </button>
                ))}
            </div>

            {/* Current mode description */}
            <div className="text-xs text-muted-foreground bg-secondary/30 rounded-lg p-2">
                <span className="font-medium text-foreground">{currentModeInfo.name}:</span>{' '}
                {currentModeInfo.description}
            </div>
        </div>
    );
};

/**
 * Quick RAG toggle for chat input
 */
interface RAGQuickToggleProps {
    enabled: boolean;
    mode: RAGMode;
    onToggle: () => void;
    onModeChange: (mode: RAGMode) => void;
    hasDocuments: boolean;
}

export const RAGQuickToggle: React.FC<RAGQuickToggleProps> = ({
    enabled,
    mode,
    onToggle,
    onModeChange,
    hasDocuments
}) => {
    const [showModes, setShowModes] = React.useState(false);
    const currentModeInfo = RAG_MODES.find(m => m.id === mode) || RAG_MODES[0];

    if (!hasDocuments) {
        return null;
    }

    return (
        <div className="relative">
            <button
                onClick={onToggle}
                onContextMenu={(e) => {
                    e.preventDefault();
                    setShowModes(!showModes);
                }}
                className={`
          flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all
          ${enabled && mode !== 'off'
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                        : 'bg-secondary/50 text-muted-foreground border border-border/50 hover:bg-secondary/70'
                    }
        `}
                title={`RAG: ${currentModeInfo.name} (ПКМ для выбора режима)`}
            >
                <FileText size={14} />
                <span>{currentModeInfo.name}</span>
                {currentModeInfo.badge && <span>{currentModeInfo.badge}</span>}
            </button>

            {/* Mode dropdown */}
            {showModes && (
                <div className="absolute bottom-full mb-2 left-0 bg-popover border border-border rounded-lg shadow-lg p-2 z-50 min-w-[200px]">
                    <div className="text-xs font-medium text-muted-foreground mb-2 px-2">
                        Выберите режим RAG
                    </div>
                    {RAG_MODES.map((m) => (
                        <button
                            key={m.id}
                            onClick={() => {
                                onModeChange(m.id);
                                setShowModes(false);
                            }}
                            className={`
                w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors
                ${mode === m.id
                                    ? 'bg-purple-500/20 text-purple-400'
                                    : 'hover:bg-secondary/50 text-foreground'
                                }
              `}
                        >
                            {m.icon}
                            <div className="flex-1">
                                <div className="font-medium">{m.badge} {m.name}</div>
                                <div className="text-xs text-muted-foreground">{m.description}</div>
                            </div>
                            {m.recommended && (
                                <span className="text-xs text-green-400">✓</span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default RAGModeSelector;
