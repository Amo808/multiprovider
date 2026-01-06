/**
 * Large Storage Utility
 * Uses IndexedDB for large data (prompts > 100KB) with localStorage fallback for small data.
 * This solves Chrome's localStorage quota issues with large system prompts.
 */

const DB_NAME = 'multiprovider-storage';
const STORE_NAME = 'large-data';
const DB_VERSION = 1;

// Threshold for using IndexedDB vs localStorage (100KB)
const LARGE_DATA_THRESHOLD = 100 * 1024;

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error('[LargeStorage] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      resolve(request.result);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
  
  return dbPromise;
}

/**
 * Check if IndexedDB is available
 */
function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Get data from IndexedDB
 */
async function getFromIndexedDB(key: string): Promise<string | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  } catch (error) {
    console.error('[LargeStorage] Failed to get from IndexedDB:', error);
    return null;
  }
}

/**
 * Set data in IndexedDB
 */
async function setInIndexedDB(key: string, value: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('[LargeStorage] Failed to set in IndexedDB:', error);
    throw error;
  }
}

/**
 * Delete data from IndexedDB
 */
async function deleteFromIndexedDB(key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('[LargeStorage] Failed to delete from IndexedDB:', error);
  }
}

/**
 * Get data size in bytes
 */
function getDataSize(data: string): number {
  return new Blob([data]).size;
}

/**
 * Smart storage - uses localStorage for small data, IndexedDB for large data
 */
export const largeStorage = {
  /**
   * Get item from storage (checks both localStorage and IndexedDB)
   */
  async getItem(key: string): Promise<string | null> {
    // First check localStorage
    try {
      const localData = localStorage.getItem(key);
      if (localData) {
        // Check if it's a pointer to IndexedDB
        if (localData === '__INDEXED_DB__') {
          return await getFromIndexedDB(key);
        }
        return localData;
      }
    } catch (error) {
      console.warn('[LargeStorage] localStorage read failed:', error);
    }
    
    // Try IndexedDB directly if localStorage failed
    if (isIndexedDBAvailable()) {
      return await getFromIndexedDB(key);
    }
    
    return null;
  },
  
  /**
   * Set item in storage (auto-selects storage based on size)
   */
  async setItem(key: string, value: string): Promise<void> {
    const size = getDataSize(value);
    
    if (size > LARGE_DATA_THRESHOLD && isIndexedDBAvailable()) {
      // Large data - use IndexedDB
      console.log(`[LargeStorage] Using IndexedDB for ${key} (${(size / 1024).toFixed(1)}KB)`);
      await setInIndexedDB(key, value);
      // Store pointer in localStorage
      try {
        localStorage.setItem(key, '__INDEXED_DB__');
      } catch {
        // localStorage might be full, but IndexedDB has the data
      }
    } else {
      // Small data or IndexedDB unavailable - try localStorage
      try {
        localStorage.setItem(key, value);
        // Remove from IndexedDB if it was there before
        if (isIndexedDBAvailable()) {
          deleteFromIndexedDB(key).catch(() => {});
        }
      } catch (error) {
        // localStorage full - try IndexedDB as fallback
        if (isIndexedDBAvailable()) {
          console.log(`[LargeStorage] localStorage full, using IndexedDB for ${key}`);
          await setInIndexedDB(key, value);
          try {
            localStorage.setItem(key, '__INDEXED_DB__');
          } catch {
            // Can't store pointer, but data is in IndexedDB
          }
        } else {
          throw error;
        }
      }
    }
  },
  
  /**
   * Remove item from both storages
   */
  async removeItem(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch {}
    
    if (isIndexedDBAvailable()) {
      await deleteFromIndexedDB(key);
    }
  },
  
  /**
   * Get JSON item with parsing
   */
  async getJSON<T>(key: string): Promise<T | null> {
    const data = await this.getItem(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  },
  
  /**
   * Set JSON item with stringification
   */
  async setJSON<T>(key: string, value: T): Promise<void> {
    await this.setItem(key, JSON.stringify(value));
  }
};

/**
 * Migrate existing localStorage data to IndexedDB if needed
 * Call this on app startup
 */
export async function migrateToLargeStorage(): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  
  const keysToMigrate: string[] = [];
  
  // Find large items in localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    
    try {
      const value = localStorage.getItem(key);
      if (value && value !== '__INDEXED_DB__' && getDataSize(value) > LARGE_DATA_THRESHOLD) {
        keysToMigrate.push(key);
      }
    } catch {}
  }
  
  // Migrate large items
  for (const key of keysToMigrate) {
    try {
      const value = localStorage.getItem(key);
      if (value) {
        console.log(`[LargeStorage] Migrating ${key} to IndexedDB`);
        await setInIndexedDB(key, value);
        localStorage.setItem(key, '__INDEXED_DB__');
      }
    } catch (error) {
      console.error(`[LargeStorage] Failed to migrate ${key}:`, error);
    }
  }
}

export default largeStorage;
