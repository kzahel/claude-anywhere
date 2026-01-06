import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "./fixtures.js";

// Set up test files in a temp directory (avoid permission issues with /mockproject)
const mockProjectPath = join(tmpdir(), "claude-e2e-mockproject");
// Project ID is base64url encoded path (no need to URL encode - it's already URL-safe)
const projectId = Buffer.from(mockProjectPath).toString("base64url");
// Session dir name uses the path with slashes replaced by dashes
const sessionDirName = mockProjectPath.replace(/\//g, "-");

// Create test files before tests run
test.beforeAll(() => {
  // Clean up any previous test artifacts
  try {
    rmSync(mockProjectPath, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }

  // Create the mock project directory and subdirectories
  mkdirSync(mockProjectPath, { recursive: true });
  mkdirSync(join(mockProjectPath, "src"), { recursive: true });

  // Create test files
  writeFileSync(join(mockProjectPath, "test.txt"), "Hello from test file!");
  writeFileSync(
    join(mockProjectPath, "README.md"),
    "# Test Project\n\nThis is a **test** markdown file.",
  );
  writeFileSync(
    join(mockProjectPath, "src", "index.ts"),
    'export const hello = "world";\nconsole.log(hello);',
  );
  writeFileSync(join(mockProjectPath, "data.json"), '{"key": "value"}');

  // Create a session file so the project is discoverable
  const claudeDir = join(homedir(), ".claude", "projects");
  const hostDir = join(claudeDir, hostname(), sessionDirName);
  mkdirSync(hostDir, { recursive: true });
  writeFileSync(
    join(hostDir, "e2e-file-test.jsonl"),
    JSON.stringify({
      type: "user",
      cwd: mockProjectPath,
      message: { role: "user", content: "test" },
    }),
  );
});

// Clean up after tests
test.afterAll(() => {
  try {
    rmSync(mockProjectPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

test.describe("File Browser", () => {
  test.describe("File Page (standalone viewer)", () => {
    test("displays text file content with line numbers", async ({ page }) => {
      // Navigate directly to file page
      await page.goto(`/projects/${projectId}/file?path=src/index.ts`);

      // Should show file viewer
      await expect(page.locator(".file-viewer")).toBeVisible();

      // Should show file path
      await expect(page.locator(".file-viewer-path")).toContainText(
        "src/index.ts",
      );

      // Should show code content (syntax highlighted or plain)
      // With shiki highlighting: .shiki-container, fallback: .code-line-numbers
      const codeView = page.locator(".file-viewer-code");
      await expect(codeView).toBeVisible();
      // Content should be present in either shiki or plain code view
      await expect(codeView).toContainText("export const hello");
    });

    test("renders markdown files with formatting", async ({ page }) => {
      await page.goto(`/projects/${projectId}/file?path=README.md`);

      // Should render markdown by default
      await expect(page.locator(".file-viewer-markdown")).toBeVisible();
      await expect(page.locator(".file-viewer-markdown h1")).toContainText(
        "Test Project",
      );
      await expect(page.locator(".file-viewer-markdown strong")).toContainText(
        "test",
      );
    });

    test("can toggle markdown rendering to raw view", async ({ page }) => {
      await page.goto(`/projects/${projectId}/file?path=README.md`);

      // Initially shows rendered markdown
      await expect(page.locator(".file-viewer-markdown")).toBeVisible();

      // Click toggle button to show raw
      await page.click('button[title="View raw"]');

      // Should now show code view
      const codeView = page.locator(".file-viewer-code");
      await expect(codeView).toBeVisible();
      // Content should contain the raw markdown text
      await expect(codeView).toContainText("# Test Project");
    });

    test("shows file metadata (size, lines)", async ({ page }) => {
      await page.goto(`/projects/${projectId}/file?path=test.txt`);

      // Should show file size
      await expect(page.locator(".file-viewer-meta")).toBeVisible();
    });

    test("shows error for non-existent file", async ({ page }) => {
      await page.goto(`/projects/${projectId}/file?path=nonexistent.txt`);

      // Should show error message
      await expect(page.locator(".file-viewer-error")).toBeVisible();
      // Check for "Not Found" (case-insensitive) or similar error message
      await expect(page.locator(".file-viewer-error")).toContainText(
        /not found/i,
      );
    });
  });

  test.describe("File Actions", () => {
    test("can copy file content", async ({ page, context }) => {
      // Grant clipboard permissions
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);

      await page.goto(`/projects/${projectId}/file?path=test.txt`);

      // Click copy button
      await page.click('button[title="Copy content"]');

      // Button should show "Copied!" state
      await expect(page.locator('button[title="Copied!"]')).toBeVisible();

      // Verify clipboard content
      const clipboardText = await page.evaluate(() =>
        navigator.clipboard.readText(),
      );
      expect(clipboardText).toBe("Hello from test file!");
    });

    test("download button triggers download", async ({ page }) => {
      await page.goto(`/projects/${projectId}/file?path=test.txt`);

      // Click download button - should trigger a download
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.click('button[title="Download"]'),
      ]);

      // Verify download was triggered with correct filename
      expect(download.suggestedFilename()).toBe("test.txt");
    });
  });

  test.describe("Files API", () => {
    test("returns file content for text files", async ({ request }) => {
      const response = await request.get(
        `/api/projects/${projectId}/files?path=test.txt`,
      );

      expect(response.ok()).toBe(true);
      const data = await response.json();
      expect(data.metadata.path).toBe("test.txt");
      expect(data.metadata.isText).toBe(true);
      expect(data.content).toBe("Hello from test file!");
      expect(data.rawUrl).toContain("/files/raw");
    });

    test("returns raw file with correct content-type", async ({ request }) => {
      const response = await request.get(
        `/api/projects/${projectId}/files/raw?path=data.json`,
      );

      expect(response.ok()).toBe(true);
      expect(response.headers()["content-type"]).toBe("application/json");
      const text = await response.text();
      expect(text).toBe('{"key": "value"}');
    });

    test("sets attachment disposition for downloads", async ({ request }) => {
      const response = await request.get(
        `/api/projects/${projectId}/files/raw?path=test.txt&download=true`,
      );

      expect(response.ok()).toBe(true);
      expect(response.headers()["content-disposition"]).toContain("attachment");
      expect(response.headers()["content-disposition"]).toContain("test.txt");
    });

    test("rejects path traversal attempts", async ({ request }) => {
      const response = await request.get(
        `/api/projects/${projectId}/files?path=../../../etc/passwd`,
      );

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid file path");
    });

    test("returns 404 for non-existent files", async ({ request }) => {
      const response = await request.get(
        `/api/projects/${projectId}/files?path=does-not-exist.txt`,
      );

      expect(response.status()).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("File not found");
    });
  });
});
