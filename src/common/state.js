// state.js - Shared state between background and listeners modules
import * as Logger from './logger.js';
import { STORAGE_KEYS } from './constants.js';

// Timeout for bulk operations (10 minutes)
const BULK_OP_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
let bulkOpTimeoutId = null;

// Browser status trackers
let isOfflineMode = !navigator.onLine; // Initialize with current status
let lastFocusedWindowId = chrome.windows.WINDOW_ID_NONE;

// Map of window IDs to their active tab IDs
const activeTabsByWindow = new Map();

/**
 * Check if the browser is offline
 * @returns {boolean} Whether the browser is offline
 */
export function isOffline() {
    return isOfflineMode;
}

/**
 * Update and return the offline status
 * @param {boolean} [status] - Optional status to set
 * @returns {boolean} The current offline status
 */
export function updateOfflineStatus(status = null) {
    if (status !== null) {
        isOfflineMode = status;
    } else {
        // Get from navigator
        isOfflineMode = !navigator.onLine;
    }

    // Log status change if it's different from what we last knew
    const wasOffline = isOfflineMode;

    // In MV3 service worker, we can't rely on online/offline events
    // Need to poll the navigator.onLine property regularly
    if (status === null) {
        isOfflineMode = !navigator.onLine;
        if (wasOffline !== isOfflineMode) {
            Logger.log(`Network status changed: ${isOfflineMode ? 'Offline' : 'Online'}`, Logger.LogComponent.BACKGROUND);
        }
    }

    return isOfflineMode;
}

/**
 * Get the ID of the last focused window
 * @returns {number} Window ID
 */
export function getLastFocusedWindow() {
    return lastFocusedWindowId;
}

/**
 * Update the last focused window ID
 * @param {number} windowId - The ID of the window that gained focus
 */
export function updateLastFocusedWindow(windowId) {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
        lastFocusedWindowId = windowId;
    }
}

/**
 * Set the active tab for a window
 * @param {number} windowId - Window ID
 * @param {number} tabId - Tab ID
 */
export function setActiveTabForWindow(windowId, tabId) {
    activeTabsByWindow.set(windowId, tabId);
}

/**
 * Get the active tab for a window
 * @param {number} windowId - Window ID
 * @returns {number|undefined} Tab ID or undefined
 */
export function getActiveTabForWindow(windowId) {
    return activeTabsByWindow.get(windowId);
}

/**
 * Remove tracking data for a window
 * @param {number} windowId - Window ID to remove from tracking
 */
export function removeWindowTracking(windowId) {
    const hadEntry = activeTabsByWindow.has(windowId);
    activeTabsByWindow.delete(windowId);
    if (hadEntry) {
        Logger.detailedLog(`Removed window ${windowId} from activeTabsByWindow tracking`, Logger.LogComponent.BACKGROUND);
    }

    // If this was the last focused window, reset it
    if (lastFocusedWindowId === windowId) {
        lastFocusedWindowId = chrome.windows.WINDOW_ID_NONE;
        Logger.detailedLog(`Reset lastFocusedWindowId because window ${windowId} was removed`, Logger.LogComponent.BACKGROUND);
    }
}

/**
 * Clean up any references to tabs and windows that no longer exist
 * This helps prevent memory leaks from lost events
 */
export async function cleanupStateReferences() {
    try {
        // Get current windows
        const windows = await chrome.windows.getAll();
        const windowIds = new Set(windows.map(w => w.id));

        // Clean up window tracking for windows that no longer exist
        let removedEntries = 0;
        for (const windowId of activeTabsByWindow.keys()) {
            if (!windowIds.has(windowId)) {
                activeTabsByWindow.delete(windowId);
                removedEntries++;
                Logger.detailedLog(`Removed stale window ${windowId} from activeTabsByWindow during cleanup`, Logger.LogComponent.BACKGROUND);
            }
        }

        // Check and update last focused window
        if (lastFocusedWindowId !== chrome.windows.WINDOW_ID_NONE && !windowIds.has(lastFocusedWindowId)) {
            // Reset to NONE if the window no longer exists
            lastFocusedWindowId = chrome.windows.WINDOW_ID_NONE;
            removedEntries++;
            Logger.log(`Reset stale lastFocusedWindowId during cleanup`, Logger.LogComponent.BACKGROUND);
        }

        if (removedEntries > 0) {
            Logger.log(`State cleanup removed ${removedEntries} stale entries`, Logger.LogComponent.BACKGROUND);
        }
    } catch (e) {
        Logger.logError("Error during state cleanup:", e, Logger.LogComponent.BACKGROUND);
    }
}

