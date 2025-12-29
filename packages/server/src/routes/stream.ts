import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Supervisor } from "../supervisor/Supervisor.js";
import type { ProcessEvent } from "../supervisor/types.js";

export interface StreamDeps {
  supervisor: Supervisor;
}

export function createStreamRoutes(deps: StreamDeps): Hono {
  const routes = new Hono();

  // GET /api/sessions/:sessionId/stream - SSE endpoint
  routes.get("/sessions/:sessionId/stream", async (c) => {
    const sessionId = c.req.param("sessionId");

    const process = deps.supervisor.getProcessForSession(sessionId);
    if (!process) {
      return c.json({ error: "No active process for session" }, 404);
    }

    return streamSSE(c, async (stream) => {
      let eventId = 0;

      // Send initial connection event
      await stream.writeSSE({
        id: String(eventId++),
        event: "connected",
        data: JSON.stringify({
          processId: process.id,
          sessionId: process.sessionId,
          state: process.state.type,
        }),
      });

      // Heartbeat interval
      const heartbeatInterval = setInterval(async () => {
        try {
          await stream.writeSSE({
            id: String(eventId++),
            event: "heartbeat",
            data: JSON.stringify({ timestamp: new Date().toISOString() }),
          });
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 30000); // 30 second heartbeat

      let completed = false;

      // Subscribe to process events
      const unsubscribe = process.subscribe(async (event: ProcessEvent) => {
        if (completed) return;

        try {
          switch (event.type) {
            case "message":
              await stream.writeSSE({
                id: String(eventId++),
                event: "message",
                data: JSON.stringify(event.message),
              });
              break;

            case "state-change":
              await stream.writeSSE({
                id: String(eventId++),
                event: "status",
                data: JSON.stringify({
                  state: event.state.type,
                  ...(event.state.type === "waiting-input"
                    ? { request: event.state.request }
                    : {}),
                }),
              });
              break;

            case "error":
              await stream.writeSSE({
                id: String(eventId++),
                event: "error",
                data: JSON.stringify({ message: event.error.message }),
              });
              break;

            case "complete":
              await stream.writeSSE({
                id: String(eventId++),
                event: "complete",
                data: JSON.stringify({ timestamp: new Date().toISOString() }),
              });
              completed = true;
              clearInterval(heartbeatInterval);
              break;
          }
        } catch {
          // Stream closed
          completed = true;
          clearInterval(heartbeatInterval);
          unsubscribe();
        }
      });

      // Handle stream close
      stream.onAbort(() => {
        completed = true;
        clearInterval(heartbeatInterval);
        unsubscribe();
      });

      // Keep stream open until process completes or client disconnects
      await new Promise<void>((resolve) => {
        const checkComplete = process.subscribe((event) => {
          if (event.type === "complete") {
            checkComplete();
            resolve();
          }
        });

        // Also resolve if already completed
        if (completed) {
          checkComplete();
          resolve();
        }
      });
    });
  });

  return routes;
}
