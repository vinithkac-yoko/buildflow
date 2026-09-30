import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const ACCOUNTS = [
  "owner@buildflow.demo", "pm1@buildflow.demo", "engineer1@buildflow.demo", "accounts@buildflow.demo",
  "procurement@buildflow.demo", "store@buildflow.demo", "quality@buildflow.demo", "hr@buildflow.demo",
  "marketing@buildflow.demo", "admin@buildflow.demo", "client@buildflow.demo",
];

test.describe("Sign out is reachable for every role, on phone and desktop", () => {
  for (const email of ACCOUNTS) {
    test(`account menu → Sign out (${email.split("@")[0]})`, async ({ page }) => {
      await login(page, email);
      await page.getByRole("button", { name: /Account menu for/ }).click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();
      await expect(page).toHaveURL(/\/login/);
      await page.goto("/projects");
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test("desktop sidebar also has a Sign out button", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1440", "sidebar is desktop-only");
    await login(page, "engineer1@buildflow.demo");
    await page.getByRole("navigation", { name: "Main" }).locator("xpath=following-sibling::div").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
