import { expect, test } from "@playwright/test";

test("unauthenticated dashboard visitors are redirected to admin login", async ({
  page,
}) => {
  await page.goto("/admin");

  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(
    page.getByRole("heading", { name: "Masuk Admin" }),
  ).toBeVisible();
});

test("admin login offers no signup and the signup API is unavailable", async ({
  page,
  request,
}) => {
  await page.goto("/admin/login");

  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Kata sandi")).toBeVisible();
  await expect(page.getByRole("link", { name: /daftar|buat akun/i })).toHaveCount(
    0,
  );

  const response = await request.post("/api/auth/sign-up/email", {
    data: { name: "Visitor", email: "visitor@example.test", password: "unused" },
  });
  const adminApiResponse = await request.get("/api/admin/session");

  expect(response.status()).toBe(404);
  expect(adminApiResponse.status()).toBe(401);
  expect(adminApiResponse.headers()["cache-control"]).toContain("no-store");
});
