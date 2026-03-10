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
import hashlib
import json
import logging
import os
import sys
import uuid
import time
import base64
from pathlib import Path
from typing import Optional, Dict, Any, List, Callable, AsyncGenerator
from dataclasses import dataclass, field

import aiohttp

logger = logging.getLogger("openclaw_client")


# =========================================================================
# Ed25519 Device Identity (OpenClaw Gateway auth)
# =========================================================================

def _base64url_encode(data: bytes) -> str:
    """Base64url encode without padding (matches OpenClaw JS/Swift convention)"""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _base64url_decode(s: str) -> bytes:
    """Base64url decode with padding restoration"""
    s = s.replace("-", "+").replace("_", "/")
    padding = 4 - len(s) % 4
    if padding != 4:
        s += "=" * padding
    return base64.b64decode(s)


def _load_or_create_device_identity(identity_path: Optional[str] = None) -> Dict[str, str]:
    """
    Load or generate an Ed25519 keypair for OpenClaw device auth.
    Returns dict with: deviceId, publicKey (base64url of raw 32-byte),
    privateKeyPem, publicKeyPem.
    """
    if identity_path is None:
        state_dir = os.environ.get("OPENCLAW_STATE_DIR", os.path.expanduser("~/.openclaw"))
        identity_path = os.path.join(state_dir, "multech-device-identity.json")

    # Try to load existing identity
    if os.path.isfile(identity_path):
        try:
            with open(identity_path, "r") as f:
                stored = json.load(f)
            if stored.get("version") == 1 and stored.get("deviceId") and stored.get("privateKeyPem"):
                return stored
        except Exception:
            pass

    # Generate new Ed25519 keypair
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.hazmat.primitives.serialization import (
            Encoding, PrivateFormat, PublicFormat, NoEncryption,
        )
    except ImportError:
        logger.warning("[OpenClaw] cryptography package not available; device auth disabled")
        return {}

    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    # Raw 32-byte public key
    raw_public = public_key.public_bytes(Encoding.Raw, PublicFormat.Raw)
    # PEM forms for storage
    private_pem = private_key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()).decode()
    public_pem = public_key.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo).decode()

    # device ID = SHA-256 hex of raw public key (matches OpenClaw convention)
    device_id = hashlib.sha256(raw_public).hexdigest()
    public_key_b64url = _base64url_encode(raw_public)

    identity = {
        "version": 1,
        "deviceId": device_id,
        "publicKey": public_key_b64url,
        "privateKeyPem": private_pem,
        "publicKeyPem": public_pem,
        "createdAtMs": int(time.time() * 1000),
    }

    # Persist
    try:
        os.makedirs(os.path.dirname(identity_path), exist_ok=True)
        with open(identity_path, "w") as f:
            json.dump(identity, f, indent=2)
        logger.info(f"[OpenClaw] Created device identity: {device_id[:16]}...")
    except Exception as e:
        logger.warning(f"[OpenClaw] Could not persist device identity: {e}")

    return identity


def _sign_device_payload(private_key_pem: str, payload: str) -> str:
    """Sign a payload string with Ed25519 private key, return base64url signature"""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import load_pem_private_key
    key = load_pem_private_key(private_key_pem.encode(), password=None)
    signature = key.sign(payload.encode("utf-8"))
    return _base64url_encode(signature)


def _build_device_auth_payload_v3(
    device_id: str, client_id: str, client_mode: str, role: str,
    scopes: List[str], signed_at_ms: int, token: str, nonce: str,
    platform: str = "", device_family: str = "",
) -> str:
    """Build the v3 canonical payload string that gets signed (matches OpenClaw TS/Swift/Kotlin)"""
    scopes_str = ",".join(scopes)
    # Normalize metadata fields: trim + ASCII lowercase
    platform_norm = platform.strip().lower() if platform else ""
    device_family_norm = device_family.strip().lower() if device_family else ""
    return "|".join([
        "v3", device_id, client_id, client_mode, role, scopes_str,
        str(signed_at_ms), token, nonce, platform_norm, device_family_norm,
    ])


