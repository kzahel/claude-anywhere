# Phase 3: Real SDK Integration

## Goal

Replace the mock SDK with the real `@anthropic-ai/claude-code` SDK. By the end of this phase, we can start actual Claude sessions, queue messages, stream responses, and handle input requests — all against the real CLI.

## Dependencies to Add

```bash
pnpm --filter server add @anthropic-ai/claude-code @anthropic-ai/claude-agent-sdk
```

Note: `claude-agent-sdk` provides the newer query interface with better TypeScript types. We may use one or both depending on what works.

## Understanding the SDK

Based on claude-code-viewer's usage:

```typescript
import { query } from '@anthropic-ai/claude-code';
// or
import { query } from '@anthropic-ai/claude-agent-sdk';

// The query function takes a message generator and options
const iterator = await query(messageGenerator(), {
  cwd: '/path/to/project',
  resume: 'session-id',           // optional, for resuming
  abortController: controller,     // for cancellation
  permissionMode: 'default',       // or 'bypassPermissions'
  canUseTool: async (name, input) => { ... },  // approval callback
});

// It returns an async iterator of SDK messages
for await (const message of iterator) {
  // message.type: 'system' | 'assistant' | 'user' | 'result'
  // Handle each message...
}
```

The message generator is an async generator that yields user messages:

```typescript
async function* messageGenerator() {
  while (true) {
    const userMessage = await waitForNextMessage();
    yield {
      type: 'user',
      message: { role: 'user', content: userMessage.text },
    };
  }
}
```

## Implementation Plan

### 1. Message Queue Generator

```typescript
// packages/server/src/sdk/messageQueue.ts

export class MessageQueue {
  private queue: UserMessage[] = [];
  private waiting: ((msg: UserMessage) => void) | null = null;
  
  push(message: UserMessage): number {
    if (this.waiting) {
      this.waiting(message);
      this.waiting = null;
      return 0;
    }
    this.queue.push(message);
    return this.queue.length;
  }
  
  async *generator(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      const message = await this.next();
      yield this.toSDKMessage(message);
    }
  }
  
  private next(): Promise<UserMessage> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    
    return new Promise((resolve) => {
      this.waiting = resolve;
    });
  }
  
  private toSDKMessage(msg: UserMessage): SDKUserMessage {
    if (msg.images?.length || msg.documents?.length) {
      return {
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: msg.text },
            ...(msg.images ?? []),
            ...(msg.documents ?? []),
          ],
        },
      };
    }
    return {
      type: 'user',
      message: { role: 'user', content: msg.text },
    };
  }
  
  get depth(): number {
    return this.queue.length;
  }
}
```

### 2. Real SDK Implementation

```typescript
// packages/server/src/sdk/real.ts

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeSDK, SDKMessage, StartSessionOptions } from './types';
import { MessageQueue } from './messageQueue';

export class RealClaudeSDK implements ClaudeSDK {
  async startSession(options: StartSessionOptions): Promise<{
    iterator: AsyncIterableIterator<SDKMessage>;
    queue: MessageQueue;
    abort: () => void;
  }> {
    const queue = new MessageQueue();
    const abortController = new AbortController();
    
    // Push initial message into queue
    queue.push(options.initialMessage);
    
    const iterator = await query(queue.generator(), {
      cwd: options.cwd,
      resume: options.resumeSessionId,
      abortController,
      permissionMode: options.permissionMode ?? 'default',
      canUseTool: options.onToolApproval,
    });
    
    return {
      iterator,
      queue,
      abort: () => abortController.abort(),
    };
  }
}
```

### 3. Update SDK Types

```typescript
// packages/server/src/sdk/types.ts

export interface StartSessionOptions {
  cwd: string;
  initialMessage: UserMessage;
  resumeSessionId?: string;
  permissionMode?: 'default' | 'bypassPermissions' | 'plan';
  onToolApproval?: (toolName: string, input: unknown) => Promise<ToolApprovalResult>;
}

export interface StartSessionResult {
  iterator: AsyncIterableIterator<SDKMessage>;
  queue: MessageQueue;
  abort: () => void;
}

export interface ClaudeSDK {
  startSession(options: StartSessionOptions): Promise<StartSessionResult>;
}

export interface ToolApprovalResult {
  behavior: 'allow' | 'deny';
  message?: string;
}
```

### 4. Update Process to Use Queue

