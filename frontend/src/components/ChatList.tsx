import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChatMessage, ChatMessageData } from './ChatMessage';
import { ModelInfo } from '../types';

interface ChatListProps {
  messages: ChatMessageData[];
  isStreaming?: boolean;
  currentResponse?: string;
  selectedModel?: ModelInfo;
  deepResearchStage?: string;
}

export const ChatList: React.FC<ChatListProps> = ({ messages, isStreaming, currentResponse, selectedModel }) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 4
  });

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map(virtualRow => {
          const msg = messages[virtualRow.index];
          const streaming = isStreaming && virtualRow.index === messages.length - 1;
          return (
            <div
              key={msg.id}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
            >
              <ChatMessage
                message={msg}
                isStreaming={streaming}
                streamContent={streaming ? currentResponse : undefined}
                selectedModel={selectedModel}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
