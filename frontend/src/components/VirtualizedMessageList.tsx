import React, { useRef, useCallback, useMemo, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Message, ModelInfo } from '../types';
import { MessageBubble } from './MessageBubble';
import { cn } from '../lib/utils';
import { Loader2 } from 'lucide-react';

interface VirtualizedMessageListProps {
    messages: Message[];
    selectedModel?: ModelInfo;
    isStreaming: boolean;
    currentResponse?: string;
    deepResearchStage?: string;
    thinkingContent?: string;
    isThinking?: boolean;
    updateVersion?: number;
    onDelete?: (index: number) => void;
    onBranchFrom?: (index: number) => void;
    hasMore?: boolean;
    isLoadingMore?: boolean;
    onLoadMore?: () => void;
}

// Memoized message wrapper to prevent re-renders
const MemoizedMessage = memo(({
    message,
    index,
    totalMessages,
    selectedModel,
    isStreaming,
    currentResponse,
    deepResearchStage,
    thinkingContent,
    isThinking,
    onDelete,
    onBranchFrom
}: {
    message: Message;
    index: number;
    totalMessages: number;
    selectedModel?: ModelInfo;
    isStreaming: boolean;
    currentResponse?: string;
    deepResearchStage?: string;
    thinkingContent?: string;
    isThinking?: boolean;
    onDelete?: () => void;
    onBranchFrom?: () => void;
}) => {
    const isLastMessage = index === totalMessages - 1;

    return (
        <MessageBubble
            message={message}
            index={index}
            totalMessages={totalMessages}
            selectedModel={selectedModel}
            isStreaming={isStreaming && isLastMessage}
            currentResponse={isLastMessage ? currentResponse : undefined}
            deepResearchStage={isLastMessage ? deepResearchStage : undefined}
            thinkingContent={isLastMessage ? thinkingContent : undefined}
            isThinking={isLastMessage ? isThinking : false}
            onDelete={onDelete}
            onBranchFrom={onBranchFrom}
        />
    );
}, (prevProps, nextProps) => {
    // Custom comparison - only re-render if these specific props change
    const isLastPrev = prevProps.index === prevProps.totalMessages - 1;
    const isLastNext = nextProps.index === nextProps.totalMessages - 1;

    // Always re-render the last message during streaming
    if (isLastNext && nextProps.isStreaming) {
        return false; // Don't skip render
    }

    // For other messages, only re-render if content or key props change
    return (
        prevProps.message.id === nextProps.message.id &&
        prevProps.message.content === nextProps.message.content &&
        prevProps.index === nextProps.index &&
        prevProps.totalMessages === nextProps.totalMessages &&
        isLastPrev === isLastNext &&
        // For last message, also check streaming props
        ((!isLastPrev && !isLastNext) || (
            prevProps.isStreaming === nextProps.isStreaming &&
            prevProps.currentResponse === nextProps.currentResponse &&
            prevProps.thinkingContent === nextProps.thinkingContent &&
            prevProps.isThinking === nextProps.isThinking
        ))
    );
});

MemoizedMessage.displayName = 'MemoizedMessage';

export const VirtualizedMessageList: React.FC<VirtualizedMessageListProps> = ({
    messages,
    selectedModel,
    isStreaming,
    currentResponse,
    deepResearchStage,
    thinkingContent,
    isThinking,
    updateVersion = 0,
    onDelete,
    onBranchFrom,
    hasMore = false,
    isLoadingMore = false,
    onLoadMore
}) => {
    const parentRef = useRef<HTMLDivElement>(null);

    // Estimate row heights - user messages are usually shorter
    // NOTE: This is just an ESTIMATE for initial layout.
    // The actual height is measured by virtualizer.measureElement
    const estimateSize = useCallback((index: number) => {
        const message = messages[index];
        if (!message) return 200;

        const contentLength = message.content?.length || 0;
        const isUser = message.role === 'user';

        // Rough estimation based on content length
        // These are just initial guesses - actual size is measured dynamically
        if (isUser) {
            // User messages are simpler
            if (contentLength < 100) return 100;
            if (contentLength < 500) return 150;
            if (contentLength < 2000) return 250;
            return 300 + Math.floor(contentLength / 500) * 30;
        } else {
            // Assistant messages can be much longer with code blocks, lists, etc.
            if (contentLength < 200) return 200;
            if (contentLength < 1000) return 350;
            if (contentLength < 3000) return 600;
            if (contentLength < 10000) return 1000;
            // For very long messages, estimate more generously
            // ~20px per 100 chars is a rough estimate for rendered markdown
            return 1000 + Math.floor((contentLength - 10000) / 100) * 15;
        }
    }, [messages]);

    const virtualizer = useVirtualizer({
        count: messages.length,
        getScrollElement: () => parentRef.current,
        estimateSize,
        overscan: 3, // Render 3 extra items above/below viewport
        getItemKey: (index) => `${messages[index]?.id || index}-v${updateVersion}`,
    });

    const items = virtualizer.getVirtualItems();

    // Scroll to bottom when new messages arrive or streaming
    const lastMessageId = messages[messages.length - 1]?.id;
    const prevLastMessageIdRef = useRef(lastMessageId);

    React.useEffect(() => {
        if (lastMessageId !== prevLastMessageIdRef.current || isStreaming) {
            prevLastMessageIdRef.current = lastMessageId;
            // Scroll to bottom
            virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
        }
    }, [lastMessageId, isStreaming, messages.length, virtualizer]);

    // Memoize delete/branch handlers to prevent re-renders
    const deleteHandlers = useMemo(() => {
        if (!onDelete) return {};
        return messages.reduce((acc, _, index) => {
            acc[index] = () => onDelete(index);
            return acc;
        }, {} as Record<number, () => void>);
    }, [messages.length, onDelete]);

    const branchHandlers = useMemo(() => {
        if (!onBranchFrom) return {};
        return messages.reduce((acc, _, index) => {
            acc[index] = () => onBranchFrom(index);
            return acc;
        }, {} as Record<number, () => void>);
    }, [messages.length, onBranchFrom]);

    return (
        <div
            ref={parentRef}
            className="h-full overflow-auto"
        >
            {/* Load more button */}
            {hasMore && (
                <div className="flex justify-center py-4">
                    <button
                        onClick={onLoadMore}
                        disabled={isLoadingMore}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg",
                            "bg-secondary hover:bg-secondary/80 text-secondary-foreground",
                            "text-sm font-medium transition-colors",
                            isLoadingMore && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        {isLoadingMore ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Loading...
                            </>
                        ) : (
                            'Load earlier messages'
                        )}
                    </button>
                </div>
            )}

            <div
                className="relative w-full max-w-3xl mx-auto px-4"
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                }}
            >
                {items.map((virtualRow) => {
                    const message = messages[virtualRow.index];
                    const index = virtualRow.index;

                    return (
                        <div
                            key={virtualRow.key}
                            data-index={index}
                            ref={virtualizer.measureElement}
                            className="absolute top-0 left-0 w-full px-4"
                            style={{
                                transform: `translateY(${virtualRow.start}px)`,
                            }}
                        >
                            <MemoizedMessage
                                message={message}
                                index={index}
                                totalMessages={messages.length}
                                selectedModel={selectedModel}
                                isStreaming={isStreaming}
                                currentResponse={currentResponse}
                                deepResearchStage={deepResearchStage}
                                thinkingContent={thinkingContent}
                                isThinking={isThinking}
                                onDelete={deleteHandlers[index]}
                                onBranchFrom={branchHandlers[index]}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default VirtualizedMessageList;
