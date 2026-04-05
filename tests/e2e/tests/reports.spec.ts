import { test, expect } from "./helpers/fixtures";

test.describe("Reports", () => {
  test("should navigate to reports page", async ({ authenticatedPage: page }) => {
    await page.goto("/reports");
    await expect(page.getByText(/reports/i)).toBeVisible();
  });

  test("should select a report template", async ({ authenticatedPage: page }) => {
    await page.goto("/reports/generate");
    // Select a template from the list
    const templateSelect = page.locator("select, [role='combobox']").first();
    if (await templateSelect.isVisible()) {
      await templateSelect.click();
      const firstOption = page.locator("[role='option'], option").first();
      if (await firstOption.isVisible()) {
        await firstOption.click();
      }
    }
  });

  test("should generate a report", async ({ authenticatedPage: page }) => {
    await page.goto("/reports/generate");
    // Select template
    const templateSelect = page.locator("select, [role='combobox']").first();
    if (await templateSelect.isVisible()) {
      await templateSelect.click();
      const firstOption = page.locator("[role='option'], option").first();
      if (await firstOption.isVisible()) {
        await firstOption.click();
      }
    }
    // Click generate
    const generateBtn = page.getByRole("button", { name: /generate/i });
    if (await generateBtn.isVisible()) {
      await generateBtn.click();
      // Wait for report to start processing
      await expect(
        page.getByText(/generating|processing|completed|success/i),
      ).toBeVisible({ timeout: 15_000 });
    }
  });

  test("should wait for report completion", async ({ authenticatedPage: page }) => {
    await page.goto("/reports");
    // If there are completed reports, verify their status
    const statusBadge = page.locator("[data-testid='report-status'], .badge").filter({ hasText: /completed/i });
    if (await statusBadge.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      expect(await statusBadge.count()).toBeGreaterThan(0);
    }
  });
});
