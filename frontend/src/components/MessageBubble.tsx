import React, { useState, useEffect, useReducer, memo } from 'react';
import { Bot, Copy, Brain, Zap, ChevronDown, Trash2, Clock, Sparkles, Eye, EyeOff, GitBranch, Check, X, RotateCcw, FileText, BookOpen, Pencil } from 'lucide-react';
import { Message, ModelInfo, RAGSource, RAGDebugInfo } from '../types';
import { cn } from '../lib/utils';

interface MessageBubbleProps {
  message: Message;
  index?: number;
  totalMessages?: number;
  selectedModel?: ModelInfo;
  isStreaming?: boolean;
  currentResponse?: string;
  deepResearchStage?: string;
  thinkingContent?: string;
  isThinking?: boolean;
  enableReordering?: boolean;
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
  onDelete?: () => void;
  onBranchFrom?: (index: number) => void;
  onRegenerate?: () => void;
  onEdit?: (newContent: string) => void;
}

// Memoized thinking section
// Sub-component: renders parsed RLM content with rich formatting
const RlmContent = memo<{ text: string; isStreaming?: boolean }>(({ text, isStreaming }) => {
  // Parse RLM structured text into visual blocks
  const parts: React.ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // --- Iteration header ---
    if (/^[─]{5,}.*Iteration\s+\d+.*[─]{5,}$/.test(line)) {
      const iterMatch = line.match(/Iteration\s+(\d+)/);
      const iterNum = iterMatch ? iterMatch[1] : '?';
      parts.push(
        <div key={key++} className="flex items-center gap-2 mt-4 mb-2">
          <div className="h-px flex-1 bg-blue-500/30" />
          <span className="text-xs font-bold text-blue-400 tracking-wide px-2 py-0.5 rounded bg-blue-500/10 whitespace-nowrap">
            Iteration {iterNum}
          </span>
          <div className="h-px flex-1 bg-blue-500/30" />
        </div>
      );
      i++;
      continue;
    }

    // --- Summary / completion line (═══) ---
    if (/^[═]{5,}/.test(line)) {
      i++;
      continue;
    }
    if (/^✅ RLM completed/.test(line)) {
      parts.push(
        <div key={key++} className="mt-3 px-3 py-2 rounded-md bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium">
          {line}
        </div>
      );
      i++;
      continue;
    }

    // --- LLM Response header ---
    if (line.startsWith('◇ LLM Response')) {
      const timeMatch = line.match(/\(([^)]+)\)/);
      parts.push(
        <div key={key++} className="flex items-center gap-1.5 mt-2 mb-1 text-xs text-sky-400 font-semibold">
          <span className="text-sky-300">◇</span> LLM Response
          {timeMatch && <span className="text-sky-400/60 font-normal ml-1">({timeMatch[1]})</span>}
        </div>
      );
      i++;
      // Collect LLM response text until next marker
      const responseLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith('▸ ') && !lines[i].startsWith('◇ ') && !/^[─]{5,}/.test(lines[i]) && !lines[i].startsWith('★ ') && !/^[═]{5,}/.test(lines[i]) && !lines[i].startsWith('✅')) {
        // Check for inline code block start
        if (lines[i].startsWith('```')) {
          // This is a code block within the LLM response text — collect and render inline
          const lang = lines[i].replace('```', '').trim();
          i++;
          const codeLines: string[] = [];
          while (i < lines.length && !lines[i].startsWith('```')) {
            codeLines.push(lines[i]);
            i++;
          }
          if (i < lines.length) i++; // skip closing ```
          // Push any accumulated text before code
          if (responseLines.length) {
            parts.push(
              <div key={key++} className="text-xs text-slate-300/90 leading-relaxed whitespace-pre-wrap pl-4">
                {responseLines.join('\n')}
              </div>
            );
            responseLines.length = 0;
          }
          parts.push(
            <div key={key++} className="my-1 ml-4 rounded-md bg-slate-800/80 border border-slate-700/50 overflow-hidden">
              {lang && <div className="px-3 py-0.5 text-[10px] text-slate-500 bg-slate-800 border-b border-slate-700/50 font-mono">{lang}</div>}
              <pre className="px-3 py-2 text-[11px] text-emerald-300/90 font-mono overflow-x-auto whitespace-pre leading-relaxed">{codeLines.join('\n')}</pre>
            </div>
          );
          continue;
        }
        responseLines.push(lines[i]);
        i++;
      }
      if (responseLines.length) {
        const txt = responseLines.join('\n').trim();
        if (txt) {
          parts.push(
            <div key={key++} className="text-xs text-slate-300/90 leading-relaxed whitespace-pre-wrap pl-4">
              {txt}
            </div>
          );
        }
      }
      continue;
    }

    // --- Code Execution header ---
    if (line.startsWith('▸ Code Execution')) {
      const timeMatch = line.match(/\(([^)]+)\)/);
      parts.push(
        <div key={key++} className="flex items-center gap-1.5 mt-2 mb-1 text-xs text-amber-400 font-semibold">
          <span className="text-amber-300">▸</span> Code Execution
          {timeMatch && <span className="text-amber-400/60 font-normal ml-1">({timeMatch[1]})</span>}
        </div>
      );
      i++;
      // Check for code block
      if (i < lines.length && lines[i].startsWith('```')) {
        const lang = lines[i].replace('```', '').trim();
        i++;
        const codeLines: string[] = [];
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++; // skip closing ```
        parts.push(
          <div key={key++} className="ml-4 rounded-md bg-slate-900/80 border border-slate-700/60 overflow-hidden">
            {lang && <div className="px-3 py-0.5 text-[10px] text-slate-500 bg-slate-900 border-b border-slate-700/50 font-mono">{lang}</div>}
            <pre className="px-3 py-2 text-[11px] text-sky-300/80 font-mono overflow-x-auto whitespace-pre leading-relaxed">{codeLines.join('\n')}</pre>
          </div>
        );
      }
      // Check for Output:
      if (i < lines.length && lines[i].startsWith('Output:')) {
        i++; // skip "Output:" line
        const outLines: string[] = [];
        while (i < lines.length && !lines[i].startsWith('▸ ') && !lines[i].startsWith('◇ ') && !/^[─]{5,}/.test(lines[i]) && !lines[i].startsWith('★ ') && !lines[i].startsWith('⚠') && !lines[i].startsWith('↳') && !/^[═]{5,}/.test(lines[i]) && !lines[i].startsWith('✅')) {
          outLines.push(lines[i]);
          i++;
        }
        const outText = outLines.join('\n').trim();
        if (outText) {
          parts.push(
            <div key={key++} className="ml-4 mt-1">
              <div className="text-[10px] text-slate-500 mb-0.5 font-semibold">OUTPUT</div>
              <div className="rounded-md bg-slate-950/60 border border-slate-800/60 px-3 py-2 text-[11px] text-green-300/80 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">
                {outText}
              </div>
            </div>
          );
        }
      }
      // Check for stderr
      if (i < lines.length && lines[i].startsWith('⚠')) {
        parts.push(
          <div key={key++} className="ml-4 mt-1 text-[11px] text-red-400/80 font-mono">
            {lines[i]}
          </div>
        );
        i++;
      }
      // Check for sub-calls
      if (i < lines.length && lines[i].startsWith('↳')) {
        parts.push(
          <div key={key++} className="ml-4 mt-1 text-[11px] text-purple-400/70">
            {lines[i]}
          </div>
        );
        i++;
      }
      continue;
    }

    // --- Final answer marker ---
    if (line.startsWith('★ Final Answer')) {
      parts.push(
        <div key={key++} className="mt-2 flex items-center gap-1.5 text-xs text-yellow-400 font-semibold">
          <span>★</span> Final Answer found
        </div>
      );
      i++;
      continue;
    }

    // --- Init lines (🧠, 📄, ⚙️) ---
    if (line.startsWith('🧠') || line.startsWith('📄') || line.startsWith('⚙️')) {
      parts.push(
        <div key={key++} className="text-xs text-slate-400 py-0.5">
          {line}
        </div>
      );
      i++;
      continue;
    }

    // --- Default: plain text ---
    if (line.trim()) {
      parts.push(
        <div key={key++} className="text-xs text-slate-400/80 whitespace-pre-wrap">
          {line}
        </div>
      );
    }
    i++;
  }

  return <>{parts}{isStreaming && <span className="inline-block w-1.5 h-4 bg-blue-500 animate-pulse ml-0.5" />}</>;
});
RlmContent.displayName = 'RlmContent';

