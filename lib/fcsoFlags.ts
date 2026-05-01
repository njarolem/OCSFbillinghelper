// Renders an FCSO verification warning block (markdown) for a set of flags.
// One block per CPT (de-duped), each with a real anchor that pre-fills the
// FCSO Fee Schedule Lookup query string.

import type { FcsoFlag } from "@/types/billing";

export function fcsoLookupUrl(
  cpt: string,
  locality: string,
  year: number,
): string {
  const params = new URLSearchParams({
    cpt,
    locality,
    year: String(year),
  });
  return `https://medicare.fcso.com/fee-schedule-lookup?${params.toString()}`;
}

export function renderFcsoWarnings(flags: FcsoFlag[]): string {
  if (flags.length === 0) return "";

  // Group by CPT so the user gets one block per code, even if multiple
  // reasons fired (e.g., low-value + year-gap).
  const grouped = new Map<string, FcsoFlag[]>();
  for (const f of flags) {
    if (!grouped.has(f.cpt)) grouped.set(f.cpt, []);
    grouped.get(f.cpt)!.push(f);
  }

  const blocks: string[] = [];
  for (const [cpt, fs] of grouped) {
    const first = fs[0];
    const reasons = fs.map((f) => `- ${f.reason}`).join("\n");
    const url = fcsoLookupUrl(cpt, first.locality, first.year);
    blocks.push(
      `⚠️ **FCSO verification needed:** CPT ${cpt}, DOS ${first.dosDisplay}, State: Florida, Locality: Florida-${first.locality} —\n${reasons}\n\nVerify NON FAC LC at the [FCSO Fee Schedule Lookup](${url}).`,
    );
  }

  return blocks.join("\n\n");
}
