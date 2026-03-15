"""
Agent Town Reverse Proxy
=========================
Proxies /town/* requests to the Agent Town Node.js server running on localhost:3001.
Handles both HTTP and WebSocket connections.

Agent Town is a pixel-art AI agent office interface that connects
to OpenClaw Gateway for agent visualization and interaction.
"""

import asyncio
import logging
from typing import Optional

import aiohttp
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, Response

logger = logging.getLogger("agent_town_proxy")

AGENT_TOWN_URL = "http://127.0.0.1:3001"
AGENT_TOWN_WS = "ws://127.0.0.1:3001"

town_router = APIRouter(tags=["agent-town"])


# =============================================================================
# HTTP Reverse Proxy: /town/* → localhost:3001/*
# =============================================================================

@town_router.api_route("/town/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def proxy_town(request: Request, path: str):
    """Proxy HTTP requests to Agent Town server"""
    target_url = f"{AGENT_TOWN_URL}/{path}"
    
    # Forward query string
    if request.url.query:
        target_url += f"?{request.url.query}"

    # Build headers (skip hop-by-hop headers)
    skip_headers = {"host", "connection", "transfer-encoding", "keep-alive"}
    headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in skip_headers
    }
    headers["host"] = "127.0.0.1:3001"

    # Read body for non-GET requests
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
                # Forward response headers (skip hop-by-hop)
                resp_headers = {}
                for k, v in resp.headers.items():
                    kl = k.lower()
                    if kl not in ("transfer-encoding", "connection", "content-encoding", "content-length"):
                        resp_headers[k] = v

                content = await resp.read()
                content_type = resp.content_type or ""
                
                # For HTML responses, rewrite asset paths from / to /town/
                if "text/html" in content_type:
                    html = content.decode("utf-8", errors="replace")
                    # Rewrite /_next/ → /town/_next/ for all assets
                    html = html.replace('src="/_next/', 'src="/town/_next/')
                    html = html.replace('href="/_next/', 'href="/town/_next/')
                    html = html.replace('"/_next/', '"/town/_next/')
                    # Rewrite /api/ → /town/api/ for API calls
                    html = html.replace('"\/api\/', '"\/town\/api\/')
                    html = html.replace('"/api/', '"/town/api/')
                    # Rewrite /favicon → /town/favicon
                    html = html.replace('href="/favicon', 'href="/town/favicon')
                    content = html.encode("utf-8")
                
                # For JS responses, rewrite asset paths
                if "javascript" in content_type:
                    js = content.decode("utf-8", errors="replace")
                    # Common Next.js patterns
                    js = js.replace('"/_next/', '"/town/_next/')
                    js = js.replace("'/_next/", "'/town/_next/")
                    js = js.replace('"/api/gateway"', '"/town/api/gateway"')
                    js = js.replace("'/api/gateway'", "'/town/api/gateway'")
                    js = js.replace('"/api/', '"/town/api/')
                    content = js.encode("utf-8")
                
                return Response(
                    content=content,
                    status_code=resp.status,
                    headers=resp_headers,
                    media_type=resp.content_type,
                )
    except aiohttp.ClientError as e:
        logger.warning(f"[AgentTown] Proxy error for /{path}: {e}")
        return Response(
            content=f"Agent Town unavailable: {e}",
            status_code=502,
            media_type="text/plain",
        )


# Root /town → redirect or serve index
@town_router.get("/town")
async def proxy_town_root(request: Request):
    """Proxy root /town request"""
    return await proxy_town(request, "")


# =============================================================================
# WebSocket Proxy: /town/api/gateway → localhost:3001/api/gateway
# =============================================================================

@town_router.websocket("/town/api/gateway")
async def proxy_town_ws(ws: WebSocket):
    """Proxy WebSocket connection to Agent Town's gateway proxy"""
    await ws.accept()
    
    target_ws_url = f"{AGENT_TOWN_WS}/api/gateway"
    
    try:
        timeout = aiohttp.ClientTimeout(total=None)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.ws_connect(target_ws_url) as upstream:
                
                async def client_to_upstream():
                    """Forward messages from browser → Agent Town"""
                    try:
                        while True:
                            data = await ws.receive_text()
                            await upstream.send_str(data)
                    except WebSocketDisconnect:
                        await upstream.close()
                    except Exception:
                        pass
                
                async def upstream_to_client():
                    """Forward messages from Agent Town → browser"""
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
                
                # Run both directions concurrently
                await asyncio.gather(
                    client_to_upstream(),
                    upstream_to_client(),
                    return_exceptions=True,
                )
    except Exception as e:
        logger.warning(f"[AgentTown] WebSocket proxy error: {e}")
        try:
            await ws.close(code=1011, reason="Agent Town unavailable")
        except Exception:
            pass


# =============================================================================
# Next.js internal routes: /_next/* → localhost:3001/_next/*
# These are needed for Agent Town's static assets (JS, CSS, images)
# =============================================================================

@town_router.api_route("/town/_next/{path:path}", methods=["GET"])
async def proxy_town_next_assets(request: Request, path: str):
    """Proxy Next.js static assets"""
    target_url = f"{AGENT_TOWN_URL}/_next/{path}"
    if request.url.query:
        target_url += f"?{request.url.query}"

    try:
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(target_url) as resp:
                content = await resp.read()
                resp_headers = {}
                for k, v in resp.headers.items():
                    kl = k.lower()
                    if kl not in ("transfer-encoding", "connection", "content-encoding", "content-length"):
                        resp_headers[k] = v
                
                content_type = resp.content_type or ""
                
                # Rewrite JS chunks to use /town/ prefix for internal routes
                if "javascript" in content_type:
                    js = content.decode("utf-8", errors="replace")
                    js = js.replace('"/_next/', '"/town/_next/')
                    js = js.replace("'/_next/", "'/town/_next/")
                    js = js.replace('"/api/gateway"', '"/town/api/gateway"')
                    js = js.replace("'/api/gateway'", "'/town/api/gateway'")
                    js = js.replace('"/api/', '"/town/api/')
                    content = js.encode("utf-8")
                
                # Cache static assets
                if "/static/" in path:
                    resp_headers["Cache-Control"] = "public, max-age=31536000, immutable"
                return Response(
                    content=content,
                    status_code=resp.status,
                    headers=resp_headers,
                    media_type=resp.content_type,
                )
    except aiohttp.ClientError as e:
        return Response(content=f"Asset unavailable: {e}", status_code=502, media_type="text/plain")
