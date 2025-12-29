import { access, readdir } from "node:fs/promises";
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

    try {
      await access(this.projectsDir);
    } catch {
      // Directory doesn't exist - return empty list
      return [];
    }

    // ~/.claude/projects/ contains directories named after hostnames
    // Each hostname dir contains project path directories (encoded)
    let hostDirs: string[];
    try {
      const entries = await readdir(this.projectsDir, { withFileTypes: true });
      hostDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }

    for (const hostDir of hostDirs) {
      const hostPath = join(this.projectsDir, hostDir);

      let projectDirs: string[];
      try {
        const entries = await readdir(hostPath, { withFileTypes: true });
        projectDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      } catch {
        continue;
      }

      for (const projectDir of projectDirs) {
        const projectDirPath = join(hostPath, projectDir);
        const projectPath = this.decodeProjectPath(projectDir);

        if (!projectPath) continue;

        const sessionCount = await this.countSessions(projectDirPath);

        projects.push({
          id: encodeProjectId(projectPath),
          path: projectPath,
          name: basename(projectPath),
          sessionCount,
        });
      }
    }

    return projects;
  }

  async getProject(projectId: string): Promise<Project | null> {
    const projects = await this.listProjects();
    return projects.find((p) => p.id === projectId) ?? null;
  }

  // Get the directory path for a project's sessions
  getProjectDir(projectPath: string): string | null {
    // The encoding: project path with / replaced by -
    // e.g., /home/user/myproject -> -home-user-myproject
    const encoded = projectPath.replaceAll("/", "-");

    // We need to find which hostname directory contains this project
    // For now, scan all hostnames
    // This is a simplification - in production we'd cache this
    return null; // Will be resolved by findProjectDir
  }

  async findProjectDir(projectPath: string): Promise<string | null> {
    try {
      await access(this.projectsDir);
    } catch {
      return null;
    }

    const encoded = projectPath.replaceAll("/", "-");

    let hostDirs: string[];
    try {
      const entries = await readdir(this.projectsDir, { withFileTypes: true });
      hostDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return null;
    }

    for (const hostDir of hostDirs) {
      const projectDirPath = join(this.projectsDir, hostDir, encoded);
      try {
        await access(projectDirPath);
        return projectDirPath;
      } catch {
        // Directory doesn't exist, try next hostname
      }
    }

    return null;
  }

  private decodeProjectPath(encoded: string): string | null {
    // Claude-code uses a specific encoding for project paths
    // The directory name format: path with / replaced by -
    // e.g., -home-user-myproject -> /home/user/myproject
    try {
      if (!encoded.startsWith("-")) {
        // Invalid encoding
        return null;
      }
      // Replace - with / but handle the leading -
      const decoded = encoded.replaceAll("-", "/");
      return decoded;
    } catch {
      return null;
    }
  }

  private async countSessions(projectDirPath: string): Promise<number> {
    try {
      const files = await readdir(projectDirPath);
      // Count .jsonl files (session files)
      return files.filter((f) => f.endsWith(".jsonl")).length;
    } catch {
      return 0;
    }
  }
}

// Singleton for convenience
export const projectScanner = new ProjectScanner();
