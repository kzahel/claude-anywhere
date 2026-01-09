# Multi-Provider Integration

Yep Anywhere supports multiple AI agent providers. This document covers the architecture, current implementations, and future directions.

## Provider Architecture

All providers implement a common interface, enabling seamless substitution:

```typescript
interface AgentProvider {
  readonly name: ProviderName;           // "claude" | "codex" | "gemini"
  isInstalled(): Promise<boolean>;
  isAuthenticated(): Promise<boolean>;
  startSession(options): Promise<AgentSession>;
}

interface AgentSession {
  iterator: AsyncIterableIterator<SDKMessage>;  // Message stream
  queue: MessageQueue;                           // Send user messages
  abort: () => void;                             // Cancel session
  sessionId?: string;
}
```

Each provider also has a session reader for loading persisted sessions from disk.

## Provider Comparison

| Aspect | Claude | Codex | Codex-OSS | Gemini | OpenCode |
|--------|--------|-------|-----------|--------|----------|
| **Integration** | Node.js SDK | Node.js SDK | Node.js SDK | CLI subprocess | HTTP/SSE subprocess |
| **Auth** | API key or OAuth | OAuth + API key | Local model config | OAuth | Per-provider config |
| **Session Format** | JSONL (DAG) | JSONL (Linear) | JSONL (Linear) | JSON (Linear) | SQLite |
| **Storage** | `~/.claude/projects/` | `~/.codex/sessions/` | `~/.codex/sessions/` | `~/.gemini/tmp/` | `~/.local/share/opencode/` |
| **Message Pattern** | Continuous stream | Turn-based events | Turn-based events | Per-message spawn | SSE stream |
| **Context Window** | 200K tokens | 200K tokens | Varies by model | 1M tokens | Varies by model |
| **Subagents** | Yes (Task tool) | No | No | No | No |
| **Local Models** | No | Yes | Yes | No | Yes (Ollama, LM Studio, llama.cpp) |
| **Edit Transparency** | Full | Black box | Full (shell-only) | N/A (read-only) | Full |

---

## Claude Provider

**Implementation:** `packages/server/src/sdk/providers/claude.ts`

Uses the official `@anthropic-ai/claude-agent-sdk`. The SDK provides:
- Long-running process with continuous message streaming
- Built-in session persistence to JSONL files
- Tool approval via callback mechanism
- DAG-based conversation structure (branching/rewinding)
- Subagent support via Task tool

### Process Lifecycle

1. SDK's `query()` function starts the agent
2. `MessageQueue` generator feeds user messages to SDK
3. SDK iterator yields messages in real-time
4. Sessions auto-persist to `~/.claude/projects/<hash>/<sessionId>.jsonl`

### Session Format

JSONL with DAG structure:
```json
{"type":"user","uuid":"abc","parentUuid":null,"message":{"content":"..."}}
{"type":"assistant","uuid":"def","parentUuid":"abc","message":{"content":[...]}}
```

The `parentUuid` field enables conversation branching - rewinding to a previous message creates a new branch.

---

## Codex Provider

**Implementation:** `packages/server/src/sdk/providers/codex.ts`

Uses `@openai/codex-sdk`. Key difference from Claude: **turn-based** rather than continuous streaming.

### Process Lifecycle

1. Start or resume a thread via SDK
2. For each user message:
   - Call `thread.runStreamed(prompt)`
   - Process events until turn completes
3. Events include: reasoning, messages, commands, file changes, MCP tools, web search

### Local Model Support

Codex can run local models, making it useful for:
- Offline development
- Privacy-sensitive work
- Cost reduction

### Session Format

JSONL with linear structure at `~/.codex/sessions/YYYY/MM/DD/`:
```json
{"type":"session_meta","payload":{"id":"...","cwd":"...","timestamp":"..."}}
{"type":"response_item","payload":{"item":{"type":"reasoning","text":"..."}}}
{"type":"event_msg","payload":{"role":"assistant","content":"..."}}
```

---

## Gemini Provider

**Implementation:** `packages/server/src/sdk/providers/gemini.ts`

**Current approach:** Spawns Gemini CLI as subprocess for each message.

### Why CLI Instead of SDK?

The Gemini CLI handles:
- OAuth authentication
- Session persistence
- Tool registration and execution
- Context management

Using the CLI avoids reimplementing all of this.

### Process Lifecycle

```bash
# First message
gemini -o stream-json "user prompt"

# Subsequent messages (resume conversation)
gemini -o stream-json --resume <sessionId> "user prompt"
```

Each message spawns a new process. The `--resume` flag loads conversation history from disk.

### Session Format

JSON files at `~/.gemini/tmp/<projectHash>/chats/`:
```json
{
  "sessionId": "abc-123",
  "projectHash": "...",
  "startTime": "2024-01-01T00:00:00Z",
  "messages": [
    {"type": "user", "content": "...", "timestamp": "..."},
    {"type": "gemini", "content": "...", "toolCalls": [...], "thoughts": [...]}
  ]
}
```

