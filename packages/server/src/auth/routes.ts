/**
 * Authentication API routes
 */

import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AuthService } from "./AuthService.js";

export const SESSION_COOKIE_NAME = "claude-anywhere-session";

export interface AuthRoutesDeps {
  authService: AuthService;
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
  const { authService } = deps;

  /**
   * GET /api/auth/status
   * Check authentication status
   */
  app.get("/status", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE_NAME);
    const hasAccount = authService.hasAccount();

    if (!hasAccount) {
      return c.json({
        authenticated: false,
        setupRequired: true,
      });
    }

    if (!sessionId) {
      return c.json({
        authenticated: false,
        setupRequired: false,
      });
    }

    const valid = await authService.validateSession(sessionId);
    return c.json({
      authenticated: valid,
      setupRequired: false,
    });
  });

  /**
   * POST /api/auth/setup
   * Create the initial account (only works when no account exists)
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

    const success = await authService.createAccount(body.password);
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
