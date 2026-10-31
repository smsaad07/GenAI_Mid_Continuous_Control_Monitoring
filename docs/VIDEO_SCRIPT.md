# 5-minute video script - ControlSight CCM (DATA722 Phase 2, Use case A)

Tools: record the screen with Clipchamp or Canva; record the voice-over yourself or generate it in ElevenLabs from the text below.
Target length about 4:40, under the 5:00 ceiling. Each block lists what is on screen and what is said.

---

## 0:00-0:40 - The problem (under 45 s)

**Screen:** title slide "ControlSight CCM - continuous control monitoring for Internal Audit", then the login page.

**Voice:**
"Internal audit at a large Pakistani food manufacturer is periodic and sample-based. Each process is audited once a year or less, on 25 to 60 transactions pulled from SAP by hand. That is under one percent coverage. Duplicate payments, split purchase orders, wages below the minimum and leavers with live ERP access are found three to twelve months late, if at all.
ControlSight tests every transaction, continuously. An AI agent investigates each exception, and a supervisor and an approver stay in control of every decision. Everything you will see runs on synthetic data."

## 0:40-2:45 - Live demo

**0:40** Click **Sign in as Audit Supervisor**. Dashboard.
"I'm signed in as the audit supervisor. The tool monitors 15 key controls across procure-to-pay, order-to-cash, inventory, logistics, payroll and labour law, IT access and financial close."

**0:55** Click **Fetch new data batch**. The pipeline cards appear.
"Fetch pulls the next weekly extract: about 500 records from twelve SAP-style streams. They are validated, checksummed, and every record is tested. No sampling. This batch raised N exceptions in under a second. The agent starts on them straight away."
(Point at the top-right status: "Agent: EXC-... breach / High - 9 left".)

**1:15** Open **Data ingestion** briefly. Show the batch history and the data browser.
"Each batch is logged with its record counts and checksum. This is a read-only copy; nothing is written back to SAP."

**1:25** Open **My queue**, then a **breach**, ideally P2P-05 bank change or PAY-02 pay to a leaver.
"Here's one the agent flagged. The rule saw a payment within 14 days of a vendor bank-account change. The agent looked up the change request, found it came by email from an address that isn't the registered contact, with no call-back verification, and proposes a High-severity breach. Every ID and amount it cites has been checked against the evidence: this green badge."
Click the **Agent trace** tab: "These are the exact steps. Model call one, a get_record lookup, then submit. About 3,000 tokens and a fraction of a cent."

**1:55** Open a **decoy** that the agent cleared, e.g. P2P-01 recurring rent or PAY-02 final settlement.
"The rules are deliberately broad, so some hits are legitimate. Here the same amount was billed twice, but for two different service months. The agent proposes a false positive and quotes the evidence. It still can't close anything on its own."

**2:10** Back on the breach, choose **Confirm breach**, add a note, then **Submit review**.
"I confirm it. It now goes to the Head of Internal Audit."

**2:20** Sign out, then **Sign in as Approver**. My queue, open the item, **Approve finding**.
"As the approver I sign it off. That issues a finding and raises a corrective action for the treasury manager. The supervisor can't approve their own review, and no action closes until I verify the evidence."
Show **Corrective actions** for a second.

**2:35** **Audit copilot**: click "Top 5 open breaches by amount at risk".
"Auditors can also just ask. The copilot plans its own read-only queries and answers from the results."

## 2:45-3:45 - Implementation: what happens on each request

**Screen:** the **How it works** page, then the GitHub repo `lib/ai/agent.ts`.

**Voice:**
"On every fetch: extract, validate, load, run 15 deterministic rules, queue exceptions.
For each exception the agent gets the control, its policy, the severity rubric and the evidence, with CNICs, bank accounts and tax numbers masked. It runs gpt-oss-120b, OpenAI's open-weight model, on Groq. It has two read-only tools and a budget of three lookups, and it must finish by calling submit_assessment with a structured answer. A deterministic verifier then checks every figure it cited. The supervisor reviews it, the approver signs off, and it's all in the audit trail.
I chose an open-weight model on purpose. My Phase 1 verdict was 'go, with in-country compute', and the same weights can run on the Company's own servers in production. This demo only ever sends synthetic data to the hosted API."

## 3:45-4:40 - Evaluation numbers, and one thing that doesn't work

**Screen:** **Evaluation** page, then the notebook results table (section 11).

**Voice (fill in the numbers from notebook section 11):**
"I seeded breaches and look-alike decoys into the synthetic data, so everything is scored against ground truth.
The rules found 100% of seeded breaches across 20 batches, after my first duplicate-invoice rule missed 70% of them: it compared invoice numbers exactly, and fixing it is in the notebook.
On the AI evaluation set the false-clear rate, a real breach called a false positive, was X%, against a 2% target. Severity agreement was Y%, citation faithfulness Z%, and precision W%. It cost about 0.1 cents per exception.
One thing that doesn't work: [pick the clearest failure from the honesty section, e.g. 'the agent sometimes picks the wrong severity when the rubric needs arithmetic, like the 20% minimum-wage shortfall threshold' or 'the synthetic decoys are cleaner than real evidence, so these scores are an upper bound']. And the evaluation set is small, about 25 exceptions, because of the free-tier token limit.
That is why a supervisor and an approver review every proposal. Thank you."

---

### Recording checklist
- Before recording, sign in once so the first batch has been triaged (the free tier is slow: allow about 5 minutes).
- Fetch **one** batch during the recording (about 14 exceptions, roughly 40K tokens of the free daily quota). Don't toggle Live monitoring on during the demo.
- Keep the evaluation page and notebook section 11 open in tabs.
