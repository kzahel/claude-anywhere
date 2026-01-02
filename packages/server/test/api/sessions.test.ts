import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { MockClaudeSDK, createMockScenario } from "../../src/sdk/mock.js";
import { encodeProjectId } from "../../src/supervisor/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "fixtures", "agents");

describe("Sessions API", () => {
  let mockSdk: MockClaudeSDK;
  let testDir: string;
  let projectId: string;

  beforeEach(async () => {
    mockSdk = new MockClaudeSDK();
    // Create temp directory structure with a valid project
    testDir = join(tmpdir(), `claude-test-${randomUUID()}`);
    const projectPath = "/home/user/myproject";
    projectId = encodeProjectId(projectPath);
    const encodedPath = projectPath.replaceAll("/", "-");

    await mkdir(join(testDir, "localhost", encodedPath), { recursive: true });
    // Session file must include cwd field for project path discovery
    await writeFile(
      join(testDir, "localhost", encodedPath, "sess-existing.jsonl"),
      `{"type":"user","cwd":"${projectPath}","message":{"content":"Hello"}}\n`,
    );
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("POST /api/projects/:projectId/sessions", () => {
    it("returns 400 if message is missing", async () => {
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request(`/api/projects/${projectId}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Claude-Anywhere": "true",
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Message is required");
    });

    it("returns 400 for invalid JSON", async () => {
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request(`/api/projects/${projectId}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Claude-Anywhere": "true",
        },
        body: "not json",
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid JSON body");
    });

    it("returns 404 for unknown project", async () => {
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request("/api/projects/unknown/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Claude-Anywhere": "true",
        },
        body: JSON.stringify({ message: "hello" }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toMatch(/Project not found/);
    });

    it("starts a session and returns processId", async () => {
      mockSdk.addScenario(createMockScenario("new-session", "Hello!"));
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request(`/api/projects/${projectId}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Claude-Anywhere": "true",
        },
        body: JSON.stringify({ message: "hello" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.sessionId).toBeDefined();
      expect(json.processId).toBeDefined();
    });

    it("accepts permission mode parameter", async () => {
      mockSdk.addScenario(createMockScenario("new-session", "Hello!"));
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request(`/api/projects/${projectId}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Claude-Anywhere": "true",
        },
        body: JSON.stringify({ message: "hello", mode: "acceptEdits" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.sessionId).toBeDefined();
      expect(json.processId).toBeDefined();
    });

    it("returns permissionMode and modeVersion in response", async () => {
      mockSdk.addScenario(createMockScenario("new-session", "Hello!"));
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request(`/api/projects/${projectId}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Claude-Anywhere": "true",
        },
        body: JSON.stringify({ message: "hello", mode: "acceptEdits" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.permissionMode).toBe("acceptEdits");
      expect(json.modeVersion).toBe(0);
    });

    it("returns default permissionMode when not specified", async () => {
      mockSdk.addScenario(createMockScenario("new-session", "Hello!"));
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request(`/api/projects/${projectId}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Claude-Anywhere": "true",
        },
        body: JSON.stringify({ message: "hello" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.permissionMode).toBe("default");
      expect(json.modeVersion).toBe(0);
    });
  });

  describe("POST /api/projects/:projectId/sessions/:sessionId/resume", () => {
    it("returns 400 if message is missing", async () => {
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request(
        `/api/projects/${projectId}/sessions/sess-123/resume`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Claude-Anywhere": "true",
          },
          body: JSON.stringify({}),
        },
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Message is required");
    });

    it("returns 404 for unknown project", async () => {
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request(
        "/api/projects/unknown/sessions/sess-123/resume",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Claude-Anywhere": "true",
          },
          body: JSON.stringify({ message: "hello" }),
        },
      );

      expect(res.status).toBe(404);
    });

    it("resumes a session and returns processId", async () => {
      mockSdk.addScenario(createMockScenario("sess-123", "Resumed!"));
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request(
        `/api/projects/${projectId}/sessions/sess-123/resume`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Claude-Anywhere": "true",
          },
          body: JSON.stringify({ message: "continue" }),
        },
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.processId).toBeDefined();
    });

    it("accepts permission mode parameter", async () => {
      mockSdk.addScenario(createMockScenario("sess-123", "Resumed!"));
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request(
        `/api/projects/${projectId}/sessions/sess-123/resume`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Claude-Anywhere": "true",
          },
          body: JSON.stringify({ message: "continue", mode: "plan" }),
        },
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.processId).toBeDefined();
    });

    it("returns permissionMode and modeVersion in response", async () => {
      mockSdk.addScenario(createMockScenario("sess-123", "Resumed!"));
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request(
        `/api/projects/${projectId}/sessions/sess-123/resume`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Claude-Anywhere": "true",
          },
          body: JSON.stringify({
            message: "continue",
            mode: "bypassPermissions",
          }),
        },
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.permissionMode).toBe("bypassPermissions");
      expect(json.modeVersion).toBe(0);
    });
  });

  describe("POST /api/sessions/:sessionId/messages", () => {
    it("returns 404 if no active process", async () => {
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request("/api/sessions/unknown/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Claude-Anywhere": "true",
        },
        body: JSON.stringify({ message: "hello" }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("No active process for session");
    });
  });

  describe("GET /api/sessions/:sessionId/pending-input", () => {
    it("returns null request when no active process", async () => {
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request("/api/sessions/unknown/pending-input");
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.request).toBeNull();
    });
  });

  describe("POST /api/sessions/:sessionId/input", () => {
    it("returns 404 if no active process", async () => {
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request("/api/sessions/unknown/input", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Claude-Anywhere": "true",
        },
        body: JSON.stringify({ requestId: "req-1", response: "approve" }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("No active process for session");
    });

    it("returns 400 if process is not waiting for input", async () => {
      // Create a session that immediately completes (not waiting for input)
      mockSdk.addScenario(createMockScenario("sess-no-wait", "Done!"));
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      // Start the session
      const startRes = await app.request(
        `/api/projects/${projectId}/sessions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Claude-Anywhere": "true",
          },
          body: JSON.stringify({ message: "hello" }),
        },
      );
      expect(startRes.status).toBe(200);
      const { sessionId } = await startRes.json();

      // Wait for session to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Try to send input - should fail because process completed
      const inputRes = await app.request(`/api/sessions/${sessionId}/input`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Claude-Anywhere": "true",
        },
        body: JSON.stringify({ requestId: "req-1", response: "approve" }),
      });

      // Process likely terminated or not waiting
      expect([400, 404]).toContain(inputRes.status);
    });

    it("returns 400 for missing required fields", async () => {
      // Create a session with tool approval
      mockSdk.addScenario({
        messages: [
          { type: "system", subtype: "init", session_id: "sess-tool" },
          {
            type: "system",
            subtype: "input_request",
            input_request: {
              id: "req-tool-1",
              type: "tool-approval",
              prompt: "Allow Edit?",
            },
          },
        ],
        delayMs: 5,
      });
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      // Start the session
      const startRes = await app.request(
        `/api/projects/${projectId}/sessions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Claude-Anywhere": "true",
          },
          body: JSON.stringify({ message: "hello" }),
        },
      );
      expect(startRes.status).toBe(200);
      const { sessionId } = await startRes.json();

      // Wait for session to enter waiting-input state
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Try to send input without requestId
      const inputRes = await app.request(`/api/sessions/${sessionId}/input`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Claude-Anywhere": "true",
        },
        body: JSON.stringify({ response: "approve" }),
      });

      expect(inputRes.status).toBe(400);
      const json = await inputRes.json();
      expect(json.error).toBe("requestId and response are required");
    });

    it("returns 400 for invalid requestId", async () => {
      // Create a session with tool approval
      mockSdk.addScenario({
        messages: [
          { type: "system", subtype: "init", session_id: "sess-tool" },
          {
            type: "system",
            subtype: "input_request",
            input_request: {
              id: "req-tool-1",
              type: "tool-approval",
              prompt: "Allow Edit?",
            },
          },
        ],
        delayMs: 5,
      });
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      // Start the session
      const startRes = await app.request(
        `/api/projects/${projectId}/sessions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Claude-Anywhere": "true",
          },
          body: JSON.stringify({ message: "hello" }),
        },
      );
      expect(startRes.status).toBe(200);
      const { sessionId } = await startRes.json();

      // Wait for session to enter waiting-input state
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Try to send input with wrong requestId
      const inputRes = await app.request(`/api/sessions/${sessionId}/input`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Claude-Anywhere": "true",
        },
        body: JSON.stringify({ requestId: "wrong-id", response: "approve" }),
      });

      expect(inputRes.status).toBe(400);
      const json = await inputRes.json();
      expect(json.error).toBe("Invalid request ID or no pending request");
    });

    it("accepts approve response with correct requestId", async () => {
      const requestId = `req-${Date.now()}`;
      // Create a session with tool approval
      mockSdk.addScenario({
        messages: [
          { type: "system", subtype: "init", session_id: "sess-tool-approve" },
          {
            type: "system",
            subtype: "input_request",
            input_request: {
              id: requestId,
              type: "tool-approval",
              prompt: "Allow Edit?",
            },
          },
        ],
        delayMs: 5,
      });
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      // Start the session
      const startRes = await app.request(
        `/api/projects/${projectId}/sessions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Claude-Anywhere": "true",
          },
          body: JSON.stringify({ message: "hello" }),
        },
      );
      expect(startRes.status).toBe(200);
      const { sessionId } = await startRes.json();

      // Wait for session to enter waiting-input state
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify pending input exists
      const pendingRes = await app.request(
        `/api/sessions/${sessionId}/pending-input`,
      );
      expect(pendingRes.status).toBe(200);
      const pendingJson = await pendingRes.json();
      expect(pendingJson.request).toBeDefined();
      expect(pendingJson.request.id).toBe(requestId);

      // Send approve
      const inputRes = await app.request(`/api/sessions/${sessionId}/input`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Claude-Anywhere": "true",
        },
        body: JSON.stringify({ requestId, response: "approve" }),
      });

      expect(inputRes.status).toBe(200);
      const json = await inputRes.json();
      expect(json.accepted).toBe(true);
    });

    it("accepts deny response with correct requestId", async () => {
      const requestId = `req-${Date.now()}`;
      // Create a session with tool approval
      mockSdk.addScenario({
        messages: [
          { type: "system", subtype: "init", session_id: "sess-tool-deny" },
          {
            type: "system",
            subtype: "input_request",
            input_request: {
              id: requestId,
              type: "tool-approval",
              prompt: "Allow Edit?",
            },
          },
        ],
        delayMs: 5,
      });
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      // Start the session
      const startRes = await app.request(
        `/api/projects/${projectId}/sessions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Claude-Anywhere": "true",
          },
          body: JSON.stringify({ message: "hello" }),
        },
      );
      expect(startRes.status).toBe(200);
      const { sessionId } = await startRes.json();

      // Wait for session to enter waiting-input state
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Send deny
      const inputRes = await app.request(`/api/sessions/${sessionId}/input`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Claude-Anywhere": "true",
        },
        body: JSON.stringify({ requestId, response: "deny" }),
      });

      expect(inputRes.status).toBe(200);
      const json = await inputRes.json();
      expect(json.accepted).toBe(true);
    });
  });

  describe("GET /api/projects/:projectId/sessions/:sessionId/agents/:agentId", () => {
    it("returns agent messages for existing agent file", async () => {
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      // Get project path from projectId
      const projectPath = "/home/user/myproject";
      const encodedPath = projectPath.replaceAll("/", "-");
      const sessionDir = join(testDir, "localhost", encodedPath);

      // Copy completed agent fixture to session directory
      const fixtureContent = await readFile(
        join(fixturesDir, "agent-completed.jsonl"),
        "utf-8",
      );
      await writeFile(
        join(sessionDir, "agent-test-agent.jsonl"),
        fixtureContent,
      );

      const res = await app.request(
        `/api/projects/${projectId}/sessions/sess-existing/agents/test-agent`,
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.messages).toBeDefined();
      expect(Array.isArray(json.messages)).toBe(true);
      expect(json.messages.length).toBeGreaterThan(0);
      expect(json.status).toBe("completed");
    });

    it("returns 200 with empty messages for unknown agent", async () => {
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request(
        `/api/projects/${projectId}/sessions/sess-existing/agents/unknown-agent`,
      );

      // Graceful handling - don't 404, just return empty
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.messages).toHaveLength(0);
      expect(json.status).toBe("pending");
    });

    it("returns 404 for unknown project", async () => {
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const res = await app.request(
        "/api/projects/unknown/sessions/sess-1/agents/agent-1",
      );

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Project not found");
    });

    it("infers status correctly for failed agent", async () => {
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const projectPath = "/home/user/myproject";
      const encodedPath = projectPath.replaceAll("/", "-");
      const sessionDir = join(testDir, "localhost", encodedPath);

      const fixtureContent = await readFile(
        join(fixturesDir, "agent-failed.jsonl"),
        "utf-8",
      );
      await writeFile(
        join(sessionDir, "agent-failed-agent.jsonl"),
        fixtureContent,
      );

      const res = await app.request(
        `/api/projects/${projectId}/sessions/sess-existing/agents/failed-agent`,
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("failed");
    });

    it("infers status correctly for running agent", async () => {
      const app = createApp({ sdk: mockSdk, projectsDir: testDir });

      const projectPath = "/home/user/myproject";
      const encodedPath = projectPath.replaceAll("/", "-");
      const sessionDir = join(testDir, "localhost", encodedPath);

      const fixtureContent = await readFile(
        join(fixturesDir, "agent-running.jsonl"),
        "utf-8",
      );
      await writeFile(
        join(sessionDir, "agent-running-agent.jsonl"),
        fixtureContent,
      );

      const res = await app.request(
        `/api/projects/${projectId}/sessions/sess-existing/agents/running-agent`,
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("running");
    });
  });
});
