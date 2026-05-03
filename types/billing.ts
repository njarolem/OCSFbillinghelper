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

export interface BlurbParseResult {
  dos: string | null; // ISO date "YYYY-MM-DD"
  county: CountyLabel | null;
  lineItems: LineItem[];
  followUp: string | null; // populated when something is missing
  doctorName?: string; // detected "Dr. <Name>" for the Other Doctors column header
  conflicts?: ConflictItem[]; // CPT lines with stacked payment modifiers awaiting resolution
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
}
