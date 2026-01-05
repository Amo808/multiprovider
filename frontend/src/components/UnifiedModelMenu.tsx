import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ModelInfo, ModelProvider, AppConfig, GenerationConfig } from '../types'; // added GenerationConfig
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Bot, Zap, Eye, ChevronDown, Settings, Save } from 'lucide-react';
import { cn } from '../lib/utils';
import { getMaxTokensForModel } from '../hooks/useModelSettings';

// Simple debounce hook
function useDebounce<T extends (...args: never[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const debouncedFn = useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      fn(...args);
    }, delay);
  }, [fn, delay]);
  
  return debouncedFn;
}

interface UnifiedModelMenuProps {
  config: AppConfig;
  activeModel?: ModelInfo;
  activeProvider?: ModelProvider;
  onSelectModel: (m: ModelInfo) => void;
  onManageProviders?: () => void;
  className?: string;
  onUpdateModel?: (provider: ModelProvider, modelId: string, patch: Partial<ModelInfo>) => void; // NEW
  generationConfig?: GenerationConfig; // NEW
  onChangeGeneration?: (patch: Partial<GenerationConfig>) => void; // NEW
  systemPrompt?: string; // Combined system prompt (for display/preview)
  onChangeSystemPrompt?: (prompt: string) => void; // Per-model prompt change
  // Global system prompt props (OpenRouter-style)
  globalPrompt?: string;
  onChangeGlobalPrompt?: (prompt: string) => void;
  onSaveGlobalPrompt?: () => Promise<void>;
  globalPromptHasChanges?: boolean;
  // Per-model prompt props
  modelPrompt?: string;
  modelPromptHasChanges?: boolean;
  onSaveModelPrompt?: () => Promise<void>;  // NEW: explicit save for model prompt
}

// Helper to render capability badges
const CapabilityBadges: React.FC<{ m: ModelInfo }> = ({ m }) => (
  <div className="flex flex-wrap gap-1 mt-1">
    <Badge variant="secondary" className="px-1 py-0 text-[10px]">{m.type}</Badge>
    {m.supports_streaming && <Badge variant="outline" className="px-1 py-0 text-[10px]">Streaming</Badge>}
    {m.supports_vision && <Badge variant="outline" className="px-1 py-0 text-[10px]">Vision</Badge>}
    {m.supports_functions && <Badge variant="outline" className="px-1 py-0 text-[10px]">Functions</Badge>}
  </div>
);

