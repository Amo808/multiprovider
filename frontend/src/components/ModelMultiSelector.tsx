import React, { useState } from 'react';
import { Check, X, Layers, ChevronDown, Settings } from 'lucide-react';
import { ModelInfo, ModelProvider } from '../types';
import { cn } from '../lib/utils';

interface ModelMultiSelectorProps {
  availableModels: ModelInfo[];
  selectedModels: ModelInfo[];
  onSelectionChange: (models: ModelInfo[]) => void;
  maxSelections?: number;
  disabled?: boolean;
  dropdownDirection?: 'up' | 'down';
  onModelSettings?: (model: ModelInfo) => void; // NEW: callback for opening model settings
}

// Provider colors for visual distinction - modern 2026 style
const providerColors: Record<ModelProvider, { bg: string; text: string; border: string }> = {
  openai: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  anthropic: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  gemini: { bg: 'bg-sky-500/15', text: 'text-sky-400', border: 'border-sky-500/30' },
  deepseek: { bg: 'bg-violet-500/15', text: 'text-violet-400', border: 'border-violet-500/30' },
  ollama: { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30' },
  groq: { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30' },
  mistral: { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  chatgpt_pro: { bg: 'bg-teal-500/15', text: 'text-teal-400', border: 'border-teal-500/30' },
};

export const ModelMultiSelector: React.FC<ModelMultiSelectorProps> = ({
  availableModels,
  selectedModels,
  onSelectionChange,
  maxSelections = 4,
  disabled = false,
  dropdownDirection = 'down',
  onModelSettings,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Group models by provider
  const modelsByProvider = availableModels.reduce((acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  }, {} as Record<ModelProvider, ModelInfo[]>);

  // Filter models by search
  const filteredModelsByProvider = Object.entries(modelsByProvider).reduce((acc, [provider, models]) => {
    const filtered = models.filter(m =>
      m.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filtered.length > 0) {
      acc[provider as ModelProvider] = filtered;
    }
    return acc;
  }, {} as Record<ModelProvider, ModelInfo[]>);

  const isSelected = (model: ModelInfo) =>
    selectedModels.some(m => m.id === model.id && m.provider === model.provider);

  const toggleModel = (model: ModelInfo) => {
    if (disabled) return;

    if (isSelected(model)) {
      onSelectionChange(selectedModels.filter(m => !(m.id === model.id && m.provider === model.provider)));
    } else {
      if (selectedModels.length >= maxSelections) {
        // Replace the oldest selection
        onSelectionChange([...selectedModels.slice(1), model]);
      } else {
        onSelectionChange([...selectedModels, model]);
      }
    }
  };

  const clearSelection = () => {
    onSelectionChange([]);
  };

  return (
    <div className="relative">
      {/* Compact header showing selections */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={disabled}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-300",
          "bg-white/5 dark:bg-white/[0.03] border-white/10 hover:border-white/20 text-foreground backdrop-blur-sm",
          disabled && "opacity-50 cursor-not-allowed",
          isExpanded && "ring-2 ring-violet-500/30 border-violet-500/30"
        )}
      >
        <div className="flex items-center gap-3 flex-1 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
            <Layers size={16} className="text-violet-400" />
          </div>
          {selectedModels.length === 0 ? (
            <span className="text-foreground/40 text-sm">Select up to {maxSelections} models to compare...</span>
          ) : (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
              {selectedModels.map((model) => {
                const colors = providerColors[model.provider] || providerColors.ollama;
                return (
                  <span
                    key={`${model.provider}-${model.id}`}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded-lg whitespace-nowrap border flex items-center gap-1.5 group/chip",
                      colors.bg, colors.text, colors.border
                    )}
                  >
                    {model.display_name.length > 12 ? model.display_name.substring(0, 12) + '…' : model.display_name}
                    {onModelSettings && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onModelSettings(model);
                        }}
                        className="p-0.5 hover:bg-white/20 rounded transition-all opacity-60 hover:opacity-100"
                        title={`Settings for ${model.display_name}`}
                      >
                        <Settings size={11} />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {selectedModels.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearSelection();
              }}
              className="p-1.5 hover:bg-rose-500/20 rounded-lg text-foreground/40 hover:text-rose-400 transition-all"
            >
              <X size={14} />
            </button>
          )}
          <span className="text-xs font-medium text-foreground/40 tabular-nums">{selectedModels.length}/{maxSelections}</span>
          <div className={cn(
            "transition-transform duration-200",
            isExpanded && "rotate-180"
          )}>
            <ChevronDown size={16} className="text-foreground/40" />
          </div>
        </div>
      </button>

      {/* Expanded selection panel */}
      {isExpanded && (
        <div className={cn(
          "absolute left-0 right-0 z-50",
          dropdownDirection === 'up'
            ? "bottom-full mb-2 animate-in slide-in-from-bottom-2"
            : "top-full mt-2 animate-in slide-in-from-top-2",
          "bg-background/95 dark:bg-[#1a1a1a]/95 text-foreground border border-white/10 rounded-xl shadow-2xl backdrop-blur-xl",
          "max-h-80 overflow-hidden duration-200"
        )}>
          {/* Search */}
          <div className="p-3 border-b border-white/5">
            <input
              type="text"
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2.5 text-sm bg-white/5 text-foreground border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/30 placeholder:text-foreground/30"
            />
          </div>

          {/* Models list */}
          <div className="overflow-y-auto max-h-64 p-2 space-y-3 scroll-container">
            {Object.entries(filteredModelsByProvider).map(([provider, models]) => {
              const colors = providerColors[provider as ModelProvider] || providerColors.ollama;
              return (
                <div key={provider}>
                  <div className={cn(
                    "text-[10px] font-semibold uppercase tracking-widest mb-2 px-2",
                    colors.text
                  )}>
                    {provider}
                  </div>
                  <div className="space-y-1">
                    {models.map((model) => {
                      const selected = isSelected(model);
                      return (
                        <button
                          key={`${provider}-${model.id}`}
                          type="button"
                          onClick={() => toggleModel(model)}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all duration-200",
                            selected
                              ? cn(colors.bg, colors.border, "border")
                              : "hover:bg-white/5"
                          )}
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className={cn(
                              "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                              selected
                                ? cn(colors.bg, colors.border)
                                : "border-white/20"
                            )}>
                              {selected && <Check size={12} className={colors.text} />}
                            </div>
                            <span className={cn(
                              "truncate font-medium",
                              selected ? colors.text : "text-foreground/80"
                            )}>
                              {model.display_name}
                            </span>
                          </div>
                          <span className="text-[11px] text-foreground/30 ml-2 flex-shrink-0 tabular-nums">
                            {(model.context_length / 1000).toFixed(0)}K
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {Object.keys(filteredModelsByProvider).length === 0 && (
              <div className="text-center py-6 text-foreground/30 text-sm">
                No models found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelMultiSelector;
