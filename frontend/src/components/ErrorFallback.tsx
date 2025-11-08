import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

export const ErrorFallback: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen space-y-4 text-center">
      <AlertTriangle className="w-10 h-10 text-red-600 dark:text-red-400" />
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">UI crashed</h2>
      <p className="max-w-xs text-sm text-gray-600 dark:text-gray-400">An unexpected error occurred. You can try reloading the application.</p>
      <button
        onClick={() => window.location.reload()}
        className="inline-flex items-center space-x-2 px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm"
      >
        <RefreshCw size={16} />
        <span>Reload</span>
      </button>
    </div>
  );
};
