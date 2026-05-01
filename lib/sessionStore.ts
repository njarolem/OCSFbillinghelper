import type { BillingResult } from "@/types/billing";

export interface StoredSession {
  id: string;
  timestamp: string; // ISO
  dosDisplay: string;
  county: string;
  cptCodes: string[];
  result: BillingResult;
  blurb: string;
}

const KEY = "ocsf_sessions";
const MAX = 100;

function load(): StoredSession[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as StoredSession[];
  } catch {
    return [];
  }
}

function save(sessions: StoredSession[]) {
  localStorage.setItem(KEY, JSON.stringify(sessions.slice(0, MAX)));
}

export function saveSession(
  result: BillingResult,
  blurb: string,
): StoredSession {
  const session: StoredSession = {
    id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    dosDisplay: result.dosDisplay,
    county: result.county,
    cptCodes: result.surgeon.rows.map((r) => r.cptDisplay),
    result,
    blurb,
  };
  const existing = load().filter((s) => s.id !== session.id);
  save([session, ...existing]);
  return session;
}

export function listSessions(): StoredSession[] {
  return load();
}

export function deleteSession(id: string) {
  save(load().filter((s) => s.id !== id));
}
