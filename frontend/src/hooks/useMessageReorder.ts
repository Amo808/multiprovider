import { useState, useCallback } from 'react';
import { apiClient } from '../services/api';
import { Message } from '../types';

type ReorderOperation = 'swap' | 'move_up' | 'move_down' | 'move_to' | 'reverse' | 'sort_time' | 'sort_role' | 'interleave' | 'remove' | 'duplicate';

interface MessagePreview {
  index: number;
  role: string;
  content_preview: string;
  compressed: boolean;
  timestamp: string;
}

interface UseMessageReorderReturn {
  isReordering: boolean;
  error: string | null;
  reorderMessages: (
    conversationId: string,
    operation: ReorderOperation,
    params?: {
      index?: number;
      index1?: number;
      index2?: number;
      from_index?: number;
      to_index?: number;
      ascending?: boolean;
    }
  ) => Promise<Message[] | null>;
  moveUp: (conversationId: string, index: number) => Promise<Message[] | null>;
  moveDown: (conversationId: string, index: number) => Promise<Message[] | null>;
  swap: (conversationId: string, index1: number, index2: number) => Promise<Message[] | null>;
  moveTo: (conversationId: string, fromIndex: number, toIndex: number) => Promise<Message[] | null>;
  deleteMessage: (conversationId: string, index: number) => Promise<Message[] | null>;
  reverseOrder: (conversationId: string) => Promise<Message[] | null>;
  sortByTime: (conversationId: string, ascending?: boolean) => Promise<Message[] | null>;
  interleave: (conversationId: string) => Promise<Message[] | null>;
  getPreview: (conversationId: string) => Promise<MessagePreview[] | null>;
}

export function useMessageReorder(): UseMessageReorderReturn {
  const [isReordering, setIsReordering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reorderMessages = useCallback(async (
    conversationId: string,
    operation: ReorderOperation,
    params?: {
      index?: number;
      index1?: number;
      index2?: number;
      from_index?: number;
      to_index?: number;
      ascending?: boolean;
    }
  ): Promise<Message[] | null> => {
    setIsReordering(true);
    setError(null);

    try {
      const result = await apiClient.reorderMessages({
        conversation_id: conversationId,
        operation,
        ...params
      });

      if (!result.success) {
        throw new Error('Reorder operation failed');
      }

      // SAFETY: Check for empty messages response (indicates backend error)
      if (!result.messages || result.messages.length === 0) {
        console.error('[useMessageReorder] Backend returned empty messages array - this is likely a bug');
        throw new Error('Reorder returned empty messages - operation may have failed');
      }

      // Convert API response to Message[]
      const messages: Message[] = result.messages.map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
        timestamp: msg.timestamp,
        meta: msg.meta
      }));

      console.log(`[useMessageReorder] Success: ${messages.length} messages returned`);
      return messages;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reorder messages';
      setError(errorMessage);
      console.error('[useMessageReorder] Error:', errorMessage);
      return null;
    } finally {
      setIsReordering(false);
    }
  }, []);

  const moveUp = useCallback(async (conversationId: string, index: number) => {
    return reorderMessages(conversationId, 'move_up', { index });
  }, [reorderMessages]);

  const moveDown = useCallback(async (conversationId: string, index: number) => {
    return reorderMessages(conversationId, 'move_down', { index });
  }, [reorderMessages]);

  const swap = useCallback(async (conversationId: string, index1: number, index2: number) => {
    return reorderMessages(conversationId, 'swap', { index1, index2 });
  }, [reorderMessages]);

  const moveTo = useCallback(async (conversationId: string, fromIndex: number, toIndex: number) => {
    return reorderMessages(conversationId, 'move_to', { from_index: fromIndex, to_index: toIndex });
  }, [reorderMessages]);

  const deleteMessage = useCallback(async (conversationId: string, index: number) => {
    return reorderMessages(conversationId, 'remove', { index });
  }, [reorderMessages]);

  const reverseOrder = useCallback(async (conversationId: string) => {
    return reorderMessages(conversationId, 'reverse');
  }, [reorderMessages]);

  const sortByTime = useCallback(async (conversationId: string, ascending: boolean = true) => {
    return reorderMessages(conversationId, 'sort_time', { ascending });
  }, [reorderMessages]);

  const interleave = useCallback(async (conversationId: string) => {
    return reorderMessages(conversationId, 'interleave');
  }, [reorderMessages]);

  const getPreview = useCallback(async (conversationId: string): Promise<MessagePreview[] | null> => {
    try {
      const result = await apiClient.getMessagesPreview(conversationId);
      return result.preview;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get message preview';
      setError(errorMessage);
      console.error('[useMessageReorder] Preview error:', errorMessage);
      return null;
    }
  }, []);

  return {
    isReordering,
    error,
    reorderMessages,
    moveUp,
    moveDown,
    swap,
    moveTo,
    deleteMessage,
    reverseOrder,
    sortByTime,
    interleave,
    getPreview
  };
}
