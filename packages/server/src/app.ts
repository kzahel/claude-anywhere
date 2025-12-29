import { Hono } from "hono";
import { cors } from "hono/cors";
import { ProjectScanner } from "./projects/scanner.js";
import { createActivityRoutes } from "./routes/activity.js";
import { health } from "./routes/health.js";
import { createProcessesRoutes } from "./routes/processes.js";
import { createProjectsRoutes } from "./routes/projects.js";
import { createSessionsRoutes } from "./routes/sessions.js";
import { createStreamRoutes } from "./routes/stream.js";
import type {
  ClaudeSDK,
  PermissionMode,
  RealClaudeSDKInterface,
} from "./sdk/types.js";
import { SessionReader } from "./sessions/reader.js";
import { ExternalSessionTracker } from "./supervisor/ExternalSessionTracker.js";
import { Supervisor } from "./supervisor/Supervisor.js";
import type { EventBus } from "./watcher/index.js";

export interface AppOptions {
  /** Legacy SDK interface for mock SDK (for testing) */
  sdk?: ClaudeSDK;
  /** Real SDK interface with full features */
  realSdk?: RealClaudeSDKInterface;
  projectsDir?: string; // override for testing
  idleTimeoutMs?: number;
  defaultPermissionMode?: PermissionMode;
  /** EventBus for file change events */
  eventBus?: EventBus;
}

export function createApp(options: AppOptions): Hono {
  const app = new Hono();

  // CORS for client access
  app.use("/api/*", cors());

  // Create dependencies
  const scanner = new ProjectScanner({ projectsDir: options.projectsDir });
  const supervisor = new Supervisor({
    sdk: options.sdk,
    realSdk: options.realSdk,
    idleTimeoutMs: options.idleTimeoutMs,
    defaultPermissionMode: options.defaultPermissionMode,
  });
  const readerFactory = (sessionDir: string) =>
    new SessionReader({ sessionDir });

  // Create external session tracker if eventBus is available
  const externalTracker = options.eventBus
    ? new ExternalSessionTracker({
        eventBus: options.eventBus,
        supervisor,
        decayMs: 30000, // 30 seconds
      })
    : undefined;

  // Health check (outside /api)
  app.route("/health", health);

  // Mount API routes
  app.route("/api/projects", createProjectsRoutes({ scanner, readerFactory }));
  app.route(
    "/api",
    createSessionsRoutes({
      supervisor,
      scanner,
      readerFactory,
      externalTracker,
    }),
  );
  app.route("/api/processes", createProcessesRoutes({ supervisor }));
  app.route("/api", createStreamRoutes({ supervisor }));

  // Activity routes (file watching)
  if (options.eventBus) {
    app.route(
      "/api/activity",
      createActivityRoutes({ eventBus: options.eventBus }),
    );
  }

  return app;
}

// Default app for backwards compatibility (health check only)
// Full API requires createApp() with SDK injection
export const app = new Hono();
app.route("/health", health);
