/**
 * Tests for Gemini event schema parsing.
 *
 * These tests verify parsing of actual Gemini CLI stream-json output format.
 */

import { describe, expect, it } from "vitest";
import { parseGeminiEvent } from "../../src/gemini-schema/events.js";

describe("parseGeminiEvent", () => {
  describe("init events", () => {
    it("should parse init event", () => {
      const line = JSON.stringify({
        type: "init",
        timestamp: "2026-01-03T16:55:40.045Z",
        session_id: "225478c2-5332-4800-8999-7c7f5dc03d44",
        model: "auto-gemini-2.5",
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("init");
      if (event?.type === "init") {
        expect(event.session_id).toBe("225478c2-5332-4800-8999-7c7f5dc03d44");
        expect(event.model).toBe("auto-gemini-2.5");
        expect(event.timestamp).toBe("2026-01-03T16:55:40.045Z");
      }
    });
  });

  describe("message events", () => {
    it("should parse user message event", () => {
      const line = JSON.stringify({
        type: "message",
        timestamp: "2026-01-03T16:55:40.047Z",
        role: "user",
        content: "Say hello world and nothing else",
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("message");
      if (event?.type === "message") {
        expect(event.role).toBe("user");
        expect(event.content).toBe("Say hello world and nothing else");
      }
    });

    it("should parse assistant message event", () => {
      const line = JSON.stringify({
        type: "message",
        timestamp: "2026-01-03T16:55:43.189Z",
        role: "assistant",
        content: "hello world",
        delta: true,
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("message");
      if (event?.type === "message") {
        expect(event.role).toBe("assistant");
        expect(event.content).toBe("hello world");
        expect(event.delta).toBe(true);
      }
    });

    it("should parse assistant message without delta flag", () => {
      const line = JSON.stringify({
        type: "message",
        role: "assistant",
        content: "Complete response",
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("message");
      if (event?.type === "message") {
        expect(event.role).toBe("assistant");
        expect(event.delta).toBeUndefined();
      }
    });
  });

  describe("tool_use events", () => {
    it("should parse tool_use event", () => {
      const line = JSON.stringify({
        type: "tool_use",
        timestamp: "2026-01-03T16:57:04.279Z",
        tool_name: "list_directory",
        tool_id: "list_directory-1767459424279-756cb8408b25c",
        parameters: { dir_path: "." },
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("tool_use");
      if (event?.type === "tool_use") {
        expect(event.tool_name).toBe("list_directory");
        expect(event.tool_id).toBe(
          "list_directory-1767459424279-756cb8408b25c",
        );
        expect(event.parameters).toEqual({ dir_path: "." });
      }
    });

    it("should parse tool_use event without parameters", () => {
      const line = JSON.stringify({
        type: "tool_use",
        tool_name: "get_cwd",
        tool_id: "get_cwd-123",
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("tool_use");
      if (event?.type === "tool_use") {
        expect(event.parameters).toBeUndefined();
      }
    });
  });

  describe("tool_result events", () => {
    it("should parse successful tool_result event", () => {
      const line = JSON.stringify({
        type: "tool_result",
        timestamp: "2026-01-03T16:57:04.317Z",
        tool_id: "list_directory-1767459424279-756cb8408b25c",
        status: "success",
        output: "Listed 18 item(s). (5 ignored)",
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("tool_result");
      if (event?.type === "tool_result") {
        expect(event.tool_id).toBe(
          "list_directory-1767459424279-756cb8408b25c",
        );
        expect(event.status).toBe("success");
        expect(event.output).toBe("Listed 18 item(s). (5 ignored)");
      }
    });

    it("should parse error tool_result event", () => {
      const line = JSON.stringify({
        type: "tool_result",
        tool_id: "read_file-456",
        status: "error",
        error: "File not found",
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("tool_result");
      if (event?.type === "tool_result") {
        expect(event.status).toBe("error");
        expect(event.error).toBe("File not found");
      }
    });
  });

  describe("result events", () => {
    it("should parse successful result event", () => {
      const line = JSON.stringify({
        type: "result",
        timestamp: "2026-01-03T16:55:43.195Z",
        status: "success",
        stats: {
          total_tokens: 11974,
          input_tokens: 11640,
          output_tokens: 50,
          cached: 5502,
          input: 6138,
          duration_ms: 3150,
          tool_calls: 0,
        },
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("result");
      if (event?.type === "result") {
        expect(event.status).toBe("success");
        expect(event.stats?.total_tokens).toBe(11974);
        expect(event.stats?.input_tokens).toBe(11640);
        expect(event.stats?.output_tokens).toBe(50);
        expect(event.stats?.duration_ms).toBe(3150);
        expect(event.stats?.tool_calls).toBe(0);
      }
    });

    it("should parse error result event", () => {
      const line = JSON.stringify({
        type: "result",
        status: "error",
        error: "API rate limit exceeded",
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("result");
      if (event?.type === "result") {
        expect(event.status).toBe("error");
        expect(event.error).toBe("API rate limit exceeded");
      }
    });

    it("should parse cancelled result event", () => {
      const line = JSON.stringify({
        type: "result",
        status: "cancelled",
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("result");
      if (event?.type === "result") {
        expect(event.status).toBe("cancelled");
      }
    });
  });

  describe("error events", () => {
    it("should parse error event", () => {
      const line = JSON.stringify({
        type: "error",
        error: "API rate limit exceeded",
        code: "RATE_LIMIT",
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("error");
      if (event?.type === "error") {
        expect(event.error).toBe("API rate limit exceeded");
        expect(event.code).toBe("RATE_LIMIT");
      }
    });

    it("should parse error event with message", () => {
      const line = JSON.stringify({
        type: "error",
        message: "Connection failed",
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("error");
      if (event?.type === "error") {
        expect(event.message).toBe("Connection failed");
      }
    });
  });

  describe("error handling", () => {
    it("should return null for invalid JSON", () => {
      const event = parseGeminiEvent("not json");
      expect(event).toBeNull();
    });

    it("should return null for empty string", () => {
      const event = parseGeminiEvent("");
      expect(event).toBeNull();
    });

    it("should handle unknown event types gracefully", () => {
      const line = JSON.stringify({
        type: "unknown_type",
        data: "some data",
      });

      const event = parseGeminiEvent(line);
      // Unknown types are returned as-is for forward compatibility
      expect(event).not.toBeNull();
    });

    it("should return null for objects without type field", () => {
      const line = JSON.stringify({
        data: "no type field",
      });

      const event = parseGeminiEvent(line);
      expect(event).toBeNull();
    });
  });
});
