# Cookie-Based Authentication Implementation Plan

## Overview

Add cookie-based authentication to Claude Anywhere, replacing Caddy basic auth. This enables:
- Service worker notification actions (approve/deny) to work properly
- Standard self-hosted app login experience
- Configurable auth (can disable for trusted networks)

## Design Decisions

### Session Cookies (not JWT)
- Single-user system doesn't need JWT's distributed claims
- Simpler: random session ID in cookie, server stores session data
- Easy to invalidate sessions
- Use Hono's signed cookies

### Auth Middleware Scope
- Apply to all `/api/*` routes
- Exclude: `/api/auth/*` (login/logout), health endpoints
- Service worker actions use short-lived action tokens (not cookies)

### Setup Mode
- When no account exists, server is in "setup mode"
- All protected routes return 401 with `X-Setup-Required: true` header
- Client detects this and shows "Create Account" form
- First account creation doesn't require auth

### Service Worker Actions
- Generate 5-minute action tokens when sending push notifications
- Include token in push payload
- SW sends token in `X-Action-Token` header
- Server validates token without requiring cookie

---

## Implementation Steps

### Phase 1: Server Auth Infrastructure

#### 1.1 Add bcrypt dependency
```bash
pnpm -F server add bcrypt
pnpm -F server add -D @types/bcrypt
```

#### 1.2 Create AuthService
**New file: `packages/server/src/auth/AuthService.ts`**

Following SessionMetadataService pattern:
- Stores in `{dataDir}/auth.json`
- Manages: account (password hash), sessions, action tokens
- Methods: `createAccount`, `verifyPassword`, `createSession`, `validateSession`, `createActionToken`, `validateActionToken`

#### 1.3 Create Auth Routes
**New file: `packages/server/src/auth/routes.ts`**

Endpoints:
- `GET /api/auth/status` - Check if authenticated, if setup needed
- `POST /api/auth/setup` - Create initial account (only when none exists)
- `POST /api/auth/login` - Login, set session cookie
- `POST /api/auth/logout` - Clear session cookie
- `POST /api/auth/change-password` - Change password (requires current)

#### 1.4 Create Auth Middleware
**New file: `packages/server/src/middleware/auth.ts`**

- Read session cookie
- Validate against AuthService
- Set `c.set('authenticated', true)` on success
- Return 401 with appropriate headers on failure
- Skip for excluded paths

#### 1.5 Update Config
**Modify: `packages/server/src/config.ts`**

Add:
```typescript
authEnabled: boolean      // AUTH_ENABLED, default true
authCookieSecret: string  // AUTH_COOKIE_SECRET, auto-generated if missing
authSessionTtlMs: number  // AUTH_SESSION_TTL, default 30 days
```

#### 1.6 Wire Up in App
**Modify: `packages/server/src/app.ts`**
- Add authService to AppOptions
- Apply auth middleware after CORS
- Mount auth routes

**Modify: `packages/server/src/index.ts`**
- Create and initialize AuthService
- Pass to createApp

---

### Phase 2: Action Tokens for Push

#### 2.1 Update Push Types
**Modify: `packages/server/src/push/types.ts`**

Add `actionToken?: string` to PendingInputPayload

#### 2.2 Generate Tokens in PushNotifier
**Modify: `packages/server/src/push/PushNotifier.ts`**

When creating pending-input payload, generate action token:
```typescript
actionToken: authService.createActionToken(sessionId, request.id, 5 * 60 * 1000)
```

#### 2.3 Accept Tokens in Session Input
**Modify: `packages/server/src/routes/sessions.ts`**

In POST `/sessions/:id/input`, check for `X-Action-Token` header as alternative to cookie auth

---

### Phase 3: Client Auth

#### 3.1 Create AuthContext
**New file: `packages/client/src/contexts/AuthContext.tsx`**

Provides:
- `isAuthenticated`, `isSetupMode`, `isLoading`
- `login(password)`, `logout()`, `setupAccount(password)`, `changePassword(current, new)`
- Checks auth status on mount

#### 3.2 Create LoginPage
**New file: `packages/client/src/pages/LoginPage.tsx`**

- Password input form
- Detects setup mode, shows "Create Account" variant
- Redirects to `/projects` on success

#### 3.3 Update API Client
**Modify: `packages/client/src/api/client.ts`**

- Add `credentials: 'include'` to all fetches
- Add auth API methods
- Handle 401 responses (trigger re-check of auth status)

#### 3.4 Update Router
**Modify: `packages/client/src/main.tsx`**

- Wrap in AuthProvider
- Add `/login` route
- Protected routes redirect to login when unauthenticated

#### 3.5 Update SettingsPage
**Modify: `packages/client/src/pages/SettingsPage.tsx`**

Add Security section:
- Change Password form
- Logout button

---

### Phase 4: Service Worker

#### 4.1 Update SW
**Modify: `packages/client/public/sw.js`**

In notification action handler, include action token:
```javascript
headers: {
  'X-Action-Token': data.actionToken,
  ...
}
```

---

### Phase 5: Cleanup

#### 5.1 Update Caddy
Remove basic auth from Caddyfile (user will do this manually after testing)

#### 5.2 Add Tests
**New file: `packages/server/test/auth.test.ts`**

Test setup mode, login, session validation, action tokens

---

## File Summary

### New Files
- `packages/server/src/auth/AuthService.ts`
- `packages/server/src/auth/routes.ts`
- `packages/server/src/auth/index.ts`
- `packages/server/src/middleware/auth.ts`
- `packages/client/src/contexts/AuthContext.tsx`
- `packages/client/src/pages/LoginPage.tsx`

### Modified Files
- `packages/server/package.json` (add bcrypt)
- `packages/server/src/config.ts`
- `packages/server/src/app.ts`
- `packages/server/src/index.ts`
- `packages/server/src/push/types.ts`
- `packages/server/src/push/PushNotifier.ts`
- `packages/server/src/routes/sessions.ts`
- `packages/client/src/api/client.ts`
- `packages/client/src/main.tsx`
- `packages/client/src/pages/SettingsPage.tsx`
- `packages/client/public/sw.js`

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_ENABLED` | `true` | Set to `false` to disable auth entirely |
| `AUTH_COOKIE_SECRET` | (auto-generated) | Secret for signing session cookies |
| `AUTH_SESSION_TTL` | `2592000000` (30 days) | Session lifetime in milliseconds |
