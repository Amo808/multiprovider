import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Save, Globe, Cpu, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

interface SystemPromptEditorProps {
  // Global prompt (applies to all models)
  globalPrompt: string;
  onChangeGlobalPrompt: (prompt: string) => void;
  onSaveGlobalPrompt: () => Promise<void>;
  globalHasChanges: boolean;
  
  // Per-model prompt (adds to global for specific model)
  modelPrompt: string;
  onChangeModelPrompt: (prompt: string) => void;
  onSaveModelPrompt: () => Promise<void>;
  modelHasChanges: boolean;
  
  // Model info
  modelName?: string;
  modelId?: string;
  
  // Combined preview
  showPreview?: boolean;
}

/**
 * OpenRouter-style System Prompt Editor.
 * 
 * Two sections:
 * 1. Global System Prompt - applies to ALL models (base instructions)
 * 2. Model-Specific Prompt - adds to global for THIS model (specialization)
 * 
 * Final prompt = Global + "\n\n" + Model-Specific
 */
export const SystemPromptEditor: React.FC<SystemPromptEditorProps> = ({
  globalPrompt,
  onChangeGlobalPrompt,
  onSaveGlobalPrompt,
  globalHasChanges,
  modelPrompt,
  onChangeModelPrompt,
  onSaveModelPrompt,
  modelHasChanges,
  modelName,
  modelId,
  showPreview = false
}) => {
  const [expandedGlobal, setExpandedGlobal] = useState(true);
  const [expandedModel, setExpandedModel] = useState(true);
  const [expandedPreview, setExpandedPreview] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingModel, setSavingModel] = useState(false);

  // Combined prompt preview
  const combinedPrompt = [globalPrompt, modelPrompt].filter(Boolean).join('\n\n---\n\n');

  const handleSaveGlobal = async () => {
    setSavingGlobal(true);
    try {
      await onSaveGlobalPrompt();
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleSaveModel = async () => {
    setSavingModel(true);
    try {
      await onSaveModelPrompt();
    } finally {
      setSavingModel(false);
    }
  };

  const handleSaveAll = async () => {
    if (globalHasChanges) await handleSaveGlobal();
    if (modelHasChanges) await handleSaveModel();
  };

  return (
    <div className="space-y-3">
      {/* Global System Prompt */}
      <div className="border rounded-lg overflow-hidden">
        <button
          onClick={() => setExpandedGlobal(!expandedGlobal)}
          className="w-full flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Globe size={14} className="text-blue-500" />
            <span className="text-xs font-semibold">Global System Prompt</span>
            <span className="text-[10px] text-muted-foreground">(all models)</span>
            {globalHasChanges && (
              <span className="text-[10px] text-orange-500 font-medium">• unsaved</span>
            )}
          </div>
          {expandedGlobal ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        
        {expandedGlobal && (
          <div className="p-2 space-y-2">
            <textarea
              className="w-full text-xs rounded border bg-background p-2 resize-none h-24 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Base instructions for ALL models. Example: 'You are a helpful AI assistant. Always be concise and accurate.'"
              value={globalPrompt}
              onChange={(e) => onChangeGlobalPrompt(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {globalPrompt.length} chars • Applies to every model
              </span>
              <Button
                size="sm"
                variant={globalHasChanges ? "default" : "outline"}
                onClick={handleSaveGlobal}
                disabled={!globalHasChanges || savingGlobal}
                className="h-6 text-[10px] px-2"
              >
                <Save size={10} className="mr-1" />
                {savingGlobal ? 'Saving...' : 'Save Global'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Per-Model System Prompt */}
      <div className="border rounded-lg overflow-hidden">
        <button
          onClick={() => setExpandedModel(!expandedModel)}
          className="w-full flex items-center justify-between p-2 bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-950/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-purple-500" />
            <span className="text-xs font-semibold">Model-Specific Prompt</span>
            <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
              ({modelName || modelId || 'select model'})
            </span>
            {modelHasChanges && (
              <span className="text-[10px] text-orange-500 font-medium">• unsaved</span>
            )}
          </div>
          {expandedModel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        
        {expandedModel && (
          <div className="p-2 space-y-2">
            <textarea
              className="w-full text-xs rounded border bg-background p-2 resize-none h-24 focus:outline-none focus:ring-1 focus:ring-purple-500"
              placeholder="Additional instructions for THIS model only. Example: 'For code questions, always include examples.'"
              value={modelPrompt}
              onChange={(e) => onChangeModelPrompt(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {modelPrompt.length} chars • Adds to global for this model
              </span>
              <Button
                size="sm"
                variant={modelHasChanges ? "default" : "outline"}
                onClick={handleSaveModel}
                disabled={!modelHasChanges || savingModel}
                className="h-6 text-[10px] px-2"
              >
                <Save size={10} className="mr-1" />
                {savingModel ? 'Saving...' : 'Save Model'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Combined Preview (optional) */}
      {showPreview && combinedPrompt && (
        <div className="border rounded-lg overflow-hidden">
          <button
            onClick={() => setExpandedPreview(!expandedPreview)}
            className="w-full flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-900/70 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">📋 Final Prompt Preview</span>
              <span className="text-[10px] text-muted-foreground">
                ({combinedPrompt.length} chars total)
              </span>
            </div>
            {expandedPreview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          
          {expandedPreview && (
            <div className="p-2">
              <pre className="w-full text-[10px] rounded border bg-muted/30 p-2 whitespace-pre-wrap max-h-32 overflow-auto">
                {combinedPrompt || '(empty - no system prompt set)'}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Quick Actions */}
      {(globalHasChanges || modelHasChanges) && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            size="sm"
            variant="default"
            onClick={handleSaveAll}
            disabled={savingGlobal || savingModel}
            className="h-7 text-xs"
          >
            <Save size={12} className="mr-1" />
            Save All Changes
          </Button>
        </div>
      )}
    </div>
  );
};

export default SystemPromptEditor;
