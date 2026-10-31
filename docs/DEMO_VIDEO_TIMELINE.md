# Demo walkthrough video - timeline for the voiceover

Files (silent, 1440×900, 30 fps, H.264 MP4):
- `demo/ControlSight_CCM_demo_walkthrough.mp4`: 4:15 at normal speed
- `demo/ControlSight_CCM_demo_walkthrough_1.5x.mp4`: 2:50 (divide every timestamp below by 1.5)

The video is a real screen recording of the running application. The local build is the same code as the Vercel deployment and calls gpt-oss-120b on Groq live. On-screen captions are burned in, and a visible cursor shows every click. The only edit is one cut at 2:56: the copilot/report segment was re-recorded after I fixed a copilot bug (see the notebook and honesty section).

**Fitting the 5-minute limit.** Problem intro (~0:40) + the 1.5× walkthrough (2:50) + a short evaluation close (~0:45 over the evaluation screen or notebook) ≈ 4:15. Alternatively, use the 1× version and trim the ingestion data browser (0:44-0:56) and the control details (0:56-1:12).

| Time (1×) | On screen | Suggested voiceover |
|---|---|---|
| 0:00 | Login page, three roles | "ControlSight is a continuous control monitoring tool for Internal Audit, built on synthetic data. There are three roles: a supervisor, an approver and a read-only audit committee." |
| 0:08 | Supervisor dashboard | "The supervisor's dashboard: 15 key controls across seven process areas, tested on every transaction rather than a sample." |
| 0:16 | Control status table | "Each control has a proposed rating, driven by the open exceptions." |
| 0:24 | Click **Fetch new data batch** | "Fetch pulls the next weekly extract from twelve SAP-style source streams..." |
| 0:30 | Pipeline cards | "...validates it, loads read-only copies, runs all fifteen control tests in milliseconds and queues the exceptions for the AI agent." |
| 0:36 | Agent status top-right, agent activity panel | "The agent starts immediately, investigating each exception in turn. You can see its proposals arriving." |
| 0:40 | Data ingestion page, batch history | "Every batch is logged with record counts, a checksum and AI progress. Nothing is written back to SAP." |
| 0:48 | Data browser | "These are the synthetic extracts. Identity, bank and tax numbers are masked before any AI call." |
| 0:56 | Risk & control matrix | "The control library covers procure-to-pay, order-to-cash, inventory, logistics, payroll and labour law, IT access and financial close..." |
| 1:04 | Control details | "...each with its policy, automated rule, severity rubric, owner and the regulation behind it." |
| 1:12 | Supervisor queue | "The supervisor's queue holds every exception the AI has investigated, with its proposed disposition and severity." |
| 1:20 | Breach: salary paid after termination | "Here the agent found salary paid to an employee two months after termination. It looked up the HR record and proposes a High-severity breach." |
| 1:28 | Green 'citations verified' badge | "Every ID, date and amount it cites has been checked against the evidence by a deterministic verifier." |
| 1:36 | **Agent trace** tab | "This is what happens on each request: the model chose to fetch the employee record, then submitted a structured assessment. Two calls, about 3,000 tokens, a fraction of a cent." |
| 1:44 | **Exact prompt** tab | "And this is the exact system prompt and masked evidence the model saw." |
| 1:52 | Decoy: payment after bank change | "Rules are deliberately broad. This payment followed a vendor bank-account change, which is a classic fraud pattern..." |
| 2:00 | Decoy agent trace | "...but the agent looked up the change request, found a call-back verification, and proposes a false positive. It can't close anything itself." |
| 2:08 | Supervisor confirms the breach | "Back on the real breach, the supervisor confirms it, with a note..." |
| 2:16 | Submitted | "...and it goes to the Head of Internal Audit." |
| 2:24 | Sign in as Approver | "Now as the approver." |
| 2:32 | Approver queue | "Supervisor decisions waiting for sign-off. The supervisor can't approve their own review." |
| 2:40 | **Approve finding & raise corrective action** | "Approving issues a finding and raises a corrective action for the process owner, here the Head of HR." |
| 2:48 | Corrective actions | "It closes only after the approver verifies the remediation evidence." |
| 2:56 | Audit copilot | "Auditors can also just ask questions. The copilot is an agent with read-only query tools." |
| 3:04 | Copilot answer table | "It chose one query, ran it and answered from the results: the top five open breaches, every figure verified." |
| 3:12 | Tool-call details | "The tool calls, tokens and cost are shown under each answer." |
| 3:20 | Evaluation page | "Everything is scored live against the seeded ground truth: recall, the false-clear rate, severity agreement and faithfulness." |
| 3:28 | Calibration, cost, latency | "Calibration, and cost per exception: about six-hundredths of a cent." |
| 3:36 | Per-control table | "Per-control scores, and every case where the AI was wrong." |
| 3:44 | Committee report, generating | "Finally, the Audit Committee summary, drafted by the model from the system's own figures..." |
| 3:52 | Report rendered | "...with every figure checked. Ratings stay proposed until the Head of Internal Audit signs them off." |
| 4:00 | Audit trail | "And every ingestion, AI proposal and human decision is in the audit trail." |
| 4:08 | Dashboard | "Continuous testing, AI investigation, human control." |

The evaluation numbers and "one thing that doesn't work" for the closing come from `docs/VIDEO_SCRIPT.md` (notebook section 11 and the honesty section).