```typescript
// packages/server/src/supervisor/Process.ts (modifications)

class Process {
  private queue: MessageQueue;
  private abort: () => void;
  
  constructor(
    private iterator: AsyncIterableIterator<SDKMessage>,
    queue: MessageQueue,
    abort: () => void,
    options: ProcessOptions,
  ) {
    this.queue = queue;
    this.abort = abort;
    this.consumeIterator();
  }
  
  queueMessage(message: UserMessage): number {
    return this.queue.push(message);
  }
  
  get queueDepth(): number {
    return this.queue.depth;
  }
  
  async abortProcess(): Promise<void> {
    this.abort();
    // ... rest of cleanup
  }
  
  private async consumeIterator() {
    try {
      for await (const message of this.iterator) {
        this.handleMessage(message);
      }
    } catch (error) {
      this.emit({ type: 'error', error });
    } finally {
      this.emit({ type: 'state-change', state: { type: 'completed' } });
    }
  }
}
```

### 5. Input Request Handling

The SDK's `canUseTool` callback is how we handle approvals:

```typescript
// packages/server/src/supervisor/Process.ts

private pendingInputRequest: {
  request: InputRequest;
  resolve: (result: ToolApprovalResult) => void;
} | null = null;

private async handleToolApproval(
  toolName: string, 
  input: unknown
): Promise<ToolApprovalResult> {
  const request: InputRequest = {
    id: generateId(),
    sessionId: this.sessionId,
    type: 'tool-approval',
    prompt: `Allow ${toolName}?`,
    toolName,
    toolInput: input,
    timestamp: new Date().toISOString(),
  };
  
  this.state = { type: 'waiting-input', request };
  this.emit({ type: 'state-change', state: this.state });
  this.emit({ type: 'input-request', request });
  
  return new Promise((resolve) => {
    this.pendingInputRequest = { request, resolve };
  });
}

respondToInput(requestId: string, response: 'approve' | 'deny'): boolean {
  if (!this.pendingInputRequest || this.pendingInputRequest.request.id !== requestId) {
    return false;
  }
  
  const result: ToolApprovalResult = {
    behavior: response === 'approve' ? 'allow' : 'deny',
  };
  
  this.pendingInputRequest.resolve(result);
  this.pendingInputRequest = null;
  this.state = { type: 'running' };
  this.emit({ type: 'state-change', state: this.state });
  
  return true;
}
```

### 6. Session ID Extraction

The SDK emits an init message with the session ID:

```typescript
private handleMessage(message: SDKMessage) {
  // Capture session ID from init message
  if (message.type === 'system' && message.subtype === 'init') {
    this.sessionId = message.session_id;
  }
  
  // Update state based on message type
  if (message.type === 'result') {
    this.state = { type: 'idle', since: new Date() };
    this.startIdleTimer();
  }
  
  this.emit({ type: 'message', message });
}
```

### 7. CLI Path Resolution

```typescript
// packages/server/src/sdk/cliResolver.ts

import { execSync } from 'child_process';

export function resolveClaudeCLIPath(): string {
  // Environment variable override
  const envPath = process.env.CLAUDE_CLI_PATH;
  if (envPath) return envPath;
  
  // Try to find in PATH
  try {
    const result = execSync('which claude', { encoding: 'utf-8' });
    return result.trim();
  } catch {
    throw new Error(
      'Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code'
    );
  }
}
```

### 8. Configuration

```typescript
// packages/server/src/config.ts

export interface Config {
  claudeCliPath?: string;
  claudeProjectsDir: string;       // default: ~/.claude/projects
  idleTimeoutMs: number;           // default: 5 * 60 * 1000
  defaultPermissionMode: 'default' | 'bypassPermissions';
  port: number;
}

export function loadConfig(): Config {
  return {
    claudeCliPath: process.env.CLAUDE_CLI_PATH,
    claudeProjectsDir: process.env.CLAUDE_PROJECTS_DIR 
      ?? path.join(os.homedir(), '.claude', 'projects'),
    idleTimeoutMs: parseInt(process.env.IDLE_TIMEOUT_MS ?? '') || 5 * 60 * 1000,
    defaultPermissionMode: process.env.PERMISSION_MODE as any ?? 'default',
    port: parseInt(process.env.PORT ?? '') || 3400,
  };
}
```

## Testing

### Unit Tests (still use mock)

Keep existing tests using MockClaudeSDK. They should still pass.

### Integration Test with Real SDK

