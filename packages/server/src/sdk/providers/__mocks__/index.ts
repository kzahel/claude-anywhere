/**
 * Mock providers for testing.
 *
 * This module provides mock implementations of all agent providers.
 * Use these for unit tests and dev server testing.
 *
 * @example
 * ```typescript
 * import { createMockProvider, createStandardScenario } from './providers/__mocks__';
 *
 * const provider = createMockProvider('claude', {
 *   scenarios: [createStandardScenario('session-1', 'Hello!')]
 * });
 * ```
 */

// Types
export type {
  MockAgentProvider,
  MockProviderConfig,
  MockScenario,
} from "./types.js";

// Base class
export { BaseMockProvider } from "./base.js";

// Mock providers
export {
  MockClaudeProvider,
  createClaudeScenario,
  createClaudeToolScenario,
  createClaudeApprovalScenario,
} from "./claude.js";
export {
  MockCodexProvider,
  MockCodexOSSProvider,
  createCodexScenario,
  createCodexToolScenario,
  createCodexErrorScenario,
} from "./codex.js";
export {
  MockGeminiProvider,
  createGeminiScenario,
  createGeminiToolScenario,
  createGeminiThoughtsScenario,
  createGeminiErrorScenario,
} from "./gemini.js";
export {
  MockOpenCodeProvider,
  createOpenCodeScenario,
  createOpenCodeToolScenario,
  createOpenCodeErrorScenario,
} from "./opencode.js";

// Factory functions
export {
  createMockProvider,
  createAllMockProviders,
  createMockProviderWithScenarios,
  createStandardScenario,
  createMultiTurnScenario,
  createToolUseScenario,
  MOCK_PROVIDER_TYPES,
} from "./factory.js";
