import React from 'react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Sun, Moon, Monitor, LogOut } from 'lucide-react';
import { ModelInfo, ModelProvider, AppConfig, GenerationConfig } from '../types'; // removed GenerationConfig
import { UnifiedModelMenu } from './UnifiedModelMenu';

interface ExtendedModelInfo extends ModelInfo { streaming?: boolean; vision?: boolean }

interface TopNavigationProps {
  config: AppConfig;
  selectedModel?: ModelInfo;
  selectedProvider?: ModelProvider;
  userEmail?: string | null;
  theme: 'light' | 'dark' | 'auto';
  onThemeToggle: () => void;
  onSettingsClick: () => void; // opens provider manager
  onLogout: () => void;
  onMenuToggle: () => void;
  onGenSettings?: () => void;
  onSelectModel: (m: ModelInfo) => void;
  onChangeGeneration?: (patch: Partial<GenerationConfig>) => void; // NEW
  systemPrompt?: string; // NEW
  onChangeSystemPrompt?: (p: string) => void; // NEW
}

const themeIcon = (t: 'light' | 'dark' | 'auto') => t==='light'? <Sun size={16}/> : t==='dark'? <Moon size={16}/> : <Monitor size={16}/>;

export const TopNavigation: React.FC<TopNavigationProps> = ({ config, selectedModel, selectedProvider, userEmail, theme, onThemeToggle, onSettingsClick, onLogout, onMenuToggle, onGenSettings, onSelectModel, onChangeGeneration, systemPrompt, onChangeSystemPrompt }) => {
  const m: ExtendedModelInfo | undefined = selectedModel as ExtendedModelInfo | undefined;
  return (
    <header className="flex items-center h-14 px-4 gap-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
      <Button variant="ghost" size="sm" onClick={onMenuToggle} className="lg:hidden px-2">☰</Button>
      <div className="flex items-center font-bold text-lg tracking-tight">MULTECH</div>
      {/* Unified model & provider menu inline */}
      <div className="ml-4"><UnifiedModelMenu config={config} activeModel={selectedModel} activeProvider={selectedProvider} onSelectModel={onSelectModel} onManageProviders={onSettingsClick} generationConfig={config.generation} onChangeGeneration={onChangeGeneration} systemPrompt={systemPrompt} onChangeSystemPrompt={onChangeSystemPrompt} /></div>
      {/* Generation settings trigger */}
      <Button variant="ghost" size="sm" onClick={onGenSettings} className="px-2 text-xs">Generation</Button>
      {m && (
        <div className="hidden md:flex items-center gap-1 text-[11px]">
          {m.context_length && <span className="px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">⚪ {m.context_length.toLocaleString()} tks</span>}
          {m.streaming && <span className="px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">• Streaming</span>}
          {m.vision && <span className="px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">• Vision</span>}
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onSettingsClick} className="px-3 h-8 text-xs">Settings</Button>
        <Button variant="ghost" size="sm" onClick={onThemeToggle} className="h-8 w-8 p-0" title={theme}>{themeIcon(theme)}</Button>
        {userEmail && (
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8"><AvatarFallback>{userEmail.slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
            <span className="text-xs text-gray-600 dark:text-gray-300 hidden sm:inline">{userEmail}</span>
          </div>
        )}
        <Button variant="destructive" size="sm" onClick={onLogout} className="h-8 px-3 text-xs flex items-center gap-1"><LogOut size={14}/>Logout</Button>
      </div>
    </header>
  );
};

export default TopNavigation;