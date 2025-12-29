import { access, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { Project } from "../supervisor/types.js";
import { encodeProjectId } from "../supervisor/types.js";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

export interface ScannerOptions {
  projectsDir?: string; // override for testing
}

export class ProjectScanner {
  private projectsDir: string;

  constructor(options: ScannerOptions = {}) {
    this.projectsDir = options.projectsDir ?? CLAUDE_PROJECTS_DIR;
  }

  async listProjects(): Promise<Project[]> {
    const projects: Project[] = [];
    const seenPaths = new Set<string>();

    try {
      await access(this.projectsDir);
    } catch {
      // Directory doesn't exist - return empty list
      return [];
    }

    // ~/.claude/projects/ can have two structures:
    // 1. Projects directly as -home-user-project/
    // 2. Projects under hostname/ as hostname/-home-user-project/
    let dirs: string[];
    try {
      const entries = await readdir(this.projectsDir, { withFileTypes: true });
      dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }

    for (const dir of dirs) {
      const dirPath = join(this.projectsDir, dir);

      // Check if this is a project directory (starts with -)
      if (dir.startsWith("-")) {
        const projectPath = await this.getProjectPathFromSessions(dirPath);
        if (projectPath && !seenPaths.has(projectPath)) {
          seenPaths.add(projectPath);
          const sessionCount = await this.countSessions(dirPath);
          projects.push({
            id: encodeProjectId(projectPath),
            path: projectPath,
            name: basename(projectPath),
            sessionCount,
            sessionDir: dirPath,
          });
        }
        continue;
      }

      // Otherwise, treat as hostname directory
      // Format: ~/.claude/projects/hostname/-project-path/
      let projectDirs: string[];
      try {
        const subEntries = await readdir(dirPath, { withFileTypes: true });
        projectDirs = subEntries
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
      } catch {
        continue;
      }

      for (const projectDir of projectDirs) {
        const projectDirPath = join(dirPath, projectDir);
        const projectPath =
          await this.getProjectPathFromSessions(projectDirPath);

        if (!projectPath || seenPaths.has(projectPath)) continue;
        seenPaths.add(projectPath);

        const sessionCount = await this.countSessions(projectDirPath);

        projects.push({
          id: encodeProjectId(projectPath),
          path: projectPath,
          name: basename(projectPath),
          sessionCount,
          sessionDir: projectDirPath,
        });
      }
    }

    return projects;
  }

  async getProject(projectId: string): Promise<Project | null> {
    const projects = await this.listProjects();
    return projects.find((p) => p.id === projectId) ?? null;
  }

  /**
   * Get the actual project path by reading the cwd from a session file.
   * This is more reliable than trying to decode the encoded directory name,
   * which fails for paths containing hyphens.
   */
  private async getProjectPathFromSessions(
    projectDirPath: string,
  ): Promise<string | null> {
    try {
      const files = await readdir(projectDirPath);
      const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

      if (jsonlFiles.length === 0) {
        return null;
      }

      // Try to read cwd from the first available session file
      for (const file of jsonlFiles) {
        const filePath = join(projectDirPath, file);
        const cwd = await this.readCwdFromSession(filePath);
        if (cwd) {
          return cwd;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Read the cwd field from a session .jsonl file.
   * Reads first 20 lines looking for a message with cwd.
   */
  private async readCwdFromSession(filePath: string): Promise<string | null> {
    try {
      const content = await readFile(filePath, { encoding: "utf-8" });
      const lines = content.split("\n").slice(0, 20);

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.cwd && typeof data.cwd === "string") {
            return data.cwd;
          }
        } catch {
          // Skip invalid JSON lines
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private async countSessions(projectDirPath: string): Promise<number> {
    try {
      const files = await readdir(projectDirPath);
      // Count .jsonl files, excluding agent-* (internal subagent warmup sessions)
      return files.filter(
        (f) => f.endsWith(".jsonl") && !f.startsWith("agent-"),
      ).length;
    } catch {
      return 0;
    }
  }
}

// Singleton for convenience
export const projectScanner = new ProjectScanner();
