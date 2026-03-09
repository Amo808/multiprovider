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
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from openclaw_client import get_openclaw_client, OpenClawClient

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
    """Get OpenClaw Gateway connection status"""
    client = _get_client()
    health = await client.get_health()
    
    return {
        "configured": client.is_available,
        "gateway_url": client.config.gateway_http_url,
        "ws_url": client.config.gateway_ws_url,
        "ws_connected": client._ws_connected,
        "hooks_configured": bool(client.config.hooks_token),
        "health": health,
    }


# =============================================================================
# Send Message to Agent
# =============================================================================

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
    result = await client.patch_config(request.patch)
    
    if not result.get("ok"):
        raise HTTPException(
            status_code=503, 
            detail=result.get("error", "Cannot patch config")
        )
    
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
