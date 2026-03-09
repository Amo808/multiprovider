"""
OpenClaw Gateway Client for Multech
====================================
Connects to OpenClaw Gateway as an operator client.
Provides HTTP webhook API + WebSocket real-time streaming.

Architecture:
  Multech Backend → (HTTP/WS) → OpenClaw Gateway → WhatsApp/Telegram/Discord
  
HTTP Webhooks (primary, always works):
  POST /hooks/agent  - Send task to agent
  POST /hooks/wake   - Wake agent
  
WebSocket (optional, for real-time streaming):
  connect → event:agent (streaming) → real-time tokens
  
Config: Set env vars in backend/.env:
  OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
  OPENCLAW_GATEWAY_TOKEN=your-token
  OPENCLAW_HOOKS_TOKEN=your-hooks-token
"""

import asyncio
import json
import logging
import os
import uuid
import time
from typing import Optional, Dict, Any, List, Callable, AsyncGenerator
from dataclasses import dataclass, field

import aiohttp

logger = logging.getLogger("openclaw_client")


@dataclass
class OpenClawConfig:
    """OpenClaw Gateway connection config"""
    gateway_ws_url: str = ""
    gateway_http_url: str = ""
    gateway_token: str = ""
    hooks_token: str = ""
    hooks_path: str = "/hooks"
    device_id: str = ""
    client_id: str = "multech-operator"
    
    @classmethod
    def from_env(cls) -> "OpenClawConfig":
        ws_url = os.getenv("OPENCLAW_GATEWAY_URL", "ws://127.0.0.1:18789")
        http_url = ws_url.replace("ws://", "http://").replace("wss://", "https://")
        token = os.getenv("OPENCLAW_GATEWAY_TOKEN", "")
        hooks_token = os.getenv("OPENCLAW_HOOKS_TOKEN", token)
        device_id = os.getenv("OPENCLAW_DEVICE_ID", f"multech-{uuid.uuid4().hex[:8]}")
        
        return cls(
            gateway_ws_url=ws_url,
            gateway_http_url=http_url,
            gateway_token=token,
            hooks_token=hooks_token,
            device_id=device_id,
        )


