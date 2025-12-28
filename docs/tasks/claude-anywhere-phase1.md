# Phase 1: Repository Scaffolding

## Goal

Set up the monorepo structure with all tooling configured and verified working. By the end of this phase, we have a minimal server and client that build, lint, and test — but don't do anything Claude-related yet.

## Directory Structure

```
claude-anywhere/
├── package.json              # Workspace root
├── biome.json                # Linting/formatting
├── tsconfig.base.json        # Shared TS config
├── packages/
│   ├── server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts      # Entry point
│   │   │   ├── app.ts        # Hono app setup
│   │   │   └── routes/
│   │   │       └── health.ts # GET /health
│   │   └── test/
│   │       └── health.test.ts
│   └── client/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           └── App.tsx
└── docs/
    └── CONTEXT.md            # The overview doc we just created
```

## Package Manager

pnpm with workspaces. Fast, strict, good monorepo support.

## Dependencies

### Root
- `pnpm` (workspace management)
- `biome` (lint + format)
- `typescript`

### packages/server
- `hono` — Lightweight, fast, good TypeScript support
- `@hono/node-server` — Node adapter
- `vitest` — Testing
- `tsx` — Dev runner

### packages/client
- `react`, `react-dom`
- `vite`
- `vitest` + `@testing-library/react`

## Configuration Details

### biome.json
- Format on save
- Lint rules: recommended + explicit any warning
- Import sorting

### tsconfig.base.json
- `strict: true`
- `noUncheckedIndexedAccess: true`
- `target: ES2022`
- `moduleResolution: bundler`

### Server tsconfig
- Extends base
- `module: NodeNext`
- Path alias: `@/` → `src/`

### Client tsconfig
- Extends base
- `jsx: react-jsx`
- `module: ESNext`

## Scripts

### Root package.json
```json
{
  "scripts": {
    "dev": "pnpm --filter server dev & pnpm --filter client dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "biome check .",
    "format": "biome format --write ."
  }
}
```

### Server package.json
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest"
  }
}
```

### Client package.json
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest"
  }
}
```

## Minimal Implementation

### Server (src/index.ts)
```typescript
import { serve } from '@hono/node-server';
import { app } from './app';

const port = parseInt(process.env.PORT || '3400');

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
```

### Server (src/app.ts)
```typescript
import { Hono } from 'hono';
import { health } from './routes/health';

export const app = new Hono();

app.route('/health', health);
```

### Server (src/routes/health.ts)
```typescript
import { Hono } from 'hono';

export const health = new Hono();

health.get('/', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

### Server test (test/health.test.ts)
```typescript
import { describe, it, expect } from 'vitest';
import { app } from '../src/app';

describe('GET /health', () => {
  it('returns ok status', async () => {
    const res = await app.request('/health');
    const json = await res.json();
    
    expect(res.status).toBe(200);
    expect(json.status).toBe('ok');
    expect(json.timestamp).toBeDefined();
  });
});
```

### Client (src/App.tsx)
```tsx
export function App() {
  return (
    <div>
      <h1>claude-anywhere</h1>
      <p>Phase 1: scaffolding complete</p>
    </div>
  );
}
```

## Verification Checklist

- [ ] `pnpm install` succeeds
- [ ] `pnpm lint` passes with no errors
- [ ] `pnpm test` passes (server health check)
- [ ] `pnpm dev` starts both server (3400) and client (5173)
- [ ] `curl localhost:3400/health` returns JSON
- [ ] Client loads in browser and shows heading
- [ ] `pnpm build` produces outputs without errors

## Questions / Decisions Needed

1. **Port numbers**: Server 3400, client dev 5173 (Vite default). OK?
2. **Client proxy**: Should Vite proxy `/api/*` to server in dev? (I'd say yes)
3. **Node version**: Minimum 20.x? Add `.node-version` file?
4. **Git setup**: Initialize with `.gitignore` for node_modules, dist, etc.?

## Out of Scope

- Any Claude SDK code
- SSE infrastructure
- Real UI components
- Database / persistence
