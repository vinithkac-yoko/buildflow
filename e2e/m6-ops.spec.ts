import { expect, test, devices } from "@playwright/test";
import { login } from "./helpers";
import { makePdf } from "../src/core/demo/ops";

// These flows create issues, delays, documents, work orders and bills, so they run once — the reset spec restores the demo afterwards.
test.describe("Milestone 6 — issues, delays, equipment, documents, work orders", () => {
  test.beforeEach(async ({}, info) => {
    test.skip(info.project.name !== "phone-390", "Runs once; the engineer step is phone-first");
  });
  const tag = `${Date.now() % 100000}`; // unique per run, so reruns before a reset stay unambiguous
  const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };

  test("engineer reports an issue; the PM sets a target date and records a delay with evidence against a function", async ({ page, browser }) => {
    test.setTimeout(120_000);
    await login(page, "engineer1@buildflow.demo");
    await page.goto("/issues");
    await page.getByRole("button", { name: "Report an issue" }).click();
    const dlg = page.getByRole("dialog", { name: "Report an issue" });
    await dlg.getByRole("button", { name: "Report issue" }).click();
    await expect(dlg.getByText(/Describe the issue in a few words/)).toBeVisible();
    await dlg.getByLabel(/What is the problem/).fill(`E2E ${tag}: curing water tank leaking on the east side`);
    await dlg.getByLabel("How serious?").selectOption("HIGH");
    await dlg.getByLabel("Details (optional)").fill("Tank valve is worn out; water is running to the road.");
    await dlg.getByRole("button", { name: "Report issue" }).click();
    await expect(page.getByText("Issue reported.")).toBeVisible();
    await expect(page.getByText(`E2E ${tag}: curing water tank leaking on the east side`)).toBeVisible();
    await expect(page.getByRole("button", { name: /Set target date|Change target date/ })).toHaveCount(0); // engineers don't manage issues

    const pmCtx = await browser.newContext(desktop);
    const pm = await pmCtx.newPage();
    await login(pm, "pm1@buildflow.demo");
    await pm.goto("/issues");
    const card = pm.locator("li", { hasText: `E2E ${tag}: curing water tank leaking` });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: /Set target date|Change target date/ }).click();
    await pm.getByRole("dialog", { name: "Target date" }).getByLabel("Resolve by").fill("2030-01-15");
    await pm.getByRole("button", { name: "Save date" }).click();
    await expect(pm.getByText("Target date saved.")).toBeVisible();
    await expect(pm.locator("li", { hasText: `E2E ${tag}: curing water tank leaking` })).toContainText("fix by 15-Jan-2030");

    // Delay: needs a function, not a person.
    await pm.getByRole("link", { name: "Delays" }).click();
    await pm.getByRole("button", { name: "Record a delay" }).click();
    const d = pm.getByRole("dialog", { name: "Record a delay" });
    await d.getByRole("button", { name: "Save delay" }).click();
    await expect(d.getByText(/Pick the delay category/)).toBeVisible();
    await expect(d.getByText(/a team, not a person/)).toBeVisible();
    await d.getByLabel(/Project/).selectOption({ index: 0 });
    await d.getByLabel(/Category/).selectOption("MATERIAL_SUPPLY");
    await d.getByLabel(/What caused it/).fill(`E2E ${tag}: ready-mix truck arrived five hours late`);
    await d.getByLabel("Evidence *").fill("Delivery slip and site photo timestamps");
    await d.getByLabel(/Responsible function/).selectOption("PROCUREMENT");
    await d.getByLabel(/Cost impact/).fill("15000");
    await d.getByRole("checkbox", { name: /critical path/ }).check();
    await d.getByRole("button", { name: "Save delay" }).click();
    await expect(pm.getByText("Delay recorded.")).toBeVisible();
    const delay = pm.locator("li", { hasText: `E2E ${tag}: ready-mix truck arrived five hours late` });
    await expect(delay).toContainText("Critical path");
    await expect(delay).toContainText("Procurement");
    await expect(delay).toContainText("₹15,000");
    await expect(delay).toContainText("Ongoing");
    await delay.getByRole("button", { name: "Mark ended" }).click();
    await pm.getByRole("button", { name: "Save end date" }).click();
    await expect(pm.getByText("Delay ended.")).toBeVisible();
    await expect(pm.locator("li", { hasText: `E2E ${tag}: ready-mix truck arrived five hours late` })).toContainText("Ended");
    await pmCtx.close();
  });

  test("equipment: the PM logs usage and a breakdown, then puts it back in service", async ({ browser }) => {
    const ctx = await browser.newContext(desktop);
    const pm = await ctx.newPage();
    await login(pm, "pm1@buildflow.demo");
    await pm.goto("/equipment");
    await expect(pm.getByRole("heading", { level: 1, name: "Equipment" })).toBeVisible();
    await pm.getByRole("link", { name: "Concrete mixer 10/7" }).click();
    await expect(pm.getByText("Concrete mixer 10/7").first()).toBeVisible();
    await pm.getByRole("button", { name: /Log usage/ }).click();
    const dlg = pm.getByRole("dialog", { name: "Log equipment" });
    await dlg.getByLabel("Hours worked").fill("30");
    await dlg.getByRole("button", { name: "Save log" }).click();
    await expect(dlg.getByText(/24 hours/)).toBeVisible();
    await dlg.getByLabel("Hours worked").fill("4");
    await dlg.getByRole("button", { name: "Save log" }).click();
    await expect(pm.getByText("Logged.")).toBeVisible();

    await pm.getByRole("button", { name: /Log usage/ }).click();
    const d2 = pm.getByRole("dialog", { name: "Log equipment" });
    await d2.getByLabel("What happened?").selectOption("BREAKDOWN");
    await d2.getByRole("button", { name: "Save log" }).click();
    await expect(d2.getByText(/Say what broke down/)).toBeVisible();
    await d2.getByLabel("What broke down?").fill("E2E: drum bearing seized");
    await d2.getByRole("button", { name: "Save log" }).click();
    await expect(pm.getByText("Logged.")).toBeVisible();
    await expect(pm.getByText("Broken down").first()).toBeVisible();
    await pm.getByRole("button", { name: "Back in service" }).click();
    await expect(pm.getByText("Back in service.")).toBeVisible();
    await expect(pm.getByText("In use").first()).toBeVisible();
    await ctx.close();
  });

  test("documents: upload → approve → release → client sees it → new version pulls it back; bad files are refused", async ({ browser }) => {
    test.setTimeout(120_000);
    const pmCtx = await browser.newContext(desktop);
    const pm = await pmCtx.newPage();
    await login(pm, "pm1@buildflow.demo");
    await pm.goto("/documents");
    await pm.getByRole("button", { name: "Upload a document" }).click();
    const up = pm.getByRole("dialog", { name: "Upload a document" });
    await up.getByLabel("Category *").selectOption("DRAWINGS");
    await up.getByLabel("Title *").fill(`E2E site layout drawing ${tag}`);
    await up.locator('input[type="file"]').setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("this is not really a pdf") });
    await up.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(up.getByText(/Only PDF, DWG/)).toBeVisible();
    await up.locator('input[type="file"]').setInputFiles({ name: "layout.pdf", mimeType: "application/pdf", buffer: makePdf("E2E layout") });
    await up.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(pm.getByText("Document uploaded.")).toBeVisible();
    await pm.getByRole("link", { name: `E2E site layout drawing ${tag}` }).first().click();
    await expect(pm).toHaveURL(/\/documents\/[a-z0-9]+$/);
    await expect(pm.getByText("Waiting for approval").first()).toBeVisible();
    const docUrl = pm.url();
    await pm.getByRole("button", { name: "Approve" }).click();
    await expect(pm.getByText("Document approved.")).toBeVisible();
    await pm.getByRole("button", { name: "Release to client" }).click();
    await pm.getByRole("dialog").getByRole("button", { name: "Yes, continue" }).click();
    await expect(pm.getByText("Released to the client.")).toBeVisible();

    // The client (RS Puram's client) sees it and can download the file, but has no version history or status controls.
    const clCtx = await browser.newContext(desktop);
    const client = await clCtx.newPage();
    await login(client, "client@buildflow.demo");
    await client.goto("/documents");
    await expect(client.getByRole("link", { name: `E2E site layout drawing ${tag}` })).toBeVisible();
    await client.getByRole("link", { name: `E2E site layout drawing ${tag}` }).click();
    const href = await client.getByRole("link", { name: "Open / download" }).getAttribute("href");
    const file = await client.request.get(href!);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toContain("application/pdf");
    expect((await file.body()).subarray(0, 5).toString()).toBe("%PDF-");
    await expect(client.getByRole("button", { name: /Approve|Release|Reject/ })).toHaveCount(0);
    await expect(client.getByRole("heading", { name: "Versions" })).toHaveCount(0);
    // Documents that are not released stay invisible to the client, even by direct link (the seeded electrical layout is only uploaded).
    await pm.goto("/documents?project=");
    const hidden = await pm.getByRole("link", { name: "Electrical layout — first floor" }).getAttribute("href");
    await client.goto(hidden!);
    await expect(client.getByText(/We couldn.t find that page/)).toBeVisible();

    // A new version supersedes the current one: the document is back to "waiting" and the client no longer sees it.
    await pm.goto(docUrl);
    await pm.getByRole("button", { name: "Upload a new version" }).click();
    const nv = pm.getByRole("dialog", { name: "Upload a new version" });
    await nv.locator('input[type="file"]').setInputFiles({ name: "layout-v2.pdf", mimeType: "application/pdf", buffer: makePdf("E2E layout v2") });
    await nv.getByLabel("What changed?").fill("Moved the site office");
    await nv.getByRole("button", { name: "Upload version" }).click();
    await expect(pm.getByText(/New version uploaded/)).toBeVisible();
    await expect(pm.getByText("Version 2 ·")).toBeVisible();
    await expect(pm.getByText("Waiting for approval").first()).toBeVisible();
    await expect(pm.getByText("Version 1").first()).toBeVisible(); // the old one stays viewable
    await client.goto("/documents");
    await expect(client.getByRole("link", { name: `E2E site layout drawing ${tag}` })).toHaveCount(0);
    await clCtx.close();
    await pmCtx.close();
  });

  test("work order: PM issues and measures; Accounts bills and pays; over-measuring and over-paying are refused", async ({ browser }) => {
    test.setTimeout(180_000);
    const pmCtx = await browser.newContext(desktop);
    const pm = await pmCtx.newPage();
    await login(pm, "pm1@buildflow.demo");
    await pm.goto("/work-orders");
    await pm.getByRole("button", { name: "Issue a work order" }).click();
    const wo = pm.getByRole("dialog", { name: "Issue a work order" });
    await wo.getByLabel(/Project/).selectOption({ index: 0 }); // RS Puram
    await wo.getByLabel(/Subcontractor/).selectOption({ label: "Kongu Shuttering Works · Carpenter" });
    await wo.getByLabel(/^Title/).fill(`E2E shuttering ${tag}`);
    const activity = wo.locator("select[id^='wo-act-']").first();
    await activity.selectOption({ index: 1 });
    await wo.getByLabel(/^Quantity/).first().fill("100");
    await wo.getByLabel(/^Rate/).first().fill("50");
    await wo.getByRole("button", { name: "Issue work order" }).click();
    await expect(pm.getByText("Work order issued.")).toBeVisible();
    await pm.getByRole("link", { name: /WO-\d+/ }).first().click();
    await expect(pm.getByRole("heading", { level: 1 })).toHaveText(/^WO-\d+$/);
    const woUrl = pm.url();
    await expect(pm.getByText("Order value ₹5,000")).toBeVisible();

    await pm.getByRole("button", { name: "Record measurement" }).click();
    const ms = pm.getByRole("dialog", { name: "Record measured work" });
    await ms.getByLabel(/Quantity measured/).fill("150");
    await ms.getByRole("button", { name: "Save measurement" }).click();
    await expect(ms.getByText(/Only 100 .* left/).first()).toBeVisible();
    await ms.getByLabel(/Quantity measured/).fill("60");
    await ms.getByRole("button", { name: "Save measurement" }).click();
    await expect(pm.getByText("Measurement recorded.")).toBeVisible();
    await expect(pm.getByRole("button", { name: "Raise bill" })).toHaveCount(0); // billing is Accounts', not the PM's
    await pmCtx.close();

    const accCtx = await browser.newContext(desktop);
    const acc = await accCtx.newPage();
    await login(acc, "accounts@buildflow.demo");
    await acc.goto(woUrl);
    await expect(acc.getByRole("button", { name: "Record measurement" })).toHaveCount(0); // Accounts doesn't measure
    await acc.getByRole("button", { name: "Raise bill" }).click();
    const bill = acc.getByRole("dialog", { name: "Raise a subcontractor bill" });
    const billNo = `E2E-${Date.now() % 100000}`;
    await bill.getByLabel(/Bill number/).fill(billNo);
    await bill.getByRole("button", { name: "Save bill" }).click();
    await expect(acc.getByText("Bill raised.")).toBeVisible();
    await expect(acc.getByText(/payable ₹2,850/)).toBeVisible(); // 60 × ₹50 = 3,000 less 5% retention

    await acc.getByRole("button", { name: "Record payment" }).click();
    const pay = acc.getByRole("dialog", { name: "Pay the bill" });
    await pay.getByLabel(/Amount paid/).fill("5000");
    await pay.getByRole("button", { name: "Save payment" }).click();
    await expect(pay.getByText(/Only ₹2,850/).first()).toBeVisible();
    await pay.getByLabel(/Amount paid/).fill("1000");
    await pay.getByRole("button", { name: "Save payment" }).click();
    await expect(acc.getByText("Payment recorded.")).toBeVisible();
    await expect(acc.getByText("Part paid").first()).toBeVisible();

    await acc.goto("/payables?tab=subs");
    const row = acc.locator("li", { hasText: billNo });
    await expect(row).toContainText("Part paid");
    await expect(row).toContainText("₹1,850");
    await accCtx.close();
  });

  test("a site engineer can't see work orders, equipment or delays", async ({ page }) => {
    await login(page, "engineer1@buildflow.demo");
    for (const url of ["/work-orders", "/equipment"]) {
      await page.goto(url);
      await expect(page.getByText(/don't have access/)).toBeVisible();
    }
    await page.goto("/issues?tab=delays");
    await expect(page.getByRole("link", { name: "Delays" })).toHaveCount(0);
  });
});
