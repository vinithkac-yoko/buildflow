import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

test.describe("Milestone 2 — masters, projects, planning", () => {
  test("owner sees the master lists and can add a material with searchable selects", async ({ page }) => {
    await login(page, "owner@buildflow.demo");
    await page.goto("/masters");
    await expect(page.getByRole("heading", { name: "Masters" })).toBeVisible();
    await page.goto("/masters/material");
    await expect(page.getByText("Cement OPC 53").filter({ visible: true }).first()).toBeVisible();

    // search filters the list
    await page.getByLabel("Search Materials").fill("marble");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("Italian marble").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("Cement OPC 53")).toHaveCount(0);

    const name = `Test grout ${uid()}`;
    await page.getByRole("button", { name: /new material/i }).click();
    const dialog = page.getByRole("dialog", { name: /new material/i });
    await dialog.getByLabel(/Material name/).fill(name);
    await dialog.getByRole("button", { name: /Select category/i }).click();
    await page.getByRole("dialog", { name: "Category" }).getByLabel(/Search/).fill("Finish");
    await page.getByRole("option", { name: "Finishes" }).click();
    await dialog.getByRole("button", { name: /Select unit/i }).click();
    await page.getByRole("dialog", { name: "Unit" }).getByLabel(/Search/).fill("kg");
    await page.getByRole("option", { name: /^kg/ }).click();
    await dialog.getByLabel(/Standard unit cost/).fill("55");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Material added.")).toBeVisible();
    await page.goto("/masters/material?q=" + encodeURIComponent(name));
    await expect(page.getByText(name).filter({ visible: true }).first()).toBeVisible();
  });

  test("forms show validation next to the field", async ({ page }) => {
    await login(page, "owner@buildflow.demo");
    await page.goto("/masters/trade");
    await page.getByRole("button", { name: /new trade/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Enter the trade.")).toBeVisible();
  });

  test("duplicate codes are refused with a friendly message", async ({ page }) => {
    await login(page, "owner@buildflow.demo");
    await page.goto("/masters/uom");
    await page.getByRole("button", { name: /new unit of measure/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Code/).fill("cum");
    await dialog.getByLabel(/Name/).fill("Duplicate");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText(/already exists/i)).toBeVisible();
  });

  test("owner creates a project and it starts in Planning", async ({ page }) => {
    await login(page, "owner@buildflow.demo");
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    const dialog = page.getByRole("dialog", { name: "New project" });
    const name = `E2E villa ${uid()}`;
    await dialog.getByLabel(/Project name/).fill(name);
    await dialog.getByLabel(/Client/).selectOption({ index: 1 });
    await dialog.getByLabel(/Location/).fill("Coimbatore");
    await dialog.getByLabel(/Contract value/).fill("25000000");
    await dialog.getByLabel(/Start date/).fill("2026-10-01");
    await dialog.getByLabel(/Baseline finish/).fill("2027-12-01");
    await dialog.getByLabel(/Current finish/).fill("2027-12-01");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/Project created/)).toBeVisible();
    await page.getByRole("link", { name: new RegExp(name) }).click();
    await expect(page.getByText("Planning").first()).toBeVisible();
    await expect(page.getByText("Main Store")).toBeVisible();
  });

  test("project dates are validated", async ({ page }) => {
    await login(page, "owner@buildflow.demo");
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    const dialog = page.getByRole("dialog", { name: "New project" });
    await dialog.getByLabel(/Project name/).fill("Bad dates");
    await dialog.getByLabel(/Client/).selectOption({ index: 1 });
    await dialog.getByLabel(/Location/).fill("Erode");
    await dialog.getByLabel(/Contract value/).fill("1000000");
    await dialog.getByLabel(/Start date/).fill("2027-01-01");
    await dialog.getByLabel(/Baseline finish/).fill("2026-01-01");
    await dialog.getByLabel(/Current finish/).fill("2027-06-01");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Finish date must be after the start date.")).toBeVisible();
  });

  test("PM plans an assigned project: WBS, activities with cost, activity detail with BOM and BOQ links", async ({ page }) => {
    await login(page, "pm1@buildflow.demo");
    await page.goto("/planning");
    await page.getByRole("link", { name: /G\+2 luxury villa/ }).click();
    await expect(page.getByRole("heading", { name: "Planning" })).toBeVisible();
    await expect(page.getByText("Foundation").first()).toBeVisible();
    await page.getByRole("link", { name: "Activities" }).click();
    await expect(page.getByText(/\d+ activities/).first()).toBeVisible();
    await expect(page.getByText("Planned cost").filter({ visible: true }).first()).toBeVisible();

    await page.getByRole("link", { name: "Italian marble flooring" }).first().click();
    await expect(page.getByRole("heading", { name: "Italian marble flooring" })).toBeVisible();
    await expect(page.getByText("Material BOM")).toBeVisible();
    await expect(page.getByText(/Italian marble/).nth(1)).toBeVisible();
    await expect(page.getByText("Linked BOQ items")).toBeVisible();

    // status change follows the transition map (only allowed next steps are offered)
    await expect(page.getByRole("button", { name: /Mark completed|Halt/ }).first()).toBeVisible();
  });

  test("PM can add an activity, and an impossible date range is rejected", async ({ page }) => {
    await login(page, "pm1@buildflow.demo");
    await page.goto("/planning");
    await page.getByRole("link", { name: /G\+2 luxury villa/ }).click();
    await page.getByRole("link", { name: "Activities" }).click();
    await page.getByRole("button", { name: "New activity" }).click();
    const dialog = page.getByRole("dialog", { name: "New activity" });
    await dialog.getByLabel(/Activity name/).fill(`E2E activity ${uid()}`);
    await dialog.getByRole("button", { name: /Select WBS item/i }).click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: /Select unit/i }).click();
    await page.getByRole("option", { name: /^sqm/ }).click();
    await dialog.getByLabel(/Planned quantity/).fill("10");
    await dialog.getByLabel(/Planned start/).fill("2026-12-10");
    await dialog.getByLabel(/Planned finish/).fill("2026-12-01");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Finish can't be before the start.")).toBeVisible();
    await dialog.getByLabel(/Planned finish/).fill("2026-12-20");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Activity added.")).toBeVisible();
  });

  test("site engineer sees plan without any money and without the BOQ", async ({ page }) => {
    await login(page, "engineer1@buildflow.demo");
    await page.goto("/projects");
    await page.getByRole("link", { name: /G\+2 luxury villa/ }).click();
    await page.waitForURL(/\/projects\/[^/]+$/);
    const projectUrl = page.url();
    await page.goto(projectUrl + "/planning?tab=activities");
    await expect(page.getByText(/\d+ activities/).first()).toBeVisible();
    const html = await page.content();
    expect(html).not.toMatch(/₹|Planned cost|plannedCost/);
    await expect(page.getByRole("link", { name: "BOQ" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New activity" })).toHaveCount(0);
    await page.goto(projectUrl + "/planning?tab=boq");
    await expect(page.getByText("BOQ items")).toHaveCount(0);
    await page.goto("/masters/material");
    await expect(page.getByText("Standard unit cost")).toHaveCount(0);
  });

  test("engineer cannot open planning of an unassigned project", async ({ page }) => {
    await login(page, "owner@buildflow.demo");
    await page.goto("/projects");
    const href = await page.getByRole("link", { name: /Duplex villa/ }).getAttribute("href");
    await page.context().clearCookies();
    await login(page, "engineer1@buildflow.demo");
    await page.goto(href + "/planning");
    await expect(page.getByText(/couldn.t find that page/i)).toBeVisible();
  });

  test("admin manages users and assignments but cannot see costs or create projects", async ({ page }) => {
    await login(page, "admin@buildflow.demo");
    await page.goto("/projects");
    await expect(page.getByRole("button", { name: "New project" })).toHaveCount(0);
    await expect(page.getByText("Contract value")).toHaveCount(0);

    await page.goto("/users");
    const email = `e2e-${uid()}@buildflow.demo`;
    await page.getByRole("button", { name: "New user" }).click();
    const dialog = page.getByRole("dialog", { name: "New user" });
    await dialog.getByLabel(/Full name/).fill("E2E Engineer");
    await dialog.getByLabel(/Email/).fill(email);
    await dialog.getByLabel(/^Role/).selectOption("SITE_ENGINEER");
    await dialog.getByLabel(/Temporary password/).fill("short");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText(/at least 8 characters/)).toBeVisible();
    await dialog.getByLabel(/Temporary password/).fill("e2e-pass-123");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("User created.")).toBeVisible();
    // Admin cannot mint an Owner
    await page.getByRole("button", { name: "New user" }).click();
    const roles = await page.getByRole("dialog", { name: "New user" }).getByLabel(/^Role/).locator("option").allTextContents();
    expect(roles).not.toContain("Owner");
  });

  test("admin assigns and removes an engineer; the engineer's project list follows", async ({ page, browser }) => {
    await login(page, "admin@buildflow.demo");
    await page.goto("/assignments");
    const card = page.locator("div.panel", { hasText: "Farmhouse residence, Pollachi" });
    await card.getByRole("button", { name: /Add a person/ }).click();
    await page.getByRole("dialog", { name: "Person" }).getByLabel(/Search/).fill("Engineer 7");
    await page.getByRole("option").first().click();
    await card.getByRole("button", { name: "Assign" }).click();
    await expect(page.getByText("Assigned.")).toBeVisible();

    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await login(p2, "engineer7@buildflow.demo");
    await p2.goto("/my-projects");
    await expect(p2.getByText("Farmhouse residence, Pollachi")).toBeVisible();

    await page.reload();
    const card2 = page.locator("div.panel", { hasText: "Farmhouse residence, Pollachi" });
    await card2.getByRole("button", { name: /Remove Demo Site Engineer 7/ }).click();
    await page.getByRole("button", { name: "Yes, continue" }).click();
    await expect(page.getByText("Removed.")).toBeVisible();
    await p2.reload();
    await expect(p2.getByText("Farmhouse residence, Pollachi")).toHaveCount(0);
    await ctx2.close();
  });

  test("marketing manages clients only; procurement manages vendors and sees no material cost", async ({ page }) => {
    await login(page, "marketing@buildflow.demo");
    await page.goto("/clients");
    await page.getByRole("button", { name: /new client/i }).click();
    const dialog = page.getByRole("dialog");
    const name = `E2E client ${uid()}`;
    await dialog.getByLabel(/Client name/).fill(name);
    await dialog.getByLabel(/Status/).selectOption("ACTIVE");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Client added.")).toBeVisible();
    await page.goto("/projects");
    await expect(page.getByText(/don.t have access/i)).toBeVisible();

    await page.context().clearCookies();
    await login(page, "procurement@buildflow.demo");
    await page.goto("/vendors");
    await expect(page.getByText("Kovai Cement & Steel Depot").filter({ visible: true }).first()).toBeVisible();
    await page.goto("/masters/material");
    await expect(page.getByText("Standard unit cost")).toHaveCount(0);
  });

  test("audit log records master changes", async ({ page }) => {
    await login(page, "owner@buildflow.demo");
    await page.goto("/masters/trade");
    const name = `Audit trade ${uid()}`;
    await page.getByRole("button", { name: /new trade/i }).click();
    await page.getByRole("dialog").getByLabel(/Trade/).fill(name);
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Trade added.")).toBeVisible();
    await page.goto("/settings/audit?entity=Trade");
    await expect(page.getByText("CREATE").first()).toBeVisible();
    await expect(page.getByText(name).first()).toBeVisible();
  });
});
