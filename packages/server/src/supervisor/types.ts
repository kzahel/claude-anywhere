import type { SDKMessage } from "../sdk/types.js";

// Constants
export const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const SESSION_TITLE_MAX_LENGTH = 50;

// Project ID encoding/decoding (base64url)
export function encodeProjectId(path: string): string {
  return Buffer.from(path).toString("base64url");
}

export function decodeProjectId(id: string): string {
  return Buffer.from(id, "base64url").toString("utf-8");
}

// Project discovery
export interface Project {
  id: string; // base64url encoded path
  path: string; // absolute path
  name: string; // directory name
  sessionCount: number;
}

// Session status
export type SessionStatus =
  | { state: "idle" } // no active process
  | { state: "owned"; processId: string } // we control it
  | { state: "external" }; // another process owns it

// Session metadata (light, for lists)
export interface SessionSummary {
  id: string;
  projectId: string;
  title: string | null; // first 50 chars of first user message
  createdAt: string; // ISO timestamp
  updatedAt: string;
  messageCount: number;
  status: SessionStatus;
}

// Content block in messages
export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

// Message representation
export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string | ContentBlock[];
  timestamp: string;
  toolUse?: {
    id: string;
    name: string;
    input: unknown;
  };
}

// Full session with messages
export interface Session extends SessionSummary {
  messages: Message[];
}

// Process state types
export type ProcessStateType = "running" | "idle" | "waiting-input";

// Input request (tool approval, question, etc.)
export interface InputRequest {
  id: string;
  sessionId: string;
  type: "tool-approval" | "question" | "choice";
  prompt: string;
  options?: string[]; // for choice type
  toolName?: string; // for tool-approval
  toolInput?: unknown; // for tool-approval
  timestamp: string;
}

// Process state machine
export type ProcessState =
  | { type: "running" }
  | { type: "idle"; since: Date }
  | { type: "waiting-input"; request: InputRequest };

// Process info (for API responses)
export interface ProcessInfo {
  id: string;
  sessionId: string;
  projectId: string;
  projectPath: string;
  state: ProcessStateType;
  startedAt: string;
  queueDepth: number;
}

// Process events for subscribers
export type ProcessEvent =
  | { type: "message"; message: SDKMessage }
  | { type: "state-change"; state: ProcessState }
  | { type: "error"; error: Error }
  | { type: "complete" };

// Process options
export interface ProcessOptions {
  projectPath: string;
  projectId: string;
  sessionId: string;
  idleTimeoutMs?: number; // default 5 minutes
}
