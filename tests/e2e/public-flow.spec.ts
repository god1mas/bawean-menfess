import { expect, test } from "@playwright/test";

const categories = [
  { slug: "confess", label: "Confess" },
  { slug: "curhat", label: "Curhat" },
  { slug: "ask-bm", label: "Ask BM" },
  { slug: "connect", label: "Connect" },
  { slug: "discuss", label: "Discuss" },
];
const trackingCode = "BM-0123-4567-89AB-CDEF-GHJK";
const trackingToken = `bmu_${"a".repeat(43)}`;

test.beforeEach(async ({ page }) => {
  await page.route("**/api/public/categories", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ categories }) }),
  );
});

test("submits an anonymous menfess and copies its one-time credential", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/public/menfess", async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    expect(body).toEqual({
      category: "curhat",
      message: "Cerita anonim untuk pengujian.",
      consent: true,
      idempotencyKey: expect.stringMatching(/^bmi_[A-Za-z0-9_-]{43}$/),
    });
    expect(body).not.toHaveProperty("status");
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        trackingCode,
        trackingPath: `/lacak#t=${trackingToken}`,
      }),
    });
  });

  await page.goto("/kirim");
  await page.getByText("Curhat", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Curhat" })).toBeChecked();
  await page.getByLabel("Pesan Menfess").fill("Cerita anonim untuk pengujian.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Kirim Menfess →" }).click();

  await expect(page.getByRole("heading", { name: "Menfess berhasil dikirim." })).toBeFocused();
  await expect(
    page.getByRole("textbox", {
      name: "Kode pelacakan, pilih untuk menyalin manual",
    }),
  ).toHaveValue(trackingCode);
  await page.getByRole("button", { name: "Salin" }).first().click();
  await expect(page.getByRole("button", { name: "Tersalin ✓" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test("shows accessible validation without submitting invalid form", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/public/menfess", (route) => {
    requests += 1;
    return route.abort();
  });
  await page.goto("/kirim");
  await page.getByRole("button", { name: "Kirim Menfess →" }).click();

  await expect(page.getByText("Pilih kategori terlebih dahulu.")).toBeVisible();
  await expect(page.getByText("Pesan menfess wajib diisi.")).toBeVisible();
  expect(requests).toBe(0);
});

test("looks up a private tracking link and removes the fragment", async ({ page }) => {
  await page.route("**/api/public/track", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ token: trackingToken });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "APPROVED" }),
    });
  });

  await page.goto(`/lacak#t=${trackingToken}`);
  await expect(page).toHaveURL(/\/lacak$/);
  await expect(page.getByRole("heading", { name: "Disetujui" })).toBeFocused();
  await expect(page.getByText("Isi pesan dan catatan moderasi tetap privat.")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test("shows a rate-limit response without leaking server details", async ({ page }) => {
  await page.route("**/api/public/track", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      headers: { "Retry-After": "120" },
      body: JSON.stringify({
        code: "RATE_LIMITED",
        message: "Terlalu banyak permintaan. Coba lagi setelah beberapa saat.",
        retryAfterSeconds: 120,
      }),
    }),
  );
  await page.goto("/lacak");
  await page.getByLabel("Kode pelacakan").fill(trackingCode);
  await page.getByRole("button", { name: "Lacak Sekarang →" }).click();

  await expect(page.getByText(/Terlalu banyak permintaan/)).toBeVisible();
  await expect(page.getByText(/stack|prisma|postgres/i)).toHaveCount(0);
});

test("keeps the public journey usable at a 390px mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/kirim");

  await expect(page.getByRole("heading", { name: "Kirim Menfess" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kirim Menfess →" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