@dataclass
class OpenClawConfig:
    """OpenClaw Gateway connection config"""
    gateway_ws_url: str = ""
    gateway_http_url: str = ""
    gateway_token: str = ""
    hooks_token: str = ""
    hooks_path: str = "/hooks"
    device_id: str = ""
    client_id: str = "cli"  # must match GATEWAY_CLIENT_IDS constant
    client_mode: str = "cli"  # must match GATEWAY_CLIENT_MODES constant
    device_identity: Dict[str, str] = field(default_factory=dict)
    
    @classmethod
    def from_env(cls) -> "OpenClawConfig":
        ws_url = os.getenv("OPENCLAW_GATEWAY_URL", "ws://127.0.0.1:18789")
        http_url = ws_url.replace("ws://", "http://").replace("wss://", "https://")
        token = os.getenv("OPENCLAW_GATEWAY_TOKEN", "")
        
        # Auto-detect token from OpenClaw config if not set via env
        if not token:
            token = cls._read_token_from_openclaw_config()
        
        hooks_token = os.getenv("OPENCLAW_HOOKS_TOKEN", token)
        
        # Load or create Ed25519 device identity
        identity = _load_or_create_device_identity()
        device_id = identity.get("deviceId", f"multech-{uuid.uuid4().hex[:8]}")
        
        # Detect platform
        platform = {"win32": "windows", "darwin": "macos", "linux": "linux"}.get(sys.platform, sys.platform)
        
        return cls(
            gateway_ws_url=ws_url,
            gateway_http_url=http_url,
            gateway_token=token,
            hooks_token=hooks_token,
            device_id=device_id,
            device_identity=identity,
        )
    
    @staticmethod
    def _read_token_from_openclaw_config() -> str:
        """Try to read gateway.auth.token from ~/.openclaw/openclaw.json"""
        state_dir = os.environ.get("OPENCLAW_STATE_DIR", os.path.expanduser("~/.openclaw"))
        config_path = os.path.join(state_dir, "openclaw.json")
        try:
            if os.path.isfile(config_path):
                with open(config_path, "r", encoding="utf-8-sig") as f:
                    cfg = json.load(f)
                token = cfg.get("gateway", {}).get("auth", {}).get("token", "")
                if token:
                    logger.info(f"[OpenClaw] Auto-detected gateway token from {config_path}")
                return token or ""
        except Exception:
            pass
        return ""


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
        # Reconnect settings
        self._reconnect_delay = 3  # seconds between reconnect attempts
        self._max_reconnect_delay = 60
        self._reconnect_task: Optional[asyncio.Task] = None
        
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
        if self._ws_connected:
            return True
        
        try:
            # websockets v14+ uses websockets.asyncio.client
            try:
                from websockets.asyncio.client import connect as ws_connect
            except ImportError:
                try:
                    import websockets
                    ws_connect = websockets.connect
                except ImportError:
                    logger.warning("[OpenClaw] websockets package not installed")
                    return False
            
            # Build connection kwargs
            connect_kwargs: Dict[str, Any] = {
                "ping_interval": 30,
                "ping_timeout": 10,
            }
            
            # Add auth header if token configured
            if self.config.gateway_token:
                connect_kwargs["additional_headers"] = {
                    "Authorization": f"Bearer {self.config.gateway_token}"
                }
            
            self._ws = await ws_connect(
                self.config.gateway_ws_url,
                **connect_kwargs,
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
            
            # Build signed device identity
            platform = {"win32": "windows", "darwin": "macos", "linux": "linux"}.get(sys.platform, sys.platform)
            role = "operator"
            scopes = ["operator.read", "operator.write", "operator.admin"]
            signed_at_ms = int(time.time() * 1000)
            
            identity = self.config.device_identity
            if identity.get("privateKeyPem") and nonce:
                payload_str = _build_device_auth_payload_v3(
                    device_id=self.config.device_id,
                    client_id=self.config.client_id,
                    client_mode=self.config.client_mode,
                    role=role,
                    scopes=scopes,
                    signed_at_ms=signed_at_ms,
                    token=self.config.gateway_token or "",
                    nonce=nonce,
                    platform=platform,
                )
                signature = _sign_device_payload(identity["privateKeyPem"], payload_str)
                device_block = {
                    "id": self.config.device_id,
                    "publicKey": identity.get("publicKey", ""),
                    "signature": signature,
                    "signedAt": signed_at_ms,
                    "nonce": nonce,
                }
            else:
                device_block = {
                    "id": self.config.device_id,
                    "nonce": nonce,
                }
            
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
                        "platform": platform,
                        "mode": self.config.client_mode,
                    },
                    "role": role,
                    "scopes": scopes,
                    "caps": [],
                    "auth": {"token": self.config.gateway_token} if self.config.gateway_token else {},
                    "device": device_block,
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
                logger.info("[OpenClaw] WS connected as operator [OK]")
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
            self._ws = None
            logger.info("[OpenClaw] WS listener stopped")
            # Auto-reconnect if still running
            if self._running:
                asyncio.create_task(self._auto_reconnect())
    
    async def _auto_reconnect(self):
        """Auto-reconnect WS with exponential backoff"""
        delay = self._reconnect_delay
        while self._running and not self._ws_connected:
            logger.info(f"[OpenClaw] WS auto-reconnect in {delay}s...")
            await asyncio.sleep(delay)
            if not self._running:
                break
            try:
                ok = await self.connect_ws()
                if ok:
                    logger.info("[OpenClaw] WS auto-reconnect succeeded [OK]")
                    return
            except Exception as e:
                logger.warning(f"[OpenClaw] WS auto-reconnect failed: {e}")
            delay = min(delay * 2, self._max_reconnect_delay)
        logger.info("[OpenClaw] WS auto-reconnect loop ended")

    async def reconnect_ws(self) -> bool:
        """Force reconnect WS (close existing + reconnect)"""
        # Close existing
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
        self._ws_connected = False
        if self._ws_task:
            self._ws_task.cancel()
            try:
                await self._ws_task
            except (asyncio.CancelledError, Exception):
                pass
            self._ws_task = None
        self._running = True
        return await self.connect_ws()

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
            # Try one reconnect before giving up
            logger.info(f"[OpenClaw] WS not connected for {method}, attempting reconnect...")
            ok = await self.connect_ws()
            if not ok:
                return {"ok": False, "error": "WS not connected"}
        
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
        """Stream via WebSocket events.
        
        Gateway broadcasts agent events with format:
          {type: "event", event: "agent", payload: {runId, stream, seq, data}}
        
        Stream types:
          - "assistant": data.text (full), data.delta (incremental)
          - "thinking":  data.text, data.delta
          - "tool":      data.phase (start|update|result), data.name, data.toolCallId
          - "lifecycle":  data.phase (start|end|error)
          - "compaction": compaction events
        """
        event_queue: asyncio.Queue = asyncio.Queue()
        actual_run_id: Optional[str] = None
        
        async def agent_event_handler(event_name, payload, raw_msg):
            # Accept "agent" events; optionally filter by runId
            if event_name == "agent":
                evt_run_id = payload.get("runId", "")
                if actual_run_id and evt_run_id and evt_run_id != actual_run_id:
                    return  # Different run, skip
                await event_queue.put(payload)
        
        self.on_event("agent", agent_event_handler)
        
        try:
            # Send agent request
            params: Dict[str, Any] = {
                "message": message,
                "sessionKey": session_key,
                "idempotencyKey": run_id,
            }
            if agent_id:
                params["agentId"] = agent_id
            if model:
                params["model"] = model
            if thinking:
                params["thinking"] = thinking
            
            result = await self._ws_request("agent", params)
            
            if not result.get("ok"):
                err = result.get("error", "Failed to start agent")
                if isinstance(err, dict):
                    err = err.get("message") or err.get("detail") or json.dumps(err)
                yield {"type": "error", "data": str(err)}
                return
            
            actual_run_id = result.get("payload", {}).get("runId", run_id)
            yield {"type": "status", "data": "Agent started", "run_id": actual_run_id}
            
            # Stream events — Gateway uses {stream, data} format
            last_text = ""
            while True:
                try:
                    payload = await asyncio.wait_for(event_queue.get(), timeout=180)
                    stream = payload.get("stream", "")
                    data = payload.get("data") or {}
                    
                    if stream == "assistant":
                        # Incremental delta or full text
                        delta = data.get("delta", "")
                        text = data.get("text", "")
                        if delta:
                            yield {"type": "content", "data": delta}
                        elif text and text != last_text:
                            new_part = text[len(last_text):]
                            if new_part:
                                yield {"type": "content", "data": new_part}
                        if text:
                            last_text = text
                    
                    elif stream == "thinking":
                        delta = data.get("delta", "")
                        text = data.get("text", "")
                        if delta:
                            yield {"type": "thinking", "data": delta}
                        elif text:
                            yield {"type": "thinking", "data": text}
                    
                    elif stream == "tool":
                        phase = data.get("phase", "")
                        name = data.get("name", "tool")
                        if phase == "start":
                            yield {"type": "status", "data": f"Using tool: {name}"}
                        elif phase == "result":
                            is_error = data.get("isError", False)
                            if is_error:
                                yield {"type": "status", "data": f"Tool {name} failed"}
                            else:
                                yield {"type": "status", "data": f"Tool {name} done"}
                    
                    elif stream == "lifecycle":
                        phase = data.get("phase", "")
                        if phase == "end":
                            yield {"type": "done", "data": last_text or "Agent completed"}
                            return
                        elif phase == "error":
                            yield {"type": "error", "data": data.get("error", "Agent error")}
                            return
                    
                    # Also handle legacy/flat format just in case
                    elif payload.get("state") == "final":
                        msg = payload.get("message", {})
                        if isinstance(msg, dict):
                            parts = msg.get("content", [])
                            final_text = "".join(
                                p.get("text", "") for p in parts if isinstance(p, dict) and p.get("type") == "text"
                            )
                            if final_text and final_text != last_text:
                                new_part = final_text[len(last_text):]
                                if new_part:
                                    yield {"type": "content", "data": new_part}
                        yield {"type": "done", "data": "Agent completed"}
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
    
    async def patch_config(self, patch: Dict[str, Any], base_hash: Optional[str] = None) -> Dict[str, Any]:
        """
        Patch OpenClaw config (partial update via merge-patch).
        Gateway expects: {"raw": "<JSON5 string with only changed keys>", "baseHash": "<hash>"}
        """
        if not self._ws_connected:
            return {"ok": False, "error": "WS not connected — config patch requires WebSocket"}
        
        # Get baseHash from current config if not provided
        if not base_hash:
            config_result = await self.get_config()
            if config_result.get("ok"):
                base_hash = config_result.get("payload", {}).get("hash")
            if not base_hash:
                return {"ok": False, "error": "Cannot get config hash for patch"}
        
        # Gateway expects raw JSON5 string, not an object
        raw = json.dumps(patch, ensure_ascii=False)
        params: Dict[str, Any] = {"raw": raw, "baseHash": base_hash}
        return await self._ws_request("config.patch", params)
    
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
            result = await self._ws_request("sessions.list", {})
            if result.get("ok"):
                payload = result.get("payload", {})
                # Normalize: sessions.list returns payload with sessions array
                sessions = payload.get("sessions", payload.get("entries", []))
                if isinstance(payload, list):
                    sessions = payload
                return {"ok": True, "sessions": sessions}
            return result
        return {"ok": False, "error": "WS not connected", "sessions": []}
    
    async def get_session_history(
        self, session_key: str, limit: int = 50
    ) -> Dict[str, Any]:
        """Get transcript history for a session"""
        if self._ws_connected:
            result = await self._ws_request("sessions.preview", {"key": session_key, "limit": limit})
            if result.get("ok"):
                return {"ok": True, "history": result.get("payload", {})}
            return result
        return {"ok": False, "error": "WS not connected"}
    
    # =========================================================================
    # Skills Management (via exec tool)
    # =========================================================================
    
    async def install_skill(self, skill_slug: str) -> Dict[str, Any]:
        """Install a skill via Gateway WS (skills.install)"""
        if not self._ws_connected:
            return {"ok": False, "error": "WS not connected"}
        
        # First get skills status to find the installId
        status_result = await self._ws_request("skills.status", {})
        if not status_result.get("ok"):
            return {"ok": False, "error": "Cannot fetch skills status"}
        
        skills = status_result.get("payload", {}).get("skills", [])
        target = None
        for s in skills:
            skill_key = s.get("skillKey", s.get("name", ""))
            if skill_key == skill_slug or s.get("name", "") == skill_slug:
                target = s
                break
        
        if not target:
            return {"ok": False, "error": f"Skill '{skill_slug}' not found. Use 'List All' to see available skills."}
        
        install_options = target.get("install", [])
        if not install_options:
            if target.get("eligible"):
                return {"ok": True, "message": f"Skill '{skill_slug}' is already installed and ready."}
            return {"ok": False, "error": f"No install options for '{skill_slug}'"}
        
        install_id = install_options[0].get("id", "")
        result = await self._ws_request("skills.install", {
            "name": target.get("name", skill_slug),
            "installId": install_id,
            "timeoutMs": 120000,
        })
        if result.get("ok"):
            return {"ok": True, "result": result.get("payload", {})}
        err = result.get("error", "Install failed")
        if isinstance(err, dict):
            err = err.get("message") or json.dumps(err)
        return {"ok": False, "error": str(err)}
    
    async def list_skills(self) -> Dict[str, Any]:
        """List skills via Gateway WS (skills.status)"""
        if not self._ws_connected:
            return {"ok": False, "error": "WS not connected"}
        
        result = await self._ws_request("skills.status", {})
        if result.get("ok"):
            payload = result.get("payload", {})
            skills = payload.get("skills", [])
            return {"ok": True, "skills": skills}
        return result
    
    # =========================================================================
    # Lifecycle
    # =========================================================================
    
    async def start(self):
        """Initialize client: try WS connection, fall back to HTTP-only"""
        logger.info("[OpenClaw] Starting client...")
        
        # Try WebSocket first (for real-time streaming)
        ws_ok = await self.connect_ws()
        if ws_ok:
            logger.info("[OpenClaw] [OK] WebSocket connected - real-time streaming enabled")
        else:
            logger.info("[OpenClaw] WebSocket unavailable — using HTTP webhooks only")
        
        # Check HTTP health
        health = await self.get_health()
        if health.get("healthy"):
            logger.info(f"[OpenClaw] [OK] Gateway reachable at {self.config.gateway_http_url}")
        else:
            logger.warning(f"[OpenClaw] [FAIL] Gateway not reachable: {health.get('error', 'unknown')}")
        
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
        """Whether the client has any connection method available.
        Only requires gateway URL — token is optional for local gateways."""
        return bool(self.config.gateway_http_url)


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
    """Initialize and start the OpenClaw client.
    Also checks if gateway manager reports a running process."""
    client = get_openclaw_client()
    
    # Check if gateway manager has a running process
    should_connect = client.is_available
    if not should_connect:
        try:
            from openclaw_gateway_manager import get_gateway_manager
            mgr = get_gateway_manager()
            gw_status = mgr.get_status()
            if gw_status.get("status") in ("running", "starting"):
                should_connect = True
                logger.info("[OpenClaw] Gateway manager reports running — connecting client")
        except Exception:
            pass
    
    if should_connect:
        await client.start()
    else:
        logger.info("[OpenClaw] No gateway available — OpenClaw integration disabled")
    return client
