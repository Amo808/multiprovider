"""
OpenClaw Control UI Reverse Proxy
==================================
Proxies /openclaw/* requests to the OpenClaw Gateway's built-in Control UI
running on localhost:18789.

The Control UI provides:
- Settings & configuration
- Skills management
- WebChat interface
- Session management
- Agent management
"""

import asyncio
import logging
import os

import aiohttp
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response

logger = logging.getLogger("openclaw_ui_proxy")

GATEWAY_PORT = os.getenv("OPENCLAW_GATEWAY_PORT", "18789")
GATEWAY_URL = f"http://127.0.0.1:{GATEWAY_PORT}"
GATEWAY_WS = f"ws://127.0.0.1:{GATEWAY_PORT}"
GATEWAY_TOKEN = os.getenv("OPENCLAW_GATEWAY_TOKEN", "")

openclaw_ui_router = APIRouter(tags=["openclaw-ui"])


# =============================================================================
# Helper: proxy HTTP requests to OpenClaw Gateway
# =============================================================================

async def _proxy_http(target_url: str, request: Request, rewrite: bool = False):
    """Generic HTTP reverse proxy to OpenClaw Gateway UI"""
    if request.url.query:
        target_url += f"?{request.url.query}"

    skip_headers = {"host", "connection", "transfer-encoding", "keep-alive", "upgrade"}
    headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in skip_headers
    }
    headers["host"] = f"127.0.0.1:{GATEWAY_PORT}"

    # Pass gateway token for auth if needed
    if GATEWAY_TOKEN:
        headers["x-gateway-token"] = GATEWAY_TOKEN

    body = None
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        body = await request.body()

    try:
        timeout = aiohttp.ClientTimeout(total=60)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.request(
                method=request.method,
                url=target_url,
                headers=headers,
                data=body,
                allow_redirects=False,
            ) as resp:
                resp_headers = {}
                for k, v in resp.headers.items():
                    kl = k.lower()
                    if kl not in ("transfer-encoding", "connection", "content-encoding", "content-length"):
                        resp_headers[k] = v

                content = await resp.read()
                content_type = resp.content_type or ""

                # Rewrite paths in HTML/JS so they work under /openclaw/ prefix
                if rewrite and content and ("text/html" in content_type or "javascript" in content_type):
                    text = content.decode("utf-8", errors="replace")
                    # Rewrite absolute paths to gateway assets
                    text = text.replace('href="/', 'href="/openclaw/')
                    text = text.replace("href='/", "href='/openclaw/")
                    text = text.replace('src="/', 'src="/openclaw/')
                    text = text.replace("src='/", "src='/openclaw/")
                    text = text.replace('action="/', 'action="/openclaw/')
                    # WebSocket paths
                    text = text.replace('"ws://127.0.0.1', '"wss://' + 'multeck.onrender.com/openclaw')
                    text = text.replace('"wss://127.0.0.1', '"wss://' + 'multeck.onrender.com/openclaw')
                    content = text.encode("utf-8")

                return Response(
                    content=content,
                    status_code=resp.status,
                    headers=resp_headers,
                    media_type=resp.content_type,
                )
    except aiohttp.ClientError as e:
        logger.warning(f"[OpenClaw UI] Proxy error: {e}")
        return Response(
            content=f"OpenClaw Gateway UI unavailable: {e}",
            status_code=502,
            media_type="text/plain",
        )


# =============================================================================
# Routes: /openclaw → Gateway Control UI
# =============================================================================

@openclaw_ui_router.get("/openclaw")
async def proxy_openclaw_root(request: Request):
    """Proxy /openclaw → Gateway Control UI root"""
    return await _proxy_http(f"{GATEWAY_URL}/", request, rewrite=True)


@openclaw_ui_router.api_route(
    "/openclaw/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
)
async def proxy_openclaw_path(request: Request, path: str):
    """Proxy /openclaw/* → Gateway Control UI"""
    return await _proxy_http(f"{GATEWAY_URL}/{path}", request, rewrite=True)


# =============================================================================
# OpenClaw UI assets: /openclaw/assets/* → gateway /assets/*
# =============================================================================

@openclaw_ui_router.api_route("/openclaw/assets/{path:path}", methods=["GET"])
async def proxy_openclaw_assets(request: Request, path: str):
    """Proxy OpenClaw UI Vite assets"""
    return await _proxy_http(f"{GATEWAY_URL}/assets/{path}", request)


@openclaw_ui_router.api_route("/openclaw/favicon.svg", methods=["GET"])
async def proxy_openclaw_favicon(request: Request):
    """Proxy OpenClaw UI favicon"""
    return await _proxy_http(f"{GATEWAY_URL}/favicon.svg", request)


# =============================================================================
# WebSocket: /openclaw/ws → Gateway WebSocket
# =============================================================================

@openclaw_ui_router.websocket("/openclaw/ws")
async def proxy_openclaw_ws(ws: WebSocket):
    """Proxy WebSocket to OpenClaw Gateway for Control UI live features"""
    await ws.accept()

    ws_url = f"{GATEWAY_WS}/"
    ws_headers = {}
    if GATEWAY_TOKEN:
        ws_headers["x-gateway-token"] = GATEWAY_TOKEN

    try:
        timeout = aiohttp.ClientTimeout(total=None)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.ws_connect(ws_url, headers=ws_headers) as upstream:

                async def client_to_upstream():
                    try:
                        while True:
                            data = await ws.receive_text()
                            await upstream.send_str(data)
                    except WebSocketDisconnect:
                        await upstream.close()
                    except Exception:
                        pass

                async def upstream_to_client():
                    try:
                        async for msg in upstream:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                await ws.send_text(msg.data)
                            elif msg.type == aiohttp.WSMsgType.BINARY:
                                await ws.send_bytes(msg.data)
                            elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.ERROR):
                                break
                    except Exception:
                        pass

                await asyncio.gather(
                    client_to_upstream(),
                    upstream_to_client(),
                    return_exceptions=True,
                )
    except Exception as e:
        logger.warning(f"[OpenClaw UI] WS proxy error: {e}")
        try:
            await ws.close(code=1011, reason="Gateway unavailable")
        except Exception:
            pass
