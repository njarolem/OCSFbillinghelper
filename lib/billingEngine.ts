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
  const ascRows: AscBillingRow[] = [];
  const allFlags: FcsoFlag[] = [];

  for (const li of lineItems) {
    const cpt = li.cpt;
    const phys = findPhysicianRow(cpt, locality, year);
    const lineFlags: FcsoFlag[] = [];

    let medicare120Raw = 0;
    let ocsfChargeRaw = 0;

    if (!phys) {
      lineFlags.push({
        cpt,
        reason:
          "CPT not found in physician fee schedule for this locality/year",
        locality,
        year,
        dosDisplay,
      });
      const yearsAvail = physicianYearsAvailable(cpt, locality);
      if (yearsAvail.size > 0 && !yearsAvail.has(year)) {
        lineFlags.push({
          cpt,
          reason: `CPT exists for years [${[...yearsAvail].sort().join(", ")}] but not ${year} — possibly added/revised`,
          locality,
          year,
          dosDisplay,
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
          year,
          dosDisplay,
        });
      } else if (phys.nonFacLc < LOW_VALUE_THRESHOLD) {
        lineFlags.push({
          cpt,
          reason: `NON_FAC_LC is suspiciously low ($${phys.nonFacLc.toFixed(2)}) — verify with FCSO`,
          locality,
          year,
          dosDisplay,
        });
      }

      if (conflict) {
        lineFlags.push({
          cpt,
          reason:
            "Multiple payment modifiers on one line; verify intended billing (most-restrictive applied)",
          locality,
          year,
          dosDisplay,
        });
      }
    }

    surgeonRows.push({
      date: dosDisplay,
      cptDisplay: formatCptDisplay(cpt, li.modifiers),
      medicare120Raw,
      ocsfChargeRaw,
      flags: lineFlags,
    });

    // ASC table — modifiers never apply.
    const asc = findAscRow(cpt, ascCounty, year);
    const ascFlags: FcsoFlag[] = [];
    let ascMedicare120Raw = 0;
    if (!asc) {
      ascFlags.push({
        cpt,
        reason: "CPT not found in ASC fee schedule — verify with FCSO",
        locality,
        year,
        dosDisplay,
      });
    } else {
      ascMedicare120Raw = asc.asc120Pct;
    }

    // ASC bilateral: -50 codes bill as two separate lines (LT + RT), each at 1× rate.
    if (li.modifiers.includes("50")) {
      ascRows.push({ date: dosDisplay, cptDisplay: `${cpt}-LT`, medicare120Raw: ascMedicare120Raw, flags: ascFlags });
      ascRows.push({ date: dosDisplay, cptDisplay: `${cpt}-RT`, medicare120Raw: ascMedicare120Raw, flags: [] });
    } else {
      ascRows.push({
        date: dosDisplay,
        cptDisplay: cpt,
        medicare120Raw: ascMedicare120Raw,
        flags: ascFlags,
      });
    }

    allFlags.push(...lineFlags, ...ascFlags);
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
    fcsoFlags: allFlags,
  };
}