// ===================== Persisted runtime flags =====================
// Keys for chrome.storage.local to persist long-lived runtime flags.
// Storage keys are now imported from constants.js

/**
 * Get whether a bulk operation is currently marked as running.
 * Returns false when not set.
 */
export async function getBulkOpRunning() {
    try {
        const obj = await chrome.storage.local.get(STORAGE_KEYS.BULK_RUNNING);
        return !!obj[STORAGE_KEYS.BULK_RUNNING];
    } catch (e) {
        Logger.logError('getBulkOpRunning failed', e, Logger.LogComponent.BACKGROUND);
        return false;
    }
}

/**
 * Persist the bulk operation running flag.
 * @param {boolean} value
 */
export async function setBulkOpRunning(value) {
    try {
        // Clear any existing timeout
        if (bulkOpTimeoutId) {
            clearTimeout(bulkOpTimeoutId);
            bulkOpTimeoutId = null;
        }

        await chrome.storage.local.set({ [STORAGE_KEYS.BULK_RUNNING]: !!value });

        // If setting to true, start a timeout to automatically reset after 10 minutes
        if (value) {
            bulkOpTimeoutId = setTimeout(async () => {
                Logger.log('Bulk operation timeout reached (10 minutes), automatically resetting BulkOpRunning to false', Logger.LogComponent.BACKGROUND);
                try {
                    await chrome.storage.local.set({ [STORAGE_KEYS.BULK_RUNNING]: false });
                    bulkOpTimeoutId = null;
                    
                    // Send message to notify UI that bulk operation was reset due to timeout
                    try {
                        await chrome.runtime.sendMessage({ 
                            type: 'MSG_resetBulkOpRunning',
                            reason: 'timeout'
                        });
                    } catch (msgError) {
                        // Ignore message errors (e.g., no listeners)
                        Logger.detailedLog('Could not send bulk op timeout message (no listeners)', Logger.LogComponent.BACKGROUND);
                    }
                } catch (e) {
                    Logger.logError('Failed to reset BulkOpRunning on timeout', e, Logger.LogComponent.BACKGROUND);
                }
            }, BULK_OP_TIMEOUT_MS);
            
            Logger.log(`Bulk operation started with 10-minute timeout`, Logger.LogComponent.BACKGROUND);
        }
    } catch (e) {
        Logger.logError('setBulkOpRunning failed', e, Logger.LogComponent.BACKGROUND);
    }
}

/**
 * Get whether favicon refresh is currently running.
 * Returns false when not set.
 */
export async function getFaviconRefreshRunning() {
    try {
        const obj = await chrome.storage.local.get(STORAGE_KEYS.FAVICON_REFRESH_RUNNING);
        return !!obj[STORAGE_KEYS.FAVICON_REFRESH_RUNNING];
    } catch (e) {
        Logger.logError('getFaviconRefreshRunning failed', e, Logger.LogComponent.BACKGROUND);
        return false;
    }
}

/**
 * Persist the favicon refresh running flag.
 * @param {boolean} value
 */
export async function setFaviconRefreshRunning(value) {
    try {
        await chrome.storage.local.set({ [STORAGE_KEYS.FAVICON_REFRESH_RUNNING]: !!value });
    } catch (e) {
        Logger.logError('setFaviconRefreshRunning failed', e, Logger.LogComponent.BACKGROUND);
    }
}