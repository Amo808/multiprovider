import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Message } from '../types';
import { User, Bot } from 'lucide-react';
import 'katex/dist/katex.min.css';

interface MessageListProps {
  messages: Message[];
  streamingContent?: string;
  isStreaming?: boolean;
}

const MessageItem: React.FC<{ message: Message; isStreaming?: boolean; streamingContent?: string }> = ({ 
  message, 
  isStreaming, 
  streamingContent 
}) => {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  
  if (!isUser && !isAssistant) return null;

  const displayContent = isStreaming && streamingContent ? streamingContent : message.content;

  return (
    <div className={`chat-message ${isUser ? 'user-message' : 'assistant-message'}`}>
      <div className="flex items-start space-x-3">
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
                },
              }}
            >
              {displayContent}
            </ReactMarkdown>
            {isStreaming && <span className="streaming-cursor"></span>}
          </div>
          {message.meta && (message.meta.tokens_in || message.meta.tokens_out) && (
            <div className="text-xs text-gray-500 mt-2 space-x-1">
              {message.meta.tokens_in && <span>Input: {message.meta.tokens_in}</span>}
              {message.meta.tokens_out && <span>Output: {message.meta.tokens_out}</span>}
              {(message.meta as any)?.thought_tokens !== undefined && <span>Θ:{(message.meta as any).thought_tokens}</span>}
              {(message.meta as any)?.thinking_tokens_used !== undefined && <span>used:{(message.meta as any).thinking_tokens_used}</span>}
              {(message.meta as any)?.tool_calls && Array.isArray((message.meta as any).tool_calls) && <span>tools:{(message.meta as any).tool_calls.length}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const MessageList: React.FC<MessageListProps> = ({ 
  messages, 
  streamingContent, 
  isStreaming 
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
            />
          ))}
        </>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};
