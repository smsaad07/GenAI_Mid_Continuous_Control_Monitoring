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
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT + "_tail", size: { width: W, height: H } }, colorScheme: "light" });
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

  await page.request.post(BASE + "/api/auth/login", { data: { email: "approver@ccm.demo", password: "Approver@2026" } });
  await page.goto(BASE + "/actions");
  await page.evaluate(() => { localStorage.setItem("__curpos", JSON.stringify([120, 324])); });
  await page.reload();
  await page.mouse.move(120, 324);
  await cap("Corrective action raised - it closes only after the approver verifies remediation evidence", 0);
  await page.getByText("Payment after termination").first().waitFor();
  await sleep(1500);

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
