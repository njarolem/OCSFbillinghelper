# CLAUDE.md — OCSFbillinghelper

## Project Purpose

OCSFbillinghelper is a password-protected web app for Florida orthopedic surgery
billing under the LOP statute (cap of 120% of Medicare). Office staff paste a
free-text case blurb (date of service, county/city, CPT codes with optional
modifiers) and receive two markdown billing tables — Surgeon and Surgery
Center & Anesthesia — plus FCSO verification flags for any line that needs
manual confirmation. Everything runs client-side / on Vercel edge; no LLM
calls, no database, no server-side state.

## Architecture Summary

- **Next.js 14 (App Router) + TypeScript + Tailwind.**
- **Two static CSVs** ship in `/data` and are parsed once per server process by
  `lib/csvLoader.ts` (cached in module-level Maps).
- **`lib/billingFormat.ts`** — pure formatters and multiplier tables, safe for
  client import.
- **`lib/billingEngine.ts`** — `compute()` that touches the CSV loader; only
  imported from server (API routes, sessionLogger).
- **`lib/blurbParser.ts`** — pure text → `{ dos, county, lineItems, followUp }`.
- **API routes:** `/api/auth` (edge, signed cookie), `/api/compute` (Node),
  `/api/session` (Node, file-write-or-download).
- **Edge middleware** gates all routes behind a signed httpOnly cookie.
- **No backend, no LLM, no DB.** The CSVs are the single source of truth.

## BILLING LOGIC SPEC (source of truth — copy this verbatim into any future spec discussion)

### TABLE 1 — SURGEON
Columns: `DATE | CPT CODE | 120% MEDICARE | OCSF CHARGE`

**`120% MEDICARE` column** — multiplier applied to `NON_FAC_LC`:
| Modifier | Formula |
|---|---|
| None, `-LT`, `-RT` | `NON_FAC_LC × 1.0 × 1.2` |
| `-50` (bilateral) | `NON_FAC_LC × 1.5 × 1.2` |
| `-AS` | `NON_FAC_LC × 0.16 × 1.2` |
| `-80` or `-82` | `NON_FAC_LC × 0.20 × 1.2` |

**`OCSF CHARGE` column** — multiplier applied to `OCSF_STANDARD_FEE`:
| Modifier | Formula |
|---|---|
| None, `-LT`, `-RT` | `OCSF_STANDARD_FEE × 1` |
| `-50` (bilateral) | `OCSF_STANDARD_FEE × 2` |
| All other modifiers | `OCSF_STANDARD_FEE × 1` |

### TABLE 2 — SURGERY CENTER & ANESTHESIA
Columns: `DATE | CPT CODE | 120% MEDICARE`
- Always use `ASC_120PCT` from `master_asc.csv` directly. **Modifiers never apply.**
- If a CPT is not present in `master_asc.csv` → display `$0` and flag for FCSO verification. Never write "NOT FOUND".

### Rounding
- Carry full precision through all intermediate math.
- Round **only** the final displayed dollar value in each cell to the nearest whole dollar.
- Format as `$X,XXX` (no decimals, comma thousands separator).
- Totals row: sum the unrounded line-item values, then round the total once at the end.

### FCSO verification flagging
Flag any line where:
- CPT not found in the relevant CSV.
- `NON_FAC_LC` is `0.00` (Status R / carrier-priced).
- `NON_FAC_LC` is suspiciously low (`< $10`, low-value heuristic).
- CPT exists in some 2022–2026 years but not the requested year (year-coverage gap → likely added/revised).
- ASC line returns `$0` because the CPT is missing from the ASC file.

Warning format (markdown, beneath the affected table):
```
⚠️ **FCSO verification needed:** CPT [code], DOS [MM/DD/YYYY], State: Florida, Locality: Florida-0[X] —
- [reason 1]
- [reason 2]

Verify NON FAC LC at the [FCSO Fee Schedule Lookup](https://medicare.fcso.com/fee-schedule-lookup?cpt=[code]&locality=0[X]&year=[YYYY]).
```

### Locality Mapping
| County | LOCALITY (physician CSV) | COUNTY (ASC CSV) |
|---|---|---|
| Miami-Dade | `04` | `MiamiDade` |
| Broward | `03` | `Broward` |
| Palm Beach | `03` | `PalmBeach` |
| Other Florida | `99` | `AllOtherFL` |

Note: Broward and Palm Beach share `LOCALITY=03` — surgeon math is identical
for both. Only the ASC table differentiates. The chat surfaces a one-click
toggle to swap the ASC table when locality 03 resolves.

### Modifier Stacking
- **Side modifiers** (`-LT`, `-RT`) are payment-neutral.
- **Payment modifiers** (`-50`, `-AS`, `-80`, `-82`) apply their multiplier.
- If multiple payment modifiers stack, the most-restrictive (lowest multiplier)
  wins and the line is FCSO-flagged with "Multiple payment modifiers on one line".
- Compound (`27130-LT-AS`) and split (`27130-LT, 27130-AS`) blurb formats both parse.
- `-LT` + `-RT` as separate lines = 2.0× total. This is intended billing — no
  banner or auto-merge to `-50`.

### Multi-procedure (`-51`) reduction
**Not applied.** Each CPT line is independently capped at 120% of its own
`NON_FAC_LC`. Surgeon table renders an italic footnote noting this.

## Skills Index

When working on this codebase, consult these locally installed skills:

- **`xlsx`** — when the user wants to export billing tables to a spreadsheet,
  edit/restyle the source CSVs, or produce a workbook deliverable.
- **`docx`** — when the user wants the billing tables exported as a formatted
  Word document (e.g., for letterhead-styled output to attorneys).
- **`pdf`** — when the user wants billing tables as a PDF, or wants to extract
  text from PDF source documents (e.g., op notes, EOBs).
- **`vercel-react-best-practices`** — when building, refactoring, or reviewing
  React/Next.js components, data-fetching patterns, or bundle size.
- **`skill-creator`** — when the user wants to add a new skill, modify these
  instructions, or evaluate skill performance.
- **`systematic-debugging`** — when chasing a bug, test failure, or
  unexpected billing-engine output. Use before proposing fixes.

## Session Log Protocol

The runtime app writes one session file per case to `sessions/OCSF_session_<YYYY-MM-DD>_<HHMMSS>.md`
(or triggers a browser download in production where the filesystem is
read-only). Those files are user-facing billing records.

**Separately, when invoked locally to do dev work, append every dev session
to `dev-sessions.md` at the project root.** Each entry:
- Timestamp (ISO).
- One-paragraph summary of changes.
- Files touched (relative paths).

Do not conflate `dev-sessions.md` (developer audit trail) with `sessions/`
(billing output).

## Hard Rules

- `NON_FAC_LC` is the **only** base for surgeon fees, **including procedures performed in an ASC**.
- `FAC LC` must never be used for the surgeon 120% Medicare column.
- `PHYS_120PCT` is reference-only — never used in math.
- Round only at the end. Display whole dollars only.
- Each new case = fresh chat thread (the "+ New Case" button resets state).
- Modifiers never apply to ASC rates.
- Never silently default a county — always ask if not detectable.
