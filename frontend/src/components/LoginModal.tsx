import React, { useEffect } from 'react';
import { Lock } from 'lucide-react';

declare global {
  interface Window { 
    google?: any; 
    _gisInitialized?: boolean;
  }
}

interface LoginModalProps {
  isOpen: boolean;
  onClose?: () => void; // optional
  error?: string;
  onGoogleCredential: (resp: any) => void;
}

const GOOGLE_CLIENT_ID: string | undefined = (window as any).__GOOGLE_CLIENT_ID__ || (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;

export const LoginModal: React.FC<LoginModalProps> = ({ 
  isOpen, 
  error,
  onGoogleCredential
}) => {

  useEffect(() => {
    if (!isOpen) return;

    const clientId = GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error('Google Client ID отсутствует (VITE_GOOGLE_CLIENT_ID)');
      return;
    }

    let cancelled = false;

    const initAndRender = () => {
      if (!window.google?.accounts?.id) return false;
      try {
        if (!window._gisInitialized) {
          console.log('[GIS] initialize');
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: onGoogleCredential,
            auto_select: false,
            cancel_on_tap_outside: false,
            ux_mode: 'popup',
            context: 'signin'
          });
          window._gisInitialized = true;
        }
        const btn = document.getElementById('google-signin-button');
        if (btn) {
          btn.innerHTML = '';
          console.log('[GIS] renderButton');
          window.google.accounts.id.renderButton(btn, { 
            theme: 'outline', 
            size: 'large',
            type: 'standard',
            text: 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left'
          });
        } else {
          console.warn('[GIS] button container not found');
        }
        // Remove automatic prompt to prevent popup on every reload
        // try { window.google.accounts.id.prompt((n: any) => { console.log('[GIS] prompt notification', n); }); } catch {}
        return true;
      } catch (err) {
        console.warn('Ошибка инициализации/рендера Google кнопки:', err);
        return false;
      }
    };

    if (!initAndRender()) {
      let attempts = 0;
      const interval = setInterval(() => {
        if (cancelled) { clearInterval(interval); return; }
        if (initAndRender() || ++attempts > 50) {
          clearInterval(interval);
          if (attempts > 50) console.error('[GIS] не удалось инициализировать после 50 попыток');
        }
      }, 150);
    }

    return () => { cancelled = true; };
  }, [isOpen, onGoogleCredential]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Sign In
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Use your Google account to continue
              </p>
            </div>
          </div>
         </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4">
            <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
          </div>
        )}

        <div className="space-y-6">
          <div className="flex flex-col items-center justify-center gap-4 min-h-[80px]">
            <div id="google-signin-button" />
          </div>
          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            By continuing you agree to the application's terms of use.
          </p>
        </div>
      </div>
    </div>
  );
};
