import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { BusEvent, EventBus } from "../watcher/index.js";

export interface ActivityDeps {
  eventBus: EventBus;
}

export function createActivityRoutes(deps: ActivityDeps): Hono {
  const routes = new Hono();

  // GET /api/activity/events - SSE endpoint for all real-time events
  routes.get("/events", async (c) => {
    return streamSSE(c, async (stream) => {
      let eventId = 0;

      // Send initial connection event
      await stream.writeSSE({
        id: String(eventId++),
        event: "connected",
        data: JSON.stringify({
          timestamp: new Date().toISOString(),
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

      let closed = false;

      // Subscribe to bus events (file changes and session status)
      const unsubscribe = deps.eventBus.subscribe(async (event: BusEvent) => {
        if (closed) return;

        try {
          // Use the event's type as the SSE event name
          await stream.writeSSE({
            id: String(eventId++),
            event: event.type,
            data: JSON.stringify(event),
          });
        } catch {
          // Stream closed
          closed = true;
          clearInterval(heartbeatInterval);
          unsubscribe();
        }
      });

      // Handle stream close
      stream.onAbort(() => {
        closed = true;
        clearInterval(heartbeatInterval);
        unsubscribe();
      });

      // Keep stream open indefinitely (until client disconnects)
      await new Promise<void>((resolve) => {
        const checkClosed = setInterval(() => {
          if (closed) {
            clearInterval(checkClosed);
            resolve();
          }
        }, 1000);

        stream.onAbort(() => {
          clearInterval(checkClosed);
          resolve();
        });
      });
    });
  });

  // GET /api/activity/status - Get watcher status
  routes.get("/status", (c) => {
    return c.json({
      subscribers: deps.eventBus.subscriberCount,
      timestamp: new Date().toISOString(),
    });
  });

  return routes;
}
