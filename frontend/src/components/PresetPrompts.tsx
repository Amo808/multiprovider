import React from 'react';
import { Button } from './ui/button';

const presets = [
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
        <Button key={p} variant="secondary" size="sm" type="button" onClick={() => onInsert(p)} className="text-xs">
          {p.slice(0, 34)}{p.length > 34 ? '…' : ''}
        </Button>
      ))}
    </div>
  );
};
