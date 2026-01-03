import * as fs from "node:fs";
import * as path from "node:path";
import type { SDKMessage as AgentSDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { loadConfig } from "../config.js";

/**
 * Simple JSONL logger for raw SDK messages.
 * Captures exact message shapes for analysis.
 *
 * Enable via LOG_SDK_MESSAGES=true
 * Output: {logDir}/sdk-raw.jsonl
 */

let writeStream: fs.WriteStream | null = null;
let enabled = false;

/**
 * Initialize the SDK message logger.
 * Call once at server startup.
 */
export function initMessageLogger(): void {
  enabled = process.env.LOG_SDK_MESSAGES === "true";
  if (!enabled) return;

  const config = loadConfig();
  const logPath = path.join(config.logDir, "sdk-raw.jsonl");

  // Ensure log directory exists
  fs.mkdirSync(config.logDir, { recursive: true });

  // Open append stream
  writeStream = fs.createWriteStream(logPath, { flags: "a" });

  // Log startup
  logRaw({
    _meta: "logger_started",
    timestamp: new Date().toISOString(),
    pid: process.pid,
  });
}

/**
 * Log a raw SDK message.
 */
export function logSDKMessage(
  sessionId: string,
  message: AgentSDKMessage,
): void {
  if (!enabled || !writeStream) return;

  logRaw({
    _ts: Date.now(),
    _sid: sessionId,
    ...message,
  });
}

/**
 * Log any object as a raw line.
 */
function logRaw(obj: unknown): void {
  if (!writeStream) return;
  try {
    writeStream.write(`${JSON.stringify(obj)}\n`);
  } catch {
    // Ignore write errors
  }
}

/**
 * Close the logger.
 */
export function closeMessageLogger(): void {
  if (writeStream) {
    writeStream.end();
    writeStream = null;
  }
}
