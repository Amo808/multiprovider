import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ModelInfo, ModelProvider, AppConfig, GenerationConfig } from '../types'; // added GenerationConfig
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Bot, Zap, Eye, ChevronDown, Settings } from 'lucide-react';
import { cn } from '../lib/utils';

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
  systemPrompt?: string; // NEW
  onChangeSystemPrompt?: (prompt: string) => void; // NEW
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

export const UnifiedModelMenu: React.FC<UnifiedModelMenuProps & { loading?: boolean }> = ({ config, activeModel, activeProvider, onSelectModel, onManageProviders, className, loading, onUpdateModel, generationConfig, onChangeGeneration, systemPrompt, onChangeSystemPrompt }) => {
  const [open, setOpen] = useState(false);
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null);
  const [settingsModelId, setSettingsModelId] = useState<string | null>(null); // Track which model's settings panel is open
  const [localGenConfig, setLocalGenConfig] = useState<Partial<GenerationConfig>>({});
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  
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
  
  // Sync local state when generationConfig prop changes
  useEffect(() => {
    setLocalGenConfig({});
  }, [generationConfig]);

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
      <Button ref={buttonRef} variant="outline" size="sm" onClick={() => setOpen(o => !o)} className="rounded-full px-3 text-xs font-medium flex items-center gap-2">
        {activeModel?.supports_vision ? <Eye size={14} /> : activeModel?.supports_streaming ? <Zap size={14} /> : <Bot size={14} />}
        <span className="truncate max-w-[160px]">{activeDisplay}</span>
        {activeModel?.context_length && (
          <span className="hidden md:inline text-[10px] text-muted-foreground">{activeModel.context_length.toLocaleString()} tks</span>
        )}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open && (
        <div ref={panelRef} className={cn(
          "absolute z-50 mt-2 bg-popover text-popover-foreground border rounded-lg shadow-lg transition-all",
          settingsModelId ? "w-[520px]" : "w-[320px]"
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
                          onClick={() => { onSelectModel(m); }}
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
                <div className="flex-1 border-l dark:border-gray-700 max-h-[70vh] overflow-y-auto">
                  <div className="p-4 text-[11px]">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-sm truncate flex-1" title={m.display_name || m.name}>{m.display_name || m.name}</div>
                      <button 
                        onClick={() => setSettingsModelId(null)}
                        className="text-muted-foreground hover:text-foreground p-1"
                        title="Close settings"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="space-y-3">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-xs">Enable</span>
                        <input type="checkbox" checked={m.enabled !== false} onChange={(e) => onUpdateModel?.(providerGroup!.id, m.id, { enabled: e.target.checked })} className="accent-primary" />
                      </label>
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
                        <Button size="sm" variant="secondary" className="flex-1" onClick={() => { onSelectModel(m); }}>Use</Button>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => { onManageProviders?.(); setOpen(false); }}>Advanced</Button>
                      </div>
                      {/* Generation settings - shown when it's the active model */}
                      {displayGenConfig && isActiveModel && (
                        <div className="pt-3 border-t mt-2 space-y-3">
                          <div className="text-xs font-semibold">Generation Settings</div>
                          {/* Temperature */}
                          <div className="space-y-1">
                            <label className="flex justify-between text-[10px] font-medium"><span>Temperature</span><span>{displayGenConfig.temperature}</span></label>
                            <input type="range" min={0} max={2} step={0.1} value={displayGenConfig.temperature} onChange={(e)=>handleGenChange({ temperature: parseFloat(e.target.value) })} className="w-full" />
                          </div>
                          {/* Max tokens */}
                          <div className="space-y-1">
                            {(() => {
                              const getMaxTokensLimit = () => {
                                if (m.max_output_tokens) return m.max_output_tokens;
                                if (m.provider === 'deepseek') return m.id === 'deepseek-reasoner' ? 65536 : 32768;
                                if (m.provider === 'openai') {
                                  if (m.id?.startsWith('o1') || m.id?.startsWith('o3') || m.id?.startsWith('o4')) return 100000;
                                  if (m.id?.startsWith('gpt-5')) return 100000;
                                  if (m.id?.includes('gpt-4o')) return 16384;
                                  return 4096;
                                }
                                if (m.provider === 'anthropic') return 8192;
                                if (m.provider === 'gemini') return 65536;
                                return 8192;
                              };
                              const maxLimit = getMaxTokensLimit();
                              return (
                                <>
                                  <label className="flex justify-between text-[10px] font-medium"><span>Max Tokens</span><span>{displayGenConfig.max_tokens?.toLocaleString()}</span></label>
                                  <input type="range" min={256} max={maxLimit} step={256} value={Math.min(displayGenConfig.max_tokens || 8192, maxLimit)} onChange={(e)=>handleGenChange({ max_tokens: parseInt(e.target.value) })} className="w-full" />
                                  <div className="text-[9px] text-muted-foreground">Max: {maxLimit.toLocaleString()} tokens</div>
                                </>
                              );
                            })()}
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
                          {/* Reasoning Effort */}
                          {displayGenConfig.reasoning_effort && (
                            <div className="space-y-1">
                              <label className="text-[10px] font-medium">Reasoning Effort</label>
                              <select className="w-full text-[10px] border rounded p-1 bg-background" value={displayGenConfig.reasoning_effort} onChange={(e)=>handleGenChange({ reasoning_effort: e.target.value as 'minimal' | 'medium' | 'high' })}>
                                <option value="minimal">minimal</option>
                                <option value="medium">medium</option>
                                <option value="high">high</option>
                              </select>
                            </div>
                          )}
                          {/* Verbosity */}
                          {displayGenConfig.verbosity && (
                            <div className="space-y-1">
                              <label className="text-[10px] font-medium">Verbosity</label>
                              <select className="w-full text-[10px] border rounded p-1 bg-background" value={displayGenConfig.verbosity} onChange={(e)=>handleGenChange({ verbosity: e.target.value as 'low' | 'medium' | 'high' })}>
                                <option value="low">low</option>
                                <option value="medium">medium</option>
                                <option value="high">high</option>
                              </select>
                            </div>
                          )}
                          {/* Thinking budget */}
                          {typeof displayGenConfig.thinking_budget === 'number' && (
                            <div className="space-y-1">
                              <label className="flex justify-between text-[10px] font-medium"><span>Thinking Budget</span><span>{displayGenConfig.thinking_budget}</span></label>
                              <input type="range" min={-1} max={100} step={1} value={displayGenConfig.thinking_budget} onChange={(e)=>handleGenChange({ thinking_budget: parseInt(e.target.value) })} className="w-full" />
                              <div className="text-[9px] text-muted-foreground">-1=auto, 0=off</div>
                            </div>
                          )}
                          {/* CFG Scale */}
                          {typeof displayGenConfig.cfg_scale === 'number' && (
                            <div className="space-y-1">
                              <label className="flex justify-between text-[10px] font-medium"><span>CFG Scale</span><span>{displayGenConfig.cfg_scale}</span></label>
                              <input type="range" min={0} max={20} step={0.5} value={displayGenConfig.cfg_scale} onChange={(e)=>handleGenChange({ cfg_scale: parseFloat(e.target.value) })} className="w-full" />
                            </div>
                          )}
                          {/* Checkboxes */}
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <label className="flex items-center gap-1"><input type="checkbox" checked={displayGenConfig.stream} onChange={(e)=>handleGenChange({ stream: e.target.checked })} /> Stream</label>
                            <label className="flex items-center gap-1"><input type="checkbox" checked={!!displayGenConfig.include_thoughts} onChange={(e)=>handleGenChange({ include_thoughts: e.target.checked })} /> Thoughts</label>
                            <label className="flex items-center gap-1 col-span-2"><input type="checkbox" checked={!!displayGenConfig.free_tool_calling} onChange={(e)=>handleGenChange({ free_tool_calling: e.target.checked })} /> Free tool calling</label>
                          </div>
                          {/* System prompt */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-medium flex justify-between">
                              <span>System Prompt</span>
                              {systemPrompt && <span className="text-muted-foreground">{systemPrompt.length} chars</span>}
                            </label>
                            <textarea 
                              className="w-full text-[10px] rounded border bg-background p-2 resize-none h-24 focus:outline-none focus:ring-1 focus:ring-primary" 
                              placeholder="Set system / role prompt for this model" 
                              defaultValue={systemPrompt || ''} 
                              onBlur={(e)=>{ 
                                if(e.target.value !== systemPrompt) {
                                  onChangeSystemPrompt?.(e.target.value); 
                                }
                              }} 
                            />
                            <p className="text-[9px] text-muted-foreground">Saved automatically per model</p>
                          </div>
                        </div>
                      )}
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