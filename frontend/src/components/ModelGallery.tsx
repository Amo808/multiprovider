import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ModelInfo } from '../types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

interface ModelGalleryProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  models: ModelInfo[];
  onSelect: (m: ModelInfo) => void;
}

export const ModelGallery: React.FC<ModelGalleryProps> = ({ open, onOpenChange, models, onSelect }) => {
  const capabilityBadges = (m: ModelInfo) => (
    <div className="flex flex-wrap gap-1 mt-2">
      {m.supports_streaming && <Badge variant="secondary">Streaming</Badge>}
      {m.supports_functions && <Badge variant="outline">Functions</Badge>}
      {m.supports_vision && <Badge variant="outline">Vision</Badge>}
    </div>
  );

  // group by provider
  const groups = models.reduce<Record<string, ModelInfo[]>>((acc, m) => { (acc[m.provider] = acc[m.provider] || []).push(m); return acc; }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Model Gallery</DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto pr-1">
          {Object.entries(groups).map(([provider, list]) => (
            <div key={provider} className="border rounded-lg p-3 bg-muted/30">
              <div className="text-xs font-semibold mb-2 tracking-wide text-muted-foreground">{provider.toUpperCase()}</div>
              <div className="space-y-2">
                {list.map(m => (
                  <div key={m.id} className="rounded-md border bg-card p-2 hover:border-primary/60 transition">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium leading-tight">{m.display_name}</div>
                        <div className="text-[11px] text-muted-foreground">ctx {m.context_length.toLocaleString()}</div>
                        {capabilityBadges(m)}
                      </div>
                      <Button size="sm" variant={m.enabled ? 'default' : 'secondary'} onClick={() => { onSelect(m); onOpenChange(false); }}>Select</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
