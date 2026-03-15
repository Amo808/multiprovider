"""
Agent Town Reverse Proxy
=========================
Proxies /town/* requests to the Agent Town Node.js server running on localhost:3001.
Handles both HTTP and WebSocket connections.

Since Agent Town (Next.js) has no basePath support, we:
1. Proxy /town/* → localhost:3001/* with HTML/JS path rewriting
2. Also proxy /_next/* → localhost:3001/_next/* directly (no conflict with Vite frontend)
3. Proxy /town/api/gateway WebSocket for OpenClaw connection
"""

import asyncio
import logging
import re

import aiohttp
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response

logger = logging.getLogger("agent_town_proxy")

AGENT_TOWN_URL = "http://127.0.0.1:3001"
AGENT_TOWN_WS = "ws://127.0.0.1:3001"

town_router = APIRouter(tags=["agent-town"])


# =============================================================================
# Helper: proxy any HTTP request to Agent Town
# =============================================================================

async def _proxy_http(target_url: str, request: Request, rewrite_content: bool = False):
    """Generic HTTP reverse proxy to Agent Town"""
    if request.url.query:
        target_url += f"?{request.url.query}"

    skip_headers = {"host", "connection", "transfer-encoding", "keep-alive", "upgrade"}
    headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in skip_headers
    }
    headers["host"] = "127.0.0.1:3001"

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

                if rewrite_content:
                    content = _rewrite_paths(content, content_type)

                return Response(
                    content=content,
                    status_code=resp.status,
                    headers=resp_headers,
                    media_type=resp.content_type,
                )
    except aiohttp.ClientError as e:
        logger.warning(f"[AgentTown] Proxy error: {e}")
        return Response(content=f"Agent Town unavailable: {e}", status_code=502, media_type="text/plain")


def _rewrite_paths(content: bytes, content_type: str) -> bytes:
    """
    Rewrite asset/API paths in HTML/JS/CSS responses.
    /_next/  → /town/_next/  (for assets loaded via Next.js)
    /api/    → /town/api/    (for API/WS calls)
    /images/ → /town/images/ (Phaser game assets)
    """
    if not content:
        return content

    if "text/html" in content_type or "javascript" in content_type or "text/css" in content_type:
        text = content.decode("utf-8", errors="replace")

        # /_next/ paths (JS chunks, CSS, static assets)
        text = text.replace('"/_next/', '"/town/_next/')
        text = text.replace("'/_next/", "'/town/_next/")
        text = text.replace('(/_next/', '(/town/_next/')
        text = text.replace('`/_next/', '`/town/_next/')

        # /api/ paths (WebSocket gateway, API calls)
        text = text.replace('"/api/gateway"', '"/town/api/gateway"')
        text = text.replace("'/api/gateway'", "'/town/api/gateway'")
        text = text.replace('"/api/', '"/town/api/')
        text = text.replace("'/api/", "'/town/api/")

        # Static asset directories (Phaser sprites, tiles, images)
        # These are proxied at root level (/ui/*, /characters/*, /game/*)
        # so no rewriting needed — they work from both /town/ and root paths

        # /favicon paths
        text = text.replace('"/favicon', '"/town/favicon')

        # Escaped slashes in JSON (common in Next.js inline data)
        text = text.replace('"\\u002f_next\\u002f', '"\\u002ftown\\u002f_next\\u002f')
        text = text.replace('\"\\/api\\/', '\"\\/town\\/api\\/')
        text = text.replace('\"\\/\\_next\\/', '\"\\/town\\/_next\\/')

        content = text.encode("utf-8")

    return content


# =============================================================================
# Main routes: /town and /town/*
# =============================================================================

@town_router.get("/town")
async def proxy_town_root(request: Request):
    """Proxy root /town → Agent Town index"""
    return await _proxy_http(f"{AGENT_TOWN_URL}/", request, rewrite_content=True)


