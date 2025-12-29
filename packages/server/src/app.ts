import { Hono } from "hono";
import { cors } from "hono/cors";
import { ProjectScanner } from "./projects/scanner.js";
import { health } from "./routes/health.js";
import { createProcessesRoutes } from "./routes/processes.js";
import { createProjectsRoutes } from "./routes/projects.js";
import { createSessionsRoutes } from "./routes/sessions.js";
import { createStreamRoutes } from "./routes/stream.js";
import type { ClaudeSDK } from "./sdk/types.js";
import { SessionReader } from "./sessions/reader.js";
import { Supervisor } from "./supervisor/Supervisor.js";

export interface AppOptions {
  sdk: ClaudeSDK;
  projectsDir?: string; // override for testing
  idleTimeoutMs?: number;
}

export function createApp(options: AppOptions): Hono {
  const app = new Hono();

  // CORS for client access
  app.use("/api/*", cors());

  // Create dependencies
  const scanner = new ProjectScanner({ projectsDir: options.projectsDir });
  const supervisor = new Supervisor({
    sdk: options.sdk,
    idleTimeoutMs: options.idleTimeoutMs,
  });
  const readerFactory = (sessionDir: string) =>
    new SessionReader({ sessionDir });

  // Health check (outside /api)
  app.route("/health", health);

  // Mount API routes
  app.route("/api/projects", createProjectsRoutes({ scanner, readerFactory }));
  app.route(
    "/api",
    createSessionsRoutes({ supervisor, scanner, readerFactory }),
  );
  app.route("/api/processes", createProcessesRoutes({ supervisor }));
  app.route("/api", createStreamRoutes({ supervisor }));

  return app;
}

// Default app for backwards compatibility (health check only)
// Full API requires createApp() with SDK injection
export const app = new Hono();
app.route("/health", health);
