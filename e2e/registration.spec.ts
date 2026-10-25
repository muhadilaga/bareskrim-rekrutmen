import { test, expect } from "@playwright/test";

test.describe("Registration Wizard E2E Tests (Mocked API)", () => {

  test("Step navigation, validation, review box, and successful submission", async ({ page }) => {
    // Mock API response 201
    await page.route("**/api/applications", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            registrationId: "XLI-02-E2ETEST",
            accessToken: "E2E_ACCESS_TOKEN_32_CHARS_BASE32",
            status: "MENUNGGU_VERIFIKASI",
          },
        }),
      });
    });

    await page.goto("/daftar");

    // Check heading
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Daftarkan dirimu.");

    // STEP 01 Form Inputs
    await page.fill("#fullName", "Budi Santoso");
    await page.fill("#robloxUsername", "BudiRoblox_E2E");
    await page.fill("#discordId", "budi_discord#1234");
    await page.fill("#birthDate", "2000-05-20");
    await page.selectOption("#gender", "L");

    // Click Next to Step 2
    await page.click("div[data-step='1'] button.next-button");

    // Verify Step 2 active
    await expect(page.locator("div[data-step='2']")).toHaveClass(/active/);

    // STEP 02 Form Inputs
    await page.fill("#origin", "Jakarta Selatan");
    await page.fill("#experience", "Pengalaman roleplay kepolisian selama 2 tahun.");
    await page.fill("#motivation", "Ingin bergabung dan mengembangkan skill di Pusdik Reserse.");

    // Click Next to Step 3
    await page.click("div[data-step='2'] button.next-button");

    // Verify Step 3 active
    await expect(page.locator("div[data-step='3']")).toHaveClass(/active/);

    // Verify Review Box Content
    await expect(page.locator("#reviewName")).toHaveText("Budi Santoso");
    await expect(page.locator("#reviewRoblox")).toHaveText("BudiRoblox_E2E");
    await expect(page.locator("#reviewDiscord")).toHaveText("budi_discord#1234");
    await expect(page.locator("#reviewOrigin")).toHaveText("Jakarta Selatan");

    // Check Agreement Checkbox (use force: true due to custom-check span)
    await page.check("#agreement", { force: true });

    // Click Submit
    await page.click("button.submit-button");

    // Verify Success View
    await expect(page.locator("#successSection")).toBeVisible();
    await expect(page.locator("#registrationId")).toHaveText("XLI-02-E2ETEST");
    await expect(page.locator("#accessToken")).toHaveText("E2E_ACCESS_TOKEN_32_CHARS_BASE32");

    // Verify Security: No access token stored in localStorage or sessionStorage
    const localTok = await page.evaluate(() => localStorage.getItem("accessToken"));
    const sessionTok = await page.evaluate(() => sessionStorage.getItem("accessToken"));
    expect(localTok).toBeNull();
    expect(sessionTok).toBeNull();
  });

  test("Step 1 validation prevents advancing when incomplete", async ({ page }) => {
    await page.goto("/daftar");
    // Leave fullName empty
    await page.fill("#robloxUsername", "BudiRoblox_E2E");

    // Listen to alert dialog
    let alertMessage = "";
    page.once("dialog", (dialog) => {
      alertMessage = dialog.message();
      dialog.dismiss();
    });

    await page.click("div[data-step='1'] button.next-button");
    expect(alertMessage).toContain("Harap lengkapi seluruh data identitas");
    await expect(page.locator("div[data-step='1']")).toHaveClass(/active/);
  });

  test("Back button navigation preserves form state", async ({ page }) => {
    await page.goto("/daftar");

    await page.fill("#fullName", "Siti Aminah");
    await page.fill("#robloxUsername", "SitiRoblox");
    await page.fill("#discordId", "siti_disc");
    await page.fill("#birthDate", "1998-12-10");
    await page.selectOption("#gender", "P");
    await page.click("div[data-step='1'] button.next-button");

    await page.fill("#origin", "Surabaya");
    await page.fill("#experience", "Pengalaman roleplay medis dan penyidikan.");
    await page.fill("#motivation", "Ingin menjadi penyidik berkualitas.");
    await page.click("div[data-step='2'] button.next-button");

    // Go Back to Step 2
    await page.click("div[data-step='3'] button.back-button");
    await expect(page.locator("div[data-step='2']")).toHaveClass(/active/);
    await expect(page.locator("#origin")).toHaveValue("Surabaya");

    // Go Back to Step 1
    await page.click("div[data-step='2'] button.back-button");
    await expect(page.locator("div[data-step='1']")).toHaveClass(/active/);
    await expect(page.locator("#fullName")).toHaveValue("Siti Aminah");
  });

  test("HTTP 409 Duplicate Username error presentation", async ({ page }) => {
    await page.route("**/api/applications", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: "Username Roblox sudah terdaftar pada periode pendaftaran ini.",
        }),
      });
    });

    await page.goto("/daftar");
    await page.fill("#fullName", "Budi Santoso");
    await page.fill("#robloxUsername", "BudiRoblox_E2E");
    await page.fill("#discordId", "budi_disc");
    await page.fill("#birthDate", "2000-05-20");
    await page.selectOption("#gender", "L");
    await page.click("div[data-step='1'] button.next-button");

    await page.fill("#origin", "Jakarta");
    await page.fill("#experience", "Pengalaman roleplay penyidikan.");
    await page.fill("#motivation", "Ingin belajar penyidikan.");
    await page.click("div[data-step='2'] button.next-button");

    await page.check("#agreement", { force: true });
    await page.click("button.submit-button");

    // Verify Error Banner
    const banner = page.locator(".error-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Username Roblox sudah terdaftar");
  });

  test("HTTP 403 Closed Period error presentation", async ({ page }) => {
    await page.route("**/api/applications", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: "Periode pendaftaran sedang tidak aktif atau belum dibuka.",
        }),
      });
    });

    await page.goto("/daftar");
    await page.fill("#fullName", "Budi Santoso");
    await page.fill("#robloxUsername", "BudiRoblox_E2E");
    await page.fill("#discordId", "budi_disc");
    await page.fill("#birthDate", "2000-05-20");
    await page.selectOption("#gender", "L");
    await page.click("div[data-step='1'] button.next-button");

    await page.fill("#origin", "Jakarta");
    await page.fill("#experience", "Pengalaman roleplay penyidikan.");
    await page.fill("#motivation", "Ingin belajar penyidikan.");
    await page.click("div[data-step='2'] button.next-button");

    await page.check("#agreement", { force: true });
    await page.click("button.submit-button");

    await expect(page.locator(".error-banner")).toContainText("tidak aktif atau belum dibuka");
  });

  test("HTTP 429 Rate Limit error presentation", async ({ page }) => {
    await page.route("**/api/applications", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: "Terlalu banyak permintaan pendaftaran. Silakan coba lagi beberapa saat.",
        }),
      });
    });

    await page.goto("/daftar");
    await page.fill("#fullName", "Budi Santoso");
    await page.fill("#robloxUsername", "BudiRoblox_E2E");
    await page.fill("#discordId", "budi_disc");
    await page.fill("#birthDate", "2000-05-20");
    await page.selectOption("#gender", "L");
    await page.click("div[data-step='1'] button.next-button");

    await page.fill("#origin", "Jakarta");
    await page.fill("#experience", "Pengalaman roleplay penyidikan.");
    await page.fill("#motivation", "Ingin belajar penyidikan.");
    await page.click("div[data-step='2'] button.next-button");

    await page.check("#agreement", { force: true });
    await page.click("button.submit-button");

    await expect(page.locator(".error-banner")).toContainText("Terlalu banyak permintaan");
  });

  test("HTTP 503 Service Unavailable error presentation", async ({ page }) => {
    await page.route("**/api/applications", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: "Layanan pendaftaran sedang tidak dapat diakses (schema/database belum siap).",
        }),
      });
    });

    await page.goto("/daftar");
    await page.fill("#fullName", "Budi Santoso");
    await page.fill("#robloxUsername", "BudiRoblox_E2E");
    await page.fill("#discordId", "budi_disc");
    await page.fill("#birthDate", "2000-05-20");
    await page.selectOption("#gender", "L");
    await page.click("div[data-step='1'] button.next-button");

    await page.fill("#origin", "Jakarta");
    await page.fill("#experience", "Pengalaman roleplay penyidikan.");
    await page.fill("#motivation", "Ingin belajar penyidikan.");
    await page.click("div[data-step='2'] button.next-button");

    await page.check("#agreement", { force: true });
    await page.click("button.submit-button");

    await expect(page.locator(".error-banner")).toContainText("tidak dapat diakses");
  });

  test("Viewport responsiveness: Desktop (1440x900), Tablet (768x1024), Mobile (390x844)", async ({ page }) => {
    // Desktop 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/daftar");
    await expect(page.locator(".form-layout")).toBeVisible();

    // Tablet 768x1024
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator(".form-layout")).toBeVisible();

    // Mobile 390x844
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".form-layout")).toBeVisible();
    await expect(page.locator("div[data-step='1'] button.next-button")).toBeVisible();
  });

});
