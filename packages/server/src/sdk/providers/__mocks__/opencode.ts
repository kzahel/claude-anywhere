/**
 * Mock OpenCode provider for testing.
 *
 * Simulates OpenCode server behavior without requiring the CLI.
 */

import type { SDKMessage } from "../../types.js";
import type { ProviderName } from "../types.js";
import { BaseMockProvider } from "./base.js";
import type { MockProviderConfig, MockScenario } from "./types.js";

/**
 * Mock OpenCode provider.
 * Extends BaseMockProvider with OpenCode-specific defaults.
 */
export class MockOpenCodeProvider extends BaseMockProvider {
  readonly name: ProviderName = "opencode";
  readonly displayName = "OpenCode";

  constructor(config: MockProviderConfig = {}) {
    super(config);
  }
}

/**
 * Create a simple OpenCode response scenario.
 */
export function createOpenCodeScenario(
  sessionId: string,
  assistantResponse: string,
  options: { delayMs?: number; model?: string } = {},
): MockScenario {
  const messages: SDKMessage[] = [
    {
      type: "system",
      subtype: "init",
      session_id: sessionId,
      model: options.model ?? "opencode/big-pickle",
    },
    {
      type: "assistant",
      session_id: sessionId,
      message: {
        role: "assistant",
        content: assistantResponse,
      },
    },
    {
      type: "result",
      session_id: sessionId,
      usage: {
        input_tokens: 50,
        output_tokens: 30,
      },
    },
  ];

  return {
    messages,
    delayMs: options.delayMs ?? 10,
    sessionId,
  };
}

/**
 * Create an OpenCode tool use scenario.
 */
export function createOpenCodeToolScenario(
  sessionId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResult: string,
  finalResponse: string,
): MockScenario {
  const toolUseId = `prt_${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  return {
    messages: [
      {
        type: "system",
        subtype: "init",
        session_id: sessionId,
        model: "opencode/big-pickle",
      },
      {
        type: "assistant",
        session_id: sessionId,
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: toolUseId,
              name: toolName,
              input: toolInput,
            },
          ],
        },
      },
      {
        type: "user",
        session_id: sessionId,
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolUseId,
              content: toolResult,
            },
          ],
        },
      },
      {
        type: "assistant",
        session_id: sessionId,
        message: {
          role: "assistant",
          content: finalResponse,
        },
      },
      {
        type: "result",
        session_id: sessionId,
        usage: {
          input_tokens: 120,
          output_tokens: 60,
        },
      },
    ],
    delayMs: 10,
    sessionId,
  };
}

/**
 * Create an OpenCode error scenario.
 */
export function createOpenCodeErrorScenario(
  sessionId: string,
  errorMessage: string,
): MockScenario {
  return {
    messages: [
      {
        type: "system",
        subtype: "init",
        session_id: sessionId,
      },
      {
        type: "error",
        session_id: sessionId,
        error: errorMessage,
      },
    ],
    delayMs: 10,
    sessionId,
  };
}
