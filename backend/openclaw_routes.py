"""
OpenClaw Gateway API Routes for Multech Frontend
==================================================
FastAPI router providing /api/openclaw/* endpoints.

Endpoints:
  GET  /api/openclaw/status          - Gateway health & connection status
  POST /api/openclaw/send            - Send message to OpenClaw agent
  POST /api/openclaw/wake            - Wake agent
  GET  /api/openclaw/stream          - SSE stream for real-time agent events
  POST /api/openclaw/config          - Patch OpenClaw config  
  GET  /api/openclaw/config          - Get OpenClaw config
  GET  /api/openclaw/sessions        - List agent sessions
  GET  /api/openclaw/sessions/{key}  - Get session history
  POST /api/openclaw/skills/install  - Install a skill
  POST /api/openclaw/hook/{name}     - Send to custom hook endpoint
"""

import json
import logging
import asyncio
import os
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from openclaw_client import get_openclaw_client, OpenClawClient
from openclaw_gateway_manager import get_gateway_manager

logger = logging.getLogger("openclaw_routes")

openclaw_router = APIRouter(prefix="/api/openclaw", tags=["openclaw"])


# =============================================================================
# Request/Response Models
# =============================================================================

class OpenClawSendRequest(BaseModel):
    """Send a message to OpenClaw agent"""
    message: str
    session_key: str = "multech:main"
    agent_id: Optional[str] = None
    deliver: bool = True
    channel: str = "last"
    model: Optional[str] = None
    thinking: Optional[str] = None
    timeout_seconds: int = 120


class OpenClawWakeRequest(BaseModel):
    """Wake OpenClaw agent"""
    text: str = "Wake from Multech"
    mode: str = "now"  # "now" or "next-heartbeat"


class OpenClawConfigPatch(BaseModel):
    """Patch OpenClaw configuration"""
    patch: Dict[str, Any]
    base_hash: Optional[str] = None


class OpenClawSkillInstall(BaseModel):
    """Install a skill from ClawHub"""
    slug: str


class OpenClawHookRequest(BaseModel):
    """Send to a custom hook endpoint"""
    payload: Dict[str, Any]


# =============================================================================
# Helper
# =============================================================================

def _get_client() -> OpenClawClient:
    """Get the OpenClaw client singleton"""
    return get_openclaw_client()


# =============================================================================
# Status & Health
# =============================================================================

@openclaw_router.get("/status")
async def openclaw_status():
    """Get OpenClaw Gateway connection status + managed process info"""
    client = _get_client()
    health = await client.get_health()
    
    mgr = get_gateway_manager()
    gw_status = mgr.get_status()
    
    return {
        "configured": client.is_available,
        "gateway_url": client.config.gateway_http_url,
        "ws_url": client.config.gateway_ws_url,
        "ws_connected": client._ws_connected,
        "hooks_configured": bool(client.config.hooks_token),
        "health": health,
        "gateway_process": gw_status,
    }


# =============================================================================
# Send Message to Agent
# =============================================================================

@openclaw_router.post("/reconnect")
async def openclaw_reconnect():
    """Force reconnect WebSocket to Gateway"""
    client = _get_client()
    try:
        ok = await client.reconnect_ws()
        return {"ok": ok, "ws_connected": client._ws_connected}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@openclaw_router.post("/send")
async def openclaw_send(request: OpenClawSendRequest):
    """
    Send a message to OpenClaw agent via webhook.
    The agent will process it and deliver results to configured channels.
    """
    client = _get_client()
    
    if not client.is_available:
        raise HTTPException(status_code=503, detail="OpenClaw not configured")
    
    result = await client.send_agent_message(
        message=request.message,
        session_key=request.session_key,
        agent_id=request.agent_id,
        deliver=request.deliver,
        channel=request.channel,
        model=request.model,
        thinking=request.thinking,
        timeout_seconds=request.timeout_seconds,
    )
    
    if result.get("status") == 0:
        raise HTTPException(status_code=502, detail=f"Gateway unreachable: {result.get('error')}")
    
    return result


# =============================================================================
# Stream Agent Response (SSE)
# =============================================================================

@openclaw_router.post("/stream")
async def openclaw_stream(request: OpenClawSendRequest):
    """
    Send message and stream agent response via SSE.
    If WS connected: real-time streaming.
    If HTTP only: sends webhook and returns status.
    """
    client = _get_client()
    
    if not client.is_available:
        raise HTTPException(status_code=503, detail="OpenClaw not configured")
    
    async def event_generator():
        try:
            async for event in client.stream_agent_response(
                message=request.message,
                session_key=request.session_key,
                agent_id=request.agent_id,
                model=request.model,
                thinking=request.thinking,
                deliver=request.deliver,
                channel=request.channel,
            ):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"
        
        yield f"data: {json.dumps({'type': 'stream_end'})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# =============================================================================
