import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Get the Claude sessions directory, respecting CLAUDE_SESSIONS_DIR env var.
 * This ensures e2e tests use isolated directories instead of ~/.claude/projects.
 */
function getClaudeSessionsDir(): string {
  if (process.env.CLAUDE_SESSIONS_DIR) {
    return process.env.CLAUDE_SESSIONS_DIR;
  }
  return path.join(os.homedir(), ".claude", "projects");
}

export function setupMockProjects() {
  const claudeDir = getClaudeSessionsDir();
  const hostname = os.hostname();
  // Project path encoded with / replaced by - (per scanner.ts)
  // Using /tmp/mockproject to avoid permission issues with root paths
  const mockProjectPath = path.join(os.tmpdir(), "mockproject");
  const encodedPath = mockProjectPath.replace(/\//g, "-");
  const mockProjectDir = path.join(claudeDir, hostname, encodedPath);

  // Create the mock project directory on disk (required for scanner)
  fs.mkdirSync(mockProjectPath, { recursive: true });

  // Create session directory
  fs.mkdirSync(mockProjectDir, { recursive: true });

  // Create a mock session file with cwd field for scanner discovery
  const sessionFile = path.join(mockProjectDir, "mock-session-001.jsonl");
  if (!fs.existsSync(sessionFile)) {
    const mockMessages = [
      {
        type: "user",
        cwd: mockProjectPath, // Required for scanner to find project path
        message: { role: "user", content: "Previous message" },
        timestamp: new Date().toISOString(),
        uuid: "1",
      },
    ];
    fs.writeFileSync(
      sessionFile,
      mockMessages.map((m) => JSON.stringify(m)).join("\n"),
    );
  }

  return { projectDir: mockProjectDir, sessionFile, mockProjectPath };
}

/**
 * Clean up mock project data created by setupMockProjects().
 * Call this in test teardown to avoid leaving test sessions in ~/.claude/.
 */
export function cleanupMockProjects() {
  const claudeDir = getClaudeSessionsDir();
  const hostname = os.hostname();
  const mockProjectPath = path.join(os.tmpdir(), "mockproject");
  const encodedPath = mockProjectPath.replace(/\//g, "-");
  const mockProjectDir = path.join(claudeDir, hostname, encodedPath);

  // Clean up mock project directory
  try {
    fs.rmSync(mockProjectPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }

  // Clean up Claude session directory
  try {
    fs.rmSync(mockProjectDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
