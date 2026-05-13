// Server-side billing math. Imports csvLoader (which uses node:fs), so this
// module must NOT be imported from a client component. Client code should
// import the pure helpers from `@/lib/billingFormat` instead, and call
// `/api/compute` for results.
//
// Hard rules enforced here:
//   - NON_FAC_LC is the ONLY base for surgeon 120% Medicare math.
//   - PHYS_120PCT is never used.
//   - Round only at the final display step. Totals sum unrounded line values
//     and round once.
//   - Modifiers never apply to ASC rates.

import {
  findAscRow,
  findPhysicianRow,
  physicianYearsAvailable,
} from "@/lib/csvLoader";
import { isoToDisplay } from "@/lib/blurbParser";
import {
  countyToAscCounty,
  countyToLocality,
  formatCptDisplay,
  ocsfMultiplier,
  roundDollars,
  surgeonMultiplier,
} from "@/lib/billingFormat";
import type {
  AscBillingRow,
  BillingResult,
  CompareRow,
  CountyLabel,
  FcsoFlag,
  LineItem,
  ParsedCompareRow,
  ResultMode,
  SurgeonRow,
} from "@/types/billing";

const LOW_VALUE_THRESHOLD = 10; // < $10 NON_FAC_LC triggers FCSO flag

// Re-export pure helpers so existing imports of @/lib/billingEngine keep working.
export {
  countyToAscCounty,
  countyToLocality,
  formatCptDisplay,
  formatDollars,
  ocsfMultiplier,
  renderAscTable,
  renderOtherDoctorsTable,
  renderSurgeonTable,
  roundDollars,
  surgeonMultiplier,
} from "@/lib/billingFormat";

export interface ComputeInput {
  dosIso: string; // "YYYY-MM-DD"
  county: CountyLabel;
  lineItems: LineItem[];
  doctorName?: string;
  mode?: ResultMode;
  compareRows?: ParsedCompareRow[];
}

