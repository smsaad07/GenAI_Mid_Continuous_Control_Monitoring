# Honesty section - ControlSight CCM (Use case A)

## What the system gets wrong, or where it can't yet be trusted

1. **The headline AI scores are an upper bound, not a production estimate.** On the evaluation set the agent made no disposition errors and no severity errors (23 exceptions: 14 true breaches, 9 decoys). This needs three qualifications:
   * **The sample is small.** Zero false clears in 14 true breaches is consistent with a true false-clear rate of up to about 21% (rule of three, 95% confidence). The Phase 1 target of ≤ 2% has **not been demonstrated**; demonstrating it needs at least ~150 true-breach exceptions. I was limited by the Groq free tier (8,000 tokens/minute, ~200,000 tokens/day, shared with the live demo). Phase 1 planned a gold set of 200 items; I ran 23.
   * **The decoys are cleaner than real evidence.** I wrote the generator, so each legitimate explanation is a clear sentence in a named field ("Call-back to registered contact by Treasury..."). Real evidence is scanned PDFs, partial e-mails, approvals in WhatsApp and missing fields. The agent has not been tested on ambiguous, contradictory or adversarial evidence, such as a forged approval memo.
   * **The ground truth and the severity rubric are mine**, not a senior auditor's. "Severity agreement 100%" means the agent applied *my written rubric* correctly. It does not mean it matches a senior auditor's judgement, which was the Phase 1 metric.
2. **Confidence scores carry no information.** All 23 confidences were between 0.95 and 0.98. The calibration chart has a single bucket. A supervisor cannot use confidence to decide what to scrutinise, so the UI must not invite them to, and "high-confidence false-clear rate" says nothing extra here. This is the automation-bias risk Phase 1 raised: fluent, uniformly confident proposals.
3. **The agent was not shown to be better than one prompt.** On the 8 batch-1 cases, the single-call prompt v1 (no tools) was as accurate as the agent at **46% of the tokens** (1,007 vs 2,197 per exception). I kept the agent because some decoys' explanations sit in a *related* record (a bank-change verification, an employee's HR file) that a single call would not see unless the rule pre-attached it. But batch 1 contained no such case. The comparison does not prove the agent's extra cost buys anything, and with more time I would run both on the related-record controls (P2P-05, PAY-02, ITA-02) specifically.
4. **The copilot contradicted itself.** Asked which controls have the most AI-proposed breaches, it answered "GL-01, 3 breaches, PKR 2,830,000". In the same answer it said none of the GL-01 items had been tagged as a breach, then listed three exceptions that were still **queued, unassessed** ones from later batches. The cause is two tools with different filters (`exposure_by` counts AI-proposed breaches; `query_exceptions` sorted all GL-01 items by amount), which the model merged. The faithfulness check passed, because the numbers were real; it checks figures, not logic. **I would not let the copilot's answers go into a report without checking.**
5. **The faithfulness verifier has false alarms and blind spots.** It flagged "PKR 25,000" in a correct explanation (40,000 × 30/48, the pro-rated minimum wage) because it only accepts sums and differences of evidence figures. It would also *pass* a wrong statement built from correct numbers, such as citing the right amount on the wrong invoice. It checks that figures exist in the evidence, not that the reasoning is right.
6. **The rules have only been tested on a clean base population.** No exception was raised on the clean background transactions, because the generator keeps them clean. Real SAP data has noise (credit memos, reversals, partial deliveries, legitimately re-keyed invoices), so rule precision would be lower and the supervisor's queue longer. Rule thresholds such as the 45-day duplicate window and the 7-day split window are untuned guesses.
7. **The minimum wage and other parameters are configured values**, not read from the provincial notifications (PKR 40,000 for all three provinces is a parameter to be verified). The weekly-hours cap of 60 is a company-policy assumption, not a citation of each Factories Act.

## What I would not yet put in front of a customer

* **Anything with real data on this deployment.** The Phase 1 verdict is *Go, with in-country compute*. This demo sends prompts to a hosted model outside Pakistan. It is acceptable only because the data is synthetic. Production must run gpt-oss on Company or in-country infrastructure, which needs no code change beyond the endpoint, but the hosting, the latency and the 120b model's hardware needs are untested.
* **The audit committee report and the copilot** (see item 4). They read well, which is exactly the risk.
* **Any dashboard rating as a stand-alone assurance statement.** The "Effective (provisional)" rating shows when exceptions are still queued for the AI. A committee member could read that as assurance.
* **The access model.** Demo accounts with passwords printed on the login page, a shared demo database that any visitor can change, no SSO, no per-process-owner access (Phase 1 required role-based access so each owner sees only their own controls; process owners have no logins here, and the supervisor records their responses for them).
* **The data connector.** There is no SAP extract. "Fetch" generates the next synthetic week, and extract windows run past today's date if you fetch many times.
* **Continuous operation.** On the Vercel Hobby plan the scheduled run is once a day, and the free Groq tier would stall the agent on a busy day. The worker loop runs in the browser of whoever is signed in; with nobody signed in, only the daily cron processes the queue (up to ~40 seconds of work).

## What it cost to run

| Item | Measured |
|---|---|
| Agent evaluation run (23 exceptions, prompt v4) | 56,441 tokens (43,533 in, of which 16,384 cached; 12,908 out incl. reasoning) · 34 model calls · **$0.013** |
| Per exception | mean 2,454 tokens (max 3,966) · 1.48 model calls · **$0.00057** · p50 10.5 s, p95 20.4 s (includes free-tier rate-limit waits) |
| Prompt v1 baseline (8 exceptions) | ~1,007 tokens/exception |
| Failed v3 agent run (the loop bug) | 5,737 tokens for one exception |
| Projection: nightly extracts, ~4,900 exceptions/year | ~$2.8/year in model tokens |
| Hosting this demo | $0 (Vercel Hobby, Neon free, Groq free tier) |

Model spend is not the real cost. The real costs are (a) in-country GPU hosting for gpt-oss-120b, needed by the Phase 1 verdict and not yet priced, and (b) the supervisor's and approver's review time, which the system moves around rather than removes. Every exception still needs two people.

Development cost: the AI coding assistant wrote most of the code under my direction. I have reviewed the design and can explain each part: the rules, the agent loop, the verifier and the workflow.
