import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Send, RefreshCw, Settings, Terminal, Zap,
  MessageSquare, AlertCircle, CheckCircle, Loader2, ExternalLink,
  Download, Copy, BookOpen, Power, Square, RotateCcw, ScrollText,
  ChevronDown, ChevronRight, Eye, EyeOff, Save, ToggleLeft, ToggleRight,
  Shield, Bot, Hash, Globe
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
  const [activeTab, setActiveTab] = useState<'chat' | 'sessions' | 'config' | 'skills' | 'gateway'>('chat');
  const [status, setStatus] = useState<OpenClawStatus | null>(null);
  const [, setError] = useState<string | null>(null);

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

  // Auto-poll status every 5s when panel is open
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [isOpen, fetchStatus]);

  if (!isOpen) return null;

  const isConnected = status?.health?.healthy || false;
  const wsConnected = status?.ws_connected || false;
  const gwProcess = status?.gateway_process;
  const gwStatus = gwProcess?.status || 'stopped';
  const gwStarting = gwStatus === 'starting';
  const gwNotInstalled = gwStatus === 'not_installed';

  const tabs = [
    { id: 'chat' as const, label: 'Agent Chat', icon: MessageSquare },
    { id: 'sessions' as const, label: 'Sessions', icon: Terminal },
    { id: 'config' as const, label: 'Config', icon: Settings },
    { id: 'skills' as const, label: 'Skills', icon: Zap },
    { id: 'gateway' as const, label: 'Gateway', icon: Power },
  ];

  // Status indicator
  const StatusIndicator = () => {
    if (isConnected) {
      return <><CheckCircle size={12} className="text-green-500" /> Gateway running</>;
    }
    if (gwStarting) {
      return <><Loader2 size={12} className="text-yellow-400 animate-spin" /> Gateway starting...</>;
    }
    if (gwStatus === 'running' && !isConnected) {
      return <><Loader2 size={12} className="text-yellow-400 animate-spin" /> Gateway initializing...</>;
    }
    if (gwNotInstalled) {
      return <><AlertCircle size={12} className="text-red-400" /> OpenClaw not installed</>;
    }
    if (gwStatus === 'error') {
      return <><AlertCircle size={12} className="text-red-400" /> Gateway error</>;
    }
    return <><AlertCircle size={12} className="text-yellow-400" /> Gateway stopped</>;
  };

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
                <StatusIndicator />
                {wsConnected && <span className="text-blue-400 ml-2">• WS live</span>}
                {gwProcess?.pid && <span className="ml-2 opacity-60">PID {gwProcess.pid}</span>}
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
                (activeTab === tab.id)
                  ? 'border-orange-500 text-orange-500 font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
              {tab.id === 'gateway' && !isConnected && (
                <span className={`ml-1 w-2 h-2 rounded-full ${
                  gwStarting ? 'bg-yellow-400 animate-pulse' : 
                  gwNotInstalled ? 'bg-red-500' : 'bg-orange-500 animate-pulse'
                }`} />
              )}
            </button>
          ))}
        </div>

        {/* Error Banner — only show if gateway has error, link to Gateway tab */}
        {gwStatus === 'error' && activeTab !== 'gateway' && (
          <div className="px-4 py-2 bg-red-500/10 text-red-400 text-sm flex items-center gap-2">
            <AlertCircle size={14} />
            Gateway error: {gwProcess?.error || 'Unknown'}
            <button className="underline ml-1" onClick={() => setActiveTab('gateway')}>
              Подробнее →
            </button>
          </div>
        )}

        {/* Not installed banner */}
        {gwNotInstalled && activeTab !== 'gateway' && (
          <div className="px-4 py-2 bg-orange-500/10 text-orange-400 text-sm flex items-center gap-2">
            <AlertCircle size={14} />
            OpenClaw CLI не установлен.
            <button className="underline ml-1" onClick={() => setActiveTab('gateway')}>
              Установить →
            </button>
          </div>
        )}

        {/* Tab Content — use hidden instead of conditional mount to preserve state */}
        <div className="flex-1 overflow-auto relative">
          <div className={activeTab !== 'chat' ? 'hidden' : 'h-full'}><AgentChatTab isConnected={isConnected} /></div>
          <div className={activeTab !== 'sessions' ? 'hidden' : 'h-full'}><SessionsTab isConnected={isConnected} /></div>
          <div className={activeTab !== 'config' ? 'hidden' : 'h-full'}><ConfigTab isConnected={isConnected} /></div>
          <div className={activeTab !== 'skills' ? 'hidden' : 'h-full'}><SkillsTab isConnected={isConnected} /></div>
          <div className={activeTab !== 'gateway' ? 'hidden' : 'h-full'}><GatewayTab status={status} isConnected={isConnected} onRefresh={fetchStatus} /></div>
        </div>
      </div>
    </div>
  );
}


