import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { RealClaudeSDK } from "./sdk/real.js";

const config = loadConfig();

// Create the real SDK
const realSdk = new RealClaudeSDK();

// Create the app with real SDK
const app = createApp({
  realSdk,
  projectsDir: config.claudeProjectsDir,
  idleTimeoutMs: config.idleTimeoutMs,
  defaultPermissionMode: config.defaultPermissionMode,
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
  console.log(`Projects dir: ${config.claudeProjectsDir}`);
  console.log(`Permission mode: ${config.defaultPermissionMode}`);
});
