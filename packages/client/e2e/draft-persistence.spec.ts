import { expect, test } from "@playwright/test";

test.describe("Draft Persistence", () => {
  test.describe("New Session Input", () => {
    test("persists draft to localStorage while typing", async ({ page }) => {
      await page.goto("/projects");
      await page.waitForSelector(".project-list a");
      await page.locator(".project-list a").first().click();

      // Type a message
      const textarea = page.locator(".new-session-form textarea");
      await textarea.fill("My draft message");

      // Wait for debounce (500ms + buffer)
      await page.waitForTimeout(700);

      // Check localStorage has the draft
      const projectId = await page.evaluate(() => {
        return window.location.pathname.split("/")[2];
      });
      const draft = await page.evaluate((pid) => {
        return localStorage.getItem(`draft-new-session-${pid}`);
      }, projectId);
      expect(draft).toBe("My draft message");
    });

    test("restores draft after page reload", async ({ page }) => {
      await page.goto("/projects");
      await page.waitForSelector(".project-list a");
      await page.locator(".project-list a").first().click();

      // Type a message
      const textarea = page.locator(".new-session-form textarea");
      await textarea.fill("Draft to restore");

      // Wait for debounce
      await page.waitForTimeout(700);

      // Reload the page
      await page.reload();
      await page.waitForSelector(".new-session-form textarea");

      // Draft should be restored
      const restoredTextarea = page.locator(".new-session-form textarea");
      await expect(restoredTextarea).toHaveValue("Draft to restore");
    });

    test("clears draft after successful session start", async ({ page }) => {
      await page.goto("/projects");
      await page.waitForSelector(".project-list a");
      await page.locator(".project-list a").first().click();

      // Get project ID for localStorage check
      const projectId = await page.evaluate(() => {
        return window.location.pathname.split("/")[2];
      });

      // Type and submit
      const textarea = page.locator(".new-session-form textarea");
      await textarea.fill("Starting a session");
      await page.waitForTimeout(700); // Wait for debounce
      await page.click(".new-session-form .submit-button");

      // Wait for navigation to session page
      await expect(page).toHaveURL(/\/sessions\//);

      // Draft should be cleared
      const draft = await page.evaluate((pid) => {
        return localStorage.getItem(`draft-new-session-${pid}`);
      }, projectId);
      expect(draft).toBeNull();
    });
  });

  test.describe("Session Message Input", () => {
    test("persists message draft while typing", async ({ page }) => {
      // Start a session first
      await page.goto("/projects");
      await page.waitForSelector(".project-list a");
      await page.locator(".project-list a").first().click();
      await page.fill(".new-session-form textarea", "Initial message");
      await page.click(".new-session-form .submit-button");

      // Wait for session page
      await expect(page).toHaveURL(/\/sessions\//);
      await page.waitForSelector(".message-input textarea");

      // Wait for response to complete (status indicator hidden when idle)
      await expect(page.locator(".status-indicator")).not.toBeVisible({
        timeout: 10000,
      });

      // Type a follow-up message
      const textarea = page.locator(".message-input textarea");
      await textarea.fill("My follow-up draft");

      // Wait for debounce
      await page.waitForTimeout(700);

      // Get session ID and check localStorage
      const sessionId = await page.evaluate(() => {
        const path = window.location.pathname;
        const parts = path.split("/");
        return parts[parts.length - 1];
      });
      const draft = await page.evaluate((sid) => {
        return localStorage.getItem(`draft-message-${sid}`);
      }, sessionId);
      expect(draft).toBe("My follow-up draft");
    });

    test("restores message draft after page reload", async ({ page }) => {
      // Start a session
      await page.goto("/projects");
      await page.waitForSelector(".project-list a");
      await page.locator(".project-list a").first().click();
      await page.fill(".new-session-form textarea", "Initial message");
      await page.click(".new-session-form .submit-button");

      // Wait for session page and response to complete
      await expect(page).toHaveURL(/\/sessions\//);
      await page.waitForSelector(".message-input textarea");
      await expect(page.locator(".status-indicator")).not.toBeVisible({
        timeout: 10000,
      });

      // Type a follow-up
      const textarea = page.locator(".message-input textarea");
      await textarea.fill("Draft to restore in session");
      await page.waitForTimeout(700); // Wait for debounce

      // Reload
      await page.reload();
      await page.waitForSelector(".message-input textarea");

      // Draft should be restored
      const restoredTextarea = page.locator(".message-input textarea");
      await expect(restoredTextarea).toHaveValue("Draft to restore in session");
    });

    test("clears draft after successful message send", async ({ page }) => {
      // Start a session
      await page.goto("/projects");
      await page.waitForSelector(".project-list a");
      await page.locator(".project-list a").first().click();
      await page.fill(".new-session-form textarea", "Initial message");
      await page.click(".new-session-form .submit-button");

      // Wait for session page and first response
      await expect(page).toHaveURL(/\/sessions\//);
      await page.waitForSelector(".message-input textarea");
      await expect(page.locator(".status-indicator")).not.toBeVisible({
        timeout: 10000,
      });

      // Get session ID
      const sessionId = await page.evaluate(() => {
        const path = window.location.pathname;
        const parts = path.split("/");
        return parts[parts.length - 1];
      });

      // Type and send follow-up
      const textarea = page.locator(".message-input textarea");
      await textarea.fill("Follow-up message");
      await page.waitForTimeout(700); // Wait for debounce
      await page.click(".message-input .send-button");

      // Wait for response to complete
      await expect(page.locator(".status-indicator")).not.toBeVisible({
        timeout: 10000,
      });

      // Give a moment for any async cleanup
      await page.waitForTimeout(100);

      // Draft should be cleared
      const draft = await page.evaluate((sid) => {
        return localStorage.getItem(`draft-message-${sid}`);
      }, sessionId);
      expect(draft).toBeNull();
    });
  });
});
