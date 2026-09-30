import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("Milestone 1 — sign-in, roles, project access", () => {
  test("unauthenticated visitors are sent to login", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login/);
  });

  test("wrong password shows a friendly error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill("owner@buildflow.demo");
    await page.getByLabel("Password", { exact: true }).fill("nope");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.locator("form [role=alert]")).toContainText(/don't match/i);
  });

  test("owner sees all projects with contract value", async ({ page }) => {
    await login(page, "owner@buildflow.demo");
    await page.goto("/projects");
    expect(await page.getByRole("heading", { level: 2 }).count()).toBeGreaterThanOrEqual(9);
    await expect(page.getByText("Contract value").first()).toBeVisible();
  });

  test("site engineer sees only the assigned project and no money", async ({ page }) => {
    await login(page, "engineer1@buildflow.demo");
    await expect(page).toHaveURL(/my-projects/);
    await expect(page.getByText("G+2 luxury villa, RS Puram")).toBeVisible();
    await expect(page.getByText("Duplex villa")).toHaveCount(0);
    const html = await page.content();
    expect(html).not.toMatch(/₹|Contract value|contractValue/);
    await page.goto("/projects");
    await expect(page.getByText("Contract value")).toHaveCount(0);
  });

  test("engineer cannot open an unassigned project", async ({ page }) => {
    await login(page, "owner@buildflow.demo");
    await page.goto("/projects");
    const href = await page.getByRole("link", { name: /Duplex villa/ }).getAttribute("href");
    await page.context().clearCookies();
    await login(page, "engineer1@buildflow.demo");
    await page.goto(href!);
    await expect(page.getByText(/couldn.t find that page/i)).toBeVisible();
  });

  test("client sees own project without internal costs", async ({ page }) => {
    await login(page, "client@buildflow.demo");
    await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/); // a homeowner with one project lands on it
    await expect(page.getByRole("heading", { level: 1 })).toContainText("RS Puram");
    await expect(page.locator("main")).not.toContainText("₹"); // no contract value or costs on the client's page
  });

  test("audit log is Owner/Admin only", async ({ page }) => {
    await login(page, "engineer1@buildflow.demo");
    await page.goto("/settings/audit");
    await expect(page.getByText(/Only the Owner and Admin/)).toBeVisible();
    await page.context().clearCookies();
    await login(page, "owner@buildflow.demo");
    await page.goto("/settings/audit");
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await expect(page.getByText("LOGIN").first()).toBeVisible();
  });

  test("theme toggle persists across reload", async ({ page }) => {
    await login(page, "owner@buildflow.demo");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: /switch to light/i }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: /switch to dark/i }).click(); // restore for other tests
    await page.waitForTimeout(500);
  });

  test("logout revokes the session", async ({ page }) => {
    await login(page, "owner@buildflow.demo");
    await page.goto("/settings");
    await page.getByRole("main").getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login/);
  });
});
