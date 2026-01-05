# Clone Session and Rewind/Fork Features

## Overview

Implement session forking capabilities for **all providers** (Claude, Codex, Gemini):
- **Clone Session**: Create a complete copy of a session
- **Rewind/Fork**: Create a new session branching from a specific turn in history

Both operations create new sessions (preserving original history). Uses turn-level granularity (user→assistant pairs). UI: Clone in session menu, new timeline modal for rewinding.

## Provider File Formats

| Provider | Format | Structure | Location |
|----------|--------|-----------|----------|
| Claude | JSONL | DAG (uuid/parentUuid) | `~/.claude/projects/{projectId}/{sessionId}.jsonl` |
| Codex | JSONL | Linear | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` |
| Gemini | JSON | Linear array | `~/.gemini/tmp/{hash}/chats/session-*.json` |

All providers have linear conversations from the user's perspective (Codex and Gemini are truly linear; Claude DAG selects one active branch). Clone and fork work the same conceptually - just different file handling.

---

## Phase 1: Server - Clone & Fork Logic

### 1.1 New file: `packages/server/src/sessions/fork.ts`

Provider-agnostic interface with provider-specific implementations:

```typescript
interface CloneResult { newSessionId: string; entries: number }
interface ForkResult { newSessionId: string; entries: number; forkPoint: string }

// Provider-specific clone implementations
async function cloneClaudeSession(projectPath, sourceId, newId): Promise<CloneResult>
async function cloneCodexSession(sourceFilePath, newId): Promise<CloneResult>
async function cloneGeminiSession(sourceFilePath, newId): Promise<CloneResult>

// Provider-specific fork implementations
async function forkClaudeSession(projectPath, sourceId, newId, afterMessageUuid): Promise<ForkResult>
async function forkCodexSession(sourceFilePath, newId, afterMessageUuid): Promise<ForkResult>
async function forkGeminiSession(sourceFilePath, newId, afterMessageUuid): Promise<ForkResult>
```

**Claude** (JSONL with DAG):
1. Read JSONL, build DAG, get active branch
2. Transform: new `session_id`, keep `uuid`/`parentUuid`
3. Write to `{projectPath}/{newSessionId}.jsonl`

**Codex** (JSONL linear):
1. Read JSONL lines
2. Transform: update `session_meta.id`, keep message structure
3. Write to new file in same date directory

**Gemini** (JSON):
1. Read JSON, parse session object
2. Transform: new `sessionId`, keep messages array
3. Write to `{hash}/chats/session-{newSessionId}.json`

### 1.2 Turn identification (provider-agnostic)

Add to `packages/server/src/sessions/turns.ts` (new file):

```typescript
export interface Turn {
  index: number;           // 1-based turn number
  userMessageId: string;   // UUID of user message
  lastMessageId: string;   // UUID of last message in turn (fork point)
  userSummary: string;     // First ~100 chars of user message
  timestamp: string;       // ISO timestamp
  messageCount: number;    // Messages in this turn
}

// Works on normalized Message[] from any provider
export function identifyTurns(messages: Message[]): Turn[]
```

This works on the unified `Message[]` format that all readers produce, making it provider-agnostic.

---

## Phase 2: Server - API Endpoints

Add to `packages/server/src/routes/sessions.ts`:

### POST `/api/projects/:projectId/sessions/:sessionId/clone`
Request: `{ title?: string }`
Response: `{ sessionId, messageCount, clonedFrom, provider }`

Route logic:
1. Get session summary to determine provider
2. Call provider-specific clone function
3. Copy metadata (optional title) to new session
4. Return new session info

### GET `/api/projects/:projectId/sessions/:sessionId/turns`
Response: `{ turns: Turn[] }`

Route logic:
1. Get full session (messages) from appropriate reader
2. Call `identifyTurns(messages)` (provider-agnostic)
3. Return turns array

### POST `/api/projects/:projectId/sessions/:sessionId/fork`
Request: `{ afterTurn: number, title?: string }`
Response: `{ sessionId, messageCount, forkedFrom, forkPoint: { turnIndex, messageId }, provider }`

Route logic:
1. Get session + turns to find target message UUID
2. Call provider-specific fork function
3. Copy/set metadata for new session
4. Return new session info

---

## Phase 3: Client - API & Types

### 3.1 Add to `packages/client/src/api/client.ts`

```typescript
cloneSession: (projectId, sessionId, opts?) =>
  fetchJSON<{ sessionId, messageCount, clonedFrom }>(`/projects/${projectId}/sessions/${sessionId}/clone`, ...)

