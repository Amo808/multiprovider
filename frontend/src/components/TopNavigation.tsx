import React, { useState } from 'react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Sun, Moon, Monitor, LogOut, Brain, Zap, MessageSquare, Rocket } from 'lucide-react';
import { ModelInfo, ModelProvider, AppConfig, GenerationConfig } from '../types';
import { UnifiedModelMenu } from './UnifiedModelMenu';
import TokenCounter from './TokenCounter';
import { Logo } from './Logo';

interface TopNavigationProps {
  config: AppConfig;
  selectedModel?: ModelInfo;
  selectedProvider?: ModelProvider;
  userEmail?: string | null;
  theme: 'light' | 'dark' | 'auto';
  onThemeToggle: () => void;
  onSettingsClick: () => void; // opens provider manager
  onLogout: () => void;
  onSelectModel: (m: ModelInfo) => void;
  onChangeGeneration?: (patch: Partial<GenerationConfig>) => void;
  systemPrompt?: string; // Combined system prompt (Global + Per-Model)
  onChangeSystemPrompt?: (p: string) => void; // Updates per-model system prompt
  // Global system prompt props
  globalPrompt?: string;
  onChangeGlobalPrompt?: (p: string) => void;
  onSaveGlobalPrompt?: () => Promise<void>;
  globalPromptHasChanges?: boolean;
  // Per-model prompt props  
  modelPrompt?: string;
  modelPromptHasChanges?: boolean;
  onSaveModelPrompt?: () => Promise<void>;  // NEW: explicit save for model prompt
  tokenUsage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number; estimated_cost?: number } | null;
  generationConfig?: GenerationConfig; // Per-model generation config
  health?: { status: string } | null; // API health status
  onApplyMaxPreset?: () => void; // Apply MAX preset to all settings
  onCyclePreset?: () => void; // Cycle through presets: MAX → Balanced → MIN
  currentPreset?: 'MAX' | 'Balanced' | 'MIN' | 'Custom';
  // Multi-select for parallel/compare mode
  chatMode?: 'single' | 'parallel';
  selectedModelsForParallel?: ModelInfo[];
  onSelectedModelsForParallelChange?: (models: ModelInfo[]) => void;
}

const themeIcon = (t: 'light' | 'dark' | 'auto') => t==='light'? <Sun size={16}/> : t==='dark'? <Moon size={16}/> : <Monitor size={16}/>;

const LEVELS = ['off', 'low', 'medium', 'high'];