---

## Gemini Integration: Deep Dive

### Current Limitations

**~2.5 second overhead per message** from:

| Component | Time |
|-----------|------|
| Node.js startup | ~0.75s |
| Module loading (493MB, 42k files) | ~1.5s |
| API call | ~2-3s |

Major dependencies causing slow startup:
- `@opentelemetry` - 128MB
- `googleapis` - 111MB
- `node-pty` - 63MB

**No persistent stdin mode.** The `-i` (interactive) flag explicitly rejects piped stdin:
```
Error: The --prompt-interactive flag cannot be used when input is piped from stdin.
```

**TTY mode is unusable** for automation. Output includes:
- Animated spinners (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`)
- ANSI escape codes for colors, cursor movement
- Box-drawing UI elements
- Full screen redraws ~10x/second

### What `stream-json` Provides

```json
{"type":"init","session_id":"...","model":"gemini-2.5-flash"}
{"type":"message","role":"user","content":"..."}
{"type":"tool_use","tool_name":"read_file","tool_id":"...","parameters":{}}
{"type":"tool_result","tool_id":"...","status":"success","output":"..."}
{"type":"message","role":"assistant","content":"..."}
{"type":"result","status":"success","stats":{"input_tokens":1000,"output_tokens":50}}
```

### What `stream-json` Does NOT Provide

**Thoughts/reasoning** - The internal Gemini format includes:
```json
{
  "thoughts": [
    {
      "subject": "Analyzing the request",
      "description": "I'm considering how to approach...",
      "timestamp": "..."
    }
  ]
}
```

These are visible in Gemini's persisted JSON but **not exposed in stream-json output**.

**Tool metadata** - Display names, descriptions, markdown rendering hints.

**Per-message tokens** - Only aggregate stats at end.

### Antigravity (Google's VS Code Fork)

Google's internal tooling uses a richer format:
- Protocol Buffers (`.pb` files) at `~/.gemini/antigravity/`
- Full thought chains exposed
- Different (internal) API

This confirms Google has a richer internal API - they just don't expose it publicly.

---

## Path Forward: Direct Gemini API

The `@google/genai` SDK (not the CLI) **does** support thoughts:

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    thinkingConfig: {
      includeThoughts: true,
      thinkingBudget: -1  // Dynamic
    }
  }
});

const response = await model.generateContent("...");

for (const part of response.response.candidates[0].content.parts) {
  if (part.thought) {
    console.log("Thought:", part.text);
  } else {
    console.log("Answer:", part.text);
  }
}
```

### Trade-offs

| Approach | Thoughts | Tool Calls | Sessions | Startup |
|----------|----------|------------|----------|---------|
| CLI + stream-json | No | Yes | Managed by CLI | ~2.5s/msg |
| Direct `@google/genai` | Yes | Yes | DIY | ~0s |

### Migration Path

1. **Current (CLI):** Good for viewing existing Gemini sessions. Low implementation cost.
2. **Future (Direct API):** Full feature parity. Requires:
   - Session persistence implementation
   - Tool registration system
   - Context window management
   - OAuth token handling

The current CLI approach lets users see their Gemini work alongside Claude sessions without building a full provider from scratch.

---

## Adding New Providers

To add a provider:

1. **Implement `AgentProvider`** in `packages/server/src/sdk/providers/`
   - Authentication checks
   - Session startup
   - Message streaming

2. **Implement `ISessionReader`** in `packages/server/src/sessions/`
   - List sessions from disk
   - Parse session format
   - Convert to common `SDKMessage` format

3. **Register** in `packages/server/src/sdk/providers/index.ts`

4. **Add schemas** in `packages/shared/src/` for session validation

---

## Session Reader Interface

All readers implement:

```typescript
interface ISessionReader {
  listSessions(projectId): Promise<SessionSummary[]>;
  getSession(sessionId, projectId): Promise<Session | null>;
  getSessionSummaryIfChanged(sessionId, projectId, mtime, size): Promise<...>;
  getAgentMappings(): Promise<{toolUseId, agentId}[]>;
  getAgentSession(agentId): Promise<{messages, status} | null>;
}
```

Key design decisions:
- **Preserve all fields** - Don't strip SDK-specific data; frontend can inspect
- **Normalize types** - Convert provider formats to common `SDKMessage`
- **Lazy loading** - Agent sessions loaded on-demand
- **Caching** - Session metadata cached with TTL

---

## References

- Claude SDK: `@anthropic-ai/claude-agent-sdk`
- Codex SDK: `@openai/codex-sdk`
- Gemini API: `@google/genai` (https://ai.google.dev/gemini-api/docs)
- Gemini CLI: https://geminicli.com/docs/cli/headless/
