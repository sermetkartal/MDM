import { test, expect } from "./helpers/fixtures";

test.describe("Compliance", () => {
  test("should navigate to compliance page", async ({ authenticatedPage: page }) => {
    await page.goto("/compliance");
    await expect(page.getByText(/compliance/i)).toBeVisible();
  });

  test("should display dashboard stats", async ({ authenticatedPage: page }) => {
    await page.goto("/compliance");
    // Look for stat cards or summary numbers
    const statsArea = page.locator("[data-testid='compliance-stats'], .grid, .stats");
    await expect(statsArea.first()).toBeVisible({ timeout: 5_000 });
  });

  test("should display violations list", async ({ authenticatedPage: page }) => {
    await page.goto("/compliance");
    // Look for a violations table or list
    const violationsList = page.locator("table, [data-testid='violations-list'], [role='table']");
    await expect(violationsList.first()).toBeVisible({ timeout: 5_000 });
  });
});
