/**
 * File upload protocol types shared between client and server.
 * Uses WebSocket streaming with binary chunks.
 */

/** Metadata about an uploaded file */
export interface UploadedFile {
  /** Unique identifier (UUID) */
  id: string;
  /** Original filename from client */
  originalName: string;
  /** Sanitized filename on disk (UUID prefix + sanitized original) */
  name: string;
  /** Absolute path on server */
  path: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
}

/** Client -> Server: Start upload */
export interface UploadStartMessage {
  type: "start";
  /** Original filename */
  name: string;
  /** Expected total size in bytes */
  size: number;
  /** MIME type (e.g., "image/png", "application/pdf") */
  mimeType: string;
}

/** Client -> Server: End upload */
export interface UploadEndMessage {
  type: "end";
}

/** Client -> Server: Cancel upload */
export interface UploadCancelMessage {
  type: "cancel";
}

/** Server -> Client: Progress update */
export interface UploadProgressMessage {
  type: "progress";
  bytesReceived: number;
}

/** Server -> Client: Upload complete */
export interface UploadCompleteMessage {
  type: "complete";
  file: UploadedFile;
}

/** Server -> Client: Error occurred */
export interface UploadErrorMessage {
  type: "error";
  message: string;
  code?: string;
}

/** All client-to-server message types */
export type UploadClientMessage =
  | UploadStartMessage
  | UploadEndMessage
  | UploadCancelMessage;

/** All server-to-client message types */
export type UploadServerMessage =
  | UploadProgressMessage
  | UploadCompleteMessage
  | UploadErrorMessage;