class OpenClawClient:
    """
    Multech's operator client for OpenClaw Gateway.
    
    Supports:
    - HTTP webhooks for sending agent tasks (stateless, reliable)
    - WebSocket for real-time event streaming (streaming agent responses)
    - Config management via webhooks
    - Session/health monitoring
    """
    
    def __init__(self, config: Optional[OpenClawConfig] = None):
        self.config = config or OpenClawConfig.from_env()
        self._http_session: Optional[aiohttp.ClientSession] = None
        self._ws = None
        self._ws_connected = False
        self._ws_task: Optional[asyncio.Task] = None
        self._running = False
        
        # Event handlers: event_name -> [callbacks]
        self._event_handlers: Dict[str, List[Callable]] = {}
        # Pending agent runs: run_id -> accumulated events
        self._agent_runs: Dict[str, Dict[str, Any]] = {}
        # Request futures for WS req/res pattern
        self._request_futures: Dict[str, asyncio.Future] = {}
        
        logger.info(f"[OpenClaw] Client initialized: http={self.config.gateway_http_url}, ws={self.config.gateway_ws_url}")
    
    # =========================================================================
    # HTTP Session Management
    # =========================================================================
    
    async def _get_http(self) -> aiohttp.ClientSession:
        """Get or create HTTP session"""
        if not self._http_session or self._http_session.closed:
            self._http_session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=30)
            )
        return self._http_session
    
    def _auth_headers(self, use_hooks_token: bool = False) -> Dict[str, str]:
        """Get auth headers"""
        token = self.config.hooks_token if use_hooks_token else self.config.gateway_token
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers
    
    # =========================================================================
    # HTTP Webhook API — Primary communication method
    # =========================================================================
    
    async def send_agent_message(
        self,
        message: str,
        session_key: str = "multech:main",
        agent_id: Optional[str] = None,
        deliver: bool = True,
        channel: str = "last",
        model: Optional[str] = None,
        thinking: Optional[str] = None,
        timeout_seconds: int = 120,
        name: str = "Multech",
    ) -> Dict[str, Any]:
        """
        Send a message to OpenClaw agent via webhook.
        
        The agent will process the message and:
        1. Return a response (delivered to channel if deliver=True)
        2. Log it in the session (session_key)
        
        Returns: {"status": 200, "data": {"status": "accepted", ...}}
        """
        session = await self._get_http()
        url = f"{self.config.gateway_http_url}{self.config.hooks_path}/agent"
        
        payload: Dict[str, Any] = {
            "message": message,
            "name": name,
            "sessionKey": session_key,
            "deliver": deliver,
            "channel": channel,
            "timeoutSeconds": timeout_seconds,
        }
        if agent_id:
            payload["agentId"] = agent_id
        if model:
            payload["model"] = model
        if thinking:
            payload["thinking"] = thinking
        
        try:
            async with session.post(url, json=payload, headers=self._auth_headers(use_hooks_token=True)) as resp:
                data = await resp.json()
                logger.info(f"[OpenClaw] Agent message sent: status={resp.status}, session={session_key}")
                return {"status": resp.status, "data": data}
        except aiohttp.ClientError as e:
            logger.error(f"[OpenClaw] Failed to send agent message: {e}")
            return {"status": 0, "error": str(e), "data": None}
    
    async def wake_agent(
        self, 
        text: str = "Wake from Multech", 
        mode: str = "now"
    ) -> Dict[str, Any]:
        """
        Wake the OpenClaw agent with a system event.
        mode: "now" (immediate heartbeat) or "next-heartbeat" (wait for next cycle)
        """
        session = await self._get_http()
        url = f"{self.config.gateway_http_url}{self.config.hooks_path}/wake"
        
        try:
            async with session.post(
                url, 
                json={"text": text, "mode": mode}, 
                headers=self._auth_headers(use_hooks_token=True)
            ) as resp:
                data = await resp.json()
                return {"status": resp.status, "data": data}
        except aiohttp.ClientError as e:
            logger.error(f"[OpenClaw] Failed to wake agent: {e}")
            return {"status": 0, "error": str(e)}
    
    async def send_custom_hook(
        self,
        hook_name: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Send to a custom mapped hook endpoint: POST /hooks/<name>"""
        session = await self._get_http()
        url = f"{self.config.gateway_http_url}{self.config.hooks_path}/{hook_name}"
        
        try:
            async with session.post(url, json=payload, headers=self._auth_headers(use_hooks_token=True)) as resp:
                data = await resp.json()
                return {"status": resp.status, "data": data}
        except aiohttp.ClientError as e:
            return {"status": 0, "error": str(e)}
    
    # =========================================================================
    # Gateway Health & Status
    # =========================================================================
    
    async def get_health(self) -> Dict[str, Any]:
        """Check if OpenClaw Gateway is reachable and healthy"""
        session = await self._get_http()
        try:
            async with session.get(
                f"{self.config.gateway_http_url}/health",
                headers=self._auth_headers(),
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                try:
                    data = await resp.json()
                except Exception:
                    data = {"raw": await resp.text()}
                return {
                    "status": resp.status,
                    "healthy": resp.status == 200,
                    "data": data,
                    "gateway_url": self.config.gateway_http_url,
                    "ws_connected": self._ws_connected,
                }
        except Exception as e:
            return {
                "status": 0,
                "healthy": False,
                "error": str(e),
                "gateway_url": self.config.gateway_http_url,
                "ws_connected": self._ws_connected,
            }
    
    async def get_gateway_status(self) -> Dict[str, Any]:
        """Get detailed gateway status (channels, sessions, agents)"""
        # This uses WebSocket if connected, otherwise returns basic health
        if self._ws_connected:
            return await self._ws_request("status", {})
        return await self.get_health()
    
    # =========================================================================
    # WebSocket — Real-time Event Streaming
    # =========================================================================
    
    async def connect_ws(self) -> bool:
        """
        Connect to Gateway WebSocket for real-time events.
        Returns True if connected successfully.
        """
        try:
            import websockets
        except ImportError:
            logger.warning("[OpenClaw] websockets package not installed — real-time events disabled")
            logger.warning("[OpenClaw] Install with: pip install websockets")
            return False
        
        if self._ws_connected:
            return True
        
        try:
            self._ws = await websockets.connect(
                self.config.gateway_ws_url,
                extra_headers={"Authorization": f"Bearer {self.config.gateway_token}"} if self.config.gateway_token else {},
                ping_interval=30,
                ping_timeout=10,
            )
            
            # Wait for challenge
            challenge_raw = await asyncio.wait_for(self._ws.recv(), timeout=5)
            challenge = json.loads(challenge_raw)
            
            if challenge.get("type") == "event" and challenge.get("event") == "connect.challenge":
                nonce = challenge["payload"]["nonce"]
                logger.info(f"[OpenClaw] WS challenge received, nonce={nonce[:16]}...")
            else:
                nonce = ""
                logger.warning(f"[OpenClaw] Unexpected first frame: {challenge.get('type', 'unknown')}")
            
            # Send connect request
            connect_req = {
                "type": "req",
                "id": str(uuid.uuid4()),
                "method": "connect",
                "params": {
                    "minProtocol": 3,
                    "maxProtocol": 3,
                    "client": {
                        "id": self.config.client_id,
                        "version": "1.0.0",
                        "platform": "linux",
                        "mode": "operator",
                    },
                    "role": "operator",
                    "scopes": ["operator.read", "operator.write"],
                    "caps": [],
                    "commands": [],
                    "permissions": {},
                    "auth": {"token": self.config.gateway_token},
                    "locale": "en-US",
                    "userAgent": "multech/1.0.0",
                    "device": {
                        "id": self.config.device_id,
                        "nonce": nonce,
                    },
                },
            }
            
            await self._ws.send(json.dumps(connect_req))
            
            # Wait for hello-ok
            hello_raw = await asyncio.wait_for(self._ws.recv(), timeout=10)
            hello = json.loads(hello_raw)
            
            if hello.get("ok"):
                self._ws_connected = True
                self._running = True
                # Start event listener
                self._ws_task = asyncio.create_task(self._ws_listener())
                logger.info("[OpenClaw] WS connected as operator ✓")
                return True
            else:
                error = hello.get("error", "Unknown error")
                logger.error(f"[OpenClaw] WS handshake failed: {error}")
                await self._ws.close()
                self._ws = None
                return False
                
        except Exception as e:
            logger.error(f"[OpenClaw] WS connection failed: {e}")
            self._ws = None
            self._ws_connected = False
            return False
    
    async def _ws_listener(self):
        """Listen for WebSocket events from Gateway"""
        try:
            async for raw in self._ws:
                try:
                    msg = json.loads(raw)
                    msg_type = msg.get("type")
                    
                    if msg_type == "event":
                        event_name = msg.get("event", "")
                        payload = msg.get("payload", {})
                        await self._handle_event(event_name, payload, msg)
                    
                    elif msg_type == "res":
                        req_id = msg.get("id")
                        if req_id and req_id in self._request_futures:
                            self._request_futures[req_id].set_result(msg)
                    
                except json.JSONDecodeError:
                    logger.warning(f"[OpenClaw] WS received non-JSON: {raw[:100]}")
                except Exception as e:
                    logger.error(f"[OpenClaw] WS event handling error: {e}")
        
        except Exception as e:
            logger.warning(f"[OpenClaw] WS listener disconnected: {e}")
        finally:
            self._ws_connected = False
            logger.info("[OpenClaw] WS listener stopped")
    
    async def _handle_event(self, event_name: str, payload: Dict, raw_msg: Dict):
        """Dispatch Gateway event to registered handlers"""
        # Log important events
        if event_name == "agent":
            run_id = payload.get("runId", "")
            status = payload.get("status", "")
            if status == "streaming":
                # Accumulate streaming content
                if run_id not in self._agent_runs:
                    self._agent_runs[run_id] = {"content": "", "events": [], "started": time.time()}
                content = payload.get("content", "")
                if content:
                    self._agent_runs[run_id]["content"] += content
                self._agent_runs[run_id]["events"].append(payload)
            elif status in ("completed", "error"):
                logger.info(f"[OpenClaw] Agent run {run_id} {status}")
        
        # Dispatch to registered handlers
        handlers = self._event_handlers.get(event_name, []) + self._event_handlers.get("*", [])
        for handler in handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(event_name, payload, raw_msg)
                else:
                    handler(event_name, payload, raw_msg)
            except Exception as e:
                logger.error(f"[OpenClaw] Event handler error for {event_name}: {e}")
    
    def on_event(self, event_name: str, handler: Callable):
        """Register event handler. Use "*" for all events."""
        if event_name not in self._event_handlers:
            self._event_handlers[event_name] = []
        self._event_handlers[event_name].append(handler)
    
    async def _ws_request(self, method: str, params: Dict) -> Dict:
        """Send a WS request and wait for response"""
        if not self._ws_connected or not self._ws:
            return {"ok": False, "error": "Not connected"}
        
        req_id = str(uuid.uuid4())
        future = asyncio.get_event_loop().create_future()
        self._request_futures[req_id] = future
        
        req = {"type": "req", "id": req_id, "method": method, "params": params}
        
        try:
            await self._ws.send(json.dumps(req))
            result = await asyncio.wait_for(future, timeout=15)
            return result
        except asyncio.TimeoutError:
            return {"ok": False, "error": f"Timeout waiting for {method}"}
        except Exception as e:
            return {"ok": False, "error": str(e)}
        finally:
            self._request_futures.pop(req_id, None)
    
    # =========================================================================
    # Agent Streaming — Stream agent response events via SSE
    # =========================================================================
    
    async def stream_agent_response(
        self,
        message: str,
        session_key: str = "multech:main",
        agent_id: Optional[str] = None,
        model: Optional[str] = None,
        thinking: Optional[str] = None,
        deliver: bool = True,
        channel: str = "last",
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Send message to agent and stream response events.
        
        If WS connected: streams real-time events
        If HTTP only: sends via webhook and polls for result
        
        Yields dicts: {"type": "content|thinking|status|done|error", "data": ...}
        """
        run_id = str(uuid.uuid4())
        
        if self._ws_connected:
            # Real-time WS streaming
            async for event in self._stream_via_ws(message, session_key, agent_id, model, thinking, run_id):
                yield event
        else:
            # HTTP webhook + polling
            async for event in self._stream_via_http(
                message, session_key, agent_id, model, thinking, deliver, channel, run_id
            ):
                yield event
    
    async def _stream_via_ws(
        self, message: str, session_key: str, 
        agent_id: Optional[str], model: Optional[str],
        thinking: Optional[str], run_id: str,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream via WebSocket events"""
        # Queue to receive events for this run
        event_queue: asyncio.Queue = asyncio.Queue()
        
        async def agent_event_handler(event_name, payload, raw_msg):
            if event_name == "agent":
                await event_queue.put(payload)
        
        self.on_event("agent", agent_event_handler)
        
        try:
            # Send agent request
            params: Dict[str, Any] = {
                "message": message,
                "sessionKey": session_key,
            }
            if agent_id:
                params["agentId"] = agent_id
            if model:
                params["model"] = model
            if thinking:
                params["thinking"] = thinking
            
            result = await self._ws_request("agent", params)
            
            if not result.get("ok"):
                yield {"type": "error", "data": result.get("error", "Failed to start agent")}
                return
            
            yield {"type": "status", "data": "Agent started", "run_id": result.get("payload", {}).get("runId", run_id)}
            
            # Stream events
            while True:
                try:
                    payload = await asyncio.wait_for(event_queue.get(), timeout=180)
                    status = payload.get("status", "")
                    
                    if status == "streaming":
                        content = payload.get("content", "")
                        if content:
                            yield {"type": "content", "data": content}
                        # Check for thinking
                        if payload.get("thinking"):
                            yield {"type": "thinking", "data": payload["thinking"]}
                    
                    elif status == "completed":
                        summary = payload.get("summary", "")
                        yield {"type": "done", "data": summary or "Agent completed"}
                        return
                    
                    elif status == "error":
                        yield {"type": "error", "data": payload.get("error", "Agent error")}
                        return
                    
                except asyncio.TimeoutError:
                    yield {"type": "error", "data": "Timeout waiting for agent response"}
                    return
        finally:
            # Remove handler
            if "agent" in self._event_handlers:
                self._event_handlers["agent"] = [
                    h for h in self._event_handlers["agent"] if h is not agent_event_handler
                ]
    
    async def _stream_via_http(
        self, message: str, session_key: str,
        agent_id: Optional[str], model: Optional[str],
        thinking: Optional[str], deliver: bool, channel: str,
        run_id: str,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream via HTTP webhook + polling"""
        yield {"type": "status", "data": "Sending to OpenClaw agent..."}
        
        # Send via webhook
        result = await self.send_agent_message(
            message=message,
            session_key=session_key,
            agent_id=agent_id,
            deliver=deliver,
            channel=channel,
            model=model,
            thinking=thinking,
            timeout_seconds=180,
        )
        
        if result.get("status") != 200:
            yield {"type": "error", "data": f"Webhook failed: {result.get('error', 'Unknown error')}"}
            return
        
        yield {"type": "status", "data": "Agent processing..."}
        
        # Poll for completion (the webhook is async, response goes to channel)
        # We yield a "pending" status so the frontend knows to check later
        yield {
            "type": "pending", 
            "data": "OpenClaw agent is processing. Response will appear in your configured channel (Telegram/WhatsApp/Discord).",
            "session_key": session_key,
        }
        yield {"type": "done", "data": "Task sent to OpenClaw agent"}
    
    # =========================================================================
    # Config Management
    # =========================================================================
    
    async def get_config(self) -> Dict[str, Any]:
        """Get current OpenClaw config (via WS if connected)"""
        if self._ws_connected:
            return await self._ws_request("config.get", {})
        return {"ok": False, "error": "WS not connected — config read requires WebSocket"}
    
    async def patch_config(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        """
        Patch OpenClaw config (partial update).
        Example: patch_config({"channels": {"telegram": {"token": "..."}}})
        """
        if self._ws_connected:
            return await self._ws_request("config.patch", {"patch": patch})
        return {"ok": False, "error": "WS not connected — config patch requires WebSocket"}
    
    async def apply_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Full config replace (dangerous)"""
        if self._ws_connected:
            return await self._ws_request("config.apply", {"config": config})
        return {"ok": False, "error": "WS not connected"}
    
    # =========================================================================
    # Session Management
    # =========================================================================
    
    async def list_sessions(self) -> Dict[str, Any]:
        """List all agent sessions"""
        if self._ws_connected:
            return await self._ws_request("sessions.list", {})
        return {"ok": False, "error": "WS not connected", "sessions": []}
    
    async def get_session_history(
        self, session_key: str, limit: int = 50
    ) -> Dict[str, Any]:
        """Get transcript history for a session"""
        if self._ws_connected:
            return await self._ws_request("chat.history", {"sessionKey": session_key, "limit": limit})
        return {"ok": False, "error": "WS not connected"}
    
    # =========================================================================
    # Skills Management (via exec tool)
    # =========================================================================
    
    async def install_skill(self, skill_slug: str) -> Dict[str, Any]:
        """Install a skill from ClawHub"""
        return await self.send_agent_message(
            message=f"Install the skill '{skill_slug}' from ClawHub using `clawhub install {skill_slug}`. Report the result.",
            session_key="multech:skills",
            name="Multech-Skills",
        )
    
    async def list_skills(self) -> Dict[str, Any]:
        """Ask agent to list installed skills"""
        return await self.send_agent_message(
            message="List all installed skills with their status. Format as a clean list.",
            session_key="multech:skills",
            name="Multech-Skills",
        )
    
    # =========================================================================
    # Lifecycle
    # =========================================================================
    
    async def start(self):
        """Initialize client: try WS connection, fall back to HTTP-only"""
        logger.info("[OpenClaw] Starting client...")
        
        # Try WebSocket first (for real-time streaming)
        ws_ok = await self.connect_ws()
        if ws_ok:
            logger.info("[OpenClaw] ✓ WebSocket connected — real-time streaming enabled")
        else:
            logger.info("[OpenClaw] WebSocket unavailable — using HTTP webhooks only")
        
        # Check HTTP health
        health = await self.get_health()
        if health.get("healthy"):
            logger.info(f"[OpenClaw] ✓ Gateway reachable at {self.config.gateway_http_url}")
        else:
            logger.warning(f"[OpenClaw] ✗ Gateway not reachable: {health.get('error', 'unknown')}")
        
        return health.get("healthy", False) or ws_ok
    
    async def stop(self):
        """Cleanup connections"""
        self._running = False
        
        if self._ws_task:
            self._ws_task.cancel()
            try:
                await self._ws_task
            except asyncio.CancelledError:
                pass
        
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
            self._ws_connected = False
        
        if self._http_session and not self._http_session.closed:
            await self._http_session.close()
        
        logger.info("[OpenClaw] Client stopped")
    
    @property
    def is_available(self) -> bool:
        """Whether the client has any connection method available"""
        return bool(self.config.gateway_http_url and self.config.hooks_token)


# =============================================================================
# Singleton instance
# =============================================================================

_client: Optional[OpenClawClient] = None


def get_openclaw_client() -> OpenClawClient:
    """Get or create the singleton OpenClaw client"""
    global _client
    if _client is None:
        _client = OpenClawClient()
    return _client


async def init_openclaw_client() -> OpenClawClient:
    """Initialize and start the OpenClaw client"""
    client = get_openclaw_client()
    if client.is_available:
        await client.start()
    else:
        logger.info("[OpenClaw] No OPENCLAW_GATEWAY_URL/TOKEN configured — OpenClaw integration disabled")
    return client
