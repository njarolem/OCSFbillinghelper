---
name: ocsf-billing-spec
description: Authoritative billing math spec for OCSFbillinghelper — Florida orthopedic surgery billing under the LOP statute (120% of Medicare cap). Use this skill aggressively whenever the user discusses billing logic, modifier math, fee calculations, NON_FAC_LC, ASC rates, OCSF charges, locality mapping, the surgeon table, the ASC table, the compute() function, billingEngine.ts, billingFormat.ts, or any change to how billing values are produced. Trigger this skill BEFORE proposing changes to any file in `lib/billing*`, `lib/csvLoader.ts`, or `lib/blurbParser.ts`. Trigger it when reviewing test failures in `__tests__/`. Trigger it when the user pastes a case blurb. Trigger it for any question about modifier handling (-LT, -RT, -50, -AS, -80, -82, -51), modifier stacking, rounding rules, or the locality 03 ASC toggle. The cost of getting billing math wrong is legal exposure under Florida's LOP statute — accuracy is non-negotiable, so err strongly on the side of triggering this skill.
---

# OCSF Billing Spec

## When this skill applies

Active for the OCSFbillinghelper Next.js app. The codebase implements a Florida-specific billing calculation under the LOP statute (Fla. Stat., effective March 2023) capping personal injury reimbursement at 120% of Medicare. Wrong math = legal error. Read this entire skill before proposing changes to billing logic.

## Code map (where to look first)

| Concern | File | Notes |
|---|---|---|
| Pure multipliers, formatters, rounding | lib/billingFormat.ts | Client-safe. Source of truth for surgeonMultiplier, ocsfMultiplier, roundDollars, countyToLocality, countyToAscCounty, formatCptDisplay. |
| Server-only compute() | lib/billingEngine.ts | Imports csvLoader (uses node:fs). Never import from a client component. |
| CSV access | lib/csvLoader.ts | Exposes findPhysicianRow, findAscRow, physicianYearsAvailable. Module-level Map cache. |
| Blurb to structured input | lib/blurbParser.ts | Returns { dos, county, lineItems, followUp }. SUPPORTED_YEARS = [2022..2026]. CITY_TO_COUNTY map for FL cities. |
| FCSO flag rendering | lib/fcsoFlags.ts | fcsoLookupUrl() + renderFcsoWarnings(). One block per CPT (deduped by code). |
| Constants | lib/billingEngine.ts | LOW_VALUE_THRESHOLD = 10 |
| Source data | data/master_physician_ocsf.csv, data/master_asc.csv | Static. Single source of truth. |

## CSV schemas (verified)

master_physician_ocsf.csv:  CPT, LOCALITY, YEAR, NON_FAC_LC, OCSF_STANDARD_FEE
master_asc.csv:             CPT, LOCALITY, YEAR, COUNTY, ASC_BASE_AMOUNT, ASC_120PCT

All surgeon math derives from NON_FAC_LC.

## Table 1 — Surgeon

Columns: DATE | CPT CODE | 120% MEDICARE | OCSF CHARGE

### 120% MEDICARE column — base × surgeonMultiplier(modifier) × 1.2

Base is always NON_FAC_LC. The 1.2 factor is the LOP cap.

| Modifier | surgeonMultiplier | Effective formula |
|---|---|---|
| None, -LT, -RT | 1.0 | NON_FAC_LC × 1.0 × 1.2 |
| -50 (bilateral) | 1.5 | NON_FAC_LC × 1.5 × 1.2 |
| -AS | 0.16 | NON_FAC_LC × 0.16 × 1.2 |
| -80, -82 | 0.20 | NON_FAC_LC × 0.20 × 1.2 |

### OCSF CHARGE column — OCSF_STANDARD_FEE × ocsfMultiplier(modifier)

| Modifier | ocsfMultiplier |
|---|---|
| None, -LT, -RT | 1 |
| -50 (bilateral) | 2 |
| All other modifiers | 1 |

## Table 2 — ASC and Anesthesia

