// SystemPromptEditor - now integrated directly into UnifiedModelMenu
// This file kept for compatibility

import React from 'react';

interface SystemPromptEditorProps {
  globalPrompt: string;
  onChangeGlobalPrompt: (prompt: string) => void;
  onSaveGlobalPrompt: () => Promise<void>;
  globalHasChanges: boolean;
  modelPrompt: string;
  onChangeModelPrompt: (prompt: string) => void;
  onSaveModelPrompt?: () => Promise<void>;
  modelHasChanges: boolean;
  modelName?: string;
  modelId?: string;
  showPreview?: boolean;
}

// Minimal stub - actual implementation is in UnifiedModelMenu
export const SystemPromptEditor: React.FC<SystemPromptEditorProps> = () => null;

export default SystemPromptEditor;
