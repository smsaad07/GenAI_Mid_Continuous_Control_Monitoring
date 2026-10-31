# ControlSight CCM - AI continuous control monitoring for Internal Audit

DATA722 (Generative AI & Strategic Forecasting) - Phase 2 build of **Use case A** from the Phase 1 assessment:
organisation-wide continuous control monitoring for the Internal Audit function of an anonymised Pakistani biscuit & cake manufacturer.

> **All data is synthetic.** No real company, employee, supplier or customer data is used anywhere (app, model prompts or repository).

## What it does

1. **Ingest** - each "Fetch new data batch" (or the daily cron) pulls the next weekly extract from 12 SAP-style record streams
   (purchase orders, GRNs, invoices, payments, vendor bank changes, sales orders, write-offs, freight bills, payslips,
   biometric attendance, ERP user access, journals). Here they come from a seeded synthetic generator that plants known
   breaches and look-alike legitimate cases (decoys) so the system can be scored.
2. **Test** - 15 deterministic control tests across 7 process areas run over 100% of the records (no sampling).
3. **Investigate** - each exception goes to an AI agent (OpenAI open-weight `gpt-oss-120b` via Groq). PII is masked first.
   The agent decides which related records to look up with read-only tools and submits a structured proposal
   (breach / false positive / needs more info, severity per rubric, confidence, explanation, root cause, action).
4. **Verify** - a deterministic checker confirms every ID, date and amount the agent cites is in the evidence it saw.
5. **Human review** - the **Audit Supervisor** reviews every proposal; the **Head of Internal Audit (Approver)** signs off every
   decision, issues findings, and verifies corrective actions before they close. A read-only **Audit Committee** role sees results.
6. **Measure** - a live evaluation page scores recall, false-clear rate, severity agreement, faithfulness, calibration, cost and latency
   against the seeded ground truth. An audit copilot (tool-using, read-only) answers questions; a committee report is AI-drafted and verified.

| Process | Controls |
|---|---|
| Procure-to-pay | P2P-01 duplicate invoices · P2P-02 split POs · P2P-03 price above contract · P2P-04 three-way match · P2P-05 bank change before payment |
| Order-to-cash | O2C-01 credit limit override · O2C-02 unauthorised discount |
| Inventory | INV-01 unapproved write-off |
| Logistics | LOG-01 freight over-billing |
| Payroll & labour law | PAY-01 below minimum wage · PAY-02 pay to leavers · PAY-03 excessive hours |
| IT access | ITA-01 SoD conflicts · ITA-02 leavers with active accounts |
| Financial close | GL-01 self-approved journals |

Demo accounts (also one-click on the login page): `supervisor@ccm.demo / Supervisor@2026`, `approver@ccm.demo / Approver@2026`, `committee@ccm.demo / Committee@2026`.

## Repository map

| Path | What |
|---|---|
| `lib/synth/` | Synthetic master data and batch generator with seeded breaches/decoys + ground truth |
| `lib/controls/catalog.ts` | Risk & control matrix: policy, rule, severity rubric, owner, regulation |
| `lib/controls/tests.ts` | Deterministic rule tests |
| `lib/ingest.ts` | Extract → validate → load → test → queue pipeline |
| `lib/ai/agent.ts` | **Investigation agent loop**, system prompt, tools |
| `lib/ai/verify.ts` | Faithfulness verifier · `lib/ai/mask.ts` PII masking · `lib/ai/groq.ts` client + cost |
| `lib/ai/copilot.ts` | Audit copilot agent and committee report |
| `lib/workflow.ts` | Supervisor / approver / corrective-action workflow with segregation of duties |
| `lib/eval.ts` | Evaluation metrics against ground truth |
| `notebook/` | **Project notebook** (implementation, evaluation, failures, cost), dev logs, honesty section |
| `docs/` | Video script, honesty section |

## Deploy on Vercel

1. Vercel → **Add New → Project** → import this GitHub repo (framework auto-detected: Next.js). Don't deploy yet, or let the first deploy fail.
2. Project → **Storage → Create Database → Neon (Postgres)** → connect it to the project (this adds `DATABASE_URL`).
3. Project → **Settings → Environment Variables**, add:
   - `GROQ_API_KEY` = your Groq key
   - `SESSION_SECRET` = any long random string
   - `CRON_SECRET` = any random string
   - (optional) `GROQ_MODEL=openai/gpt-oss-120b`, `INITIAL_BATCHES=1`
4. **Deployments → Redeploy**. Open the URL and sign in as the supervisor: the schema, synthetic master data and the first batch load automatically, and the agent starts working the queue.

## Run locally

```bash
npm install
cp .env.example .env.local   # set DATABASE_URL to any Postgres, add GROQ_API_KEY
npm run build && npm start
```
