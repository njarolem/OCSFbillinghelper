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
  CountyLabel,
  FcsoFlag,
  LineItem,
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
}

export function compute(input: ComputeInput): BillingResult {
  const { dosIso, county, lineItems } = input;
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
  // surgeon vs ASC codes in the blurb — respect that strictly. Otherwise
  // (legacy single-section blurbs) every code feeds both tables.
  const hasSectionedItems = lineItems.some((li) => li.section === "asc");

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
    const goesToSurgeon = !hasSectionedItems || li.section !== "asc";
    const goesToAsc = !hasSectionedItems || li.section === "asc";

    if (goesToSurgeon) {
      const isAssistant = li.modifiers.some((m) => ASSISTANT_MODS.has(m));
      const row: SurgeonRow = {
        date: lineDosDisplay,
        cptDisplay: formatCptDisplay(cpt, li.modifiers),
        medicare120Raw,
        ocsfChargeRaw,
        flags: lineFlags,
      };
      if (isAssistant) {
        otherDoctorRows.push(row);
      } else {
        surgeonRows.push(row);
      }
      allFlags.push(...lineFlags);
    }

    if (goesToAsc) {
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
    },
    fcsoFlags: allFlags,
  };
}
