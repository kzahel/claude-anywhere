# Claude Anywhere

A mobile-first supervisor for Claude Code agents. Like the VS Code Claude extension, but designed for phones and multi-session workflows.

**Key ideas:**
- **Server-owned processes** — Claude runs on your dev machine; client disconnects don't interrupt work
- **Multi-session dashboard** — See all projects at a glance, no window cycling
- **Mobile supervision** — Push notifications for approvals, respond from your lock screen
- **Zero external dependencies** — No Firebase, no accounts, just Tailscale for network access

**Architecture:** Hono server manages Claude SDK processes. React client connects via SSE for real-time streaming. Sessions persist to jsonl files (handled by SDK).

For detailed overview, see `docs/project/`. Historical vision docs in `docs/archive/`.

## After Editing Code

After editing TypeScript or other source files, verify your changes compile and pass checks:

```bash
pnpm lint       # Biome linter
pnpm typecheck  # TypeScript type checking (fast, no emit)
pnpm test       # Unit tests
pnpm test:e2e   # E2E tests (if UI changes)
```

Fix any errors before considering the task complete.

## Git Commits

Never mention Claude, AI, or any AI assistant in commit messages. Write commit messages as if a human developer wrote them.

## Server Logs

Server logs are written to `.claude-anywhere/logs/` in the project root:

- `server.log` - Main server log (dev mode with `pnpm dev`)
- `e2e-server.log` - Server log during E2E tests

To view logs in real-time: `tail -f .claude-anywhere/logs/server.log`

All `console.log/error/warn` output is captured. Logs are JSON format in the file but pretty-printed to console.

Environment variables:
- `LOG_DIR` - Custom log directory
- `LOG_FILE` - Custom log filename (default: server.log)
- `LOG_LEVEL` - Minimum level: fatal, error, warn, info, debug, trace (default: info)
- `LOG_TO_FILE` - Set to "false" to disable file logging
- `LOG_TO_CONSOLE` - Set to "false" to disable console logging

## Validating Session Data

Validate JSONL session files against Zod schemas:

```bash
# Validate all sessions in ~/.claude/projects
npx tsx scripts/validate-jsonl.ts

# Validate a specific file or directory
npx tsx scripts/validate-jsonl.ts /path/to/session.jsonl
```

Run this after schema changes to verify compatibility with existing session data.

## Type System

Types are defined in `packages/shared/src/claude-sdk-schema/` (Zod schemas as source of truth).

Key patterns:
- **Message identification**: Use `getMessageId(m)` helper which returns `uuid ?? id`
- **Content access**: Prefer `message.content` over top-level `content`
- **Type discrimination**: Use `type` field (user/assistant/system/summary)
