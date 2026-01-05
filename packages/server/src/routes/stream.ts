import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  type StreamCoordinator,
  createStreamCoordinator,
} from "../augments/index.js";
import { getLogger } from "../logging/logger.js";
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
      const log = getLogger();

      // Create StreamCoordinator for markdown augments
      // This is created lazily on first text chunk to avoid initialization overhead
      // for streams that don't have text content
      let coordinator: StreamCoordinator | null = null;
      let coordinatorInitPromise: Promise<StreamCoordinator> | null = null;

      const getCoordinator = async (): Promise<StreamCoordinator> => {
        if (coordinator) return coordinator;
        if (!coordinatorInitPromise) {
          coordinatorInitPromise = createStreamCoordinator();
        }
        coordinator = await coordinatorInitPromise;
        return coordinator;
      };

      // Helper to extract text delta from stream_event messages
      // Returns the text if this is a text_delta event, otherwise null
      const extractTextDelta = (
        message: Record<string, unknown>,
      ): string | null => {
        if (message.type !== "stream_event") return null;

        const event = message.event as Record<string, unknown> | undefined;
        if (!event) return null;

        // Check for content_block_delta with text_delta
        if (event.type === "content_block_delta") {
          const delta = event.delta as Record<string, unknown> | undefined;
          if (delta?.type === "text_delta" && typeof delta.text === "string") {
            return delta.text;
          }
        }

        return null;
      };

      // Helper to check if a message is a message_stop event (end of response)
      const isMessageStop = (message: Record<string, unknown>): boolean => {
        if (message.type !== "stream_event") return false;
        const event = message.event as Record<string, unknown> | undefined;
        return event?.type === "message_stop";
      };

      // Helper to process text through StreamCoordinator and emit augments
      const processTextChunk = async (text: string): Promise<void> => {
        try {
          const coord = await getCoordinator();
          const result = await coord.onChunk(text);

          // Emit completed block augments
          for (const augment of result.augments) {
            await stream.writeSSE({
              id: String(eventId++),
              event: "augment",
              data: JSON.stringify({
                blockIndex: augment.blockIndex,
                html: augment.html,
                type: augment.type,
              }),
            });
          }

          // Emit pending HTML (inline formatting for incomplete text)
          if (result.pendingHtml) {
            await stream.writeSSE({
              id: String(eventId++),
              event: "pending",
              data: JSON.stringify({ html: result.pendingHtml }),
            });
          }
        } catch (err) {
          // Log but don't fail the stream - augments are non-critical
          log.warn(
            { err, sessionId },
            "Failed to process text chunk for augments",
          );
        }
      };

      // Helper to flush coordinator on message completion
      const flushCoordinator = async (): Promise<void> => {
        if (!coordinator) return;

        try {
          const result = await coordinator.flush();

          // Emit any final augments
          for (const augment of result.augments) {
            await stream.writeSSE({
              id: String(eventId++),
              event: "augment",
              data: JSON.stringify({
                blockIndex: augment.blockIndex,
                html: augment.html,
                type: augment.type,
              }),
            });
          }

          // Reset coordinator for next message
          coordinator.reset();
        } catch (err) {
          log.warn({ err, sessionId }, "Failed to flush coordinator");
        }
      };

      // Send initial connection event
      await stream.writeSSE({
        id: String(eventId++),
        event: "connected",
        data: JSON.stringify({
          processId: process.id,
          sessionId: process.sessionId,
          state: process.state.type,
          permissionMode: process.permissionMode,
          modeVersion: process.modeVersion,
          // Include pending request for waiting-input state
          ...(process.state.type === "waiting-input"
            ? { request: process.state.request }
            : {}),
        }),
      });

      // Helper to mark subagent messages
      // Subagent messages have parent_tool_use_id set (pointing to Task tool_use id)
      const markSubagent = <T extends { parent_tool_use_id?: string | null }>(
        message: T,
      ): T & { isSubagent?: boolean; parentToolUseId?: string } => {
        // If parent_tool_use_id is set, it's a subagent message
        if (message.parent_tool_use_id) {
          return {
            ...message,
            isSubagent: true,
            parentToolUseId: message.parent_tool_use_id,
          };
        }
        return message;
      };

      // Replay buffered messages (for mock SDK that doesn't persist to disk)
      // This ensures clients that connect after messages were emitted still receive them
      for (const message of process.getMessageHistory()) {
        await stream.writeSSE({
          id: String(eventId++),
          event: "message",
          data: JSON.stringify(markSubagent(message)),
        });
      }

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
            case "message": {
              // Send the message to client first (raw text delivery)
              await stream.writeSSE({
                id: String(eventId++),
                event: "message",
                data: JSON.stringify(markSubagent(event.message)),
              });

              // Process text deltas through StreamCoordinator for augments
              // This runs after raw delivery so it doesn't block streaming
              const textDelta = extractTextDelta(
                event.message as Record<string, unknown>,
              );
              if (textDelta) {
                // Process asynchronously to not block raw delivery
                processTextChunk(textDelta);
              }

              // Flush coordinator when message stream ends
              if (isMessageStop(event.message as Record<string, unknown>)) {
                flushCoordinator();
              }
              break;
            }

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

            case "mode-change":
              await stream.writeSSE({
                id: String(eventId++),
                event: "mode-change",
                data: JSON.stringify({
                  permissionMode: event.mode,
                  modeVersion: event.version,
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
              // Flush any remaining augments before completing
              await flushCoordinator();

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

      // Keep stream open until process completes or client disconnects
      await new Promise<void>((resolve) => {
        // Also resolve if already completed (process finished before we got here)
        if (completed) {
          resolve();
          return;
        }

        // Subscribe to wait for completion
        const unsubscribeCompletion = process.subscribe((event) => {
          if (event.type === "complete") {
            unsubscribeCompletion();
            resolve();
          }
        });

        // Handle stream close - must unsubscribe the completion listener too
        stream.onAbort(() => {
          completed = true;
          clearInterval(heartbeatInterval);
          unsubscribe();
          unsubscribeCompletion(); // Clean up completion listener on disconnect
          resolve();
        });

        // Check again after subscribing in case we missed it
        if (completed) {
          unsubscribeCompletion();
          resolve();
        }
      });
    });
  });

  return routes;
}
