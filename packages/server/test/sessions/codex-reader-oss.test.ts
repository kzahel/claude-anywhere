import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { UrlProjectId } from "@yep-anywhere/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CodexSessionReader } from "../../src/sessions/codex-reader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("CodexSessionReader - OSS Support", () => {
  let testDir: string;
  let reader: CodexSessionReader;

  beforeEach(async () => {
    testDir = join(tmpdir(), `codex-reader-oss-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    reader = new CodexSessionReader({ sessionsDir: testDir });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  const createSessionFile = async (
    sessionId: string,
    provider: string | undefined,
    model: string | undefined,
  ) => {
    const metaPayload = {
      id: sessionId,
      cwd: "/test/project",
      timestamp: new Date().toISOString(),
      ...(provider ? { model_provider: provider } : {}),
    };

    const lines = [
      JSON.stringify({
        type: "session_meta",
        timestamp: new Date().toISOString(),
        payload: metaPayload,
      }),
    ];

    if (model) {
      lines.push(
        JSON.stringify({
          type: "turn_context",
          timestamp: new Date().toISOString(),
          payload: { model },
        }),
      );
    }

    // Add a user message so it's a valid session with messages
    lines.push(
      JSON.stringify({
        type: "event_msg",
        timestamp: new Date().toISOString(),
        payload: {
          type: "user_message",
          message: "Hello world",
        },
      }),
    );

    await writeFile(
      join(testDir, `${sessionId}.jsonl`),
      `${lines.join("\n")}\n`,
    );
  };

  it("identifies session as codex-oss when model_provider is ollama", async () => {
    const sessionId = "oss-session-1";
    await createSessionFile(sessionId, "ollama", "mistral");

    const summary = await reader.getSessionSummary(
      sessionId,
      "test-project" as UrlProjectId,
    );
    expect(summary?.provider).toBe("codex-oss");

    const session = await reader.getSession(
      sessionId,
      "test-project" as UrlProjectId,
    );
    expect(session?.data.provider).toBe("codex-oss");
  });

  it("identifies session as codex-oss when model_provider is local", async () => {
    const sessionId = "oss-session-2";
    await createSessionFile(sessionId, "local", "deepseek-coder");

    const summary = await reader.getSessionSummary(
      sessionId,
      "test-project" as UrlProjectId,
    );
    expect(summary?.provider).toBe("codex-oss");
  });

  it("identifies session as codex when model_provider is openai", async () => {
    const sessionId = "openai-session-1";
    await createSessionFile(sessionId, "openai", "gpt-4o");

    const summary = await reader.getSessionSummary(
      sessionId,
      "test-project" as UrlProjectId,
    );
    expect(summary?.provider).toBe("codex");
  });

  it("falls back to codex-oss based on model name (llama)", async () => {
    const sessionId = "heuristic-session-1";
    await createSessionFile(sessionId, undefined, "llama-3-8b");

    const summary = await reader.getSessionSummary(
      sessionId,
      "test-project" as UrlProjectId,
    );
    expect(summary?.provider).toBe("codex-oss");
  });

  it("falls back to codex-oss based on model name (qwen)", async () => {
    const sessionId = "heuristic-session-2";
    await createSessionFile(sessionId, undefined, "qwen2.5-coder");

    const summary = await reader.getSessionSummary(
      sessionId,
      "test-project" as UrlProjectId,
    );
    expect(summary?.provider).toBe("codex-oss");
  });

  it("defaults to codex when no provider and unknown model", async () => {
    const sessionId = "unknown-session";
    await createSessionFile(sessionId, undefined, "unknown-model");

    const summary = await reader.getSessionSummary(
      sessionId,
      "test-project" as UrlProjectId,
    );
    expect(summary?.provider).toBe("codex");
  });

  it("identifies codex based on model name (gpt-4)", async () => {
    const sessionId = "heuristic-openai";
    await createSessionFile(sessionId, undefined, "gpt-4-turbo");

    const summary = await reader.getSessionSummary(
      sessionId,
      "test-project" as UrlProjectId,
    );
    expect(summary?.provider).toBe("codex");
  });
});