getSessionTurns: (projectId, sessionId) =>
  fetchJSON<{ turns: Turn[] }>(`/projects/${projectId}/sessions/${sessionId}/turns`)

forkSession: (projectId, sessionId, opts) =>
  fetchJSON<{ sessionId, messageCount, forkedFrom, forkPoint }>(`/projects/${projectId}/sessions/${sessionId}/fork`, ...)
```

### 3.2 Add types to `packages/client/src/types.ts`

```typescript
export interface Turn {
  index: number;
  userMessageId: string;
  lastMessageId: string;
  userSummary: string;
  timestamp: string;
  messageCount: number;
}
```

---

## Phase 4: Client - UI Components

### 4.1 Update `packages/client/src/components/SessionMenu.tsx`

Add two new menu items:
- **Clone** - Calls `api.cloneSession()`, navigates to new session
- **Rewind...** - Opens timeline modal

### 4.2 New file: `packages/client/src/components/SessionTimeline.tsx`

Modal showing conversation turns for fork selection:

```tsx
interface SessionTimelineProps {
  projectId: string;
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
  onFork: (sessionId: string) => void;  // Navigate to forked session
}
```

Features:
- Fetches turns via `api.getSessionTurns()`
- Lists turns with: turn number, user message preview, timestamp
- Click turn → confirm → calls `api.forkSession()` → navigate

### 4.3 Styles in `packages/client/src/styles/index.css`

```css
.session-timeline-modal { ... }
.turn-list { ... }
.turn-item { ... }
```

---

## Phase 5: Metadata (Optional Enhancement)

Extend `SessionMetadataService` to track lineage:

```typescript
interface SessionMetadata {
  // ... existing fields
  clonedFrom?: string;
  forkedFrom?: { sessionId: string; turnIndex: number; messageId: string };
}
```

Display lineage badge in session list (e.g., "Forked from X").

---

## Files to Modify

| File | Changes |
|------|---------|
| `packages/server/src/sessions/fork.ts` | **NEW** - Clone and fork functions for all providers |
| `packages/server/src/sessions/turns.ts` | **NEW** - `identifyTurns()` function (provider-agnostic) |
| `packages/server/src/routes/sessions.ts` | Add /clone, /turns, /fork endpoints |
| `packages/client/src/api/client.ts` | Add API methods |
| `packages/client/src/types.ts` | Add Turn type |
| `packages/client/src/components/SessionMenu.tsx` | Add Clone/Rewind menu items |
| `packages/client/src/components/SessionTimeline.tsx` | **NEW** - Timeline modal |
| `packages/client/src/styles/index.css` | Timeline modal styles |

---

## Edge Cases

1. **Running session**: Allow clone/fork - creates snapshot, original continues
2. **Agent sessions**: NOT copied - they're internal to Task tool (Claude only)
3. **Empty sessions**: Disallow fork (no turns to select), allow clone
4. **Codex file location**: New cloned file goes in same date directory as original
5. **Gemini file location**: New file goes in same `{hash}/chats/` directory

---

## Implementation Order

1. `turns.ts` - Add `identifyTurns()` (provider-agnostic)
2. `fork.ts` - Clone and fork functions for Claude first
3. `sessions.ts` routes - API endpoints (Claude only initially)
4. `client.ts` - API methods
5. `SessionMenu.tsx` - Clone action
6. `SessionTimeline.tsx` - Timeline modal with fork
7. `fork.ts` - Add Codex clone/fork support
8. `fork.ts` - Add Gemini clone/fork support
9. Tests and polish
