import { randomUUID } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  UploadManager,
  getUploadDir,
  sanitizeFilename,
} from "../../src/uploads/manager.js";

describe("sanitizeFilename", () => {
  it("generates unique ID for each call", () => {
    const result1 = sanitizeFilename("test.txt");
    const result2 = sanitizeFilename("test.txt");
    expect(result1.id).not.toBe(result2.id);
  });

  it("preserves simple filenames with UUID prefix", () => {
    const { id, sanitized } = sanitizeFilename("document.pdf");
    expect(sanitized).toBe(`${id}_document.pdf`);
  });

  it("strips path components (path traversal prevention)", () => {
    const { id, sanitized } = sanitizeFilename("../../../etc/passwd");
    expect(sanitized).toBe(`${id}_passwd`);
    expect(sanitized).not.toContain("..");
    expect(sanitized).not.toContain("/");
  });

  it("handles Windows path separators", () => {
    const { id, sanitized } = sanitizeFilename("C:\\Users\\test\\file.txt");
    expect(sanitized).toBe(`${id}_file.txt`);
  });

  it("replaces null bytes", () => {
    const { sanitized } = sanitizeFilename("file\x00.txt");
    expect(sanitized).not.toContain("\x00");
  });

  it("handles Windows-invalid characters", () => {
    // Test invalid characters: < > : " | ? * (note: / and \ are path separators)
    const { id, sanitized } = sanitizeFilename('file<>:"|?*.txt');
    expect(sanitized).toBe(`${id}_file_______.txt`); // 7 underscores for 7 invalid chars
  });

  it("handles empty filename", () => {
    const { id, sanitized } = sanitizeFilename("");
    expect(sanitized).toBe(`${id}_unnamed`);
  });

  it("handles dot-only filenames", () => {
    const { id, sanitized } = sanitizeFilename(".");
    expect(sanitized).toBe(`${id}_unnamed`);

    const { id: id2, sanitized: sanitized2 } = sanitizeFilename("..");
    expect(sanitized2).toBe(`${id2}_unnamed`);
  });

  it("truncates very long filenames but preserves extension", () => {
    const longName = `${"a".repeat(300)}.pdf`;
    const { sanitized } = sanitizeFilename(longName);
    // UUID (36) + _ (1) + truncated name (200) + .pdf (4) = 241
    expect(sanitized.length).toBeLessThan(250);
    expect(sanitized).toMatch(/\.pdf$/);
  });

  it("handles filenames with only extension", () => {
    const { id, sanitized } = sanitizeFilename(".gitignore");
    expect(sanitized).toBe(`${id}_.gitignore`);
  });
});

describe("getUploadDir", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `upload-test-${randomUUID()}`);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("creates nested directory structure", async () => {
    const dir = await getUploadDir("encoded-project", "session-123", tempDir);
    expect(dir).toBe(join(tempDir, "encoded-project", "session-123"));

    const stats = await stat(dir);
    expect(stats.isDirectory()).toBe(true);
  });

  it("handles special characters in project path", async () => {
    // base64url encoded paths may have - and _
    const dir = await getUploadDir(
      "abc-def_ghi",
      "session-with-dashes",
      tempDir,
    );
    expect(dir).toContain("abc-def_ghi");
    expect(dir).toContain("session-with-dashes");
  });
});

