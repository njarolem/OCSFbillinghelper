// Pure formatting + lookup helpers — safe for client-side import.
// No filesystem or CSV access in this module.

import type {
  AscCounty,
  BillingResult,
  CountyLabel,
  Locality,
  Modifier,
  PaymentModifier,
} from "@/types/billing";

export function countyToLocality(county: CountyLabel): Locality {
  switch (county) {
    case "Miami-Dade":
      return "04";
    case "Broward":
    case "Palm Beach":
      return "03";
    case "Other":
      return "99";
  }
}

export function countyToAscCounty(county: CountyLabel): AscCounty {
  switch (county) {
    case "Miami-Dade":
      return "MiamiDade";
    case "Broward":
      return "Broward";
    case "Palm Beach":
      return "PalmBeach";
    case "Other":
      return "AllOtherFL";
  }
}

// Surgeon 120% Medicare multiplier on NON_FAC_LC.
// Returns { mult, conflict } — conflict = multiple payment modifiers stacked.
export function surgeonMultiplier(modifiers: Modifier[]): {
  mult: number;
  conflict: boolean;
} {
  const paymentMods = modifiers.filter(
    (m): m is PaymentModifier =>
      m === "50" || m === "AS" || m === "80" || m === "82",
  );
  const conflict = paymentMods.length > 1;

  if (paymentMods.length === 0) {
    // Side modifiers (LT/RT) are payment-neutral.
    return { mult: 1.0 * 1.2, conflict };
  }

  const perMod = (m: PaymentModifier): number => {
    switch (m) {
      case "50":
        return 1.5;
      case "AS":
        return 0.16;
      case "80":
      case "82":
        return 0.20;
    }
  };

  // Most-restrictive (lowest) wins when stacked.
  const chosen = paymentMods.reduce((lo, m) =>
    perMod(m) < perMod(lo) ? m : lo,
  );
  return { mult: perMod(chosen) * 1.2, conflict };
}

// OCSF charge multiplier on OCSF_STANDARD_FEE.
// -50 → 2×; everything else (including stacking with -50) → 2×; otherwise 1×.
export function ocsfMultiplier(modifiers: Modifier[]): number {
  return modifiers.includes("50") ? 2 : 1;
}

export function formatCptDisplay(cpt: string, modifiers: Modifier[]): string {
  if (modifiers.length === 0) return cpt;
  return `${cpt}-${modifiers.join("-")}`;
}

export function roundDollars(n: number): number {
  return Math.round(n);
}

export function formatDollars(n: number): string {
  return `$${roundDollars(n).toLocaleString("en-US")}`;
}

export function renderSurgeonTable(result: BillingResult): string {
  const showOcsf = result.surgeon.rows.some((r) => r.ocsfChargeRaw > 0);
  const showMedicare = result.surgeon.rows.some((r) => r.medicare120Raw > 0);

  const cols = ["DATE", "CPT CODE"];
  const divs = ["------", "----------"];
  if (showMedicare) { cols.push("120% MEDICARE"); divs.push("---------------"); }
  if (showOcsf)    { cols.push("OCSF CHARGE");   divs.push("-------------"); }

  const header = `| ${cols.join(" | ")} |\n| ${divs.join(" | ")} |`;

  const rows = result.surgeon.rows.map((r) => {
    const cells = [r.date, r.cptDisplay];
    if (showMedicare) cells.push(formatDollars(r.medicare120Raw));
    if (showOcsf)    cells.push(formatDollars(r.ocsfChargeRaw));
    return `| ${cells.join(" | ")} |`;
  });

  const totalCells = ["**TOTALS**", ""];
  if (showMedicare) totalCells.push(`**$${result.surgeon.totalMedicare120.toLocaleString("en-US")}**`);
  if (showOcsf)    totalCells.push(`**$${result.surgeon.totalOcsfCharge.toLocaleString("en-US")}**`);
  const totals = `| ${totalCells.join(" | ")} |`;

  return [header, ...rows, totals].join("\n");
}

export function renderOtherDoctorsTable(result: BillingResult): string {
  const rows = result.otherDoctors.rows;
  const doctorName = result.otherDoctors.doctorName || "Dr. Roush";

  const header = `| DATE | CPT | ${doctorName.toUpperCase()} | OCSF CHARGE |\n|------|-----|-----------|-------------|`;

  const dataRows = rows.map((r) => {
    const drCell =
      r.drChargeRaw !== undefined && r.drChargeRaw > 0
        ? formatDollars(r.drChargeRaw)
        : "";
    const ocsfCell =
      r.ocsfChargeRaw > 0 ? formatDollars(r.ocsfChargeRaw) : "";
    return `| ${r.date} | ${r.cptDisplay} | ${drCell} | ${ocsfCell} |`;
  });

  const drTotal =
    result.otherDoctors.totalDrCharge > 0
      ? `**$${result.otherDoctors.totalDrCharge.toLocaleString("en-US")}**`
      : "**$**";
  const ocsfTotal =
    result.otherDoctors.totalOcsfCharge > 0
      ? `**$${result.otherDoctors.totalOcsfCharge.toLocaleString("en-US")}**`
      : "";
  const totals = `| **TOTAL** |  | ${drTotal} | ${ocsfTotal} |`;

  return [header, ...dataRows, totals].join("\n");
}

export function renderAscTable(result: BillingResult): string {
  const showMedicare = result.asc.rows.some((r) => r.medicare120Raw > 0);

  const cols = ["DATE", "CPT CODE"];
  const divs = ["------", "----------"];
  if (showMedicare) { cols.push("120% MEDICARE"); divs.push("---------------"); }

  const header = `| ${cols.join(" | ")} |\n| ${divs.join(" | ")} |`;

  const rows = result.asc.rows.map((r) => {
    const cells = [r.date, r.cptDisplay];
    if (showMedicare) cells.push(formatDollars(r.medicare120Raw));
    return `| ${cells.join(" | ")} |`;
  });

  const totalCells = ["**TOTALS**", ""];
  if (showMedicare) totalCells.push(`**$${result.asc.totalMedicare120.toLocaleString("en-US")}**`);
  const totals = `| ${totalCells.join(" | ")} |`;

  return [header, ...rows, totals].join("\n");
}
