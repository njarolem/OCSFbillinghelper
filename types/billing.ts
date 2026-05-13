// Shared types for the billing pipeline.

export type Locality = "03" | "04" | "99";
export type AscCounty = "Broward" | "MiamiDade" | "PalmBeach" | "AllOtherFL";

// User-facing county labels — what staff types or what we resolve from a city.
export type CountyLabel = "Miami-Dade" | "Broward" | "Palm Beach" | "Other";

export interface PhysicianRow {
  cpt: string;
  locality: Locality;
  year: number;
  nonFacLc: number;
  phys120Pct: number; // reference only — never used in math
  ocsfStandardFee: number;
}

export interface AscRow {
  cpt: string;
  locality: Locality;
  year: number;
  county: AscCounty;
  ascBaseAmount: number;
  asc120Pct: number;
}

// Modifiers we recognize. Unknown modifiers fall through as no-multiplier.
export type SideModifier = "LT" | "RT";
export type PaymentModifier = "50" | "AS" | "80" | "82";
export type Modifier = SideModifier | PaymentModifier;

export interface LineItem {
  rawToken: string; // e.g., "27130-LT-AS"
  cpt: string;
  modifiers: Modifier[];
  dosIso?: string; // per-line date override when blurb has multiple DOS
  section?: "surgeon" | "asc" | "other"; // which table this code belongs to
  drCharge?: number; // pre-supplied "Dr. X" charge for the Other Doctors table
}

export interface ConflictItem {
  index: number; // index into lineItems
  cpt: string;
  paymentMods: PaymentModifier[];
}

export type ResultMode = "normal" | "compare";

export type ChargeColumnKind = "their_charge" | "medicare_120";

export interface ParsedCompareRow {
  dosIso: string; // "YYYY-MM-DD" (empty string if date couldn't be parsed)
  rawDateDisplay: string; // original date string from input cell, e.g. "10/17/24"
  cpt: string; // 5-char code used for fee lookup, e.g. "99214"
  rawCptDisplay: string; // original token from input, e.g. "99214-25"
  modifiers: Modifier[];
  theirCharge: number; // dollars from input (0 when column is fillable / blank)
  rawCharge: string; // original charge cell text, preserved verbatim
  chargeColumnKind?: ChargeColumnKind; // "medicare_120" when column 3 header asks for Medicare
}

export interface BlurbParseResult {
  dos: string | null; // ISO date "YYYY-MM-DD"
  county: CountyLabel | null;
  lineItems: LineItem[];
  followUp: string | null; // populated when something is missing
  doctorName?: string; // detected "Dr. <Name>" for the Other Doctors column header
  conflicts?: ConflictItem[]; // CPT lines with stacked payment modifiers awaiting resolution
  mode?: ResultMode; // "compare" when a 4-column compare table was detected
  compareRows?: ParsedCompareRow[]; // raw rows when mode === "compare"
}

export interface CompareRow {
  date: string; // display (may be from input verbatim or computed)
  cptDisplay: string;
  theirChargeRaw: number; // numeric value for sums
  theirChargeDisplay: string; // verbatim from input ("$295", "$1,750", etc.)
  medicare120Raw?: number; // populated when input column 3 asked for Medicare 120%
  ocsfChargeRaw: number;
  flags: FcsoFlag[];
}

export interface SurgeonRow {
  date: string; // MM/DD/YYYY for display
  cptDisplay: string; // e.g., "27130-RT"
  medicare120Raw: number; // unrounded
  ocsfChargeRaw: number; // unrounded
  flags: FcsoFlag[];
  drChargeRaw?: number; // user-supplied doctor charge (Other Doctors table)
}

export interface AscBillingRow {
  date: string;
  cptDisplay: string;
  medicare120Raw: number;
  flags: FcsoFlag[];
}

export interface FcsoFlag {
  cpt: string;
  reason: string;
  locality: Locality;
  year: number;
  dosDisplay: string; // MM/DD/YYYY
}

export interface BillingResult {
  dosDisplay: string; // MM/DD/YYYY
  year: number;
  county: CountyLabel;
  locality: Locality;
  ascCounty: AscCounty;
  surgeon: {
    rows: SurgeonRow[];
    totalMedicare120: number; // rounded once at end
    totalOcsfCharge: number;
  };
  asc: {
    rows: AscBillingRow[];
    totalMedicare120: number;
  };
  otherDoctors: {
    rows: SurgeonRow[];
    totalMedicare120: number;
    totalOcsfCharge: number;
    totalDrCharge: number;
    doctorName: string;
  };
  fcsoFlags: FcsoFlag[];
  mode?: ResultMode; // "compare" when result is from compare-table input
  compare?: {
    rows: CompareRow[];
    totalTheirCharge: number;
    totalOcsfCharge: number;
  };
}
