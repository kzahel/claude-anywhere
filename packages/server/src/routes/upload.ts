import {
  type UploadClientMessage,
  type UploadCompleteMessage,
  type UploadErrorMessage,
  type UploadProgressMessage,
  type UploadServerMessage,
  isUrlProjectId,
} from "@claude-anywhere/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import type { WSContext, WSEvents } from "hono/ws";
import type { ProjectScanner } from "../projects/scanner.js";
import { UploadManager } from "../uploads/index.js";

/** Progress update interval in bytes (64KB) */
const PROGRESS_INTERVAL_BYTES = 64 * 1024;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UpgradeWebSocketFn = (createEvents: (c: Context) => WSEvents) => any;

export interface UploadDeps {
  scanner: ProjectScanner;
  upgradeWebSocket: UpgradeWebSocketFn;
}

export function createUploadRoutes(deps: UploadDeps): Hono {
  const routes = new Hono();
  const uploadManager = new UploadManager();

  const sendMessage = (ws: WSContext, msg: UploadServerMessage) => {
    ws.send(JSON.stringify(msg));
  };

  const sendError = (ws: WSContext, message: string, code?: string) => {
    const errorMsg: UploadErrorMessage = { type: "error", message, code };
    sendMessage(ws, errorMsg);
  };

  // WebSocket endpoint: /projects/:projectId/sessions/:sessionId/upload/ws
  routes.get(
    "/projects/:projectId/sessions/:sessionId/upload/ws",
    deps.upgradeWebSocket((c) => {
      const projectId = c.req.param("projectId");
      const sessionId = c.req.param("sessionId");

      // Track current upload for this connection
      let currentUploadId: string | null = null;
      let lastProgressSent = 0;
      let validated = false;

      return {
        async onOpen(_evt, ws) {
          // Validate projectId format
          if (!isUrlProjectId(projectId)) {
            sendError(ws, "Invalid project ID format", "INVALID_PROJECT");
            ws.close(1008, "Invalid project ID");
            return;
          }

          // Validate project exists
          const project = await deps.scanner.getProject(projectId);
          if (!project) {
            sendError(ws, "Project not found", "PROJECT_NOT_FOUND");
            ws.close(1008, "Project not found");
            return;
          }

          validated = true;
        },

        async onMessage(evt, ws) {
          if (!validated) {
            sendError(ws, "Connection not validated", "NOT_VALIDATED");
            return;
          }

          const data = evt.data;

          // Handle binary chunks
          if (
            data instanceof ArrayBuffer ||
            data instanceof Uint8Array ||
            (typeof Buffer !== "undefined" && Buffer.isBuffer(data))
          ) {
            if (!currentUploadId) {
              sendError(
                ws,
                "No upload started - send start message first",
                "NO_UPLOAD",
              );
              return;
            }

            const uploadId = currentUploadId;
            try {
              let chunk: Buffer;
              if (data instanceof ArrayBuffer) {
                chunk = Buffer.from(data);
              } else if (data instanceof Uint8Array) {
                chunk = Buffer.from(
                  data.buffer,
                  data.byteOffset,
                  data.byteLength,
                );
              } else {
                chunk = data as Buffer;
              }

              const bytesReceived = await uploadManager.writeChunk(
                uploadId,
                chunk,
              );

              // Send progress updates periodically
              if (bytesReceived - lastProgressSent >= PROGRESS_INTERVAL_BYTES) {
                const progress: UploadProgressMessage = {
                  type: "progress",
                  bytesReceived,
                };
                sendMessage(ws, progress);
                lastProgressSent = bytesReceived;
              }
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Write failed";
              sendError(ws, message, "WRITE_ERROR");
              await uploadManager.cancelUpload(uploadId);
              currentUploadId = null;
            }
            return;
          }

          // Handle JSON control messages
          let msg: UploadClientMessage;
          try {
            const text = typeof data === "string" ? data : String(data);
            msg = JSON.parse(text) as UploadClientMessage;
          } catch {
            sendError(ws, "Invalid JSON message", "INVALID_JSON");
            return;
          }

          switch (msg.type) {
            case "start": {
              // Clean up any previous upload
              if (currentUploadId) {
                await uploadManager.cancelUpload(currentUploadId);
              }

              try {
                const { uploadId } = await uploadManager.startUpload(
                  projectId,
                  sessionId,
                  msg.name,
                  msg.size,
                  msg.mimeType,
                );
                currentUploadId = uploadId;
                lastProgressSent = 0;
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : "Failed to start upload";
                sendError(ws, message, "START_ERROR");
              }
              break;
            }

            case "end": {
              if (!currentUploadId) {
                sendError(ws, "No upload in progress", "NO_UPLOAD");
                return;
              }

              const uploadId = currentUploadId;
              try {
                const file = await uploadManager.completeUpload(uploadId);
                const complete: UploadCompleteMessage = {
                  type: "complete",
                  file,
                };
                sendMessage(ws, complete);
                currentUploadId = null;
              } catch (err) {
                const message =
                  err instanceof Error
                    ? err.message
                    : "Failed to complete upload";
                sendError(ws, message, "COMPLETE_ERROR");
                await uploadManager.cancelUpload(uploadId);
                currentUploadId = null;
              }
              break;
            }

            case "cancel": {
              if (currentUploadId) {
                await uploadManager.cancelUpload(currentUploadId);
                currentUploadId = null;
              }
              break;
            }
          }
        },

        async onClose(_evt, _ws) {
          // Clean up partial uploads on disconnect
          if (currentUploadId) {
            await uploadManager.cancelUpload(currentUploadId);
          }
        },

        onError(_evt, _ws) {
          // Clean up on error
          if (currentUploadId) {
            uploadManager.cancelUpload(currentUploadId).catch(() => {});
          }
        },
      };
    }),
  );

  return routes;
}
