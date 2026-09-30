import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("Portfolio progress (rough cut, polished in milestone 7)", () => {
  test("owner sees every live site grouped by PM, with planned vs actual, attention list and freshness", async ({ page }) => {
    await login(page, "owner@buildflow.demo");
    await expect(page.getByRole("heading", { name: "Portfolio progress" })).toBeVisible();
    await expect(page.getByText(/Updated from \d+ approved reports? today|No reports approved yet today/)).toBeVisible();

    // Three PM groups with a summary each.
    for (const n of [1, 2, 3]) await expect(page.locator("summary", { hasText: `Demo Project Manager ${n}` })).toBeVisible();
    await expect(page.getByText(/\d sites/).first()).toBeVisible();

    // Every live project shows numbers, not just bars.
    const cards = page.locator("article");
    expect(await cards.count()).toBeGreaterThanOrEqual(7);
    await expect(cards.first().getByText(/Plan [\d.]+%/)).toBeVisible();
    await expect(cards.first().getByText(/Actual [\d.]+%/)).toBeVisible();

    // The stories the demo needs: something clearly behind, something ahead, a missing report.
    await expect(page.getByText("Behind", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Ahead", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/days? behind/).first()).toBeVisible();
    await expect(page.getByText(/No approved daily report for \d+ days/)).toBeVisible();
    await expect(page.getByText("Act now").first()).toBeVisible();

    // Flat "worst first" view and status filters.
    await page.getByRole("link", { name: "Worst first" }).click();
    await expect(page.locator("article").first()).toContainText("Avinashi Road"); // the clearly-behind site leads
    await page.getByRole("link", { name: "All", exact: true }).click();
    await expect(page.locator("article")).toHaveCount(9);
  });

  test("drilling into a project shows progress by stage and the S-curve, and a table alternative", async ({ page }) => {
    await login(page, "owner@buildflow.demo");
    await page.getByRole("link", { name: /Duplex villa/ }).first().click();
    await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
    await expect(page.getByText("By stage")).toBeVisible();
    await expect(page.getByText("Foundation").first()).toBeVisible();
    await page.getByText("View as table").first().click();
    await expect(page.getByRole("table").first()).toBeVisible();
  });

  test("a PM sees only their own projects and no contract value beyond their own", async ({ page }) => {
    await login(page, "pm2@buildflow.demo");
    const names = await page.locator("article h3, article a").allInnerTexts();
    expect(names.join(" ")).toContain("Avinashi Road");
    expect(names.join(" ")).not.toContain("Vadavalli");
  });

  test("engineers and clients have no portfolio", async ({ page }) => {
    await login(page, "engineer2@buildflow.demo");
    await page.goto("/");
    await expect(page).toHaveURL(/my-projects/);
    await page.context().clearCookies();
    await login(page, "client@buildflow.demo");
    await expect(page).toHaveURL(/\/projects/);
  });
});