export function compute(input: ComputeInput): BillingResult {
  if (input.mode === "compare" && input.compareRows) {
    return computeCompare(input.compareRows);
  }
  const { dosIso, county, lineItems, doctorName } = input;
  const year = Number(dosIso.slice(0, 4));
  const dosDisplay = isoToDisplay(dosIso);
  const locality = countyToLocality(county);
  const ascCounty = countyToAscCounty(county);

  const surgeonRows: SurgeonRow[] = [];
  const otherDoctorRows: SurgeonRow[] = [];
  const ascRows: AscBillingRow[] = [];

  const ASSISTANT_MODS = new Set(["AS", "80", "82"]);
  const allFlags: FcsoFlag[] = [];

  // If any line is explicitly tagged with a section, the user has separated
  // surgeon vs ASC vs Other-Doctor codes in the blurb — respect that strictly.
  // Otherwise (legacy single-section blurbs) every code feeds both tables.
  const hasSectionedItems = lineItems.some(
    (li) => li.section === "asc" || li.section === "other",
  );

  for (const li of lineItems) {
    const cpt = li.cpt;
    // Use per-line DOS when the blurb contains multiple dates.
    const lineIso = li.dosIso ?? dosIso;
    const lineYear = Number(lineIso.slice(0, 4));
    const lineDosDisplay = isoToDisplay(lineIso);
    const phys = findPhysicianRow(cpt, locality, lineYear);
    const lineFlags: FcsoFlag[] = [];

    let medicare120Raw = 0;
    let ocsfChargeRaw = 0;

    if (!phys) {
      lineFlags.push({
        cpt,
        reason:
          "CPT not found in physician fee schedule for this locality/year",
        locality,
        year: lineYear,
        dosDisplay: lineDosDisplay,
      });
      const yearsAvail = physicianYearsAvailable(cpt, locality);
      if (yearsAvail.size > 0 && !yearsAvail.has(lineYear)) {
        lineFlags.push({
          cpt,
          reason: `CPT exists for years [${[...yearsAvail].sort().join(", ")}] but not ${lineYear} — possibly added/revised`,
          locality,
          year: lineYear,
          dosDisplay: lineDosDisplay,
        });
      }
    } else {
      const { mult, conflict } = surgeonMultiplier(li.modifiers);
      medicare120Raw = phys.nonFacLc * mult;
      ocsfChargeRaw = phys.ocsfStandardFee * ocsfMultiplier(li.modifiers);

      if (phys.nonFacLc === 0) {
        lineFlags.push({
          cpt,
          reason:
            "NON_FAC_LC is $0 (Status R / carrier-priced) — verify with FCSO",
          locality,
          year: lineYear,
          dosDisplay: lineDosDisplay,
        });
      } else if (phys.nonFacLc < LOW_VALUE_THRESHOLD) {
        lineFlags.push({
          cpt,
          reason: `NON_FAC_LC is suspiciously low ($${phys.nonFacLc.toFixed(2)}) — verify with FCSO`,
          locality,
          year: lineYear,
          dosDisplay: lineDosDisplay,
        });
      }

      if (conflict) {
        lineFlags.push({
          cpt,
          reason:
            "Multiple payment modifiers on one line; verify intended billing (most-restrictive applied)",
          locality,
          year: lineYear,
          dosDisplay: lineDosDisplay,
        });
      }
    }

    // When the blurb has explicit sections, only render this code in its own
    // section's table. Otherwise feed both surgeon + ASC tables.
    const goesToSurgeon =
      !hasSectionedItems || (li.section !== "asc" && li.section !== "other");
    const goesToAsc =
      !hasSectionedItems
        ? true
        : li.section === "asc";
    const goesToOther = li.section === "other";

    if (goesToSurgeon) {
      surgeonRows.push({
        date: lineDosDisplay,
        cptDisplay: formatCptDisplay(cpt, li.modifiers),
        medicare120Raw,
        ocsfChargeRaw,
        flags: lineFlags,
      });
      allFlags.push(...lineFlags);
    } else if (goesToOther) {
      otherDoctorRows.push({
        date: lineDosDisplay,
        cptDisplay: formatCptDisplay(cpt, li.modifiers),
        medicare120Raw,
        ocsfChargeRaw,
        flags: lineFlags,
        ...(li.drCharge !== undefined ? { drChargeRaw: li.drCharge } : {}),
      });
      allFlags.push(...lineFlags);
    }

    if (goesToAsc && !li.modifiers.some((m) => ASSISTANT_MODS.has(m))) {
      const asc = findAscRow(cpt, ascCounty, lineYear);
      const ascFlags: FcsoFlag[] = [];
      let ascMedicare120Raw = 0;
      if (!asc) {
        ascFlags.push({
          cpt,
          reason: "CPT not found in ASC fee schedule — verify with FCSO",
          locality,
          year: lineYear,
          dosDisplay: lineDosDisplay,
        });
      } else {
        ascMedicare120Raw = asc.asc120Pct;
      }

      if (li.modifiers.includes("50")) {
        ascRows.push({ date: lineDosDisplay, cptDisplay: `${cpt}-LT`, medicare120Raw: ascMedicare120Raw, flags: ascFlags });
        ascRows.push({ date: lineDosDisplay, cptDisplay: `${cpt}-RT`, medicare120Raw: ascMedicare120Raw, flags: [] });
      } else {
        ascRows.push({
          date: lineDosDisplay,
          cptDisplay: formatCptDisplay(cpt, li.modifiers),
          medicare120Raw: ascMedicare120Raw,
          flags: ascFlags,
        });
      }
      allFlags.push(...ascFlags);
    }
  }

  const totalMedicare120 = roundDollars(
    surgeonRows.reduce((s, r) => s + r.medicare120Raw, 0),
  );
  const totalOcsfCharge = roundDollars(
    surgeonRows.reduce((s, r) => s + r.ocsfChargeRaw, 0),
  );
  const ascTotal = roundDollars(
    ascRows.reduce((s, r) => s + r.medicare120Raw, 0),
  );

  const otherTotal120 = roundDollars(
    otherDoctorRows.reduce((s, r) => s + r.medicare120Raw, 0),
  );
  const otherTotalOcsf = roundDollars(
    otherDoctorRows.reduce((s, r) => s + r.ocsfChargeRaw, 0),
  );
  const otherTotalDr = roundDollars(
    otherDoctorRows.reduce((s, r) => s + (r.drChargeRaw ?? 0), 0),
  );

  return {
    dosDisplay,
    year,
    county,
    locality,
    ascCounty,
    surgeon: {
      rows: surgeonRows,
      totalMedicare120,
      totalOcsfCharge,
    },
    asc: {
      rows: ascRows,
      totalMedicare120: ascTotal,
    },
    otherDoctors: {
      rows: otherDoctorRows,
      totalMedicare120: otherTotal120,
      totalOcsfCharge: otherTotalOcsf,
      totalDrCharge: otherTotalDr,
      doctorName: doctorName ?? "Dr. Roush",
    },
    fcsoFlags: allFlags,
    mode: "normal",
  };
}

