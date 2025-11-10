import React, { useEffect } from 'react';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from './ui/command';
import { Dialog, DialogContent } from './ui/dialog';
import { Settings, PlusCircle, Trash2, Search, BookText, Bot, RefreshCcw } from 'lucide-react';
import { ModelInfo } from '../types';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: ModelInfo[];
  onSelectModel: (m: ModelInfo) => void;
  onNewConversation: () => void;
  onClearCurrent: () => void;
  onOpenSettings: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onOpenChange, models, onSelectModel, onNewConversation, onClearCurrent, onOpenSettings }) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(true);
      }
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden">
        <Command>
          <CommandInput placeholder="Type a command or search models..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Models">
              {models.map(m => (
                <CommandItem key={m.id} onSelect={() => { onSelectModel(m); onOpenChange(false); }}>
                  <Bot size={14} />
                  <span className="truncate max-w-[220px]">{m.display_name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{m.provider.toUpperCase()}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => { onNewConversation(); onOpenChange(false); }}>
                <PlusCircle size={14} /> New Conversation <span className="ml-auto text-xs">Ctrl+N</span>
              </CommandItem>
              <CommandItem onSelect={() => { onClearCurrent(); onOpenChange(false); }}>
                <Trash2 size={14} /> Clear Current <span className="ml-auto text-xs">Ctrl+Shift+C</span>
              </CommandItem>
              <CommandItem onSelect={() => { onOpenSettings(); onOpenChange(false); }}>
                <Settings size={14} /> Settings <span className="ml-auto text-xs">Ctrl+,</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Help">
              <CommandItem>
                <Search size={14} /> Search Docs
              </CommandItem>
              <CommandItem>
                <BookText size={14} /> Prompt Library
              </CommandItem>
              <CommandItem>
                <RefreshCcw size={14} /> Refresh Provider Models
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
