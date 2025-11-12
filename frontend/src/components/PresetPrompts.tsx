import React from 'react';
import { Button } from './ui/button';

const presets = [
  'Summarize the following text:',
  'Explain this like I am five:',
  'Generate 5 creative taglines about AI innovation.',
  'List pros and cons of using server-side streaming.',
  'Draft an email introducing our multi-provider chat app.'
];

interface PresetPromptsProps {
  onInsert: (text: string) => void;
}

export const PresetPrompts: React.FC<PresetPromptsProps> = ({ onInsert }) => {
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map(p => (
        <Button key={p} variant="secondary" size="sm" type="button" onClick={() => onInsert(p)} className="text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600">
          {p.slice(0, 34)}{p.length > 34 ? '…' : ''}
        </Button>
      ))}
    </div>
  );
};
