import { expect, test } from "./fixtures.js";

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
      await page.click(".new-session-form .send-button");

      // Wait for navigation to session page
      await expect(page).toHaveURL(/\/sessions\//);

      // Draft should be cleared
      const draft = await page.evaluate((pid) => {
        return localStorage.getItem(`draft-new-session-${pid}`);
      }, projectId);
      expect(draft).toBeNull();
    });
  });
});
