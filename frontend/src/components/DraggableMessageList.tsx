import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  onBranchFrom?: (index: number) => void;
  onFileDrop?: (files: File[]) => void;
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
  onBranchFrom,
  onFileDrop: _onFileDrop
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-scroll when dragging near edges
  const startAutoScroll = useCallback((direction: 'up' | 'down') => {
    if (scrollIntervalRef.current) return;
    
    const scrollContainer = containerRef.current?.parentElement;
    if (!scrollContainer) return;

    const scrollSpeed = 8;
    scrollIntervalRef.current = setInterval(() => {
      if (direction === 'up') {
        scrollContainer.scrollTop -= scrollSpeed;
      } else {
        scrollContainer.scrollTop += scrollSpeed;
      }
    }, 16);
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAutoScroll();
    };
  }, [stopAutoScroll]);

  // Handle drag with auto-scroll
  const handleDrag = useCallback((e: React.DragEvent) => {
    if (draggedIndex === null) return;
    
    const scrollContainer = containerRef.current?.parentElement;
    if (!scrollContainer) return;

    const rect = scrollContainer.getBoundingClientRect();
    const edgeThreshold = 80; // pixels from edge to start scrolling

    if (e.clientY < rect.top + edgeThreshold) {
      startAutoScroll('up');
    } else if (e.clientY > rect.bottom - edgeThreshold) {
      startAutoScroll('down');
    } else {
      stopAutoScroll();
    }
  }, [draggedIndex, startAutoScroll, stopAutoScroll]);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    if (isStreaming) {
      e.preventDefault();
      return;
    }
    
    // Set drag data
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.setData('application/x-message-drag', 'true');
    
    // Create a custom drag image
    const target = e.currentTarget as HTMLElement;
    const clone = target.cloneNode(true) as HTMLElement;
    clone.style.width = `${target.offsetWidth}px`;
    clone.style.opacity = '0.8';
    clone.style.transform = 'rotate(2deg)';
    clone.style.position = 'absolute';
    clone.style.top = '-9999px';
    document.body.appendChild(clone);
    e.dataTransfer.setDragImage(clone, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    
    // Cleanup clone after drag starts
    setTimeout(() => {
      document.body.removeChild(clone);
    }, 0);
    
    setDraggedIndex(index);
  }, [isStreaming]);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    stopAutoScroll();
  }, [stopAutoScroll]);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only handle message drags, not file drags
    if (!e.dataTransfer.types.includes('application/x-message-drag')) {
      return;
    }
    
    e.dataTransfer.dropEffect = 'move';
    
    if (draggedIndex === null || draggedIndex === index) {
      setDragOverIndex(null);
      return;
    }
    
    setDragOverIndex(index);
  }, [draggedIndex]);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    stopAutoScroll();
    
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
    
    console.log(`[DraggableMessageList] Reordering: ${dragIndex} -> ${dropIndex}`);
    onReorder(dragIndex, dropIndex);
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [onReorder, stopAutoScroll]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only clear if leaving the actual element, not moving to a child
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      setDragOverIndex(null);
    }
  }, []);

  return (
    <div ref={containerRef} className="py-4" onDragOver={handleDrag}>
      {messages.map((message, index) => {
        const isLastMessage = index === messages.length - 1;
        const keyId = `${message.id}-v${updateVersion}-${isLastMessage && isThinking ? 'thinking' : 'done'}`;
        const isDragging = draggedIndex === index;
        const isDragOver = dragOverIndex === index && draggedIndex !== null;
        const showTopIndicator = isDragOver && draggedIndex !== null && draggedIndex > index;
        const showBottomIndicator = isDragOver && draggedIndex !== null && draggedIndex < index;
        
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
              isDragging && "opacity-40 scale-[0.98] bg-primary/5 rounded-lg",
              !isStreaming && "cursor-grab active:cursor-grabbing"
            )}
          >
            {/* Drop indicator line - above */}
            {showTopIndicator && (
              <div className="absolute -top-1 left-4 right-4 z-30">
                <div className="h-1 bg-primary rounded-full animate-pulse shadow-lg shadow-primary/50" />
                <div className="absolute -left-2 -top-1 w-3 h-3 bg-primary rounded-full" />
                <div className="absolute -right-2 -top-1 w-3 h-3 bg-primary rounded-full" />
              </div>
            )}
            
            {/* Drop indicator line - below */}
            {showBottomIndicator && (
              <div className="absolute -bottom-1 left-4 right-4 z-30">
                <div className="h-1 bg-primary rounded-full animate-pulse shadow-lg shadow-primary/50" />
                <div className="absolute -left-2 -top-1 w-3 h-3 bg-primary rounded-full" />
                <div className="absolute -right-2 -top-1 w-3 h-3 bg-primary rounded-full" />
              </div>
            )}
            
            {/* Drag handle - visible on hover */}
            {!isStreaming && (
              <div 
                className={cn(
                  "absolute left-2 top-1/2 -translate-y-1/2 z-20",
                  "opacity-0 group-hover:opacity-100 transition-all duration-200",
                  "p-1.5 rounded-lg bg-card/90 backdrop-blur-sm border border-border shadow-sm",
                  "text-muted-foreground hover:text-foreground hover:bg-secondary",
                  "cursor-grab active:cursor-grabbing",
                  isDragging && "opacity-100 bg-primary/20 text-primary"
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
              onBranchFrom={onBranchFrom ? () => onBranchFrom(index) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
};

export default DraggableMessageList;
