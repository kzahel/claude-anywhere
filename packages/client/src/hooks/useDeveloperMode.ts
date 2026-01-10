import { useCallback, useSyncExternalStore } from "react";

const DEV_MODE_KEY = "yep-anywhere-developer-mode";

interface DeveloperModeSettings {
  holdModeEnabled: boolean;
  /** Use WebSocket transport instead of fetch/SSE (Phase 2b testing) */
  websocketTransportEnabled: boolean;
}

const DEFAULT_SETTINGS: DeveloperModeSettings = {
  holdModeEnabled: false,
  websocketTransportEnabled: false,
};

function loadSettings(): DeveloperModeSettings {
  // Guard for SSR/test environments where localStorage may not be fully available
  if (
    typeof localStorage === "undefined" ||
    typeof localStorage.getItem !== "function"
  ) {
    return DEFAULT_SETTINGS;
  }
  const stored = localStorage.getItem(DEV_MODE_KEY);
  if (!stored) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: DeveloperModeSettings) {
  // Guard for SSR/test environments where localStorage may not be fully available
  if (
    typeof localStorage === "undefined" ||
    typeof localStorage.setItem !== "function"
  ) {
    return;
  }
  localStorage.setItem(DEV_MODE_KEY, JSON.stringify(settings));
}

// Simple external store for cross-component sync
let currentSettings = loadSettings();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return currentSettings;
}

function updateSettings(newSettings: DeveloperModeSettings) {
  currentSettings = newSettings;
  saveSettings(newSettings);
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Hook to manage developer mode settings.
 * Settings are persisted to localStorage and synced across components.
 */
export function useDeveloperMode() {
  const settings = useSyncExternalStore(subscribe, getSnapshot);

  const setHoldModeEnabled = useCallback((enabled: boolean) => {
    updateSettings({ ...currentSettings, holdModeEnabled: enabled });
  }, []);

  const setWebsocketTransportEnabled = useCallback((enabled: boolean) => {
    updateSettings({ ...currentSettings, websocketTransportEnabled: enabled });
  }, []);

  return {
    holdModeEnabled: settings.holdModeEnabled,
    setHoldModeEnabled,
    websocketTransportEnabled: settings.websocketTransportEnabled,
    setWebsocketTransportEnabled,
  };
}

/**
 * Get the current WebSocket transport setting without React hooks.
 * Used by useConnection to check the setting synchronously.
 */
export function getWebsocketTransportEnabled(): boolean {
  return currentSettings.websocketTransportEnabled;
}
