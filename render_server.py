#!/usr/bin/env python3
"""
Production-like HTTP server that mimics Render architecture
Serves static files and proxies API requests to backend
"""

import http.server
import socketserver
import socket
import os
import urllib.parse
import threading
import subprocess
import time
import sys
from pathlib import Path

class ProductionHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Set the directory to serve files from (frontend/dist)
        frontend_dist = Path(__file__).parent / "frontend" / "dist"
        if not frontend_dist.exists():
            print(f"❌ Frontend dist directory not found: {frontend_dist}")
            print("   Run 'npm run build' in frontend directory first!")
            sys.exit(1)
            
        super().__init__(*args, directory=str(frontend_dist), **kwargs)
    
    def end_headers(self):
        # Add CORS headers and caching
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()
    
    def do_GET(self):
        # Handle API proxy
        if self.path.startswith('/api/'):
            self.proxy_to_backend()
            return
            
        # Handle health check
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'OK')
            return
        
        # Handle SPA routing - serve index.html for non-file routes
        parsed_path = urllib.parse.urlparse(self.path)
        file_path = Path(self.directory) / parsed_path.path.lstrip('/')
        
        # If it's a file request and file doesn't exist, serve index.html
        if not file_path.exists() and not parsed_path.path.endswith('/'):
            # Check if it's not a file extension
            if '.' not in parsed_path.path.split('/')[-1]:
                self.path = '/index.html'
        
        super().do_GET()
    
    def do_POST(self):
        if self.path.startswith('/api/'):
            self.proxy_to_backend()
        else:
            self.send_error(404)
    
    def do_PUT(self):
        if self.path.startswith('/api/'):
            self.proxy_to_backend()
        else:
            self.send_error(404)
    
    def do_DELETE(self):
        if self.path.startswith('/api/'):
            self.proxy_to_backend()
        else:
            self.send_error(404)
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()
    
    def proxy_to_backend(self):
        import http.client
        import json
        
        try:
            # Remove /api from path
            backend_path = self.path[4:]  # Remove '/api'
            
            # Read request body if present
            content_length = int(self.headers.get('Content-Length', 0))
            request_body = self.rfile.read(content_length) if content_length > 0 else None
            
            # Create connection to backend
            conn = http.client.HTTPConnection('localhost', 8000, timeout=60)
            
            # Forward headers
            headers = {}
            for header, value in self.headers.items():
                if header.lower() not in ['host', 'content-length']:
                    headers[header] = value
            
            # Make request to backend
            conn.request(self.command, backend_path, request_body, headers)
            response = conn.getresponse()
            
            # Send response headers
            self.send_response(response.status)
            for header, value in response.getheaders():
                if header.lower() not in ['server', 'date']:
                    self.send_header(header, value)
            self.end_headers()
            
            # Check if this is a streaming response (Server-Sent Events)
            content_type = response.getheader('Content-Type', '').lower()
            if 'text/event-stream' in content_type or 'text/plain' in content_type:
                # Handle streaming response - proper SSE handling
                try:
                    buffer = b""
                    while True:
                        chunk = response.read(1024)
                        if not chunk:
                            break
                        
                        buffer += chunk
                        
                        # Process complete lines
                        while b'\n' in buffer:
                            line, buffer = buffer.split(b'\n', 1)
                            if line:
                                # Send complete line with newline
                                self.wfile.write(line + b'\n')
                                self.wfile.flush()
                    
                    # Send any remaining data
                    if buffer:
                        self.wfile.write(buffer)
                        self.wfile.flush()
                        
                except Exception as e:
                    print(f"Streaming error: {e}")
            else:
                # Handle regular response
                response_data = response.read()
                if response_data:
                    self.wfile.write(response_data)
            
            conn.close()
            
        except ConnectionRefusedError:
            print("Backend connection refused - is the backend server running on port 8000?")
            self.send_error(502, "Backend server not available")
        except Exception as e:
            print(f"Proxy error: {e}")
            self.send_error(502, "Backend connection failed")

def start_backend():
    """Start the backend server in a separate process"""
    root_dir = Path(__file__).parent
    backend_dir = root_dir / "backend"
    backend_main = backend_dir / "main.py"
    
    if not backend_main.exists():
        print(f"❌ Backend main.py not found: {backend_main}")
        return None
    
    try:
        # Set environment for proper module imports
        env = os.environ.copy()
        env['PYTHONPATH'] = str(root_dir)
        
        # Start backend process from root directory for proper imports
        process = subprocess.Popen([
            sys.executable, 
            str(backend_main)
        ], cwd=str(root_dir), env=env)
        
        print(f"🔧 Backend started with PID: {process.pid}")
        print(f"📁 Working directory: {root_dir}")
        print(f"🐍 PYTHONPATH: {env.get('PYTHONPATH')}")
        
        # Wait for backend to start
        print("⏳ Waiting for backend to initialize...")
        time.sleep(5)
        
        return process
    except Exception as e:
        print(f"❌ Failed to start backend: {e}")
        return None

def check_backend_health():
    """Check if backend is responsive"""
    import urllib.request
    try:
        urllib.request.urlopen('http://localhost:8000/health', timeout=5)
        return True
    except:
        return False

if __name__ == "__main__":
    PORT = int(os.environ.get('PORT', 10000))
    
    print("🚀 Starting Production-like AI Chat Server")
    print("=" * 50)
    print(f"📁 Frontend: {Path(__file__).parent / 'frontend' / 'dist'}")
    print(f"🌐 Server: http://localhost:{PORT}")
    print(f"🔗 API Proxy: http://localhost:8000")
    print("=" * 50)
    
    # Check if backend is already running
    if not check_backend_health():
        print("🔧 Backend not detected, starting automatically...")
        backend_process = start_backend()
        
        # Wait and check again
        time.sleep(3)
        if not check_backend_health():
            print("❌ Backend failed to start or respond")
            if backend_process:
                backend_process.terminate()
            sys.exit(1)
    else:
        print("✅ Backend already running and healthy")
        backend_process = None
    
    print("✅ Backend is ready!")
    print(f"🌍 Starting frontend server on port {PORT}...")
    
    # Create server with better streaming support
    class StreamingTCPServer(socketserver.TCPServer):
        allow_reuse_address = True
        
        def __init__(self, server_address, RequestHandlerClass, bind_and_activate=True):
            super().__init__(server_address, RequestHandlerClass, bind_and_activate)
            # Disable Nagle's algorithm for better streaming
            self.socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    
    import socket
    
    try:
        with StreamingTCPServer(("", PORT), ProductionHTTPRequestHandler) as httpd:
            print("🎉 Server is running!")
            print(f"   Frontend: http://localhost:{PORT}")
            print(f"   Health:   http://localhost:{PORT}/health")
            print(f"   API:      http://localhost:{PORT}/api/")
            print("\n🔥 Press Ctrl+C to stop")
            
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\n⏹️  Shutting down...")
                
    except Exception as e:
        print(f"❌ Server failed to start: {e}")
    finally:
        # Clean up backend process
        if backend_process:
            print("🔧 Stopping backend...")
            backend_process.terminate()
            backend_process.wait()