describe("UploadManager", () => {
  let manager: UploadManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `upload-test-${randomUUID()}`);
    manager = new UploadManager(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("startUpload", () => {
    it("creates upload state with correct initial values", async () => {
      const { uploadId, state } = await manager.startUpload(
        "encoded-project",
        "session-123",
        "test.txt",
        1024,
        "text/plain",
      );

      expect(uploadId).toBeDefined();
      expect(state.status).toBe("pending");
      expect(state.bytesReceived).toBe(0);
      expect(state.originalName).toBe("test.txt");
      expect(state.expectedSize).toBe(1024);
      expect(state.mimeType).toBe("text/plain");
    });

    it("creates upload directory", async () => {
      const { state } = await manager.startUpload(
        "encoded-project",
        "session-123",
        "test.txt",
        1024,
        "text/plain",
      );

      const uploadDir = join(tempDir, "encoded-project", "session-123");
      const stats = await stat(uploadDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe("writeChunk", () => {
    it("writes data and tracks bytes received", async () => {
      const { uploadId } = await manager.startUpload(
        "encoded-project",
        "session-123",
        "test.txt",
        1024,
        "text/plain",
      );

      const chunk = Buffer.from("Hello, World!");
      const bytesReceived = await manager.writeChunk(uploadId, chunk);

      expect(bytesReceived).toBe(13);
      expect(manager.getState(uploadId)?.status).toBe("streaming");
    });

    it("throws for unknown upload ID", async () => {
      await expect(
        manager.writeChunk("nonexistent", Buffer.from("data")),
      ).rejects.toThrow("Upload not found");
    });

    it("accumulates bytes across chunks", async () => {
      const { uploadId } = await manager.startUpload(
        "encoded-project",
        "session-123",
        "test.txt",
        100,
        "text/plain",
      );

      await manager.writeChunk(uploadId, Buffer.from("chunk1"));
      const total = await manager.writeChunk(uploadId, Buffer.from("chunk2"));

      expect(total).toBe(12); // 6 + 6
    });

    it("throws for cancelled upload", async () => {
      const { uploadId } = await manager.startUpload(
        "encoded-project",
        "session-123",
        "test.txt",
        100,
        "text/plain",
      );

      await manager.cancelUpload(uploadId);

      await expect(
        manager.writeChunk(uploadId, Buffer.from("data")),
      ).rejects.toThrow("Upload not found");
    });
  });

  describe("completeUpload", () => {
    it("returns uploaded file info", async () => {
      const { uploadId } = await manager.startUpload(
        "encoded-project",
        "session-123",
        "test.txt",
        13,
        "text/plain",
      );

      await manager.writeChunk(uploadId, Buffer.from("Hello, World!"));
      const file = await manager.completeUpload(uploadId);

      expect(file.originalName).toBe("test.txt");
      expect(file.size).toBe(13);
      expect(file.mimeType).toBe("text/plain");
      expect(file.path).toContain(file.name);
    });

    it("file is readable after completion", async () => {
      const { uploadId } = await manager.startUpload(
        "encoded-project",
        "session-123",
        "test.txt",
        13,
        "text/plain",
      );

      await manager.writeChunk(uploadId, Buffer.from("Hello, World!"));
      const file = await manager.completeUpload(uploadId);

      const content = await readFile(file.path, "utf-8");
      expect(content).toBe("Hello, World!");
    });

    it("handles multiple chunks correctly", async () => {
      const { uploadId } = await manager.startUpload(
        "encoded-project",
        "session-123",
        "test.txt",
        100,
        "text/plain",
      );

      await manager.writeChunk(uploadId, Buffer.from("Hello, "));
      await manager.writeChunk(uploadId, Buffer.from("World!"));
      const file = await manager.completeUpload(uploadId);

      const content = await readFile(file.path, "utf-8");
      expect(content).toBe("Hello, World!");
    });

    it("throws for unknown upload ID", async () => {
      await expect(manager.completeUpload("nonexistent")).rejects.toThrow(
        "Upload not found",
      );
    });

    it("removes upload from tracking after completion", async () => {
      const { uploadId } = await manager.startUpload(
        "encoded-project",
        "session-123",
        "test.txt",
        13,
        "text/plain",
      );

      await manager.writeChunk(uploadId, Buffer.from("Hello, World!"));
      await manager.completeUpload(uploadId);

      expect(manager.getState(uploadId)).toBeUndefined();
    });
  });

  describe("cancelUpload", () => {
    it("removes partial file", async () => {
      const { uploadId, state } = await manager.startUpload(
        "encoded-project",
        "session-123",
        "test.txt",
        1000,
        "text/plain",
      );

      await manager.writeChunk(uploadId, Buffer.from("partial data"));
      await manager.cancelUpload(uploadId);

      // File should not exist
      await expect(stat(state.filePath)).rejects.toThrow();
    });

    it("handles cancellation of non-started upload", async () => {
      const { uploadId } = await manager.startUpload(
        "encoded-project",
        "session-123",
        "test.txt",
        1000,
        "text/plain",
      );

      // Cancel before any chunks written
      await expect(manager.cancelUpload(uploadId)).resolves.not.toThrow();
    });

    it("handles cancellation of nonexistent upload", async () => {
      await expect(manager.cancelUpload("nonexistent")).resolves.not.toThrow();
    });

    it("removes upload from tracking after cancellation", async () => {
      const { uploadId } = await manager.startUpload(
        "encoded-project",
        "session-123",
        "test.txt",
        100,
        "text/plain",
      );

      await manager.cancelUpload(uploadId);

      expect(manager.getState(uploadId)).toBeUndefined();
    });
  });

  describe("getState", () => {
    it("returns undefined for unknown upload", () => {
      expect(manager.getState("nonexistent")).toBeUndefined();
    });

    it("returns current state for active upload", async () => {
      const { uploadId } = await manager.startUpload(
        "encoded-project",
        "session-123",
        "test.txt",
        100,
        "text/plain",
      );

      const state = manager.getState(uploadId);
      expect(state).toBeDefined();
      expect(state?.originalName).toBe("test.txt");
    });
  });
});
