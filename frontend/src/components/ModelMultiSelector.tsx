import React, { useState } from 'react';
import { Check, X, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { ModelInfo, ModelProvider } from '../types';
import { cn } from '../lib/utils';

interface ModelMultiSelectorProps {
  availableModels: ModelInfo[];
  selectedModels: ModelInfo[];
  onSelectionChange: (models: ModelInfo[]) => void;
  maxSelections?: number;
  disabled?: boolean;
}

// Provider colors for visual distinction
const providerColors: Record<ModelProvider, { bg: string; text: string; border: string }> = {
  openai: { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400', border: 'border-green-500/30' },
  anthropic: { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/30' },
  gemini: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
  deepseek: { bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-500/30' },
  ollama: { bg: 'bg-gray-500/10', text: 'text-gray-600 dark:text-gray-400', border: 'border-gray-500/30' },
  groq: { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/30' },
  mistral: { bg: 'bg-yellow-500/10', text: 'text-yellow-600 dark:text-yellow-400', border: 'border-yellow-500/30' },
  chatgpt_pro: { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/30' },
};

export const ModelMultiSelector: React.FC<ModelMultiSelectorProps> = ({
  availableModels,
  selectedModels,
  onSelectionChange,
  maxSelections = 4,
  disabled = false,
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
          "w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all duration-200",
          "bg-card border-border hover:border-primary/50",
          disabled && "opacity-50 cursor-not-allowed",
          isExpanded && "ring-2 ring-primary/20"
        )}
      >
        <div className="flex items-center gap-2 flex-1 overflow-hidden">
          <Layers size={16} className="text-muted-foreground flex-shrink-0" />
          {selectedModels.length === 0 ? (
            <span className="text-muted-foreground text-sm">Select models for parallel comparison...</span>
          ) : (
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {selectedModels.map((model) => {
                const colors = providerColors[model.provider] || providerColors.ollama;
                return (
                  <span
                    key={`${model.provider}-${model.id}`}
                    className={cn(
                      "px-2 py-0.5 text-xs rounded-full whitespace-nowrap",
                      colors.bg, colors.text
                    )}
                  >
                    {model.display_name.length > 15 ? model.display_name.substring(0, 15) + '...' : model.display_name}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {selectedModels.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearSelection();
              }}
              className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
            >
              <X size={14} />
            </button>
          )}
          <span className="text-xs text-muted-foreground">{selectedModels.length}/{maxSelections}</span>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Expanded selection panel - opens UPWARD */}
      {isExpanded && (
        <div className={cn(
          "absolute bottom-full left-0 right-0 mb-1 z-50",
          "bg-card border border-border rounded-lg shadow-xl",
          "max-h-80 overflow-hidden animate-in slide-in-from-bottom-2 duration-200"
        )}>
          {/* Search */}
          <div className="p-2 border-b border-border">
            <input
              type="text"
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Models list */}
          <div className="overflow-y-auto max-h-64 p-2 space-y-3">
            {Object.entries(filteredModelsByProvider).map(([provider, models]) => {
              const colors = providerColors[provider as ModelProvider] || providerColors.ollama;
              return (
                <div key={provider}>
                  <div className={cn(
                    "text-xs font-medium uppercase tracking-wider mb-1 px-1",
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
                            "w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition-all",
                            selected
                              ? cn(colors.bg, colors.border, "border")
                              : "hover:bg-muted"
                          )}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div className={cn(
                              "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                              selected
                                ? cn(colors.bg, colors.border, "border")
                                : "border-border"
                            )}>
                              {selected && <Check size={10} className={colors.text} />}
                            </div>
                            <span className="truncate text-foreground">
                              {model.display_name}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
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
              <div className="text-center py-4 text-muted-foreground text-sm">
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
