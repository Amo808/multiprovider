import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import TextareaAutosize from 'react-textarea-autosize';
import { Send, Square } from 'lucide-react';
import { Button } from './ui/button';
import { useHotkeys } from 'react-hotkeys-hook';
import { ModelInfo, ModelProvider, GenerationConfig } from '../types';

const schema = z.object({ message: z.string().min(1, 'Message required') });

export interface ComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  selectedModel?: ModelInfo;
  selectedProvider?: ModelProvider;
  stop: () => void;
  generationConfig: GenerationConfig;
}

export const Composer: React.FC<ComposerProps> = ({ onSend, disabled, isStreaming, stop, selectedModel, selectedProvider }) => {
  const { register, handleSubmit, setValue, watch } = useForm<{ message: string }>({ resolver: zodResolver(schema), defaultValues: { message: '' } });
  const value = watch('message');

  const submit = (data: { message: string }) => {
    onSend(data.message.trim());
    setValue('message', '');
  };

  useHotkeys('enter', (e) => { if (!e.shiftKey) { e.preventDefault(); if (value.trim() && !isStreaming && !disabled) handleSubmit(submit)(); } }, { enableOnFormTags: true });

  return (
    <form onSubmit={handleSubmit(submit)} className="flex space-x-3">
      <div className="flex-1 relative">
        <TextareaAutosize
          minRows={1}
          maxRows={10}
          {...register('message')}
          placeholder={selectedModel ? 'Type your message...' : 'Select a model first...'}
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white resize-none"
          disabled={disabled || isStreaming || !selectedModel}
        />
        <div className="absolute bottom-1 right-2 text-[10px] text-gray-400">{value.length}</div>
      </div>
      {isStreaming ? (
        <Button type="button" variant="destructive" onClick={stop} className="px-6" title="Stop generation"><Square size={18} /></Button>
      ) : (
        <Button type="submit" disabled={!value.trim() || disabled || !selectedModel} className="px-6" title="Send"><Send size={18} /></Button>
      )}
    </form>
  );
};
