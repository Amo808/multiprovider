import React, { useState, useRef, useEffect, memo, Suspense, lazy } from 'react';
import { Copy, Check } from 'lucide-react';

// Lazy load heavy components
const ReactMarkdown = lazy(() => import('react-markdown'));

// Use full Prism with lazy loading
const SyntaxHighlighter = lazy(() =>
    import('react-syntax-highlighter').then(mod => ({
        default: mod.Prism
    }))
);
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Simple code block without syntax highlighting (fast fallback)
const SimpleCodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative my-3 rounded-lg overflow-hidden bg-[#1e1e1e]">
            <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] text-xs text-gray-400">
                <span>{language || 'code'}</span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
            </div>
            <pre className="p-4 overflow-x-auto text-sm text-gray-300 font-mono">
                <code>{code}</code>
            </pre>
        </div>
    );
};

// Highlighted code block (lazy loaded)
const HighlightedCodeBlock: React.FC<{ code: string; language?: string }> = memo(({ code, language }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative my-3 rounded-lg overflow-hidden bg-[#1e1e1e]">
            <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] text-xs text-gray-400">
                <span>{language || 'code'}</span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
            </div>
            <Suspense fallback={
                <pre className="p-4 overflow-x-auto text-sm text-gray-300 font-mono bg-[#1e1e1e]">
                    <code>{code}</code>
                </pre>
            }>
                <SyntaxHighlighter
                    language={language || 'text'}
                    style={oneDark}
                    customStyle={{
                        margin: 0,
                        padding: '1rem',
                        background: '#1e1e1e',
                        fontSize: '13px',
                    }}
                >
                    {code}
                </SyntaxHighlighter>
            </Suspense>
        </div>
    );
});

HighlightedCodeBlock.displayName = 'HighlightedCodeBlock';

interface LazyMarkdownProps {
    content: string;
    className?: string;
    isStreaming?: boolean;
}

// Plain text renderer for very long content or when not visible
const PlainTextContent: React.FC<{ content: string }> = ({ content }) => (
    <div className="whitespace-pre-wrap text-[15px] leading-7">{content}</div>
);

// Main lazy markdown component
export const LazyMarkdown: React.FC<LazyMarkdownProps> = memo(({ content, className, isStreaming }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [shouldRenderMarkdown, setShouldRenderMarkdown] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Use IntersectionObserver to detect visibility
    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setIsVisible(true);
                        // Small delay before rendering markdown to avoid blocking
                        setTimeout(() => setShouldRenderMarkdown(true), 50);
                    }
                });
            },
            {
                rootMargin: '200px', // Start loading 200px before visible
                threshold: 0
            }
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    // For very long content, show truncated version first
    const isVeryLong = content.length > 10000;
    const [showFullContent, setShowFullContent] = useState(!isVeryLong);

    // Skip markdown for simple content (no special characters)
    const hasMarkdown = /[#*`\[\]|>-]/.test(content) || content.includes('```');

    // If streaming, always render (but simpler for non-markdown)
    if (isStreaming) {
        if (!hasMarkdown) {
            return (
                <div ref={containerRef} className={className}>
                    <PlainTextContent content={content} />
                    <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
                </div>
            );
        }
    }

    // Not visible yet - show placeholder
    if (!isVisible) {
        return (
            <div ref={containerRef} className={className} style={{ minHeight: '50px' }}>
                <div className="text-muted-foreground/50 text-sm">Loading...</div>
            </div>
        );
    }

    // Visible but not ready for full markdown
    if (!shouldRenderMarkdown) {
        return (
            <div ref={containerRef} className={className}>
                <PlainTextContent content={isVeryLong && !showFullContent ? content.slice(0, 5000) + '\n\n...' : content} />
            </div>
        );
    }

    // No markdown in content - just render plain text
    if (!hasMarkdown) {
        return (
            <div ref={containerRef} className={className}>
                <PlainTextContent content={content} />
            </div>
        );
    }

    // Truncated content button
    const truncationButton = isVeryLong && !showFullContent && (
        <button
            onClick={() => setShowFullContent(true)}
            className="mt-4 text-sm text-primary hover:underline"
        >
            Show full content ({Math.round(content.length / 1000)}k characters)
        </button>
    );

    const displayContent = isVeryLong && !showFullContent ? content.slice(0, 5000) : content;

    return (
        <div ref={containerRef} className={className}>
            <Suspense fallback={<PlainTextContent content={displayContent} />}>
                <ReactMarkdown
                    components={{
                        code({ className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || '');
                            const codeString = String(children).replace(/\n$/, '');
                            const isInline = !match && !codeString.includes('\n');

                            if (isInline) {
                                return (
                                    <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono" {...props}>
                                        {children}
                                    </code>
                                );
                            }

                            // For long code blocks, use simple version
                            if (codeString.length > 5000) {
                                return <SimpleCodeBlock code={codeString} language={match?.[1]} />;
                            }

                            return <HighlightedCodeBlock code={codeString} language={match?.[1]} />;
                        },
                        pre({ children }) {
                            return <>{children}</>;
                        },
                        p({ children }) {
                            return <p className="text-[15px] leading-7 my-2">{children}</p>;
                        },
                        ul({ children }) {
                            return <ul className="list-disc pl-6 space-y-1 my-2">{children}</ul>;
                        },
                        ol({ children }) {
                            return <ol className="list-decimal pl-6 space-y-1 my-2">{children}</ol>;
                        },
                        li({ children }) {
                            return <li className="text-[15px] leading-7">{children}</li>;
                        },
                        h1({ children }) {
                            return <h1 className="text-2xl font-bold mt-6 mb-3">{children}</h1>;
                        },
                        h2({ children }) {
                            return <h2 className="text-xl font-bold mt-5 mb-2">{children}</h2>;
                        },
                        h3({ children }) {
                            return <h3 className="text-lg font-semibold mt-4 mb-2">{children}</h3>;
                        },
                        blockquote({ children }) {
                            return (
                                <blockquote className="border-l-4 border-muted pl-4 my-3 italic text-muted-foreground">
                                    {children}
                                </blockquote>
                            );
                        },
                        a({ href, children }) {
                            return (
                                <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline"
                                >
                                    {children}
                                </a>
                            );
                        },
                        table({ children }) {
                            return (
                                <div className="overflow-x-auto my-4">
                                    <table className="min-w-full border-collapse border border-border">
                                        {children}
                                    </table>
                                </div>
                            );
                        },
                        th({ children }) {
                            return <th className="border border-border px-3 py-2 bg-muted font-semibold text-left">{children}</th>;
                        },
                        td({ children }) {
                            return <td className="border border-border px-3 py-2">{children}</td>;
                        },
                    }}
                >
                    {displayContent}
                </ReactMarkdown>
            </Suspense>
            {truncationButton}
            {isStreaming && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />}
        </div>
    );
});

LazyMarkdown.displayName = 'LazyMarkdown';

export default LazyMarkdown;
