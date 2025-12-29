import type { ClaudeSDK, SDKMessage, SDKSessionOptions } from "./types.js";

// Placeholder for Phase 3 - real SDK integration
// Will use @anthropic-ai/claude-code package
export class RealClaudeSDK implements ClaudeSDK {
  // biome-ignore lint/correctness/useYield: Stub implementation throws before yielding
  async *startSession(
    _options: SDKSessionOptions,
  ): AsyncIterableIterator<SDKMessage> {
    throw new Error(
      "RealClaudeSDK not implemented - use MockClaudeSDK for testing. " +
        "Real SDK integration will be added in Phase 3.",
    );
  }
}
