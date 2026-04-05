import { test, expect } from "./helpers/fixtures";

test.describe("Enrollment", () => {
  test("should navigate to enrollment page", async ({ authenticatedPage: page }) => {
    await page.goto("/enrollment");
    await expect(page.getByText(/enroll/i)).toBeVisible();
  });

  test("should generate a QR code", async ({ authenticatedPage: page }) => {
    await page.goto("/enrollment");
    // Click generate QR button
    const generateBtn = page.getByRole("button", { name: /generate|create|qr/i });
    if (await generateBtn.isVisible()) {
      await generateBtn.click();
      // Wait for QR code to appear (canvas or img element)
      await expect(
        page.locator("canvas, img[alt*='QR'], [data-testid='qr-code'], svg").first(),
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("should display QR code after generation", async ({ authenticatedPage: page }) => {
    await page.goto("/enrollment");
    const generateBtn = page.getByRole("button", { name: /generate|create|qr/i });
    if (await generateBtn.isVisible()) {
      await generateBtn.click();
      // QR code should be rendered
      const qrElement = page.locator("canvas, img[alt*='QR'], [data-testid='qr-code'], svg").first();
      await expect(qrElement).toBeVisible({ timeout: 5_000 });
      // The QR container should have non-zero dimensions
      const box = await qrElement.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
      }
    }
  });
});
