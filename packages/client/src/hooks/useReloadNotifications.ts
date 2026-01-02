import { useCallback, useEffect, useState } from "react";
import {
  type SourceChangeEvent,
  type WorkerActivityEvent,
  activityBus,
} from "../lib/activityBus";

// Re-export for consumers
export type {
  SourceChangeEvent,
  WorkerActivityEvent,
} from "../lib/activityBus";

export interface PendingReloads {
  backend: boolean;
  frontend: boolean;
}

interface DevStatus {
  noBackendReload: boolean;
  noFrontendReload: boolean;
  backendDirty?: boolean;
}

const API_BASE = "/api";

/**
 * Hook to manage reload notifications when running in manual reload mode.
 * Listens for source-change events via the global activityBus.
 */
export function useReloadNotifications() {
  const [pendingReloads, setPendingReloads] = useState<PendingReloads>({
    backend: false,
    frontend: false,
  });
  const [devStatus, setDevStatus] = useState<DevStatus | null>(null);
  const [connected, setConnected] = useState(activityBus.connected);
  const [workerActivity, setWorkerActivity] = useState<WorkerActivityEvent>({
    type: "worker-activity-changed",
    activeWorkers: 0,
    queueLength: 0,
    hasActiveWork: false,
    timestamp: "",
  });

  // Sync dev status and worker activity from server
  const syncFromServer = useCallback(() => {
    // Sync dev status
    fetch(`${API_BASE}/dev/status`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: DevStatus | null) => {
        if (data && !data.backendDirty) {
          setPendingReloads((prev) => ({ ...prev, backend: false }));
        }
      })
      .catch(() => {
        // Ignore errors
      });

    // Sync worker activity
    fetch(`${API_BASE}/status/workers`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: WorkerActivityEvent | null) => {
        if (data) setWorkerActivity(data);
      })
      .catch(() => {
        // Ignore errors
      });
  }, []);

  // Check if we're in dev mode and get persisted dirty state
  useEffect(() => {
    fetch(`${API_BASE}/dev/status`)
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Dev routes not available");
      })
      .then((data: DevStatus) => {
        setDevStatus(data);
        if (data.backendDirty) {
          setPendingReloads((prev) => ({ ...prev, backend: true }));
        }
      })
      .catch(() => {
        setDevStatus(null);
      });
  }, []);

  // Subscribe to events from the bus
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    unsubscribers.push(
      activityBus.on("source-change", (data: SourceChangeEvent) => {
        setPendingReloads((prev) => ({
          ...prev,
          [data.target]: true,
        }));
      }),
    );

    unsubscribers.push(
      activityBus.on("backend-reloaded", () => {
        setPendingReloads((prev) => ({ ...prev, backend: false }));
      }),
    );

    unsubscribers.push(
      activityBus.on("worker-activity-changed", (data: WorkerActivityEvent) => {
        setWorkerActivity(data);
      }),
    );

    // On reconnect, sync state from server
    unsubscribers.push(
      activityBus.on("reconnect", () => {
        setConnected(true);
        syncFromServer();
      }),
    );

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }, [syncFromServer]);

  // Sync connected state with bus
  useEffect(() => {
    const checkConnection = () => {
      setConnected(activityBus.connected);
    };
    const interval = setInterval(checkConnection, 1000);
    return () => clearInterval(interval);
  }, []);

  // Initial sync when dev mode is detected
  useEffect(() => {
    if (devStatus?.noBackendReload || devStatus?.noFrontendReload) {
      syncFromServer();
    }
  }, [devStatus, syncFromServer]);

  // Reload the backend (triggers server restart)
  const reloadBackend = useCallback(async () => {
    console.log("[ReloadNotifications] Requesting backend reload...");
    try {
      const res = await fetch(`${API_BASE}/dev/reload`, {
        method: "POST",
        headers: { "X-Claude-Anywhere": "true" },
      });
      console.log("[ReloadNotifications] Reload response:", res.status);
      setPendingReloads((prev) => ({ ...prev, backend: false }));
    } catch (err) {
      console.log("[ReloadNotifications] Reload error (may be expected):", err);
    }
  }, []);

  // Reload the frontend (browser refresh)
  const reloadFrontend = useCallback(() => {
    window.location.reload();
  }, []);

  // Reload whichever needs it (backend first if both)
  const reload = useCallback(() => {
    if (pendingReloads.backend) {
      reloadBackend();
    } else if (pendingReloads.frontend) {
      reloadFrontend();
    }
  }, [pendingReloads, reloadBackend, reloadFrontend]);

  // Dismiss a pending reload notification
  const dismiss = useCallback((target: "backend" | "frontend") => {
    setPendingReloads((prev) => ({
      ...prev,
      [target]: false,
    }));
  }, []);

  // Dismiss all
  const dismissAll = useCallback(() => {
    setPendingReloads({ backend: false, frontend: false });
  }, []);

  // Keyboard shortcut: Ctrl+Shift+R
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "R") {
        e.preventDefault();
        reload();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [reload]);

  // Check if manual reload mode is active at all
  const isManualReloadMode =
    devStatus?.noBackendReload || devStatus?.noFrontendReload;

  return {
    isManualReloadMode,
    pendingReloads,
    connected,
    reloadBackend,
    reloadFrontend,
    reload,
    dismiss,
    dismissAll,
    workerActivity,
    unsafeToRestart: workerActivity.hasActiveWork,
  };
}
