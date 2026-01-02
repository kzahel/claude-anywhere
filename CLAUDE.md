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
- `LOG_FILE_LEVEL` - Separate level for file logging (default: same as LOG_LEVEL)
- `LOG_TO_FILE` - Set to "false" to disable file logging
- `LOG_TO_CONSOLE` - Set to "false" to disable console logging

## Maintenance Server

A separate lightweight HTTP server runs on port 3401 (main port + 1) for out-of-band diagnostics. Useful when the main server is unresponsive.

```bash
# Check server status
curl http://localhost:3401/status

# Enable proxy debug logging at runtime
curl -X PUT http://localhost:3401/proxy/debug -d '{"enabled": true}'

# Change log levels at runtime
curl -X PUT http://localhost:3401/log/level -d '{"console": "debug"}'

# Enable Chrome DevTools inspector
curl -X POST http://localhost:3401/inspector/open
# Then open chrome://inspect in Chrome

# Trigger server restart
curl -X POST http://localhost:3401/reload
```

Available endpoints:
- `GET /health` - Health check
- `GET /status` - Memory, uptime, connections
- `GET|PUT /log/level` - Get/set log levels
- `GET|PUT /proxy/debug` - Get/set proxy debug logging
- `GET /inspector` - Inspector status
- `POST /inspector/open` - Enable Chrome DevTools
- `POST /inspector/close` - Disable Chrome DevTools
- `POST /reload` - Restart server

Environment variables:
- `MAINTENANCE_PORT` - Port for maintenance server (default: PORT + 1, set to 0 to disable)
- `PROXY_DEBUG` - Enable proxy debug logging at startup (default: false)

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
