import { useCallback, useEffect, useRef, useState } from "react";
import { type InboxItem, type InboxResponse, api } from "../api/client";
import { useFileActivity } from "./useFileActivity";

// Re-export types for consumers
export type { InboxItem, InboxResponse } from "../api/client";

// Debounce interval for refetch on SSE events (prevents rapid refetches)
const REFETCH_DEBOUNCE_MS = 500;

/** The five tier keys in priority order */
export const INBOX_TIERS = [
  "needsAttention",
  "active",
  "recentActivity",
  "unread8h",
  "unread24h",
] as const;

export type InboxTier = (typeof INBOX_TIERS)[number];

/**
 * Tracks the stable order of session IDs within each tier.
 * Used to prevent reordering during polling while still allowing
 * items to move between tiers.
 */
type TierOrder = Record<InboxTier, string[]>;

/**
 * Merges new inbox data with existing tier order for UI stability.
 *
 * Rules:
 * - Existing items stay in their current position within a tier
 * - New items are appended at the end of their tier
 * - Items that are no longer in a tier are removed
 * - Items CAN move between tiers (that's meaningful state change)
 *
 * @param newData - Fresh data from the API
 * @param currentOrder - Current order of session IDs per tier
 * @returns Merged inbox data with stable ordering
 */
function mergeWithStableOrder(
  newData: InboxResponse,
  currentOrder: TierOrder,
): InboxResponse {
  const result: InboxResponse = {
    needsAttention: [],
    active: [],
    recentActivity: [],
    unread8h: [],
    unread24h: [],
  };

  for (const tier of INBOX_TIERS) {
    const newItems = newData[tier];
    const existingOrder = currentOrder[tier];

    // Build lookup map for quick access
    const newItemsMap = new Map(newItems.map((item) => [item.sessionId, item]));

    // First, add existing items that are still in this tier (preserving order)
    const orderedItems: InboxItem[] = [];
    for (const sessionId of existingOrder) {
      const item = newItemsMap.get(sessionId);
      if (item) {
        orderedItems.push(item);
      }
    }

    // Then, append new items that weren't in the existing order
    const existingSet = new Set(existingOrder);
    for (const item of newItems) {
      if (!existingSet.has(item.sessionId)) {
        orderedItems.push(item);
      }
    }

    result[tier] = orderedItems;
  }

  return result;
}

/**
 * Extracts the session ID order from inbox data.
 */
function extractTierOrder(data: InboxResponse): TierOrder {
  return {
    needsAttention: data.needsAttention.map((item) => item.sessionId),
    active: data.active.map((item) => item.sessionId),
    recentActivity: data.recentActivity.map((item) => item.sessionId),
    unread8h: data.unread8h.map((item) => item.sessionId),
    unread24h: data.unread24h.map((item) => item.sessionId),
  };
}

/**
 * Creates an empty tier order structure.
 */
function createEmptyTierOrder(): TierOrder {
  return {
    needsAttention: [],
    active: [],
    recentActivity: [],
    unread8h: [],
    unread24h: [],
  };
}

export interface UseInboxOptions {
  /** Filter to a specific project (base64url-encoded project path) */
  projectId?: string;
}

/**
 * Hook to fetch and poll inbox data with UI-stable ordering.
 *
 * Features:
 * - Fetches inbox data on mount
 * - Polls every 30 seconds to stay fresh
 * - Maintains stable item order within tiers during polling
 * - Provides explicit refresh() to force full re-sort
 * - Optionally filters to a single project
 *
 * Stability guarantees:
 * - Items within a tier maintain their position during polls
 * - New items appear at the bottom of their tier
 * - Items can move between tiers (that's meaningful state change)
 * - Calling refresh() triggers a full sort by server order
 */
export function useInbox(options: UseInboxOptions = {}) {
  const { projectId } = options;
  const [inbox, setInbox] = useState<InboxResponse>({
    needsAttention: [],
    active: [],
    recentActivity: [],
    unread8h: [],
    unread24h: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Track the order of session IDs per tier for stable rendering
  const tierOrderRef = useRef<TierOrder>(createEmptyTierOrder());
  // Track if we've done the initial load (determines whether to use stable ordering)
  const hasInitialLoadRef = useRef(false);
  // Debounce timer for SSE-triggered refetches
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Fetches inbox data and applies stable ordering.
   * @param forceFullSort - If true, uses server sort order instead of stable merge
   */
  const fetchInbox = useCallback(
    async (forceFullSort = false) => {
      try {
        const data = await api.getInbox(projectId);

        if (!hasInitialLoadRef.current || forceFullSort) {
          // Initial load or explicit refresh: use server's sort order
          setInbox(data);
          tierOrderRef.current = extractTierOrder(data);
          hasInitialLoadRef.current = true;
        } else {
          // Subsequent fetches: merge with stable ordering
          const mergedData = mergeWithStableOrder(data, tierOrderRef.current);
          setInbox(mergedData);
          // Update tier order to include any new items
          tierOrderRef.current = extractTierOrder(mergedData);
        }

        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  /**
   * Force a full refresh with server-provided sort order.
   * Use this when the user explicitly wants to refresh.
   */
  const refresh = useCallback(() => {
    return fetchInbox(true);
  }, [fetchInbox]);

  /**
   * Debounced refetch - prevents rapid refetches from multiple SSE events
   */
  const debouncedRefetch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      fetchInbox();
    }, REFETCH_DEBOUNCE_MS);
  }, [fetchInbox]);

  // Subscribe to SSE events for real-time updates
  // When filtering by projectId, only refetch for events from that project
  useFileActivity({
    onFileChange: (event) => {
      // Refetch on session file changes (new messages may change hasUnread status)
      if (event.fileType === "session" || event.fileType === "agent-session") {
        debouncedRefetch();
      }
    },
    onProcessStateChange: (event) => {
      if (!projectId || event.projectId === projectId) {
        debouncedRefetch();
      }
    },
    onSessionStatusChange: (event) => {
      if (!projectId || event.projectId === projectId) {
        debouncedRefetch();
      }
    },
    onSessionSeen: debouncedRefetch,
    onSessionCreated: (event) => {
      if (!projectId || event.session.projectId === projectId) {
        debouncedRefetch();
      }
    },
  });

  // Initial fetch
  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Computed totals for convenience
  const totalNeedsAttention = inbox.needsAttention.length;
  const totalActive = inbox.active.length;
  const totalItems =
    inbox.needsAttention.length +
    inbox.active.length +
    inbox.recentActivity.length +
    inbox.unread8h.length +
    inbox.unread24h.length;

  return {
    /** Sessions requiring immediate user input (tool approval or question) */
    needsAttention: inbox.needsAttention,
    /** Sessions with running processes (no pending input) */
    active: inbox.active,
    /** Sessions updated in the last 30 minutes */
    recentActivity: inbox.recentActivity,
    /** Unread sessions from the last 8 hours */
    unread8h: inbox.unread8h,
    /** Unread sessions from the last 24 hours */
    unread24h: inbox.unread24h,
    /** Full inbox response (all tiers) */
    inbox,
    /** Project ID filter (if set) */
    projectId,
    /** True while loading initial data */
    loading,
    /** Error from the last fetch attempt, if any */
    error,
    /** Force a full refresh with server sort order */
    refresh,
    /** Refetch data (maintains stable ordering) */
    refetch: fetchInbox,
    /** Count of sessions needing attention */
    totalNeedsAttention,
    /** Count of active sessions */
    totalActive,
    /** Total count of all inbox items */
    totalItems,
  };
}
