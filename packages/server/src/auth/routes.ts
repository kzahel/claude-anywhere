/**
 * Authentication API routes
 */

import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AuthService } from "./AuthService.js";

export const SESSION_COOKIE_NAME = "yep-anywhere-session";

export interface AuthRoutesDeps {
  authService: AuthService;
  /** Whether auth is disabled by env var (--auth-disable). Overrides settings. */
  authDisabled?: boolean;
}

interface SetupBody {
  password: string;
}

interface LoginBody {
  password: string;
}

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

export function createAuthRoutes(deps: AuthRoutesDeps): Hono {
  const app = new Hono();
  const { authService, authDisabled = false } = deps;

  /**
   * GET /api/auth/status
   * Check authentication status
   *
   * Returns:
   * - enabled: whether auth is enabled (from settings)
   * - authenticated: whether user has valid session
   * - setupRequired: whether initial setup is needed (enabled but no account)
   * - disabledByEnv: whether auth is disabled by --auth-disable flag
   * - authFilePath: path to auth.json (for recovery instructions)
   */
  app.get("/status", async (c) => {
    const isEnabled = authService.isEnabled();

    // If auth is disabled by env var, it overrides settings
    if (authDisabled) {
      return c.json({
        enabled: isEnabled,
        authenticated: true, // Bypass auth
        setupRequired: false,
        disabledByEnv: true,
        authFilePath: authService.getFilePath(),
      });
    }

    // If auth is not enabled in settings, no auth required
    if (!isEnabled) {
      return c.json({
        enabled: false,
        authenticated: true, // No auth needed
        setupRequired: false,
        disabledByEnv: false,
        authFilePath: authService.getFilePath(),
      });
    }

    // Auth is enabled - check session
    const sessionId = getCookie(c, SESSION_COOKIE_NAME);
    const hasAccount = authService.hasAccount();

    if (!hasAccount) {
      // This shouldn't happen normally since enableAuth creates account,
      // but handle edge case
      return c.json({
        enabled: true,
        authenticated: false,
        setupRequired: true,
        disabledByEnv: false,
        authFilePath: authService.getFilePath(),
      });
    }

    if (!sessionId) {
      return c.json({
        enabled: true,
        authenticated: false,
        setupRequired: false,
        disabledByEnv: false,
        authFilePath: authService.getFilePath(),
      });
    }

    const valid = await authService.validateSession(sessionId);
    return c.json({
      enabled: true,
      authenticated: valid,
      setupRequired: false,
      disabledByEnv: false,
      authFilePath: authService.getFilePath(),
    });
  });

  /**
   * POST /api/auth/enable
   * Enable auth with a password (main way to enable from settings UI)
   */
  app.post("/enable", async (c) => {
    const body = await c.req.json<SetupBody>();

    if (!body.password || typeof body.password !== "string") {
      return c.json({ error: "Password is required" }, 400);
    }

    if (body.password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    const success = await authService.enableAuth(body.password);
    if (!success) {
      return c.json({ error: "Failed to enable auth" }, 500);
    }

    // Auto-login after enabling
    const userAgent = c.req.header("User-Agent");
    const sessionId = await authService.createSession(userAgent);

    setCookie(c, SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return c.json({ success: true });
  });

  /**
   * POST /api/auth/disable
   * Disable auth (requires authenticated session)
   */
  app.post("/disable", async (c) => {
    // Require authenticated session to disable
    const sessionId = getCookie(c, SESSION_COOKIE_NAME);
    if (!sessionId || !(await authService.validateSession(sessionId))) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    await authService.disableAuth();

    // Clear the session cookie
    deleteCookie(c, SESSION_COOKIE_NAME, {
      path: "/",
    });

    return c.json({ success: true });
  });

  /**
   * POST /api/auth/setup
   * Create the initial account (only works when no account exists)
   * @deprecated Use /api/auth/enable instead
   */
  app.post("/setup", async (c) => {
    if (authService.hasAccount()) {
      return c.json({ error: "Account already exists" }, 400);
    }

    const body = await c.req.json<SetupBody>();

    if (!body.password || typeof body.password !== "string") {
      return c.json({ error: "Password is required" }, 400);
    }

    if (body.password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    // Use enableAuth to also set the enabled flag
    const success = await authService.enableAuth(body.password);
    if (!success) {
      return c.json({ error: "Failed to create account" }, 500);
    }

    // Auto-login after setup
    const userAgent = c.req.header("User-Agent");
    const sessionId = await authService.createSession(userAgent);

    setCookie(c, SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return c.json({ success: true });
  });

  /**
   * POST /api/auth/login
   * Login with password
   */
  app.post("/login", async (c) => {
    if (!authService.hasAccount()) {
      c.header("X-Setup-Required", "true");
      return c.json(
        { error: "No account configured", setupRequired: true },
        401,
      );
    }

    const body = await c.req.json<LoginBody>();

    if (!body.password || typeof body.password !== "string") {
      return c.json({ error: "Password is required" }, 400);
    }

    const valid = await authService.verifyPassword(body.password);
    if (!valid) {
      return c.json({ error: "Invalid password" }, 401);
    }

    const userAgent = c.req.header("User-Agent");
    const sessionId = await authService.createSession(userAgent);

    setCookie(c, SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return c.json({ success: true });
  });

  /**
   * POST /api/auth/logout
   * Logout (invalidate session)
   */
  app.post("/logout", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE_NAME);

    if (sessionId) {
      await authService.invalidateSession(sessionId);
    }

    deleteCookie(c, SESSION_COOKIE_NAME, {
      path: "/",
    });

    return c.json({ success: true });
  });

  /**
   * POST /api/auth/change-password
   * Change password (requires current password)
   */
  app.post("/change-password", async (c) => {
    // Require authenticated session
    const sessionId = getCookie(c, SESSION_COOKIE_NAME);
    if (!sessionId || !(await authService.validateSession(sessionId))) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const body = await c.req.json<ChangePasswordBody>();

    if (!body.currentPassword || typeof body.currentPassword !== "string") {
      return c.json({ error: "Current password is required" }, 400);
    }

    if (!body.newPassword || typeof body.newPassword !== "string") {
      return c.json({ error: "New password is required" }, 400);
    }

    if (body.newPassword.length < 8) {
      return c.json(
        { error: "New password must be at least 8 characters" },
        400,
      );
    }

    const success = await authService.changePassword(
      body.currentPassword,
      body.newPassword,
    );
    if (!success) {
      return c.json({ error: "Current password is incorrect" }, 401);
    }

    // Optionally invalidate all other sessions
    // await authService.invalidateAllSessions();

    return c.json({ success: true });
  });

  return app;
}
