import React, { useState, useMemo, useCallback } from 'react';
import { Eye, X, Copy, Check, Clock } from 'lucide-react';
import { Message, GenerationConfig } from '../types';

interface ContextViewerProps {
    messages: Message[];
    currentInput?: string;
    generationConfig: GenerationConfig;
    systemPrompt?: string;
    ragDebugInfo?: any;
    ragContext?: string;
    className?: string;
}

export const ContextViewer: React.FC<ContextViewerProps> = ({
    messages,
    currentInput = '',
    generationConfig,
    systemPrompt = '',
    ragContext = '',
    className = ''
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    // Build the API request that would be sent
    const apiRequest = useMemo(() => {
        const apiMessages = [];

        // System message with RAG context
        let effectiveSystemPrompt = systemPrompt || 'You are a helpful AI assistant.';
        if (ragContext) {
            effectiveSystemPrompt = `${effectiveSystemPrompt}\n\n${ragContext}`;
        }

        apiMessages.push({
            role: 'system',
            content: effectiveSystemPrompt
        });

        // Add conversation history
        messages.forEach(msg => {
            apiMessages.push({
                role: msg.role,
                content: msg.content
            });
        });

        // Add current input if provided
        if (currentInput.trim()) {
            apiMessages.push({
                role: 'user',
                content: currentInput.trim()
            });
        }

        return {
            model: 'current-selected-model',
            messages: apiMessages,
            temperature: generationConfig.temperature,
            max_tokens: generationConfig.max_tokens,
            top_p: generationConfig.top_p,
            stream: generationConfig.stream,
            _rag_context_included: !!ragContext
        };
    }, [messages, currentInput, systemPrompt, ragContext, generationConfig]);

    const contextJson = useMemo(() =>
        JSON.stringify(apiRequest, null, 2),
        [apiRequest]
    );

    // Estimate tokens
    const estimatedTokens = useMemo(() => {
        const totalChars = contextJson.length;
        return Math.ceil(totalChars / 4);
    }, [contextJson]);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(contextJson);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    }, [contextJson]);

    const hasContent = messages.length > 0 || currentInput.trim().length > 0;

    return (
        <>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                disabled={!hasContent}
                className={`p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
                title="View API Request JSON"
            >
                <Eye size={18} />
            </button>

            {/* Modal */}
            {isOpen && (
                <div className="fixed inset-0 z-50 overflow-hidden">
                    <div className="flex items-center justify-center min-h-screen p-4">
                        {/* Overlay */}
                        <div
                            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
                            onClick={() => setIsOpen(false)}
                        />

                        {/* Modal Content */}
                        <div className="relative w-full max-w-4xl max-h-[90vh] bg-gray-900 rounded-xl shadow-2xl border border-gray-700 flex flex-col overflow-hidden">

                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
                                <div>
                                    <h2 className="text-lg font-semibold text-white">API Request JSON</h2>
                                    <p className="text-xs text-gray-400">
                                        {messages.length} сообщений • ~{estimatedTokens.toLocaleString()} токенов
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleCopy}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                                    >
                                        {copied ? <Check size={16} /> : <Copy size={16} />}
                                        {copied ? 'Скопировано!' : 'Копировать'}
                                    </button>
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="p-2 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition-colors"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* JSON Content - with word wrap */}
                            <div className="flex-1 overflow-auto p-4">
                                <pre className="bg-gray-950 p-4 rounded-lg text-sm font-mono text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
                                    {contextJson}
                                </pre>
                            </div>

                            {/* Footer */}
                            <div className="px-4 py-2 border-t border-gray-700 bg-gray-800/50">
                                <div className="flex items-center justify-between text-xs text-gray-500">
                                    <span>💡 Это точный JSON, который отправляется в AI модель</span>
                                    <span className="flex items-center gap-1">
                                        <Clock size={10} />
                                        {new Date().toLocaleTimeString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
