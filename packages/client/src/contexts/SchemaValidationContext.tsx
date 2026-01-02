import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useRef,
} from "react";
import type { ZodError } from "zod";
import { useSchemaValidation } from "../hooks/useSchemaValidation";
import { useToastContext } from "./ToastContext";

interface SchemaValidationContextValue {
  /** Report a validation error for a tool. Shows toast if not ignored and not already shown. */
  reportValidationError: (toolName: string, errors: ZodError) => void;
  /** Check if a tool is in the ignored list */
  isToolIgnored: (toolName: string) => boolean;
  /** Add a tool to the ignored list */
  ignoreToolErrors: (toolName: string) => void;
  /** Clear all ignored tools */
  clearIgnoredTools: () => void;
  /** List of currently ignored tools */
  ignoredTools: string[];
  /** Whether schema validation is enabled */
  enabled: boolean;
}

const SchemaValidationContext =
  createContext<SchemaValidationContextValue | null>(null);

interface SchemaValidationProviderProps {
  children: ReactNode;
}

export function SchemaValidationProvider({
  children,
}: SchemaValidationProviderProps) {
  const { settings, setIgnoredTools } = useSchemaValidation();
  const { showToast } = useToastContext();

  // Track which tools have already shown an error toast this session
  // Using ref to avoid re-renders when updating the set
  const shownErrorsRef = useRef<Set<string>>(new Set());

  const isToolIgnored = useCallback(
    (toolName: string) => {
      return settings.ignoredTools.includes(toolName);
    },
    [settings.ignoredTools],
  );

  const ignoreToolErrors = useCallback(
    (toolName: string) => {
      if (!settings.ignoredTools.includes(toolName)) {
        setIgnoredTools([...settings.ignoredTools, toolName]);
      }
    },
    [settings.ignoredTools, setIgnoredTools],
  );

  const clearIgnoredTools = useCallback(() => {
    setIgnoredTools([]);
  }, [setIgnoredTools]);

  const reportValidationError = useCallback(
    (toolName: string, errors: ZodError) => {
      // Always log to console
      console.error(`Schema validation failed for ${toolName}:`, errors);

      // Don't show toast if validation is disabled
      if (!settings.enabled) return;

      // Don't show toast if tool is ignored
      if (settings.ignoredTools.includes(toolName)) return;

      // Don't show toast if we already showed one for this tool this session
      if (shownErrorsRef.current.has(toolName)) return;

      // Mark as shown
      shownErrorsRef.current.add(toolName);

      // Show toast with ignore action
      showToast(`Schema validation failed for ${toolName}`, "error", {
        label: "Ignore",
        onClick: () => ignoreToolErrors(toolName),
      });
    },
    [settings.enabled, settings.ignoredTools, showToast, ignoreToolErrors],
  );

  const value: SchemaValidationContextValue = {
    reportValidationError,
    isToolIgnored,
    ignoreToolErrors,
    clearIgnoredTools,
    ignoredTools: settings.ignoredTools,
    enabled: settings.enabled,
  };

  return (
    <SchemaValidationContext.Provider value={value}>
      {children}
    </SchemaValidationContext.Provider>
  );
}

/**
 * Hook to access schema validation context.
 * Must be used within a SchemaValidationProvider.
 */
export function useSchemaValidationContext() {
  const context = useContext(SchemaValidationContext);
  if (!context) {
    throw new Error(
      "useSchemaValidationContext must be used within a SchemaValidationProvider",
    );
  }
  return context;
}
