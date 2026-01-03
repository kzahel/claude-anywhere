/**
 * Factory functions for creating mock providers.
 *
 * Provides a unified way to create mock providers for testing.
 */

import type { SDKMessage } from "../../types.js";
import type { ProviderName } from "../types.js";
import { MockClaudeProvider } from "./claude.js";
import { MockCodexProvider } from "./codex.js";
import { MockGeminiProvider } from "./gemini.js";
import type {
  MockAgentProvider,
  MockProviderConfig,
  MockScenario,
} from "./types.js";

/**
 * Create a mock provider by name.
 */
export function createMockProvider(
  type: ProviderName,
  config: MockProviderConfig = {},
): MockAgentProvider {
  switch (type) {
    case "claude":
      return new MockClaudeProvider(config);
    case "codex":
      return new MockCodexProvider(config);
    case "gemini":
      return new MockGeminiProvider(config);
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

/**
 * Create mock providers for all available provider types.
 */
export function createAllMockProviders(
  config: MockProviderConfig = {},
): Map<ProviderName, MockAgentProvider> {
  const providers = new Map<ProviderName, MockAgentProvider>();
  providers.set("claude", new MockClaudeProvider(config));
  providers.set("codex", new MockCodexProvider(config));
  providers.set("gemini", new MockGeminiProvider(config));
  return providers;
}

/**
 * Create a mock provider with pre-configured scenarios.
 */
export function createMockProviderWithScenarios(
  type: ProviderName,
  scenarios: MockScenario[],
): MockAgentProvider {
  return createMockProvider(type, { scenarios });
}

/**
 * Provider types available for parameterized testing.
 */
export const MOCK_PROVIDER_TYPES: ProviderName[] = [
  "claude",
  "codex",
  "gemini",
];

/**
 * Create a standard test scenario that works with any provider.
 * Returns normalized SDKMessage format.
 */
export function createStandardScenario(
  sessionId: string,
  response: string,
): MockScenario {
  return {
    messages: [
      {
        type: "system",
        subtype: "init",
        session_id: sessionId,
      },
      {
        type: "assistant",
        session_id: sessionId,
        message: {
          role: "assistant",
          content: response,
        },
      },
      {
        type: "result",
        session_id: sessionId,
      },
    ],
    delayMs: 10,
    sessionId,
  };
}

/**
 * Create a multi-turn conversation scenario.
 */
export function createMultiTurnScenario(
  sessionId: string,
  turns: Array<{ user: string; assistant: string }>,
): MockScenario {
  const messages: SDKMessage[] = [
    {
      type: "system",
      subtype: "init",
      session_id: sessionId,
    },
  ];

  for (const turn of turns) {
    messages.push({
      type: "user",
      session_id: sessionId,
      message: {
        role: "user",
        content: turn.user,
      },
    });
    messages.push({
      type: "assistant",
      session_id: sessionId,
      message: {
        role: "assistant",
        content: turn.assistant,
      },
    });
  }

  messages.push({
    type: "result",
    session_id: sessionId,
  });

  return {
    messages,
    delayMs: 10,
    sessionId,
  };
}

/**
 * Create a tool use scenario that works with any provider.
 */
export function createToolUseScenario(
  sessionId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResult: string,
  finalResponse: string,
): MockScenario {
  const toolUseId = `tool_${Date.now()}`;

  return {
    messages: [
      {
        type: "system",
        subtype: "init",
        session_id: sessionId,
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
      },
    ],
    delayMs: 10,
    sessionId,
  };
}
