// Records a silent walkthrough of ControlSight CCM with a visible cursor and on-screen captions.
const { chromium } = require("playwright");
const OUT = "/tmp/claude-0/-home-user/bbb0b1a9-c299-5437-b4a0-c0df46e2e496/scratchpad/video";
const BASE = "http://localhost:3000";
const W = 1440, H = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INIT = `
(() => {
  const add = () => {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div'); c.id='__cur';
    c.style.cssText='position:fixed;z-index:2147483647;width:22px;height:22px;margin:-3px 0 0 -3px;pointer-events:none;left:-50px;top:-50px;transition:transform .12s';
    c.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#111" stroke="#fff" stroke-width="1.6"/></svg>';
    document.body.appendChild(c);
    const cap = document.createElement('div'); cap.id='__cap';
    cap.style.cssText='position:fixed;z-index:2147483646;left:50%;bottom:26px;transform:translateX(-50%);max-width:1100px;background:rgba(17,17,17,.88);color:#fff;font:600 19px system-ui,sans-serif;padding:12px 22px;border-radius:12px;pointer-events:none;text-align:center;line-height:1.35;display:none';
    document.body.appendChild(cap);
    const t = localStorage.getItem('__captext'); if (t) { cap.textContent=t; cap.style.display='block'; }
    const p = JSON.parse(localStorage.getItem('__curpos')||'null'); if (p) { c.style.left=p[0]+'px'; c.style.top=p[1]+'px'; }
    window.addEventListener('mousemove', e => { c.style.left=e.clientX+'px'; c.style.top=e.clientY+'px'; localStorage.setItem('__curpos', JSON.stringify([e.clientX,e.clientY])); }, true);
    window.addEventListener('mousedown', e => { c.style.transform='scale(.75)'; const r=document.createElement('div'); r.style.cssText='position:fixed;z-index:2147483645;pointer-events:none;border:3px solid #2a78d6;border-radius:50%;width:10px;height:10px;left:'+(e.clientX-5)+'px;top:'+(e.clientY-5)+'px;transition:all .45s ease-out;opacity:1'; document.body.appendChild(r); requestAnimationFrame(()=>{r.style.width='46px';r.style.height='46px';r.style.left=(e.clientX-23)+'px';r.style.top=(e.clientY-23)+'px';r.style.opacity='0';}); setTimeout(()=>r.remove(),600); }, true);
    window.addEventListener('mouseup', () => { c.style.transform='scale(1)'; }, true);
  };
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
  window.__cap = (t) => { localStorage.setItem('__captext', t||''); const cap=document.getElementById('__cap'); if(!cap) return; cap.textContent=t||''; cap.style.display=t?'block':'none'; };
})();`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT, size: { width: W, height: H } }, colorScheme: "light" });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  let mx = W / 2, my = H / 2;
  const cap = async (t, hold = 0) => { await page.evaluate((x) => window.__cap && window.__cap(x), t); if (hold) await sleep(hold); };
  const moveTo = async (x, y) => { await page.mouse.move(x, y, { steps: 22 }); mx = x; my = y; await sleep(150); };
  const hover = async (loc) => { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); await moveTo(b.x + b.width / 2, b.y + b.height / 2); };
  const click = async (loc, after = 900) => { await hover(loc); await page.mouse.down(); await sleep(90); await page.mouse.up(); await sleep(after); };
  const type = async (loc, text) => { await click(loc, 200); await loc.pressSequentially(text, { delay: 28 }); };
  const scroll = async (dy, ms = 1200) => { const n = 12; for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy / n); await sleep(ms / n); } };
  const nav = async (label, after = 1600) => { await click(page.locator("nav.nav a", { hasText: label }).first(), after); };
  const waitText = async (t, timeout = 60000) => { await page.getByText(t, { exact: false }).first().waitFor({ timeout }); };

  // 1. Login
  await page.goto(BASE + "/login");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await sleep(800);
  await cap("ControlSight CCM - AI continuous control monitoring for Internal Audit (synthetic data)", 3500);
  await cap("Three roles: Audit Supervisor, Head of Internal Audit (Approver), Audit Committee (read-only)", 3000);
  await click(page.getByRole("button", { name: "Sign in as Audit Supervisor" }), 2500);

  // 2. Dashboard
  await waitText("Monitoring engine");
  await cap("Dashboard: 15 key controls across 7 process areas, tested on 100% of transactions", 3000);
  await scroll(520, 1800); await sleep(1500);
  await cap("Control status by process with the proposed control rating", 2500);
  await scroll(700, 1800); await sleep(2000);
  await scroll(-1400, 1200); await sleep(600);

  // 3. Fetch a new batch
  await cap("Fetch pulls the next weekly extract from 12 SAP-style source streams", 2200);
  await click(page.getByRole("button", { name: /Fetch new data batch/ }), 500);
  await waitText("ingested:", 30000);
  await sleep(1200);
  await cap("Extract → validate → load → test every control → queue for the AI agent", 4500);
  await hover(page.locator(".stage").last());
  await cap("The AI agent now investigates each new exception automatically (see status, top right)", 4500);
  await moveTo(1180, 30); await sleep(2500);

  // 4. Ingestion page
  await nav("Data ingestion");
  await cap("Every batch is logged with record counts, checksum and AI progress - read-only copies, nothing written back to SAP", 4000);
  await scroll(450, 1500); await sleep(2500);
  await cap("Data browser: the synthetic SAP extracts (identity, bank and tax numbers are masked before any AI call)", 3000);
  await scroll(650, 1500); await sleep(2500);

  // 5. Controls
  await nav("Controls (RCM)");
  await cap("Risk & control matrix: procure-to-pay, order-to-cash, inventory, logistics, payroll & labour law, IT access, financial close", 3500);
  await click(page.getByRole("button", { name: "Details" }).nth(4), 1200);
  await cap("Each control has a policy, an automated rule, a severity rubric, an owner and the regulation behind it", 3500);
  await scroll(400, 1200); await sleep(1500);

  // 6. Queue and a breach the agent found
  await nav("My queue", 2000);
  await cap("Supervisor queue: every exception the AI has investigated, with its proposed disposition and severity", 3500);
  await page.goto(BASE + "/exceptions/EXC-0002-011"); await waitText("AI investigation"); await sleep(1200);
  await cap("A breach: salary paid to an employee after termination. The agent proposes High severity", 4000);
  await hover(page.locator(".card").filter({ hasText: "AI investigation" }).first().locator("p").first()); await sleep(2500);
  await cap("Every ID, date and amount the agent cites is checked against the evidence (green badge)", 3200);
  await click(page.getByRole("button", { name: "Agent trace" }), 1200);
  await cap("Agent trace: model calls, the record it chose to look up, tokens, cost and latency", 4000);
  await scroll(400, 1200); await sleep(2000);
  await click(page.getByRole("button", { name: "Exact prompt" }), 1000);
  await cap("The exact system prompt and the masked evidence the model saw", 3200);
  await scroll(500, 1500); await sleep(1500);
  await click(page.getByRole("button", { name: "Evidence" }), 1500);
  await cap("Source records, as extracted", 2500);

  // 7. A decoy the agent cleared
  await page.goto(BASE + "/exceptions/EXC-0002-003"); await waitText("AI investigation"); await sleep(1200);
  await cap("A look-alike: payment soon after a vendor bank change. The rule flags it…", 3500);
  await click(page.getByRole("button", { name: "Agent trace" }), 1200);
  await cap("…the agent looked up the bank-change request, found a call-back verification, and proposes a false positive", 5000);
  await scroll(350, 1000); await sleep(2000);

  // 8. Supervisor confirms the breach
  await page.goto(BASE + "/exceptions/EXC-0002-011"); await waitText("Submit review"); await sleep(800);
  await cap("The supervisor reviews and confirms the breach (or overrides severity / dismisses with a reason)", 3000);
  await click(page.getByText("Confirm breach", { exact: true }), 600);
  await type(page.locator("textarea").first(), "Checked payslip against HR leaver record - salary paid after termination.");
  await click(page.getByRole("button", { name: "Submit review" }), 2500);
  await cap("Sent to the Head of Internal Audit for sign-off", 2500);

  // 9. Approver
  await click(page.getByRole("button", { name: "Sign out" }), 2000);
  await cap("Now signing in as the Approver (Head of Internal Audit)", 2000);
  await click(page.getByRole("button", { name: "Sign in as Head of Internal Audit" }), 2500);
  await waitText("Monitoring engine");
  await nav("My queue", 2000);
  await cap("Approver queue: supervisor decisions awaiting sign-off", 2500);
  await click(page.locator("tr.click").first(), 2500);
  await waitText("Approve finding");
  await scroll(250, 800);
  await cap("Approving issues a finding and raises a corrective action for the process owner", 3000);
  await click(page.getByRole("button", { name: /Approve finding/ }), 2500);
  await cap("Corrective action raised - it closes only after the approver verifies remediation evidence", 3500);
  await nav("Corrective actions", 2000);
  await sleep(2500);

  // 10. Copilot
  await nav("Audit copilot", 1500);
  await cap("Audit copilot: an agent with read-only query tools answers questions in plain language", 3000);
  await click(page.getByRole("button", { name: "Top 5 open breaches by amount at risk" }), 1000);
  await page.locator(".msg.assistant").first().waitFor({ timeout: 120000 });
  await sleep(1500);
  await cap("It decided which queries to run, ran them and answered from the results", 3500);
  await scroll(500, 1500); await sleep(3000);
  await click(page.locator(".msg.assistant details summary").first(), 2500);

  // 11. Evaluation
  await nav("Evaluation", 2500);
  await cap("Live evaluation against the seeded ground truth: recall, false-clear rate, severity agreement, faithfulness", 4000);
  await scroll(600, 1800); await sleep(2500);
  await cap("Calibration, cost and latency per exception", 3000);
  await scroll(700, 1800); await sleep(2500);
  await cap("Per-control scores and every case where the AI was wrong", 3000);
  await scroll(800, 1800); await sleep(2500);

  // 12. Report and audit trail
  await nav("Committee report", 1500);
  await cap("AI-drafted Audit Committee summary, written only from the system's own figures and verified", 3000);
  await click(page.getByRole("button", { name: "Generate latest report" }), 1000);
  await page.getByText("Generated", { exact: false }).first().waitFor({ timeout: 120000 });
  await sleep(2500); await scroll(500, 1500); await sleep(2500);
  await nav("Audit trail", 2000);
  await cap("Audit trail: every ingestion, AI proposal, human decision and sign-off - who, what and when", 4000);
  await nav("Dashboard", 2500);
  await cap("ControlSight CCM - continuous testing, AI investigation, human control. All data synthetic.", 4500);
  await cap("", 800);

  await page.close();
  await ctx.close();
  await browser.close();
  console.log("done");
})().catch((e) => { console.error(e); process.exit(1); });
