/**
 * Settings Sync - Event-based synchronization between components
 * 
 * Используется для синхронизации настроек между:
 * - UnifiedModelMenu (dropdown с шестерёнками)
 * - ParallelChatInterface (per-model settings popup)
 * - ChatInterface (single mode settings)
 */

import { GenerationConfig } from '../types';

export interface ModelSettingsUpdate {
    provider: string;
    modelId: string;
    settings: Partial<GenerationConfig> & {
        system_prompt?: string;
    };
    source: 'dropdown' | 'parallel-popup' | 'single-chat';
}

// Custom event for settings updates
const SETTINGS_UPDATE_EVENT = 'model-settings-updated';

/**
 * Emit settings update event
 */
export function emitSettingsUpdate(update: ModelSettingsUpdate): void {
    const event = new CustomEvent(SETTINGS_UPDATE_EVENT, {
        detail: update,
        bubbles: true
    });
    window.dispatchEvent(event);
    console.log('[SettingsSync] Emitted update:', update.provider, update.modelId, 'from', update.source);
}

/**
 * Subscribe to settings updates
 */
export function subscribeToSettingsUpdates(
    callback: (update: ModelSettingsUpdate) => void,
    options?: { ignoreSource?: ModelSettingsUpdate['source'] }
): () => void {
    const handler = (event: Event) => {
        const detail = (event as CustomEvent<ModelSettingsUpdate>).detail;
        // Optionally ignore updates from a specific source to prevent loops
        if (options?.ignoreSource && detail.source === options.ignoreSource) {
            return;
        }
        callback(detail);
    };

    window.addEventListener(SETTINGS_UPDATE_EVENT, handler);

    return () => {
        window.removeEventListener(SETTINGS_UPDATE_EVENT, handler);
    };
}

/**
 * Create a model key for caching
 */
export function getModelKey(provider: string, modelId: string): string {
    return `${provider}-${modelId}`;
}

/**
 * Local cache for settings - shared across components
 */
const settingsCache = new Map<string, Partial<GenerationConfig> & { system_prompt?: string }>();

export function getCachedSettings(provider: string, modelId: string): (Partial<GenerationConfig> & { system_prompt?: string }) | undefined {
    return settingsCache.get(getModelKey(provider, modelId));
}

export function setCachedSettings(provider: string, modelId: string, settings: Partial<GenerationConfig> & { system_prompt?: string }): void {
    settingsCache.set(getModelKey(provider, modelId), settings);
}

export function clearCachedSettings(provider: string, modelId: string): void {
    settingsCache.delete(getModelKey(provider, modelId));
}

// Also export an invalidation event for when we need to reload from backend
const SETTINGS_INVALIDATE_EVENT = 'model-settings-invalidated';

export function emitSettingsInvalidation(provider: string, modelId: string): void {
    const event = new CustomEvent(SETTINGS_INVALIDATE_EVENT, {
        detail: { provider, modelId },
        bubbles: true
    });
    window.dispatchEvent(event);
}

export function subscribeToSettingsInvalidation(
    callback: (data: { provider: string; modelId: string }) => void
): () => void {
    const handler = (event: Event) => {
        const detail = (event as CustomEvent<{ provider: string; modelId: string }>).detail;
        callback(detail);
    };

    window.addEventListener(SETTINGS_INVALIDATE_EVENT, handler);

    return () => {
        window.removeEventListener(SETTINGS_INVALIDATE_EVENT, handler);
    };
}
