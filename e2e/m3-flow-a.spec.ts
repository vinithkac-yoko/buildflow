import { expect, test, devices } from "@playwright/test";
import { login } from "./helpers";

// 1x1 JPEG; the app compresses it on the device and uploads it.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

// Flow A changes today's data, so it runs once (phone viewport, like the site engineer) — the reset spec restores the demo afterwards.
test.describe("Flow A — daily report to approval", () => {
  test.beforeEach(async ({ page }, info) => {
    void page;
    test.skip(info.project.name !== "phone-390", "Flow A runs on the 390px engineer viewport");
  });

  test("engineer files a report, PM approves it, progress and stock update", async ({ page, browser }) => {
    // ── Site Engineer on a phone ──
    await login(page, "engineer1@buildflow.demo");
    await expect(page.getByText("Not started")).toBeVisible();
    await page.getByRole("link", { name: /Start today.s report/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("RS Puram");

    // Submit is off until there is something to submit, and it says why.
    await expect(page.getByRole("button", { name: "SUBMIT DAILY REPORT" })).toBeDisabled();
    await expect(page.getByText(/Enter a quantity for at least one activity/)).toBeVisible();

    await page.getByRole("radio", { name: "Cloudy" }).click();
    // Keep two activities (yesterday's work is pre-filled); drop the rest.
    for (const n of ["Conduit and wiring", "CPVC water supply lines", "Concealed drainage and soil lines"]) {
      await page.getByRole("button", { name: `Remove ${n}` }).click();
    }
    await expect(page.getByText("2 activities")).toBeVisible();
    await expect(page.getByRole("button", { name: "Same as yesterday" }).first()).toBeVisible();

    // An impossible quantity is stopped with a message that says what is left.
    const qty = page.getByLabel("Quantity done today");
    await qty.nth(0).fill("999999");
    await expect(page.getByText(/left on AAC block masonry/)).toBeVisible();
    await expect(page.getByRole("button", { name: "SUBMIT DAILY REPORT" })).toBeDisabled();
    await qty.nth(0).fill("40");
    await qty.nth(1).fill("300");

    // Material with the available stock shown.
    await page.getByRole("button", { name: /Add material/ }).click();
    await page.getByRole("dialog", { name: "Material" }).getByLabel(/Search/).fill("Cement");
    await page.getByRole("option", { name: /Cement OPC 53/ }).click();
    await expect(page.getByText(/In stock: \d/).first()).toBeVisible();
    const stockBefore = Number((await page.getByText(/In stock: [\d.]+ bag/).first().innerText()).match(/In stock: ([\d.]+)/)![1]);
    await page.getByLabel("Quantity used").fill("4");

    // Photo: the phone shrinks it and uploads it; the tile shows its state.
    await page.locator('input[type="file"]').setInputFiles({ name: "site.jpg", mimeType: "image/jpeg", buffer: JPEG });
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible({ timeout: 15000 });

    // Quick issue.
    await page.getByRole("button", { name: /Report an issue/ }).click();
    await page.getByLabel("What is the problem?").fill("E2E: scaffolding tie missing at east side");
    await page.getByRole("radio", { name: "High" }).click();
    await page.getByRole("button", { name: "Report issue", exact: true }).click();
    await expect(page.getByText("Issue reported to your PM.")).toBeVisible();

    await page.getByLabel(/Remarks/).fill("E2E report");
    await expect(page.getByText(/Saved \d/)).toBeVisible({ timeout: 10000 }); // autosave

    await page.getByRole("button", { name: "SUBMIT DAILY REPORT" }).click();
    await expect(page.getByRole("heading", { name: "Report sent" })).toBeVisible();
    await expect(page.getByText(/Sent to .* for approval/)).toBeVisible();

    // A second attempt for the same project and day lands on the existing report, read-only.
    await page.goto("/dpr");
    await expect(page.getByText(/waiting for|Sent to/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "SUBMIT DAILY REPORT" })).toHaveCount(0);
    const projectUrl = page.url();

    // ── PM on a laptop ──
    const ctx2 = await browser.newContext({ ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } });
    const pm = await ctx2.newPage();
    await login(pm, "pm1@buildflow.demo");
    const actualPct = async () => {
      await pm.goto("/");
      const card = pm.locator("main ul.panel > li", { hasText: "RS Puram" });
      await expect(card).toBeVisible();
      return Number((await card.getByText(/Actual/).first().innerText()).match(/([\d.]+)%/)![1]);
    };
    const pctBefore = await actualPct(); // an unapproved report has not moved progress
    await pm.goto("/progress");
    await expect(pm.getByRole("link", { name: /RS Puram/ }).first()).toBeVisible();
    await pm.getByRole("link", { name: /RS Puram/ }).first().click();
    await expect(pm.getByRole("heading", { level: 1 })).toContainText("RS Puram");
    await expect(pm.getByText("AAC block masonry – first floor").first()).toBeVisible();
    await expect(pm.getByText("Cement OPC 53").first()).toBeVisible();
    await pm.getByRole("button", { name: /Approve & update progress/ }).click();
    await pm.getByRole("dialog").getByRole("button", { name: /Approve & update progress/ }).click();
    await expect(pm.getByText(/Approved\. \d+ activities updated/)).toBeVisible();

    // The report is approved and cannot be approved again.
    await pm.goto("/progress?status=APPROVED&project=" + projectUrl.split("/dpr/")[1]);
    await expect(pm.locator("main li").getByText("Approved", { exact: true }).first()).toBeVisible();

    // Approval moved the project's actual % on the portfolio screen.
    expect(await actualPct()).toBeGreaterThan(pctBefore);

    // Stock went down by exactly what was used.
    await pm.goto(`/materials?project=${projectUrl.split("/dpr/")[1]}`);
    const after = Number((await pm.getByText(/Cement OPC 53/).first().locator("xpath=ancestor::li").locator(".num").first().innerText()).match(/[\d.]+/)![0]);
    expect(after).toBeCloseTo(stockBefore - 4, 1);

    // Engineer sees the outcome; the whole thing is in the audit trail.
    await page.goto("/my-projects");
    await expect(page.locator("main").getByText("Approved", { exact: true }).first()).toBeVisible();
    await ctx2.close();
  });

  test("approval is blocked when stock is short, with a clear message, and nothing changes", async ({ page, browser }) => {
    await login(page, "engineer6@buildflow.demo"); // Kumaran Nagar, PM 1
    await page.goto("/dpr");
    await page.waitForURL(/\/dpr\//);
    const url = page.url();
    await page.getByRole("radio", { name: "Sunny" }).click();
    const first = page.getByLabel("Quantity done today").first();
    await first.fill("2");
    await page.getByRole("button", { name: /Add material/ }).click();
    await page.getByRole("dialog", { name: "Material" }).getByLabel(/Search/).fill("Cement");
    await page.getByRole("option", { name: /Cement OPC 53/ }).click();
    await page.getByLabel("Quantity used").fill("99999");
    await expect(page.getByText(/Only [\d.]+ bag of Cement OPC 53 in stock/)).toBeVisible(); // soft warning at entry
    await page.getByRole("button", { name: "SUBMIT DAILY REPORT" }).click(); // submit is allowed
    await expect(page.getByRole("heading", { name: "Report sent" })).toBeVisible();

    const ctx2 = await browser.newContext({ ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } });
    const pm = await ctx2.newPage();
    await login(pm, "pm1@buildflow.demo");
    await pm.goto("/progress");
    await pm.getByRole("link", { name: /Kumaran Nagar/ }).first().click();
    await expect(pm.getByText("Approval will be blocked by stock")).toBeVisible();
    await pm.getByRole("button", { name: /Approve & update progress/ }).click();
    await pm.getByRole("dialog").getByRole("button", { name: /Approve & update progress/ }).click();
    await expect(pm.getByText("Can't approve yet")).toBeVisible();
    const blocked = pm.getByRole("alert").filter({ hasText: "Can't approve yet" });
    await expect(blocked.getByText(/Not enough stock to approve this report/)).toBeVisible();
    await expect(blocked.getByText(/Cement OPC 53: needs 99999 bag/)).toBeVisible();
    // Still waiting for approval.
    await pm.goto("/progress?status=SUBMITTED");
    await expect(pm.getByRole("link", { name: /Kumaran Nagar/ }).first()).toBeVisible();
    // The PM can send it back with a reason; the engineer sees it.
    await pm.getByRole("link", { name: /Kumaran Nagar/ }).first().click();
    await pm.getByRole("button", { name: "Send back" }).click();
    await pm.getByLabel("What should they fix?").fill("Cement quantity looks wrong — check the challan");
    await pm.getByRole("dialog").getByRole("button", { name: "Send back" }).click();
    await expect(pm.getByText("Sent back to the engineer.")).toBeVisible();
    await page.goto(url);
    await expect(page.getByText("Your PM sent this report back")).toBeVisible();
    await expect(page.getByText("Cement quantity looks wrong")).toBeVisible();
    await ctx2.close();
  });
});
