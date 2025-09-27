import React, { useState } from 'react';
import { Lock, X, Eye, EyeOff } from 'lucide-react';

declare global {
  interface Window { google?: any; handleGoogleCredential?: (resp: any) => void }
}

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (password: string) => void;
  onGoogleLogin?: (token: string) => Promise<void>;
  error?: string;
}

const GOOGLE_CLIENT_ID: string | undefined = (window as any).__GOOGLE_CLIENT_ID__ || (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;

export const LoginModal: React.FC<LoginModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess,
  onGoogleLogin,
  error 
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await onSuccess(password);
      setPassword('');
    } catch (err) {
      // Error handled by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleClick = () => {
    // Trigger Google One Tap or button flow
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
                Access Required
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Sign in with Google to continue
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

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Password Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter access password"
                className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                         placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                required
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Password login is disabled. Use Google sign-in below.
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
            </div>
          )}

          {/* Action Button */}
          <div className="pt-2 space-y-3">
            <button
              type="submit"
              disabled={!password.trim() || isSubmitting}
              className="w-full px-4 py-3 bg-gray-300 dark:bg-gray-600 cursor-not-allowed text-white rounded-lg font-medium"
            >
              Disabled
            </button>
            {onGoogleLogin && (
              <div className="flex flex-col items-center gap-2">
                <div id="g_id_onload" data-client_id={GOOGLE_CLIENT_ID || ''} data-auto_prompt="false" data-callback="handleGoogleCredential" />
                <div className="g_id_signin" data-type="standard" data-shape="rect" data-theme="outline" data-text="signin_with" data-size="large" data-logo_alignment="left" />
                <button
                  type="button"
                  onClick={handleGoogleClick}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
                >
                  <span>Sign in with Google</span>
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
