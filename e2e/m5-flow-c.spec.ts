import { expect, test, devices } from "@playwright/test";
import { login } from "./helpers";

// Flow C creates an inspection and an NCR, so it runs once — the reset spec restores the demo afterwards.
test.describe("Flow C — quality", () => {
  test.beforeEach(async ({}, info) => {
    test.skip(info.project.name !== "phone-390", "Flow C runs once on the 390px viewport (engineer and inspector are phone-first)");
  });

  test("request → inspect (rejected) → NCR raised → corrective action → rectification → failed then passed reinspection → closed", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };

    // ── Site Engineer, phone: request an inspection ──
    await login(page, "engineer1@buildflow.demo");
    await page.goto("/quality");
    await expect(page.getByRole("heading", { level: 1, name: "Quality" })).toBeVisible();
    await page.getByRole("link", { name: "Request an inspection" }).click();
    await expect(page.getByRole("button", { name: "REQUEST INSPECTION" })).toBeDisabled();
    await page.getByRole("button", { name: "Activity" }).click();
    await page.getByRole("dialog", { name: "Activity" }).getByLabel(/Search/).fill("Internal plastering");
    await page.getByRole("option", { name: /Internal plastering/ }).click();
    await page.getByRole("button", { name: "Checklist" }).click();
    await page.getByRole("option", { name: /Plastering/ }).click();
    await page.getByLabel("Note for the inspector").fill("E2E: internal walls ready");
    await page.getByRole("button", { name: "REQUEST INSPECTION" }).click();
    await expect(page.getByRole("heading", { name: "Inspection requested" })).toBeVisible();
    await page.goto("/quality");
    await expect(page.getByText("Waiting for inspector").first()).toBeVisible();
    await page.goto("/ncr");
    await expect(page.getByText(/don't have access|Non-conformance/).first()).toBeVisible();

    // ── Quality Engineer, phone: run the checklist ──
    const qeCtx = await browser.newContext({ ...devices["Pixel 7"], viewport: { width: 390, height: 844 } });
    const qe = await qeCtx.newPage();
    await login(qe, "quality@buildflow.demo");
    await qe.goto("/inspections");
    const waiting = qe.locator("li", { hasText: "E2E: internal walls ready" });
    await expect(waiting).toBeVisible();
    await waiting.getByRole("link", { name: "Start inspection" }).click();
    await expect(qe.getByRole("button", { name: "COMPLETE INSPECTION" })).toBeDisabled();
    await qe.getByRole("button", { name: "All pass" }).click();
    const passRadios = qe.getByRole("radio", { name: /^Pass — /, checked: true });
    await expect(passRadios).toHaveCount(8);
    await expect(qe.getByText(/8 of 8 pass — Pass/)).toBeVisible();
    // Fail the first four checkpoints: 4 of 8 pass is a rejection.
    for (let k = 0; k < 4; k++) await qe.getByRole("radio", { name: /^Fail — / }).nth(k).click();
    await expect(qe.getByText(/4 of 8 pass — Rejected/)).toBeVisible();
    await expect(qe.getByText("This will raise a Non-Conformance Report.")).toBeVisible();
    await qe.getByRole("radio", { name: "Critical" }).click();
    await qe.getByLabel("Describe the defect").fill("E2E: plaster hollow and cracked on the east wall");
    await qe.getByRole("button", { name: "COMPLETE INSPECTION" }).click();
    await expect(qe.getByRole("heading", { name: /Rejected — NCR raised/ })).toBeVisible();
    await qe.getByRole("link", { name: "Open the NCR" }).click();
    await expect(qe.getByRole("heading", { level: 1 })).toHaveText(/^NCR-\d+$/);
    const ncrUrl = qe.url();
    await expect(qe.getByText("E2E: plaster hollow and cracked on the east wall")).toBeVisible();
    await expect(qe.getByText("Agree the corrective action")).toBeVisible();
    await expect(qe.locator("main")).not.toContainText("₹"); // the inspector never sees rework cost

    // ── NCR life-cycle, in order ──
    await qe.getByRole("button", { name: "Agree corrective action" }).click();
    await qe.getByRole("dialog", { name: "Corrective action" }).getByLabel(/What will be done/).fill("Hack off and re-plaster the east wall");
    await qe.getByRole("button", { name: "Save corrective action" }).click();
    await expect(qe.getByText("Corrective action recorded.")).toBeVisible();

    await qe.getByRole("button", { name: "Record rectification" }).click();
    const rect = qe.getByRole("dialog", { name: "Record the rectification" });
    await rect.getByLabel(/What was done/).fill("East wall re-plastered");
    await rect.getByLabel(/Time lost/).fill("2");
    await rect.getByRole("button", { name: "Save rectification" }).click();
    await expect(qe.getByText("Rectification recorded.")).toBeVisible();

    await qe.getByRole("button", { name: "Request reinspection" }).click();
    await expect(qe.getByText("Reinspection requested.")).toBeVisible();
    await qe.getByRole("button", { name: "Failed — send back" }).click();
    await qe.getByRole("dialog", { name: "Reinspection failed" }).getByLabel(/What is still wrong/).fill("Hairline cracks remain");
    await qe.getByRole("button", { name: "Send back for rework" }).click();
    await expect(qe.getByText("Sent back for more rework.")).toBeVisible();

    await qe.getByRole("button", { name: "Record more rework" }).click();
    const more = qe.getByRole("dialog", { name: "Record more rework" });
    await more.getByLabel(/What more was done/).fill("Cracks filled and finished");
    await more.getByLabel(/More time lost/).fill("1");
    await more.getByRole("button", { name: "Save rework" }).click();
    await expect(qe.getByText("Rework recorded.")).toBeVisible();
    await qe.getByRole("button", { name: "Request reinspection" }).click();
    await expect(qe.getByText("Reinspection requested.")).toBeVisible();
    await qe.getByRole("button", { name: "Reinspection passed — close" }).click();
    await qe.getByRole("dialog").getByRole("button", { name: "Yes, continue" }).click();
    await expect(qe.getByText("NCR closed.")).toBeVisible();
    await expect(qe.getByText("Closed", { exact: true }).first()).toBeVisible();
    await expect(qe.getByText(/\d+ hours/)).toBeVisible(); // closure time recorded
    await expect(qe.getByText("3 days")).toBeVisible(); // 2 + 1 days lost
    await qeCtx.close();

    // ── PM, laptop: records the rework cost (cost data) ──
    const pmCtx = await browser.newContext(desktop);
    const pm = await pmCtx.newPage();
    await login(pm, "pm3@buildflow.demo"); // RS Puram belongs to PM 1 — this PM must not see it
    await pm.goto(ncrUrl);
    await expect(pm.getByText(/was not found|don't have access/)).toBeVisible();
    await pm.context().clearCookies();
    await login(pm, "pm1@buildflow.demo");
    await pm.goto(ncrUrl);
    await expect(pm.getByText("Reinspection passed").first()).toBeVisible();
    await pm.getByRole("button", { name: "Record rework cost" }).click();
    const cost = pm.getByRole("dialog", { name: "Rework cost" });
    await cost.getByLabel(/Rework labour cost/).fill("12000");
    await cost.getByLabel(/Rework material cost/).fill("3500");
    await cost.getByRole("button", { name: "Save cost" }).click();
    await expect(pm.getByText("Rework cost saved.")).toBeVisible();
    await expect(pm.getByText("₹12,000")).toBeVisible();
    await expect(pm.getByText("₹3,500")).toBeVisible();
    await pmCtx.close();
  });

  test("the owner sees quality across sites, including the seeded open major NCR", async ({ page }) => {
    await login(page, "owner@buildflow.demo");
    await page.goto("/quality");
    await expect(page.getByRole("heading", { level: 1, name: "Quality" })).toBeVisible();
    await expect(page.getByText("Major NCRs open")).toBeVisible();
    await page.goto("/ncr");
    await expect(page.getByText("Vadavalli").first()).toBeVisible();
    await page.goto("/");
    await expect(page.getByText(/NCR-\d+/).first()).toBeAttached(); // in the needs-attention list (collapsed on phones)
  });
});
