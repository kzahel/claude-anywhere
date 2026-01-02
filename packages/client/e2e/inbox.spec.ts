import { expect, test } from "@playwright/test";

test.describe("Inbox Page", () => {
  test("loads and displays inbox", async ({ page }) => {
    // Navigate to inbox
    await page.goto("/inbox");

    // Verify page header shows "Inbox"
    await expect(page.locator(".session-title")).toHaveText("Inbox");

    // Wait for loading to complete (loading indicator disappears)
    await expect(page.locator(".loading")).not.toBeVisible({ timeout: 10000 });

    // Verify either empty state OR at least one section is visible
    const emptyState = page.locator(".inbox-empty");
    const sections = page.locator(".inbox-section");

    // One of these should be true: empty state visible OR sections exist
    const isEmpty = await emptyState.isVisible();
    const hasSections = (await sections.count()) > 0;

    expect(isEmpty || hasSections).toBe(true);

    if (isEmpty) {
      // Verify empty state message
      await expect(page.locator(".inbox-empty h3")).toHaveText(
        "All caught up!",
      );
    }
  });

  test("refresh button works", async ({ page }) => {
    await page.goto("/inbox");

    // Wait for initial load
    await expect(page.locator(".session-title")).toHaveText("Inbox");
    await expect(page.locator(".loading")).not.toBeVisible({ timeout: 10000 });

    // Find and click refresh button
    const refreshButton = page.locator(".inbox-refresh-button");
    await expect(refreshButton).toBeVisible();
    await refreshButton.click();

    // Button should show refreshing state briefly, then return to normal
    // Just verify no errors occur and page remains functional
    await expect(page.locator(".session-title")).toHaveText("Inbox");

    // Verify no error message appeared
    await expect(page.locator(".error")).not.toBeVisible();
  });
});
