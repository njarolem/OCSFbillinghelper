// Parses a free-text case blurb into { dos, county, lineItems }.
// On any missing piece, returns a single targeted follow-up question.

import type {
  BlurbParseResult,
  CountyLabel,
  LineItem,
  Modifier,
} from "@/types/billing";

const SUPPORTED_YEARS = [2022, 2023, 2024, 2025, 2026];

// City → county lookup (Florida only). Lowercase keys.
const CITY_TO_COUNTY: Record<string, CountyLabel> = {
  miami: "Miami-Dade",
  hialeah: "Miami-Dade",
  "coral gables": "Miami-Dade",
  "miami beach": "Miami-Dade",
  doral: "Miami-Dade",
  homestead: "Miami-Dade",
  kendall: "Miami-Dade",
  aventura: "Miami-Dade",
  "fort lauderdale": "Broward",
  "ft lauderdale": "Broward",
  "ft. lauderdale": "Broward",
  hollywood: "Broward",
  pompano: "Broward",
  "pompano beach": "Broward",
  plantation: "Broward",
  davie: "Broward",
  weston: "Broward",
  sunrise: "Broward",
  pembroke: "Broward",
  "pembroke pines": "Broward",
  coconut: "Broward",
  "coconut creek": "Broward",
  "deerfield beach": "Broward",
  "boca raton": "Palm Beach",
  boca: "Palm Beach",
  "west palm": "Palm Beach",
  "west palm beach": "Palm Beach",
  jupiter: "Palm Beach",
  delray: "Palm Beach",
  "delray beach": "Palm Beach",
  "palm beach gardens": "Palm Beach",
  wellington: "Palm Beach",
  "boynton beach": "Palm Beach",
};

// County phrases that resolve directly.
const COUNTY_PHRASES: Array<[RegExp, CountyLabel]> = [
  [/\bmiami[\s-]?dade\b/i, "Miami-Dade"],
  [/\bdade\b/i, "Miami-Dade"],
  [/\bbroward\b/i, "Broward"],
  [/\bpalm\s*beach\b/i, "Palm Beach"],
  [/\bpalm\s*bch\b/i, "Palm Beach"],
  [/\bpbc\b/i, "Palm Beach"],
];

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const PAYMENT_MODS: ReadonlySet<string> = new Set(["50", "AS", "80", "82"]);
const SIDE_MODS: ReadonlySet<string> = new Set(["LT", "RT"]);

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

function toIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (!SUPPORTED_YEARS.includes(year)) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

// Picks the most specific date in the text. Returns ISO or null.
export function extractDate(text: string): string | null {
  // M/D/YYYY or MM/DD/YYYY or M-D-YYYY (allow 2 or 4 digit year)
  const slashRe = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g;
  let m: RegExpExecArray | null;
  const candidates: string[] = [];
  while ((m = slashRe.exec(text)) !== null) {
    let yr = Number(m[3]);
    if (yr < 100) yr += 2000;
    const iso = toIso(yr, Number(m[1]), Number(m[2]));
    if (iso) candidates.push(iso);
  }

  // "April 12, 2024" / "Apr 12 2024"
  const wordRe =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,)?\s+(\d{2,4})\b/gi;
  while ((m = wordRe.exec(text)) !== null) {
    const monthKey = m[1].toLowerCase();
    const month = MONTHS[monthKey] ?? MONTHS[monthKey.slice(0, 3)];
    let yr = Number(m[3]);
    if (yr < 100) yr += 2000;
    const iso = toIso(yr, month, Number(m[2]));
    if (iso) candidates.push(iso);
  }

  if (candidates.length === 0) return null;
  // Pick the latest mentioned (most likely to be the DOS, not DOB).
  return candidates[candidates.length - 1];
}

export function extractCounty(text: string): CountyLabel | null {
  for (const [re, label] of COUNTY_PHRASES) {
    if (re.test(text)) return label;
  }
  const lower = text.toLowerCase();
  // Multi-word cities first (longest match wins).
  const cities = Object.keys(CITY_TO_COUNTY).sort((a, b) => b.length - a.length);
  for (const city of cities) {
    const re = new RegExp(`\\b${city.replace(/\./g, "\\.")}\\b`, "i");
    if (re.test(lower)) return CITY_TO_COUNTY[city];
  }
  return null;
}

// Matches: optional CPT (5 chars: alnum + 4 digits + optional trailing letter),
// followed by zero or more "-MOD" segments. Captures the full token; we re-parse
// modifiers from the captured suffix to allow stacking like "27130-LT-AS".
const CPT_TOKEN_RE = /\b([A-Z0-9]\d{4}[A-Z]?)((?:-[A-Z0-9]{1,3})*)\b/gi;

