# Phase 2: API Design, Supervisor Skeleton, Testing Strategy

## Goal

Define the API surface, build the Supervisor structure with mock SDK, and establish the testing patterns. By the end of this phase, we can "start a session" and "send messages" against a fake Claude that emits canned responses — fully testable without tokens.

## API Routes

### Projects

```
GET  /api/projects
     → { projects: Project[] }

GET  /api/projects/:projectId
     → { project: Project, sessions: SessionSummary[] }
```

Projects are discovered by scanning `~/.claude/projects/`. The `projectId` is the base64-encoded absolute path (matching claude-code-viewer's convention for simplicity, or we pick something simpler like a hash).

### Sessions

```
GET  /api/projects/:projectId/sessions
     → { sessions: SessionSummary[] }

GET  /api/projects/:projectId/sessions/:sessionId
     → { session: Session, messages: Message[], status: SessionStatus }

POST /api/projects/:projectId/sessions
     body: { message: string, images?: [], documents?: [] }
     → { sessionId: string, processId: string }
     Starts a new session.

POST /api/projects/:projectId/sessions/:sessionId/resume
     body: { message: string, images?: [], documents?: [] }
     → { processId: string }
     Resumes an existing session with a new process.

POST /api/sessions/:sessionId/messages
     body: { message: string, images?: [], documents?: [] }
     → { queued: true, position: number }
     Queues a message to an active session.
```

### Processes

```
GET  /api/processes
     → { processes: ProcessInfo[] }
     Lists all active processes.

POST /api/processes/:processId/abort
     → { aborted: true }
     Kills a running process.
```

### Streaming

```
GET  /api/sessions/:sessionId/stream
     → SSE stream
     
     Events:
       - message: { type: 'assistant' | 'user' | 'system', ... }
       - status: { state: 'running' | 'idle' | 'waiting-input', ... }
       - error: { message: string }
       - heartbeat: { timestamp: string }
     
     Headers:
       Last-Event-ID: resume from this point
```

### Input Requests (approvals, questions, etc.)

```
GET  /api/sessions/:sessionId/pending-input
     → { request: InputRequest | null }

POST /api/sessions/:sessionId/input
     body: { requestId: string, response: 'approve' | 'deny' | string }
     → { accepted: true }
```

## Data Types

```typescript
// Project discovery
interface Project {
  id: string;           // encoded path or hash
  path: string;         // absolute path
  name: string;         // directory name
  sessionCount: number;
}

// Session metadata (light, for lists)
interface SessionSummary {
  id: string;
  projectId: string;
  title: string | null;       // first user message or generated
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  status: SessionStatus;
}

type SessionStatus = 
  | { state: 'idle' }                              // no process
  | { state: 'owned'; processId: string }          // we control it
  | { state: 'external' }                          // another process owns it

// Full session (for detail view)
interface Session extends SessionSummary {
  messages: Message[];
}

// Message (simplified — real schema is complex)
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
  timestamp: string;
  // ... tool use, etc. — flesh out as needed
}

// Active process
interface ProcessInfo {
  id: string;
  sessionId: string;
  projectId: string;
  state: 'running' | 'idle' | 'waiting-input';
  startedAt: string;
  queueDepth: number;
}

// Input request (tool approval, question, etc.)
interface InputRequest {
  id: string;
  sessionId: string;
  type: 'tool-approval' | 'question' | 'choice';
  prompt: string;
  options?: string[];       // for choice type
  toolName?: string;        // for tool-approval
  toolInput?: unknown;      // for tool-approval
  timestamp: string;
}
```

## Supervisor Structure

```typescript
// packages/server/src/supervisor/Supervisor.ts

class Supervisor {
  private processes: Map<string, Process> = new Map();
  
  constructor(private sdk: ClaudeSDK) {}  // SDK is injected — real or mock
  
  async startSession(projectPath: string, message: UserMessage): Promise<Process>
  async resumeSession(sessionId: string, message: UserMessage): Promise<Process>
  
  getProcess(processId: string): Process | undefined
  getProcessForSession(sessionId: string): Process | undefined
  getAllProcesses(): Process[]
  
  async abortProcess(processId: string): Promise<void>
}

// packages/server/src/supervisor/Process.ts

class Process {
  readonly id: string;
  readonly sessionId: string;
  readonly projectPath: string;
  
  private queue: UserMessage[] = [];
  private state: ProcessState;
  private idleTimer: Timer | null = null;
  
  constructor(private sdkIterator: AsyncIterator<SDKMessage>, options: ProcessOptions)
  
  queueMessage(message: UserMessage): number  // returns queue position
  subscribe(listener: (event: ProcessEvent) => void): () => void
  abort(): Promise<void>
}

type ProcessState = 
  | { type: 'running' }
  | { type: 'idle'; since: Date }
  | { type: 'waiting-input'; request: InputRequest }

type ProcessEvent =
  | { type: 'message'; message: SDKMessage }
  | { type: 'state-change'; state: ProcessState }
  | { type: 'error'; error: Error }
```

## SDK Abstraction

```typescript
// packages/server/src/sdk/types.ts

interface ClaudeSDK {
  startSession(options: {
    cwd: string;
    resume?: string;
  }): AsyncIterableIterator<SDKMessage>;
}

// packages/server/src/sdk/real.ts

import { query } from '@anthropic-ai/claude-code';

class RealClaudeSDK implements ClaudeSDK {
  async *startSession(options) {
    const messageGenerator = createMessageGenerator();
    const iterator = await query(messageGenerator, {
      cwd: options.cwd,
      resume: options.resume,
      // ...
    });
    yield* iterator;
  }
}

// packages/server/src/sdk/mock.ts

class MockClaudeSDK implements ClaudeSDK {
  constructor(private scenario: SDKMessage[][]) {}
  
  async *startSession(options) {
    const messages = this.scenario.shift() ?? [];
    for (const msg of messages) {
      await delay(10);  // simulate async
      yield msg;
    }
  }
}
```

## Testing Strategy

### Unit Tests (Vitest)

Test Supervisor and Process with MockClaudeSDK:

```typescript
// packages/server/test/supervisor.test.ts

describe('Supervisor', () => {
  it('starts a session and emits messages', async () => {
    const scenario = [[
      { type: 'system', subtype: 'init', session_id: 'sess-123' },
      { type: 'assistant', message: { content: 'Hello!' } },
      { type: 'result', session_id: 'sess-123' },
    ]];
    
    const sdk = new MockClaudeSDK(scenario);
    const supervisor = new Supervisor(sdk);
    
    const process = await supervisor.startSession('/tmp/test', { text: 'hi' });
    const messages: SDKMessage[] = [];
    
    process.subscribe((event) => {
      if (event.type === 'message') messages.push(event.message);
    });
    
    await waitFor(() => messages.length === 3);
    
    expect(messages[0].type).toBe('system');
    expect(messages[1].type).toBe('assistant');
    expect(process.state.type).toBe('idle');
  });
  
  it('queues messages while running', async () => {
    // ... test queue behavior
  });
  
  it('kills process on idle timeout', async () => {
    // ... test idle cleanup
  });
});
```

### API Tests

Test routes with Supervisor using mocks:

```typescript
// packages/server/test/api/sessions.test.ts

describe('POST /api/projects/:id/sessions', () => {
  it('starts session and returns processId', async () => {
    const app = createApp({ sdk: mockSdk });
    
    const res = await app.request('/api/projects/abc/sessions', {
      method: 'POST',
      body: JSON.stringify({ message: 'hello' }),
    });
    
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sessionId).toBeDefined();
    expect(json.processId).toBeDefined();
  });
});
```

### E2E Tests (Optional, uses real CLI)

For confidence that real SDK integration works:

```typescript
// packages/server/test/e2e/real-session.test.ts

describe.skipIf(!process.env.RUN_E2E)('real SDK', () => {
  it('starts and stops a session', async () => {
    // Uses real claude CLI
    // Maybe just test abort works quickly to minimize token usage
  });
});
```

## File Structure After Phase 2

```
packages/server/src/
├── index.ts
├── app.ts
├── routes/
│   ├── health.ts
│   ├── projects.ts
│   ├── sessions.ts
│   ├── processes.ts
│   └── stream.ts          # SSE endpoint
├── supervisor/
│   ├── Supervisor.ts
│   ├── Process.ts
│   └── types.ts
├── sdk/
│   ├── types.ts
│   ├── real.ts
│   └── mock.ts
├── projects/
│   └── scanner.ts         # discovers projects from ~/.claude
└── sessions/
    └── reader.ts          # reads jsonl files

packages/server/test/
├── supervisor.test.ts
├── process.test.ts
└── api/
    ├── projects.test.ts
    └── sessions.test.ts
```

## Verification Checklist

- [ ] MockClaudeSDK can emit canned message sequences
- [ ] Supervisor starts/tracks/aborts processes
- [ ] Process queues messages, emits events to subscribers
- [ ] API routes work with mock SDK
- [ ] SSE endpoint streams process events
- [ ] Tests pass without any network/token usage
- [ ] `pnpm test` still fast (<5s)

## Open Questions

1. **Project ID encoding**: Base64 path? Hash? Slug? (leaning toward simple hash for shorter URLs)
2. **Session title**: Extract from first user message? Truncate at N chars?
3. **Idle timeout value**: 5 minutes? 10? Configurable?
4. **SSE event format**: Match claude-code-viewer's schema or simplify?

## Out of Scope

- Real SDK integration (Phase 3)
- Client UI beyond Phase 1 placeholder
- Push notifications
- File upload
- Project creation (`/init`)