// =============================================================================
// Gateway Tab — Process Management (auto-managed)
// =============================================================================

function GatewayTab({ status, isConnected, onRefresh }: { status: OpenClawStatus | null; isConnected: boolean; onRefresh: () => void }) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const gw = status?.gateway_process;
  const gwStatus = gw?.status || 'stopped';

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

  const doAction = async (action: 'start' | 'stop' | 'restart' | 'reconnect-ws') => {
    setActionLoading(action);
    setActionResult(null);
    try {
      let result;
      if (action === 'start') result = await openclawService.startGateway();
      else if (action === 'stop') result = await openclawService.stopGateway();
      else if (action === 'reconnect-ws') result = await openclawService.reconnectWs();
      else result = await openclawService.restartGateway();
      
      setActionResult(result.ok ? `✓ ${action} successful` : `✗ ${result.error || 'Failed'}`);
      onRefresh();
    } catch (e: any) {
      setActionResult(`✗ ${e.message}`);
    }
    setActionLoading(null);
  };

  const fetchLogs = async () => {
    try {
      const data = await openclawService.getGatewayLogs(100);
      setLogs(data.logs || []);
      setShowLogs(true);
    } catch (e: any) {
      setLogs([`Error fetching logs: ${e.message}`]);
      setShowLogs(true);
    }
  };

  const formatUptime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  };

  // ---- Connected State ----
  if (isConnected && (gwStatus === 'running' || gw?.method === 'external')) {
    return (
      <div className="p-6 space-y-6">
        {/* Status Card */}
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-5">
          <div className="flex items-center gap-3">
            <CheckCircle size={32} className="text-green-500" />
            <div className="flex-1">
              <h3 className="font-semibold text-green-400">Gateway Running</h3>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                {gw?.pid && <span>PID {gw.pid}</span>}
                <span>Port {gw?.port}</span>
                {(gw?.uptime_seconds || 0) > 0 && <span>Uptime {formatUptime(gw?.uptime_seconds || 0)}</span>}
                <span>Method: {gw?.method}</span>
                {status?.ws_connected && <span className="text-blue-400">WebSocket connected</span>}
              </div>
            </div>
            <div className="flex gap-2">
              {gw?.method !== 'external' && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => doAction('restart')} disabled={!!actionLoading}>
                    {actionLoading === 'restart' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                    <span className="ml-1">Restart</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => doAction('stop')} disabled={!!actionLoading}>
                    {actionLoading === 'stop' ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
                    <span className="ml-1">Stop</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-3">
          {gw?.method !== 'external' && (
            <Button variant="outline" size="sm" onClick={fetchLogs}>
              <ScrollText size={14} className="mr-1.5" /> View Logs ({gw?.log_lines || 0} lines)
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw size={14} className="mr-1.5" /> Refresh Status
          </Button>
          {!status?.ws_connected && (
            <Button variant="outline" size="sm" className="text-blue-400 hover:text-blue-300" onClick={() => doAction('reconnect-ws')} disabled={!!actionLoading}>
              {actionLoading === 'reconnect-ws' ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Zap size={14} className="mr-1.5" />}
              Reconnect WS
            </Button>
          )}
          {gw?.restart_count ? (
            <span className="text-xs text-yellow-400">Auto-restarts: {gw.restart_count}</span>
          ) : null}
        </div>

        {actionResult && (
          <div className={`text-sm px-3 py-2 rounded-lg ${actionResult.startsWith('✓') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            {actionResult}
          </div>
        )}

        {/* Logs */}
        {showLogs && (
          <div className="border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30 text-xs">
              <span className="font-medium">Gateway Logs</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={fetchLogs}>Refresh</Button>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowLogs(false)}>Close</Button>
              </div>
            </div>
            <pre className="text-[11px] font-mono p-3 max-h-64 overflow-auto bg-black/20 whitespace-pre-wrap">
              {logs.length > 0 ? logs.join('\n') : 'No logs yet'}
            </pre>
          </div>
        )}
      </div>
    );
  }

  // ---- Starting State ----
  if (gwStatus === 'starting') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Loader2 size={48} className="text-orange-400 animate-spin mb-4" />
        <h3 className="text-lg font-semibold mb-2">Запускаем Gateway...</h3>
        <p className="text-sm text-muted-foreground">
          OpenClaw Gateway стартует. Это может занять несколько секунд.
        </p>
        {gw?.method && <p className="text-xs text-muted-foreground mt-2">Метод: {gw.method} | PID: {gw.pid}</p>}
      </div>
    );
  }

  // ---- Not Installed State ----
  if (gwStatus === 'not_installed') {
    return (
      <div className="p-4 space-y-6 max-w-2xl mx-auto">
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Download size={24} className="text-orange-400 mt-0.5" />
            <div>
              <h3 className="font-semibold text-orange-400">Установите OpenClaw CLI</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Multech автоматически запустит Gateway, но сначала нужен OpenClaw CLI.
                Нужен Node.js ≥ 22.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">1. Установить CLI</h4>
          <div className="relative">
            <pre className="text-xs bg-muted rounded-lg p-3 border font-mono">npm install -g openclaw@latest</pre>
            <CopyBtn text="npm install -g openclaw@latest" id="install" />
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">2. Пройти настройку (если первый раз)</h4>
          <div className="relative">
            <pre className="text-xs bg-muted rounded-lg p-3 border font-mono">openclaw onboard --install-daemon</pre>
            <CopyBtn text="openclaw onboard --install-daemon" id="onboard" />
          </div>
          <p className="text-xs text-muted-foreground">
            Wizard настроит модель (Claude/GPT), каналы (Telegram, Discord) и daemon.
          </p>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">3. Перезапустить или нажать:</h4>
          <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => doAction('start')} disabled={!!actionLoading}>
            {actionLoading ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Power size={14} className="mr-1.5" />}
            Запустить Gateway
          </Button>
        </div>

        {actionResult && (
          <div className={`text-sm px-3 py-2 rounded-lg ${actionResult.startsWith('✓') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            {actionResult}
          </div>
        )}

        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold mb-2">🐳 Альтернатива: Docker</h4>
          <div className="relative">
            <pre className="text-xs bg-muted rounded-lg p-3 border font-mono">docker-compose up -d</pre>
            <CopyBtn text="docker-compose up -d" id="docker" />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            docker-compose.yml уже включает Gateway. Добавьте OPENCLAW_GATEWAY_TOKEN в .env.
          </p>
        </div>

        <div className="flex items-center gap-3 border-t pt-4">
          <a href="https://docs.openclaw.ai/start/getting-started" target="_blank" rel="noopener noreferrer"
            className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1">
            <BookOpen size={12} /> Документация
          </a>
          <a href="https://docs.openclaw.ai/install/docker" target="_blank" rel="noopener noreferrer"
            className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1">
            <ExternalLink size={12} /> Docker Guide
          </a>
        </div>
      </div>
    );
  }

  // ---- Stopped / Error State ----
  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className={`border rounded-lg p-5 ${gwStatus === 'error' ? 'bg-red-500/10 border-red-500/20' : 'bg-muted/30'}`}>
        <div className="flex items-center gap-3">
          {gwStatus === 'error' ? (
            <AlertCircle size={32} className="text-red-400" />
          ) : (
            <Square size={32} className="text-muted-foreground" />
          )}
          <div className="flex-1">
            <h3 className="font-semibold">
              {gwStatus === 'error' ? 'Gateway Error' : 'Gateway Stopped'}
            </h3>
            {gw?.error && <p className="text-sm text-red-400 mt-1">{gw.error}</p>}
            {gw?.method && gw.method !== 'none' && (
              <p className="text-xs text-muted-foreground mt-1">CLI: {gw.cli_path} ({gw.method})</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button className="bg-green-600 hover:bg-green-700" onClick={() => doAction('start')} disabled={!!actionLoading}>
          {actionLoading === 'start' ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Power size={14} className="mr-1.5" />}
          Start Gateway
        </Button>
        {gwStatus === 'error' && (
          <Button variant="outline" onClick={() => doAction('restart')} disabled={!!actionLoading}>
            {actionLoading === 'restart' ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <RotateCcw size={14} className="mr-1.5" />}
            Restart
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={fetchLogs}>
          <ScrollText size={14} className="mr-1.5" /> View Logs
        </Button>
      </div>

      {actionResult && (
        <div className={`text-sm px-3 py-2 rounded-lg ${actionResult.startsWith('✓') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {actionResult}
        </div>
      )}

      {showLogs && (
        <div className="border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30 text-xs">
            <span className="font-medium">Gateway Logs</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={fetchLogs}>Refresh</Button>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowLogs(false)}>Close</Button>
            </div>
          </div>
          <pre className="text-[11px] font-mono p-3 max-h-64 overflow-auto bg-black/20 whitespace-pre-wrap">
            {logs.length > 0 ? logs.join('\n') : 'No logs yet'}
          </pre>
        </div>
      )}
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
          const errData = event.data as any;
          const errMsg = typeof errData === 'string'
            ? errData
            : (errData?.message || errData?.detail || errData?.error || JSON.stringify(errData));
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], role: 'system', content: `❌ ${errMsg}` };
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
      const errMsg = e?.message || e?.detail || (typeof e === 'string' ? e : JSON.stringify(e));
      setMessages(prev => [...prev, { role: 'system', content: `❌ Error: ${errMsg}`, timestamp: new Date().toLocaleTimeString() }]);
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
          Дождитесь запуска Gateway или перейдите на вкладку <strong>Gateway</strong> для управления.
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
// Config Tab — Structured Editor
// =============================================================================

function ConfigSection({ title, icon, children, defaultOpen = false }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        {icon}
        <span className="flex-1 text-left">{title}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && <div className="px-3 pb-3 space-y-3 border-t bg-muted/20">{children}</div>}
    </div>
  );
}

function ConfigField({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="mt-2">
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/60 mt-0.5">{hint}</p>}
    </div>
  );
}

function ConfigTab({ isConnected }: { isConnected: boolean }) {
  const [config, setConfig] = useState<any>(null);
  const [configHash, setConfigHash] = useState<string>('');
  const [configPath, setConfigPath] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);
  const [patchJson, setPatchJson] = useState('{\n  \n}');

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const data = await openclawService.getConfig();
      // Extract actual config from WS response: payload.config > payload.parsed > payload
      const payload = data?.payload || data;
      const actualConfig = payload?.config || payload?.parsed || payload;
      setConfig(actualConfig);
      setConfigHash(payload?.hash || '');
      setConfigPath(payload?.path || '');
    } catch (e: any) {
      setConfig(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isConnected) fetchConfig();
  }, [isConnected]);

  const applyPatch = async (patch: Record<string, any>) => {
    setSaving(true);
    setSaveResult(null);
    try {
      await openclawService.patchConfig(patch);
      setSaveResult({ ok: true, msg: 'Saved' });
      setTimeout(() => setSaveResult(null), 2000);
      await fetchConfig();
    } catch (e: any) {
      setSaveResult({ ok: false, msg: e.message });
    }
    setSaving(false);
  };

  const applyRawPatch = async () => {
    try {
      const patch = JSON.parse(patchJson);
      await applyPatch(patch);
    } catch (e: any) {
      setSaveResult({ ok: false, msg: `Invalid JSON: ${e.message}` });
    }
  };

  // Helpers for editing nested config values
  const updateField = (path: string[], value: any) => {
    const patch: any = {};
    let cur = patch;
    for (let i = 0; i < path.length - 1; i++) {
      cur[path[i]] = {};
      cur = cur[path[i]];
    }
    cur[path[path.length - 1]] = value;
    applyPatch(patch);
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

  // Extract config sections for structured view
  const agents = config?.agents || config?.agent || {};
  const agentList = agents?.list || [];
  const mainAgent = agentList.find((a: any) => a.default) || agentList[0] || {};
  const identity = mainAgent?.identity || {};
  const model = agents?.defaults?.model || {};
  const channels = config?.channels || {};
  const gateway = config?.gateway || {};
  const skills = config?.skills?.entries || {};
  const commands = config?.commands || {};

  return (
    <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Settings size={14} /> Configuration
        </h3>
        <div className="flex items-center gap-2">
          {saveResult && (
            <span className={`text-xs ${saveResult.ok ? 'text-green-400' : 'text-red-400'}`}>
              {saveResult.ok ? <CheckCircle size={12} className="inline mr-1" /> : <AlertCircle size={12} className="inline mr-1" />}
              {saveResult.msg}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowRawJson(!showRawJson)} className="text-xs">
            {showRawJson ? <Eye size={12} /> : <EyeOff size={12} />}
            <span className="ml-1">{showRawJson ? 'Structured' : 'Raw JSON'}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={fetchConfig} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Raw JSON mode */}
      {showRawJson ? (
        <div className="space-y-3">
          {config && (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Current Config</label>
                {configPath && <span className="text-[10px] text-muted-foreground/50 font-mono">{configPath}</span>}
              </div>
              <pre className="text-xs bg-muted rounded-lg p-3 max-h-64 overflow-auto border mt-1 select-all">
                {JSON.stringify(config, null, 2)}
              </pre>
              {configHash && <p className="text-[10px] text-muted-foreground/40 mt-1">Hash: {configHash.slice(0, 16)}...</p>}
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground">Config Patch (JSON)</label>
            <textarea
              value={patchJson}
              onChange={e => setPatchJson(e.target.value)}
              rows={5}
              className="w-full bg-muted rounded-lg p-3 text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-orange-500 mt-1"
              placeholder='{"channels": {"telegram": {"botToken": "..."}}}'
            />
            <div className="flex gap-2 mt-2">
              <Button size="sm" onClick={applyRawPatch} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-xs">
                <Save size={12} className="mr-1" /> Apply Patch
              </Button>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setPatchJson(JSON.stringify({
                channels: { telegram: { botToken: "YOUR_BOT_TOKEN" } }
              }, null, 2))}>+ Telegram</Button>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setPatchJson(JSON.stringify({
                hooks: { enabled: true, token: "your-secret" }
              }, null, 2))}>+ Webhooks</Button>
            </div>
          </div>
        </div>
      ) : (
        /* Structured mode */
        <div className="space-y-2">
          {/* Identity */}
          <ConfigSection title="Identity & Agent" icon={<Bot size={14} />} defaultOpen={true}>
            <ConfigField label="Name" hint="How the agent introduces itself">
              <input
                defaultValue={identity.name || ''}
                onBlur={e => {
                  if (e.target.value !== (identity.name || ''))
                    updateField(['agents', 'list', '0', 'identity', 'name'], e.target.value);
                }}
                className="w-full bg-muted rounded px-2 py-1.5 text-sm border focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </ConfigField>
            <ConfigField label="Theme" hint="Agent persona description">
              <input
                defaultValue={identity.theme || ''}
                onBlur={e => {
                  if (e.target.value !== (identity.theme || ''))
                    updateField(['agents', 'list', '0', 'identity', 'theme'], e.target.value);
                }}
                className="w-full bg-muted rounded px-2 py-1.5 text-sm border focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </ConfigField>
            <ConfigField label="Emoji">
              <input
                defaultValue={identity.emoji || ''}
                onBlur={e => {
                  if (e.target.value !== (identity.emoji || ''))
                    updateField(['agents', 'list', '0', 'identity', 'emoji'], e.target.value);
                }}
                className="w-20 bg-muted rounded px-2 py-1.5 text-sm border focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </ConfigField>
          </ConfigSection>

          {/* Model */}
          <ConfigSection title="Model" icon={<Hash size={14} />} defaultOpen={true}>
            <ConfigField label="Primary Model" hint="e.g. anthropic/claude-sonnet-4-20250514">
              <input
                defaultValue={model.primary || ''}
                onBlur={e => {
                  if (e.target.value !== (model.primary || ''))
                    updateField(['agents', 'defaults', 'model', 'primary'], e.target.value);
                }}
                className="w-full bg-muted rounded px-2 py-1.5 text-sm font-mono border focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </ConfigField>
            <ConfigField label="Max Concurrent Agents">
              <input
                type="number"
                defaultValue={agents?.defaults?.maxConcurrent || 3}
                onBlur={e => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v) && v !== (agents?.defaults?.maxConcurrent || 3))
                    updateField(['agents', 'defaults', 'maxConcurrent'], v);
                }}
                className="w-24 bg-muted rounded px-2 py-1.5 text-sm border focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </ConfigField>
          </ConfigSection>

          {/* Channels */}
          <ConfigSection title="Channels" icon={<Globe size={14} />}>
            {Object.keys(channels).length === 0 ? (
              <p className="text-xs text-muted-foreground mt-2">No channels configured.
                <button className="text-orange-400 ml-1" onClick={() => {
                  setShowRawJson(true);
                  setPatchJson(JSON.stringify({ channels: { telegram: { enabled: true, botToken: "YOUR_BOT_TOKEN" } } }, null, 2));
                }}>+ Add Telegram</button>
              </p>
            ) : (
              Object.entries(channels).map(([name, ch]: [string, any]) => (
                <div key={name} className="mt-2 bg-muted/30 rounded-lg p-2 border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize flex items-center gap-1.5">
                      {name === 'telegram' && '📱'}
                      {name === 'discord' && '💬'}
                      {name === 'slack' && '💼'}
                      {name}
                    </span>
                    <button
                      onClick={() => updateField(['channels', name, 'enabled'], !ch.enabled)}
                      className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${ch.enabled !== false ? 'text-green-400' : 'text-muted-foreground'}`}
                    >
                      {ch.enabled !== false ?
                        <><ToggleRight size={16} className="text-green-400" /> On</> :
                        <><ToggleLeft size={16} /> Off</>}
                    </button>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                    {ch.botToken && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Bot Token: </span>
                        <span className="font-mono">{ch.botToken === '__OPENCLAW_REDACTED__' ? '(redacted)' : `${ch.botToken.slice(0, 8)}${'•'.repeat(12)}`}</span>
                      </div>
                    )}
                    {ch.dmPolicy && (
                      <div><span className="text-muted-foreground">DM Policy: </span>{ch.dmPolicy}</div>
                    )}
                    {ch.groupPolicy && (
                      <div><span className="text-muted-foreground">Group Policy: </span>{ch.groupPolicy}</div>
                    )}
                    {ch.streaming && (
                      <div><span className="text-muted-foreground">Streaming: </span>{ch.streaming}</div>
                    )}
                    {ch.groups && (
                      <div>
                        <span className="text-muted-foreground">Require Mention: </span>
                        {ch.groups?.['*']?.requireMention ? 'yes (groups)' : 'no'}
                      </div>
                    )}
                    {ch.allowFrom && (
                      <div><span className="text-muted-foreground">Allow From: </span>{Array.isArray(ch.allowFrom) ? ch.allowFrom.join(', ') : String(ch.allowFrom)}</div>
                    )}
                    {ch.groupAllowFrom && (
                      <div><span className="text-muted-foreground">Group Allow: </span>{Array.isArray(ch.groupAllowFrom) ? ch.groupAllowFrom.join(', ') : String(ch.groupAllowFrom)}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </ConfigSection>

          {/* Gateway */}
          <ConfigSection title="Gateway" icon={<Shield size={14} />}>
            <ConfigField label="Mode">
              <span className="text-sm bg-muted rounded px-2 py-1 border inline-block">{gateway.mode || 'local'}</span>
            </ConfigField>
            {gateway.auth && (
              <ConfigField label="Auth">
                <span className="text-xs">
                  Mode: <span className="font-mono bg-muted rounded px-1">{gateway.auth.mode || 'none'}</span>
                  {gateway.auth.token && (
                    <span className="ml-2 text-muted-foreground">Token: {gateway.auth.token.slice(0, 16)}{'•'.repeat(6)}</span>
                  )}
                </span>
              </ConfigField>
            )}
            {gateway.bind && (
              <ConfigField label="Bind">
                <span className="text-sm bg-muted rounded px-2 py-1 border inline-block font-mono">{gateway.bind}</span>
              </ConfigField>
            )}
          </ConfigSection>

          {/* API Keys (from env) */}
          <ConfigSection title="API Keys (env)" icon={<Eye size={14} />}>
            <p className="text-[11px] text-muted-foreground mt-2">
              API keys are loaded from <span className="font-mono">~/.openclaw/.env</span> and set in the environment.
              They are not stored in the config file.
            </p>
            <div className="mt-2 space-y-1.5">
              {['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEEPSEEK_API_KEY'].map(key => (
                <div key={key} className="flex items-center justify-between text-xs py-1 px-2 bg-muted/30 rounded">
                  <span className="font-mono text-muted-foreground">{key}</span>
                  <span className="text-muted-foreground/50">~/.openclaw/.env</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground/60 mt-2">
              Edit <span className="font-mono">~/.openclaw/.env</span> to add/change keys.
              Restart gateway after changes.
            </p>
          </ConfigSection>

          {/* Commands */}
          <ConfigSection title="Commands" icon={<Terminal size={14} />}>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {Object.entries(commands).map(([k, v]) => (
                <div key={k} className="text-xs">
                  <span className="text-muted-foreground">{k}: </span>
                  <span className="font-mono">{String(v)}</span>
                </div>
              ))}
            </div>
          </ConfigSection>

          {/* Disabled Skills (quick reference) */}
          {Object.keys(skills).length > 0 && (
            <ConfigSection title="Skill Overrides" icon={<Zap size={14} />}>
              <div className="mt-2 space-y-1">
                {Object.entries(skills).map(([name, cfg]: [string, any]) => (
                  <div key={name} className="flex items-center justify-between text-xs py-1">
                    <span className="font-mono">{name}</span>
                    <button
                      onClick={() => updateField(['skills', 'entries', name, 'enabled'], !cfg.enabled)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded ${cfg.enabled ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {cfg.enabled ?
                        <><ToggleRight size={14} className="text-green-400" /> enabled</> :
                        <><ToggleLeft size={14} className="text-red-400" /> disabled</>}
                    </button>
                  </div>
                ))}
              </div>
            </ConfigSection>
          )}
        </div>
      )}
    </div>
  );
}


// =============================================================================
// Skills Tab — Card-based UI
// =============================================================================

function SkillsTab({ isConnected }: { isConnected: boolean }) {
  const [skills, setSkills] = useState<any[]>([]);
  const [installSlug, setInstallSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'disabled' | 'bundled' | 'managed'>('all');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchSkills = async () => {
    setLoading(true);
    try {
      const data = await openclawService.getSkills();
      setSkills(data.skills || []);
    } catch (e: any) {
      setMessage({ ok: false, text: e.message });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isConnected) fetchSkills();
  }, [isConnected]);

  const toggleSkill = async (name: string, currentlyDisabled: boolean) => {
    try {
      await openclawService.patchConfig({
        skills: { entries: { [name]: { enabled: !currentlyDisabled } } }
      });
      // Update local state immediately
      setSkills(prev => prev.map(s =>
        s.name === name ? { ...s, disabled: !currentlyDisabled } : s
      ));
      setMessage({ ok: true, text: `${name} ${!currentlyDisabled ? 'disabled' : 'enabled'}` });
      setTimeout(() => setMessage(null), 2000);
    } catch (e: any) {
      setMessage({ ok: false, text: e.message });
    }
  };

  const installSkill = async () => {
    const slug = installSlug.trim();
    if (!slug) return;
    setInstalling(slug);
    try {
      await openclawService.installSkill(slug);
      setMessage({ ok: true, text: `${slug} installed` });
      setInstallSlug('');
      await fetchSkills();
    } catch (e: any) {
      setMessage({ ok: false, text: e.message });
    }
    setInstalling(null);
  };

  if (!isConnected) {
    return (
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        <div className="flex flex-col items-center text-center py-6">
          <Zap size={48} className="text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Skills (плагины)</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Skills расширяют возможности агента. Подключите Gateway чтобы управлять ими.
          </p>
        </div>
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
            </div>
          ))}
        </div>
        <a href="https://clawhub.com" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300">
          <ExternalLink size={12} /> Все скиллы на ClawHub
        </a>
      </div>
    );
  }

  // Filter skills
  const filtered = skills.filter(s => {
    if (filter === 'active') return !s.disabled && (s.eligible || s.always);
    if (filter === 'disabled') return s.disabled;
    if (filter === 'bundled') return s.bundled;
    if (filter === 'managed') return !s.bundled;
    return true;
  });

  const countActive = skills.filter(s => !s.disabled && (s.eligible || s.always)).length;
  const countDisabled = skills.filter(s => s.disabled).length;
  const countBundled = skills.filter(s => s.bundled).length;

  return (
    <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Zap size={14} /> Skills
          <span className="text-xs text-muted-foreground font-normal">({skills.length} total)</span>
        </h3>
        <div className="flex items-center gap-2">
          {message && (
            <span className={`text-xs ${message.ok ? 'text-green-400' : 'text-red-400'}`}>
              {message.ok ? <CheckCircle size={12} className="inline mr-1" /> : <AlertCircle size={12} className="inline mr-1" />}
              {message.text}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={fetchSkills} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Install new skill */}
      <div className="flex gap-2">
        <input
          value={installSlug}
          onChange={e => setInstallSlug(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && installSkill()}
          placeholder="Install skill from ClawHub..."
          className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <Button onClick={installSkill} disabled={!!installing || !installSlug.trim()} className="bg-orange-600 hover:bg-orange-700 text-sm">
          {installing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          <span className="ml-1">Install</span>
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {[
          { key: 'all' as const, label: `All (${skills.length})` },
          { key: 'active' as const, label: `Active (${countActive})` },
          { key: 'disabled' as const, label: `Disabled (${countDisabled})` },
          { key: 'bundled' as const, label: `Bundled (${countBundled})` },
          { key: 'managed' as const, label: `Installed (${skills.length - countBundled})` },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2 py-1 rounded text-xs transition ${
              filter === f.key
                ? 'bg-orange-600/20 text-orange-400 border border-orange-500/30'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Skills grid */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No skills match filter</p>
        ) : (
          filtered.map((skill: any) => {
            const isActive = !skill.disabled && (skill.eligible || skill.always);
            const hasMissing = skill.missing && (
              (skill.missing.bins?.length > 0) ||
              (skill.missing.env?.length > 0) ||
              (skill.missing.anyBins?.length > 0)
            );

            return (
              <div
                key={skill.name}
                className={`rounded-lg border p-3 transition ${
                  skill.disabled
                    ? 'opacity-50 bg-muted/20'
                    : isActive
                      ? 'bg-green-500/5 border-green-500/20'
                      : 'bg-muted/20'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{skill.emoji || '🔌'}</span>
                      <span className="text-sm font-medium truncate">{skill.name}</span>
                      {skill.bundled && (
                        <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">bundled</span>
                      )}
                      {skill.always && (
                        <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">always</span>
                      )}
                      {isActive && !skill.always && (
                        <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">active</span>
                      )}
                    </div>
                    {skill.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{skill.description}</p>
                    )}
                    {hasMissing && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {skill.missing.bins?.map((b: string) => (
                          <span key={b} className="text-[10px] bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded">
                            missing: {b}
                          </span>
                        ))}
                        {skill.missing.env?.map((e: string) => (
                          <span key={e} className="text-[10px] bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded">
                            env: {e}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-1 text-[10px] text-muted-foreground/50">
                      {skill.source}
                    </div>
                  </div>

                  {/* Toggle button */}
                  <button
                    onClick={() => toggleSkill(skill.name, skill.disabled)}
                    className={`flex-shrink-0 mt-0.5 p-1 rounded transition-colors ${
                      skill.disabled
                        ? 'text-muted-foreground hover:text-red-400'
                        : 'text-green-400 hover:text-green-300'
                    }`}
                    title={skill.disabled ? 'Enable skill' : 'Disable skill'}
                  >
                    {skill.disabled ?
                      <ToggleLeft size={22} /> :
                      <ToggleRight size={22} />}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ClawHub link */}
      <div className="text-center pt-2">
        <a href="https://clawhub.com" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300">
          <ExternalLink size={12} /> Browse ClawHub for more skills
        </a>
      </div>
    </div>
  );
}