export const TopNavigation: React.FC<TopNavigationProps> = ({ 
  config, selectedModel, selectedProvider, userEmail, theme, onThemeToggle, onSettingsClick, onLogout, onSelectModel, onChangeGeneration, 
  systemPrompt, onChangeSystemPrompt, 
  globalPrompt, onChangeGlobalPrompt, onSaveGlobalPrompt, globalPromptHasChanges,
  modelPrompt, modelPromptHasChanges, onSaveModelPrompt,
  tokenUsage, generationConfig, onCyclePreset, currentPreset,
  chatMode, selectedModelsForParallel, onSelectedModelsForParallelChange
}) => {
  const effectiveConfig = generationConfig || config.generation;
  
  // Local state for immediate UI updates
  const [localVerbosity, setLocalVerbosity] = useState<string>(() => (generationConfig?.verbosity as string) || 'off');
  const [localReasoning, setLocalReasoning] = useState<string>(() => (generationConfig?.reasoning_effort as string) || 'off');
  
  // Handlers for generation controls - use local state only, no sync with props
  const handleVerbosityToggle = () => {
    const currentIndex = LEVELS.indexOf(localVerbosity);
    const nextIndex = (currentIndex + 1) % LEVELS.length;
    const nextValue = LEVELS[nextIndex];
    console.log('[Verbosity] current:', localVerbosity, 'currentIndex:', currentIndex, 'next:', nextValue);
    setLocalVerbosity(nextValue);
    onChangeGeneration?.({ verbosity: nextValue === 'off' ? undefined : nextValue as any });
  };
  
  const handleReasoningToggle = () => {
    const currentIndex = LEVELS.indexOf(localReasoning);
    const nextIndex = (currentIndex + 1) % LEVELS.length;
    const nextValue = LEVELS[nextIndex];
    console.log('[Reasoning] current:', localReasoning, 'currentIndex:', currentIndex, 'next:', nextValue);
    setLocalReasoning(nextValue);
    onChangeGeneration?.({ reasoning_effort: nextValue === 'off' ? undefined : nextValue as any });
  };
  
  const handleStreamToggle = () => {
    onChangeGeneration?.({ stream: !effectiveConfig?.stream });
  };
  
  const handleThinkingToggle = () => {
    onChangeGeneration?.({ include_thoughts: !effectiveConfig?.include_thoughts });
  };

  return (
    <header className="flex items-center h-11 sm:h-14 px-2 sm:px-4 gap-1.5 sm:gap-3 bg-background border-b border-border flex-shrink-0 sticky top-0 z-30" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center">
        <Logo width={70} height={10} className="text-foreground sm:w-[100px] sm:h-[14px]" />
      </div>
      {/* Unified model & provider menu inline - all settings are here */}
      <div className="ml-0.5 sm:ml-2">
        <UnifiedModelMenu 
          config={config} 
          activeModel={selectedModel} 
          activeProvider={selectedProvider} 
          onSelectModel={onSelectModel} 
          onManageProviders={onSettingsClick} 
          generationConfig={effectiveConfig} 
          onChangeGeneration={onChangeGeneration} 
          systemPrompt={systemPrompt} 
          onChangeSystemPrompt={onChangeSystemPrompt}
          // Global system prompt props
          globalPrompt={globalPrompt}
          onChangeGlobalPrompt={onChangeGlobalPrompt}
          onSaveGlobalPrompt={onSaveGlobalPrompt}
          globalPromptHasChanges={globalPromptHasChanges}
          // Per-model prompt props
          modelPrompt={modelPrompt}
          modelPromptHasChanges={modelPromptHasChanges}
          onSaveModelPrompt={onSaveModelPrompt}
          // Multi-select for parallel/compare mode
          chatMode={chatMode}
          selectedModelsForParallel={selectedModelsForParallel}
          onSelectedModelsForParallelChange={onSelectedModelsForParallelChange}
        />
      </div>
      
      {/* Generation Config Controls - transparent buttons */}
      <div className="hidden lg:flex items-center gap-1 ml-2">
        <span className="text-muted-foreground/40 mx-1">|</span>
        
        {/* Verbosity */}
        <button
          onClick={handleVerbosityToggle}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors hover:bg-accent/50 ${
            localVerbosity !== 'off'
              ? 'text-orange-500 dark:text-orange-400' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title="Click to cycle: off → low → medium → high → off"
        >
          <MessageSquare size={12} className="inline mr-1" />
          {localVerbosity}
        </button>
        
        {/* Reasoning */}
        <button
          onClick={handleReasoningToggle}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors hover:bg-accent/50 ${
            localReasoning !== 'off'
              ? 'text-purple-500 dark:text-purple-400' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title="Click to cycle: off → low → medium → high → off"
        >
          🧠 {localReasoning}
        </button>
        
        {/* Stream */}
        <button
          onClick={handleStreamToggle}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors hover:bg-accent/50 ${
            effectiveConfig?.stream 
              ? 'text-green-500 dark:text-green-400' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title="Click to toggle streaming"
        >
          <Zap size={12} className="inline mr-1" />
          {effectiveConfig?.stream ? 'on' : 'off'}
        </button>
        
        {/* Thinking Mode */}
        <button
          onClick={handleThinkingToggle}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors hover:bg-accent/50 flex items-center gap-1 ${
            effectiveConfig?.include_thoughts
              ? 'text-pink-500 dark:text-pink-400' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title="Click to toggle thinking mode"
        >
          <Brain size={12} />
          {effectiveConfig?.include_thoughts ? 'ON' : 'OFF'}
        </button>
        
        <span className="text-muted-foreground/40 mx-1">|</span>
        
        {/* Preset Cycle Button - click to cycle through MAX → Balanced → MIN */}
        {onCyclePreset && (
          <button
            onClick={onCyclePreset}
            className={`px-3 py-1 rounded text-xs font-bold transition-all hover:scale-105 shadow-sm hover:shadow-md flex items-center gap-1 ${
              currentPreset === 'MAX' 
                ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white' 
                : currentPreset === 'Balanced'
                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                : currentPreset === 'MIN'
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
                : 'bg-gradient-to-r from-gray-500 to-gray-600 text-white'
            }`}
            title={`Current: ${currentPreset || 'MAX'}. Click to cycle: MAX → Balanced → MIN → MAX`}
          >
            <Rocket size={12} />
            {currentPreset || 'MAX'}
          </button>
        )}
      </div>
      
      {/* Usage panel in the header */}
      <div className="ml-auto flex items-center gap-0.5 sm:gap-2">
        <div className="hidden sm:block">
          <TokenCounter usage={tokenUsage || null} model={selectedModel?.display_name} contextLength={selectedModel?.context_length} />
        </div>
        <Button variant="ghost" size="sm" onClick={onSettingsClick} className="px-2 sm:px-3 h-7 sm:h-8 text-xs hidden sm:flex">Settings</Button>
        <Button variant="ghost" size="sm" onClick={onThemeToggle} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title={theme}>{themeIcon(theme)}</Button>
        {userEmail && (
          <div className="flex items-center gap-0.5 sm:gap-2">
            <Avatar className="h-6 w-6 sm:h-8 sm:w-8"><AvatarFallback className="text-[10px] sm:text-xs">{userEmail.slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
            <span className="text-xs text-muted-foreground hidden lg:inline">{userEmail}</span>
          </div>
        )}
        <Button variant="destructive" size="sm" onClick={onLogout} className="h-6 sm:h-8 px-1.5 sm:px-3 text-[10px] sm:text-xs flex items-center gap-0.5 sm:gap-1">
          <LogOut size={12} className="sm:w-[14px] sm:h-[14px]"/>
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  );
};

export default TopNavigation;