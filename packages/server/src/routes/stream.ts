import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  type EditInput,
  computeEditAugment,
} from "../augments/edit-augments.js";
import {
  type StreamCoordinator,
  createStreamCoordinator,
} from "../augments/index.js";
import { renderMarkdownToHtml } from "../augments/markdown-augments.js";
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

      // Track current streaming message ID (from message_start events)
      // Used to key augment events so client can persist them for the final message
      let currentStreamingMessageId: string | null = null;

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

      // Helper to extract message ID from message_start stream events
      // Returns the message ID if this is a message_start event, otherwise null
      const extractMessageIdFromStart = (
        message: Record<string, unknown>,
      ): string | null => {
        if (message.type !== "stream_event") return null;

        const event = message.event as Record<string, unknown> | undefined;
        if (!event || event.type !== "message_start") return null;

        const msg = event.message as Record<string, unknown> | undefined;
        if (msg && typeof msg.id === "string") {
          return msg.id;
        }

        return null;
      };

      // Helper to check if a message is a message_stop event (end of response)
      const isMessageStop = (message: Record<string, unknown>): boolean => {
        if (message.type !== "stream_event") return false;
        const event = message.event as Record<string, unknown> | undefined;
        return event?.type === "message_stop";
      };

      // Helper to extract Edit tool_use from assistant messages
      // Returns the tool_use id and input if found, null otherwise
      const extractEditToolUse = (
        message: Record<string, unknown>,
      ): { toolUseId: string; input: EditInput } | null => {
        // Must be an assistant message
        if (message.type !== "assistant") return null;

        // SDK messages have content nested at message.message.content
        const innerMessage = message.message as
          | Record<string, unknown>
          | undefined;
        const content = innerMessage?.content ?? message.content;
        if (!Array.isArray(content)) return null;

        // Look for Edit tool_use blocks
        for (const block of content) {
          if (
            typeof block === "object" &&
            block !== null &&
            (block as Record<string, unknown>).type === "tool_use" &&
            (block as Record<string, unknown>).name === "Edit"
          ) {
            const toolUseBlock = block as Record<string, unknown>;
            const input = toolUseBlock.input as Record<string, unknown>;

            // Validate input has required fields
            if (
              typeof toolUseBlock.id === "string" &&
              typeof input?.file_path === "string" &&
              typeof input?.old_string === "string" &&
              typeof input?.new_string === "string"
            ) {
              return {
                toolUseId: toolUseBlock.id,
                input: {
                  file_path: input.file_path,
                  old_string: input.old_string,
                  new_string: input.new_string,
                },
              };
            }
          }
        }

        return null;
      };

      // Helper to process text through StreamCoordinator and emit augments
      const processTextChunk = async (text: string): Promise<void> => {
        // Capture message ID at call time (before async operations)
        const messageId = currentStreamingMessageId;

        try {
          const coord = await getCoordinator();
          const result = await coord.onChunk(text);

          // Emit completed block augments
          for (const augment of result.augments) {
            await stream.writeSSE({
              id: String(eventId++),
              event: "markdown-augment",
              data: JSON.stringify({
                blockIndex: augment.blockIndex,
                html: augment.html,
                type: augment.type,
                // Include message ID so client can persist augments for final message
                ...(messageId ? { messageId } : {}),
              }),
            });
          }

          // Emit pending HTML (inline formatting for incomplete text)
          if (result.pendingHtml) {
            await stream.writeSSE({
              id: String(eventId++),
              event: "pending",
              data: JSON.stringify({
                html: result.pendingHtml,
                ...(messageId ? { messageId } : {}),
              }),
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

        // Capture message ID at call time (before async operations)
        const messageId = currentStreamingMessageId;

        try {
          const result = await coordinator.flush();

          // Emit any final augments
          for (const augment of result.augments) {
            await stream.writeSSE({
              id: String(eventId++),
              event: "markdown-augment",
              data: JSON.stringify({
                blockIndex: augment.blockIndex,
                html: augment.html,
                type: augment.type,
                // Include message ID so client can persist augments for final message
                ...(messageId ? { messageId } : {}),
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
              // Check for Edit tool_use - compute and send augment BEFORE raw message
              // This ensures client has rendering data ready when message arrives
              const editToolUse = extractEditToolUse(
                event.message as Record<string, unknown>,
              );
              if (editToolUse) {
                try {
                  const augment = await computeEditAugment(
                    editToolUse.toolUseId,
                    editToolUse.input,
                  );
                  await stream.writeSSE({
                    id: String(eventId++),
                    event: "edit-augment",
                    data: JSON.stringify(augment),
                  });
                } catch (err) {
                  // Log warning but don't block message delivery
                  log.warn(
                    { err, sessionId, toolUseId: editToolUse.toolUseId },
                    "Failed to compute edit augment",
                  );
                }
              }

              // Check for final assistant message - render markdown and send augment BEFORE raw message
              // This ensures client has the complete rendered HTML when the message arrives,
              // keyed by the message's uuid so it survives component remounts
              const msg = event.message as Record<string, unknown>;
              if (msg.type === "assistant" && msg.uuid) {
                const innerMessage = msg.message as
                  | { content?: unknown }
                  | undefined;
                const content = innerMessage?.content;
                if (Array.isArray(content)) {
                  const textBlock = content.find(
                    (b): b is { type: "text"; text: string } =>
                      b?.type === "text" &&
                      typeof b.text === "string" &&
                      b.text.trim() !== "",
                  );
                  if (textBlock) {
                    try {
                      const html = await renderMarkdownToHtml(textBlock.text);
                      await stream.writeSSE({
                        id: String(eventId++),
                        event: "markdown-augment",
                        data: JSON.stringify({
                          messageId: msg.uuid,
                          html,
                        }),
                      });
                    } catch (err) {
                      log.warn(
                        { err, sessionId, uuid: msg.uuid },
                        "Failed to render final markdown augment",
                      );
                    }
                  }
                }
              }

              // Send the message to client (raw text delivery)
              await stream.writeSSE({
                id: String(eventId++),
                event: "message",
                data: JSON.stringify(markSubagent(event.message)),
              });

              // Capture message ID from message_start events
              // This ID is included in augment events so client can key them for the final message
              const startMessageId = extractMessageIdFromStart(
                event.message as Record<string, unknown>,
              );
              if (startMessageId) {
                currentStreamingMessageId = startMessageId;
              }

              // Process text deltas through StreamCoordinator for markdown augments
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
                // Clear message ID after flush completes (async, but ID is captured in closure)
                currentStreamingMessageId = null;
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
