import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT_FILE = join(tmpdir(), "claude-e2e-port");
const PID_FILE = join(tmpdir(), "claude-e2e-pid");

export default async function globalTeardown() {
  // Kill the server process
  if (existsSync(PID_FILE)) {
    const pid = Number.parseInt(readFileSync(PID_FILE, "utf-8"), 10);
    try {
      // Kill the process group (negative PID kills the group)
      process.kill(-pid, "SIGTERM");
      console.log(`[E2E] Killed server process group ${pid}`);
    } catch (err) {
      // Process may already be dead
      if ((err as NodeJS.ErrnoException).code !== "ESRCH") {
        console.error("[E2E] Error killing server:", err);
      }
    }
    unlinkSync(PID_FILE);
  }

  // Clean up port file
  if (existsSync(PORT_FILE)) {
    unlinkSync(PORT_FILE);
  }
}
