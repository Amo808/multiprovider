import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ModelInfo, ModelProvider, AppConfig, GenerationConfig } from '../types'; // added GenerationConfig
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Bot, Zap, Eye, ChevronDown, Settings, Save, Upload, Download, FileText, Maximize2, History, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { getMaxTokensForModel } from '../hooks/useModelSettings';
import { emitSettingsUpdate, subscribeToSettingsUpdates } from '../utils/settingsSync';
import { parseDocument, getFormatName } from '../utils/documentParsers';

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
  // Multi-select for parallel/compare mode
  chatMode?: 'single' | 'parallel';
  selectedModelsForParallel?: ModelInfo[];
  onSelectedModelsForParallelChange?: (models: ModelInfo[]) => void;
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
  modelPrompt, modelPromptHasChanges, onSaveModelPrompt,
  chatMode, selectedModelsForParallel, onSelectedModelsForParallelChange
}) => {
  const [open, setOpen] = useState(false);
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null);
  const [settingsModelId, setSettingsModelId] = useState<string | null>(null);
  const [localGenConfig, setLocalGenConfig] = useState<Partial<GenerationConfig>>({});

  // Helper to check if a model is selected for parallel mode
  const isModelSelectedForParallel = useCallback((model: ModelInfo) => {
    return selectedModelsForParallel?.some(m => m.id === model.id) ?? false;
  }, [selectedModelsForParallel]);

  // Toggle model selection for parallel mode
  const toggleModelForParallel = useCallback((model: ModelInfo) => {
    if (!onSelectedModelsForParallelChange) return;
    const current = selectedModelsForParallel || [];
    if (isModelSelectedForParallel(model)) {
      onSelectedModelsForParallelChange(current.filter(m => m.id !== model.id));
    } else {
      // Max 4 models
      if (current.length >= 4) return;
      onSelectedModelsForParallelChange([...current, model]);
    }
  }, [selectedModelsForParallel, onSelectedModelsForParallelChange, isModelSelectedForParallel]);

  // Custom presets stored in localStorage
  const [customPresets, setCustomPresets] = useState<Array<{ name: string, prompt: string }>>(() => {
    try {
      const saved = localStorage.getItem('customPromptPresets');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [isLoadingPromptFile, setIsLoadingPromptFile] = useState(false);
  const [promptDragOver, setPromptDragOver] = useState(false);
  // NEW: Global prompt file handling
  const [isLoadingGlobalPromptFile, setIsLoadingGlobalPromptFile] = useState(false);
  const [globalPromptDragOver, setGlobalPromptDragOver] = useState(false);
  // NEW: Upload progress state
  const [uploadProgress, setUploadProgress] = useState<{ 
    model?: { percent: number; status: string }; 
    global?: { percent: number; status: string }; 
  }>({});
  // NEW: Fullscreen modal for prompt editing (like compare mode)
  const [promptModal, setPromptModal] = useState<{ open: boolean, target: 'global' | 'model' } | null>(null);
  // NEW: Loaded file info (to show as card instead of full text)
  const [loadedFileInfo, setLoadedFileInfo] = useState<{
    global?: { name: string, size: number, chars: number },
    model?: { name: string, size: number, chars: number }
  }>({});
  // NEW: Prompt file history (stored in localStorage)
  const [promptFileHistory, setPromptFileHistory] = useState<Array<{ name: string, content: string, date: string, target: 'global' | 'model' }>>(() => {
    try {
      const saved = localStorage.getItem('promptFileHistory');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showPromptHistory, setShowPromptHistory] = useState(false);
  // NEW: Paste warning state
  const [pasteWarning, setPasteWarning] = useState<{ show: boolean, text: string, target: 'global' | 'model' } | null>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const promptFileInputRef = useRef<HTMLInputElement | null>(null);

  // Global prompt file input ref
  const globalPromptFileInputRef = useRef<HTMLInputElement | null>(null);

  // Helper to add to prompt file history
  const addToPromptHistory = useCallback((name: string, content: string, target: 'global' | 'model') => {
    setPromptFileHistory(prev => {
      const newEntry = { name, content, date: new Date().toISOString(), target };
      const updated = [newEntry, ...prev.filter(h => h.name !== name || h.target !== target)].slice(0, 20); // Keep last 20
      localStorage.setItem('promptFileHistory', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Get user-friendly error message for unsupported file types
  // NOTE: Word (.doc/.docx), PDF, and RTF are now SUPPORTED via parsers!
  const getFileTypeErrorMessage = useCallback((file: File): string | null => {
    const ext = file.name.toLowerCase();
    
    // These formats are NOW SUPPORTED - don't block them!
    // .doc, .docx, .pdf, .rtf are handled by documentParsers.ts
    
    // Excel - not supported yet
    if (ext.endsWith('.xls') || ext.endsWith('.xlsx')) {
      return '📊 Excel files (.xls/.xlsx) cannot be read directly.\n\nPlease export your data as CSV or copy/paste the text content.';
    }
    // PowerPoint - not supported yet  
    if (ext.endsWith('.ppt') || ext.endsWith('.pptx')) {
      return '📊 PowerPoint files cannot be read directly.\n\nPlease copy the text content and paste it, or save as plain text.';
    }
    // OpenDocument - not supported yet
    if (ext.endsWith('.odt') || ext.endsWith('.ods') || ext.endsWith('.odp')) {
      return '📄 OpenDocument files cannot be read directly.\n\nPlease export as plain text or copy/paste the content.';
    }
    
    // Image formats
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svg', '.tiff', '.tif'].some(e => ext.endsWith(e))) {
      return '🖼️ Image files cannot be used as prompts.\n\nPlease use a text file instead.';
    }
    
    // Audio/Video formats
    if (['.mp3', '.mp4', '.avi', '.mov', '.wav', '.flac', '.ogg', '.mkv', '.webm'].some(e => ext.endsWith(e))) {
      return '🎵 Audio/video files cannot be used as prompts.\n\nPlease use a text file instead.';
    }
    
    // Archive formats
    if (['.zip', '.tar', '.gz', '.rar', '.7z', '.bz2', '.xz'].some(e => ext.endsWith(e))) {
      return '📦 Archive files cannot be read directly.\n\nPlease extract the archive and select a text file.';
    }
    
    // Executable/binary formats
    if (['.exe', '.dll', '.so', '.dylib', '.bin', '.msi', '.app'].some(e => ext.endsWith(e))) {
      return '⚠️ Executable/binary files cannot be used as prompts.\n\nPlease use a text file instead.';
    }
    
    return null; // No specific message - will use generic check
  }, []);

  // Check if file can be read as text (accept ANY file, just check if readable)
  const isFileReadable = useCallback(async (file: File): Promise<{ readable: boolean; errorMessage?: string }> => {
    // First check for known binary extensions with specific messages
    const specificError = getFileTypeErrorMessage(file);
    if (specificError) {
      return { readable: false, errorMessage: specificError };
    }
    
    // Try to read as text - if it fails or has too many non-printable chars, reject
    try {
      const text = await file.slice(0, 1024).text(); // Check first 1KB
      const nonPrintable = text.split('').filter(c => c.charCodeAt(0) < 32 && c !== '\n' && c !== '\r' && c !== '\t').length;
      if (nonPrintable >= text.length * 0.1) { // More than 10% non-printable
        return { 
          readable: false, 
          errorMessage: '⚠️ This file appears to contain binary data and cannot be used as a text prompt.\n\nSupported formats: .txt, .md, .json, .yaml, .xml, .csv, .js, .ts, .py, .html, .css, and other plain text files.' 
        };
      }
      return { readable: true };
    } catch {
      return { 
        readable: false, 
        errorMessage: '⚠️ Failed to read this file.\n\nPlease try a different text file.' 
      };
    }
  }, [getFileTypeErrorMessage]);

  // Check if file needs special parsing (Word, PDF, etc.)
  const needsDocumentParsing = useCallback((file: File): boolean => {
    const ext = file.name.toLowerCase();
    return ['.doc', '.docx', '.pdf', '.rtf'].some(e => ext.endsWith(e));
  }, []);

  // Load prompt from file - NOW SUPPORTS Word, PDF, and text files WITH PROGRESS
  const handleLoadPromptFromFile = useCallback(async (file: File, target: 'model' | 'global' = 'model') => {
    if (file.size > 5 * 1024 * 1024) { // 5MB limit for documents
      alert('File too large. Max 5MB for documents.');
      return;
    }

    if (target === 'model') {
      setIsLoadingPromptFile(true);
    } else {
      setIsLoadingGlobalPromptFile(true);
    }
    
    // Reset progress
    setUploadProgress(prev => ({
      ...prev,
      [target]: { percent: 0, status: 'Starting...' }
    }));

    try {
      let text: string;
      let formatInfo = '';

      // Progress callback for document parsing
      const onProgress = (percent: number, status?: string) => {
        setUploadProgress(prev => ({
          ...prev,
          [target]: { percent, status: status || 'Processing...' }
        }));
      };

      // Check if we need special document parsing
      if (needsDocumentParsing(file)) {
        const formatName = getFormatName(file);
        formatInfo = ` (${formatName})`;
        
        const parseResult = await parseDocument(file, onProgress);
        
        if (!parseResult.success) {
          alert(parseResult.error || 'Failed to parse document.');
          return;
        }
        
        text = parseResult.text || '';
        
        // Show warning if there was one
        if (parseResult.warning) {
          console.warn('Document parse warning:', parseResult.warning);
        }
        
        // Show info about extraction
        if (parseResult.pageCount) {
          console.log(`Extracted text from ${parseResult.pageCount} pages, ${parseResult.wordCount} words`);
        }
      } else {
        // Check if it's a readable text file
        onProgress(10, 'Validating file...');
        const result = await isFileReadable(file);
        if (!result.readable) {
          alert(result.errorMessage || 'This file cannot be read as text.');
          return;
        }
        onProgress(50, 'Reading file...');
        text = await file.text();
        onProgress(100, 'Complete');
      }

      // Add to history
      addToPromptHistory(file.name, text, target);

      // Save file info for display
      setLoadedFileInfo(prev => ({
        ...prev,
        [target]: { name: file.name + formatInfo, size: file.size, chars: text.length }
      }));

      if (target === 'model') {
        onChangeSystemPrompt?.(text);
      } else {
        onChangeGlobalPrompt?.(text);
      }
    } catch (err) {
      console.error('Failed to read/parse file:', err);
      alert(`Failed to process file: ${err instanceof Error ? err.message : 'Unknown error'}`);
      // Clear progress on error
      setUploadProgress(prev => ({ ...prev, [target]: undefined }));
    } finally {
      if (target === 'model') {
        setIsLoadingPromptFile(false);
      } else {
        setIsLoadingGlobalPromptFile(false);
      }
      // Clear progress after a short delay so user sees 100%
      setTimeout(() => {
        setUploadProgress(prev => ({ ...prev, [target]: undefined }));
      }, 500);
    }
  }, [onChangeSystemPrompt, onChangeGlobalPrompt, addToPromptHistory, isFileReadable, needsDocumentParsing]);

  // Handle file input change for model prompt
  const handlePromptFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleLoadPromptFromFile(file, 'model');
      if (promptFileInputRef.current) promptFileInputRef.current.value = '';
    }
  }, [handleLoadPromptFromFile]);

  // Handle file input change for global prompt
  const handleGlobalPromptFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleLoadPromptFromFile(file, 'global');
      if (globalPromptFileInputRef.current) globalPromptFileInputRef.current.value = '';
    }
  }, [handleLoadPromptFromFile]);

  // Handle drag & drop for model prompt
  const handlePromptDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPromptDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleLoadPromptFromFile(file, 'model');
    }
  }, [handleLoadPromptFromFile]);

  // Handle drag & drop for global prompt
  const handleGlobalPromptDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setGlobalPromptDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleLoadPromptFromFile(file, 'global');
    }
  }, [handleLoadPromptFromFile]);

  // Handle paste with protection against huge text
  const PASTE_WARNING_THRESHOLD = 10000; // 10K chars
  const [isPasting, setIsPasting] = useState(false);
  
  const handlePromptPaste = useCallback((e: React.ClipboardEvent, target: 'global' | 'model') => {
    const pastedText = e.clipboardData.getData('text');
    if (pastedText.length > PASTE_WARNING_THRESHOLD) {
      e.preventDefault();
      setPasteWarning({ show: true, text: pastedText, target });
    }
  }, []);

  // Confirm paste of large text - with async handling to prevent UI freeze
  const confirmPaste = useCallback(() => {
    if (!pasteWarning) return;
    
    const { text, target } = pasteWarning;
    
    // For very large text, show loading indicator
    if (text.length > 20000) {
      setIsPasting(true);
    }
    
    // Close modal immediately for better UX
    setPasteWarning(null);
    
    // Use requestAnimationFrame to let React update UI before heavy operation
    requestAnimationFrame(() => {
      // Another frame to ensure modal is closed
      requestAnimationFrame(() => {
        if (target === 'model') {
          onChangeSystemPrompt?.(text);
          // Save file info so it shows as a card
          setLoadedFileInfo(prev => ({
            ...prev,
            model: { name: 'Pasted content', size: text.length, chars: text.length }
          }));
        } else {
          onChangeGlobalPrompt?.(text);
          setLoadedFileInfo(prev => ({
            ...prev,
            global: { name: 'Pasted content', size: text.length, chars: text.length }
          }));
        }
        setIsPasting(false);
      });
    });
  }, [pasteWarning, onChangeSystemPrompt, onChangeGlobalPrompt]);

  // Export/download prompt to file
  const handleExportPrompt = useCallback((content: string | undefined, filename: string) => {
    if (!content) return;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Load from history
  const loadFromHistory = useCallback((entry: { name: string, content: string, target: 'global' | 'model' }) => {
    if (entry.target === 'model') {
      onChangeSystemPrompt?.(entry.content);
    } else {
      onChangeGlobalPrompt?.(entry.content);
    }
    setShowPromptHistory(false);
  }, [onChangeSystemPrompt, onChangeGlobalPrompt]);

  // Clear history
  const clearPromptHistory = useCallback(() => {
    setPromptFileHistory([]);
    localStorage.removeItem('promptFileHistory');
  }, []);

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

  // Debounced save to API (300ms delay) with sync event
  const debouncedSave = useDebounce((patch: Partial<GenerationConfig>) => {
    onChangeGeneration?.(patch);

    // Emit sync event for other components (like ParallelChatInterface)
    if (activeModel && activeProvider) {
      emitSettingsUpdate({
        provider: activeProvider,
        modelId: activeModel.id,
        settings: patch,
        source: 'dropdown'
      });
    }
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

  // Subscribe to settings updates from other components (e.g., ParallelChatInterface popup)
  useEffect(() => {
    const unsubscribe = subscribeToSettingsUpdates((update) => {
      // Only update if this is for our current active model
      if (activeModel && update.modelId === activeModel.id) {
        console.log('[UnifiedModelMenu] Received settings update from', update.source, 'for', update.modelId);
        // Update local display config without triggering another save
        setLocalGenConfig(prev => ({
          ...prev,
          ...update.settings
        }));
      }
    }, { ignoreSource: 'dropdown' }); // Ignore our own updates

    return unsubscribe;
  }, [activeModel]);

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
    const close = (e: MouseEvent | TouchEvent) => {
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
    window.addEventListener('touchstart', close, { passive: true });
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('touchstart', close);
    };
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

  // Display text for parallel mode
  const parallelDisplay = selectedModelsForParallel && selectedModelsForParallel.length > 0
    ? `${selectedModelsForParallel.length} model${selectedModelsForParallel.length > 1 ? 's' : ''} selected`
    : 'Select models';

  return (
    <div className={cn('relative', className)}>
      <Button ref={buttonRef} variant="ghost" size="sm" onClick={() => setOpen(o => !o)} className={cn(
        "rounded-xl px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium flex items-center gap-1 sm:gap-2 border-0 text-foreground max-w-[140px] sm:max-w-[200px]",
        chatMode === 'parallel'
          ? "bg-purple-500/20 hover:bg-purple-500/30 dark:bg-purple-500/20 dark:hover:bg-purple-500/30"
          : "bg-secondary/50 dark:bg-[#2f2f2f] hover:bg-secondary dark:hover:bg-[#3a3a3a]"
      )}>
        {chatMode === 'parallel' ? (
          <>
            <Eye size={14} className="text-purple-500" />
            <span className="truncate text-foreground">{parallelDisplay}</span>
          </>
        ) : (
          <>
            {activeModel?.supports_vision ? <Eye size={14} /> : activeModel?.supports_streaming ? <Zap size={14} /> : <Bot size={14} />}
            <span className="truncate text-foreground">{activeDisplay}</span>
          </>
        )}
        <ChevronDown size={14} className={`transition-transform text-muted-foreground flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open && (
        <>
          {/* Mobile overlay backdrop */}
          <div className="fixed inset-0 bg-black/50 z-40 sm:hidden" onClick={() => setOpen(false)} />

          <div ref={panelRef} className={cn(
            "z-50 bg-card dark:bg-[#2f2f2f] text-card-foreground border border-border shadow-xl transition-all",
            // Mobile: fixed bottom sheet style
            "fixed inset-x-0 bottom-0 rounded-t-2xl max-h-[80vh] sm:max-h-none",
            // Desktop: absolute dropdown
            "sm:absolute sm:inset-auto sm:mt-2 sm:rounded-xl sm:left-0",
            settingsModelId ? "sm:w-[680px]" : "sm:w-[320px]"
          )}>
            {/* Mobile drag handle */}
            <div className="sm:hidden flex justify-center py-2">
              <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
            </div>

            <div className="flex flex-col sm:flex-row relative">
              {/* Model list - hidden on mobile when settings open */}
              <div ref={listScrollRef} className={cn(
                "max-h-[50vh] sm:max-h-[70vh] overflow-y-auto divide-y dark:divide-gray-700 ios-scroll",
                settingsModelId ? "hidden sm:block sm:w-[320px]" : "w-full"
              )}>
                {loading && (
                  <div className="p-6 text-center text-sm text-muted-foreground">Loading models...</div>
                )}
                {!loading && groups.map(g => (
                  <div key={g.id} className="group">
                    <ProviderHeader provider={g.id} count={g.models.length} connected={true} />
                    <div className="py-1">
                      {g.models.map(m => {
                        const isSelectedForParallel = isModelSelectedForParallel(m);
                        return (
                          <div
                            key={m.id}
                            onMouseEnter={() => setHoveredModelId(m.id)}
                            onMouseLeave={() => setHoveredModelId(null)}
                            className={cn(
                              'w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground transition flex items-center gap-2 text-xs group/model cursor-pointer',
                              activeModel?.id === m.id && chatMode !== 'parallel' && 'bg-accent/40',
                              isSelectedForParallel && 'bg-purple-500/10 border-l-2 border-purple-500',
                              settingsModelId === m.id && 'bg-primary/10'
                            )}
                          >
                            {/* Checkbox for parallel mode */}
                            {chatMode === 'parallel' && (
                              <button
                                onClick={() => toggleModelForParallel(m)}
                                className={cn(
                                  "w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0",
                                  isSelectedForParallel
                                    ? "bg-purple-500 border-purple-500 text-white"
                                    : "border-muted-foreground/40 hover:border-purple-500/60"
                                )}
                              >
                                {isSelectedForParallel && <Eye size={12} />}
                              </button>
                            )}

                            {/* Model info - clickable to select */}
                            <div
                              className="flex-1 min-w-0"
                              onClick={() => {
                                if (chatMode === 'parallel') {
                                  toggleModelForParallel(m);
                                } else {
                                  onSelectModel(m);
                                  // If settings panel is open for another model, switch to the new one
                                  if (settingsModelId && settingsModelId !== m.id) {
                                    setSettingsModelId(m.id);
                                    setLocalGenConfig({}); // Clear local config to load new model's settings
                                  }
                                }
                              }}
                            >
                              <div className="flex items-center gap-2">
                                {m.supports_streaming ? <Zap size={12} className="text-green-500 flex-shrink-0" /> : <Bot size={12} className="text-gray-400 flex-shrink-0" />}
                                <span className="font-medium text-[11px] leading-tight truncate">{m.display_name || m.name}</span>
                                {activeModel?.id === m.id && chatMode !== 'parallel' && <span className="text-[10px] text-primary font-semibold flex-shrink-0">Active</span>}
                                {isSelectedForParallel && <span className="text-[10px] text-purple-500 font-semibold flex-shrink-0">✓ Selected</span>}
                              </div>
                              <div className="flex items-center flex-wrap gap-1 mt-1 text-[10px] text-muted-foreground">
                                <span>{m.context_length.toLocaleString()} tokens</span>
                              </div>
                              <CapabilityBadges m={m} />
                            </div>
                            {/* Settings button - appears on hover (desktop) or always visible (mobile) */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSettingsModelId(prev => prev === m.id ? null : m.id);
                              }}
                              onTouchEnd={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setSettingsModelId(prev => prev === m.id ? null : m.id);
                              }}
                              className={cn(
                                'p-2 sm:p-1.5 rounded hover:bg-background/50 transition-all flex-shrink-0 touch-manipulation',
                                settingsModelId === m.id
                                  ? 'opacity-100 text-primary'
                                  : 'opacity-100 sm:opacity-0 sm:group-hover/model:opacity-70 sm:hover:!opacity-100'
                              )}
                              title={`Settings for ${m.display_name || m.name}`}
                            >
                              <Settings size={16} className="sm:w-[14px] sm:h-[14px]" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {!loading && groups.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">No providers/models configured</div>
                )}
              </div>
              {/* Side settings panel - Modern 2026 Design */}
              {settingsModelId && (() => {
                const targetId = settingsModelId;
                const providerGroup = groups.find(g => g.models.some(m => m.id === targetId));
                const m = providerGroup?.models.find(mm => mm.id === targetId);
                const isActiveModel = m?.id === activeModel?.id;
                if (!m) return null;

                // Provider accent colors
                const providerColors: Record<string, string> = {
                  openai: 'text-emerald-400',
                  anthropic: 'text-orange-400',
                  gemini: 'text-blue-400',
                  deepseek: 'text-purple-400',
                };
                const accentColor = providerColors[m.provider] || 'text-foreground/60';

                return (
                  <div className="w-full sm:flex-1 sm:border-l border-border max-h-[70vh] overflow-y-auto ios-scroll bg-gradient-to-b from-background to-secondary/20">
                    <div className="p-4 sm:p-5">
                      {/* Modern Header */}
                      <div className="flex items-center justify-between mb-5">
                        <button
                          onClick={() => setSettingsModelId(null)}
                          onTouchEnd={(e) => { e.preventDefault(); setSettingsModelId(null); }}
                          className="sm:hidden text-foreground/60 hover:text-foreground p-2 -ml-2 touch-manipulation flex items-center gap-1 text-sm rounded-lg hover:bg-white/5"
                        >
                          ← Back
                        </button>
                        <div className="flex items-center gap-3 flex-1">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center",
                            "bg-gradient-to-br from-white/10 to-white/5 border border-white/10"
                          )}>
                            <Settings size={18} className={accentColor} />
                          </div>
                          <div>
                            <span className={cn("font-semibold text-sm", accentColor)}>
                              {m.display_name || m.name}
                            </span>
                            <p className="text-[10px] text-foreground/40 uppercase tracking-wider">
                              Model Settings
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setSettingsModelId(null)}
                          onTouchEnd={(e) => { e.preventDefault(); setSettingsModelId(null); }}
                          className="hidden sm:flex p-2 rounded-full hover:bg-white/10 text-foreground/60 hover:text-foreground transition-all"
                          title="Close settings"
                        >
                          ✕
                        </button>
                      </div>

                      {/* System Prompts - Modern Card Style */}
                      {isActiveModel && (
                        <div className="space-y-4 mb-5">
                          <div className="flex items-center gap-2">
                            <FileText size={14} className="text-foreground/60" />
                            <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">System Prompts</span>
                          </div>

                          {/* Global System Prompt - Compact Card with Fullscreen Modal */}
                          <div className="space-y-2 p-4 rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent backdrop-blur-sm">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-medium flex items-center gap-2 text-foreground/80">
                                <span className="w-5 h-5 rounded-md bg-blue-500/20 flex items-center justify-center text-[10px]">🌍</span>
                                Global
                                <span className="text-foreground/40 text-[10px] font-normal">(all models)</span>
                              </label>
                              <div className="flex items-center gap-2">
                                {globalPromptHasChanges && (
                                  <span className="text-[10px] text-orange-400 font-medium px-2 py-0.5 rounded-full bg-orange-500/10">unsaved</span>
                                )}
                              </div>
                            </div>

                            {/* Hidden file input for global prompt */}
                            <input
                              ref={globalPromptFileInputRef}
                              type="file"
                              accept="*/*"
                              onChange={handleGlobalPromptFileChange}
                              className="hidden"
                            />

                            {/* Compact preview OR file card */}
                            {loadedFileInfo.global && (globalPrompt?.length || 0) > 500 ? (
                              // Show file card for large loaded files
                              <div
                                className="p-3 rounded-xl border border-blue-500/30 bg-blue-500/10 cursor-pointer hover:bg-blue-500/15 transition-all group"
                                onClick={() => setPromptModal({ open: true, target: 'global' })}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <FileText size={16} className="text-blue-400" />
                                    <div>
                                      <p className="text-xs font-medium text-foreground/90">{loadedFileInfo.global.name}</p>
                                      <p className="text-[10px] text-foreground/50">
                                        {loadedFileInfo.global.chars.toLocaleString()} chars • Click to view/edit
                                      </p>
                                    </div>
                                  </div>
                                  <Maximize2 size={14} className="text-foreground/40 group-hover:text-foreground/70 transition-all" />
                                </div>
                              </div>
                            ) : (
                              // Show compact textarea with drag & drop for small/empty prompts
                              <div
                                className={cn(
                                  "relative rounded-xl border transition-all cursor-pointer group",
                                  globalPromptDragOver
                                    ? "border-blue-500 border-2 bg-blue-500/10 scale-[1.01]"
                                    : "border-white/10 hover:border-white/20"
                                )}
                                onDragOver={(e) => { e.preventDefault(); setGlobalPromptDragOver(true); }}
                                onDragLeave={(e) => { e.preventDefault(); setGlobalPromptDragOver(false); }}
                                onDrop={handleGlobalPromptDrop}
                              >
                                {globalPromptDragOver && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-blue-500/20 rounded-xl z-10 pointer-events-none backdrop-blur-sm">
                                    <div className="flex flex-col items-center gap-2 text-blue-400">
                                      <Upload size={20} />
                                      <span className="text-xs font-medium">Drop file here</span>
                                    </div>
                                  </div>
                                )}
                                <div className="relative">
                                  <textarea
                                    className="w-full text-xs rounded-xl border-0 bg-black/20 text-foreground p-3 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-foreground/30 transition-all h-16 resize-none"
                                    placeholder="Base instructions for ALL models... (drag & drop file or click expand)"
                                    value={globalPrompt || ''}
                                    onChange={(e) => onChangeGlobalPrompt?.(e.target.value)}
                                    onPaste={(e) => handlePromptPaste(e, 'global')}
                                  />
                                  {/* Expand button */}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setPromptModal({ open: true, target: 'global' }); }}
                                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-foreground/40 hover:text-foreground/80 transition-all"
                                    title="Open fullscreen editor"
                                  >
                                    <Maximize2 size={12} />
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Progress bar for global prompt upload */}
                            {uploadProgress.global && (
                              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-foreground/70">{uploadProgress.global.status}</span>
                                  <span className="text-foreground/50 font-mono">{uploadProgress.global.percent}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${uploadProgress.global.percent}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Actions row */}
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => globalPromptFileInputRef.current?.click()}
                                  disabled={isLoadingGlobalPromptFile}
                                  className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-foreground/70 hover:text-foreground transition-all disabled:opacity-50"
                                  title="Load prompt from any text file"
                                >
                                  <Upload size={10} />
                                  {isLoadingGlobalPromptFile ? '...' : 'Load'}
                                </button>
                                {globalPrompt && (
                                  <button
                                    onClick={() => handleExportPrompt(globalPrompt, `global-prompt-${Date.now()}.txt`)}
                                    className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-foreground/70 hover:text-foreground transition-all"
                                    title="Export prompt to file"
                                  >
                                    <Download size={10} />
                                    Export
                                  </button>
                                )}
                                <span className="text-[10px] text-foreground/40 font-mono">
                                  {(globalPrompt || '').length} chars
                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant={globalPromptHasChanges ? "default" : "ghost"}
                                onClick={() => onSaveGlobalPrompt?.()}
                                disabled={!globalPromptHasChanges}
                                className={cn(
                                  "h-7 text-[10px] px-3 rounded-lg transition-all",
                                  globalPromptHasChanges
                                    ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:opacity-90"
                                    : ""
                                )}
                              >
                                <Save size={12} className="mr-1.5" />
                                Save
                              </Button>
                            </div>
                          </div>

                          {/* Per-Model System Prompt */}
                          <div className="space-y-3 p-4 rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent backdrop-blur-sm">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-medium flex items-center gap-2 text-foreground/80">
                                <span className="w-5 h-5 rounded-md bg-purple-500/20 flex items-center justify-center text-[10px]">🎯</span>
                                Model Prompt
                              </label>
                              {modelPromptHasChanges && (
                                <span className="text-[10px] text-orange-400 font-medium px-2 py-0.5 rounded-full bg-orange-500/10">changed</span>
                              )}
                            </div>

                            {/* Built-in Presets */}
                            <div className="space-y-2">
                              <div className="text-[10px] text-foreground/50 uppercase tracking-wide">Quick presets</div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => onChangeSystemPrompt?.('You are a senior software engineer. Write clean, efficient, well-documented code with best practices.')}
                                  className="px-3 py-1.5 text-[10px] rounded-lg bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 text-emerald-400 hover:border-emerald-400/50 transition-all"
                                >
                                  💻 Coder
                                </button>
                                <button
                                  onClick={() => onChangeSystemPrompt?.('You are an expert analyst. Think step by step, consider multiple angles, and provide thorough analysis.')}
                                  className="px-3 py-1.5 text-[10px] rounded-lg bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-purple-400 hover:border-purple-400/50 transition-all"
                                >
                                  🔍 Analyst
                                </button>
                                <button
                                  onClick={() => onChangeSystemPrompt?.('You are a creative writer. Use vivid language, engaging storytelling, and imaginative ideas.')}
                                  className="px-3 py-1.5 text-[10px] rounded-lg bg-gradient-to-r from-orange-500/20 to-yellow-500/20 border border-orange-500/30 text-orange-400 hover:border-orange-400/50 transition-all"
                                >
                                  ✍️ Writer
                                </button>
                                <button
                                  onClick={() => onChangeSystemPrompt?.('Be concise. Answer in 1-3 sentences max. No fluff.')}
                                  className="px-3 py-1.5 text-[10px] rounded-lg bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border border-blue-500/30 text-blue-400 hover:border-blue-400/50 transition-all"
                                >
                                  ⚡ Brief
                                </button>
                                <button
                                  onClick={() => onChangeSystemPrompt?.('')}
                                  className="px-3 py-1.5 text-[10px] rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:border-red-400/50 transition-all"
                                >
                                  ✕ Clear
                                </button>
                              </div>
                            </div>

                            {/* Custom Presets */}
                            {customPresets.length > 0 && (
                              <div className="space-y-2">
                                <div className="text-[10px] text-foreground/50 uppercase tracking-wide">Your presets</div>
                                <div className="flex flex-wrap gap-2">
                                  {customPresets.map((preset, idx) => (
                                    <div key={idx} className="group relative">
                                      <button
                                        onClick={() => onChangeSystemPrompt?.(preset.prompt)}
                                        className="px-3 py-1.5 text-[10px] rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400 hover:border-amber-400/50 transition-all"
                                      >
                                        ⭐ {preset.name}
                                      </button>
                                      <button
                                        onClick={() => deleteCustomPreset(idx)}
                                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center shadow-lg"
                                        title="Delete preset"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Hidden file input - accept ALL files */}
                            <input
                              ref={promptFileInputRef}
                              type="file"
                              accept="*/*"
                              onChange={handlePromptFileChange}
                              className="hidden"
                            />

                            {/* Compact preview OR file card for Model Prompt */}
                            {loadedFileInfo.model && (modelPrompt?.length || 0) > 500 ? (
                              // Show file card for large loaded files
                              <div
                                className="p-3 rounded-xl border border-purple-500/30 bg-purple-500/10 cursor-pointer hover:bg-purple-500/15 transition-all group"
                                onClick={() => setPromptModal({ open: true, target: 'model' })}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <FileText size={16} className="text-purple-400" />
                                    <div>
                                      <p className="text-xs font-medium text-foreground/90">{loadedFileInfo.model.name}</p>
                                      <p className="text-[10px] text-foreground/50">
                                        {loadedFileInfo.model.chars.toLocaleString()} chars • Click to view/edit
                                      </p>
                                    </div>
                                  </div>
                                  <Maximize2 size={14} className="text-foreground/40 group-hover:text-foreground/70 transition-all" />
                                </div>
                              </div>
                            ) : (
                              // Show compact textarea with drag & drop and expand button
                              <div
                                className={cn(
                                  "relative rounded-xl border transition-all",
                                  promptDragOver
                                    ? "border-purple-500 border-2 bg-purple-500/10 scale-[1.01]"
                                    : "border-white/10 hover:border-white/20"
                                )}
                                onDragOver={(e) => { e.preventDefault(); setPromptDragOver(true); }}
                                onDragLeave={(e) => { e.preventDefault(); setPromptDragOver(false); }}
                                onDrop={handlePromptDrop}
                              >
                                {promptDragOver && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-purple-500/20 rounded-xl z-10 pointer-events-none backdrop-blur-sm">
                                    <div className="flex flex-col items-center gap-2 text-purple-400">
                                      <Upload size={24} />
                                      <span className="text-sm font-medium">Drop any text file</span>
                                    </div>
                                  </div>
                                )}
                                <div className="relative">
                                  <textarea
                                    className="w-full text-xs bg-black/20 text-foreground p-3 pr-10 focus:outline-none focus:ring-2 focus:ring-purple-500/30 placeholder:text-foreground/30 rounded-xl transition-all h-24 resize-none"
                                    placeholder="Custom instructions for this model... (drag & drop file or click expand)"
                                    value={modelPrompt || ''}
                                    onChange={(e) => onChangeSystemPrompt?.(e.target.value)}
                                    onPaste={(e) => handlePromptPaste(e, 'model')}
                                  />
                                  {/* Expand button */}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setPromptModal({ open: true, target: 'model' }); }}
                                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-foreground/40 hover:text-foreground/80 transition-all"
                                    title="Open fullscreen editor"
                                  >
                                    <Maximize2 size={12} />
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Progress bar for model prompt upload */}
                            {uploadProgress.model && (
                              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-foreground/70">{uploadProgress.model.status}</span>
                                  <span className="text-foreground/50 font-mono">{uploadProgress.model.percent}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-r from-purple-500 to-pink-400 rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${uploadProgress.model.percent}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Load/Export/History buttons - Modern Pills */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                onClick={() => promptFileInputRef.current?.click()}
                                disabled={isLoadingPromptFile}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-foreground/70 hover:text-foreground transition-all disabled:opacity-50"
                                title="Load prompt from any text file"
                              >
                                <Upload size={12} />
                                {isLoadingPromptFile ? 'Loading...' : 'Load file'}
                              </button>
                              {modelPrompt && (
                                <button
                                  onClick={() => handleExportPrompt(modelPrompt, `prompt-${activeModel?.id || 'model'}-${Date.now()}.txt`)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-foreground/70 hover:text-foreground transition-all"
                                  title="Export prompt to file"
                                >
                                  <Download size={12} />
                                  Export
                                </button>
                              )}
                              {promptFileHistory.length > 0 && (
                                <button
                                  onClick={() => setShowPromptHistory(prev => !prev)}
                                  className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded-lg border transition-all",
                                    showPromptHistory
                                      ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                                      : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 text-foreground/70 hover:text-foreground"
                                  )}
                                  title="Show upload history"
                                >
                                  <History size={12} />
                                  History ({promptFileHistory.length})
                                </button>
                              )}
                              {(modelPrompt?.length || 0) > 5000 && (
                                <span className="text-[10px] text-orange-400 ml-auto px-2 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center gap-1">
                                  <AlertTriangle size={10} />
                                  Large ({((modelPrompt?.length || 0) / 1000).toFixed(1)}k)
                                </span>
                              )}
                            </div>

                            {/* Prompt File History Panel */}
                            {showPromptHistory && promptFileHistory.length > 0 && (
                              <div className="space-y-2 p-3 rounded-xl bg-black/20 border border-white/10">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-foreground/60 font-medium">Recent uploads</span>
                                  <button
                                    onClick={clearPromptHistory}
                                    className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                                  >
                                    Clear all
                                  </button>
                                </div>
                                <div className="max-h-32 overflow-y-auto space-y-1 ios-scroll">
                                  {promptFileHistory.map((entry, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => loadFromHistory(entry)}
                                      className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] rounded-lg hover:bg-white/10 transition-all text-left"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className={entry.target === 'global' ? 'text-blue-400' : 'text-purple-400'}>
                                          {entry.target === 'global' ? '🌍' : '🎯'}
                                        </span>
                                        <span className="truncate text-foreground/80">{entry.name}</span>
                                      </div>
                                      <span className="text-foreground/40 flex-shrink-0 ml-2">
                                        {new Date(entry.date).toLocaleDateString()}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Footer with char count and buttons */}
                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                              <span className="text-[10px] text-foreground/40 font-mono">
                                {(modelPrompt || '').length} chars
                              </span>
                              <div className="flex gap-2">
                                {/* Save Model Prompt Button */}
                                <Button
                                  size="sm"
                                  variant={modelPromptHasChanges ? "default" : "ghost"}
                                  onClick={() => onSaveModelPrompt?.()}
                                  disabled={!modelPromptHasChanges}
                                  className={cn(
                                    "h-7 text-[10px] px-3 rounded-lg transition-all",
                                    modelPromptHasChanges
                                      ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90"
                                      : ""
                                  )}
                                >
                                  <Save size={12} className="mr-1.5" />
                                  Save
                                </Button>
                                {/* Save as Preset */}
                                {showSavePreset ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={newPresetName}
                                      onChange={(e) => setNewPresetName(e.target.value)}
                                      placeholder="Preset name..."
                                      className="h-7 w-28 text-[10px] px-3 rounded-lg border border-white/10 bg-black/20 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                      onKeyDown={(e) => e.key === 'Enter' && saveCustomPreset()}
                                      autoFocus
                                    />
                                    <Button size="sm" variant="default" onClick={saveCustomPreset} disabled={!newPresetName.trim()} className="h-7 text-[10px] px-3 rounded-lg bg-amber-500 hover:bg-amber-600">
                                      Save
                                    </Button>
                                    <button onClick={() => setShowSavePreset(false)} className="p-1.5 rounded-full hover:bg-white/10 text-foreground/60 hover:text-foreground transition-all">
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setShowSavePreset(true)}
                                    disabled={!modelPrompt}
                                    className="h-7 text-[10px] px-3 rounded-lg border-white/10 hover:bg-white/5 hover:border-white/20"
                                  >
                                    + Save Preset
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Paste Warning Modal */}
                          {(pasteWarning || isPasting) && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                              <div className="bg-card dark:bg-[#2a2a2a] rounded-xl border border-white/10 p-5 max-w-md w-full mx-4 shadow-2xl">
                                {isPasting ? (
                                  // Loading state
                                  <div className="flex flex-col items-center gap-4 py-4">
                                    <div className="w-10 h-10 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
                                    <p className="text-sm text-foreground/70">Inserting text...</p>
                                  </div>
                                ) : pasteWarning && (
                                  // Warning dialog
                                  <>
                                    <div className="flex items-center gap-3 mb-4">
                                      <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                                        <AlertTriangle size={20} className="text-orange-400" />
                                      </div>
                                      <div>
                                        <h3 className="font-semibold text-foreground">Large Paste Detected</h3>
                                        <p className="text-xs text-foreground/60">
                                          You're pasting {pasteWarning.text.length.toLocaleString()} characters
                                        </p>
                                      </div>
                                    </div>
                                    <div className="p-3 rounded-lg bg-black/20 border border-white/10 mb-4">
                                      <p className="text-xs text-foreground/80 line-clamp-3">
                                        {pasteWarning.text.slice(0, 200)}...
                                      </p>
                                    </div>
                                    {pasteWarning.text.length > 500 && (
                                      <p className="text-xs text-blue-400 mb-2 flex items-center gap-1.5">
                                        💡 Large text will be shown as a compact card (click to expand)
                                      </p>
                                    )}
                                    <p className="text-xs text-foreground/60 mb-4">
                                      Large prompts may affect performance. Do you want to continue?
                                    </p>
                                    <div className="flex gap-2 justify-end">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setPasteWarning(null)}
                                        className="text-foreground/70"
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={confirmPaste}
                                        className="bg-gradient-to-r from-orange-500 to-amber-500 text-white"
                                      >
                                        Paste Anyway
                                      </Button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Fullscreen Prompt Editor Modal - Like Compare Mode */}
                          {promptModal?.open && (
                            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md">
                              <div className="bg-card dark:bg-[#1a1a1a] rounded-2xl border border-white/10 w-[95vw] max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                                {/* Modal Header */}
                                <div className={cn(
                                  "flex items-center justify-between p-4 border-b border-white/10",
                                  promptModal.target === 'global'
                                    ? "bg-gradient-to-r from-blue-500/10 to-cyan-500/10"
                                    : "bg-gradient-to-r from-purple-500/10 to-pink-500/10"
                                )}>
                                  <div className="flex items-center gap-3">
                                    <div className={cn(
                                      "w-10 h-10 rounded-xl flex items-center justify-center",
                                      promptModal.target === 'global'
                                        ? "bg-blue-500/20"
                                        : "bg-purple-500/20"
                                    )}>
                                      {promptModal.target === 'global' ? '🌍' : '🎯'}
                                    </div>
                                    <div>
                                      <h2 className={cn(
                                        "font-semibold",
                                        promptModal.target === 'global' ? "text-blue-400" : "text-purple-400"
                                      )}>
                                        {promptModal.target === 'global' ? 'Global System Prompt' : 'Model Prompt'}
                                      </h2>
                                      <p className="text-xs text-foreground/50">
                                        {promptModal.target === 'global'
                                          ? 'Instructions applied to ALL models'
                                          : `Custom instructions for ${m.display_name || m.name}`}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {/* File info badge */}
                                    {(promptModal.target === 'global' ? loadedFileInfo.global : loadedFileInfo.model) && (
                                      <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-foreground/60">
                                        📄 {(promptModal.target === 'global' ? loadedFileInfo.global : loadedFileInfo.model)?.name}
                                      </span>
                                    )}
                                    <span className="text-xs text-foreground/50 font-mono">
                                      {((promptModal.target === 'global' ? globalPrompt : modelPrompt) || '').length.toLocaleString()} chars
                                    </span>
                                    <button
                                      onClick={() => setPromptModal(null)}
                                      className="p-2 rounded-full hover:bg-white/10 text-foreground/60 hover:text-foreground transition-all"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>

                                {/* Modal Body - Large Textarea */}
                                <div className="flex-1 p-4 overflow-hidden">
                                  <textarea
                                    className={cn(
                                      "w-full h-full text-sm bg-black/30 text-foreground p-4 rounded-xl resize-none focus:outline-none focus:ring-2 placeholder:text-foreground/30 font-mono leading-relaxed",
                                      promptModal.target === 'global'
                                        ? "focus:ring-blue-500/30"
                                        : "focus:ring-purple-500/30"
                                    )}
                                    placeholder={promptModal.target === 'global'
                                      ? "Enter base instructions that apply to ALL models..."
                                      : "Enter custom instructions for this specific model..."}
                                    value={(promptModal.target === 'global' ? globalPrompt : modelPrompt) || ''}
                                    onChange={(e) => {
                                      if (promptModal.target === 'global') {
                                        onChangeGlobalPrompt?.(e.target.value);
                                      } else {
                                        onChangeSystemPrompt?.(e.target.value);
                                      }
                                    }}
                                    autoFocus
                                  />
                                </div>

                                {/* Modal Footer */}
                                <div className="flex items-center justify-between p-4 border-t border-white/10 bg-white/5">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => {
                                        if (promptModal.target === 'global') {
                                          globalPromptFileInputRef.current?.click();
                                        } else {
                                          promptFileInputRef.current?.click();
                                        }
                                      }}
                                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-foreground/70 hover:text-foreground transition-all"
                                    >
                                      <Upload size={14} />
                                      Load File
                                    </button>
                                    <button
                                      onClick={() => {
                                        const content = promptModal.target === 'global' ? globalPrompt : modelPrompt;
                                        handleExportPrompt(content, `${promptModal.target}-prompt-${Date.now()}.txt`);
                                      }}
                                      disabled={!(promptModal.target === 'global' ? globalPrompt : modelPrompt)}
                                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-foreground/70 hover:text-foreground transition-all disabled:opacity-50"
                                    >
                                      <Download size={14} />
                                      Export
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (promptModal.target === 'global') {
                                          onChangeGlobalPrompt?.('');
                                          setLoadedFileInfo(prev => ({ ...prev, global: undefined }));
                                        } else {
                                          onChangeSystemPrompt?.('');
                                          setLoadedFileInfo(prev => ({ ...prev, model: undefined }));
                                        }
                                      }}
                                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-all"
                                    >
                                      Clear
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      onClick={() => setPromptModal(null)}
                                    >
                                      Close
                                    </Button>
                                    <Button
                                      onClick={() => {
                                        if (promptModal.target === 'global') {
                                          onSaveGlobalPrompt?.();
                                        } else {
                                          onSaveModelPrompt?.();
                                        }
                                        setPromptModal(null);
                                      }}
                                      disabled={promptModal.target === 'global' ? !globalPromptHasChanges : !modelPromptHasChanges}
                                      className={cn(
                                        promptModal.target === 'global'
                                          ? "bg-gradient-to-r from-blue-500 to-cyan-500"
                                          : "bg-gradient-to-r from-purple-500 to-pink-500",
                                        "text-white"
                                      )}
                                    >
                                      <Save size={14} className="mr-1.5" />
                                      Save & Close
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Model Capabilities - Modern Chips */}
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          {m.supports_streaming && (
                            <span className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 text-green-400 text-[10px] font-medium">
                              ⚡ Streaming
                            </span>
                          )}
                          {m.supports_vision && (
                            <span className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/30 text-blue-400 text-[10px] font-medium">
                              👁️ Vision
                            </span>
                          )}
                          {m.supports_functions && (
                            <span className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-purple-400 text-[10px] font-medium">
                              🔧 Functions
                            </span>
                          )}
                        </div>

                        {/* Context Info Card */}
                        <div className="p-3 rounded-xl border border-white/10 bg-white/5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-foreground/50 uppercase tracking-wide">Context length</span>
                            <span className="text-sm font-semibold text-foreground/80 font-mono">{m.context_length.toLocaleString()}</span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            className="flex-1 h-9 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:opacity-90 font-medium"
                            onClick={() => {
                              onSelectModel(m);
                              setLocalGenConfig({});
                            }}
                          >
                            Use Model
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-9 rounded-xl border-white/10 hover:bg-white/5"
                            onClick={() => { onManageProviders?.(); setOpen(false); }}
                          >
                            Advanced
                          </Button>
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
                            <div className="pt-4 mt-4 border-t border-white/10 space-y-4">
                              {/* Header with Current Preset Badge */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Zap size={14} className="text-foreground/60" />
                                  <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">Generation</span>
                                </div>
                                <span className={cn(
                                  "text-[10px] px-2.5 py-1 rounded-full font-medium",
                                  currentPreset === 'MAX' ? 'bg-gradient-to-r from-red-500/20 to-orange-500/20 text-orange-400 border border-orange-500/30' :
                                    currentPreset === 'Balanced' ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-400 border border-green-500/30' :
                                      currentPreset === 'MIN' ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-400 border border-blue-500/30' :
                                        'bg-white/5 text-foreground/50 border border-white/10'
                                )}>{currentPreset}</span>
                              </div>

                              {/* Quick Presets - Modern Pill Buttons */}
                              <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10">
                                <span className="text-[10px] text-foreground/50">Quick:</span>
                                <button
                                  onClick={applyMaxPreset}
                                  className={cn(
                                    "px-3 py-1.5 text-[10px] font-medium rounded-lg transition-all",
                                    currentPreset === 'MAX'
                                      ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-lg shadow-orange-500/25 ring-2 ring-orange-400/50'
                                      : 'bg-gradient-to-r from-red-500/80 to-orange-500/80 text-white hover:from-red-500 hover:to-orange-500'
                                  )}
                                  title={`🔥 MAX: temp=1.0, ${maxTokens.toLocaleString()} tokens, high reasoning`}
                                >
                                  🔥 MAX
                                </button>
                                <button
                                  onClick={applyBalancedPreset}
                                  className={cn(
                                    "px-3 py-1.5 text-[10px] font-medium rounded-lg transition-all",
                                    currentPreset === 'Balanced'
                                      ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/25 ring-2 ring-green-400/50'
                                      : 'bg-gradient-to-r from-green-500/80 to-emerald-500/80 text-white hover:from-green-500 hover:to-emerald-500'
                                  )}
                                  title={`⚖️ Balanced: temp=0.7, ${Math.floor(maxTokens / 2).toLocaleString()} tokens, medium`}
                                >
                                  ⚖️ Balanced
                                </button>
                                <button
                                  onClick={applyMinPreset}
                                  className={cn(
                                    "px-3 py-1.5 text-[10px] font-medium rounded-lg transition-all",
                                    currentPreset === 'MIN'
                                      ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/25 ring-2 ring-blue-400/50'
                                      : 'bg-gradient-to-r from-blue-500/80 to-cyan-500/80 text-white hover:from-blue-500 hover:to-cyan-500'
                                  )}
                                  title="❄️ MIN: temp=0.3, 1K tokens, minimal"
                                >
                                  ❄️ MIN
                                </button>
                              </div>

                              {/* Sliders Container */}
                              <div className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/10">
                                {/* Temperature */}
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center">
                                    <label className="text-xs font-medium text-foreground/80">Temperature</label>
                                    <span className="text-xs text-foreground/60 font-mono bg-black/20 px-2 py-0.5 rounded">{displayGenConfig.temperature}</span>
                                  </div>
                                  <input type="range" min={0} max={2} step={0.1} value={displayGenConfig.temperature} onChange={(e) => handleGenChange({ temperature: parseFloat(e.target.value) })} className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary" />
                                  <div className="flex justify-between text-[9px] text-foreground/40">
                                    <span>Precise</span>
                                    <span>Creative</span>
                                  </div>
                                </div>

                                {/* Max tokens */}
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center">
                                    <label className="text-xs font-medium text-foreground/80">Max Tokens</label>
                                    <span className="text-xs text-foreground/60 font-mono bg-black/20 px-2 py-0.5 rounded">{displayGenConfig.max_tokens?.toLocaleString()}</span>
                                  </div>
                                  <input type="range" min={256} max={maxTokens} step={256} value={Math.min(displayGenConfig.max_tokens || 8192, maxTokens)} onChange={(e) => handleGenChange({ max_tokens: parseInt(e.target.value) })} className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary" />
                                  <div className="text-[9px] text-foreground/40">Model limit: {maxTokens.toLocaleString()}</div>
                                </div>

                                {/* Top P */}
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center">
                                    <label className="text-xs font-medium text-foreground/80">Top P</label>
                                    <span className="text-xs text-foreground/60 font-mono bg-black/20 px-2 py-0.5 rounded">{displayGenConfig.top_p}</span>
                                  </div>
                                  <input type="range" min={0} max={1} step={0.05} value={displayGenConfig.top_p} onChange={(e) => handleGenChange({ top_p: parseFloat(e.target.value) })} className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary" />
                                </div>
                              </div>

                              {/* Penalties Grid */}
                              <div className="grid grid-cols-2 gap-3">
                                {/* Frequency Penalty */}
                                <div className="space-y-2 p-3 rounded-xl bg-white/5 border border-white/10">
                                  <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-medium text-foreground/80">Freq Pen</label>
                                    <span className="text-[10px] text-foreground/60 font-mono">{displayGenConfig.frequency_penalty ?? 0}</span>
                                  </div>
                                  <input type="range" min={-2} max={2} step={0.1} value={displayGenConfig.frequency_penalty ?? 0} onChange={(e) => handleGenChange({ frequency_penalty: parseFloat(e.target.value) })} className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary" />
                                </div>

                                {/* Presence Penalty */}
                                <div className="space-y-2 p-3 rounded-xl bg-white/5 border border-white/10">
                                  <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-medium text-foreground/80">Pres Pen</label>
                                    <span className="text-[10px] text-foreground/60 font-mono">{displayGenConfig.presence_penalty ?? 0}</span>
                                  </div>
                                  <input type="range" min={-2} max={2} step={0.1} value={displayGenConfig.presence_penalty ?? 0} onChange={(e) => handleGenChange({ presence_penalty: parseFloat(e.target.value) })} className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary" />
                                </div>
                              </div>

                              {/* Advanced Settings - Collapsible Grid */}
                              <div className="space-y-3 p-4 rounded-xl bg-white/5 border border-white/10">
                                <div className="text-[10px] text-foreground/50 uppercase tracking-wide mb-2">Advanced</div>

                                {/* Reasoning & Verbosity Grid */}
                                <div className="grid grid-cols-2 gap-3">
                                  {/* Reasoning Effort */}
                                  <div className="space-y-1.5">
                                    <label className="text-[10px] font-medium text-foreground/80">🧠 Reasoning</label>
                                    <select
                                      className="w-full text-[10px] border border-white/10 rounded-lg p-2 bg-black/20 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                      value={displayGenConfig.reasoning_effort || 'high'}
                                      onChange={(e) => handleGenChange({ reasoning_effort: e.target.value as 'minimal' | 'medium' | 'high' })}
                                    >
                                      <option value="minimal">❄️ minimal</option>
                                      <option value="medium">⚖️ medium</option>
                                      <option value="high">🔥 high</option>
                                    </select>
                                  </div>

                                  {/* Verbosity */}
                                  <div className="space-y-1.5">
                                    <label className="text-[10px] font-medium text-foreground/80">📝 Verbosity</label>
                                    <select
                                      className="w-full text-[10px] border border-white/10 rounded-lg p-2 bg-black/20 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                      value={displayGenConfig.verbosity || 'high'}
                                      onChange={(e) => handleGenChange({ verbosity: e.target.value as 'low' | 'medium' | 'high' })}
                                    >
                                      <option value="low">❄️ concise</option>
                                      <option value="medium">⚖️ medium</option>
                                      <option value="high">🔥 detailed</option>
                                    </select>
                                  </div>
                                </div>

                                {/* Thinking Budget */}
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-medium text-foreground/80">💭 Thinking Budget</label>
                                    <span className={cn(
                                      "text-[10px] font-mono px-2 py-0.5 rounded",
                                      (displayGenConfig.thinking_budget ?? -1) === -1 ? 'bg-orange-500/20 text-orange-400' :
                                        (displayGenConfig.thinking_budget ?? -1) === 0 ? 'bg-blue-500/20 text-blue-400' :
                                          'bg-green-500/20 text-green-400'
                                    )}>
                                      {(displayGenConfig.thinking_budget ?? -1) === -1 ? '∞ unlimited' : (displayGenConfig.thinking_budget ?? -1) === 0 ? 'OFF' : displayGenConfig.thinking_budget}
                                    </span>
                                  </div>
                                  <input type="range" min={-1} max={100} step={1} value={displayGenConfig.thinking_budget ?? -1} onChange={(e) => handleGenChange({ thinking_budget: parseInt(e.target.value) })} className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary" />
                                </div>

                                {/* Toggles Row */}
                                <div className="flex flex-wrap gap-2 pt-2">
                                  <label className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all text-[10px]",
                                    displayGenConfig.stream !== false
                                      ? "bg-green-500/20 border border-green-500/30 text-green-400"
                                      : "bg-white/5 border border-white/10 text-foreground/60"
                                  )}>
                                    <input type="checkbox" checked={displayGenConfig.stream !== false} onChange={(e) => handleGenChange({ stream: e.target.checked })} className="sr-only" />
                                    ⚡ Stream
                                  </label>
                                  <label className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all text-[10px]",
                                    displayGenConfig.include_thoughts
                                      ? "bg-pink-500/20 border border-pink-500/30 text-pink-400"
                                      : "bg-white/5 border border-white/10 text-foreground/60"
                                  )}>
                                    <input type="checkbox" checked={!!displayGenConfig.include_thoughts} onChange={(e) => handleGenChange({ include_thoughts: e.target.checked })} className="sr-only" />
                                    💭 Thoughts
                                  </label>
                                  <label className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all text-[10px]",
                                    displayGenConfig.free_tool_calling
                                      ? "bg-purple-500/20 border border-purple-500/30 text-purple-400"
                                      : "bg-white/5 border border-white/10 text-foreground/60"
                                  )}>
                                    <input type="checkbox" checked={!!displayGenConfig.free_tool_calling} onChange={(e) => handleGenChange({ free_tool_calling: e.target.checked })} className="sr-only" />
                                    🔧 Tools
                                  </label>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                        {/* Show hint for non-active models */}
                        {!isActiveModel && (
                          <div className="pt-4 mt-4 border-t border-white/10">
                            <p className="text-xs text-foreground/50 text-center">
                              Click "Use Model" to select and configure generation settings
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
              <div className="border-t border-white/10 p-3 flex justify-end bg-white/5">
                <Button size="sm" variant="ghost" className="text-foreground/60 hover:text-foreground hover:bg-white/10" onClick={() => { onManageProviders(); setOpen(false); }}>
                  Manage Providers
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default UnifiedModelMenu;