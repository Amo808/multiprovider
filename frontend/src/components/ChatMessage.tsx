import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Bot, User, Copy } from 'lucide-react';
import DOMPurify from 'dompurify';
import 'katex/dist/katex.min.css';
import { ModelInfo } from '../types';

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  meta?: Record<string, any>;
}

interface ChatMessageProps {
  message: ChatMessageData;
  isStreaming?: boolean;
  streamContent?: string;
  selectedModel?: ModelInfo;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, isStreaming, streamContent, selectedModel }) => {
  const [copied, setCopied] = useState(false);
  const display = isStreaming && streamContent ? streamContent : message.content;
  const safeDisplay = DOMPurify.sanitize(display);
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(display);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`flex items-start space-x-3 px-4 py-3 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>      
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-blue-600 text-white' : 'bg-gray-600 text-white'}`}>{isUser ? <User size={16} /> : <Bot size={16} />}</div>
      <div className={`flex-1 min-w-0 ${isUser ? 'text-right' : ''}`}>
        <div className="flex items-center space-x-2 mb-1">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{isUser ? 'You' : selectedModel?.display_name || 'Assistant'}</span>
          {isStreaming && !isUser && <span className="text-green-600 text-xs animate-pulse">Streaming...</span>}
        </div>
        <div className={`group relative rounded-lg p-3 ${isUser ? 'bg-blue-600 text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white'}`}>          
          <div className={`prose prose-sm max-w-none ${isUser ? 'prose-invert' : 'dark:prose-invert'}`}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                code({ children, className, ...props }) {
                  return (
                    <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto text-xs">
                      <code className={className} {...props}>{children}</code>
                    </pre>
                  );
                }
              }}
            >{safeDisplay}</ReactMarkdown>
            {isStreaming && <span className="animate-pulse">▊</span>}
          </div>
          {!isStreaming && display && (
            <button onClick={handleCopy} title={copied ? 'Copied' : 'Copy'} className={`absolute top-2 right-2 p-1.5 rounded-md text-xs opacity-0 group-hover:opacity-100 transition ${isUser ? 'text-blue-200 hover:text-white hover:bg-blue-700' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
              <Copy size={14} />
            </button>
          )}
        </div>
        {message.timestamp && <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">{new Date(message.timestamp).toLocaleTimeString()}</div>}
      </div>
    </div>
  );
};
