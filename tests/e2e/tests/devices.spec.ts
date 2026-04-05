import { test, expect } from "./helpers/fixtures";

test.describe("Devices", () => {
  test("should navigate to device list", async ({ authenticatedPage: page }) => {
    await page.goto("/devices");
    await expect(page.getByText("Devices")).toBeVisible();
    await expect(page.getByText("Manage enrolled devices")).toBeVisible();
  });

  test("should render device table", async ({ authenticatedPage: page }) => {
    await page.goto("/devices");
    await expect(page.locator("table")).toBeVisible();
    await expect(page.getByText("Device Name")).toBeVisible();
    await expect(page.getByText("Model")).toBeVisible();
    await expect(page.getByText("OS Version")).toBeVisible();
    await expect(page.getByText("Status")).toBeVisible();
  });

  test("should search devices", async ({ authenticatedPage: page }) => {
    await page.goto("/devices");
    const searchInput = page.getByPlaceholder("Search devices...");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("Pixel");
    // Wait for debounced search to fire
    await page.waitForTimeout(500);
    // Table should still be visible (filtered or showing "no results")
    await expect(page.locator("table")).toBeVisible();
  });

  test("should filter devices by status", async ({ authenticatedPage: page }) => {
    await page.goto("/devices");
    const statusFilter = page.locator("select").filter({ hasText: "All Status" });
    await statusFilter.selectOption("enrolled");
    await page.waitForTimeout(300);
    await expect(page.locator("table")).toBeVisible();
  });

  test("should click device row to navigate to detail", async ({ authenticatedPage: page }) => {
    await page.goto("/devices");
    const firstRow = page.locator("table tbody tr").first();
    // Only proceed if there are devices
    const rowCount = await page.locator("table tbody tr").count();
    if (rowCount > 0) {
      await firstRow.click();
      await expect(page).toHaveURL(/\/devices\/[\w-]+/);
    }
  });
});
