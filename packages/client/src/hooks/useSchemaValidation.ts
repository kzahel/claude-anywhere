import { useCallback, useState } from "react";

export interface SchemaValidationSettings {
  enabled: boolean;
  ignoredTools: string[];
}

const SCHEMA_VALIDATION_KEY = "claude-anywhere-schema-validation";
const DEFAULT_SETTINGS: SchemaValidationSettings = {
  enabled: false,
  ignoredTools: [],
};

function loadSettings(): SchemaValidationSettings {
  const stored = localStorage.getItem(SCHEMA_VALIDATION_KEY);
  if (!stored) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: SchemaValidationSettings) {
  localStorage.setItem(SCHEMA_VALIDATION_KEY, JSON.stringify(settings));
}

/**
 * Hook to manage schema validation settings.
 * When enabled, tool results are validated against Zod schemas.
 * Validation failures are logged to console.
 */
export function useSchemaValidation() {
  const [settings, setSettingsState] =
    useState<SchemaValidationSettings>(loadSettings);

  const setEnabled = useCallback((enabled: boolean) => {
    setSettingsState((prev) => {
      const newSettings = { ...prev, enabled };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const setIgnoredTools = useCallback((ignoredTools: string[]) => {
    setSettingsState((prev) => {
      const newSettings = { ...prev, ignoredTools };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  return { settings, setEnabled, setIgnoredTools };
}

/**
 * Get schema validation settings without React state (for non-component code).
 * Use this in renderers to avoid unnecessary re-renders.
 */
export function getSchemaValidationSettings(): SchemaValidationSettings {
  return loadSettings();
}
