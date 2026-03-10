"""
OpenClaw Gateway Process Manager
=================================
Auto-starts and manages the OpenClaw Gateway as a child process.
If 'openclaw' CLI is on PATH or npx available — launches gateway automatically.

Lifecycle:
  Backend startup → check CLI → start gateway → health check → connect client
  Backend shutdown → stop gateway subprocess
"""

import asyncio
import logging
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List

import aiohttp

logger = logging.getLogger("openclaw_gateway_manager")


@dataclass
class GatewayProcess:
    """Tracks a running gateway subprocess"""
    process: Optional[subprocess.Popen] = None
    pid: Optional[int] = None
    port: int = 18789
    started_at: float = 0.0
    status: str = "stopped"  # stopped | starting | running | error | not_installed
    error: Optional[str] = None
    cli_path: Optional[str] = None
    method: str = "none"  # openclaw | npx | docker | none
    logs: List[str] = field(default_factory=list)
    max_log_lines: int = 200


class OpenClawGatewayManager:
    """
    Manages the OpenClaw Gateway process.
    Auto-discovers CLI method, starts/stops/restarts the gateway.
    """

    def __init__(self, port: int = 18789, auto_start: bool = True):
        self.port = port
        self.auto_start = auto_start
        self.gateway = GatewayProcess(port=port)
        self._log_task: Optional[asyncio.Task] = None
        self._health_task: Optional[asyncio.Task] = None
        self._restart_count = 0
        self._max_restarts = 3

    # =========================================================================
    # CLI Discovery
    # =========================================================================

    def _find_cli(self) -> tuple[str, str]:
        """
        Find how to run openclaw.
        Returns: (method, command_path)
        - ("openclaw", "/path/to/openclaw") if globally installed
        - ("npx", "npx") if Node ≥18 available
        - ("none", "") if nothing found
        """
        # Check global openclaw
        cli = shutil.which("openclaw")
        if cli:
            logger.info(f"[GatewayMgr] Found openclaw CLI: {cli}")
            return ("openclaw", cli)

        # Check npx (comes with Node.js)
        npx = shutil.which("npx")
        if npx:
            logger.info(f"[GatewayMgr] Found npx: {npx} — will use npx openclaw")
            return ("npx", npx)

        # Check if node exists (maybe npm/npx is in a non-standard path)
        node = shutil.which("node")
        if node:
            node_dir = os.path.dirname(node)
            npx_path = os.path.join(node_dir, "npx.cmd" if sys.platform == "win32" else "npx")
            if os.path.isfile(npx_path):
                return ("npx", npx_path)

        logger.warning("[GatewayMgr] openclaw CLI not found and npx not available")
        return ("none", "")

    # =========================================================================
    # Start / Stop / Restart
    # =========================================================================

    async def start(self) -> Dict[str, Any]:
        """Start the OpenClaw Gateway subprocess"""
        if self.gateway.status == "running" and self.gateway.process:
            if self.gateway.process.poll() is None:
                return {"ok": True, "status": "already_running", "pid": self.gateway.pid}

        # --- Check if gateway is already running externally BEFORE spawning ---
        external = await self._check_external_gateway()
        if external:
            self.gateway.status = "running"
            self.gateway.method = "external"
            self.gateway.error = None
            self._restart_count = 0
            logger.info(f"[GatewayMgr] External gateway detected on port {self.port}, skipping subprocess")
            # Start external health monitor
            if self._health_task:
                self._health_task.cancel()
            self._health_task = asyncio.create_task(self._health_monitor_external())
            return {"ok": True, "status": "external", "message": "Gateway already running externally"}

        method, cli_path = self._find_cli()
        self.gateway.method = method
        self.gateway.cli_path = cli_path

        if method == "none":
            self.gateway.status = "not_installed"
            self.gateway.error = "OpenClaw CLI not found. Install: npm install -g openclaw@latest"
            logger.warning(f"[GatewayMgr] {self.gateway.error}")
            return {
                "ok": False,
                "status": "not_installed",
                "error": self.gateway.error,
                "install_hint": "npm install -g openclaw@latest",
            }

        # Build command
        if method == "openclaw":
            cmd = [cli_path, "gateway", "--port", str(self.port), "--verbose"]
        else:  # npx
            cmd = [cli_path, "openclaw@latest", "gateway", "--port", str(self.port), "--verbose"]

        logger.info(f"[GatewayMgr] Starting gateway: {' '.join(cmd)}")
        self.gateway.status = "starting"
        self.gateway.error = None
        self.gateway.logs = []

        try:
            # Set env — pass through AI API keys from backend env
            env = os.environ.copy()
            for key in [
                "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY",
                "DEEPSEEK_API_KEY", "TELEGRAM_BOT_TOKEN", "DISCORD_BOT_TOKEN",
                "SLACK_BOT_TOKEN", "OPENCLAW_GATEWAY_TOKEN",
            ]:
                val = os.getenv(key)
                if val:
                    env[key] = val

            # Start subprocess
            self.gateway.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                env=env,
                bufsize=1,
                text=True,
                # On Windows, don't inherit console
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            )
            self.gateway.pid = self.gateway.process.pid
            self.gateway.started_at = time.time()
            logger.info(f"[GatewayMgr] Gateway process started (PID {self.gateway.pid})")

            # Start async log reader
            self._log_task = asyncio.create_task(self._read_logs())

            # Wait for gateway to become healthy
            healthy = await self._wait_for_healthy(timeout=30)

            if healthy:
                self.gateway.status = "running"
                self._restart_count = 0
                logger.info(f"[GatewayMgr] [OK] Gateway is healthy on port {self.port}")

                # Start background health monitor
                self._health_task = asyncio.create_task(self._health_monitor())

                return {"ok": True, "status": "running", "pid": self.gateway.pid, "port": self.port}
            else:
                # Process started but not healthy
                if self.gateway.process.poll() is not None:
                    # Process already died
                    self.gateway.status = "error"
                    self.gateway.error = f"Process exited with code {self.gateway.process.returncode}"
                    last_logs = "\n".join(self.gateway.logs[-10:])
                    logger.error(f"[GatewayMgr] Gateway died: {self.gateway.error}\n{last_logs}")
                    return {"ok": False, "status": "error", "error": self.gateway.error, "logs": self.gateway.logs[-10:]}
                else:
                    # Running but not responding to health check yet — give it a chance
                    self.gateway.status = "running"
                    logger.warning("[GatewayMgr] Gateway started but health check timed out — may still be initializing")
                    self._health_task = asyncio.create_task(self._health_monitor())
                    return {"ok": True, "status": "starting", "pid": self.gateway.pid, "port": self.port, "warning": "Health check pending"}

        except FileNotFoundError as e:
            self.gateway.status = "not_installed"
            self.gateway.error = f"Command not found: {cmd[0]}"
            logger.error(f"[GatewayMgr] {self.gateway.error}")
            return {"ok": False, "status": "not_installed", "error": self.gateway.error}

        except Exception as e:
            self.gateway.status = "error"
            self.gateway.error = str(e)
            logger.error(f"[GatewayMgr] Failed to start gateway: {e}")
            return {"ok": False, "status": "error", "error": str(e)}

    async def stop(self) -> Dict[str, Any]:
        """Stop the gateway subprocess"""
        if not self.gateway.process:
            self.gateway.status = "stopped"
            return {"ok": True, "status": "stopped", "message": "No process to stop"}

        pid = self.gateway.pid
        logger.info(f"[GatewayMgr] Stopping gateway (PID {pid})")

        # Cancel background tasks
        if self._health_task:
            self._health_task.cancel()
        if self._log_task:
            self._log_task.cancel()

        try:
            if sys.platform == "win32":
                self.gateway.process.terminate()
            else:
                self.gateway.process.send_signal(signal.SIGTERM)

            try:
                self.gateway.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                logger.warning(f"[GatewayMgr] Gateway didn't stop gracefully, killing PID {pid}")
                self.gateway.process.kill()
                self.gateway.process.wait(timeout=5)

        except Exception as e:
            logger.error(f"[GatewayMgr] Error stopping gateway: {e}")

        self.gateway.process = None
        self.gateway.pid = None
        self.gateway.status = "stopped"
        logger.info("[GatewayMgr] Gateway stopped")
        return {"ok": True, "status": "stopped", "pid": pid}

    async def restart(self) -> Dict[str, Any]:
        """Restart the gateway"""
        logger.info("[GatewayMgr] Restarting gateway...")
        await self.stop()
        await asyncio.sleep(1)
        return await self.start()

    # =========================================================================
    # Health Monitoring
    # =========================================================================

    async def _wait_for_healthy(self, timeout: float = 30) -> bool:
        """Poll health endpoint until gateway responds"""
        start = time.time()
        url = f"http://127.0.0.1:{self.port}/health"
        while time.time() - start < timeout:
            try:
                async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3)) as session:
                    async with session.get(url) as resp:
                        if resp.status == 200:
                            return True
            except Exception:
                pass

            # Check if process died
            if self.gateway.process and self.gateway.process.poll() is not None:
                return False

            await asyncio.sleep(1)
        return False

    async def _health_monitor(self):
        """Background task: check subprocess gateway health, auto-restart on crash"""
        while True:
            try:
                await asyncio.sleep(15)

                if not self.gateway.process:
                    break

                # Check if process still alive
                if self.gateway.process.poll() is not None:
                    exit_code = self.gateway.process.returncode
                    logger.warning(f"[GatewayMgr] Gateway process died (exit code {exit_code})")
                    self.gateway.status = "error"
                    self.gateway.error = f"Process exited with code {exit_code}"
                    self.gateway.process = None
                    self.gateway.pid = None

                    # Before auto-restarting, check if an external gateway appeared
                    external = await self._check_external_gateway()
                    if external:
                        self.gateway.status = "running"
                        self.gateway.method = "external"
                        self.gateway.error = None
                        self._restart_count = 0
                        logger.info("[GatewayMgr] External gateway appeared, switching to external mode")
                        # Switch to external health monitor
                        asyncio.create_task(self._health_monitor_external())
                        break

                    # Auto-restart (with limit)
                    if self._restart_count < self._max_restarts:
                        self._restart_count += 1
                        logger.info(f"[GatewayMgr] Auto-restarting ({self._restart_count}/{self._max_restarts})...")
                        await asyncio.sleep(2)
                        await self.start()
                    else:
                        logger.error("[GatewayMgr] Max restart attempts reached, giving up")
                        self.gateway.status = "error"
                        self.gateway.error = "Gateway crashed repeatedly, manual intervention needed"
                    break

                # Also hit health endpoint
                try:
                    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
                        async with session.get(f"http://127.0.0.1:{self.port}/health") as resp:
                            if resp.status == 200:
                                if self.gateway.status != "running":
                                    self.gateway.status = "running"
                                    self.gateway.error = None
                            else:
                                self.gateway.status = "error"
                                self.gateway.error = f"Health check returned {resp.status}"
                except Exception as e:
                    # Network error but process alive — maybe startup still in progress
                    if self.gateway.status == "running":
                        logger.warning(f"[GatewayMgr] Health check failed: {e}")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[GatewayMgr] Health monitor error: {e}")
                await asyncio.sleep(5)

    async def _health_monitor_external(self):
        """Background task: monitor externally-managed gateway health"""
        consecutive_failures = 0
        max_failures = 4  # ~1 min of failures at 15s interval before marking error
        while True:
            try:
                await asyncio.sleep(15)
                if self.gateway.method != "external":
                    break

                alive = await self._check_external_gateway()
                if alive:
                    consecutive_failures = 0
                    if self.gateway.status != "running":
                        self.gateway.status = "running"
                        self.gateway.error = None
                        logger.info("[GatewayMgr] External gateway recovered")
                else:
                    consecutive_failures += 1
                    if consecutive_failures >= max_failures:
                        self.gateway.status = "error"
                        self.gateway.error = "External gateway unreachable"
                        logger.warning(f"[GatewayMgr] External gateway unreachable for {consecutive_failures * 15}s")
                    else:
                        logger.debug(f"[GatewayMgr] External gateway check failed ({consecutive_failures}/{max_failures})")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[GatewayMgr] External health monitor error: {e}")
                await asyncio.sleep(5)

    async def _read_logs(self):
        """Read subprocess stdout/stderr in background"""
        try:
            loop = asyncio.get_event_loop()
            proc = self.gateway.process
            if not proc or not proc.stdout:
                return

            while True:
                line = await loop.run_in_executor(None, proc.stdout.readline)
                if not line:
                    break

                line = line.rstrip()
                self.gateway.logs.append(line)
                if len(self.gateway.logs) > self.gateway.max_log_lines:
                    self.gateway.logs = self.gateway.logs[-self.gateway.max_log_lines:]

                # Log to our logger too
                logger.debug(f"[Gateway] {line}")

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"[GatewayMgr] Log reader error: {e}")

    # =========================================================================
    # Status
    # =========================================================================

    def get_status(self) -> Dict[str, Any]:
        """Return current gateway manager status"""
        # Double-check if process is alive
        if self.gateway.process and self.gateway.process.poll() is not None:
            if self.gateway.status == "running":
                self.gateway.status = "error"
                self.gateway.error = f"Process exited (code {self.gateway.process.returncode})"

        uptime = 0.0
        if self.gateway.status == "running" and self.gateway.started_at:
            uptime = time.time() - self.gateway.started_at

        return {
            "status": self.gateway.status,
            "method": self.gateway.method,
            "port": self.gateway.port,
            "pid": self.gateway.pid,
            "uptime_seconds": round(uptime, 1),
            "error": self.gateway.error,
            "cli_path": self.gateway.cli_path,
            "restart_count": self._restart_count,
            "log_lines": len(self.gateway.logs),
        }

    def get_logs(self, last_n: int = 50) -> List[str]:
        """Return last N log lines"""
        return self.gateway.logs[-last_n:]

    # =========================================================================
    # Lifecycle (called from main.py lifespan)
    # =========================================================================

    async def initialize(self) -> Dict[str, Any]:
        """
        Called on backend startup.
        Auto-starts gateway if CLI found and auto_start=True.
        """
        if not self.auto_start:
            logger.info("[GatewayMgr] Auto-start disabled")
            return {"ok": True, "status": "disabled"}

        # Check if gateway is already running externally (e.g. docker, or user started it)
        already_running = await self._check_external_gateway()
        if already_running:
            self.gateway.status = "running"
            self.gateway.method = "external"
            logger.info(f"[GatewayMgr] [OK] Found existing gateway on port {self.port}")
            # Start external health monitor
            self._health_task = asyncio.create_task(self._health_monitor_external())
            return {"ok": True, "status": "external", "message": "Gateway already running externally"}

        # Try to auto-start
        result = await self.start()
        return result

    async def _check_external_gateway(self) -> bool:
        """Check if gateway is already running on the port (HTTP health, WS upgrade, or raw TCP)"""
        # 1) Try HTTP /health
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3)) as session:
                async with session.get(f"http://127.0.0.1:{self.port}/health") as resp:
                    if resp.status == 200:
                        logger.debug("[GatewayMgr] External gateway detected via /health")
                        return True
        except Exception:
            pass

        # 2) Try WebSocket upgrade (OpenClaw gateway is primarily a WS server)
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3)) as session:
                async with session.ws_connect(f"ws://127.0.0.1:{self.port}") as ws:
                    await ws.close()
                    logger.debug("[GatewayMgr] External gateway detected via WS connect")
                    return True
        except Exception:
            pass

        # 3) Raw TCP connect — something is listening on the port
        try:
            loop = asyncio.get_event_loop()
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)
            result = await loop.run_in_executor(None, lambda: sock.connect_ex(("127.0.0.1", self.port)))
            sock.close()
            if result == 0:
                logger.debug("[GatewayMgr] External gateway detected via TCP connect")
                return True
        except Exception:
            pass

        return False

    async def shutdown(self):
        """Called on backend shutdown — stop gateway subprocess"""
        if self.gateway.method == "external":
            logger.info("[GatewayMgr] Gateway is external, not stopping")
            return

        await self.stop()


# =============================================================================
# Singleton
# =============================================================================

_manager: Optional[OpenClawGatewayManager] = None


def get_gateway_manager() -> OpenClawGatewayManager:
    """Get or create the gateway manager singleton"""
    global _manager
    if _manager is None:
        port = int(os.getenv("OPENCLAW_GATEWAY_PORT", "18789"))
        auto_start = os.getenv("OPENCLAW_AUTO_START", "true").lower() in ("true", "1", "yes")
        _manager = OpenClawGatewayManager(port=port, auto_start=auto_start)
    return _manager


async def init_gateway_manager() -> OpenClawGatewayManager:
    """Initialize and auto-start the gateway manager"""
    manager = get_gateway_manager()
    result = await manager.initialize()
    logger.info(f"[GatewayMgr] Init result: {result}")
    return manager
