import React from 'react';
import { Lock, X } from 'lucide-react';

declare global {
  interface Window { google?: any; handleGoogleCredential?: (resp: any) => void }
}

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  error?: string;
}

const GOOGLE_CLIENT_ID: string | undefined = (window as any).__GOOGLE_CLIENT_ID__ || (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;

export const LoginModal: React.FC<LoginModalProps> = ({ 
  isOpen, 
  onClose, 
  error 
}) => {
  const handleGoogleClick = () => {
    if (window.google && (window as any).google.accounts && GOOGLE_CLIENT_ID) {
      (window as any).google.accounts.id.prompt();
    }
  };

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
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4">
            <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
          </div>
        )}

        <div className="space-y-6">
          <div className="flex flex-col items-center gap-4">
            <div id="g_id_onload" data-client_id={GOOGLE_CLIENT_ID || ''} data-auto_prompt="false" data-callback="handleGoogleCredential" />
            <div className="g_id_signin" data-type="standard" data-shape="rect" data-theme="outline" data-text="signin_with" data-size="large" data-logo_alignment="left" />
            <button
              type="button"
              onClick={handleGoogleClick}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              <span>Sign in with Google</span>
            </button>
          </div>
          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            By continuing you agree to the application's terms of use.
          </p>
        </div>
      </div>
    </div>
  );
};
