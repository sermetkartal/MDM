import { test, expect, loginAs } from "./helpers/fixtures";
import { testAdmin } from "./helpers/mock-data";

test.describe("Authentication", () => {
  test("should display the login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Sign in to MDM Console")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("should login with valid credentials and redirect to dashboard", async ({ page }) => {
    await loginAs(page, testAdmin.email, testAdmin.password);
    await page.waitForURL("**/", { timeout: 10_000 });
    await expect(page).toHaveURL(/\/(dashboard)?$/);
  });

  test("should show error for invalid credentials", async ({ page }) => {
    await loginAs(page, "wrong@example.com", "wrongpassword");
    await expect(page.getByText(/invalid|incorrect|failed/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("should redirect unauthenticated users to login", async ({ page }) => {
    await page.goto("/devices");
    await expect(page).toHaveURL(/\/login/);
  });
});