# Chat via OpenClaw (same SSE format as /api/chat/send)
# =============================================================================

class OpenClawChatRequest(BaseModel):
    """Chat request compatible with main chat format"""
    message: str
    session_key: str = "multech:webchat"
    conversation_id: Optional[str] = None


@openclaw_router.post("/chat")
async def openclaw_chat(request: OpenClawChatRequest):
    """
    Send message through OpenClaw agent and stream in ChatResponse SSE format.
    This endpoint mimics /api/chat/send output so the main chat UI can use it.
    """
    client = _get_client()

    if not client.is_available:
        raise HTTPException(status_code=503, detail="OpenClaw not configured")

    import time
    start_time = time.time()

    async def event_generator():
        try:
            yield f"data: {json.dumps({'streaming_ready': True})}\n\n"

            full_content = ""
            last_heartbeat = time.time()

            async for event in client.stream_agent_response(
                message=request.message,
                session_key=request.session_key,
                deliver=False,
                channel="none",
            ):
                evt_type = event.get("type", "")
                evt_data = event.get("data", "")

                if evt_type == "content":
                    full_content += evt_data
                    chunk = {
                        "content": evt_data,
                        "done": False,
                    }
                    if not full_content.strip():
                        chunk["first_content"] = True
                    yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

                elif evt_type == "thinking":
                    yield f"data: {json.dumps({'content': '', 'done': False, 'meta': {'thinking': evt_data, 'reasoning': True}}, ensure_ascii=False)}\n\n"

                elif evt_type == "status":
                    yield f"data: {json.dumps({'content': '', 'done': False, 'stage_message': evt_data}, ensure_ascii=False)}\n\n"

                elif evt_type == "done":
                    elapsed = time.time() - start_time
                    final = {
                        "content": "",
                        "done": True,
                        "meta": {
                            "provider": "openclaw",
                            "model": "openclaw-agent",
                            "tokens_in": 0,
                            "tokens_out": len(full_content.split()),
                            "estimated_cost": 0,
                        },
                    }
                    yield f"data: {json.dumps(final, ensure_ascii=False)}\n\n"
                    return

                elif evt_type == "error":
                    yield f"data: {json.dumps({'error': str(evt_data), 'done': True}, ensure_ascii=False)}\n\n"
                    return

                # Heartbeats every 10s
                now = time.time()
                if now - last_heartbeat > 10:
                    yield f"data: {json.dumps({'heartbeat': 'ping', 'ping': True})}\n\n"
                    last_heartbeat = now

            # If stream ends without explicit done
            if full_content:
                final = {
                    "content": "",
                    "done": True,
                    "meta": {
                        "provider": "openclaw",
                        "model": "openclaw-agent",
                    },
                }
                yield f"data: {json.dumps(final, ensure_ascii=False)}\n\n"

        except Exception as e:
            logger.error(f"OpenClaw chat error: {e}")
            yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# =============================================================================
# Wake Agent
# =============================================================================

@openclaw_router.post("/wake")
async def openclaw_wake(request: OpenClawWakeRequest):
    """Wake the OpenClaw agent"""
    client = _get_client()
    
    if not client.is_available:
        raise HTTPException(status_code=503, detail="OpenClaw not configured")
    
    return await client.wake_agent(text=request.text, mode=request.mode)


# =============================================================================
# Config Management
# =============================================================================

@openclaw_router.get("/config")
async def openclaw_get_config():
    """Get current OpenClaw configuration (requires WS connection)"""
    client = _get_client()
    result = await client.get_config()
    
    if not result.get("ok"):
        raise HTTPException(
            status_code=503, 
            detail=result.get("error", "Cannot read config — WS not connected")
        )
    
    return result


@openclaw_router.post("/config")
async def openclaw_patch_config(request: OpenClawConfigPatch):
    """
    Patch OpenClaw configuration (partial update).
    
    Example patches:
    - Add Telegram: {"channels": {"telegram": {"token": "BOT_TOKEN"}}}
    - Enable hooks: {"hooks": {"enabled": true, "token": "secret"}}
    - Set model: {"agents": {"defaults": {"model": "anthropic/claude-sonnet-4-20250514"}}}
    """
    client = _get_client()
    result = await client.patch_config(request.patch, base_hash=request.base_hash)
    
    if not result.get("ok"):
        err = result.get("error", "Cannot patch config")
        if isinstance(err, dict):
            err = err.get("message") or err.get("detail") or json.dumps(err)
        raise HTTPException(status_code=503, detail=str(err))
    
    return result


