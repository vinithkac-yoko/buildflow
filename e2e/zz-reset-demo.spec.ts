import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("owner can reset demo data; demo accounts still work afterwards", async ({ page }) => {
  await login(page, "owner@buildflow.demo");
  await page.goto("/settings");
  await page.getByRole("button", { name: /Reset demo data/ }).click();
  await page.getByRole("button", { name: "Yes, continue" }).click();
  await expect(page).toHaveURL(/\/login/);
  await login(page, "owner@buildflow.demo");
  await page.goto("/projects");
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(9);
});

test("only the owner sees the reset button", async ({ page }) => {
  await login(page, "admin@buildflow.demo");
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: /Reset demo data/ })).toHaveCount(0);
});
