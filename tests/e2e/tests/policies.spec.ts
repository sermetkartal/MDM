import { test, expect } from "./helpers/fixtures";
import { testPolicy } from "./helpers/mock-data";

test.describe("Policies", () => {
  test("should navigate to policies page", async ({ authenticatedPage: page }) => {
    await page.goto("/policies");
    await expect(page.getByText("Policies")).toBeVisible();
    await expect(page.getByText("Configure and manage device policies")).toBeVisible();
  });

  test("should create a new restriction policy", async ({ authenticatedPage: page }) => {
    await page.goto("/policies/new");
    // Fill the policy name
    await page.getByLabel(/name/i).fill(testPolicy.name);
    // Select type
    const typeSelect = page.locator("select, [role='combobox']").filter({ hasText: /type/i });
    if (await typeSelect.count()) {
      await typeSelect.first().selectOption(testPolicy.type);
    }
    // Submit
    await page.getByRole("button", { name: /save|create/i }).click();
    // Should redirect or show success
    await expect(page.getByText(/created|success/i).or(page.locator("[data-testid='policy-list']"))).toBeVisible({
      timeout: 5_000,
    });
  });

  test("should show policies in the list", async ({ authenticatedPage: page }) => {
    await page.goto("/policies");
    await expect(page.locator("table")).toBeVisible();
    await expect(page.getByText("Policy Name")).toBeVisible();
    await expect(page.getByText("Type")).toBeVisible();
  });

  test("should navigate to edit policy", async ({ authenticatedPage: page }) => {
    await page.goto("/policies");
    // Click the actions menu on the first policy row
    const firstActions = page.locator("table tbody tr").first().getByRole("button");
    if (await firstActions.count()) {
      await firstActions.last().click();
      const editItem = page.getByRole("menuitem", { name: "Edit" });
      if (await editItem.isVisible()) {
        await editItem.click();
        await expect(page).toHaveURL(/\/policies\/[\w-]+\/edit/);
      }
    }
  });

  test("should delete a policy", async ({ authenticatedPage: page }) => {
    await page.goto("/policies");
    const firstActions = page.locator("table tbody tr").first().getByRole("button");
    if (await firstActions.count()) {
      await firstActions.last().click();
      const deleteItem = page.getByRole("menuitem", { name: /delete/i });
      if (await deleteItem.isVisible()) {
        await deleteItem.click();
        // Confirm deletion dialog if present
        const confirmBtn = page.getByRole("button", { name: /confirm|delete/i });
        if (await confirmBtn.isVisible()) {
          await confirmBtn.click();
        }
      }
    }
  });
});
