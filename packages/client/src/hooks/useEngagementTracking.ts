import { useCallback, useEffect, useRef } from "react";
import { api } from "../api/client";

/**
 * Tracks user engagement with a session to determine when to mark it as "seen".
 *
 * We don't want to mark a session as seen just because the page is open:
 * - User might have left their laptop open
 * - Auto-scrolling content doesn't mean user is reading
 *
 * We mark as seen when:
 * 1. Tab is focused (document.hasFocus())
 * 2. User has interacted recently (within last 30 seconds)
 * 3. Session has new content (activityAt > lastSeenAt)
 *
 * Important: We use two different timestamps:
 * - activityAt: Triggers the mark-seen action (includes SSE streaming activity)
 * - updatedAt: The timestamp we record (file mtime, used by hasUnread comparison)
 *
 * This separation prevents a race condition where SSE timestamps (client clock)
 * could be ahead of file mtime (server disk write time), causing sessions to
 * never become unread again.
 *
 * Debounces API calls to avoid excessive writes.
 */

const INTERACTION_TIMEOUT_MS = 30_000; // 30 seconds
const DEBOUNCE_MS = 2_000; // 2 seconds

interface UseEngagementTrackingOptions {
  /** Session ID to track */
  sessionId: string;
  /**
   * ISO timestamp that triggers the mark-seen action.
   * Can include SSE activity timestamps to immediately mark content as seen
   * while viewing live streams.
   */
  activityAt: string | null;
  /**
   * ISO timestamp to record when marking seen (file mtime).
   * This is what hasUnread() compares against, so it must match the file's
   * actual updatedAt to avoid race conditions.
   */
  updatedAt: string | null;
  /** ISO timestamp of when user last viewed this session */
  lastSeenAt?: string;
  /** Whether the server reports this session as having unread content */
  hasUnread?: boolean;
  /** Whether engagement tracking is enabled (e.g., false for external sessions) */
  enabled?: boolean;
}

export function useEngagementTracking(options: UseEngagementTrackingOptions) {
  const {
    sessionId,
    activityAt,
    updatedAt,
    lastSeenAt,
    hasUnread = false,
    enabled = true,
  } = options;

  // Track last user interaction time
  const lastInteractionRef = useRef<number>(Date.now());
  // Track if we've already marked this content as seen (by activityAt)
  const markedSeenRef = useRef<string | null>(null);
  // Debounce timer
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track if component is mounted
  const mountedRef = useRef(true);
  // Track if this is the first time activityAt became available (initial navigation)
  const isInitialLoadRef = useRef(true);

  // Check if there's content that needs to be marked as seen.
  // This includes:
  // 1. New activity since last seen (activityAt > lastSeenAt)
  // 2. Server reports unread content (hasUnread) - handles edge cases where
  //    timestamps are equal but content is still considered unread
  const hasNewContent = useCallback(() => {
    if (!activityAt) return false;
    if (!lastSeenAt) return true; // Never seen before
    return activityAt > lastSeenAt || hasUnread;
  }, [activityAt, lastSeenAt, hasUnread]);

  // Check if user is actively engaged
  const isEngaged = useCallback(() => {
    const isFocused = document.hasFocus();
    const hasRecentInteraction =
      Date.now() - lastInteractionRef.current < INTERACTION_TIMEOUT_MS;
    return isFocused && hasRecentInteraction;
  }, []);

  // Mark session as seen (debounced)
  // Records updatedAt (file mtime), but triggers based on activityAt
  const markSeen = useCallback(() => {
    if (!enabled || !mountedRef.current) return;
    if (!activityAt || !updatedAt) return;

    // Don't re-mark if we've already marked this activity
    if (markedSeenRef.current === activityAt) return;

    // Check engagement NOW, before the debounce.
    // If user is engaged when we decide to mark seen, follow through.
    // The debounce is just to avoid API spam, not to re-validate engagement.
    if (!isEngaged()) return;
    if (!hasNewContent()) return;

    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the API call
    debounceTimerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      // Re-check hasNewContent in case it changed during debounce,
      // but don't re-check engagement (we already validated it)

      try {
        // Record the file's updatedAt, not activityAt
        // This ensures hasUnread() comparisons work correctly
        await api.markSessionSeen(sessionId, updatedAt);
        markedSeenRef.current = activityAt;
      } catch (error) {
        console.warn(
          "[useEngagementTracking] Failed to mark session as seen:",
          error,
        );
      }
    }, DEBOUNCE_MS);
  }, [enabled, sessionId, activityAt, updatedAt, isEngaged, hasNewContent]);

  // Track user interactions
  useEffect(() => {
    if (!enabled) return;

    const handleInteraction = () => {
      lastInteractionRef.current = Date.now();

      // If engaged and there's new content, schedule mark-seen
      if (hasNewContent() && isEngaged()) {
        markSeen();
      }
    };

    // Track various interaction types
    const events = ["mousemove", "keydown", "scroll", "click", "touchstart"];
    for (const event of events) {
      window.addEventListener(event, handleInteraction, { passive: true });
    }

    return () => {
      for (const event of events) {
        window.removeEventListener(event, handleInteraction);
      }
    };
  }, [enabled, hasNewContent, isEngaged, markSeen]);

  // Track focus changes
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        hasNewContent() &&
        isEngaged()
      ) {
        markSeen();
      }
    };

    const handleFocus = () => {
      // Record interaction when focusing
      lastInteractionRef.current = Date.now();
      if (hasNewContent() && isEngaged()) {
        markSeen();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [enabled, hasNewContent, isEngaged, markSeen]);

  // Handle initial navigation: when activityAt first becomes available,
  // mark as seen if there's new content. No engagement check needed -
  // the user navigating to this session IS engagement.
  // After initial load, we rely on interaction/focus handlers.
  useEffect(() => {
    if (!enabled) return;
    if (!activityAt || !updatedAt) return;
    if (!isInitialLoadRef.current) return;

    // Mark that we've handled initial load
    isInitialLoadRef.current = false;

    // If there's new content, mark it as seen after a brief debounce
    if (hasNewContent()) {
      // Clear any pending debounce
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(async () => {
        if (!mountedRef.current) return;
        if (markedSeenRef.current === activityAt) return;

        try {
          await api.markSessionSeen(sessionId, updatedAt);
          markedSeenRef.current = activityAt;
        } catch (error) {
          console.warn(
            "[useEngagementTracking] Failed to mark session as seen:",
            error,
          );
        }
      }, DEBOUNCE_MS);
    }
  }, [enabled, sessionId, activityAt, updatedAt, hasNewContent]);

  // Cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Force mark as seen (for explicit user action, bypasses engagement check)
  const forceMarkSeen = useCallback(async () => {
    if (!enabled || !updatedAt) return;

    try {
      await api.markSessionSeen(sessionId, updatedAt);
      markedSeenRef.current = activityAt;
    } catch (error) {
      console.warn(
        "[useEngagementTracking] Failed to force mark session as seen:",
        error,
      );
    }
  }, [enabled, sessionId, activityAt, updatedAt]);

  return {
    /** Manually mark the session as seen (bypasses engagement check) */
    forceMarkSeen,
    /** Check if user is currently engaged */
    isEngaged,
  };
}
