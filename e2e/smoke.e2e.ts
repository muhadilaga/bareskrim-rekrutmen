import { test, expect } from "@playwright/test";

test.describe("Halaman publik", () => {
  test("Beranda memuat dan menampilkan judul", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  });

  test("Halaman absen menampilkan form", async ({ page }) => {
    await page.goto("/absen");
    await expect(page.getByText("Absensi", { exact: false }).first()).toBeVisible();
  });

  test("Halaman cek hasil menampilkan input", async ({ page }) => {
    await page.goto("/hasil");
    await expect(page.getByPlaceholder("Username Roblox")).toBeVisible();
  });
});

test.describe("Kesehatan API", () => {
  test("GET /api/health mengembalikan status", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("status");
  });

  test("Tema toggle tersedia di Navbar", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /mode terang|mode gelap/i });
    await expect(toggle.first()).toBeVisible();
  });
});
