import { expect, test } from "./fixtures.js";

test.describe("Draft Persistence", () => {
  test.describe("New Session Input", () => {
    test("persists draft to localStorage while typing", async ({ page }) => {
      // First get a project ID
      await page.goto("/projects");
      await page.waitForSelector(".project-list a");
      const href = await page
        .locator(".project-list a")
        .first()
        .getAttribute("href");
      const projectId = new URLSearchParams(href?.split("?")[1] ?? "").get(
        "project",
      );
      expect(projectId).toBeTruthy();

      // Navigate to new session page
      await page.goto(`/new-session?projectId=${projectId}`);
      await page.waitForSelector(".new-session-form textarea");

      // Type a message
      const textarea = page.locator(".new-session-form textarea");
      await textarea.fill("My draft message");

      // Wait for debounce (500ms + buffer)
      await page.waitForTimeout(700);

      // Check localStorage has the draft
      const draft = await page.evaluate((pid) => {
        return localStorage.getItem(`draft-new-session-${pid}`);
      }, projectId);
      expect(draft).toBe("My draft message");
    });

    test("restores draft after page reload", async ({ page }) => {
      // First get a project ID
      await page.goto("/projects");
      await page.waitForSelector(".project-list a");
      const href = await page
        .locator(".project-list a")
        .first()
        .getAttribute("href");
      const projectId = new URLSearchParams(href?.split("?")[1] ?? "").get(
        "project",
      );
      expect(projectId).toBeTruthy();

      // Navigate to new session page
      await page.goto(`/new-session?projectId=${projectId}`);
      await page.waitForSelector(".new-session-form textarea");

      // Type a message
      const textarea = page.locator(".new-session-form textarea");
      await textarea.fill("Draft to restore");

      // Wait for debounce
      await page.waitForTimeout(700);

      // Reload the page
      await page.reload();
      // Wait for the form to appear again after reload
      await page.waitForSelector(".new-session-form textarea", {
        timeout: 10000,
      });

      // Draft should be restored
      const restoredTextarea = page.locator(".new-session-form textarea");
      await expect(restoredTextarea).toHaveValue("Draft to restore");
    });

    test("clears draft after successful session start", async ({ page }) => {
      // First get a project ID
      await page.goto("/projects");
      await page.waitForSelector(".project-list a");
      const href = await page
        .locator(".project-list a")
        .first()
        .getAttribute("href");
      const projectId = new URLSearchParams(href?.split("?")[1] ?? "").get(
        "project",
      );
      expect(projectId).toBeTruthy();

      // Navigate to new session page
      await page.goto(`/new-session?projectId=${projectId}`);
      await page.waitForSelector(".new-session-form textarea");

      // Type and submit
      const textarea = page.locator(".new-session-form textarea");
      await textarea.fill("Starting a session");
      await page.waitForTimeout(700); // Wait for debounce
      await page.click(".new-session-form .send-button");

      // Wait for navigation to session page (allow longer timeout for session creation)
      await expect(page).toHaveURL(/\/sessions\//, { timeout: 15000 });

      // Draft should be cleared
      const draft = await page.evaluate((pid) => {
        return localStorage.getItem(`draft-new-session-${pid}`);
      }, projectId);
      expect(draft).toBeNull();
    });
  });
});