// Compare-mode compute: only fills the OCSF Charge column. OCSF fees are
// locality-independent in the CSV so we always look up at locality "03".
function computeCompare(parsedRows: ParsedCompareRow[]): BillingResult {
  const compareRows: CompareRow[] = [];
  const allFlags: FcsoFlag[] = [];
  const locality = "03"; // OCSF fees are uniform across localities

  for (const r of parsedRows) {
    // Each row uses ITS OWN date for the fee-schedule lookup — never a
    // shared/global DOS. dosIso comes from extractDate on this row's date cell.
    const year = r.dosIso ? Number(r.dosIso.slice(0, 4)) : 0;
    const dateDisplay = r.rawDateDisplay || isoToDisplay(r.dosIso);
    const phys = year ? findPhysicianRow(r.cpt, locality, year) : null;
    const flags: FcsoFlag[] = [];

    let ocsfChargeRaw = 0;
    let medicare120Raw: number | undefined;
    if (!phys) {
      flags.push({
        cpt: r.cpt,
        reason: year
          ? `CPT not found in physician fee schedule for ${year} at locality ${locality}`
          : "Row has no parseable date — cannot look up fee schedule",
        locality,
        year,
        dosDisplay: dateDisplay,
      });
      if (r.chargeColumnKind === "medicare_120") medicare120Raw = 0;
    } else {
      ocsfChargeRaw = phys.ocsfStandardFee * ocsfMultiplier(r.modifiers);
      if (r.chargeColumnKind === "medicare_120") {
        const { mult } = surgeonMultiplier(r.modifiers);
        medicare120Raw = phys.nonFacLc * mult;
      }
    }

    compareRows.push({
      date: dateDisplay,
      cptDisplay: r.rawCptDisplay || formatCptDisplay(r.cpt, r.modifiers),
      theirChargeRaw: r.theirCharge,
      theirChargeDisplay: r.rawCharge,
      ...(medicare120Raw !== undefined ? { medicare120Raw } : {}),
      ocsfChargeRaw,
      flags,
    });
    allFlags.push(...flags);
  }

  const totalTheir = roundDollars(
    compareRows.reduce((s, r) => s + r.theirChargeRaw, 0),
  );
  const totalOcsf = roundDollars(
    compareRows.reduce((s, r) => s + r.ocsfChargeRaw, 0),
  );

  // Pick a DOS for the header from the first row; year from same.
  const firstIso = parsedRows[0]?.dosIso ?? "";
  const dosDisplay = firstIso ? isoToDisplay(firstIso) : "";
  const year = firstIso ? Number(firstIso.slice(0, 4)) : 0;

  return {
    dosDisplay,
    year,
    county: "Other",
    locality,
    ascCounty: "AllOtherFL",
    surgeon: { rows: [], totalMedicare120: 0, totalOcsfCharge: 0 },
    asc: { rows: [], totalMedicare120: 0 },
    otherDoctors: {
      rows: [],
      totalMedicare120: 0,
      totalOcsfCharge: 0,
      totalDrCharge: 0,
      doctorName: "",
    },
    fcsoFlags: allFlags,
    mode: "compare",
    compare: {
      rows: compareRows,
      totalTheirCharge: totalTheir,
      totalOcsfCharge: totalOcsf,
    },
  };
}