const ProviderHeader: React.FC<{ provider: ModelProvider; count: number; connected?: boolean }> = ({ provider, count, connected }) => (
  <div className="flex items-center justify-between px-3 py-2 text-xs font-medium bg-muted/40 border-b dark:border-gray-700">
    <div className="flex items-center gap-2">
      <span className="capitalize">{provider}</span>
      <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`}></span>
    </div>
    <span className="text-[10px] text-muted-foreground">{count} model{count !== 1 ? 's' : ''}</span>
  </div>
);

export const UnifiedModelMenu: React.FC<UnifiedModelMenuProps & { loading?: boolean }> = ({ 
  config, activeModel, activeProvider, onSelectModel, onManageProviders, className, loading, onUpdateModel: _onUpdateModel, 
  generationConfig, onChangeGeneration, systemPrompt: _systemPrompt, onChangeSystemPrompt,
  globalPrompt, onChangeGlobalPrompt, onSaveGlobalPrompt, globalPromptHasChanges,
  modelPrompt, modelPromptHasChanges, onSaveModelPrompt
}) => {
  const [open, setOpen] = useState(false);
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null);
  const [settingsModelId, setSettingsModelId] = useState<string | null>(null);
  const [localGenConfig, setLocalGenConfig] = useState<Partial<GenerationConfig>>({});
  
  // Custom presets stored in localStorage
  const [customPresets, setCustomPresets] = useState<Array<{name: string, prompt: string}>>(() => {
    try {
      const saved = localStorage.getItem('customPromptPresets');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  
  // Save custom preset
  const saveCustomPreset = () => {
    if (!newPresetName.trim() || !modelPrompt) return;
    const updated = [...customPresets, { name: newPresetName.trim(), prompt: modelPrompt }];
    setCustomPresets(updated);
    localStorage.setItem('customPromptPresets', JSON.stringify(updated));
    setNewPresetName('');
    setShowSavePreset(false);
  };
  
  // Delete custom preset
  const deleteCustomPreset = (index: number) => {
    const updated = customPresets.filter((_, i) => i !== index);
    setCustomPresets(updated);
    localStorage.setItem('customPromptPresets', JSON.stringify(updated));
  };
  
  // Track previous active model to detect changes
  const prevActiveModelId = useRef<string | undefined>(activeModel?.id);
  
  // Debounced save to API (300ms delay)
  const debouncedSave = useDebounce((patch: Partial<GenerationConfig>) => {
    onChangeGeneration?.(patch);
  }, 300);
  
  // Handle local changes with debounced API save
  const handleGenChange = useCallback((patch: Partial<GenerationConfig>) => {
    setLocalGenConfig(prev => ({ ...prev, ...patch }));
    debouncedSave(patch);
  }, [debouncedSave]);
  
  // Merge local changes with prop config for display
  const displayGenConfig = { ...generationConfig, ...localGenConfig };
  
  // Reset local state when generationConfig prop changes (from backend/hook)
  useEffect(() => {
    setLocalGenConfig({});
  }, [generationConfig]);
  
  // CRITICAL: When active model changes, reset settingsModelId to the new model
  // and clear local config so we show fresh settings for the new model
  useEffect(() => {
    if (activeModel?.id !== prevActiveModelId.current) {
      console.log(`[UnifiedModelMenu] Active model changed from ${prevActiveModelId.current} to ${activeModel?.id}`);
      
      // If settings panel was open, switch it to the new model
      if (settingsModelId && settingsModelId === prevActiveModelId.current) {
        setSettingsModelId(activeModel?.id || null);
      }
      
      // Clear local config to show fresh settings from props/hook
      setLocalGenConfig({});
      
      prevActiveModelId.current = activeModel?.id;
    }
  }, [activeModel?.id, settingsModelId]);

  useEffect(() => {
    const close = (e: MouseEvent) => { 
      // Don't close if clicking the toggle button (let onClick handle toggle)
      if (buttonRef.current && buttonRef.current.contains(e.target as Node)) {
        return;
      }
      // Close if clicking outside the panel
      if (open && panelRef.current && !panelRef.current.contains(e.target as Node)) { 
        setOpen(false); 
        setHoveredModelId(null); 
        setSettingsModelId(null); 
      } 
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    // When menu opens, if nothing hovered/selected, default to active model
    if (open && !hoveredModelId && !settingsModelId && activeModel?.id) {
      setHoveredModelId(activeModel.id);
    }
  }, [open, hoveredModelId, settingsModelId, activeModel]);

  // Build grouped models from config.providers
  const groups = Object.entries(config.providers)
    .filter(([_, pc]) => pc.enabled && pc.models && pc.models.length > 0)
    .map(([id, pc]) => ({ id: id as ModelProvider, models: pc.models.filter(m => m.enabled !== false) }));

  const activeDisplay = activeModel?.display_name || activeModel?.name || activeProvider || 'Select Model';

  return (
    <div className={cn('relative', className)}>
      <Button ref={buttonRef} variant="ghost" size="sm" onClick={() => setOpen(o => !o)} className="rounded-xl px-3 py-2 text-sm font-medium flex items-center gap-2 bg-secondary/50 dark:bg-[#2f2f2f] hover:bg-secondary dark:hover:bg-[#3a3a3a] border-0 text-foreground">
        {activeModel?.supports_vision ? <Eye size={14} /> : activeModel?.supports_streaming ? <Zap size={14} /> : <Bot size={14} />}
        <span className="truncate max-w-[200px] text-foreground">{activeDisplay}</span>
        {activeModel?.context_length && (
          <span className="hidden md:inline text-[10px] text-muted-foreground">{activeModel.context_length.toLocaleString()} tks</span>
        )}
        <ChevronDown size={14} className={`transition-transform text-muted-foreground ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open && (
        <div ref={panelRef} className={cn(
          "absolute z-50 mt-2 bg-card dark:bg-[#2f2f2f] text-card-foreground border border-border rounded-xl shadow-xl transition-all",
          settingsModelId ? "w-[680px]" : "w-[320px]"
        )}>
          <div className="flex">
            {/* Model list */}
            <div ref={listScrollRef} className={cn(
              "max-h-[70vh] overflow-y-auto divide-y dark:divide-gray-700",
              settingsModelId ? "w-[320px]" : "w-full"
            )}>
              {loading && (
                <div className="p-6 text-center text-sm text-muted-foreground">Loading models...</div>
              )}
              {!loading && groups.map(g => (
                <div key={g.id} className="group">
                  <ProviderHeader provider={g.id} count={g.models.length} connected={true} />
                  <div className="py-1">
                    {g.models.map(m => (
                      <div
                        key={m.id}
                        onMouseEnter={() => setHoveredModelId(m.id)}
                        onMouseLeave={() => setHoveredModelId(null)}
                        className={cn(
                          'w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground transition flex items-center gap-2 text-xs group/model cursor-pointer',
                          activeModel?.id === m.id && 'bg-accent/40',
                          settingsModelId === m.id && 'bg-primary/10'
                        )}
                      >
                        {/* Model info - clickable to select */}
                        <div 
                          className="flex-1 min-w-0"
                          onClick={() => { 
                            onSelectModel(m); 
                            // If settings panel is open for another model, switch to the new one
                            if (settingsModelId && settingsModelId !== m.id) {
                              setSettingsModelId(m.id);
                              setLocalGenConfig({}); // Clear local config to load new model's settings
                            }
                          }}
                        >
                          <div className="flex items-center gap-2">
                            {m.supports_streaming ? <Zap size={12} className="text-green-500 flex-shrink-0" /> : <Bot size={12} className="text-gray-400 flex-shrink-0" />}
                            <span className="font-medium text-[11px] leading-tight truncate">{m.display_name || m.name}</span>
                            {activeModel?.id === m.id && <span className="text-[10px] text-primary font-semibold flex-shrink-0">Active</span>}
                          </div>
                          <div className="flex items-center flex-wrap gap-1 mt-1 text-[10px] text-muted-foreground">
                            <span>{m.context_length.toLocaleString()} tokens</span>
                          </div>
                          <CapabilityBadges m={m} />
                        </div>
                        {/* Settings button - appears on hover, opens settings panel */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSettingsModelId(prev => prev === m.id ? null : m.id);
                          }}
                          className={cn(
                            'p-1.5 rounded hover:bg-background/50 transition-all flex-shrink-0',
                            settingsModelId === m.id 
                              ? 'opacity-100 text-primary' 
                              : 'opacity-0 group-hover/model:opacity-70 hover:!opacity-100'
                          )}
                          title={`Settings for ${m.display_name || m.name}`}
                        >
                          <Settings size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!loading && groups.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">No providers/models configured</div>
              )}
            </div>
            {/* Side settings panel - ONLY shown when settings button is clicked */}
            {settingsModelId && (() => {
              const targetId = settingsModelId;
              const providerGroup = groups.find(g => g.models.some(m => m.id === targetId));
              const m = providerGroup?.models.find(mm => mm.id === targetId);
              const isActiveModel = m?.id === activeModel?.id;
              if (!m) return null;
              return (
                <div className="flex-1 border-l border-border max-h-[70vh] overflow-y-auto" style={{ minWidth: '360px' }}>
                  <div className="p-4 text-[11px]">
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-semibold text-sm truncate flex-1" title={m.display_name || m.name}>{m.display_name || m.name}</div>
                      <button 
                        onClick={() => setSettingsModelId(null)}
                        className="text-muted-foreground hover:text-foreground p-1"
                        title="Close settings"
                      >
                        ✕
                      </button>
                    </div>
                    
                    {/* System Prompts FIRST - most important */}
                    {isActiveModel && (
                      <div className="space-y-3 mb-4 pb-4 border-b border-border">
                        <div className="text-xs font-semibold">📝 System Prompts</div>
                        
                        {/* Global System Prompt */}
                        <div className="space-y-1.5 p-3 rounded-lg border border-border bg-secondary/30 dark:bg-[#252525]">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-medium flex items-center gap-1.5">
                              🌍 Global <span className="text-muted-foreground font-normal">(all models)</span>
                            </label>
                            {globalPromptHasChanges && (
                              <span className="text-[10px] text-orange-500 font-medium">• unsaved</span>
                            )}
                          </div>
                          <textarea 
                            className="w-full text-xs rounded-md border dark:border-gray-600 bg-input text-foreground p-2.5 resize-none h-20 focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" 
                            placeholder="Base instructions for ALL models..." 
                            value={globalPrompt || ''}
                            onChange={(e) => onChangeGlobalPrompt?.(e.target.value)}
                          />
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">
                              {(globalPrompt || '').length} chars
                            </span>
                            <Button
                              size="sm"
                              variant={globalPromptHasChanges ? "default" : "ghost"}
                              onClick={() => onSaveGlobalPrompt?.()}
                              disabled={!globalPromptHasChanges}
                              className="h-6 text-[10px] px-2"
                            >
                              <Save size={12} className="mr-1" />
                              Save
                            </Button>
                          </div>
                        </div>
                        
                        {/* Per-Model System Prompt */}
                        <div className="space-y-2 p-3 rounded-lg border dark:border-gray-600 bg-card">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-medium flex items-center gap-1.5">
                              🎯 Model Prompt
                            </label>
                            {modelPromptHasChanges && (
                              <span className="text-[10px] text-orange-500 font-medium">• changed</span>
                            )}
                          </div>
                          
                          {/* Built-in Presets */}
                          <div className="space-y-1.5">
                            <div className="text-[9px] text-muted-foreground">Built-in presets:</div>
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                onClick={() => onChangeSystemPrompt?.('You are a senior software engineer. Write clean, efficient, well-documented code with best practices.')}
                                className="px-2 py-1 text-[10px] rounded-md bg-accent hover:bg-accent/80 text-accent-foreground transition-colors"
                              >
                                💻 Coder
                              </button>
                              <button
                                onClick={() => onChangeSystemPrompt?.('You are an expert analyst. Think step by step, consider multiple angles, and provide thorough analysis.')}
                                className="px-2 py-1 text-[10px] rounded-md bg-accent hover:bg-accent/80 text-accent-foreground transition-colors"
                              >
                                🔍 Analyst
                              </button>
                              <button
                                onClick={() => onChangeSystemPrompt?.('You are a creative writer. Use vivid language, engaging storytelling, and imaginative ideas.')}
                                className="px-2 py-1 text-[10px] rounded-md bg-accent hover:bg-accent/80 text-accent-foreground transition-colors"
                              >
                                ✍️ Writer
                              </button>
                              <button
                                onClick={() => onChangeSystemPrompt?.('Be concise. Answer in 1-3 sentences max. No fluff.')}
                                className="px-2 py-1 text-[10px] rounded-md bg-accent hover:bg-accent/80 text-accent-foreground transition-colors"
                              >
                                ⚡ Brief
                              </button>
                              <button
                                onClick={() => onChangeSystemPrompt?.('')}
                                className="px-2 py-1 text-[10px] rounded-md bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
                              >
                                ✕ Clear
                              </button>
                            </div>
                          </div>
                          
                          {/* Custom Presets */}
                          {customPresets.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="text-[9px] text-muted-foreground">Your presets:</div>
                              <div className="flex flex-wrap gap-1.5">
                                {customPresets.map((preset, idx) => (
                                  <div key={idx} className="group relative">
                                    <button
                                      onClick={() => onChangeSystemPrompt?.(preset.prompt)}
                                      className="px-2 py-1 text-[10px] rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                                    >
                                      ⭐ {preset.name}
                                    </button>
                                    <button
                                      onClick={() => deleteCustomPreset(idx)}
                                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[8px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                      title="Delete preset"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Textarea */}
                          <textarea 
                            className="w-full text-xs rounded-md border dark:border-gray-600 bg-input text-foreground p-2.5 resize-none h-28 focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" 
                            placeholder="Custom instructions for this model..." 
                            value={modelPrompt || ''}
                            onChange={(e) => onChangeSystemPrompt?.(e.target.value)}
                          />
                          
                          {/* Footer with char count and buttons */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              {(modelPrompt || '').length} chars
                            </span>
                            <div className="flex gap-1.5">
                              {/* Save Model Prompt Button */}
                              <Button
                                size="sm"
                                variant={modelPromptHasChanges ? "default" : "ghost"}
                                onClick={() => onSaveModelPrompt?.()}
                                disabled={!modelPromptHasChanges}
                                className="h-6 text-[10px] px-2"
                              >
                                <Save size={12} className="mr-1" />
                                Save
                              </Button>
                              {/* Save as Preset */}
                              {showSavePreset ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={newPresetName}
                                    onChange={(e) => setNewPresetName(e.target.value)}
                                    placeholder="Preset name..."
                                    className="h-6 w-24 text-[10px] px-2 rounded border dark:border-gray-600 bg-input text-foreground"
                                    onKeyDown={(e) => e.key === 'Enter' && saveCustomPreset()}
                                    autoFocus
                                  />
                                  <Button size="sm" variant="default" onClick={saveCustomPreset} disabled={!newPresetName.trim()} className="h-6 text-[10px] px-2">
                                    Save
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setShowSavePreset(false)} className="h-6 text-[10px] px-1">
                                    ✕
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setShowSavePreset(true)}
                                  disabled={!modelPrompt}
                                  className="h-6 text-[10px] px-2"
                                >
                                  + Save Preset
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        {m.supports_streaming && <span className="px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-center">Streaming</span>}
                        {m.supports_vision && <span className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-center">Vision</span>}
                        {m.supports_functions && <span className="px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-center col-span-2">Functions</span>}
                      </div>
                      <div className="pt-2 border-t">
                        <div className="text-muted-foreground">Context length</div>
                        <div className="font-medium">{m.context_length.toLocaleString()} tokens</div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="secondary" className="flex-1" onClick={() => { 
                          onSelectModel(m); 
                          // Clear local config to load new model's settings
                          setLocalGenConfig({}); 
                        }}>Use</Button>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => { onManageProviders?.(); setOpen(false); }}>Advanced</Button>
                      </div>
                      {/* Generation settings - shown when it's the active model */}
                      {displayGenConfig && isActiveModel && (() => {
                        // Use centralized max tokens calculation from useModelSettings
                        const maxTokens = getMaxTokensForModel(m);
                        
                        // Preset configurations - synced with useModelSettings.ts
                        const applyMaxPreset = () => {
                          handleGenChange({
                            temperature: 1.0,
                            max_tokens: maxTokens,
                            top_p: 1.0,
                            frequency_penalty: 0,
                            presence_penalty: 0,
                            reasoning_effort: 'high',
                            verbosity: 'high',
                            thinking_budget: -1,
                            include_thoughts: true,
                            free_tool_calling: true,
                          });
                        };
                        
                        const applyBalancedPreset = () => {
                          handleGenChange({
                            temperature: 0.7,
                            max_tokens: Math.floor(maxTokens / 2),
                            top_p: 0.9,
                            frequency_penalty: 0.3,
                            presence_penalty: 0.3,
                            reasoning_effort: 'medium',
                            verbosity: 'medium',
                            thinking_budget: 10000,
                            include_thoughts: true,
                            free_tool_calling: true,
                          });
                        };
                        
                        const applyMinPreset = () => {
                          handleGenChange({
                            temperature: 0.3,
                            max_tokens: 1024,
                            top_p: 0.5,
                            frequency_penalty: 0.5,
                            presence_penalty: 0.5,
                            reasoning_effort: 'minimal',
                            verbosity: 'low',
                            thinking_budget: 1000,
                            include_thoughts: false,
                            free_tool_calling: false,
                          });
                        };
                        
                        // Detect current preset
                        const getCurrentPreset = (): 'MAX' | 'Balanced' | 'MIN' | 'Custom' => {
                          if (
                            displayGenConfig.temperature === 1.0 &&
                            displayGenConfig.max_tokens === maxTokens &&
                            displayGenConfig.verbosity === 'high' &&
                            displayGenConfig.reasoning_effort === 'high'
                          ) return 'MAX';
                          if (
                            displayGenConfig.temperature === 0.7 &&
                            Math.abs((displayGenConfig.max_tokens || 0) - Math.floor(maxTokens / 2)) < 100 &&
                            displayGenConfig.verbosity === 'medium' &&
                            displayGenConfig.reasoning_effort === 'medium'
                          ) return 'Balanced';
                          if (
                            displayGenConfig.temperature === 0.3 &&
                            displayGenConfig.max_tokens === 1024 &&
                            displayGenConfig.verbosity === 'low' &&
                            displayGenConfig.reasoning_effort === 'minimal'
                          ) return 'MIN';
                          return 'Custom';
                        };
                        const currentPreset = getCurrentPreset();
                        
                        return (
                        <div className="pt-3 border-t mt-2 space-y-3">
                          <div className="text-xs font-semibold flex items-center justify-between">
                            <span>Generation Settings</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                              currentPreset === 'MAX' ? 'bg-orange-500/20 text-orange-500' :
                              currentPreset === 'Balanced' ? 'bg-green-500/20 text-green-500' :
                              currentPreset === 'MIN' ? 'bg-blue-500/20 text-blue-500' :
                              'bg-gray-500/20 text-gray-500'
                            }`}>{currentPreset}</span>
                          </div>
                          
                          {/* Quick Presets */}
                          <div className="flex items-center gap-1.5 pb-2 border-b border-gray-200 dark:border-gray-700">
                            <span className="text-[9px] text-muted-foreground">Quick:</span>
                            <button
                              onClick={applyMaxPreset}
                              className={`px-1.5 py-0.5 text-[9px] font-medium rounded shadow-sm transition-all ${
                                currentPreset === 'MAX' 
                                  ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white ring-2 ring-orange-400' 
                                  : 'bg-gradient-to-r from-red-500 to-orange-500 text-white hover:from-red-600 hover:to-orange-600'
                              }`}
                              title={`🔥 MAX: temp=1.0, ${maxTokens.toLocaleString()} tokens, high reasoning`}
                            >
                              🔥 MAX
                            </button>
                            <button
                              onClick={applyBalancedPreset}
                              className={`px-1.5 py-0.5 text-[9px] font-medium rounded shadow-sm transition-all ${
                                currentPreset === 'Balanced' 
                                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white ring-2 ring-green-400' 
                                  : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600'
                              }`}
                              title={`⚖️ Balanced: temp=0.7, ${Math.floor(maxTokens/2).toLocaleString()} tokens, medium`}
                            >
                              ⚖️ Balanced
                            </button>
                            <button
                              onClick={applyMinPreset}
                              className={`px-1.5 py-0.5 text-[9px] font-medium rounded shadow-sm transition-all ${
                                currentPreset === 'MIN' 
                                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white ring-2 ring-blue-400' 
                                  : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600'
                              }`}
                              title="❄️ MIN: temp=0.3, 1K tokens, minimal"
                            >
                              ❄️ MIN
                            </button>
                          </div>
                          
                          {/* Temperature */}
                          <div className="space-y-1">
                            <label className="flex justify-between text-[10px] font-medium"><span>Temperature</span><span>{displayGenConfig.temperature}</span></label>
                            <input type="range" min={0} max={2} step={0.1} value={displayGenConfig.temperature} onChange={(e)=>handleGenChange({ temperature: parseFloat(e.target.value) })} className="w-full" />
                          </div>
                          {/* Max tokens - uses centralized maxTokens from above */}
                          <div className="space-y-1">
                            <label className="flex justify-between text-[10px] font-medium"><span>Max Tokens</span><span>{displayGenConfig.max_tokens?.toLocaleString()}</span></label>
                            <input type="range" min={256} max={maxTokens} step={256} value={Math.min(displayGenConfig.max_tokens || 8192, maxTokens)} onChange={(e)=>handleGenChange({ max_tokens: parseInt(e.target.value) })} className="w-full" />
                            <div className="text-[9px] text-muted-foreground">Max: {maxTokens.toLocaleString()} tokens</div>
                          </div>
                          {/* Top P */}
                          <div className="space-y-1">
                            <label className="flex justify-between text-[10px] font-medium"><span>Top P</span><span>{displayGenConfig.top_p}</span></label>
                            <input type="range" min={0} max={1} step={0.05} value={displayGenConfig.top_p} onChange={(e)=>handleGenChange({ top_p: parseFloat(e.target.value) })} className="w-full" />
                          </div>
                          {/* Frequency Penalty */}
                          <div className="space-y-1">
                            <label className="flex justify-between text-[10px] font-medium"><span>Freq Pen</span><span>{displayGenConfig.frequency_penalty ?? 0}</span></label>
                            <input type="range" min={-2} max={2} step={0.1} value={displayGenConfig.frequency_penalty ?? 0} onChange={(e)=>handleGenChange({ frequency_penalty: parseFloat(e.target.value) })} className="w-full" />
                          </div>
                          {/* Presence Penalty */}
                          <div className="space-y-1">
                            <label className="flex justify-between text-[10px] font-medium"><span>Pres Pen</span><span>{displayGenConfig.presence_penalty ?? 0}</span></label>
                            <input type="range" min={-2} max={2} step={0.1} value={displayGenConfig.presence_penalty ?? 0} onChange={(e)=>handleGenChange({ presence_penalty: parseFloat(e.target.value) })} className="w-full" />
                          </div>
                          {/* Top K */}
                          {typeof displayGenConfig.top_k === 'number' && (
                            <div className="space-y-1">
                              <label className="flex justify-between text-[10px] font-medium"><span>Top K</span><span>{displayGenConfig.top_k}</span></label>
                              <input type="range" min={0} max={100} step={1} value={displayGenConfig.top_k} onChange={(e)=>handleGenChange({ top_k: parseInt(e.target.value) })} className="w-full" />
                            </div>
                          )}
                          {/* Reasoning Effort - always show */}
                          <div className="space-y-1">
                            <label className="flex justify-between text-[10px] font-medium">
                              <span>🧠 Reasoning</span>
                              <span className={`font-semibold ${displayGenConfig.reasoning_effort === 'high' ? 'text-orange-500' : displayGenConfig.reasoning_effort === 'medium' ? 'text-green-500' : 'text-blue-500'}`}>
                                {displayGenConfig.reasoning_effort || 'high'}
                              </span>
                            </label>
                            <select className="w-full text-[10px] border rounded p-1 bg-background" value={displayGenConfig.reasoning_effort || 'high'} onChange={(e)=>handleGenChange({ reasoning_effort: e.target.value as 'minimal' | 'medium' | 'high' })}>
                              <option value="minimal">❄️ minimal (fast)</option>
                              <option value="medium">⚖️ medium</option>
                              <option value="high">🔥 high (best)</option>
                            </select>
                          </div>
                          {/* Verbosity - always show */}
                          <div className="space-y-1">
                            <label className="flex justify-between text-[10px] font-medium">
                              <span>📝 Verbosity</span>
                              <span className={`font-semibold ${displayGenConfig.verbosity === 'high' ? 'text-orange-500' : displayGenConfig.verbosity === 'medium' ? 'text-green-500' : 'text-blue-500'}`}>
                                {displayGenConfig.verbosity || 'high'}
                              </span>
                            </label>
                            <select className="w-full text-[10px] border rounded p-1 bg-background" value={displayGenConfig.verbosity || 'high'} onChange={(e)=>handleGenChange({ verbosity: e.target.value as 'low' | 'medium' | 'high' })}>
                              <option value="low">❄️ low (concise)</option>
                              <option value="medium">⚖️ medium</option>
                              <option value="high">🔥 high (detailed)</option>
                            </select>
                          </div>
                          {/* Thinking budget - always show */}
                          <div className="space-y-1">
                            <label className="flex justify-between text-[10px] font-medium">
                              <span>💭 Thinking</span>
                              <span className={`font-semibold ${(displayGenConfig.thinking_budget ?? -1) === -1 ? 'text-orange-500' : (displayGenConfig.thinking_budget ?? -1) === 0 ? 'text-blue-500' : 'text-green-500'}`}>
                                {(displayGenConfig.thinking_budget ?? -1) === -1 ? '∞ auto' : (displayGenConfig.thinking_budget ?? -1) === 0 ? 'OFF' : displayGenConfig.thinking_budget}
                              </span>
                            </label>
                            <input type="range" min={-1} max={100} step={1} value={displayGenConfig.thinking_budget ?? -1} onChange={(e)=>handleGenChange({ thinking_budget: parseInt(e.target.value) })} className="w-full" />
                            <div className="text-[9px] text-muted-foreground">-1=∞ unlimited, 0=off</div>
                          </div>
                          {/* CFG Scale - only show if set */}
                          {typeof displayGenConfig.cfg_scale === 'number' && (
                            <div className="space-y-1">
                              <label className="flex justify-between text-[10px] font-medium"><span>CFG Scale</span><span>{displayGenConfig.cfg_scale}</span></label>
                              <input type="range" min={0} max={20} step={0.5} value={displayGenConfig.cfg_scale} onChange={(e)=>handleGenChange({ cfg_scale: parseFloat(e.target.value) })} className="w-full" />
                            </div>
                          )}
                          {/* Checkboxes - always show */}
                          <div className="grid grid-cols-2 gap-2 text-[10px] pt-2 border-t border-gray-200 dark:border-gray-700">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={displayGenConfig.stream !== false} onChange={(e)=>handleGenChange({ stream: e.target.checked })} className="accent-primary" /> 
                              <span>Stream</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={!!displayGenConfig.include_thoughts} onChange={(e)=>handleGenChange({ include_thoughts: e.target.checked })} className="accent-primary" /> 
                              <span className={displayGenConfig.include_thoughts ? 'text-orange-500 font-medium' : ''}>
                                💭 Thoughts {displayGenConfig.include_thoughts ? 'ON' : 'OFF'}
                              </span>
                            </label>
                            <label className="flex items-center gap-1.5 col-span-2 cursor-pointer">
                              <input type="checkbox" checked={!!displayGenConfig.free_tool_calling} onChange={(e)=>handleGenChange({ free_tool_calling: e.target.checked })} className="accent-primary" /> 
                              <span className={displayGenConfig.free_tool_calling ? 'text-green-500 font-medium' : ''}>
                                🔧 Free tool calling {displayGenConfig.free_tool_calling ? 'ON' : 'OFF'}
                              </span>
                            </label>
                          </div>
                        </div>
                        );
                      })()}
                      {/* Show hint for non-active models */}
                      {!isActiveModel && (
                        <div className="pt-3 border-t mt-2">
                          <p className="text-[10px] text-muted-foreground text-center">
                            Click "Use" to select this model and edit generation settings
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          {onManageProviders && (
            <div className="border-t p-2 flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => { onManageProviders(); setOpen(false); }}>Manage Providers</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UnifiedModelMenu;