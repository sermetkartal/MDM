import { test as base, expect, Page } from "@playwright/test";

/** Performs login via the UI and stores auth state. */
async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await loginAs(
      page,
      process.env.TEST_ADMIN_EMAIL ?? "admin@example.com",
      process.env.TEST_ADMIN_PASSWORD ?? "password123",
    );
    await page.waitForURL("**/", { timeout: 10_000 });
    await use(page);
  },
});

export { expect, loginAs };
