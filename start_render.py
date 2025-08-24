#!/usr/bin/env python3
"""
Render.com startup script - combines backend and frontend in one process
Based on render_server.py architecture
"""

import os
import sys
import time
import subprocess
import threading
import signal
from pathlib import Path

def start_backend():
    """Start FastAPI backend server"""
    backend_dir = Path("/app/backend")
    
    print("🔧 Starting backend server...")
    try:
        # Use python3 directly from the system
        process = subprocess.Popen([
            "/usr/bin/python3", 
            "main.py"
        ], cwd=str(backend_dir))
        
        print(f"✅ Backend started with PID: {process.pid}")
        return process
    except Exception as e:
        print(f"❌ Failed to start backend: {e}")
        return None

def start_nginx():
    """Start nginx server"""
    print("🌐 Starting nginx server...")
    try:
        process = subprocess.Popen([
            "nginx", "-g", "daemon off;"
        ])
        print(f"✅ Nginx started with PID: {process.pid}")
        return process
    except Exception as e:
        print(f"❌ Failed to start nginx: {e}")
        return None

def check_backend_health():
    """Check if backend is responsive"""
    import urllib.request
    try:
        urllib.request.urlopen('http://localhost:8000/health', timeout=5)
        return True
    except:
        return False

def main():
    print("🚀 Starting AI Chat on Render.com")
    print("=" * 50)
    
    # Start backend
    backend_process = start_backend()
    if not backend_process:
        print("❌ Failed to start backend")
        sys.exit(1)
    
    # Wait for backend to initialize
    print("⏳ Waiting for backend to initialize...")
    time.sleep(5)
    
    # Check backend health
    max_retries = 10
    for i in range(max_retries):
        if check_backend_health():
            print("✅ Backend is healthy!")
            break
        print(f"⏳ Backend check {i+1}/{max_retries}...")
        time.sleep(2)
    else:
        print("❌ Backend health check failed")
        backend_process.terminate()
        sys.exit(1)
    
    # Start nginx
    nginx_process = start_nginx()
    if not nginx_process:
        print("❌ Failed to start nginx")
        backend_process.terminate()
        sys.exit(1)
    
    print("🎉 All services started successfully!")
    print(f"   Backend:  http://localhost:8000")
    print(f"   Frontend: http://localhost:10000")
    print(f"   Health:   http://localhost:10000/health")
    
    # Handle shutdown gracefully
    def signal_handler(signum, frame):
        print("\n⏹️  Shutting down services...")
        if nginx_process:
            nginx_process.terminate()
        if backend_process:
            backend_process.terminate()
        if nginx_process:
            nginx_process.wait()
        if backend_process:
            backend_process.wait()
        sys.exit(0)
    
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    # Keep the script running and monitor processes
    try:
        while True:
            # Check if processes are still running
            if backend_process.poll() is not None:
                print("❌ Backend process died, restarting...")
                backend_process = start_backend()
                if not backend_process:
                    break
            
            if nginx_process.poll() is not None:
                print("❌ Nginx process died, restarting...")
                nginx_process = start_nginx()
                if not nginx_process:
                    break
            
            time.sleep(10)  # Check every 10 seconds
            
    except KeyboardInterrupt:
        print("\n⏹️  Received interrupt signal")
    
    # Cleanup
    print("🧹 Cleaning up...")
    if nginx_process:
        nginx_process.terminate()
    if backend_process:
        backend_process.terminate()
    if nginx_process:
        nginx_process.wait()
    if backend_process:
        backend_process.wait()
    print("✅ Shutdown complete")

if __name__ == "__main__":
    main()
