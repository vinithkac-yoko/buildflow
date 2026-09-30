import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("Ask BUILDFlow (Phase 2 preview)", () => {
  test("owner asks the four suggested questions and gets answers from live data", async ({ page }) => {
    await login(page, "owner@buildflow.demo");
    await page.goto("/ask");
    await expect(page.getByRole("heading", { level: 1, name: "Ask BUILDFlow" })).toBeVisible();
    await expect(page.getByText("Preview — AI assistant coming in Phase 2")).toBeVisible();

    // No free text yet: the box is there but disabled, with a reason.
    await expect(page.getByLabel("Or type your own question")).toBeDisabled();
    await expect(page.getByText("Typing your own question is not available yet.")).toBeVisible();

    const suggestions = page.getByRole("navigation", { name: "Suggested questions" });
    await expect(suggestions.getByRole("link")).toHaveCount(4);
    for (const box of await suggestions.getByRole("link").all()) expect((await box.boundingBox())!.height).toBeGreaterThanOrEqual(56);

    await suggestions.getByRole("link", { name: "Which activities are behind schedule?" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Which activities are behind schedule?" })).toBeVisible();
    await expect(page.getByText(/points behind/).first()).toBeVisible();
    await expect(page.getByText(/read function activities_behind_schedule/)).toBeVisible();

    await suggestions.getByRole("link", { name: "What's low on stock?" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "What's low on stock?" })).toBeVisible();
    await expect(page.getByText(/left$/).first()).toBeVisible();

    await suggestions.getByRole("link", { name: "Open NCRs this week?" }).click();
    await expect(page.getByText(/\d+ open · \d+ raised in the last 7 days/)).toBeVisible();

    await suggestions.getByRole("link", { name: "Labour mandays by project this week?" }).click();
    await expect(page.getByText(/mandays across \d+ projects? in the last 7 days/)).toBeVisible();

    // Answers carry no money.
    await expect(page.locator("main")).not.toContainText("₹");
  });

  test("a project manager can ask too, but a site engineer has no such screen", async ({ page }) => {
    await login(page, "pm1@buildflow.demo");
    await page.goto("/ask?q=behind");
    await expect(page.getByRole("heading", { level: 2, name: "Which activities are behind schedule?" })).toBeVisible();
    await page.context().clearCookies();

    await login(page, "engineer1@buildflow.demo");
    const res = await page.goto("/ask");
    expect(res?.status() === 404 || /\/(my-projects|login)/.test(page.url()) || (await page.getByText(/don't have access/i).count()) > 0).toBeTruthy();
    await expect(page.getByRole("heading", { name: "Ask BUILDFlow" })).toHaveCount(0);
  });
});
