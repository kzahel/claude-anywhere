import { Hono } from "hono";
import type { Supervisor } from "../supervisor/Supervisor.js";

export interface ProcessesDeps {
  supervisor: Supervisor;
}

export function createProcessesRoutes(deps: ProcessesDeps): Hono {
  const routes = new Hono();

  // GET /api/processes - List all active processes
  routes.get("/", async (c) => {
    const processes = deps.supervisor.getProcessInfoList();
    return c.json({ processes });
  });

  // POST /api/processes/:processId/abort - Kill a process
  routes.post("/:processId/abort", async (c) => {
    const processId = c.req.param("processId");

    const aborted = await deps.supervisor.abortProcess(processId);
    if (!aborted) {
      return c.json({ error: "Process not found" }, 404);
    }

    return c.json({ aborted: true });
  });

  return routes;
}
