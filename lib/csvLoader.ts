// Loads and indexes the two static CSV files once per server process.
// CSVs live in /data and never change at runtime — they're parsed lazily
// on first call and cached in module-level Maps for O(1) lookups.

import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import type {
  AscCounty,
  AscRow,
  Locality,
  PhysicianRow,
} from "@/types/billing";

interface PhysicianIndex {
  byKey: Map<string, PhysicianRow>; // key = `${cpt}|${locality}|${year}`
  yearsByCptLocality: Map<string, Set<number>>; // key = `${cpt}|${locality}`
}

interface AscIndex {
  byKey: Map<string, AscRow>; // key = `${cpt}|${county}|${year}`
}

let physicianIndex: PhysicianIndex | null = null;
let ascIndex: AscIndex | null = null;

function dataPath(file: string): string {
  return path.join(process.cwd(), "data", file);
}

function loadPhysician(): PhysicianIndex {
  if (physicianIndex) return physicianIndex;
  const csv = fs.readFileSync(dataPath("master_physician_ocsf.csv"), "utf8");
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  const byKey = new Map<string, PhysicianRow>();
  const yearsByCptLocality = new Map<string, Set<number>>();

  for (const r of parsed.data) {
    const cpt = (r.CPT || "").trim().toUpperCase();
    const locality = (r.LOCALITY || "").trim() as Locality;
    const year = Number(r.YEAR);
    if (!cpt || !locality || !Number.isFinite(year)) continue;
    const row: PhysicianRow = {
      cpt,
      locality,
      year,
      nonFacLc: Number(r.NON_FAC_LC) || 0,
      phys120Pct: Number(r.PHYS_120PCT) || 0,
      ocsfStandardFee: Number(r.OCSF_STANDARD_FEE) || 0,
    };
    byKey.set(`${cpt}|${locality}|${year}`, row);
    const yk = `${cpt}|${locality}`;
    if (!yearsByCptLocality.has(yk)) yearsByCptLocality.set(yk, new Set());
    yearsByCptLocality.get(yk)!.add(year);
  }

  physicianIndex = { byKey, yearsByCptLocality };
  return physicianIndex;
}

function loadAsc(): AscIndex {
  if (ascIndex) return ascIndex;
  const csv = fs.readFileSync(dataPath("master_asc.csv"), "utf8");
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  const byKey = new Map<string, AscRow>();
  for (const r of parsed.data) {
    const cpt = (r.CPT || "").trim().toUpperCase();
    const locality = (r.LOCALITY || "").trim() as Locality;
    const year = Number(r.YEAR);
    const county = (r.COUNTY || "").trim() as AscCounty;
    if (!cpt || !locality || !county || !Number.isFinite(year)) continue;
    const row: AscRow = {
      cpt,
      locality,
      year,
      county,
      ascBaseAmount: Number(r.ASC_BASE_AMOUNT) || 0,
      asc120Pct: Number(r.ASC_120PCT) || 0,
    };
    byKey.set(`${cpt}|${county}|${year}`, row);
  }

  ascIndex = { byKey };
  return ascIndex;
}

export function findPhysicianRow(
  cpt: string,
  locality: Locality,
  year: number,
): PhysicianRow | undefined {
  const idx = loadPhysician();
  return idx.byKey.get(`${cpt.toUpperCase()}|${locality}|${year}`);
}

export function findAscRow(
  cpt: string,
  county: AscCounty,
  year: number,
): AscRow | undefined {
  const idx = loadAsc();
  return idx.byKey.get(`${cpt.toUpperCase()}|${county}|${year}`);
}

export function physicianYearsAvailable(
  cpt: string,
  locality: Locality,
): Set<number> {
  const idx = loadPhysician();
  return idx.yearsByCptLocality.get(`${cpt.toUpperCase()}|${locality}`) ?? new Set();
}