# =============================================================================
# Sessions
# =============================================================================

@openclaw_router.get("/sessions")
async def openclaw_sessions():
    """List OpenClaw agent sessions"""
    client = _get_client()
    return await client.list_sessions()


@openclaw_router.get("/sessions/{session_key:path}")
async def openclaw_session_history(session_key: str, limit: int = 50):
    """Get transcript history for a specific session"""
    client = _get_client()
    return await client.get_session_history(session_key, limit=limit)


# =============================================================================
# Skills
# =============================================================================

@openclaw_router.post("/skills/install")
async def openclaw_install_skill(request: OpenClawSkillInstall):
    """Install a skill from ClawHub"""
    client = _get_client()
    
    if not client.is_available:
        raise HTTPException(status_code=503, detail="OpenClaw not configured")
    
    return await client.install_skill(request.slug)


@openclaw_router.get("/skills")
async def openclaw_list_skills():
    """List installed skills"""
    client = _get_client()
    
    if not client.is_available:
        raise HTTPException(status_code=503, detail="OpenClaw not configured")
    
    return await client.list_skills()


# =============================================================================
# Custom Hooks
# =============================================================================

@openclaw_router.post("/hook/{hook_name}")
async def openclaw_custom_hook(hook_name: str, request: OpenClawHookRequest):
    """Send to a custom mapped hook endpoint"""
    client = _get_client()
    
    if not client.is_available:
        raise HTTPException(status_code=503, detail="OpenClaw not configured")
    
    return await client.send_custom_hook(hook_name, request.payload)


# =============================================================================
# Gateway Process Management (auto-start / stop / restart)
# =============================================================================

@openclaw_router.get("/gateway")
async def openclaw_gateway_status():
    """Get managed gateway process status"""
    mgr = get_gateway_manager()
    return mgr.get_status()


@openclaw_router.post("/gateway/start")
async def openclaw_gateway_start():
    """Start the OpenClaw Gateway subprocess"""
    mgr = get_gateway_manager()
    result = await mgr.start()
    
    # After gateway starts, re-init the client to connect
    if result.get("ok"):
        try:
            from openclaw_client import init_openclaw_client
            await init_openclaw_client()
        except Exception:
            pass
    
    return result


@openclaw_router.post("/gateway/stop")
async def openclaw_gateway_stop():
    """Stop the OpenClaw Gateway subprocess"""
    mgr = get_gateway_manager()
    return await mgr.stop()


@openclaw_router.post("/gateway/restart")
async def openclaw_gateway_restart():
    """Restart the OpenClaw Gateway"""
    mgr = get_gateway_manager()
    result = await mgr.restart()
    
    # Re-init client after restart
    if result.get("ok"):
        try:
            from openclaw_client import init_openclaw_client
            await init_openclaw_client()
        except Exception:
            pass
    
    return result


@openclaw_router.get("/gateway/logs")
async def openclaw_gateway_logs(last: int = 50):
    """Get gateway subprocess logs"""
    mgr = get_gateway_manager()
    return {"logs": mgr.get_logs(last_n=last)}


@openclaw_router.get("/env-keys")
async def openclaw_env_keys():
    """Check which API keys are configured in OpenClaw's ~/.openclaw/.env.
    Reads the actual file (not process env) to show what the gateway uses."""
    keys_to_check = [
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "GOOGLE_API_KEY",
        "DEEPSEEK_API_KEY",
        "GEMINI_API_KEY",
        "TELEGRAM_BOT_TOKEN",
        "DISCORD_BOT_TOKEN",
        "SLACK_BOT_TOKEN",
    ]

    # Parse ~/.openclaw/.env file (the gateway's actual env)
    env_file = os.path.join(os.path.expanduser("~"), ".openclaw", ".env")
    file_vars: dict[str, str] = {}
    if os.path.isfile(env_file):
        try:
            with open(env_file, "r", encoding="utf-8-sig") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        file_vars[k] = v
        except Exception:
            pass

    result = {}
    for key in keys_to_check:
        val = file_vars.get(key, "")
        is_placeholder = val.lower().startswith("your_") or val == "" or val == "changeme"
        result[key] = {
            "set": bool(val) and not is_placeholder,
            "length": len(val) if val else 0,
            "prefix": val[:8] + "..." if len(val) > 12 else ("****" if val else ""),
            "source": "openclaw .env" if val else "not set",
        }

    return {
        "keys": result,
        "env_file": env_file,
        "env_file_exists": os.path.isfile(env_file),
        "env_file_keys": list(file_vars.keys()),
    }
