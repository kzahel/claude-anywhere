# SessionView Migration Plan

Consolidate duplicate session-related code by using the shared `SessionView` class and related utilities.

## Current State

The `SessionView` class and related utilities are defined in `packages/shared/src/session/SessionView.ts` and exported from `@claude-anywhere/shared`:

- `SessionView` class - unified interface for session display
- `getSessionDisplayTitle(session)` - utility function for display title
- `SESSION_TITLE_MAX_LENGTH` - constant (120 chars)

The server has a `Session` class (`packages/server/src/sessions/Session.ts`) that extends `SessionView` with I/O capabilities like `load()`, `rename()`, `setArchived()`, `setStarred()`, and `toJSON()`.

## Identified Duplications

### 1. `getSessionDisplayTitle()` function

**Duplicate:** `packages/client/src/types.ts:174-179`
```typescript
export function getSessionDisplayTitle(
  session: Pick<SessionSummary, "customTitle" | "title"> | null | undefined,
): string {
  if (!session) return "Untitled";
  return session.customTitle ?? session.title ?? "Untitled";
}
```

**Source of truth:** `@claude-anywhere/shared` exports identical function

### 2. `SESSION_TITLE_MAX_LENGTH` constant

**Duplicate:** `packages/server/src/supervisor/types.ts:13`
```typescript
export const SESSION_TITLE_MAX_LENGTH = 120;
```

**Source of truth:** `@claude-anywhere/shared` exports this constant

### 3. Manual title extraction in reader

**Location:** `packages/server/src/sessions/reader.ts:432-437`
```typescript
private extractTitle(content: string | null): string | null {
  if (!content) return null;
  const trimmed = content.trim();
  if (trimmed.length <= SESSION_TITLE_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, SESSION_TITLE_MAX_LENGTH - 3)}...`;
}
```

Currently imports from `supervisor/types.ts` - should import from shared.

## Manual Session Enrichment Patterns

Several routes manually merge session data from multiple sources instead of using the `Session` class:

### 4. projects.ts - `enrichSessions()` function (lines 136-196)

Manually merges:
- Status from supervisor/externalTracker
- Notification data (lastSeenAt, hasUnread)
- Metadata (customTitle, isArchived, isStarred)
- Process state (pendingInputType, processState)

**Consideration:** This enrichment requires runtime data (process state, notifications) that `Session.load()` doesn't currently include. May need to extend Session class or keep separate enrichment for lists.

### 5. sessions.ts - GET session detail (lines 256-278)

Manually enriches individual session with metadata, notification data:
```typescript
const metadata = deps.sessionMetadataService?.getMetadata(sessionId);
return c.json({
  session: {
    ...session,
    status,
    customTitle: metadata?.customTitle,
    isArchived: metadata?.isArchived,
    ...
  },
  ...
});
```

**Opportunity:** Could use `Session.load()` then `session.toJSON()` but would need to add notification data.

### 6. inbox.ts - `toInboxItem()` helper (line 141)

```typescript
sessionTitle: item.session.customTitle ?? item.session.title,
```

Should use `getSessionDisplayTitle()` from shared.

### 7. processes.ts - `enrichWithSessionTitle()` (lines 19-55)

Fetches session title for process info. Currently doesn't include custom title - only gets auto-generated title from reader.

**Gap:** Should also check metadata for custom title.

## Migration Phases

### Phase 1: Remove duplicate constant (LOW RISK)

**File:** `packages/server/src/supervisor/types.ts`
- Remove `SESSION_TITLE_MAX_LENGTH` definition (line 13)
- Update imports in files that use it from this location

**Affected files:**
- `packages/server/src/sessions/reader.ts` - update import to use `@claude-anywhere/shared`

### Phase 2: Remove duplicate function from client (LOW RISK)

**File:** `packages/client/src/types.ts`
- Remove `getSessionDisplayTitle()` function (lines 174-179)
- Add re-export: `export { getSessionDisplayTitle } from "@claude-anywhere/shared";`

**Affected client files:** None need changes - same export name

### Phase 3: Use `getSessionDisplayTitle()` in inbox route (LOW RISK)

**File:** `packages/server/src/routes/inbox.ts`
- Import `getSessionDisplayTitle` from `@claude-anywhere/shared`
- Replace `item.session.customTitle ?? item.session.title` with `getSessionDisplayTitle(item.session)`

### Phase 4: Add custom title to processes route (MEDIUM RISK)

**File:** `packages/server/src/routes/processes.ts`
- Inject `SessionMetadataService` into deps
- In `enrichWithSessionTitle()`, also check for custom title
- Use `getSessionDisplayTitle()` pattern or return both titles

### Phase 5: Consider Session class in routes (NEEDS ANALYSIS)

The `enrichSessions()` pattern in projects.ts adds runtime data that isn't persisted:
- Process state from supervisor
- Pending input requests
- External process tracking

Options:
1. **Keep current pattern** - enrichSessions is already well-organized
2. **Create SessionListItem class** - extends SessionView with list-specific runtime data
3. **Extend Session.load() options** - pass in runtime enrichment sources

**Recommendation:** Keep current pattern for lists (Phase 5 is optional). The enrichment logic is centralized in `enrichSessions()` and works well for bulk operations. The `Session` class is better suited for single-session operations like the session detail endpoint.

### Phase 6: Use Session class for session detail endpoint (MEDIUM RISK)

**File:** `packages/server/src/routes/sessions.ts`
- For the GET session detail endpoint (line 256+)
- Use `Session.load()` instead of manual reader + metadata merging
- Still need to add notification data separately (or extend Session class)

## Dependency Order

```
Phase 1 (constant) ─────────────────────────────────┐
                                                     │
Phase 2 (client function) ──────────────────────────┤
                                                     ├──> Done (core cleanup)
Phase 3 (inbox title) ──────────────────────────────┤
                                                     │
Phase 4 (processes title) ──────────────────────────┘

Phase 5 (enrichSessions pattern) ───> Optional / Future
Phase 6 (Session class in routes) ──> Optional / Future
```

## Test Updates Required

- `packages/shared/test/session/SessionView.test.ts` - may need additional tests
- `packages/server/test/sessions/Session.test.ts` - may need updates if Session class changes
- `packages/server/test/routes/*.test.ts` - verify route tests still pass

## Not In Scope

- Client components using `session.fullTitle` or `displayTitle` - these work correctly as-is
- SessionView tests - already exist in shared package
- Refactoring enrichSessions to use Session class - complex and not clearly beneficial
