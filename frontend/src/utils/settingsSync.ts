/**
 * Settings Sync Utility
 * 
 * Provides event-based synchronization for per-model settings
 * between Single and Compare (Dual) modes.
 * 
 * When settings are changed in one mode, this emits an event
 * that other components can listen to and refresh their state.
 */

export type SettingsSyncEvent = {
  provider: string;
  modelId: string;
  settings: Record<string, unknown>;
  source: 'single' | 'compare';
};

type SettingsSyncCallback = (event: SettingsSyncEvent) => void;

class SettingsSyncManager {
  private listeners: Set<SettingsSyncCallback> = new Set();
  
  /**
   * Subscribe to settings sync events
   * @returns unsubscribe function
   */
  subscribe(callback: SettingsSyncCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
  
  /**
   * Emit a settings change event
   * This should be called after saving settings to backend
   */
  emit(event: SettingsSyncEvent): void {
    console.log('[SettingsSync] Emitting event:', {
      provider: event.provider,
      modelId: event.modelId,
      source: event.source,
      settingsKeys: Object.keys(event.settings)
    });
    
    // Notify all listeners
    this.listeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('[SettingsSync] Listener error:', error);
      }
    });
    
    // Also dispatch a custom DOM event for cross-component communication
    window.dispatchEvent(new CustomEvent('settings-sync', { 
      detail: event 
    }));
  }
  
  /**
   * Get the number of active listeners
   */
  getListenerCount(): number {
    return this.listeners.size;
  }
}

// Singleton instance
export const settingsSync = new SettingsSyncManager();

/**
 * Helper hook-style function to create a sync key
 */
export const getSettingsKey = (provider: string, modelId: string): string => {
  return `${provider}-${modelId}`;
};
