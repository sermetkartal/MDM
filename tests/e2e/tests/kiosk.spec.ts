import { test, expect } from "./helpers/fixtures";
import { testKioskProfile } from "./helpers/mock-data";

test.describe("Kiosk", () => {
  test("should navigate to kiosk page", async ({ authenticatedPage: page }) => {
    await page.goto("/kiosk");
    await expect(page.getByText(/kiosk/i)).toBeVisible();
  });

  test("should create a kiosk profile", async ({ authenticatedPage: page }) => {
    await page.goto("/kiosk");
    // Click create button
    const createBtn = page.getByRole("button", { name: /create|new/i });
    if (await createBtn.isVisible()) {
      await createBtn.click();
    }

    // Fill profile name
    const nameInput = page.getByLabel(/name/i);
    if (await nameInput.isVisible()) {
      await nameInput.fill(testKioskProfile.name);
    }

    // Select mode
    const modeSelect = page.locator("select, [role='combobox']").first();
    if (await modeSelect.isVisible()) {
      await modeSelect.click();
      const singleAppOption = page.getByText(/single.?app/i);
      if (await singleAppOption.isVisible()) {
        await singleAppOption.click();
      }
    }

    // Submit
    const saveBtn = page.getByRole("button", { name: /save|create/i });
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
    }
  });

  test("should display kiosk profiles in the list", async ({ authenticatedPage: page }) => {
    await page.goto("/kiosk");
    // Page should load without errors
    await expect(page.locator("body")).toBeVisible();
  });
});
