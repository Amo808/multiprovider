import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Message, ModelInfo } from '../types';
import { User, Bot } from 'lucide-react';
import 'katex/dist/katex.min.css';

// Более точная оценка токенов с учетом истории
const estimateTokens = (text: string, isUserMessage: boolean = false, messageHistory?: Message[]): number => {
  if (!text || text.trim().length === 0) return 1;
  
  const cleanText = text.trim();
  const chars = cleanText.length;
  
  // Базовая оценка для текущего сообщения
  let messageTokens = Math.ceil(chars / 3.5); // ~3.5 символа на токен
  
  // Минимум 1 токен за сообщение
  messageTokens = Math.max(1, messageTokens);
  
  // Если это сообщение пользователя, учитываем что в input войдет вся история
  if (isUserMessage && messageHistory && messageHistory.length > 0) {
    // Оценка истории: берем последние 10-15 сообщений
    const recentHistory = messageHistory.slice(-15);
    let historyTokens = 0;
    
    recentHistory.forEach(msg => {
      if (msg.content) {
        historyTokens += Math.ceil(msg.content.length / 3.5);
      }
    });
    
    // Добавляем системный промпт (~50-100 токенов)
    historyTokens += 75;
    
    // Общие input tokens = история + текущее сообщение
    return messageTokens + historyTokens;
  }
  
  // Для ассистента - только его ответ (output tokens)
  return messageTokens;
};

interface MessageListProps {
  messages: Message[];
  streamingContent?: string;
  isStreaming?: boolean;
  currentModel?: ModelInfo;
}

const MessageItem: React.FC<{ 
  message: Message; 
  isStreaming?: boolean; 
  streamingContent?: string; 
  currentModel?: ModelInfo;
  messageHistory?: Message[];
  messageIndex?: number;
}> = ({ 
  message, 
  isStreaming, 
  streamingContent,
  currentModel,
  messageHistory = [],
  messageIndex = 0
}) => {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  
  if (!isUser && !isAssistant) return null;

  const displayContent = isStreaming && streamingContent ? streamingContent : message.content;

  return (
    <div className={`chat-message ${isUser ? 'user-message' : 'assistant-message'}`}>
      <div className="flex items-start space-x-3 mb-4">
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? 'bg-primary-500 text-white' : 'bg-gray-200 text-gray-600'
        }`}>
          {isUser ? <User size={16} /> : <Bot size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                code({ node, className, children, ...props }) {
                  const isInline = (props as any).inline;
                  return !isInline ? (
                    <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                      <code className={className} {...props}>
                        {children}
                      </code>
                    </pre>
                  ) : (
                    <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-sm" {...props}>
                      {children}
                    </code>
                  );
                },
                p({ children }) {
                  return <p className="mb-2 last:mb-0">{children}</p>;
                },
                ul({ children }) {
                  return <ul className="list-disc list-inside mb-2">{children}</ul>;
                },
                ol({ children }) {
                  return <ol className="list-decimal list-inside mb-2">{children}</ol>;
                },
                blockquote({ children }) {
                  return <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-600 mb-2">{children}</blockquote>;
                },
                h1({ children }) {
                  return <h1 className="text-xl font-bold mb-2">{children}</h1>;
                },
                h2({ children }) {
                  return <h2 className="text-lg font-semibold mb-2">{children}</h2>;
                },
                h3({ children }) {
                  return <h3 className="text-md font-medium mb-2">{children}</h3>;
                }
              }}
            >
              {displayContent}
            </ReactMarkdown>
            {isStreaming && <span className="streaming-cursor animate-pulse">|</span>}
          </div>
          
          {/* Message metadata with timestamp and tokens */}
          <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
            <div className="flex items-center space-x-2">
              {/* Token info */}
              {message.meta && (message.meta.tokens_in || message.meta.tokens_out) ? (
                <span>
                  {message.meta.tokens_in && message.meta.tokens_out ? (
                    `${message.meta.tokens_in + message.meta.tokens_out} tokens (${message.meta.tokens_in}→${message.meta.tokens_out})`
                  ) : (
                    `${(message.meta.tokens_in || 0) + (message.meta.tokens_out || 0)} tokens`
                  )}
                </span>
              ) : (
                <span>~{estimateTokens(displayContent, isUser, messageHistory.slice(0, messageIndex))} tokens</span>
              )}
              
              {/* Model info */}
              {currentModel?.display_name && (
                <span className="text-gray-400">•</span>
              )}
              {currentModel?.display_name && (
                <span>{currentModel.display_name}</span>
              )}
            </div>
            
            {/* Timestamp */}
            <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const MessageList: React.FC<MessageListProps> = ({ 
  messages, 
  streamingContent, 
  isStreaming,
  currentModel
}) => {
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-500">
          <div className="text-center">
            <Bot size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="text-lg mb-2">Welcome to AI Chat</p>
            <p className="text-sm">Start a conversation by typing a message below.</p>
          </div>
        </div>
      ) : (
        <>
          {messages.map((message, index) => (
            <MessageItem 
              key={message.id} 
              message={message}
              isStreaming={isStreaming && index === messages.length - 1}
              streamingContent={index === messages.length - 1 ? streamingContent : undefined}
              currentModel={currentModel}
              messageHistory={messages}
              messageIndex={index}
            />
          ))}
        </>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};
