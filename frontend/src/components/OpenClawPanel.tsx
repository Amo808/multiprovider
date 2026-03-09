import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Send, RefreshCw, Settings, Terminal, Zap,
  MessageSquare, AlertCircle, CheckCircle, Loader2, ExternalLink,
  Download, Copy, BookOpen
} from 'lucide-react';
import { Button } from './ui/button';
import { openclawService, OpenClawStatus } from '../services/openclaw';

// =============================================================================
// OpenClaw Panel — Control Center for OpenClaw Gateway
// =============================================================================

interface OpenClawPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OpenClawPanel({ isOpen, onClose }: OpenClawPanelProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'sessions' | 'config' | 'skills' | 'setup'>('chat');
  const [status, setStatus] = useState<OpenClawStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await openclawService.getStatus();
      setStatus(s);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to connect');
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchStatus();
  }, [isOpen, fetchStatus]);

  if (!isOpen) return null;

  const isConnected = status?.health?.healthy || false;
  const wsConnected = status?.ws_connected || false;
  const isConfigured = status?.configured || false;

  const effectiveTab = activeTab;

  const tabs = [
    { id: 'chat' as const, label: 'Agent Chat', icon: MessageSquare },
    { id: 'sessions' as const, label: 'Sessions', icon: Terminal },
    { id: 'config' as const, label: 'Config', icon: Settings },
    { id: 'skills' as const, label: 'Skills', icon: Zap },
    { id: 'setup' as const, label: 'Setup', icon: Download },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background border rounded-xl shadow-2xl w-[900px] max-w-[95vw] h-[700px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🦞</span>
            <div>
              <h2 className="text-lg font-semibold">OpenClaw Control</h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {isConnected ? (
                  <><CheckCircle size={12} className="text-green-500" /> Gateway connected</>
                ) : isConfigured ? (
                  <><AlertCircle size={12} className="text-yellow-400" /> Gateway offline — start it to connect</>
                ) : (
                  <><AlertCircle size={12} className="text-red-400" /> Gateway not set up</>
                )}
                {wsConnected && <span className="text-blue-400 ml-2">• WS live</span>}
                {status?.gateway_url && <span className="ml-2 opacity-60">{status.gateway_url}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={fetchStatus} title="Refresh status">
              <RefreshCw size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b px-4 bg-muted/10">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors ${
                (effectiveTab === tab.id)
                  ? 'border-orange-500 text-orange-500 font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
              {tab.id === 'setup' && !isConnected && (
                <span className="ml-1 w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              )}
            </button>
          ))}
        </div>

        {/* Error Banner */}
        {error && !isConnected && activeTab !== 'setup' && (
          <div className="px-4 py-2 bg-orange-500/10 text-orange-400 text-sm flex items-center gap-2">
            <AlertCircle size={14} />
            Gateway не подключен.
            <button className="underline ml-1" onClick={() => setActiveTab('setup')}>
              Инструкция по установке →
            </button>
            <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={fetchStatus}>
              Retry
            </Button>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-auto">
          {effectiveTab === 'chat' && <AgentChatTab isConnected={isConnected} />}
          {effectiveTab === 'sessions' && <SessionsTab isConnected={isConnected} />}
          {effectiveTab === 'config' && <ConfigTab status={status} isConnected={isConnected} />}
          {effectiveTab === 'skills' && <SkillsTab isConnected={isConnected} />}
          {effectiveTab === 'setup' && <SetupTab status={status} isConnected={isConnected} onRefresh={fetchStatus} />}
        </div>
      </div>
    </div>
  );
}


// =============================================================================
// Setup Tab — Installation & Configuration Guide
// =============================================================================

function SetupTab({ status, isConnected, onRefresh }: { status: OpenClawStatus | null; isConnected: boolean; onRefresh: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const CopyBtn = ({ text, id }: { text: string; id: string }) => (
    <button
      onClick={() => copyToClipboard(text, id)}
      className="absolute top-2 right-2 p-1.5 rounded bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground transition"
      title="Copy"
    >
      {copied === id ? <CheckCircle size={14} className="text-green-400" /> : <Copy size={14} />}
    </button>
  );

  if (isConnected) {
    return (
      <div className="p-6 text-center">
        <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Gateway Connected!</h3>
        <p className="text-sm text-muted-foreground mb-4">
          OpenClaw Gateway запущен и Multech подключен.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 rounded-lg text-sm">
          <CheckCircle size={14} className="text-green-500" />
          <span>URL: {status?.gateway_url}</span>
          {status?.ws_connected && <span className="text-blue-400">• WebSocket live</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Переключись на другие вкладки: чат с агентом, сессии, конфиг, скиллы.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      {/* Status Banner */}
      <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-3xl">🦞</span>
          <div>
            <h3 className="font-semibold text-orange-400">OpenClaw Gateway Setup</h3>
            <p className="text-sm text-muted-foreground mt-1">
              OpenClaw — персональный AI-ассистент, который работает через Telegram, WhatsApp, Discord, Slack, Signal и другие каналы.
              Multech управляет им как панель оператора.
            </p>
          </div>
        </div>
      </div>

      {/* Step 1: Install */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-orange-600 text-white flex items-center justify-center text-xs font-bold">1</span>
          Установить OpenClaw (Node ≥22)
        </h4>
        <div className="relative">
          <pre className="text-xs bg-muted rounded-lg p-3 border font-mono overflow-x-auto">
            npm install -g openclaw@latest
          </pre>
          <CopyBtn text="npm install -g openclaw@latest" id="install" />
        </div>
      </div>

      {/* Step 2: Onboard */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-orange-600 text-white flex items-center justify-center text-xs font-bold">2</span>
          Настроить (wizard проведёт по шагам)
        </h4>
        <div className="relative">
          <pre className="text-xs bg-muted rounded-lg p-3 border font-mono overflow-x-auto">
            openclaw onboard --install-daemon
          </pre>
          <CopyBtn text="openclaw onboard --install-daemon" id="onboard" />
        </div>
        <p className="text-xs text-muted-foreground">
          Wizard настроит модель (Claude/GPT), каналы (Telegram, Discord) и запустит daemon.
        </p>
      </div>

      {/* Step 3: Start Gateway */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-orange-600 text-white flex items-center justify-center text-xs font-bold">3</span>
          Запустить Gateway
        </h4>
        <div className="relative">
          <pre className="text-xs bg-muted rounded-lg p-3 border font-mono overflow-x-auto">
            openclaw gateway --port 18789 --verbose
          </pre>
          <CopyBtn text="openclaw gateway --port 18789 --verbose" id="gateway" />
        </div>
      </div>

      {/* Step 4: Configure Multech */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-orange-600 text-white flex items-center justify-center text-xs font-bold">4</span>
          Подключить Multech (backend/.env)
        </h4>
        <div className="relative">
          <pre className="text-xs bg-muted rounded-lg p-3 border font-mono overflow-x-auto whitespace-pre">
{`# Добавить в backend/.env:
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=your-gateway-token
OPENCLAW_HOOKS_TOKEN=your-hooks-token`}
          </pre>
          <CopyBtn text={`OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789\nOPENCLAW_GATEWAY_TOKEN=your-gateway-token\nOPENCLAW_HOOKS_TOKEN=your-hooks-token`} id="env" />
        </div>
        <p className="text-xs text-muted-foreground">
          Токен генерируется при onboard. Или: <code className="bg-muted px-1 rounded">openclaw gateway token</code>
        </p>
      </div>

      {/* Docker alternative */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
          🐳 Или через Docker (всё в одном)
        </h4>
        <div className="relative">
          <pre className="text-xs bg-muted rounded-lg p-3 border font-mono overflow-x-auto">
            docker-compose up -d
          </pre>
          <CopyBtn text="docker-compose up -d" id="docker" />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          <code className="bg-muted px-1 rounded">docker-compose.yml</code> уже включает OpenClaw Gateway как сервис.
          Добавь <code className="bg-muted px-1 rounded">OPENCLAW_GATEWAY_TOKEN</code> и токены каналов в <code className="bg-muted px-1 rounded">.env</code> файл.
        </p>
      </div>

      {/* Channel quick setup */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-semibold mb-2">📱 Быстрая настройка каналов</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-muted/50 rounded-lg p-3 border">
            <p className="font-medium mb-1">Telegram</p>
            <code className="text-[11px] opacity-70">TELEGRAM_BOT_TOKEN=...</code>
            <p className="text-muted-foreground mt-1">Получить у @BotFather</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 border">
            <p className="font-medium mb-1">Discord</p>
            <code className="text-[11px] opacity-70">DISCORD_BOT_TOKEN=...</code>
            <p className="text-muted-foreground mt-1">Discord Developer Portal</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 border">
            <p className="font-medium mb-1">WhatsApp</p>
            <code className="text-[11px] opacity-70">openclaw channels login</code>
            <p className="text-muted-foreground mt-1">QR-код для привязки</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 border">
            <p className="font-medium mb-1">Slack</p>
            <code className="text-[11px] opacity-70">SLACK_BOT_TOKEN=...</code>
            <p className="text-muted-foreground mt-1">Slack App настройки</p>
          </div>
        </div>
      </div>

      {/* Check connection + docs */}
      <div className="flex items-center gap-3 border-t pt-4">
        <Button onClick={onRefresh} className="bg-orange-600 hover:bg-orange-700 text-sm">
          <RefreshCw size={14} className="mr-1.5" />
          Проверить подключение
        </Button>
        <a
          href="https://docs.openclaw.ai/start/getting-started"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1"
        >
          <BookOpen size={12} /> Документация
        </a>
        <a
          href="https://docs.openclaw.ai/install/docker"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1"
        >
          <ExternalLink size={12} /> Docker Guide
        </a>
      </div>
    </div>
  );
}


// =============================================================================
// Agent Chat Tab
// =============================================================================

function AgentChatTab({ isConnected }: { isConnected: boolean }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: string }>>([]);
  const [streaming, setStreaming] = useState(false);
  const [sessionKey, setSessionKey] = useState('multech:main');
  const [channel, setChannel] = useState('last');
  const [deliver, setDeliver] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || streaming) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg, timestamp: new Date().toLocaleTimeString() }]);
    setStreaming(true);

    try {
      let assistantContent = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '...', timestamp: new Date().toLocaleTimeString() }]);

      for await (const event of openclawService.streamMessage({
        message: userMsg,
        session_key: sessionKey,
        deliver,
        channel,
      })) {
        if (event.type === 'content') {
          assistantContent += event.data;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], content: assistantContent };
            return updated;
          });
        } else if (event.type === 'status' || event.type === 'pending') {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], content: `⏳ ${event.data}` };
            return updated;
          });
        } else if (event.type === 'error') {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], role: 'system', content: `❌ ${event.data}` };
            return updated;
          });
        } else if (event.type === 'done') {
          if (!assistantContent) {
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { ...updated[updated.length - 1], content: `✅ ${event.data}` };
              return updated;
            });
          }
        }
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'system', content: `❌ Error: ${e.message}`, timestamp: new Date().toLocaleTimeString() }]);
    } finally {
      setStreaming(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <span className="text-5xl mb-4">🦞</span>
        <h3 className="text-lg font-semibold mb-2">Gateway не подключен</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Для чата с агентом нужен работающий OpenClaw Gateway.
          Перейди на вкладку <strong>Setup</strong> для инструкции по установке.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Settings bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b text-xs bg-muted/5">
        <label className="flex items-center gap-1">
          Session:
          <input
            value={sessionKey}
            onChange={e => setSessionKey(e.target.value)}
            className="bg-muted rounded px-2 py-0.5 w-40 text-xs"
          />
        </label>
        <label className="flex items-center gap-1">
          Channel:
          <select value={channel} onChange={e => setChannel(e.target.value)} className="bg-muted rounded px-2 py-0.5 text-xs">
            <option value="last">Last used</option>
            <option value="telegram">Telegram</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="discord">Discord</option>
            <option value="slack">Slack</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={deliver} onChange={e => setDeliver(e.target.checked)} className="rounded" />
          Deliver to channel
        </label>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            <span className="text-4xl block mb-3">🦞</span>
            <p className="text-sm">Send a message to your OpenClaw agent.</p>
            <p className="text-xs mt-1 opacity-60">
              The agent will execute tasks, browse the web, manage emails, and more.
              {deliver && <> Response also goes to <strong>{channel === 'last' ? 'your last channel' : channel}</strong>.</>}
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {['Check my email inbox', 'What can you do?', 'Set up a daily briefing at 9am', 'Search the web for latest AI news'].map(q => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="px-3 py-1.5 rounded-lg bg-muted text-xs hover:bg-muted/80 transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-orange-600 text-white'
                : msg.role === 'system'
                ? 'bg-red-500/10 text-red-300 border border-red-500/20'
                : 'bg-muted'
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p className="text-[10px] opacity-50 mt-1">{msg.timestamp}</p>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="border-t px-4 py-3">
        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Tell OpenClaw what to do..."
            className="flex-1 bg-muted rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            disabled={streaming}
          />
          <Button type="submit" disabled={!input.trim() || streaming} className="bg-orange-600 hover:bg-orange-700">
            {streaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </form>
      </div>
    </div>
  );
}


// =============================================================================
// Sessions Tab
// =============================================================================

function SessionsTab({ isConnected }: { isConnected: boolean }) {
  const [sessions, setSessions] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [history, setHistory] = useState<any>(null);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const data = await openclawService.getSessions();
      setSessions(data);
    } catch (e: any) {
      setSessions({ error: e.message });
    }
    setLoading(false);
  };

  const selectSession = async (key: string) => {
    setSelectedSession(key);
    try {
      const data = await openclawService.getSessionHistory(key);
      setHistory(data);
    } catch (e: any) {
      setHistory({ error: e.message });
    }
  };

  useEffect(() => {
    if (isConnected) fetchSessions();
  }, [isConnected]);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Terminal size={48} className="text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Сессии недоступны</h3>
        <p className="text-sm text-muted-foreground">
          Для просмотра сессий нужно подключение к Gateway.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Agent Sessions</h3>
        <Button variant="ghost" size="sm" onClick={fetchSessions} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {sessions?.error ? (
        <div className="text-sm text-red-400">{sessions.error}</div>
      ) : sessions?.sessions && Array.isArray(sessions.sessions) && sessions.sessions.length > 0 ? (
        <div className="space-y-1">
          {sessions.sessions.map((s: any) => (
            <button
              key={s.key || s.id}
              onClick={() => selectSession(s.key || s.id)}
              className={`w-full text-left px-3 py-2 rounded text-xs hover:bg-muted transition-colors ${
                selectedSession === (s.key || s.id) ? 'bg-muted border border-orange-500/30' : ''
              }`}
            >
              <span className="font-medium">{s.key || s.id}</span>
              {s.lastMessage && <span className="text-muted-foreground ml-2">— {s.lastMessage}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          Нет активных сессий. Отправь сообщение через Agent Chat чтобы создать.
        </div>
      )}

      {selectedSession && history && (
        <div className="mt-4 border rounded-lg p-3">
          <h4 className="text-xs font-medium mb-2">Session: {selectedSession}</h4>
          <pre className="text-xs bg-muted rounded p-2 max-h-60 overflow-auto">
            {JSON.stringify(history, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}


// =============================================================================
// Config Tab
// =============================================================================

function ConfigTab({ isConnected }: { status: OpenClawStatus | null; isConnected: boolean }) {
  const [configJson, setConfigJson] = useState('');
  const [patchJson, setPatchJson] = useState('{\n  \n}');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const data = await openclawService.getConfig();
      setConfigJson(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setConfigJson(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  const applyPatch = async () => {
    try {
      const patch = JSON.parse(patchJson);
      const data = await openclawService.patchConfig(patch);
      setResult(JSON.stringify(data, null, 2));
      fetchConfig();
    } catch (e: any) {
      setResult(`Error: ${e.message}`);
    }
  };

  if (!isConnected) {
    return (
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        <div className="flex flex-col items-center text-center py-6">
          <Settings size={48} className="text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Конфигурация Gateway</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Live-конфигурация доступна когда Gateway запущен.
            <br />Ниже — справка по ручной настройке.
          </p>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">📝 Файл: <code className="bg-muted px-1 rounded">~/.openclaw/openclaw.json</code></h4>

          <div className="bg-muted rounded-lg p-3 border">
            <p className="text-xs text-muted-foreground mb-2">Минимальный конфиг (модель + Telegram):</p>
            <pre className="text-xs font-mono whitespace-pre overflow-x-auto">{`{
  "agent": {
    "model": "anthropic/claude-sonnet-4-20250514"
  },
  "channels": {
    "telegram": {
      "botToken": "123456:ABCDEF"
    }
  }
}`}</pre>
          </div>

          <div className="bg-muted rounded-lg p-3 border">
            <p className="text-xs text-muted-foreground mb-2">С webhooks для Multech:</p>
            <pre className="text-xs font-mono whitespace-pre overflow-x-auto">{`{
  "hooks": {
    "enabled": true,
    "token": "your-hooks-secret"
  },
  "gateway": {
    "bind": "lan",
    "auth": { "mode": "token" }
  }
}`}</pre>
          </div>

          <a
            href="https://docs.openclaw.ai/gateway/configuration"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300"
          >
            <ExternalLink size={12} /> Полный справочник конфигурации
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Gateway Configuration (live)</h3>
        <Button variant="ghost" size="sm" onClick={fetchConfig} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span className="ml-1 text-xs">Load Config</span>
        </Button>
      </div>

      {configJson && (
        <div>
          <label className="text-xs text-muted-foreground">Current Config (read-only)</label>
          <pre className="text-xs bg-muted rounded-lg p-3 max-h-48 overflow-auto border mt-1">
            {configJson}
          </pre>
        </div>
      )}

      <div>
        <label className="text-xs text-muted-foreground">Config Patch (JSON)</label>
        <div className="mt-1 space-y-2">
          <textarea
            value={patchJson}
            onChange={e => setPatchJson(e.target.value)}
            rows={6}
            className="w-full bg-muted rounded-lg p-3 text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder='{"channels": {"telegram": {"botToken": "..."}}}'
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={applyPatch} className="bg-orange-600 hover:bg-orange-700 text-xs">
              Apply Patch
            </Button>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setPatchJson(JSON.stringify({
              channels: { telegram: { botToken: "YOUR_BOT_TOKEN" } }
            }, null, 2))}>
              + Telegram
            </Button>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setPatchJson(JSON.stringify({
              hooks: { enabled: true, token: "your-secret" }
            }, null, 2))}>
              + Webhooks
            </Button>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setPatchJson(JSON.stringify({
              cron: { jobs: [{ id: "briefing", schedule: "0 9 * * *", message: "Give me a morning briefing" }] }
            }, null, 2))}>
              + Cron Job
            </Button>
          </div>
        </div>
      </div>

      {result && (
        <div className="border rounded-lg p-3">
          <label className="text-xs text-muted-foreground">Result</label>
          <pre className="text-xs mt-1 max-h-40 overflow-auto">{result}</pre>
        </div>
      )}
    </div>
  );
}


// =============================================================================
// Skills Tab
// =============================================================================

function SkillsTab({ isConnected }: { isConnected: boolean }) {
  const [skillSlug, setSkillSlug] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const installSkill = async () => {
    if (!skillSlug.trim()) return;
    setLoading(true);
    try {
      const data = await openclawService.installSkill(skillSlug.trim());
      setResult(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setResult(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  const listSkills = async () => {
    setLoading(true);
    try {
      const data = await openclawService.getSkills();
      setResult(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setResult(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  if (!isConnected) {
    return (
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        <div className="flex flex-col items-center text-center py-6">
          <Zap size={48} className="text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Skills (плагины)</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Skills расширяют возможности агента. Устанавливаются из ClawHub.
          </p>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">🔌 Популярные Skills</h4>
          <div className="grid grid-cols-2 gap-2">
            {[
              { slug: 'nano-banana-pro', emoji: '🍌', name: 'Nano Banana Pro', desc: 'Генерация изображений' },
              { slug: 'summarize', emoji: '📄', name: 'Summarize', desc: 'Суммаризация текстов' },
              { slug: 'voice-call', emoji: '📞', name: 'Voice Call', desc: 'Голосовые звонки' },
              { slug: 'peekaboo', emoji: '👀', name: 'Peekaboo', desc: 'Скриншоты' },
            ].map(s => (
              <div key={s.slug} className="bg-muted/50 rounded-lg p-3 border">
                <p className="font-medium text-sm">{s.emoji} {s.name}</p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
                <code className="text-[11px] opacity-50 block mt-1">openclaw skills install {s.slug}</code>
              </div>
            ))}
          </div>
          <a
            href="https://clawhub.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300"
          >
            <ExternalLink size={12} /> Все скиллы на ClawHub
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Skills Manager</h3>
        <a
          href="https://clawhub.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1"
        >
          Browse ClawHub <ExternalLink size={12} />
        </a>
      </div>

      <div className="flex gap-2">
        <input
          value={skillSlug}
          onChange={e => setSkillSlug(e.target.value)}
          placeholder="skill-slug (e.g. nano-banana-pro)"
          className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <Button onClick={installSkill} disabled={loading || !skillSlug.trim()} className="bg-orange-600 hover:bg-orange-700 text-sm">
          {loading ? <Loader2 size={14} className="animate-spin" /> : 'Install'}
        </Button>
        <Button variant="ghost" onClick={listSkills} disabled={loading}>
          List All
        </Button>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2">Popular skills:</p>
        <div className="flex flex-wrap gap-2">
          {[
            { slug: 'nano-banana-pro', label: '🍌 Nano Banana Pro' },
            { slug: 'summarize', label: '📄 Summarize' },
            { slug: 'voice-call', label: '📞 Voice Call' },
            { slug: 'peekaboo', label: '👀 Peekaboo' },
          ].map(s => (
            <button
              key={s.slug}
              onClick={() => setSkillSlug(s.slug)}
              className="px-2 py-1 rounded bg-muted text-xs hover:bg-muted/80 transition"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className="border rounded-lg p-3">
          <pre className="text-xs max-h-60 overflow-auto whitespace-pre-wrap">{result}</pre>
        </div>
      )}
    </div>
  );
}
