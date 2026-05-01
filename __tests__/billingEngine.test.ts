// Unit tests for the billing engine.
// Uses the real CSV files in /data — no mocks. Tests assert against derived
// multipliers so they remain valid if the underlying NON_FAC_LC values are
// later updated in the CSVs.

import { describe, expect, it } from "vitest";
import { compute } from "@/lib/billingEngine";
import { formatDollars } from "@/lib/billingFormat";
import { findPhysicianRow } from "@/lib/csvLoader";
import type { LineItem } from "@/types/billing";

const DOS_2024 = "2024-04-12";

function lineItem(cpt: string, mods: string[] = []): LineItem {
  return {
    rawToken: mods.length ? `${cpt}-${mods.join("-")}` : cpt,
    cpt,
    modifiers: mods as LineItem["modifiers"],
  };
}

describe("surgeon multipliers (combined NON_FAC_LC × multiplier × 1.2)", () => {
  const cpt = "27447";
  const phys = findPhysicianRow(cpt, "04", 2024);
  if (!phys) throw new Error("Test fixture missing: 27447/04/2024");
  const base = phys.nonFacLc;

  it("no modifier → NON_FAC_LC × 1.2", () => {
    const r = compute({
      dosIso: DOS_2024,
      county: "Miami-Dade",
      lineItems: [lineItem(cpt)],
    });
    expect(r.surgeon.rows[0].medicare120Raw).toBeCloseTo(base * 1.2, 6);
  });

  it("-50 bilateral → NON_FAC_LC × 1.8 (1.5× the no-modifier multiplier on base)", () => {
    const r = compute({
      dosIso: DOS_2024,
      county: "Miami-Dade",
      lineItems: [lineItem(cpt, ["50"])],
    });
    expect(r.surgeon.rows[0].medicare120Raw).toBeCloseTo(base * 1.8, 6);
  });

  it("-AS → NON_FAC_LC × 0.192", () => {
    const r = compute({
      dosIso: DOS_2024,
      county: "Miami-Dade",
      lineItems: [lineItem(cpt, ["AS"])],
    });
    expect(r.surgeon.rows[0].medicare120Raw).toBeCloseTo(base * 0.192, 6);
  });

  it("-80 → NON_FAC_LC × 0.24", () => {
    const r = compute({
      dosIso: DOS_2024,
      county: "Miami-Dade",
      lineItems: [lineItem("27130", ["80"])],
    });
    const phys2 = findPhysicianRow("27130", "04", 2024);
    expect(phys2).toBeDefined();
    expect(r.surgeon.rows[0].medicare120Raw).toBeCloseTo(phys2!.nonFacLc * 0.24, 6);
  });

  it("-82 → NON_FAC_LC × 0.24 (same as -80)", () => {
    const r = compute({
      dosIso: DOS_2024,
      county: "Miami-Dade",
      lineItems: [lineItem("27130", ["82"])],
    });
    const phys2 = findPhysicianRow("27130", "04", 2024);
    expect(r.surgeon.rows[0].medicare120Raw).toBeCloseTo(phys2!.nonFacLc * 0.24, 6);
  });

  it("side modifier -RT alone is payment-neutral (same as no modifier)", () => {
    const noMod = compute({
      dosIso: DOS_2024,
      county: "Miami-Dade",
      lineItems: [lineItem(cpt)],
    });
    const rt = compute({
      dosIso: DOS_2024,
      county: "Miami-Dade",
      lineItems: [lineItem(cpt, ["RT"])],
    });
    expect(rt.surgeon.rows[0].medicare120Raw).toBeCloseTo(
      noMod.surgeon.rows[0].medicare120Raw,
      6,
    );
  });

  it("stacked -LT-AS → side mod ignored, AS multiplier applies", () => {
    const r = compute({
      dosIso: DOS_2024,
      county: "Miami-Dade",
      lineItems: [lineItem(cpt, ["LT", "AS"])],
    });
    expect(r.surgeon.rows[0].medicare120Raw).toBeCloseTo(base * 0.192, 6);
  });

  it("stacked -50-AS → most-restrictive (AS) wins and line is FCSO-flagged", () => {
    const r = compute({
      dosIso: DOS_2024,
      county: "Miami-Dade",
      lineItems: [lineItem(cpt, ["50", "AS"])],
    });
    expect(r.surgeon.rows[0].medicare120Raw).toBeCloseTo(base * 0.192, 6);
    const flagged = r.fcsoFlags.find((f) =>
      f.reason.includes("Multiple payment modifiers"),
    );
    expect(flagged).toBeDefined();
  });
});

describe("OCSF charge multipliers", () => {
  it("no modifier → OCSF_STANDARD_FEE × 1", () => {
    const r = compute({
      dosIso: DOS_2024,
      county: "Miami-Dade",
      lineItems: [lineItem("27447")],
    });
    const phys = findPhysicianRow("27447", "04", 2024)!;
    expect(r.surgeon.rows[0].ocsfChargeRaw).toBeCloseTo(phys.ocsfStandardFee, 6);
  });

  it("-50 bilateral → OCSF_STANDARD_FEE × 2", () => {
    const r = compute({
      dosIso: DOS_2024,
      county: "Miami-Dade",
      lineItems: [lineItem("27447", ["50"])],
    });
    const phys = findPhysicianRow("27447", "04", 2024)!;
    expect(r.surgeon.rows[0].ocsfChargeRaw).toBeCloseTo(phys.ocsfStandardFee * 2, 6);
  });

  it("-AS does not change OCSF charge (still 1×)", () => {
    const r = compute({
      dosIso: DOS_2024,
      county: "Miami-Dade",
      lineItems: [lineItem("27447", ["AS"])],
    });
    const phys = findPhysicianRow("27447", "04", 2024)!;
    expect(r.surgeon.rows[0].ocsfChargeRaw).toBeCloseTo(phys.ocsfStandardFee, 6);
  });
});

describe("ASC table", () => {
  it("uses ASC_120PCT directly with no modifier math", () => {
    const r = compute({
      dosIso: DOS_2024,
      county: "Miami-Dade",
      lineItems: [lineItem("27447", ["AS"])],
    });
    // 27447 ASC MiamiDade 2024 = 10450.87; modifier doesn't change it.
    expect(r.asc.rows[0].medicare120Raw).toBeCloseTo(10450.87, 2);
  });

  it("missing CPT returns $0 and triggers an FCSO flag", () => {
    const r = compute({
      dosIso: DOS_2024,
      county: "Miami-Dade",
      lineItems: [lineItem("99999")],
    });
    expect(r.asc.rows[0].medicare120Raw).toBe(0);
    const flag = r.fcsoFlags.find(
      (f) => f.cpt === "99999" && f.reason.includes("ASC fee schedule"),
    );
    expect(flag).toBeDefined();
  });
});

describe("rounding & totals", () => {
  it("formatDollars rounds 363.528 → '$364'", () => {
    expect(formatDollars(302.94 * 1.2)).toBe("$364");
  });

  it("totals row equals sum of unrounded line items, rounded once", () => {
    const r = compute({
      dosIso: DOS_2024,
      county: "Miami-Dade",
      lineItems: [
        lineItem("27447"),
        lineItem("27130"),
      ],
    });
    const sumUnrounded =
      r.surgeon.rows[0].medicare120Raw + r.surgeon.rows[1].medicare120Raw;
    expect(r.surgeon.totalMedicare120).toBe(Math.round(sumUnrounded));
  });
});
