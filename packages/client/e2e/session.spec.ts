import { expect, test } from "@playwright/test";

test.describe("Session Flow", () => {
  test("can start a new session", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForSelector(".project-list a");
    await page.locator(".project-list a").first().click();

    // Type a message
    await page.fill(".new-session-form textarea", "Hello Claude");
    await page.click(".new-session-form .submit-button");

    // Should navigate to chat page
    await expect(page).toHaveURL(/\/sessions\//);

    // Should see the chat interface
    await expect(page.locator(".session-messages")).toBeVisible();
  });

  test("receives streamed response", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForSelector(".project-list a");
    await page.locator(".project-list a").first().click();

    await page.fill(".new-session-form textarea", "Test message");
    await page.click(".new-session-form .submit-button");

    // Wait for assistant message to appear
    await expect(page.locator(".assistant-turn")).toBeVisible({
      timeout: 10000,
    });

    // Should contain some response text (scenarios cycle, content varies)
    await expect(page.locator(".assistant-turn .text-block")).not.toBeEmpty();
  });

  test("shows processing indicator during response", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForSelector(".project-list a");
    await page.locator(".project-list a").first().click();

    await page.fill(".new-session-form textarea", "Test");
    await page.click(".new-session-form .submit-button");

    // Should show processing indicator while agent is working
    await expect(page.locator(".processing-indicator")).toBeVisible({
      timeout: 5000,
    });

    // Wait for response to complete (status indicator hides when idle)
    await expect(page.locator(".status-indicator")).not.toBeVisible({
      timeout: 10000,
    });

    // Processing indicator should disappear when idle
    await expect(page.locator(".processing-indicator")).not.toBeVisible();
  });

  test("can send follow-up message", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForSelector(".project-list a");
    await page.locator(".project-list a").first().click();

    // Start session
    await page.fill(".new-session-form textarea", "First message");
    await page.click(".new-session-form .submit-button");

    // Wait for response and idle status (status indicator hidden when idle)
    await expect(page.locator(".assistant-turn")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator(".status-indicator")).not.toBeVisible({
      timeout: 10000,
    });

    // Verify we can use the message input for follow-ups
    const textarea = page.locator(".message-input textarea");
    await expect(textarea).toBeVisible();
    await expect(textarea).toBeEnabled();

    // Input should have follow-up placeholder when idle
    await expect(textarea).toHaveAttribute(
      "placeholder",
      "Send a message to resume...",
    );
  });
});
