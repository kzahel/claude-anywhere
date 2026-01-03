/**
 * Gemini Provider implementation using `gemini -o stream-json`.
 *
 * This provider enables using Google's Gemini CLI as an agent backend.
 * It spawns the Gemini CLI process and parses its JSON stream output.
 */

import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type {
  GeminiEvent,
  GeminiInitEvent,
  GeminiMessageEvent,
  GeminiResultEvent,
  GeminiStats,
  GeminiToolResultEvent,
  GeminiToolUseEvent,
} from "@claude-anywhere/shared";
import { parseGeminiEvent } from "@claude-anywhere/shared";
import { MessageQueue } from "../messageQueue.js";
import type { SDKMessage } from "../types.js";
import type {
  AgentProvider,
  AgentSession,
  AuthStatus,
  StartSessionOptions,
} from "./types.js";

/**
 * Configuration for Gemini provider.
 */
export interface GeminiProviderConfig {
  /** Path to gemini binary (auto-detected if not specified) */
  geminiPath?: string;
  /** Request timeout in ms (default: 300000 = 5 minutes) */
  timeout?: number;
}

/**
 * OAuth credentials from ~/.gemini/oauth_creds.json
 */
interface GeminiOAuthCreds {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type?: string;
}

/**
 * Gemini Provider implementation.
 *
 * Uses the Gemini CLI's `-o stream-json` mode for streaming responses.
 * Parses JSON stream output and normalizes events to our SDKMessage format.
 */
export class GeminiProvider implements AgentProvider {
  readonly name = "gemini" as const;
  readonly displayName = "Gemini";

  private readonly geminiPath?: string;
  private readonly timeout: number;

  constructor(config: GeminiProviderConfig = {}) {
    this.geminiPath = config.geminiPath;
    this.timeout = config.timeout ?? 300000; // 5 minutes default
  }

  /**
   * Check if the Gemini CLI is installed.
   */
  async isInstalled(): Promise<boolean> {
    const path = this.findGeminiPath();
    return path !== null;
  }

  /**
   * Check if Gemini is authenticated.
   */
  async isAuthenticated(): Promise<boolean> {
    const authStatus = await this.getAuthStatus();
    return authStatus.authenticated;
  }

  /**
   * Get detailed authentication status.
   */
  async getAuthStatus(): Promise<AuthStatus> {
    const installed = await this.isInstalled();
    if (!installed) {
      return {
        installed: false,
        authenticated: false,
        enabled: false,
      };
    }

    // Read OAuth credentials from ~/.gemini/oauth_creds.json
    const credsPath = join(homedir(), ".gemini", "oauth_creds.json");
    if (!existsSync(credsPath)) {
      return {
        installed: true,
        authenticated: false,
        enabled: false,
      };
    }

    try {
      const creds: GeminiOAuthCreds = JSON.parse(
        readFileSync(credsPath, "utf-8"),
      );

      // Check if tokens exist
      if (!creds.access_token && !creds.refresh_token) {
        return {
          installed: true,
          authenticated: false,
          enabled: false,
        };
      }

      // Check expiry
      let expiresAt: Date | undefined;
      let authenticated = true;
      if (creds.expiry_date) {
        expiresAt = new Date(creds.expiry_date);
        // If access token is expired but we have refresh token, still consider authenticated
        // The CLI will handle token refresh
        if (expiresAt < new Date() && !creds.refresh_token) {
          authenticated = false;
        }
      }

      return {
        installed: true,
        authenticated,
        enabled: authenticated,
        expiresAt,
      };
    } catch {
      return {
        installed: true,
        authenticated: false,
        enabled: false,
      };
    }
  }

  /**
   * Start a new Gemini session.
   */
  async startSession(options: StartSessionOptions): Promise<AgentSession> {
    const queue = new MessageQueue();
    const abortController = new AbortController();

    // Push initial message if provided
    if (options.initialMessage) {
      queue.push(options.initialMessage);
    }

    const iterator = this.runSession(
      options.cwd,
      queue,
      abortController.signal,
      options,
    );

    return {
      iterator,
      queue,
      abort: () => abortController.abort(),
    };
  }

