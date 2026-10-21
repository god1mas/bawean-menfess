import { expect, test } from "@playwright/test";

test("renders the D0 brand foundation", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Ceritamu, Ruang Kita." }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("img", {
      name: "Logo resmi Bawean Menfess",
    }),
  ).toBeVisible();
});
