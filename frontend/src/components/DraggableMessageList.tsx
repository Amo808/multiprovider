import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GripVertical, User, Bot } from 'lucide-react';
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

// Ghost navigation overlay - shows message structure
const GhostNavigationOverlay: React.FC<{
  messages: Message[];
  draggedIndex: number | null;
  dragOverIndex: number | null;
  containerRect: DOMRect | null;
  onDropTarget: (index: number) => void;
}> = ({ messages, draggedIndex, dragOverIndex, containerRect, onDropTarget }) => {
  if (draggedIndex === null || !containerRect) return null;
  
  return (
    <div 
      className="fixed z-50 pointer-events-auto"
      style={{
        right: 20,
        top: containerRect.top + 20,
        maxHeight: containerRect.height - 40,
      }}
    >
      <div className="bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl p-3 w-48">
        <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
          <GripVertical size={12} />
          Navigation Map
        </div>
        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            const isDragged = idx === draggedIndex;
            const isDropTarget = idx === dragOverIndex;
            const preview = msg.content.substring(0, 25) + (msg.content.length > 25 ? '...' : '');
            
            return (
              <div
                key={idx}
                onClick={() => onDropTarget(idx)}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-all",
                  isDragged && "opacity-40 scale-95",
                  isDropTarget && "bg-primary/20 ring-2 ring-primary ring-offset-1",
                  !isDragged && !isDropTarget && "hover:bg-muted/50",
                  isUser ? "border-l-2 border-l-primary" : "border-l-2 border-l-muted-foreground"
                )}
              >
                <span className="text-[10px] text-muted-foreground w-4">#{idx + 1}</span>
                <div className={cn(
                  "w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0",
                  isUser ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {isUser ? <User size={10} /> : <Bot size={10} />}
                </div>
                <span className="truncate flex-1 text-[11px]">{preview}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 pt-2 border-t border-border">
          <div className="text-[10px] text-muted-foreground text-center">
            Click to drop message here
          </div>
        </div>
      </div>
    </div>
  );
};

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
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);
  const [scrollSpeed, setScrollSpeed] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragImageRef = useRef<HTMLDivElement | null>(null);

  // Update container rect when dragging starts
  useEffect(() => {
    if (draggedIndex !== null && containerRef.current) {
      const parent = containerRef.current.parentElement;
      if (parent) {
        setContainerRect(parent.getBoundingClientRect());
      }
    } else {
      setContainerRect(null);
    }
  }, [draggedIndex]);

  // Enhanced auto-scroll with controlled speed using interval
  useEffect(() => {
    if (scrollSpeed === 0) {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
      return;
    }

    const scrollContainer = containerRef.current?.parentElement;
    if (!scrollContainer) return;

    // Use setInterval for controlled, predictable scrolling
    // At 60ms intervals with speed 1-3, we get 16-50 px/sec (very gentle)
    scrollIntervalRef.current = setInterval(() => {
      scrollContainer.scrollTop += scrollSpeed;
    }, 60);

    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
    };
  }, [scrollSpeed]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
      if (dragImageRef.current && document.body.contains(dragImageRef.current)) {
        document.body.removeChild(dragImageRef.current);
      }
    };
  }, []);

  // Handle drag with controlled auto-scroll
  const handleDrag = useCallback((e: React.DragEvent) => {
    if (draggedIndex === null) return;
    
    // Ignore invalid coordinates (happens when dragging ends)
    if (e.clientY === 0 && e.clientX === 0) {
      setScrollSpeed(0);
      return;
    }
    
    const scrollContainer = containerRef.current?.parentElement;
    if (!scrollContainer) return;

    const rect = scrollContainer.getBoundingClientRect();
    const edgeThreshold = 50; // Small edge zone - 50px from edge
    const maxSpeed = 3; // Very slow: at 60ms interval, max is ~50px/sec

    if (e.clientY < rect.top + edgeThreshold) {
      // In top edge zone - scroll up (speed 1-3 based on proximity)
      const proximity = (rect.top + edgeThreshold - e.clientY) / edgeThreshold;
      const speed = Math.max(1, Math.ceil(proximity * maxSpeed));
      setScrollSpeed(-speed);
    } else if (e.clientY > rect.bottom - edgeThreshold) {
      // In bottom edge zone - scroll down
      const proximity = (e.clientY - (rect.bottom - edgeThreshold)) / edgeThreshold;
      const speed = Math.max(1, Math.ceil(proximity * maxSpeed));
      setScrollSpeed(speed);
    } else {
      // Not in edge zone - stop scrolling immediately
      setScrollSpeed(0);
    }
  }, [draggedIndex]);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    if (isStreaming) {
      e.preventDefault();
      return;
    }
    
    // Set drag data
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.setData('application/x-message-drag', 'true');
    
    // Create mini preview as drag image
    const message = messages[index];
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '-1000px';
    container.style.left = '-1000px';
    document.body.appendChild(container);
    
    // Render mini preview
    const isUser = message.role === 'user';
    const preview = message.content.substring(0, 50) + (message.content.length > 50 ? '...' : '');
    
    container.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 10px;
        border: 2px solid ${isUser ? 'hsl(var(--primary))' : 'hsl(var(--border))'};
        background: ${isUser ? 'hsl(var(--primary))' : 'hsl(var(--card))'};
        color: ${isUser ? 'hsl(var(--primary-foreground))' : 'hsl(var(--card-foreground))'};
        box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        max-width: 250px;
        font-family: system-ui, sans-serif;
        transform: rotate(-2deg);
      ">
        <div style="
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: ${isUser ? 'rgba(255,255,255,0.2)' : 'hsl(var(--muted))'};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          flex-shrink: 0;
        ">${isUser ? '👤' : '🤖'}</div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 9px; opacity: 0.7; margin-bottom: 2px;">#${index + 1} ${isUser ? 'You' : 'Assistant'}</div>
          <div style="font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${preview}</div>
        </div>
      </div>
    `;
    
    dragImageRef.current = container;
    e.dataTransfer.setDragImage(container, 125, 25);
    
    // Cleanup after a delay
    setTimeout(() => {
      if (container && document.body.contains(container)) {
        document.body.removeChild(container);
      }
    }, 100);
    
    setDraggedIndex(index);
  }, [isStreaming, messages]);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    setScrollSpeed(0);
    setContainerRect(null);
  }, []);

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
    setScrollSpeed(0);
    
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
  }, [onReorder]);

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

  // Handle drop from ghost navigation
  const handleGhostDrop = useCallback((targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    onReorder(draggedIndex, targetIndex);
    setDraggedIndex(null);
    setDragOverIndex(null);
    setScrollSpeed(0);
  }, [draggedIndex, onReorder]);

  return (
    <>
      {/* Ghost Navigation Overlay */}
      <GhostNavigationOverlay
        messages={messages}
        draggedIndex={draggedIndex}
        dragOverIndex={dragOverIndex}
        containerRect={containerRect}
        onDropTarget={handleGhostDrop}
      />
      
      {/* Scroll indicators when near edges */}
      {draggedIndex !== null && scrollSpeed !== 0 && (
        <div className={cn(
          "fixed left-0 right-0 h-16 pointer-events-none z-40 flex items-center justify-center",
          scrollSpeed < 0 ? "top-0 bg-gradient-to-b from-primary/20 to-transparent" : "bottom-0 bg-gradient-to-t from-primary/20 to-transparent"
        )}>
          <div className="text-xs text-primary font-medium animate-pulse">
            {scrollSpeed < 0 ? '⬆️ Scrolling up...' : '⬇️ Scrolling down...'}
          </div>
        </div>
      )}
      
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
                isDragging && "opacity-30 scale-[0.97] bg-primary/10 rounded-xl border-2 border-dashed border-primary",
                !isStreaming && "cursor-grab active:cursor-grabbing"
              )}
            >
              {/* Drop indicator line - above */}
              {showTopIndicator && (
                <div className="absolute -top-2 left-4 right-4 z-30">
                  <div className="h-1.5 bg-primary rounded-full animate-pulse shadow-lg shadow-primary/50" />
                  <div className="absolute -left-3 -top-1.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-[8px] text-primary-foreground font-bold">{draggedIndex !== null ? draggedIndex + 1 : ''}</span>
                  </div>
                  <div className="absolute -right-3 -top-1.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-[8px] text-primary-foreground font-bold">→</span>
                  </div>
                </div>
              )}
              
              {/* Drop indicator line - below */}
              {showBottomIndicator && (
                <div className="absolute -bottom-2 left-4 right-4 z-30">
                  <div className="h-1.5 bg-primary rounded-full animate-pulse shadow-lg shadow-primary/50" />
                  <div className="absolute -left-3 -top-1.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-[8px] text-primary-foreground font-bold">{draggedIndex !== null ? draggedIndex + 1 : ''}</span>
                  </div>
                  <div className="absolute -right-3 -top-1.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-[8px] text-primary-foreground font-bold">→</span>
                  </div>
                </div>
              )}
              
              {/* Message number badge - shows during drag */}
              {draggedIndex !== null && (
                <div className={cn(
                  "absolute -left-1 top-2 z-20 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all",
                  isDragging 
                    ? "bg-primary text-primary-foreground scale-125" 
                    : isDragOver 
                      ? "bg-primary/80 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                )}>
                  {index + 1}
                </div>
              )}
              
              {/* Drag handle - visible on hover */}
              {!isStreaming && (
                <div 
                  className={cn(
                    "absolute left-2 top-1/2 -translate-y-1/2 z-20",
                    "opacity-0 group-hover:opacity-100 transition-all duration-200",
                    "p-2 rounded-lg bg-card/95 backdrop-blur-sm border border-border shadow-md",
                    "text-muted-foreground hover:text-foreground hover:bg-secondary",
                    "cursor-grab active:cursor-grabbing",
                    isDragging && "opacity-100 bg-primary/20 text-primary scale-110"
                  )}
                  title="Drag to reorder"
                >
                  <GripVertical size={18} />
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
    </>
  );
};

export default DraggableMessageList;
