import { Hono } from "hono";
import type { ProjectScanner } from "../projects/scanner.js";
import type { SessionReader } from "../sessions/reader.js";

export interface ProjectsDeps {
  scanner: ProjectScanner;
  readerFactory: (sessionDir: string) => SessionReader;
}

export function createProjectsRoutes(deps: ProjectsDeps): Hono {
  const routes = new Hono();

  // GET /api/projects - List all projects
  routes.get("/", async (c) => {
    const projects = await deps.scanner.listProjects();
    return c.json({ projects });
  });

  // GET /api/projects/:projectId - Get project with sessions
  routes.get("/:projectId", async (c) => {
    const projectId = c.req.param("projectId");

    const project = await deps.scanner.getProject(projectId);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    // Get sessions for this project
    const sessionDir = await deps.scanner.findProjectDir(project.path);
    if (!sessionDir) {
      return c.json({ project, sessions: [] });
    }

    const reader = deps.readerFactory(sessionDir);
    const sessions = await reader.listSessions(projectId);

    return c.json({ project, sessions });
  });

  // GET /api/projects/:projectId/sessions - List sessions
  routes.get("/:projectId/sessions", async (c) => {
    const projectId = c.req.param("projectId");

    const project = await deps.scanner.getProject(projectId);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const sessionDir = await deps.scanner.findProjectDir(project.path);
    if (!sessionDir) {
      return c.json({ sessions: [] });
    }

    const reader = deps.readerFactory(sessionDir);
    const sessions = await reader.listSessions(projectId);

    return c.json({ sessions });
  });

  return routes;
}
