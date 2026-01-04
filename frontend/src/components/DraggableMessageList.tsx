import React, { useState, useCallback } from 'react';
import { GripVertical } from 'lucide-react';
import { Message, ModelInfo } from '../types';
import { cn } from '../lib/utils';
import { MessageBubble } from './MessageBubble';

interface DraggableMessageListProps {
  messages: Message[];
  selectedModel?: ModelInfo;
  isStreaming: boolean;
  currentResponse?: string;
  deepResearchStage?: string;
  thinkingContent?: string;
  isThinking?: boolean;
  updateVersion?: number;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDelete?: (index: number) => void;
  onFileDrop?: (files: File[]) => void; // Kept for API compatibility, handled at parent level
}

export const DraggableMessageList: React.FC<DraggableMessageListProps> = ({
  messages,
  selectedModel,
  isStreaming,
  currentResponse,
  deepResearchStage,
  thinkingContent,
  isThinking,
  updateVersion = 0,
  onReorder,
  onDelete,
  onFileDrop: _onFileDrop // File drop is handled at ChatInterface level
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // ===== MESSAGE DRAG & DROP =====
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    if (isStreaming) return;
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.setData('application/x-message-drag', 'true');
    setDraggedIndex(index);
    
    // Add visual feedback
    setTimeout(() => {
      (e.target as HTMLElement).classList.add('opacity-50');
    }, 0);
  }, [isStreaming]);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).classList.remove('opacity-50');
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    
    // Only handle message drags, not file drags
    if (!e.dataTransfer.types.includes('application/x-message-drag')) {
      return;
    }
    
    if (draggedIndex === null || draggedIndex === index) return;
    
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, [draggedIndex]);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    // Only handle message drags
    if (!e.dataTransfer.types.includes('application/x-message-drag')) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    
    if (isNaN(dragIndex) || dragIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    
    onReorder(dragIndex, dropIndex);
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [onReorder]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverIndex(null);
    }
  }, []);

  return (
    <div className="py-4">
      {messages.map((message, index) => {
        const isLastMessage = index === messages.length - 1;
        const keyId = `${message.id}-v${updateVersion}-${isLastMessage && isThinking ? 'thinking' : 'done'}`;
        const isDragging = draggedIndex === index;
        const isDragOver = dragOverIndex === index;
        
        return (
          <div
            key={keyId}
            draggable={!isStreaming}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            className={cn(
              "relative group transition-all duration-200",
              isDragging && "opacity-50 scale-[0.98]",
              isDragOver && "transform translate-y-2",
              !isStreaming && "cursor-grab active:cursor-grabbing"
            )}
          >
            {/* Drop indicator line - above */}
            {isDragOver && draggedIndex !== null && draggedIndex > index && (
              <div className="absolute -top-1 left-4 right-4 h-1 bg-primary rounded-full animate-pulse shadow-lg shadow-primary/50" />
            )}
            
            {/* Drop indicator line - below */}
            {isDragOver && draggedIndex !== null && draggedIndex < index && (
              <div className="absolute -bottom-1 left-4 right-4 h-1 bg-primary rounded-full animate-pulse shadow-lg shadow-primary/50" />
            )}
            
            {/* Drag handle - visible on hover */}
            {!isStreaming && (
              <div 
                className={cn(
                  "absolute left-2 top-1/2 -translate-y-1/2 z-20",
                  "opacity-0 group-hover:opacity-100 transition-all duration-200",
                  "p-1.5 rounded-lg bg-card/90 backdrop-blur-sm border border-border shadow-sm",
                  "text-muted-foreground hover:text-foreground hover:bg-secondary",
                  "cursor-grab active:cursor-grabbing"
                )}
                title="Drag to reorder"
              >
                <GripVertical size={16} />
              </div>
            )}
            
            <MessageBubble
              message={message}
              index={index}
              totalMessages={messages.length}
              selectedModel={selectedModel}
              isStreaming={isStreaming && isLastMessage}
              currentResponse={currentResponse}
              deepResearchStage={isLastMessage ? deepResearchStage : undefined}
              enableReordering={false}
              onMoveUp={undefined}
              onMoveDown={undefined}
              onDelete={onDelete ? () => onDelete(index) : undefined}
              thinkingContent={isLastMessage ? thinkingContent : undefined}
              isThinking={isLastMessage ? isThinking : false}
            />
          </div>
        );
      })}
    </div>
  );
};

export default DraggableMessageList;
