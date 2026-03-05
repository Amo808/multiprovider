import React, { useState, useCallback, useRef, useEffect } from 'react';

/**
 * RLM Deep Analysis Panel
 * 
 * Provides a UI for running Recursive Language Model analysis
 * on documents or arbitrary text contexts. Shows real-time
 * streaming progress of the RLM execution.
 */

interface RLMEvent {
  status: 'initializing' | 'running' | 'iteration' | 'sub_call' | 'completed' | 'error' | 'cancelled';
  message: string;
  iteration?: number;
  max_iterations?: number;
  depth?: number;
  code?: string;
  output?: string;
  answer?: string;
  tokens_used?: number;
  elapsed_seconds?: number;
  metadata?: Record<string, any>;
}

interface DeepAnalysisPanelProps {
  isOpen: boolean;
  onClose: () => void;
  provider: string;
  model: string;
  documentIds?: string[];
  documentsCount: number;
}

const API_BASE = '/api';

export const DeepAnalysisPanel: React.FC<DeepAnalysisPanelProps> = ({
  isOpen,
  onClose,
  provider,
  model,
  documentIds,
  documentsCount,
}) => {
  const [prompt, setPrompt] = useState('');
  const [context, setContext] = useState('');
  const [useDocuments, setUseDocuments] = useState(true);
  const [maxIterations, setMaxIterations] = useState(15);
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<RLMEvent[]>([]);
  const [finalAnswer, setFinalAnswer] = useState<string | null>(null);
  const [rlmAvailable, setRlmAvailable] = useState<boolean | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Check RLM availability on mount
  useEffect(() => {
    if (isOpen) {
      fetch(`${API_BASE}/rlm/status`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => setRlmAvailable(data.available))
        .catch(() => setRlmAvailable(false));
    }
  }, [isOpen]);

  // Auto-scroll events
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const handleRun = useCallback(async () => {
    if (!prompt.trim()) return;
    
    setIsRunning(true);
    setEvents([]);
    setFinalAnswer(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const body: Record<string, any> = {
        prompt: prompt.trim(),
        provider,
        model,
        max_iterations: maxIterations,
      };

      if (useDocuments && documentsCount > 0) {
        body.document_ids = documentIds;
      } else if (context.trim()) {
        body.context = context.trim();
      }

      const response = await fetch(`${API_BASE}/rlm/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: RLMEvent = JSON.parse(line.slice(6));
              setEvents(prev => [...prev, event]);

              if (event.status === 'completed' && event.answer) {
                setFinalAnswer(event.answer);
              }
            } catch {
              // Skip malformed events
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setEvents(prev => [...prev, {
          status: 'error',
          message: `Error: ${err.message}`,
        }]);
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [prompt, context, provider, model, maxIterations, useDocuments, documentIds, documentsCount]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  if (!isOpen) return null;

  const statusColors: Record<string, string> = {
    initializing: 'text-blue-400',
    running: 'text-yellow-400',
    iteration: 'text-purple-400',
    sub_call: 'text-cyan-400',
    completed: 'text-green-400',
    error: 'text-red-400',
    cancelled: 'text-gray-400',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <span className="text-white text-sm font-bold">🧠</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Deep Analysis (RLM)</h2>
              <p className="text-xs text-muted-foreground">
                Recursive Language Model — глубокий анализ больших документов
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {/* Availability check */}
          {rlmAvailable === false && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-600 dark:text-yellow-400">
              ⚠️ RLM библиотека не установлена на сервере. Для активации нужно: <code className="bg-yellow-500/20 px-1 rounded">pip install rlms</code>
            </div>
          )}

          {/* Source selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Источник данных</label>
            <div className="flex gap-3">
              <button
                onClick={() => setUseDocuments(true)}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  useDocuments
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                📄 Документы ({documentsCount})
              </button>
              <button
                onClick={() => setUseDocuments(false)}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  !useDocuments
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                📝 Свой текст
              </button>
            </div>
          </div>

          {/* Context input (only for custom text) */}
          {!useDocuments && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Контекст для анализа</label>
              <textarea
                value={context}
                onChange={e => setContext(e.target.value)}
                placeholder="Вставьте текст для глубокого анализа (поддерживается до 10M+ токенов)..."
                className="w-full h-32 bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {context && (
                <p className="text-xs text-muted-foreground">
                  {context.length.toLocaleString()} символов (~{Math.ceil(context.length / 4).toLocaleString()} токенов)
                </p>
              )}
            </div>
          )}

          {/* Prompt */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Вопрос / Задача</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Что нужно проанализировать? Например: 'Найди все противоречия в документе' или 'Составь полный саммари по главам'"
              className="w-full h-20 bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Settings */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Макс. итераций:</label>
              <input
                type="number"
                value={maxIterations}
                onChange={e => setMaxIterations(Math.max(1, Math.min(50, parseInt(e.target.value) || 15)))}
                className="w-16 bg-secondary/50 border border-border rounded px-2 py-1 text-xs text-center"
                min={1}
                max={50}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Провайдер: <span className="text-foreground font-medium">{provider}/{model}</span>
            </div>
          </div>

          {/* Events log */}
          {events.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Ход выполнения</label>
              <div className="bg-black/30 rounded-lg p-3 max-h-48 overflow-auto font-mono text-xs space-y-1">
                {events.map((event, i) => (
                  <div key={i} className={`${statusColors[event.status] || 'text-foreground'}`}>
                    <span className="opacity-50">[{event.elapsed_seconds?.toFixed(1)}s]</span>{' '}
                    <span className="font-semibold">[{event.status.toUpperCase()}]</span>{' '}
                    {event.message}
                    {event.code && (
                      <pre className="mt-1 ml-4 text-gray-400 whitespace-pre-wrap">{event.code.substring(0, 200)}{event.code.length > 200 ? '...' : ''}</pre>
                    )}
                  </div>
                ))}
                <div ref={eventsEndRef} />
              </div>
            </div>
          )}

          {/* Final answer */}
          {finalAnswer && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-green-500">✅ Результат</label>
              <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 text-sm whitespace-pre-wrap">
                {finalAnswer}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            RLM позволяет ИИ рекурсивно анализировать контекст любого размера через Python REPL
          </p>
          <div className="flex gap-2">
            {isRunning ? (
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg text-sm bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              >
                ⏹ Остановить
              </button>
            ) : (
              <button
                onClick={handleRun}
                disabled={!prompt.trim() || rlmAvailable === false}
                className="px-4 py-2 rounded-lg text-sm bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                🧠 Запустить глубокий анализ
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
