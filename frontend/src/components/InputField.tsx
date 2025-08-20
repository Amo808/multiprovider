import React, { useState, useRef } from 'react';
import { Send, Square } from 'lucide-react';

interface InputFieldProps {
  onSendMessage: (message: string) => void;
  isStreaming: boolean;
  onStopStreaming: () => void;
}

export const InputField: React.FC<InputFieldProps> = ({ 
  onSendMessage, 
  isStreaming, 
  onStopStreaming 
}) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedMessage = message.trim();
    if (trimmedMessage && !isStreaming) {
      onSendMessage(trimmedMessage);
      setMessage('');
      resetTextareaHeight();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const resetTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  React.useEffect(() => {
    adjustTextareaHeight();
  }, [message]);

  return (
    <div className="border-t border-gray-200 bg-white p-4">
      <form onSubmit={handleSubmit} className="flex items-end space-x-3">
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (Shift+Enter for new line)"
            className="input-area w-full resize-none min-h-[44px] max-h-[200px]"
            disabled={isStreaming}
            rows={1}
          />
        </div>
        <div className="flex space-x-2">
          {isStreaming ? (
            <button
              type="button"
              onClick={onStopStreaming}
              className="btn-secondary flex items-center space-x-1"
            >
              <Square size={16} />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!message.trim() || isStreaming}
              className="btn-primary flex items-center space-x-1"
            >
              <Send size={16} />
              <span>Send</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
