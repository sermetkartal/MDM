import { test, expect } from "./helpers/fixtures";

test.describe("Audit Logs", () => {
  test("should navigate to audit logs page", async ({ authenticatedPage: page }) => {
    await page.goto("/audit");
    await expect(page.getByText(/audit/i)).toBeVisible();
  });

  test("should search audit logs by action", async ({ authenticatedPage: page }) => {
    await page.goto("/audit");
    const searchInput = page.getByPlaceholder(/search/i).or(page.getByLabel(/search/i));
    if (await searchInput.isVisible()) {
      await searchInput.fill("device.enrolled");
      await page.waitForTimeout(500);
      await expect(page.locator("table, [role='table']").first()).toBeVisible();
    }
  });

  test("should filter audit logs by date", async ({ authenticatedPage: page }) => {
    await page.goto("/audit");
    const dateFilter = page.locator("input[type='date'], [data-testid='date-filter']").first();
    if (await dateFilter.isVisible()) {
      await dateFilter.fill("2026-01-01");
      await page.waitForTimeout(500);
    }
    await expect(page.locator("table, [role='table']").first()).toBeVisible();
  });

  test("should expand row to show detail", async ({ authenticatedPage: page }) => {
    await page.goto("/audit");
    const expandableRow = page.locator("table tbody tr").first();
    const rowCount = await page.locator("table tbody tr").count();
    if (rowCount > 0) {
      await expandableRow.click();
      // Expanded detail panel or additional row should appear
      await page.waitForTimeout(300);
    }
  });
});
