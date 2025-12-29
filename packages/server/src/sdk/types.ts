// Core types for Claude SDK abstraction

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "image";
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

export interface SDKMessage {
  type: "system" | "assistant" | "user" | "result" | "error";
  subtype?: string;
  session_id?: string;
  message?: {
    content: string | ContentBlock[];
    role?: string;
  };
  // Tool use related
  tool_use_id?: string;
  tool_name?: string;
  tool_input?: unknown;
  // Input requests (tool approval, questions, etc.)
  input_request?: {
    id: string;
    type: "tool-approval" | "question" | "choice";
    prompt: string;
    options?: string[];
  };
}

export interface UserMessage {
  text: string;
  images?: string[]; // base64 or file paths
  documents?: string[];
}

export interface SDKSessionOptions {
  cwd: string;
  resume?: string; // session ID to resume
}

export interface ClaudeSDK {
  startSession(options: SDKSessionOptions): AsyncIterableIterator<SDKMessage>;
}