const ThinkingSection = memo<{
  content: string;
  isStreaming?: boolean;
  tokens?: number;
  isRlm?: boolean;
}>(({ content, isStreaming, tokens, isRlm }) => {
  // Auto-open for RLM so user can watch the reasoning process live
  const [isOpen, setIsOpen] = useState(!!isRlm);
  const [showFull, setShowFull] = useState(!!isRlm);
  const isLong = content.length > 1000;
  const displayContent = showFull || !isLong ? content : content.substring(0, 1000) + '...';

  // Handle click with event stop to prevent any parent interference during streaming
  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleShowFullToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowFull(!showFull);
  };

  // Auto-open when RLM content starts streaming
  useEffect(() => {
    if (isRlm && !isOpen) {
      setIsOpen(true);
      setShowFull(true);
    }
  }, [isRlm]);

  // Auto-scroll to bottom for RLM during streaming
  const scrollRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isRlm && isStreaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, isRlm, isStreaming]);

  const label = isRlm
    ? (isStreaming ? "🧠 RLM Analyzing..." : "🧠 RLM Deep Analysis")
    : (isStreaming ? "Thinking..." : "Thought process");

  const borderColor = isRlm ? "border-blue-500/40" : "border-purple-500/30";
  const textColor = isRlm
    ? (isStreaming ? "text-blue-500" : "text-muted-foreground hover:text-foreground")
    : (isStreaming ? "text-purple-500" : "text-muted-foreground hover:text-foreground");

  return (
    <div className="mb-3">
      <button
        onClick={handleToggle}
        className={cn(
          "flex items-center gap-2 text-sm transition-colors cursor-pointer select-none",
          textColor
        )}
        type="button"
      >
        <Brain className={cn("w-4 h-4", isStreaming && "animate-pulse")} />
        <span>{label}</span>
        {tokens && tokens > 0 && (
          <span className="text-xs text-muted-foreground">({tokens.toLocaleString()} tokens)</span>
        )}
        <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className={cn("mt-2 pl-4 border-l-2", borderColor)}>
          {isRlm ? (
            <div ref={scrollRef} className="overflow-y-auto max-h-[600px] pr-2">
              <RlmContent text={displayContent} isStreaming={isStreaming} />
            </div>
          ) : (
            <div className={cn(
              "whitespace-pre-wrap font-mono leading-relaxed overflow-y-auto",
              "text-sm text-muted-foreground text-xs max-h-[500px]"
            )}>
              {displayContent}
              {isStreaming && <span className="inline-block w-1.5 h-4 bg-purple-500 animate-pulse ml-0.5" />}
            </div>
          )}
          {/* Show expand/collapse button even during streaming */}
          {isLong && !isRlm && (
            <button
              onClick={handleShowFullToggle}
              className="mt-2 text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer"
              type="button"
            >
              {showFull ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showFull ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
});
ThinkingSection.displayName = 'ThinkingSection';

// RLM API Request Section — shows what context RLM used, iterations detail, usage
const RlmApiSection = memo<{ data: any }>(({ data }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'iterations' | 'raw'>('overview');

  if (!data) return null;

  const engine = data.rlm_engine || {};
  const prompt = data.rlm_prompt || {};
  const result = data.rlm_result || {};
  const usage = data.rlm_usage || {};
  const iterations = data.rlm_iterations_detail || [];

  const totalInputTokens = usage.model_usage_summaries
    ? Object.values(usage.model_usage_summaries as Record<string, any>).reduce((sum: number, m: any) => sum + (m.total_input_tokens || 0), 0)
    : 0;
  const totalOutputTokens = usage.model_usage_summaries
    ? Object.values(usage.model_usage_summaries as Record<string, any>).reduce((sum: number, m: any) => sum + (m.total_output_tokens || 0), 0)
    : 0;

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
        type="button"
      >
        <Eye className="w-4 h-4" />
        <span>🔬 RLM API Request</span>
        <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="mt-2 pl-4 border-l-2 border-cyan-500/30">
          {/* Tabs */}
          <div className="flex gap-1 mb-3">
            {(['overview', 'iterations', 'raw'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-2.5 py-1 text-[11px] rounded-md transition-colors",
                  activeTab === tab ? "bg-cyan-500/20 text-cyan-400" : "text-slate-400 hover:text-slate-300"
                )}
                type="button"
              >
                {tab === 'overview' ? '📋 Overview' : tab === 'iterations' ? '🔄 Iterations' : '🔧 Raw JSON'}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="space-y-2 text-xs">
              {/* Engine */}
              <div className="rounded-md bg-slate-800/50 border border-slate-700/50 p-2.5">
                <div className="text-[10px] text-slate-500 font-semibold mb-1.5 uppercase tracking-wider">Engine</div>
                <div className="grid grid-cols-2 gap-1 text-slate-300">
                  <span className="text-slate-500">Model:</span><span>{engine.provider}/{engine.model}</span>
                  <span className="text-slate-500">Iterations:</span><span>{result.iterations_count} / {engine.max_iterations}</span>
                  <span className="text-slate-500">Time:</span><span>{result.execution_time}</span>
                  {totalInputTokens > 0 && <><span className="text-slate-500">Input tokens:</span><span>{totalInputTokens.toLocaleString()}</span></>}
                  {totalOutputTokens > 0 && <><span className="text-slate-500">Output tokens:</span><span>{totalOutputTokens.toLocaleString()}</span></>}
                  {usage.total_cost != null && <><span className="text-slate-500">Cost:</span><span>${usage.total_cost.toFixed(4)}</span></>}
                </div>
              </div>
              {/* Prompt/Context */}
              <div className="rounded-md bg-slate-800/50 border border-slate-700/50 p-2.5">
                <div className="text-[10px] text-slate-500 font-semibold mb-1.5 uppercase tracking-wider">Context sent to RLM</div>
                <div className="grid grid-cols-2 gap-1 text-slate-300 mb-2">
                  <span className="text-slate-500">Source:</span><span>{prompt.context_source}</span>
                  <span className="text-slate-500">Context size:</span><span>{prompt.context_chars?.toLocaleString()} chars</span>
                  <span className="text-slate-500">User question:</span><span className="text-cyan-300">{prompt.user_question}</span>
                </div>
                <details className="group">
                  <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-400">Show context preview</summary>
                  <pre className="mt-1 text-[10px] text-slate-400 font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto bg-slate-900/50 rounded p-2">{prompt.context_preview}</pre>
                </details>
              </div>
              {/* Final Answer */}
              <div className="rounded-md bg-slate-800/50 border border-slate-700/50 p-2.5">
                <div className="text-[10px] text-slate-500 font-semibold mb-1.5 uppercase tracking-wider">Final Answer</div>
                <div className="text-slate-300 mb-1">{result.final_answer_chars?.toLocaleString()} chars</div>
                <div className="text-[10px] text-slate-500 italic">{prompt.note}</div>
              </div>
            </div>
          )}

          {activeTab === 'iterations' && (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {iterations.map((iter: any, idx: number) => (
                <details key={idx} className="group rounded-md bg-slate-800/50 border border-slate-700/50">
                  <summary className="px-2.5 py-1.5 text-xs cursor-pointer hover:bg-slate-700/30 flex items-center gap-2">
                    <span className="text-cyan-400 font-semibold">Iter {iter.iteration}</span>
                    <span className="text-slate-500">{iter.response_chars} chars</span>
                    {iter.code_blocks?.length > 0 && <span className="text-amber-400/70">{iter.code_blocks.length} code block(s)</span>}
                    {iter.has_final_answer && <span className="text-yellow-400">★ Final</span>}
                    {iter.iteration_time && <span className="text-slate-500 ml-auto">{iter.iteration_time.toFixed(1)}s</span>}
                  </summary>
                  <div className="px-2.5 pb-2 text-[11px] space-y-1.5">
                    <div className="text-slate-400 whitespace-pre-wrap font-mono max-h-[150px] overflow-y-auto bg-slate-900/40 rounded p-1.5">{iter.response_preview}</div>
                    {iter.code_blocks?.map((cb: any, cbIdx: number) => (
                      <div key={cbIdx}>
                        <pre className="text-sky-300/80 font-mono bg-slate-900/60 rounded p-1.5 max-h-[100px] overflow-y-auto">{cb.code}</pre>
                        {cb.stdout_preview && (
                          <pre className="text-green-300/70 font-mono bg-slate-950/40 rounded p-1.5 mt-0.5 max-h-[100px] overflow-y-auto">{cb.stdout_preview}</pre>
                        )}
                        {cb.stderr && <pre className="text-red-400/70 font-mono">{cb.stderr}</pre>}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}

          {activeTab === 'raw' && (
            <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap max-h-[400px] overflow-y-auto bg-slate-900/50 rounded-md p-3 border border-slate-700/50">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
});
RlmApiSection.displayName = 'RlmApiSection';

// RAG Context Section - shows document sources used for the response
const RAGContextSection = memo<{
  sources: RAGSource[];
  contextPreview?: string;
  contextFull?: string;
  debug?: RAGDebugInfo;
  systemPromptPreview?: string;
}>(({ sources, contextPreview, contextFull, debug, systemPromptPreview }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showFullContext, setShowFullContext] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);

  if (!sources || sources.length === 0) return null;

  // Handle clicks with event stop to prevent interference
  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleDebugToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDebug(!showDebug);
  };

  const handleFullContextToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowFullContext(!showFullContext);
  };

  const handleSystemPromptToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowSystemPrompt(!showSystemPrompt);
  };

  return (
    <div className="mb-3">
      <button
        onClick={handleToggle}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
        type="button"
      >
        <BookOpen className="w-4 h-4 text-blue-500" />
        <span>Document context</span>
        <span className="text-xs bg-blue-500/20 text-blue-500 px-1.5 py-0.5 rounded">
          {sources.length} {sources.length === 1 ? 'chunk' : 'chunks'}
        </span>
        <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="mt-2 pl-6 border-l-2 border-blue-500/30 space-y-3">
          {/* Debug info section */}
          {debug && (
            <div className="space-y-2">
              <button
                onClick={handleDebugToggle}
                className="flex items-center gap-1 text-xs text-purple-500 hover:text-purple-400 transition-colors cursor-pointer"
                type="button"
              >
                <Sparkles className="w-3 h-3" />
                {showDebug ? 'Hide search debug' : 'Show search debug'}
              </button>
              {showDebug && (
                <div className="p-3 bg-purple-500/5 rounded-lg border border-purple-500/10 space-y-2">
                  {/* Strategy & Techniques */}
                  {debug.strategy && (
                    <div className="text-xs space-y-1">
                      <p className="font-medium text-purple-500">Strategy:</p>
                      <p className="text-muted-foreground">
                        {debug.strategy}
                        {debug.auto_detected_strategy && debug.strategy === 'auto' && (
                          <span className="text-green-500"> → {debug.auto_detected_strategy}</span>
                        )}
                      </p>
                    </div>
                  )}

                  {debug.techniques_used && debug.techniques_used.length > 0 && (
                    <div className="text-xs space-y-1">
                      <p className="font-medium text-purple-500">Techniques Used:</p>
                      <div className="flex flex-wrap gap-1">
                        {debug.techniques_used.map((tech, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Search Method (legacy) */}
                  {debug.search_method && debug.search_method.length > 0 && !debug.techniques_used && (
                    <div className="text-xs space-y-1">
                      <p className="font-medium text-purple-500">Search Method:</p>
                      <p className="text-muted-foreground">{debug.search_method.join(' → ')}</p>
                    </div>
                  )}

                  {/* Step-back query */}
                  {debug.step_back_query && (
                    <div className="text-xs space-y-1">
                      <p className="font-medium text-purple-500">Step-back Query:</p>
                      <p className="text-muted-foreground italic">"{debug.step_back_query}"</p>
                    </div>
                  )}

                  {/* Multi-query expansion */}
                  {debug.generated_queries && debug.generated_queries.length > 1 && (
                    <div className="text-xs space-y-1">
                      <p className="font-medium text-purple-500">Multi-Query Expansion:</p>
                      <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                        {debug.generated_queries.map((q, i) => (
                          <li key={i} className={i === 0 ? 'font-medium' : ''}>
                            {i === 0 ? `Original: "${q}"` : `"${q}"`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Agentic search history */}
                  {debug.search_history && debug.search_history.length > 0 && (
                    <div className="text-xs space-y-1">
                      <p className="font-medium text-purple-500">Agent Search History ({debug.agent_iterations || debug.search_history.length} iterations):</p>
                      <ul className="list-decimal list-inside text-muted-foreground space-y-0.5">
                        {debug.search_history.map((h, i) => (
                          <li key={i}>
                            "{h.query}" → <span className="text-green-500">{h.results_count}</span> results
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Results stats */}
                  <div className="text-xs text-muted-foreground pt-1 border-t border-purple-500/10">
                    <span className="text-purple-500">{debug.total_candidates}</span> candidates found
                    {debug.after_rerank > 0 && (
                      <span> → <span className="text-green-500">{debug.after_rerank}</span> after rerank</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Source documents */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Sources used:</p>
            {sources.map((source, idx) => (
              <div
                key={`${source.document_id}-${source.chunk_index || idx}`}
                className="flex items-start gap-2 p-2 bg-blue-500/5 rounded-lg border border-blue-500/10"
              >
                <span className="flex-shrink-0 w-5 h-5 rounded bg-blue-500/20 text-blue-500 text-xs font-medium flex items-center justify-center">
                  {source.index || idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-xs font-medium text-foreground truncate">
                      {source.document_name || 'Document'}
                    </span>
                    {source.section && (
                      <span className="text-xs text-muted-foreground">§ {source.section}</span>
                    )}
                    {source.page && (
                      <span className="text-xs text-muted-foreground">p. {source.page}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={cn(
                      "text-xs px-1.5 py-0.5 rounded",
                      source.similarity >= 0.8 ? "bg-green-500/10 text-green-500" :
                        source.similarity >= 0.6 ? "bg-yellow-500/10 text-yellow-500" :
                          "bg-orange-500/10 text-orange-500"
                    )}>
                      {Math.round(source.similarity * 100)}% match
                    </span>
                    {source.rerank_score !== undefined && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-500">
                        rerank: {source.rerank_score}
                      </span>
                    )}
                    {source.matching_queries && source.matching_queries.length > 1 && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                        {source.matching_queries.length} query matches
                      </span>
                    )}
                  </div>
                  {/* Content preview for each chunk */}
                  {source.content_preview && (
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 italic">
                      "{source.content_preview}"
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Context preview */}
          {(contextPreview || contextFull) && (
            <div className="mt-3">
              <button
                onClick={handleFullContextToggle}
                className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-400 transition-colors mb-2 cursor-pointer"
                type="button"
              >
                {showFullContext ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {showFullContext ? 'Hide context' : 'Show context sent to model'}
              </button>
              {showFullContext && (
                <div className="p-3 bg-secondary/50 rounded-lg max-h-96 overflow-auto">
                  <p className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-words">
                    {contextFull || contextPreview}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* System prompt preview */}
          {systemPromptPreview && (
            <div className="mt-3">
              <button
                onClick={handleSystemPromptToggle}
                className="flex items-center gap-1 text-xs text-amber-500 hover:text-amber-400 transition-colors mb-2 cursor-pointer"
                type="button"
              >
                {showSystemPrompt ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {showSystemPrompt ? 'Hide system prompt' : 'Show full system prompt'}
              </button>
              {showSystemPrompt && (
                <div className="p-3 bg-amber-500/5 rounded-lg border border-amber-500/10 max-h-96 overflow-auto">
                  <p className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-words">
                    {systemPromptPreview}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
RAGContextSection.displayName = 'RAGContextSection';

// OPTIMIZED: Lightweight code block - no syntax highlighting by default
const CodeBlock = memo<{
  language?: string;
  children: string;
}>(({ language, children }) => {
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState(false);
  const [highlightedCode, setHighlightedCode] = useState<React.ReactNode>(null);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(children);
      } else {
        // Fallback for non-secure contexts
        const textArea = document.createElement('textarea');
        textArea.value = children;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  // Lazy load syntax highlighting only when user clicks
  const handleHighlight = async () => {
    if (highlighted) return;
    setHighlighted(true);

    try {
      const [{ Prism }, { oneDark }] = await Promise.all([
        import('react-syntax-highlighter'),
        import('react-syntax-highlighter/dist/esm/styles/prism')
      ]);

      setHighlightedCode(
        <Prism
          language={language || 'text'}
          style={oneDark}
          customStyle={{
            margin: 0,
            padding: '1rem',
            background: '#1e1e1e',
            fontSize: '13px',
          }}
        >
          {children}
        </Prism>
      );
    } catch (e) {
      console.error('Failed to load syntax highlighter:', e);
    }
  };

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] text-xs text-gray-400">
        <span>{language || 'code'}</span>
        <div className="flex items-center gap-2">
          {!highlighted && (
            <button
              onClick={handleHighlight}
              className="flex items-center gap-1 hover:text-white transition-colors"
              title="Enable syntax highlighting"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Highlight</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 hover:text-white transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>
      </div>
      {highlightedCode || (
        <pre className="m-0 p-4 bg-[#1e1e1e] text-[13px] overflow-x-auto">
          <code className="text-gray-300 font-mono">{children}</code>
        </pre>
      )}
    </div>
  );
});
CodeBlock.displayName = 'CodeBlock';

// Constants for content limits (progressive markdown rendering)
const TRUNCATE_LIMIT = 50000;         // Progressive loading above this
const PREVIEW_LENGTH = 3000;          // Characters to show in preview
const CHUNK_SIZE = 20000;             // Load 20k chars at a time for huge messages

// Smart Content Renderer - handles huge messages with proper markdown rendering
const SmartContent = memo<{ content: string; isStreaming?: boolean }>(({ content, isStreaming }) => {
  const [visibleLength, setVisibleLength] = useState(PREVIEW_LENGTH);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // For streaming, use SimpleMarkdown (optimized, no heavy parsing)
  if (isStreaming) {
    return <SimpleMarkdown content={content} />;
  }

  // Small/medium content - render with markdown immediately
  if (content.length < TRUNCATE_LIMIT) {
    return <SimpleMarkdown content={content} />;
  }

  // Large/Huge content - progressive loading WITH markdown
  const displayContent = content.slice(0, visibleLength);
  const remaining = content.length - visibleLength;
  const isFullyLoaded = visibleLength >= content.length;

  const loadMore = () => {
    setIsLoadingMore(true);
    // Use requestAnimationFrame to prevent UI freeze
    requestAnimationFrame(() => {
      setVisibleLength(prev => Math.min(prev + CHUNK_SIZE, content.length));
      setIsLoadingMore(false);
    });
  };

  const loadAll = () => {
    setIsLoadingMore(true);
    // Load in chunks to prevent freeze
    const loadChunk = (currentLength: number) => {
      if (currentLength >= content.length) {
        setIsLoadingMore(false);
        return;
      }
      setVisibleLength(Math.min(currentLength + CHUNK_SIZE * 2, content.length));
      requestAnimationFrame(() => loadChunk(currentLength + CHUNK_SIZE * 2));
    };
    requestAnimationFrame(() => loadChunk(visibleLength));
  };

  const collapse = () => {
    setVisibleLength(PREVIEW_LENGTH);
  };

  return (
    <div>
      {/* Always render markdown, even for huge content */}
      <SimpleMarkdown content={displayContent} />

      {!isFullyLoaded && (
        <div className="text-muted-foreground text-sm py-2">...</div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {/* Progress indicator */}
        <span className="text-muted-foreground">
          {(visibleLength / 1000).toFixed(0)}k / {(content.length / 1000).toFixed(0)}k chars
          {!isFullyLoaded && ` (${((visibleLength / content.length) * 100).toFixed(0)}%)`}
        </span>

        {!isFullyLoaded && (
          <>
            <button
              onClick={loadMore}
              disabled={isLoadingMore}
              className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors disabled:opacity-50"
            >
              {isLoadingMore ? 'Loading...' : `+${Math.min(CHUNK_SIZE / 1000, remaining / 1000).toFixed(0)}k more`}
            </button>
            <button
              onClick={loadAll}
              disabled={isLoadingMore}
              className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-md transition-colors disabled:opacity-50"
            >
              Load all ({(remaining / 1000).toFixed(0)}k)
            </button>
          </>
        )}

        {visibleLength > PREVIEW_LENGTH && (
          <button
            onClick={collapse}
            className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-md transition-colors"
          >
            Collapse
          </button>
        )}
      </div>
    </div>
  );
});
SmartContent.displayName = 'SmartContent';

// OPTIMIZED: Simple markdown renderer - much faster than ReactMarkdown
const SimpleMarkdown = memo<{ content: string }>(({ content }) => {
  // Fast inline code replacement
  const renderContent = () => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let key = 0;

    // Split by code blocks first
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        parts.push(
          <span key={key++}>
            {renderInlineContent(content.slice(lastIndex, match.index))}
          </span>
        );
      }

      // Add code block
      parts.push(
        <CodeBlock key={key++} language={match[1]}>
          {match[2].trim()}
        </CodeBlock>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(
        <span key={key++}>
          {renderInlineContent(content.slice(lastIndex))}
        </span>
      );
    }

    return parts.length > 0 ? parts : renderInlineContent(content);
  };

  // Render inline elements (bold, italic, inline code, links)
  const renderInlineContent = (text: string): React.ReactNode => {
    // Split into paragraphs - be careful not to lose content
    const paragraphs = text.split(/\n\n+/);

    return paragraphs.map((para, i) => {
      if (!para.trim()) return null;

      // Check for headers - only if the ENTIRE paragraph is a header (single line starting with #)
      // This prevents losing content after headers
      const headerMatch = para.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch && !para.includes('\n')) {
        const level = headerMatch[1].length;
        const HeaderTag = `h${level}` as keyof JSX.IntrinsicElements;
        return <HeaderTag key={i} className="font-bold mt-4 mb-2">{renderInlineText(headerMatch[2])}</HeaderTag>;
      }

      // Check for list - only if first line starts with list marker
      const firstLine = para.split('\n')[0];
      if (firstLine.match(/^[-*]\s/)) {
        const items = para.split(/\n/).filter(l => l.trim());
        return (
          <ul key={i} className="list-disc pl-6 my-2 space-y-1">
            {items.map((item, j) => (
              <li key={j} className="text-[15px]">{renderInlineText(item.replace(/^[-*]\s+/, ''))}</li>
            ))}
          </ul>
        );
      }

      // Check for numbered list
      if (firstLine.match(/^\d+\.\s/)) {
        const items = para.split(/\n/).filter(l => l.trim());
        return (
          <ol key={i} className="list-decimal pl-6 my-2 space-y-1">
            {items.map((item, j) => (
              <li key={j} className="text-[15px]">{renderInlineText(item.replace(/^\d+\.\s+/, ''))}</li>
            ))}
          </ol>
        );
      }

      // Regular paragraph with inline formatting
      return (
        <p
          key={i}
          className="text-[15px] leading-7 my-2"
          dangerouslySetInnerHTML={{ __html: processInlineFormatting(para) }}
        />
      );
    });
  };

  // Process inline formatting (bold, italic, code, links)
  const processInlineFormatting = (text: string): string => {
    let processed = text;

    // Handle inline code
    processed = processed.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">$1</code>');

    // Handle bold
    processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Handle italic
    processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Handle links
    processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">$1</a>');

    // Handle line breaks within paragraph
    processed = processed.replace(/\n/g, '<br/>');

    return processed;
  };

  // Render inline text (for headers and list items where we can't use dangerouslySetInnerHTML easily)
  const renderInlineText = (text: string): React.ReactNode => {
    // Simple text for now - could be enhanced
    return text;
  };

  return <div className="prose prose-sm max-w-none dark:prose-invert">{renderContent()}</div>;
});
SimpleMarkdown.displayName = 'SimpleMarkdown';

// Main component - MEMOIZED
export const MessageBubble = memo<MessageBubbleProps>(({
  message,
  index,
  selectedModel,
  isStreaming = false,
  currentResponse = '',
  deepResearchStage,
  thinkingContent,
  isThinking,
  onDelete,
  onBranchFrom,
  onRegenerate,
  onEdit
}) => {
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  const handleCopy = async () => {
    const content = isStreaming ? currentResponse : message.content;
    if (content) {
      try {
        // Try modern clipboard API first
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(content);
        } else {
          // Fallback for non-secure contexts or older browsers
          const textArea = document.createElement('textarea');
          textArea.value = content;
          textArea.style.position = 'fixed';
          textArea.style.left = '-9999px';
          textArea.style.top = '-9999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
        // Try fallback even if clipboard API failed
        try {
          const textArea = document.createElement('textarea');
          textArea.value = content;
          textArea.style.position = 'fixed';
          textArea.style.left = '-9999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          console.error('Fallback copy also failed');
        }
      }
    }
  };

  const displayContent = isStreaming ? currentResponse : message.content;
  const isUser = message.role === 'user';
  const isError = message.content?.startsWith('Error:') ?? false;

  // Reasoning content
  const metaReasoning = message.meta?.reasoning_content || message.meta?.thought_content || message.meta?.thinking || '';
  const reasoningContent = thinkingContent || metaReasoning;
  const hasReasoning = !!reasoningContent;
  const hasThoughtTokens = typeof message.meta?.thought_tokens === 'number' && message.meta.thought_tokens > 0;
  const showReasoningSection = hasReasoning || (isThinking && isStreaming) || hasThoughtTokens;

  useEffect(() => {
    if (reasoningContent && reasoningContent.length > 0) {
      forceUpdate();
    }
  }, [reasoningContent.length, message.meta?.thought_tokens]);

  // User message - simple, right aligned
  if (isUser) {
    const handleStartEdit = () => {
      setEditContent(message.content || '');
      setIsEditing(true);
    };

    const handleSaveEdit = () => {
      if (onEdit && editContent.trim()) {
        onEdit(editContent.trim());
      }
      setIsEditing(false);
    };

    const handleCancelEdit = () => {
      setIsEditing(false);
      setEditContent('');
    };

    return (
      <div className="flex justify-end mb-6 group">
        <div className="max-w-[85%] md:max-w-[70%] overflow-hidden">
          {isEditing ? (
            // Edit mode
            <div className="bg-secondary dark:bg-[#2f2f2f] rounded-2xl rounded-br-md p-3">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-h-[80px] bg-background/50 rounded-lg p-2 text-[15px] resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Сохранить
                </button>
              </div>
            </div>
          ) : (
            // View mode
            <>
              <div className="bg-secondary dark:bg-[#2f2f2f] text-foreground px-4 py-2.5 rounded-2xl rounded-br-md">
                {/* Use SmartContent for large user messages to prevent freeze */}
                <div className="text-[15px] leading-relaxed">
                  <SmartContent content={displayContent || ''} />
                </div>
              </div>
              {/* Actions on hover */}
              <div className="flex justify-end mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1">
                  {onEdit && (
                    <button
                      onClick={handleStartEdit}
                      className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary/50 transition-colors"
                      title="Редактировать"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={handleCopy}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary/50 transition-colors"
                    title="Copy"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  {onDelete && (
                    <>
                      {showDeleteConfirm ? (
                        <div className="flex items-center gap-0.5 bg-card border border-border rounded-md p-0.5">
                          <button onClick={() => { onDelete(); setShowDeleteConfirm(false); }} className="p-1 text-green-500 hover:bg-green-500/10 rounded" title="Confirm">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setShowDeleteConfirm(false)} className="p-1 text-muted-foreground hover:bg-secondary rounded" title="Cancel">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setShowDeleteConfirm(true)} className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10 transition-colors" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="mb-6 group">
      <div className="flex gap-4 max-w-4xl">
        {/* Avatar */}
        <div className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isError ? "bg-destructive text-destructive-foreground" :
            isThinking ? "bg-purple-600 text-white" :
              "bg-foreground/10 text-foreground"
        )}>
          {isThinking ? <Brain className="w-4 h-4 animate-pulse" /> : <Bot className="w-4 h-4" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pt-1">
          {/* Model name */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-semibold text-foreground">
              {message.meta?.model ?
                (selectedModel?.id === message.meta.model ? selectedModel.display_name : message.meta.model) :
                (selectedModel?.display_name || 'Assistant')
              }
            </span>
            {message.meta?.provider && (
              <span className="text-xs text-muted-foreground">
                {String(message.meta.provider)}
              </span>
            )}
            {isStreaming && !isThinking && (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                generating
              </span>
            )}
          </div>

          {/* Thinking section */}
          {showReasoningSection && (
            <ThinkingSection
              content={reasoningContent || 'Thinking...'}
              isStreaming={isThinking}
              tokens={message.meta?.thought_tokens}
              isRlm={!!message.meta?.rlm}
            />
          )}

          {/* RLM API Request section — shows context, iterations, usage */}
          {message.meta?.rlm_api_request && (
            <RlmApiSection data={message.meta.rlm_api_request} />
          )}

          {/* RAG Context section - shows document sources */}
          {message.meta?.rag_sources && message.meta.rag_sources.length > 0 && (
            <RAGContextSection
              sources={message.meta.rag_sources}
              contextPreview={message.meta.rag_context_preview}
              contextFull={message.meta.rag_context_full}
              debug={message.meta.rag_debug}
              systemPromptPreview={message.meta.system_prompt_preview}
            />
          )}

          {/* Deep research status */}
          {deepResearchStage && !displayContent && (
            <div className="flex items-center gap-2 text-sm text-blue-500 mb-2">
              <Zap className="w-4 h-4 animate-pulse" />
              <span>{deepResearchStage}</span>
            </div>
          )}

          {/* Message content - OPTIMIZED with SmartContent */}
          {displayContent ? (
            <div className={cn(isError && "text-destructive")}>
              <SmartContent content={displayContent} isStreaming={isStreaming} />
              {isStreaming && !isThinking && (
                <span className="inline-block w-2 h-5 bg-foreground/70 animate-pulse ml-0.5 -mb-1" />
              )}
            </div>
          ) : isThinking ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          ) : isStreaming ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          ) : null}

          {/* Actions toolbar */}
          {!isStreaming && displayContent && (
            <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleCopy}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary/50 transition-colors"
                title={copied ? 'Copied!' : 'Copy'}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>

              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary/50 transition-colors"
                  title="Regenerate"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}

              {onBranchFrom && index !== undefined && (
                <button
                  onClick={() => onBranchFrom(index)}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary/50 transition-colors"
                  title="Branch from here"
                >
                  <GitBranch className="w-4 h-4" />
                </button>
              )}

              {onDelete && (
                <>
                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-0.5 bg-card border border-border rounded-md p-0.5 ml-1">
                      <button onClick={() => { onDelete(); setShowDeleteConfirm(false); }} className="p-1 text-green-500 hover:bg-green-500/10 rounded" title="Confirm">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setShowDeleteConfirm(false)} className="p-1 text-muted-foreground hover:bg-secondary rounded" title="Cancel">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setShowDeleteConfirm(true)} className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10 transition-colors" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}

              {/* Meta info */}
              {message.meta && (
                <div className="flex items-center gap-3 ml-3 text-xs text-muted-foreground">
                  {message.meta.tokens_out && (
                    <span>{message.meta.tokens_out.toLocaleString()} tokens</span>
                  )}
                  {message.meta.total_latency && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {message.meta.total_latency.toFixed(1)}s
                    </span>
                  )}
                  {message.meta.estimated_cost !== undefined && message.meta.estimated_cost > 0 && (
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      ${message.meta.estimated_cost.toFixed(4)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';

export default MessageBubble;
