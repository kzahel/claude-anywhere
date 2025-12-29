import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { MockClaudeSDK } from "../../src/sdk/mock.js";

describe("Projects API", () => {
  let mockSdk: MockClaudeSDK;
  let testDir: string;

  beforeEach(async () => {
    mockSdk = new MockClaudeSDK();
    // Create temp directory structure mimicking ~/.claude/projects/
    testDir = join(tmpdir(), `claude-test-${randomUUID()}`);
    await mkdir(join(testDir, "localhost"), { recursive: true });
    await mkdir(join(testDir, "localhost", "-home-user-myproject"), {
      recursive: true,
    });
    // Create a sample session file
    await writeFile(
      join(testDir, "localhost", "-home-user-myproject", "sess-123.jsonl"),
      '{"type":"user","message":{"content":"Hello"}}\n',
    );
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("GET /api/projects", () => {
    it("returns list of projects", async () => {
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request("/api/projects");
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.projects).toBeDefined();
      expect(Array.isArray(json.projects)).toBe(true);
    });

    it("returns empty list when no projects directory", async () => {
      const app = createApp({
        sdk: mockSdk,
        projectsDir: "/nonexistent/path",
      });

      const res = await app.request("/api/projects");
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.projects).toEqual([]);
    });

    it("discovers projects from directory structure", async () => {
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request("/api/projects");
      const json = await res.json();

      expect(res.status).toBe(200);
      // Should find the project we created
      expect(json.projects.length).toBeGreaterThan(0);
    });
  });

  describe("GET /api/projects/:projectId", () => {
    it("returns 404 for unknown project", async () => {
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request("/api/projects/unknown-id");

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Project not found");
    });
  });

  describe("GET /api/projects/:projectId/sessions", () => {
    it("returns 404 for unknown project", async () => {
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request("/api/projects/unknown-id/sessions");

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Project not found");
    });
  });
});
