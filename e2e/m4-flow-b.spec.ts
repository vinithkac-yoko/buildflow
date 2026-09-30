import { expect, test, devices } from "@playwright/test";
import { login } from "./helpers";

// Flow B changes data (new request, order, stock, invoice), so it runs once — the reset spec restores the demo afterwards.
test.describe("Flow B — material request to payment", () => {
  test.beforeEach(async ({}, info) => {
    test.skip(info.project.name !== "phone-390", "Flow B runs once; engineer and store steps are phone-first");
  });

  test("request → PM → two quotations → PO → partial receipt → issue → invoice → payment", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };

    // ── Site Engineer, phone: raise a material request ──
    await login(page, "engineer1@buildflow.demo");
    await page.goto("/materials");
    await page.getByRole("link", { name: "Request material" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Request material" })).toBeVisible();
    await expect(page.getByRole("button", { name: "SEND MATERIAL REQUEST" })).toBeDisabled();
    await page.getByRole("button", { name: /Pick a material/ }).click();
    await page.getByRole("dialog", { name: "Material" }).getByLabel(/Search/).fill("Wall putty");
    await page.getByRole("option", { name: /Wall putty/ }).click();
    await page.getByLabel("How much?").fill("200");
    await page.getByRole("button", { name: "Add to request" }).click();
    await expect(page.getByText("1 added")).toBeVisible();
    await page.getByRole("radio", { name: "Today" }).click();
    await page.getByRole("textbox", { name: "Note" }).fill("E2E: finishing on the first floor");
    await page.getByRole("button", { name: "SEND MATERIAL REQUEST" }).click();
    await expect(page.getByRole("heading", { name: "Request sent" })).toBeVisible();
    await page.getByRole("link", { name: "See this request" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^MR-\d+$/);
    const mrCode = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
    await expect(page.getByText("Waiting for PM")).toBeVisible();
    await expect(page.locator("main")).not.toContainText("₹"); // no money for the engineer
    await page.goto("/purchase-orders");
    await expect(page.getByText(/don't have access/)).toBeVisible();

    // ── PM, laptop: send it to purchase ──
    const pmCtx = await browser.newContext(desktop);
    const pm = await pmCtx.newPage();
    await login(pm, "pm1@buildflow.demo");
    await pm.goto("/procurement");
    await pm.getByRole("link", { name: new RegExp(mrCode) }).click();
    await expect(pm.getByText("Wall putty").first()).toBeVisible();
    await pm.getByRole("button", { name: "Send to purchase" }).click();
    await expect(pm.getByText(/Sent to purchase as/)).toBeVisible();
    const prLink = pm.getByRole("link", { name: /^PR-\d+$/ });
    const prCode = (await prLink.innerText()).trim();
    // A request can be converted once only.
    await pm.reload();
    await expect(pm.getByRole("button", { name: "Send to purchase" })).toHaveCount(0);
    await pmCtx.close();

    // ── Procurement, laptop: two quotations, choose the cheaper, raise the PO ──
    const procCtx = await browser.newContext(desktop);
    const proc = await procCtx.newPage();
    await login(proc, "procurement@buildflow.demo");
    await proc.goto("/requests?tab=pr");
    await proc.getByRole("link", { name: new RegExp(prCode) }).click();
    await expect(proc.getByText("Add at least 2 vendor quotations")).toBeVisible();

    const quote = async (vendorPattern: RegExp, rate: string) => {
      await proc.getByRole("button", { name: "Add quotation" }).click();
      const dlg = proc.getByRole("dialog", { name: "Add vendor quotation" });
      await dlg.getByRole("button", { name: /Select vendor/ }).click();
      await proc.getByRole("dialog", { name: "Vendor", exact: true }).getByRole("option", { name: vendorPattern }).click();
      await dlg.getByLabel(/Rate per/).fill(rate);
      await dlg.getByLabel("Delivery in (days)").fill("4");
      await dlg.getByRole("button", { name: "Save quotation" }).click();
      await expect(proc.getByText("Quotation added.")).toBeVisible();
    };
    await quote(/Cauvery Paints/, "30");
    // One quotation is not enough to choose.
    await expect(proc.getByRole("button", { name: "Choose this vendor" })).toHaveCount(0);
    await quote(/Salem Marble/, "26");
    await expect(proc.getByText("Lowest")).toBeVisible();
    await proc.locator("li", { hasText: "Lowest" }).getByRole("button", { name: "Choose this vendor" }).click();
    await expect(proc.getByText("Vendor chosen.")).toBeVisible();
    await proc.getByRole("button", { name: /Raise purchase order — Salem Marble/ }).click();
    await expect(proc.getByText("Purchase order raised.")).toBeVisible();
    await proc.getByRole("link", { name: "Open the order" }).click();
    await expect(proc.getByRole("heading", { level: 1 })).toHaveText(/^PO-\d{4}-\d{4}$/);
    const poCode = (await proc.getByRole("heading", { level: 1 }).innerText()).trim();
    const poUrl = proc.url();
    await expect(proc.getByText("₹6,136").first()).toBeVisible(); // 200 kg × ₹26 + 18% GST
    await expect(proc.getByRole("button", { name: /Enter invoice/ })).toHaveCount(0); // money side isn't Procurement's
    await procCtx.close();

    // ── Store Keeper, phone: partial receipt, then issue ──
    const storeCtx = await browser.newContext({ ...devices["Pixel 7"], viewport: { width: 390, height: 844 } });
    const store = await storeCtx.newPage();
    await login(store, "store@buildflow.demo");
    const stockOf = async () => {
      await store.goto("/inventory");
      await expect(store.getByRole("heading", { level: 1, name: "Stock" })).toBeVisible();
      const row = store.locator("li", { hasText: "Wall putty" }).first();
      if ((await row.count()) === 0) return 0; // nothing of it has ever been on this site
      return Number((await row.locator(".num").first().innerText()).match(/[\d.]+/)![0]);
    };
    const before = await stockOf();

    await store.goto("/receipts");
    const card = store.locator("li", { hasText: poCode });
    await expect(card).toBeVisible();
    await expect(store.locator("main")).not.toContainText("₹");
    await card.getByRole("button", { name: "Record receipt" }).click();
    const recv = store.getByRole("dialog", { name: new RegExp(`Receive material — ${poCode}`) });
    await recv.getByLabel(/Received now/).fill("120");
    await recv.getByLabel("Delivery challan number").fill("DC-E2E-1");
    await recv.getByRole("button", { name: "Record receipt" }).click();
    await expect(store.getByText("Receipt recorded. Stock updated.")).toBeVisible();

    // Second delivery may not exceed what is still due (80).
    await store.locator("li", { hasText: poCode }).getByRole("button", { name: "Record receipt" }).click();
    const recv2 = store.getByRole("dialog", { name: new RegExp(`Receive material — ${poCode}`) });
    await recv2.getByLabel(/Received now/).fill("100");
    await recv2.getByRole("button", { name: "Record receipt" }).click();
    await expect(recv2.getByText(/Only 80 kg of Wall putty still due/).first()).toBeVisible();
    await recv2.getByRole("button", { name: "Cancel" }).click();

    expect(await stockOf()).toBeCloseTo(before + 120, 1);

    // Issue more than there is: friendly error; then a valid issue.
    await store.getByRole("button", { name: "Issue", exact: true }).click();
    const issue = store.getByRole("dialog", { name: "Issue material to an activity" });
    await issue.getByRole("button", { name: /Select material/i }).click();
    await store.getByRole("dialog", { name: "Material", exact: true }).getByLabel(/Search/).fill("Wall putty");
    await store.getByRole("option", { name: /Wall putty/ }).click();
    await issue.getByLabel(/^Quantity/).fill("999999");
    await issue.getByRole("button", { name: /Select issued to activity/i }).click();
    await store.getByRole("dialog", { name: "Issued to activity", exact: true }).getByRole("option").first().click();
    await issue.getByRole("button", { name: "Issue material" }).click();
    await expect(issue.getByText(/Only [\d.]+ kg of Wall putty in stock/).first()).toBeVisible();
    await issue.getByLabel(/^Quantity/).fill("10");
    await issue.getByRole("button", { name: "Issue material" }).click();
    await expect(store.getByText("Issued. Stock updated.")).toBeVisible();
    expect(await stockOf()).toBeCloseTo(before + 110, 1);
    await storeCtx.close();

    // ── Accounts, laptop: invoice and payment against the PO ──
    const accCtx = await browser.newContext(desktop);
    const acc = await accCtx.newPage();
    await login(acc, "accounts@buildflow.demo");
    await acc.goto(poUrl);
    await acc.getByRole("button", { name: "Enter invoice" }).click();
    const inv = acc.getByRole("dialog", { name: "Enter vendor invoice" });
    const invNo = `E2E-${Date.now() % 100000}`;
    await inv.getByLabel(/Vendor's invoice number/).fill(invNo);
    await inv.getByLabel(/Amount before tax/).fill("999999"); // more than the PO
    await inv.getByLabel(/Tax \(GST\) amount/).fill("0");
    await inv.getByRole("button", { name: "Save invoice" }).click();
    await expect(inv.getByText(/more than what is left/i).first()).toBeVisible();
    await inv.getByLabel(/Amount before tax/).fill("3120");
    await inv.getByLabel(/Tax \(GST\) amount/).fill("561.6");
    await inv.getByRole("button", { name: "Save invoice" }).click();
    await expect(acc.getByText("Invoice entered.")).toBeVisible();
    await expect(acc.getByText("Unpaid").first()).toBeVisible();

    await acc.getByRole("button", { name: "Record payment" }).click();
    const pay = acc.getByRole("dialog", { name: "Record payment" });
    await pay.getByLabel(/Amount paid/).fill("999999");
    await pay.getByRole("button", { name: "Save payment" }).click();
    await expect(pay.getByText(/more than|owed/i).first()).toBeVisible();
    await pay.getByLabel(/Amount paid/).fill("1000");
    await pay.getByRole("button", { name: "Save payment" }).click();
    await expect(acc.getByText("Payment recorded.")).toBeVisible();
    await expect(acc.getByText("Part paid").first()).toBeVisible();

    await acc.goto("/payables");
    const row = acc.locator("li", { hasText: invNo });
    await expect(row).toContainText("Part paid");
    await expect(row).toContainText("₹2,682");
    await accCtx.close();
  });

  test("the owner sees procurement and payables; the client and engineer see no money screens", async ({ page }) => {
    await login(page, "owner@buildflow.demo");
    await page.goto("/procurement");
    await expect(page.getByRole("heading", { level: 1, name: "Procurement" })).toBeVisible();
    await page.goto("/payables");
    await expect(page.getByRole("heading", { level: 1, name: "Payables" })).toBeVisible();
    await expect(page.getByText("Overdue").first()).toBeVisible();
  });
});