Columns: DATE | CPT CODE | 120% MEDICARE

- Read ASC_120PCT directly from master_asc.csv. Modifiers never apply to ASC.
- If the CPT is missing from master_asc.csv, display $0 and raise an FCSO flag. Never write "NOT FOUND".

## Rounding (strict)

- Carry full precision through all intermediate math.
- Round only the final displayed dollar in each cell, to the nearest whole dollar.
- Display format: $X,XXX (no decimals, comma thousands separator).
- Totals: sum the unrounded line values, round once at the end. Do not sum rounded values.
- Use roundDollars() from billingFormat.ts — do not reinvent.

## Locality mapping

| County | Physician LOCALITY | ASC COUNTY |
|---|---|---|
| Miami-Dade | 04 | MiamiDade |
| Broward | 03 | Broward |
| Palm Beach | 03 | PalmBeach |
| Other Florida | 99 | AllOtherFL |

Locality 03 quirk: Broward and Palm Beach share physician math. Only the ASC table differentiates. The UI surfaces a one-click toggle to swap the ASC table between the two when locality 03 resolves. When proposing UI changes, preserve this toggle.

## Modifier stacking

- Side modifiers (-LT, -RT): payment-neutral.
- Payment modifiers (-50, -AS, -80, -82): apply their multiplier.
- Stacked payment modifiers on one line: lowest multiplier wins. FCSO-flag with reason "Multiple payment modifiers on one line".
- Compound (27130-LT-AS) and split (27130-LT, 27130-AS) blurb formats both parse — see blurbParser.ts.
- -LT + -RT as separate lines = 2.0× total. Intentional. Do not auto-merge to -50. Do not show a banner suggesting it.

## Multi-procedure (-51)

Not applied. Each CPT line is independently capped at 120% of its own NON_FAC_LC. The Surgeon table renders an italic footnote making this explicit. Do not implement -51 reduction without an explicit spec change request from Nash.

## FCSO verification flagging — the trigger conditions

A line gets flagged when:

1. CPT not found in the relevant CSV for the requested year/locality.
2. NON_FAC_LC is 0.00 — Status R / carrier-priced.
3. NON_FAC_LC < $10 — low-value heuristic. Constant: LOW_VALUE_THRESHOLD = 10.
4. Year-coverage gap — CPT exists in some 2022–2026 years but not the requested year (likely added/revised). Use physicianYearsAvailable() to detect.
5. ASC line returns $0 because the CPT is missing from master_asc.csv.

(See fcso-flagging skill for the warning-block format and the FCSO lookup URL contract.)

## Hard rules (do not violate)

- NON_FAC_LC is the only base for surgeon fees. This applies even when the procedure is performed at an ASC.
- FAC LC must never be used for the surgeon 120% Medicare column.
- Round only at final display. Display whole dollars only.
- Modifiers never apply to ASC rates.
- Never silently default a county. If the blurb is ambiguous, return followUp asking.
- Each new case = fresh state. The "+ New Case" button is the contract.

## When making code changes

1. Confirm which file owns the concern using the code map above.
2. If touching multipliers or rounding, change billingFormat.ts (the pure module). Tests in __tests__/ should pass without changes to billingEngine.ts.
3. If touching CSV access, change csvLoader.ts. The cache invariant (parse once, Map per CSV) must hold.
4. If adding a new modifier or stacking rule, update this skill, the project CLAUDE.md, and the __tests__/ fixtures in the same PR. Drift between spec and code is the failure mode this project most fears.
5. Before claiming a fix is done, run npm test (Vitest). The billing engine has a regression test suite — use it.

## Anti-patterns (seen in past sessions)

- Using LIMITING CHARGE as the base. The original CMS files have it; this project does not. Use NON_FAC_LC.
- Rounding line values before summing the totals row.
- Auto-merging -LT + -RT separate lines into a single -50 line. Treat them as billed.
- Returning "NOT FOUND" for missing ASC codes. Always $0 + FCSO flag.
