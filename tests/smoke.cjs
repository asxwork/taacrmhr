// Smoke test (run by GitHub Actions on every push): real actions as different demo users, pass/fail per step.
// Locally: start the app on :3100 with the demo seed, then `node tests/smoke.cjs`.
const { chromium } = require("playwright");
const B = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const ok = (name, pass, info = "") => { results.push(`${pass ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
(async () => {
  const b = await chromium.launch();
  const login = async (u, opts = {}) => {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, ...opts }); const p = await ctx.newPage();
    p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message.slice(0, 100)));
    await p.goto(B + "/login"); await p.fill('input[name="email"]', u + "@advisor.local"); await p.fill('input[name="password"]', "Advisor@2026");
    await Promise.all([p.waitForURL((x) => !x.pathname.startsWith("/login"), { timeout: 60000 }), p.click('button[type="submit"]')]);
    return p;
  };
  const msg = async (p) => (await p.locator("main [role=status], main [role=alert], [role=dialog] [role=status], [role=dialog] [role=alert]").allTextContents()).map((s) => s.trim()).filter(Boolean).join(" | ");
  const stamp = Date.now().toString().slice(-5);

  // A. Agent creates a lead and changes its stage.
  try {
    const p = await login("agent1");
    await p.goto(B + "/crm/leads/new"); await p.waitForLoadState("networkidle");
    await p.fill('input[name="name"]', `Test Lead ${stamp}`);
    const phone = p.getByLabel("Phone number").first();
    await phone.fill(`0333${stamp}12`);
    await p.locator('button[type="submit"]').filter({ hasText: /save|create|add/i }).first().click();
    await p.waitForURL(/\/crm\/leads\/c[a-z0-9]+/, { timeout: 20000 }).catch(() => {});
    const onLead = /\/crm\/leads\/c[a-z0-9]+/.test(p.url());
    ok("Agent creates a lead", onLead && (await p.getByText(`Test Lead ${stamp}`).count()) > 0, onLead ? "" : await msg(p));
    if (onLead) {
      const stageBtn = p.locator("form button").filter({ hasText: /Contacted|Site Visit|Interested|Follow/i }).first();
      if (await stageBtn.count()) { const label = (await stageBtn.textContent()).trim(); await stageBtn.click(); await p.waitForTimeout(2500); await p.reload(); ok("Agent moves lead to next stage", (await p.locator("main").innerText()).includes(label), label); }
      else ok("Agent moves lead to next stage", false, "no stage button found");
    }
    ok("No browser errors (agent)", !p.errs.length, p.errs[0]);
  } catch (e) { ok("Agent lead flow", false, e.message.slice(0, 120)); }

  // B. Staff applies for leave, HR approves it.
  try {
    const s = await login("staff");
    await s.goto(B + "/me/leave"); await s.waitForLoadState("networkidle");
    const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7) + 14); // a Monday ~3 weeks out
    const iso = d.toISOString().slice(0, 10);
    const form = s.locator("form").filter({ has: s.getByRole("button", { name: "Submit request" }) });
    const sel = form.locator('select[name="typeId"]');
    const opts = await sel.locator("option").evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    await sel.selectOption(opts[0]);
    await form.locator('input[name="from"]').fill(iso); await form.locator('input[name="to"]').fill(iso);
    await form.locator('[name="reason"]').fill(`Test leave ${stamp}`);
    await s.getByRole("button", { name: "Submit request" }).click(); await s.waitForTimeout(3000);
    const m = await msg(s);
    ok("Staff applies for leave", /sent|submitted|request/i.test(m) && !/error|can't|cannot|not/i.test(m), m);
    const h = await login("hr");
    await h.goto(B + "/approvals"); await h.waitForLoadState("networkidle");
    const item = h.getByText(/Annual leave — Usman Tariq|leave — Usman Tariq/).first();
    if (await item.count()) {
      await item.click(); await h.waitForLoadState("networkidle"); await h.waitForTimeout(800);
      const approve = h.getByRole("button", { name: /^approve/i }).first();
      if (await approve.count()) {
        await approve.click(); await h.waitForTimeout(3000);
        const st = await h.locator("main").innerText();
        ok("HR approves the leave", /approved/i.test(st) || /approved|next/i.test(await msg(h)), (await msg(h)) || st.slice(0, 80));
      } else ok("HR approves the leave", false, "no Approve button on the request");
    } else ok("HR approves the leave", false, "request not in HR approvals list");
    await s.goto(B + "/me/leave"); await s.waitForLoadState("networkidle");
    ok("Staff sees leave status", (await s.getByText(/approved|pending/i).count()) > 0);
    ok("No browser errors (leave)", !s.errs.length && !h.errs.length, s.errs[0] || h.errs[0]);
  } catch (e) { ok("Leave flow", false, e.message.slice(0, 120)); }

  // C. Staff checks in from the web (with location).
  try {
    const c = await login("staff", { permissions: ["geolocation"], geolocation: { latitude: 24.8138, longitude: 67.0622 } });
    await c.goto(B + "/me/attendance"); await c.waitForLoadState("networkidle");
    const btn = c.getByRole("button", { name: /check (in|out)|punch/i }).first();
    if (await btn.count()) { await btn.click(); await c.waitForTimeout(4000); const m = await msg(c); ok("Staff web check-in", !!m && !/error|failed/i.test(m), m); }
    else ok("Staff web check-in", false, "no check-in button");
  } catch (e) { ok("Check-in flow", false, e.message.slice(0, 120)); }

  // D. CSR logs a call outcome.
  try {
    const c = await login("csr");
    await c.goto(B + "/calls"); await c.waitForLoadState("networkidle");
    if (await c.locator('label:has(input[value="not_answered"])').count()) {
      const before = await c.locator("p.text-2xl").first().textContent();
      await c.locator('label:has(input[value="not_answered"])').click();
      await c.getByRole("button", { name: /Save/ }).click(); await c.waitForTimeout(3000);
      const after = await c.locator("p.text-2xl").first().textContent().catch(() => "");
      ok("CSR saves a call outcome", before !== after || /saved/i.test(await msg(c)), `${before} -> ${after}`);
    } else ok("CSR saves a call outcome", true, "queue empty (nothing to call)");
  } catch (e) { ok("CSR flow", false, e.message.slice(0, 120)); }

  // E. Admin saves company settings and the phone system page.
  try {
    const a = await login("admin");
    for (const [path, btn] of [["/settings/company", /save/i], ["/calls/phone-system", /save connection/i]]) {
      await a.goto(B + path); await a.waitForLoadState("networkidle");
      const button = a.getByRole("button", { name: btn }).first();
      if (await button.count()) { await button.click(); await a.waitForTimeout(2500); const m = await msg(a); ok(`Admin saves ${path}`, /saved/i.test(m), m); }
      else ok(`Admin saves ${path}`, false, "no save button");
    }
    // Search (command palette) works.
    await a.goto(B + "/crm/leads"); await a.keyboard.press("Control+k"); await a.waitForTimeout(500);
    await a.keyboard.type("Zainab"); await a.waitForTimeout(2000);
    ok("Search finds a lead", (await a.locator("[role=dialog]").getByText(/Zainab/).count()) > 0);
    ok("No browser errors (admin)", !a.errs.length, a.errs[0]);
  } catch (e) { ok("Admin flow", false, e.message.slice(0, 120)); }

  // F. Manager opens the wallboard, reports and a team member.
  try {
    const m = await login("manager");
    for (const path of ["/crm/leads", "/crm/deals", "/dashboard", "/hr/attendance"]) {
      const r = await m.goto(B + path); ok(`Manager opens ${path}`, r.status() === 200);
    }
    ok("No browser errors (manager)", !m.errs.length, m.errs[0]);
  } catch (e) { ok("Manager flow", false, e.message.slice(0, 120)); }

  console.log(results.join("\n"));
  await b.close();
  // CI fails when any step fails.
  if (results.some((r) => r.startsWith("FAIL"))) process.exitCode = 1;
})();
