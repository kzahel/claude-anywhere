import * as os from "node:os";
import * as path from "node:path";
import type { Level as LogLevel } from "pino";
import type { PermissionMode } from "./sdk/types.js";

/**
 * Server configuration loaded from environment variables.
 */
export interface Config {
  /** Directory where Claude projects are stored */
  claudeProjectsDir: string;
  /** Idle timeout in milliseconds before process cleanup */
  idleTimeoutMs: number;
  /** Default permission mode for new sessions */
  defaultPermissionMode: PermissionMode;
  /** Server port */
  port: number;
  /** Maintenance server port (default: main port + 1). Set to 0 to disable. */
  maintenancePort: number;
  /** Use mock SDK instead of real Claude SDK */
  useMockSdk: boolean;
  /** Maximum concurrent workers. 0 = unlimited (default for backward compat) */
  maxWorkers: number;
  /** Idle threshold in milliseconds for preemption. Workers idle longer than this can be preempted. */
  idlePreemptThresholdMs: number;
  /** Whether to serve frontend (proxy in dev, static in prod) */
  serveFrontend: boolean;
  /** Vite dev server port for frontend proxy */
  vitePort: number;
  /** Path to built client dist directory */
  clientDistPath: string;
  /** Maximum upload file size in bytes. 0 = unlimited (default: 100MB) */
  maxUploadSizeBytes: number;
  /** Maximum queue size for pending requests. 0 = unlimited (default: 100) */
  maxQueueSize: number;
  /** Directory for log files. Default: ~/.claude-anywhere/logs */
  logDir: string;
  /** Log filename. Default: server.log */
  logFile: string;
  /** Minimum log level for console. Default: info */
  logLevel: LogLevel;
  /** Minimum log level for file. Default: same as logLevel or LOG_FILE_LEVEL */
  logFileLevel: LogLevel;
  /** Whether to log to file. Default: true */
  logToFile: boolean;
  /** Whether to log to console. Default: true */
  logToConsole: boolean;
}

/**
 * Load configuration from environment variables with defaults.
 */
export function loadConfig(): Config {
  // Determine if we're in production mode
  const isProduction = process.env.NODE_ENV === "production";

  // SERVE_FRONTEND defaults to true (unified server mode)
  // Set SERVE_FRONTEND=false to disable frontend serving (API-only mode)
  const serveFrontend = process.env.SERVE_FRONTEND !== "false";

  return {
    claudeProjectsDir:
      process.env.CLAUDE_PROJECTS_DIR ??
      path.join(os.homedir(), ".claude", "projects"),
    idleTimeoutMs: parseIntOrDefault(process.env.IDLE_TIMEOUT, 5 * 60) * 1000,
    defaultPermissionMode: parsePermissionMode(process.env.PERMISSION_MODE),
    port: parseIntOrDefault(process.env.PORT, 3400),
    // Maintenance port defaults to main port + 1, set to 0 to disable
    maintenancePort: parseIntOrDefault(
      process.env.MAINTENANCE_PORT,
      parseIntOrDefault(process.env.PORT, 3400) + 1,
    ),
    useMockSdk: process.env.USE_MOCK_SDK === "true",
    maxWorkers: parseIntOrDefault(process.env.MAX_WORKERS, 0),
    idlePreemptThresholdMs:
      parseIntOrDefault(process.env.IDLE_PREEMPT_THRESHOLD, 10) * 1000,
    serveFrontend,
    vitePort: parseIntOrDefault(process.env.VITE_PORT, 5555),
    // In production, serve from ../client/dist relative to server package
    // This assumes standard monorepo layout
    clientDistPath:
      process.env.CLIENT_DIST_PATH ??
      path.resolve(import.meta.dirname, "../../client/dist"),
    // Default 100MB max upload size
    maxUploadSizeBytes:
      parseIntOrDefault(process.env.MAX_UPLOAD_SIZE_MB, 100) * 1024 * 1024,
    // Default 100 max queue size
    maxQueueSize: parseIntOrDefault(process.env.MAX_QUEUE_SIZE, 100),
    // Logging configuration
    logDir:
      process.env.LOG_DIR ??
      path.join(os.homedir(), ".claude-anywhere", "logs"),
    logFile: process.env.LOG_FILE ?? "server.log",
    logLevel: parseLogLevel(process.env.LOG_LEVEL),
    logFileLevel: parseLogLevel(
      process.env.LOG_FILE_LEVEL ?? process.env.LOG_LEVEL,
    ),
    logToFile: process.env.LOG_TO_FILE !== "false",
    logToConsole: process.env.LOG_TO_CONSOLE !== "false",
  };
}

/**
 * Parse an integer from string or return default value.
 */
function parseIntOrDefault(
  value: string | undefined,
  defaultValue: number,
): number {
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse permission mode from string or return default.
 */
function parsePermissionMode(value: string | undefined): PermissionMode {
  if (value === "bypassPermissions" || value === "acceptEdits") {
    return value;
  }
  return "default";
}

/**
 * Parse log level from string or return default.
 */
function parseLogLevel(value: string | undefined): LogLevel {
  const validLevels: LogLevel[] = [
    "fatal",
    "error",
    "warn",
    "info",
    "debug",
    "trace",
  ];
  if (value && validLevels.includes(value as LogLevel)) {
    return value as LogLevel;
  }
  return "info";
}