```typescript
// packages/server/test/integration/real-sdk.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RealClaudeSDK } from '../../src/sdk/real';
import { resolveClaudeCLIPath } from '../../src/sdk/cliResolver';

describe.runIf(process.env.TEST_REAL_SDK)('RealClaudeSDK', () => {
  let sdk: RealClaudeSDK;
  let testDir: string;
  
  beforeAll(async () => {
    // Verify CLI is available
    resolveClaudeCLIPath();
    sdk = new RealClaudeSDK();
    testDir = await createTempProject();
  });
  
  afterAll(async () => {
    await cleanupTempProject(testDir);
  });
  
  it('starts a session and receives init message', async () => {
    const { iterator, abort } = await sdk.startSession({
      cwd: testDir,
      initialMessage: { text: 'Say exactly: TEST_RESPONSE_123' },
      permissionMode: 'bypassPermissions',  // skip approvals for test
    });
    
    const messages: SDKMessage[] = [];
    
    try {
      for await (const message of iterator) {
        messages.push(message);
        
        // Abort after getting assistant response to save tokens
        if (message.type === 'assistant') {
          abort();
          break;
        }
      }
    } catch (e) {
      // AbortError is expected
    }
    
    expect(messages.some(m => m.type === 'system' && m.subtype === 'init')).toBe(true);
    expect(messages.some(m => m.type === 'assistant')).toBe(true);
  }, 60_000);  // Long timeout for real API
  
  it('aborts cleanly', async () => {
    const { iterator, abort } = await sdk.startSession({
      cwd: testDir,
      initialMessage: { text: 'Count to 1000 slowly' },
      permissionMode: 'bypassPermissions',
    });
    
    // Abort immediately
    abort();
    
    // Should complete without hanging
    const messages: SDKMessage[] = [];
    for await (const message of iterator) {
      messages.push(message);
    }
    
    // May or may not have messages, but shouldn't throw
    expect(true).toBe(true);
  }, 10_000);
});
```

### E2E Test via API

```typescript
// packages/server/test/e2e/session-flow.test.ts

describe.runIf(process.env.TEST_REAL_SDK)('E2E Session Flow', () => {
  let app: Hono;
  
  beforeAll(() => {
    const sdk = new RealClaudeSDK();
    app = createApp({ sdk });
  });
  
  it('creates session, streams response, goes idle', async () => {
    // Create a temp project dir
    const projectPath = await createTempProject();
    const projectId = encodeProjectId(projectPath);
    
    // Start session
    const createRes = await app.request(`/api/projects/${projectId}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Say hello' }),
    });
    
    expect(createRes.status).toBe(200);
    const { sessionId } = await createRes.json();
    
    // Connect to stream
    const streamRes = await app.request(`/api/sessions/${sessionId}/stream`);
    expect(streamRes.status).toBe(200);
    
    // Read events until idle
    const reader = streamRes.body.getReader();
    const events: any[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const text = new TextDecoder().decode(value);
      // Parse SSE events...
      events.push(...parseSSE(text));
      
      if (events.some(e => e.type === 'status' && e.state === 'idle')) {
        break;
      }
    }
    
    expect(events.some(e => e.type === 'message')).toBe(true);
  }, 120_000);
});
```

## File Changes

### New Files
```
packages/server/src/
├── config.ts
├── sdk/
│   ├── messageQueue.ts
│   ├── cliResolver.ts
│   └── real.ts (rewrite)
└── test/
    ├── integration/
    │   └── real-sdk.test.ts
    └── e2e/
        └── session-flow.test.ts
```

### Modified Files
```
packages/server/src/
├── sdk/types.ts        # Add StartSessionResult, queue types
├── supervisor/Process.ts   # Use MessageQueue, handle real lifecycle
├── supervisor/Supervisor.ts  # Wire up real SDK
└── index.ts            # Load config, inject real SDK
```

## Verification Checklist

- [ ] `pnpm --filter server add @anthropic-ai/claude-code @anthropic-ai/claude-agent-sdk` succeeds
- [ ] Existing mock-based tests still pass
- [ ] `resolveClaudeCLIPath()` finds CLI or throws helpful error
- [ ] MessageQueue correctly blocks until message available
- [ ] Server starts with real SDK (no immediate errors)
- [ ] Manual test: start session via API, see response in stream
- [ ] Manual test: queue a second message while first is processing
- [ ] Manual test: abort a running process
- [ ] Optional: `TEST_REAL_SDK=1 pnpm test` runs integration tests

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CLAUDE_CLI_PATH` | Path to claude binary | auto-detect via `which` |
| `CLAUDE_PROJECTS_DIR` | Where to scan for projects | `~/.claude/projects` |
| `IDLE_TIMEOUT_MS` | Kill process after idle | `300000` (5 min) |
| `PERMISSION_MODE` | Default approval mode | `default` |
| `PORT` | Server port | `3400` |
| `TEST_REAL_SDK` | Run real SDK tests | unset |

## Open Questions

1. **SDK package**: `@anthropic-ai/claude-code` vs `@anthropic-ai/claude-agent-sdk` — need to verify which is current/preferred
2. **Message format mapping**: Our `SDKMessage` type vs what the SDK actually emits — may need adjustment
3. **Error recovery**: What happens if CLI crashes mid-session? Emit error event and mark completed?

## Out of Scope

- Client UI updates
- Push notifications
- File upload handling
- External session detection (Phase 4?)
