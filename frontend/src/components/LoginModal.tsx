import React, { useEffect } from 'react';
import { Lock, X } from 'lucide-react';

declare global {
  interface Window { 
    google?: any; 
    handleGoogleCredential?: (resp: any) => void;
    _gisInitialized?: boolean;
  }
}

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  error?: string;
}

const GOOGLE_CLIENT_ID: string | undefined = (window as any).__GOOGLE_CLIENT_ID__ || (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;

export const LoginModal: React.FC<LoginModalProps> = ({ 
  isOpen, 
  error 
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
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: window.handleGoogleCredential,
            auto_select: false,
            cancel_on_tap_outside: false
          });
          window._gisInitialized = true;
        }
        const btn = document.getElementById('google-signin-button');
        if (btn) {
          btn.innerHTML = '';
          window.google.accounts.id.renderButton(btn, { 
            theme: 'outline', 
            size: 'large',
            type: 'standard',
            text: 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left'
          });
        }
        window.google.accounts.id.prompt();
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
        }
      }, 150);
    }

    return () => { cancelled = true; };
  }, [isOpen]);

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
          {/* Close disabled during mandatory auth flow */}
          {/* <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><X className="w-5 h-5" /></button> */}
        </div>

        {/* Error Display */}
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
