import { useCallback, useEffect, useMemo, useState } from "react";

const DRAFT_KEY_PREFIX = "draft-message-";
const NEW_SESSION_DRAFT_KEY_PREFIX = "draft-new-session-";

/**
 * Hook to track which sessions have draft messages in localStorage.
 * Listens for storage events and re-scans when sessions change.
 */
export function useDrafts(sessionIds: string[]): Set<string> {
  const [drafts, setDrafts] = useState<Set<string>>(() =>
    scanDrafts(sessionIds),
  );

  const scan = useCallback(() => {
    setDrafts(scanDrafts(sessionIds));
  }, [sessionIds]);

  // Re-scan when sessionIds change
  useEffect(() => {
    scan();
  }, [scan]);

  // Listen for storage events (changes from other tabs or same-tab updates)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key?.startsWith(DRAFT_KEY_PREFIX)) {
        scan();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [scan]);

  // Also poll periodically for same-tab changes (storage event doesn't fire for same-tab)
  useEffect(() => {
    const interval = setInterval(scan, 1000);
    return () => clearInterval(interval);
  }, [scan]);

  return useMemo(() => drafts, [drafts]);
}

function scanDrafts(sessionIds: string[]): Set<string> {
  const result = new Set<string>();
  try {
    for (const sessionId of sessionIds) {
      const key = `${DRAFT_KEY_PREFIX}${sessionId}`;
      const value = localStorage.getItem(key);
      if (value?.trim()) {
        result.add(sessionId);
      }
    }
  } catch {
    // localStorage might be unavailable
  }
  return result;
}

/**
 * Hook to track whether the new session form has a draft for a specific project.
 * Listens for storage events and polls for same-tab changes.
 */
export function useNewSessionDraft(projectId: string | undefined): boolean {
  const [hasDraft, setHasDraft] = useState(() =>
    checkNewSessionDraft(projectId),
  );

  const check = useCallback(() => {
    setHasDraft(checkNewSessionDraft(projectId));
  }, [projectId]);

  // Re-check when projectId changes
  useEffect(() => {
    check();
  }, [check]);

  // Listen for storage events (changes from other tabs)
  useEffect(() => {
    if (!projectId) return;

    const handleStorage = (e: StorageEvent) => {
      if (e.key === `${NEW_SESSION_DRAFT_KEY_PREFIX}${projectId}`) {
        check();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [check, projectId]);

  // Poll for same-tab changes (storage event doesn't fire for same-tab)
  useEffect(() => {
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [check]);

  return hasDraft;
}

function checkNewSessionDraft(projectId: string | undefined): boolean {
  if (!projectId) return false;
  try {
    const key = `${NEW_SESSION_DRAFT_KEY_PREFIX}${projectId}`;
    const value = localStorage.getItem(key);
    return !!value?.trim();
  } catch {
    return false;
  }
}

// Tool prompt draft storage keys
const TOOL_PROMPT_DRAFT_PREFIX = "draft-tool-prompt-";

/**
 * Hook to persist draft text for tool approval feedback.
 * ("Tell Claude what to do instead" in ToolApprovalPanel)
 * Keyed by sessionId, not by specific tool call.
 *
 * @param sessionId - The session ID
 * @returns [value, setValue, clearValue] tuple
 */
export function useToolApprovalFeedbackDraft(
  sessionId: string,
): [string, (value: string) => void, () => void] {
  const key = `${TOOL_PROMPT_DRAFT_PREFIX}${sessionId}-toolApprovalFeedback`;

  const [value, setValueState] = useState<string>(() => {
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  });

  const setValue = useCallback(
    (newValue: string) => {
      setValueState(newValue);
      try {
        if (newValue) {
          localStorage.setItem(key, newValue);
        } else {
          localStorage.removeItem(key);
        }
      } catch {
        // localStorage might be unavailable
      }
    },
    [key],
  );

  const clearValue = useCallback(() => {
    setValueState("");
    try {
      localStorage.removeItem(key);
    } catch {
      // localStorage might be unavailable
    }
  }, [key]);

  return [value, setValue, clearValue];
}

/**
 * Hook to persist "Other" text inputs for AskUserQuestion panels.
 * Stores a map of question text -> otherText, keyed by sessionId.
 *
 * For multi-stage questions (multiple tabs), each question's "Other"
 * input is stored separately under the same session key. When navigating
 * between tabs, each tab's draft is preserved.
 *
 * @param sessionId - The session ID
 * @returns [otherTexts, setOtherText, clearAll] tuple
 */
export function useQuestionOtherDrafts(
  sessionId: string,
): [
  Record<string, string>,
  (question: string, value: string) => void,
  () => void,
] {
  const key = `${TOOL_PROMPT_DRAFT_PREFIX}${sessionId}-questionOther`;

  const [otherTexts, setOtherTextsState] = useState<Record<string, string>>(
    () => {
      try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : {};
      } catch {
        return {};
      }
    },
  );

  const setOtherText = useCallback(
    (question: string, value: string) => {
      setOtherTextsState((prev) => {
        const next = { ...prev };
        if (value) {
          next[question] = value;
        } else {
          delete next[question];
        }
        try {
          if (Object.keys(next).length > 0) {
            localStorage.setItem(key, JSON.stringify(next));
          } else {
            localStorage.removeItem(key);
          }
        } catch {
          // localStorage might be unavailable
        }
        return next;
      });
    },
    [key],
  );

  const clearAll = useCallback(() => {
    setOtherTextsState({});
    try {
      localStorage.removeItem(key);
    } catch {
      // localStorage might be unavailable
    }
  }, [key]);

  return [otherTexts, setOtherText, clearAll];
}
