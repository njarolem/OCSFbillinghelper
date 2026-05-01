// Builds the markdown for one session block. The block format is byte-identical
// whether saved to the local sessions/ folder or downloaded by the browser.

import {
  renderAscTable,
  renderSurgeonTable,
} from "@/lib/billingFormat";
import { renderFcsoWarnings } from "@/lib/fcsoFlags";
import type { BillingResult } from "@/types/billing";

export interface SessionInput {
  timestamp: Date;
  blurb: string;
  followUps: Array<{ question: string; answer: string }>;
  result: BillingResult;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function sessionTimestampForFilename(d: Date): string {
  // Local time formatted as YYYY-MM-DD_HHMMSS
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${date}_${time}`;
}

export function sessionFilename(d: Date): string {
  return `OCSF_session_${sessionTimestampForFilename(d)}.md`;
}

export function buildSessionMarkdown(input: SessionInput): string {
  const { timestamp, blurb, followUps, result } = input;

  const header = `## Session: ${timestamp.toISOString().replace("T", " ").slice(0, 19)} UTC`;
  const meta = `**County:** ${result.county} (locality ${result.locality}) | **DOS:** ${result.dosDisplay} | **Year:** ${result.year}`;

  const blurbBlock = `### Blurb\n> ${blurb.replace(/\n/g, "\n> ")}`;

  const followUpBlock = followUps.length
    ? `\n### Follow-ups\n${followUps
        .map((f) => `- **Q:** ${f.question}\n  **A:** ${f.answer}`)
        .join("\n")}`
    : "";

  const lineItemsBlock = `### Resolved Line Items\n- ${result.surgeon.rows
    .map((r) => r.cptDisplay)
    .join(", ")}`;

  const surgeon = `### Table 1 — Surgeon\n\n${renderSurgeonTable(result)}\n\n*No multi-procedure (-51) reduction applied. Each line capped at 120% of its own Medicare rate per LOP convention.*`;

  const asc = `### Table 2 — Surgery Center & Anesthesia\n\n${renderAscTable(result)}`;

  const fcsoBlock = result.fcsoFlags.length
    ? `### FCSO Verification\n\n${renderFcsoWarnings(result.fcsoFlags)}`
    : `### FCSO Verification\n\n_No flags._`;

  return [
    "---",
    header,
    meta,
    "",
    blurbBlock,
    followUpBlock,
    lineItemsBlock,
    "",
    surgeon,
    "",
    asc,
    "",
    fcsoBlock,
    "---",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}