@town_router.api_route("/town/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def proxy_town(request: Request, path: str):
    """Proxy /town/* → Agent Town, rewriting HTML/JS paths"""
    return await _proxy_http(f"{AGENT_TOWN_URL}/{path}", request, rewrite_content=True)


# =============================================================================
# /_next/* → Agent Town's Next.js assets (direct, no /town/ prefix needed)
# This is safe because Multech frontend uses Vite (/assets/), not Next.js.
# Next.js chunk loaders use absolute /_next/ paths that can't all be rewritten.
# =============================================================================

@town_router.api_route("/_next/{path:path}", methods=["GET"])
async def proxy_next_assets(request: Request, path: str):
    """Proxy /_next/* directly to Agent Town for chunk loading"""
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

                # Rewrite JS chunks for /api/ paths
                if "javascript" in content_type:
                    text = content.decode("utf-8", errors="replace")
                    text = text.replace('"/api/gateway"', '"/town/api/gateway"')
                    text = text.replace("'/api/gateway'", "'/town/api/gateway'")
                    text = text.replace('"/api/', '"/town/api/')
                    content = text.encode("utf-8")

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


# =============================================================================
# /town/_next/* → also proxy (for rewritten paths from HTML)
# =============================================================================

@town_router.api_route("/town/_next/{path:path}", methods=["GET"])
async def proxy_town_next_assets(request: Request, path: str):
    """Proxy /town/_next/* → Agent Town /_next/*"""
    return await proxy_next_assets(request, path)


# =============================================================================
# Agent Town static assets: /ui/*, /characters/*, /town/favicon.ico
# These are served from Agent Town's /public/ directory.
# We proxy them directly so Phaser and the UI can load them.
# =============================================================================

@town_router.api_route("/ui/{path:path}", methods=["GET"])
async def proxy_ui_assets(request: Request, path: str):
    """Proxy /ui/* → Agent Town /ui/* (icons, UI elements)"""
    return await _proxy_http(f"{AGENT_TOWN_URL}/ui/{path}", request)


@town_router.api_route("/characters/{path:path}", methods=["GET"])
async def proxy_character_assets(request: Request, path: str):
    """Proxy /characters/* → Agent Town /characters/* (Phaser character sprites)"""
    return await _proxy_http(f"{AGENT_TOWN_URL}/characters/{path}", request)


@town_router.api_route("/game/{path:path}", methods=["GET"])
async def proxy_game_assets(request: Request, path: str):
    """Proxy /game/* → Agent Town /game/* (game maps, tilesets)"""
    return await _proxy_http(f"{AGENT_TOWN_URL}/game/{path}", request)


@town_router.api_route("/town/ui/{path:path}", methods=["GET"])
async def proxy_town_ui_assets(request: Request, path: str):
    """Proxy /town/ui/* → Agent Town /ui/*"""
    return await _proxy_http(f"{AGENT_TOWN_URL}/ui/{path}", request)


@town_router.api_route("/town/characters/{path:path}", methods=["GET"])
async def proxy_town_character_assets(request: Request, path: str):
    """Proxy /town/characters/* → Agent Town /characters/*"""
    return await _proxy_http(f"{AGENT_TOWN_URL}/characters/{path}", request)


@town_router.api_route("/town/game/{path:path}", methods=["GET"])
async def proxy_town_game_assets(request: Request, path: str):
    """Proxy /town/game/* → Agent Town /game/*"""
    return await _proxy_http(f"{AGENT_TOWN_URL}/game/{path}", request)


# Sprites (Phaser sprite sheets)
@town_router.api_route("/sprites/{path:path}", methods=["GET"])
async def proxy_sprites_assets(request: Request, path: str):
    """Proxy /sprites/* → Agent Town /sprites/*"""
    return await _proxy_http(f"{AGENT_TOWN_URL}/sprites/{path}", request)


@town_router.api_route("/town/sprites/{path:path}", methods=["GET"])
async def proxy_town_sprites_assets(request: Request, path: str):
    """Proxy /town/sprites/* → Agent Town /sprites/*"""
    return await _proxy_http(f"{AGENT_TOWN_URL}/sprites/{path}", request)


# Maps (Tiled JSON maps)
@town_router.api_route("/maps/{path:path}", methods=["GET"])
async def proxy_maps_assets(request: Request, path: str):
    """Proxy /maps/* → Agent Town /maps/*"""
    return await _proxy_http(f"{AGENT_TOWN_URL}/maps/{path}", request)


@town_router.api_route("/town/maps/{path:path}", methods=["GET"])
async def proxy_town_maps_assets(request: Request, path: str):
    """Proxy /town/maps/* → Agent Town /maps/*"""
    return await _proxy_http(f"{AGENT_TOWN_URL}/maps/{path}", request)


# Audio (background music)
@town_router.api_route("/audio/{path:path}", methods=["GET"])
async def proxy_audio_assets(request: Request, path: str):
    """Proxy /audio/* → Agent Town /audio/*"""
    return await _proxy_http(f"{AGENT_TOWN_URL}/audio/{path}", request)


@town_router.api_route("/town/audio/{path:path}", methods=["GET"])
async def proxy_town_audio_assets(request: Request, path: str):
    """Proxy /town/audio/* → Agent Town /audio/*"""
    return await _proxy_http(f"{AGENT_TOWN_URL}/audio/{path}", request)


# =============================================================================
# WebSocket: /town/api/gateway → Agent Town WS proxy → OpenClaw gateway
# =============================================================================

@town_router.websocket("/town/api/gateway")
async def proxy_town_ws(ws: WebSocket):
    """Proxy WebSocket to Agent Town's gateway proxy"""
    await ws.accept()
    target_ws_url = f"{AGENT_TOWN_WS}/api/gateway"

    try:
        timeout = aiohttp.ClientTimeout(total=None)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.ws_connect(target_ws_url) as upstream:

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
        logger.warning(f"[AgentTown] WS proxy error: {e}")
        try:
            await ws.close(code=1011, reason="Agent Town unavailable")
        except Exception:
            pass


# Also handle /api/gateway WebSocket at root (Agent Town client may use this)
@town_router.websocket("/api/gateway")
async def proxy_root_ws(ws: WebSocket):
    """Proxy root /api/gateway WebSocket — fallback for Agent Town client code"""
    await proxy_town_ws(ws)
