import { randomUUID } from "node:crypto";
import { type WriteStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import type { UploadedFile } from "@claude-anywhere/shared";

/** Root directory for uploads */
export const UPLOADS_DIR = join(homedir(), ".claude-anywhere", "uploads");

/**
 * State machine for a single upload operation.
 * Handles streaming chunks to disk with proper cleanup on error.
 */
export interface UploadState {
  id: string;
  originalName: string;
  sanitizedName: string;
  filePath: string;
  expectedSize: number;
  bytesReceived: number;
  mimeType: string;
  writeStream: WriteStream | null;
  status: "pending" | "streaming" | "complete" | "error" | "cancelled";
}

/**
 * Sanitize filename to prevent path traversal and invalid characters.
 *
 * - Strips directory components (handles both Unix and Windows paths)
 * - Replaces dangerous characters
 * - Adds UUID prefix to prevent collisions
 */
export function sanitizeFilename(original: string): {
  id: string;
  sanitized: string;
} {
  const id = randomUUID();

  // Extract just the filename (handle both Unix and Windows path separators)
  // On Linux, basename() doesn't handle Windows paths, so we manually split first
  let baseFilename = original;
  const lastSlash = Math.max(
    original.lastIndexOf("/"),
    original.lastIndexOf("\\"),
  );
  if (lastSlash >= 0) {
    baseFilename = original.slice(lastSlash + 1);
  }

  // Remove null bytes and other dangerous characters
  let sanitized = baseFilename
    .replace(/\0/g, "")
    .replace(/[<>:"/\\|?*]/g, "_") // Windows-invalid chars (includes path separators)
    .replace(/\.\./g, "_") // path traversal
    .trim();

  // Handle empty or only-underscore/dot names
  if (!sanitized || /^[_.\s]*$/.test(sanitized)) {
    sanitized = "unnamed";
  }

  // Ensure reasonable length (keep extension)
  const ext = extname(sanitized);
  const nameWithoutExt = sanitized.slice(0, sanitized.length - ext.length);
  if (nameWithoutExt.length > 200) {
    sanitized = nameWithoutExt.slice(0, 200) + ext;
  }

  // Prefix with UUID
  return {
    id,
    sanitized: `${id}_${sanitized}`,
  };
}

/**
 * Get the upload directory for a project+session.
 * Creates the directory if it doesn't exist.
 *
 * @param encodedProjectPath - base64url encoded project path
 * @param sessionId - Session identifier
 * @param uploadsDir - Base uploads directory (defaults to UPLOADS_DIR)
 */
export async function getUploadDir(
  encodedProjectPath: string,
  sessionId: string,
  uploadsDir: string = UPLOADS_DIR,
): Promise<string> {
  const dir = join(uploadsDir, encodedProjectPath, sessionId);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Manages file upload operations with streaming to disk.
 */
export class UploadManager {
  private uploads = new Map<string, UploadState>();
  private uploadsDir: string;

  constructor(uploadsDir: string = UPLOADS_DIR) {
    this.uploadsDir = uploadsDir;
  }

  /**
   * Start a new upload.
   *
   * @returns Upload ID for tracking this upload
   */
  async startUpload(
    encodedProjectPath: string,
    sessionId: string,
    originalName: string,
    expectedSize: number,
    mimeType: string,
  ): Promise<{ uploadId: string; state: UploadState }> {
    const uploadDir = await getUploadDir(
      encodedProjectPath,
      sessionId,
      this.uploadsDir,
    );
    const { id, sanitized } = sanitizeFilename(originalName);
    const filePath = join(uploadDir, sanitized);

    const state: UploadState = {
      id,
      originalName,
      sanitizedName: sanitized,
      filePath,
      expectedSize,
      bytesReceived: 0,
      mimeType,
      writeStream: null,
      status: "pending",
    };

    this.uploads.set(id, state);
    return { uploadId: id, state };
  }

  /**
   * Write a chunk of data to the upload.
   * Opens the write stream on first chunk (lazy initialization).
   */
  async writeChunk(uploadId: string, chunk: Buffer): Promise<number> {
    const state = this.uploads.get(uploadId);
    if (!state) {
      throw new Error(`Upload not found: ${uploadId}`);
    }

    if (state.status === "cancelled" || state.status === "error") {
      throw new Error(`Upload is ${state.status}`);
    }

    // Lazy-create write stream on first chunk
    if (!state.writeStream) {
      state.writeStream = createWriteStream(state.filePath);
      state.status = "streaming";

      // Handle stream errors
      state.writeStream.on("error", () => {
        state.status = "error";
      });
    }

    // Write chunk and track bytes
    return new Promise((resolve, reject) => {
      const canContinue = state.writeStream?.write(chunk, (err) => {
        if (err) {
          state.status = "error";
          reject(err);
        } else {
          state.bytesReceived += chunk.length;
          resolve(state.bytesReceived);
        }
      });

      // Handle backpressure - wait for drain if buffer is full
      if (!canContinue) {
        state.writeStream?.once("drain", () => {
          // Already resolved in callback above
        });
      }
    });
  }

  /**
   * Complete an upload.
   * Closes the write stream and verifies the file.
   */
  async completeUpload(uploadId: string): Promise<UploadedFile> {
    const state = this.uploads.get(uploadId);
    if (!state) {
      throw new Error(`Upload not found: ${uploadId}`);
    }

    if (state.status !== "streaming" && state.status !== "pending") {
      throw new Error(`Cannot complete upload in status: ${state.status}`);
    }

    // Close the write stream
    if (state.writeStream) {
      await new Promise<void>((resolve, reject) => {
        state.writeStream?.end((err: Error | null | undefined) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    // Verify file exists and get actual size
    const stats = await stat(state.filePath);

    state.status = "complete";
    this.uploads.delete(uploadId);

    return {
      id: state.id,
      originalName: state.originalName,
      name: state.sanitizedName,
      path: state.filePath,
      size: stats.size,
      mimeType: state.mimeType,
    };
  }

  /**
   * Cancel or cleanup a failed upload.
   * Closes stream and removes partial file.
   */
  async cancelUpload(uploadId: string): Promise<void> {
    const state = this.uploads.get(uploadId);
    if (!state) {
      return; // Already cleaned up
    }

    state.status = "cancelled";

    // Close the write stream
    if (state.writeStream) {
      state.writeStream.destroy();
    }

    // Remove partial file
    try {
      await rm(state.filePath, { force: true });
    } catch {
      // Ignore - file may not exist yet
    }

    this.uploads.delete(uploadId);
  }

  /**
   * Get current state of an upload.
   */
  getState(uploadId: string): UploadState | undefined {
    return this.uploads.get(uploadId);
  }
}