  /**
   * Main session loop.
   */
  private async *runSession(
    cwd: string,
    queue: MessageQueue,
    signal: AbortSignal,
    options: StartSessionOptions,
  ): AsyncIterableIterator<SDKMessage> {
    const geminiPath = this.findGeminiPath();
    if (!geminiPath) {
      yield {
        type: "error",
        error: "Gemini CLI not found",
      } as SDKMessage;
      return;
    }

    // Generate a session ID
    const sessionId = `gemini-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Emit init message
    yield {
      type: "system",
      subtype: "init",
      session_id: sessionId,
      cwd,
    } as SDKMessage;

    // Wait for initial message from queue
    const messageGen = queue.generator();
    const firstMessage = await messageGen.next();
    if (firstMessage.done) {
      yield {
        type: "result",
        session_id: sessionId,
        result: "No message provided",
      } as SDKMessage;
      return;
    }

    // Extract text from the user message
    const userPrompt = this.extractTextFromMessage(firstMessage.value);

    // Emit user message
    yield {
      type: "user",
      session_id: sessionId,
      message: {
        role: "user",
        content: userPrompt,
      },
    } as SDKMessage;

    // Build gemini command arguments
    const args: string[] = [];

    // Set output mode to stream-json
    args.push("-o", "stream-json");

    // Add model if specified
    if (options.model) {
      args.push("-m", options.model);
    }

    // Note: Gemini CLI may have different permission flags
    // For now, we assume auto-approve is the default in agentic mode

    // Add the prompt
    args.push(userPrompt);

    // Spawn the gemini process
    let geminiProcess: ChildProcess;
    try {
      geminiProcess = spawn(geminiPath, args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
        },
      });
    } catch (error) {
      yield {
        type: "error",
        session_id: sessionId,
        error: `Failed to spawn Gemini process: ${error instanceof Error ? error.message : String(error)}`,
      } as SDKMessage;
      return;
    }

    // Handle abort
    const abortHandler = () => {
      geminiProcess.kill("SIGTERM");
    };
    signal.addEventListener("abort", abortHandler);

    // Set up timeout
    const timeoutId = setTimeout(() => {
      geminiProcess.kill("SIGTERM");
    }, this.timeout);

    try {
      // Parse JSON from stdout
      if (!geminiProcess.stdout) {
        yield {
          type: "error",
          session_id: sessionId,
          error: "Gemini process has no stdout",
        } as SDKMessage;
        return;
      }

      const rl = createInterface({
        input: geminiProcess.stdout,
        crlfDelay: Number.POSITIVE_INFINITY,
      });

      let realSessionId: string | undefined;
      let lastStats: GeminiStats | undefined;

      for await (const line of rl) {
        if (signal.aborted) break;

        const event = parseGeminiEvent(line);
        if (!event) continue;

        // Update real session ID from init event
        if (event.type === "init") {
          const init = event as GeminiInitEvent;
          realSessionId = init.session_id;
        }

        // Track stats from result event
        if (event.type === "result") {
          const result = event as GeminiResultEvent;
          lastStats = result.stats;
        }

        // Convert Gemini event to SDKMessage
        const sdkMessage = this.convertEventToSDKMessage(
          event,
          realSessionId ?? sessionId,
        );
        if (sdkMessage) {
          yield sdkMessage;
        }
      }

      // Wait for process to exit
      const exitCode = await new Promise<number | null>((resolve) => {
        geminiProcess.on("close", resolve);
        geminiProcess.on("error", () => resolve(null));
      });

      // Emit result message
      yield {
        type: "result",
        session_id: realSessionId ?? sessionId,
        exitCode,
        usage: lastStats
          ? {
              input_tokens: lastStats.input_tokens,
              output_tokens: lastStats.output_tokens,
            }
          : undefined,
      } as SDKMessage;
    } finally {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", abortHandler);

      // Ensure process is killed
      if (!geminiProcess.killed) {
        geminiProcess.kill("SIGTERM");
      }
    }
  }

  /**
   * Convert a Gemini event to an SDKMessage.
   */
  private convertEventToSDKMessage(
    event: GeminiEvent,
    sessionId: string,
  ): SDKMessage | null {
    switch (event.type) {
      case "init": {
        const init = event as GeminiInitEvent;
        return {
          type: "system",
          subtype: "init",
          session_id: init.session_id,
          model: init.model,
        } as SDKMessage;
      }

      case "message": {
        const msg = event as GeminiMessageEvent;
        if (msg.role === "user") {
          return {
            type: "user",
            session_id: sessionId,
            timestamp: msg.timestamp,
            message: {
              role: "user",
              content: msg.content,
            },
          } as SDKMessage;
        }
        // Assistant message
        return {
          type: "assistant",
          session_id: sessionId,
          timestamp: msg.timestamp,
          message: {
            role: "assistant",
            content: msg.content,
            // Delta messages are streamed chunks
          },
        } as SDKMessage;
      }

      case "tool_use": {
        const toolUse = event as GeminiToolUseEvent;
        return {
          type: "assistant",
          session_id: sessionId,
          timestamp: toolUse.timestamp,
          message: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: toolUse.tool_id,
                name: toolUse.tool_name,
                input: toolUse.parameters ?? {},
              },
            ],
          },
        } as SDKMessage;
      }

      case "tool_result": {
        const toolResult = event as GeminiToolResultEvent;
        return {
          type: "user",
          session_id: sessionId,
          timestamp: toolResult.timestamp,
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolResult.tool_id,
                content:
                  toolResult.status === "error"
                    ? (toolResult.error ?? "Tool error")
                    : (toolResult.output ?? ""),
              },
            ],
          },
        } as SDKMessage;
      }

      case "result": {
        // Result events are tracked for stats but don't emit a separate message
        // The final result is emitted after the process exits
        return null;
      }

      case "error": {
        return {
          type: "error",
          session_id: sessionId,
          error: event.error ?? event.message ?? "Unknown error",
        } as SDKMessage;
      }
    }

    return null;
  }

  /**
   * Extract text content from a user message.
   */
  private extractTextFromMessage(message: unknown): string {
    if (!message || typeof message !== "object") {
      return "";
    }

    // Handle UserMessage format
    const userMsg = message as { text?: string };
    if (typeof userMsg.text === "string") {
      return userMsg.text;
    }

    // Handle SDK message format
    const sdkMsg = message as {
      message?: { content?: string | unknown[] };
    };
    const content = sdkMsg.message?.content;

    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((block: unknown) => {
          if (typeof block === "string") return block;
          if (
            typeof block === "object" &&
            block !== null &&
            "type" in block &&
            (block as { type: string }).type === "text" &&
            "text" in block
          ) {
            return (block as { text: string }).text;
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }

    return "";
  }

  /**
   * Find the Gemini CLI path.
   */
  private findGeminiPath(): string | null {
    // Use configured path if provided
    if (this.geminiPath && existsSync(this.geminiPath)) {
      return this.geminiPath;
    }

    // Check common locations
    const commonPaths = [
      join(homedir(), ".local", "bin", "gemini"),
      "/usr/local/bin/gemini",
      join(homedir(), ".gemini", "bin", "gemini"),
      join(homedir(), "bin", "gemini"),
    ];

    for (const path of commonPaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    // Try to find in PATH using which
    try {
      const result = execSync("which gemini", { encoding: "utf-8" }).trim();
      if (result && existsSync(result)) {
        return result;
      }
    } catch {
      // Not in PATH
    }

    return null;
  }
}

/**
 * Default Gemini provider instance.
 */
export const geminiProvider = new GeminiProvider();
