import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEBOUNCE_MS = 500;

export interface DraftControls {
  /** Clear input state only, keeping localStorage for failure recovery */
  clearInput: () => void;
  /** Clear both input state and localStorage (call on confirmed success) */
  clearDraft: () => void;
  /** Restore from localStorage (call on failure) */
  restoreFromStorage: () => void;
}

/** Save a value to localStorage immediately */
function saveToStorage(key: string, value: string): void {
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // localStorage might be full or unavailable
  }
}

/**
 * Hook for persisting draft text to localStorage with debouncing.
 * Supports failure recovery by keeping localStorage until explicitly cleared.
 *
 * @param key - localStorage key for this draft (e.g., "draft-message-{sessionId}")
 * @returns [value, setValue, controls] - state-like tuple with control functions
 */
export function useDraftPersistence(
  key: string,
): [string, (value: string) => void, DraftControls] {
  const [value, setValueInternal] = useState(() => {
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  });

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef(key);
  // Track pending value so we can flush on unmount/beforeunload
  const pendingValueRef = useRef<string | null>(null);

  // Update keyRef when key changes
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  // Restore from localStorage when key changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      setValueInternal(stored ?? "");
    } catch {
      setValueInternal("");
    }
  }, [key]);

  // Flush pending value to localStorage
  const flushPending = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (pendingValueRef.current !== null) {
      saveToStorage(keyRef.current, pendingValueRef.current);
      pendingValueRef.current = null;
    }
  }, []);

  // Handle beforeunload to save draft before page unload (including HMR)
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushPending();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [flushPending]);

  // Debounced save to localStorage
  const setValue = useCallback((newValue: string) => {
    setValueInternal(newValue);
    pendingValueRef.current = newValue;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      saveToStorage(keyRef.current, newValue);
      pendingValueRef.current = null;
    }, DEBOUNCE_MS);
  }, []);

  // Clear input state only (for optimistic UI on submit)
  const clearInput = useCallback(() => {
    setValueInternal("");
    pendingValueRef.current = null;
    // Cancel pending debounce so we don't overwrite localStorage with ""
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Clear both state and localStorage (for confirmed successful send)
  const clearDraft = useCallback(() => {
    setValueInternal("");
    pendingValueRef.current = null;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    try {
      localStorage.removeItem(keyRef.current);
    } catch {
      // Ignore errors
    }
  }, []);

  // Restore from localStorage (for failure recovery)
  const restoreFromStorage = useCallback(() => {
    try {
      const stored = localStorage.getItem(keyRef.current);
      if (stored) {
        setValueInternal(stored);
      }
    } catch {
      // Ignore errors
    }
  }, []);

  // Flush pending and cleanup on unmount
  useEffect(() => {
    return () => {
      // Flush any pending value before unmount (handles HMR and navigation)
      if (pendingValueRef.current !== null) {
        saveToStorage(keyRef.current, pendingValueRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const controls = useMemo(
    () => ({ clearInput, clearDraft, restoreFromStorage }),
    [clearInput, clearDraft, restoreFromStorage],
  );

  return [value, setValue, controls];
}
