import React, { useState, useRef, useEffect } from 'react';
import { ModelInfo, ModelProvider, AppConfig, GenerationConfig } from '../types'; // added GenerationConfig
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Bot, Zap, Eye, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (open && panelRef.current && !panelRef.current.contains(e.target as Node)) { setOpen(false); setHoveredModelId(null); } };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    // When menu opens, if nothing hovered, default to active model
    if (open && !hoveredModelId && activeModel?.id) {
      setHoveredModelId(activeModel.id);
    }
  }, [open, hoveredModelId, activeModel]);

  // Build grouped models from config.providers
  const groups = Object.entries(config.providers)
    .filter(([_, pc]) => pc.enabled && pc.models && pc.models.length > 0)
    .map(([id, pc]) => ({ id: id as ModelProvider, models: pc.models.filter(m => m.enabled !== false) }));

  const activeDisplay = activeModel?.display_name || activeModel?.name || activeProvider || 'Select Model';

  return (
    <div className={cn('relative', className)}>
      <Button variant="outline" size="sm" onClick={() => setOpen(o => !o)} className="rounded-full px-3 text-xs font-medium flex items-center gap-2">
        {activeModel?.supports_vision ? <Eye size={14} /> : activeModel?.supports_streaming ? <Zap size={14} /> : <Bot size={14} />}
        <span className="truncate max-w-[160px]">{activeDisplay}</span>
        {activeModel?.context_length && (
          <span className="hidden md:inline text-[10px] text-muted-foreground">{activeModel.context_length.toLocaleString()} tks</span>
        )}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open && (
        <div ref={panelRef} className="absolute z-50 mt-2 w-[520px] bg-popover text-popover-foreground border rounded-lg shadow-lg">
          <div className="flex">
            {/* Model list */}
            <div ref={listScrollRef} className="max-h-[70vh] overflow-y-auto w-[320px] divide-y dark:divide-gray-700">
              {loading && (
                <div className="p-6 text-center text-sm text-muted-foreground">Loading models...</div>
              )}
              {!loading && groups.map(g => (
                <div key={g.id} className="group">
                  <ProviderHeader provider={g.id} count={g.models.length} connected={true} />
                  <div className="py-1">
                    {g.models.map(m => (
                      <button
                        key={m.id}
                        onMouseEnter={() => setHoveredModelId(m.id)}
                        onFocus={() => setHoveredModelId(m.id)}
                        onClick={() => { onSelectModel(m); setOpen(false); }}
                        className={cn('w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground transition flex flex-col text-xs', activeModel?.id === m.id && 'bg-accent/40')}
                      >
                        <div className="flex items-center gap-2">
                          {m.supports_streaming ? <Zap size={12} className="text-green-500" /> : <Bot size={12} className="text-gray-400" />}
                          <span className="font-medium text-[11px] leading-tight truncate max-w-[180px]">{m.display_name || m.name}</span>
                          {activeModel?.id === m.id && <span className="ml-auto text-[10px] text-primary font-semibold">Active</span>}
                        </div>
                        <div className="flex items-center flex-wrap gap-1 mt-1 text-[10px] text-muted-foreground">
                          <span>{m.context_length.toLocaleString()} tokens</span>
                        </div>
                        <CapabilityBadges m={m} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {!loading && groups.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">No providers/models configured</div>
              )}
            </div>
            {/* Side settings panel */}
            <div className="flex-1 border-l dark:border-gray-700 max-h-[70vh] overflow-y-auto">
              {(() => {
                const targetId = hoveredModelId || activeModel?.id || null;
                if (targetId) {
                  const providerGroup = groups.find(g => g.models.some(m => m.id === targetId));
                  const m = providerGroup?.models.find(mm => mm.id === targetId);
                  if (m) return (
                    <div className="p-4 text-[11px]">
                      <div className="font-semibold mb-2 text-sm truncate" title={m.display_name || m.name}>{m.display_name || m.name}</div>
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
                          <Button size="sm" variant="secondary" className="flex-1" onClick={() => { onSelectModel(m); setOpen(false); }}>Use</Button>
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => { onManageProviders?.(); setOpen(false); }}>Advanced</Button>
                        </div>
                        {generationConfig && (
                          <div className="pt-3 border-t mt-2 space-y-3">
                            <div className="text-xs font-semibold">Generation</div>
                            {/* Temperature */}
                            <div className="space-y-1">
                              <label className="flex justify-between text-[10px] font-medium"><span>Temperature</span><span>{generationConfig.temperature}</span></label>
                              <input type="range" min={0} max={2} step={0.1} value={generationConfig.temperature} onChange={(e)=>onChangeGeneration?.({ temperature: parseFloat(e.target.value) })} />
                            </div>
                            {/* Max tokens */}
                            <div className="space-y-1">
                              <label className="flex justify-between text-[10px] font-medium"><span>Max Tokens</span><span>{generationConfig.max_tokens}</span></label>
                              <input type="range" min={256} max={activeModel?.max_output_tokens || activeModel?.recommended_max_tokens || 8192} step={256} value={generationConfig.max_tokens} onChange={(e)=>onChangeGeneration?.({ max_tokens: parseInt(e.target.value) })} />
                            </div>
                            {/* Top P */}
                            <div className="space-y-1">
                              <label className="flex justify-between text-[10px] font-medium"><span>Top P</span><span>{generationConfig.top_p}</span></label>
                              <input type="range" min={0} max={1} step={0.05} value={generationConfig.top_p} onChange={(e)=>onChangeGeneration?.({ top_p: parseFloat(e.target.value) })} />
                            </div>
                            {/* Frequency Penalty */}
                            <div className="space-y-1">
                              <label className="flex justify-between text-[10px] font-medium"><span>Freq Pen</span><span>{generationConfig.frequency_penalty ?? 0}</span></label>
                              <input type="range" min={-2} max={2} step={0.1} value={generationConfig.frequency_penalty ?? 0} onChange={(e)=>onChangeGeneration?.({ frequency_penalty: parseFloat(e.target.value) })} />
                            </div>
                            {/* Presence Penalty */}
                            <div className="space-y-1">
                              <label className="flex justify-between text-[10px] font-medium"><span>Pres Pen</span><span>{generationConfig.presence_penalty ?? 0}</span></label>
                              <input type="range" min={-2} max={2} step={0.1} value={generationConfig.presence_penalty ?? 0} onChange={(e)=>onChangeGeneration?.({ presence_penalty: parseFloat(e.target.value) })} />
                            </div>
                            {/* Top K (if supported) */}
                            {typeof generationConfig.top_k === 'number' && (
                              <div className="space-y-1">
                                <label className="flex justify-between text-[10px] font-medium"><span>Top K</span><span>{generationConfig.top_k}</span></label>
                                <input type="range" min={0} max={100} step={1} value={generationConfig.top_k} onChange={(e)=>onChangeGeneration?.({ top_k: parseInt(e.target.value) })} />
                              </div>
                            )}
                            {/* Reasoning Effort */}
                            {generationConfig.reasoning_effort && (
                              <div className="space-y-1">
                                <label className="text-[10px] font-medium">Reasoning Effort</label>
                                <select className="w-full text-[10px] border rounded p-1 bg-background" value={generationConfig.reasoning_effort} onChange={(e)=>onChangeGeneration?.({ reasoning_effort: e.target.value as 'minimal' | 'medium' | 'high' })}>
                                  <option value="minimal">minimal</option>
                                  <option value="medium">medium</option>
                                  <option value="high">high</option>
                                </select>
                              </div>
                            )}
                            {/* Verbosity */}
                            {generationConfig.verbosity && (
                              <div className="space-y-1">
                                <label className="text-[10px] font-medium">Verbosity</label>
                                <select className="w-full text-[10px] border rounded p-1 bg-background" value={generationConfig.verbosity} onChange={(e)=>onChangeGeneration?.({ verbosity: e.target.value as 'low' | 'medium' | 'high' })}>
                                  <option value="low">low</option>
                                  <option value="medium">medium</option>
                                  <option value="high">high</option>
                                </select>
                              </div>
                            )}
                            {/* Thinking budget */}
                            {typeof generationConfig.thinking_budget === 'number' && (
                              <div className="space-y-1">
                                <label className="flex justify-between text-[10px] font-medium"><span>Thinking Budget</span><span>{generationConfig.thinking_budget}</span></label>
                                <input type="range" min={-1} max={100} step={1} value={generationConfig.thinking_budget} onChange={(e)=>onChangeGeneration?.({ thinking_budget: parseInt(e.target.value) })} />
                                <div className="text-[9px] text-muted-foreground">-1=auto, 0=off</div>
                              </div>
                            )}
                            {/* CFG Scale */}
                            {typeof generationConfig.cfg_scale === 'number' && (
                              <div className="space-y-1">
                                <label className="flex justify-between text-[10px] font-medium"><span>CFG Scale</span><span>{generationConfig.cfg_scale}</span></label>
                                <input type="range" min={0} max={20} step={0.5} value={generationConfig.cfg_scale} onChange={(e)=>onChangeGeneration?.({ cfg_scale: parseFloat(e.target.value) })} />
                              </div>
                            )}
                            {/* Checkboxes */}
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                              <label className="flex items-center gap-1"><input type="checkbox" checked={generationConfig.stream} onChange={(e)=>onChangeGeneration?.({ stream: e.target.checked })} /> Stream</label>
                              <label className="flex items-center gap-1"><input type="checkbox" checked={!!generationConfig.include_thoughts} onChange={(e)=>onChangeGeneration?.({ include_thoughts: e.target.checked })} /> Thoughts</label>
                              <label className="flex items-center gap-1 col-span-2"><input type="checkbox" checked={!!generationConfig.free_tool_calling} onChange={(e)=>onChangeGeneration?.({ free_tool_calling: e.target.checked })} /> Free tool calling</label>
                            </div>
                            {/* System prompt */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-medium flex justify-between"><span>System Prompt</span>{systemPrompt && <span className="text-muted-foreground">{systemPrompt.length}</span>}</label>
                              <textarea className="w-full text-[10px] rounded border bg-background p-2 resize-none h-24 focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Set system / role prompt for this session" defaultValue={systemPrompt || ''} onBlur={(e)=>{ if(e.target.value!==systemPrompt) onChangeSystemPrompt?.(e.target.value); }} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                // Fallback if no active model
                return generationConfig ? (
                  <div className="p-4 text-[11px] space-y-3">
                    <div className="font-semibold mb-1 text-sm">Generation</div>
                    <div className="text-[10px] text-muted-foreground">Select a model to adjust settings.</div>
                  </div>
                ) : null;
              })()}
            </div>
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