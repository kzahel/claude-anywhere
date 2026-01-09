/**
 * Authentication middleware for API routes.
 *
 * Validates session cookies and returns 401 for unauthenticated requests.
 * Skips auth for /api/auth/* paths (login, setup, etc).
 *
 * Auth is only enforced when:
 * 1. authService.isEnabled() returns true (enabled in settings)
 * 2. authDisabled is false (not bypassed via --auth-disable flag)
 */

import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AuthService } from "../auth/AuthService.js";
import { SESSION_COOKIE_NAME } from "../auth/routes.js";

export interface AuthMiddlewareOptions {
  authService: AuthService;
  /** Whether auth is disabled by env var (--auth-disable). Bypasses all auth. */
  authDisabled?: boolean;
}

/**
 * Create auth middleware that validates session cookies.
 */
export function createAuthMiddleware(
  options: AuthMiddlewareOptions,
): MiddlewareHandler {
  const { authService, authDisabled = false } = options;

  return async (c, next) => {
    // If auth is disabled by env var, always pass through
    if (authDisabled) {
      await next();
      return;
    }

    // If auth is not enabled in settings, pass through
    if (!authService.isEnabled()) {
      await next();
      return;
    }

    // Skip auth for /api/auth/* paths
    const path = c.req.path;
    if (path.startsWith("/api/auth/") || path === "/api/auth") {
      await next();
      return;
    }

    // Skip auth for health check
    if (path === "/health") {
      await next();
      return;
    }

    // Check if account exists (shouldn't happen if enabled via enableAuth)
    if (!authService.hasAccount()) {
      c.header("X-Setup-Required", "true");
      return c.json(
        {
          error: "Authentication required",
          setupRequired: true,
        },
        401,
      );
    }

    // Validate session cookie
    const sessionId = getCookie(c, SESSION_COOKIE_NAME);
    if (!sessionId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const valid = await authService.validateSession(sessionId);
    if (!valid) {
      return c.json({ error: "Session expired" }, 401);
    }

    // Mark request as authenticated (for downstream handlers if needed)
    c.set("authenticated", true);

    await next();
  };
}