// Finds all {index, iso} date anchors in the text so CPT codes can be tagged
// with the date that immediately precedes them.
function extractDateAnchors(text: string): Array<{ index: number; iso: string }> {
  const anchors: Array<{ index: number; iso: string }> = [];
  const slashRe = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g;
  let m: RegExpExecArray | null;
  while ((m = slashRe.exec(text)) !== null) {
    let yr = Number(m[3]);
    if (yr < 100) yr += 2000;
    const iso = toIso(yr, Number(m[1]), Number(m[2]));
    if (iso) anchors.push({ index: m.index, iso });
  }
  const wordRe =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,)?\s+(\d{2,4})\b/gi;
  while ((m = wordRe.exec(text)) !== null) {
    const monthKey = m[1].toLowerCase();
    const month = MONTHS[monthKey] ?? MONTHS[monthKey.slice(0, 3)];
    let yr = Number(m[3]);
    if (yr < 100) yr += 2000;
    const iso = toIso(yr, month, Number(m[2]));
    if (iso) anchors.push({ index: m.index, iso });
  }
  return anchors.sort((a, b) => a.index - b.index);
}

export function extractLineItems(text: string): LineItem[] {
  const anchors = extractDateAnchors(text);
  const items: LineItem[] = [];
  let m: RegExpExecArray | null;
  CPT_TOKEN_RE.lastIndex = 0;
  while ((m = CPT_TOKEN_RE.exec(text)) !== null) {
    const cpt = m[1].toUpperCase();
    const modSuffix = (m[2] || "").toUpperCase();
    const modifiers: Modifier[] = [];
    if (modSuffix) {
      for (const seg of modSuffix.split("-").filter(Boolean)) {
        if (PAYMENT_MODS.has(seg) || SIDE_MODS.has(seg)) {
          modifiers.push(seg as Modifier);
        }
      }
    }
    // Tag this code with the most-recent date anchor that appears before it.
    let dosIso: string | undefined;
    if (anchors.length > 0) {
      const preceding = anchors.filter((a) => a.index <= m!.index);
      if (preceding.length > 0) dosIso = preceding[preceding.length - 1].iso;
    }
    items.push({
      rawToken: `${cpt}${modSuffix}`,
      cpt,
      modifiers,
      ...(dosIso ? { dosIso } : {}),
    });
  }
  return items;
}

// CPT codes in the Surgery section (10000–69999) that have no modifiers
// likely need laterality clarification for orthopedic billing.
function surgicalCodesNeedingLaterality(items: LineItem[]): string[] {
  return items
    .filter((item) => {
      if (item.modifiers.length > 0) return false;
      const n = parseInt(item.cpt, 10);
      return n >= 10000 && n <= 69999;
    })
    .map((item) => item.cpt);
}

export function parseBlurb(
  text: string,
  opts: { skipLateralityCheck?: boolean; skipLocalityCheck?: boolean } = {},
): BlurbParseResult {
  const dos = extractDate(text);
  const county = extractCounty(text);
  const lineItems = extractLineItems(text);

  let followUp: string | null = null;
  if (lineItems.length === 0) {
    followUp =
      "I couldn't find any CPT codes in that blurb. Please paste the surgery codes (e.g., 27447-LT, 29881).";
  } else if (!dos) {
    followUp =
      "What was the date of service? (Please include MM/DD/YYYY — supported range is 2022–2026.)";
  } else if (!county) {
    followUp =
      "Which Florida county was the surgery performed in? (Miami-Dade, Broward, Palm Beach, or Other Florida)";
  } else if (county === "Other" && !opts.skipLocalityCheck) {
    followUp =
      "I resolved the location to Other Florida (locality 99). Please confirm — is the surgery county Miami-Dade, Broward, or Palm Beach? If it's another Florida county, reply \"Other\" to continue.";
  } else if (!opts.skipLateralityCheck) {
    const needsLat = surgicalCodesNeedingLaterality(lineItems);
    if (needsLat.length > 0) {
      const list = needsLat.join(", ");
      followUp =
        `${list} ${needsLat.length === 1 ? "has" : "have"} no laterality or payment modifier. ` +
        `Please add -LT, -RT, or -50 (bilateral) to each code — or reply "no modifier" to compute as unilateral.`;
    }
  }

  return { dos, county, lineItems, followUp };
}

// Helpers used by the engine when caller already has DOS and county
// (e.g., on a follow-up answer).
export function isDateInRange(iso: string): boolean {
  const yr = Number(iso.slice(0, 4));
  return SUPPORTED_YEARS.includes(yr);
}

export function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}
