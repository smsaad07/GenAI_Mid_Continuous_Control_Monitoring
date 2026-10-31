"use client";
export default function About() {
  return (
    <div className="stack" style={{ maxWidth: 980 }}>
      <div><h1>How it works</h1><div className="sub">ControlSight CCM - Phase 2 build of use case A (organisation-wide continuous control monitoring) from the DATA722 Phase 1 assessment.</div></div>
      <div className="card">
        <h2>What happens on each fetch</h2>
        <ol style={{ paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
          <li><b>Extract.</b> The next weekly extract window is pulled from 12 record streams (SAP MM, FI-AP, FI-GL, SD, MM-IM, HR/payroll, IR audit app wage sheets, biometric attendance, transport bills, user access). Here it comes from a seeded synthetic generator.</li>
          <li><b>Validate and load.</b> Key uniqueness and record counts are checked, a checksum is stored, and the records are loaded as read-only copies. Nothing is written back to any source system.</li>
          <li><b>Test every control.</b> 15 deterministic rule tests run over 100% of the population (not a sample). Rules are broad on purpose, aiming for recall.</li>
          <li><b>Investigate (AI agent).</b> Each exception goes to an agent running OpenAI's open-weight <code>gpt-oss-120b</code> on Groq. Identity, bank and tax numbers are masked first. The agent reads the control, its rubric and the evidence, decides which related records to look up (payments, bank-change requests, HR records) with read-only tools, and submits a structured proposal: disposition, severity, confidence, explanation, root cause and action.</li>
          <li><b>Verify.</b> A deterministic checker confirms every record ID, date and amount the agent cites appears in what it was shown. Failures are flagged to the reviewer and counted in the evaluation.</li>
          <li><b>Human review.</b> The Audit Supervisor reviews every proposal (confirm, override severity, dismiss with reason, or send back to the AI). The Head of Internal Audit approves every decision; an approved breach becomes a finding with a corrective action for the process owner, which closes only after the approver verifies the evidence.</li>
        </ol>
      </div>
      <div className="grid g2">
        <div className="card">
          <h2>What the AI is and is not allowed to do</h2>
          <ul style={{ paddingLeft: 18, margin: 0, lineHeight: 1.6 }}>
            <li>Can: read masked records, look up related records, propose an assessment, answer questions (copilot) and draft the committee summary.</li>
            <li>Cannot: change any record, close or dismiss an exception, issue a finding, contact anyone or write to any source system.</li>
            <li>Autonomy level: <b>recommends</b> (Phase 1, row 9a). Every outcome needs two humans.</li>
          </ul>
        </div>
        <div className="card">
          <h2>Data and deployment notice</h2>
          <ul style={{ paddingLeft: 18, margin: 0, lineHeight: 1.6 }}>
            <li>All data is <b>synthetic</b>: names, CNICs, IBANs, NTNs, amounts and documents are randomly generated. No Company data is used.</li>
            <li>This demo uses a hosted model (Groq, outside Pakistan). The Phase 1 verdict for production is <b>Go, with in-country compute</b>: because gpt-oss is open-weight, the same model can run on Company or in-country infrastructure with no code change other than the endpoint.</li>
            <li>Ground truth (seeded breaches and decoys) is stored for evaluation only and never shown to the agent.</li>
          </ul>
        </div>
      </div>
      <div className="card">
        <h2>Roles</h2>
        <table><tbody>
          <tr><td><b>Audit Supervisor</b></td><td>Replaces on-the-ground testing with supervision: fetches data, reviews every AI proposal, records management responses and remediation evidence.</td></tr>
          <tr><td><b>Head of Internal Audit (Approver)</b></td><td>Signs off supervisor decisions (cannot approve their own review), issues findings, verifies and closes corrective actions, signs off control ratings, can reset the demo.</td></tr>
          <tr><td><b>Audit Committee (viewer)</b></td><td>Read-only: dashboard, control ratings and committee report.</td></tr>
        </tbody></table>
      </div>
    </div>
  );
}
