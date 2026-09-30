import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("Flow D — owner portfolio, project dashboard, client portal", () => {
  test("owner reads the portfolio at a glance and drills into a project", async ({ page }) => {
    await login(page, "owner@buildflow.demo");
    await expect(page.getByRole("heading", { level: 1, name: "Portfolio progress" })).toBeVisible();
    await expect(page.getByText(/Updated from \d+ approved reports? today|No reports approved yet today/)).toBeVisible();

    // One sentence and one bar say how the portfolio is doing; the sites behind are on the left.
    await expect(page.getByText(/\d+ of \d+ live sites on track or ahead/)).toBeVisible();
    const segments = page.getByRole("list", { name: "Live sites by schedule status" }).getByRole("link");
    expect(await segments.count()).toBeGreaterThanOrEqual(7);
    await expect(segments.first()).toHaveAttribute("aria-label", /Behind/);

    // Needs attention leads with what matters; the rest is behind "Show more".
    await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
    await expect(page.getByText("Act now").first()).toBeVisible();
    await expect(page.getByText(/Show \d+ more/)).toBeVisible();

    // Grouped by PM with a summary each; one dense row per site with an icon-and-word health chip.
    for (const n of [1, 2, 3]) await expect(page.locator("summary", { hasText: `Demo Project Manager ${n}` })).toBeVisible();
    await expect(page.getByText(/^(Healthy|Watch|At risk)$/).first()).toBeVisible();
    const firstRow = page.locator("main ul.panel > li").first();
    await expect(firstRow).toBeVisible();
    const wide = (page.viewportSize()?.width ?? 0) >= 1024;
    expect((await firstRow.boundingBox())!.height).toBeLessThan(wide ? 200 : 340); // dense: a site is one line on a laptop and a compact card on a phone

    // The health formula is one tap away.
    await page.getByRole("button", { name: "How health is scored" }).focus();
    await expect(page.getByRole("tooltip").filter({ hasText: /Schedule 50/ })).toBeVisible();

    // Worst first puts the clearly-behind site on top; then drill into it.
    await page.getByRole("link", { name: "Worst first" }).click();
    await expect(page.locator("main ul.panel > li").first()).toContainText("Avinashi Road");
    await page.getByRole("link", { name: /Duplex villa with basement/ }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Avinashi Road");
    await expect(page.getByRole("heading", { name: "Open right now" })).toBeVisible();
    await expect(page.getByText(/No approved daily report for \d+ days/)).toBeVisible();
    await expect(page.getByText("Quality (open NCRs)")).toBeVisible();
    await expect(page.getByText(/^Health$/)).toBeVisible();
    await expect(page.getByText("By stage")).toBeVisible();
    await expect(page.getByText("Not scored yet")).toHaveCount(0);
  });

  test("the open major NCR at Vadavalli shows on its project and lowers its health", async ({ page }) => {
    await login(page, "owner@buildflow.demo");
    await page.getByRole("link", { name: /Villa with pool, Vadavalli/ }).first().click();
    await expect(page.getByRole("link", { name: /1 open NCR/ })).toBeVisible();
    await expect(page.getByText("Quality (open NCRs)").locator("xpath=..").getByText(/10\s*\/ 20/)).toBeVisible();
  });

  test("the client sees approved progress, shared photos and released documents — and nothing internal", async ({ page }) => {
    await login(page, "client@buildflow.demo");
    await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/); // a homeowner with one project lands on it
    const url = page.url();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("RS Puram");
    await expect(page.getByText(/\d+(\.\d+)?%\s*of your home is complete/)).toBeVisible();
    await expect(page.getByText(/Expected finish/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Progress by stage" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Latest from site" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Documents for you" })).toBeVisible();

    // Shared photos load through the authorised route.
    const img = page.locator('img[src^="/api/files/dpr-photo/"]').first();
    await expect(img).toBeVisible();
    const src = await img.getAttribute("src");
    const photo = await page.request.get(src!);
    expect(photo.status()).toBe(200);
    expect(photo.headers()["content-type"]).toContain("image/");

    // No plan comparison, days behind, health, issues, cost or internal terms on screen …
    const text = (await page.locator("main").innerText());
    for (const banned of [/days? (behind|ahead)/i, /health/i, /\bplan\b/i, /₹/, /open issue/i, /NCR/, /budget/i, /margin/i]) expect(text).not.toMatch(banned);
    // … and none in the response itself (the network check).
    const html = await (await page.request.get(url)).text();
    for (const banned of ["internalBudgetRate", "plannedCost", "healthScore", "contractValue", "plannedPct", "daysAheadBehind", "reworkLabourCost", "unitRate"]) expect(html).not.toContain(banned);

    // Client navigation: progress is this page; photos and documents work; bills and payments are honest placeholders.
    await page.getByRole("link", { name: "Progress", exact: true }).click();
    await expect(page).toHaveURL(url);
    await page.getByRole("link", { name: "Photos", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Photos" })).toBeVisible();
    await expect(page.locator("main img").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Hide from client|Show to client/ })).toHaveCount(0);
    await page.goto("/bills"); // (Bills sits under "More" on a phone)
    await expect(page.getByText(/later release/)).toBeVisible();
    await page.goto("/portfolio");
    await expect(page.getByText(/couldn.t find that page/i)).toBeVisible();
  });
});
