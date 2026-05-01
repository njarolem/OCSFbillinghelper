// POST /api/compute — given a parsed input, return a BillingResult.
// Lives on Node runtime because billing depends on the CSV files in /data.

import { NextRequest, NextResponse } from "next/server";
import { compute } from "@/lib/billingEngine";
import { isDateInRange } from "@/lib/blurbParser";
import type { CountyLabel, LineItem } from "@/types/billing";

export const runtime = "nodejs";

interface PostBody {
  dosIso: string;
  county: CountyLabel;
  lineItems: LineItem[];
  doctorName?: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as PostBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  if (!isDateInRange(body.dosIso)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Date of service ${body.dosIso.slice(0, 4)} is outside the supported range (2022–2026).`,
      },
      { status: 400 },
    );
  }

  if (!body.lineItems || body.lineItems.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No CPT line items provided." },
      { status: 400 },
    );
  }

  const result = compute(body);
  return NextResponse.json({ ok: true, result });
}
