// POST /api/session — saves a session.
// Behavior:
//   - If running on Vercel (process.env.VERCEL === '1') OR the sessions/ dir
//     is not writable → respond { mode: 'download', filename, markdown } and
//     let the client trigger a browser download.
//   - Otherwise, write to sessions/<filename> on disk and respond
//     { mode: 'file', filename, path }.
//
// The markdown body is built by sessionLogger and is byte-identical in both modes.

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { compute } from "@/lib/billingEngine";
import {
  buildSessionMarkdown,
  sessionFilename,
} from "@/lib/sessionLogger";
import type { CountyLabel, LineItem } from "@/types/billing";

export const runtime = "nodejs";

interface PostBody {
  blurb: string;
  followUps?: Array<{ question: string; answer: string }>;
  dosIso: string;
  county: CountyLabel;
  lineItems: LineItem[];
}

function canWriteToSessionsDir(): boolean {
  try {
    const dir = path.join(process.cwd(), "sessions");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const probe = path.join(dir, `.write-probe-${process.pid}-${Date.now()}`);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as PostBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const result = compute({
    dosIso: body.dosIso,
    county: body.county,
    lineItems: body.lineItems,
  });

  const now = new Date();
  const markdown = buildSessionMarkdown({
    timestamp: now,
    blurb: body.blurb,
    followUps: body.followUps ?? [],
    result,
  });
  const filename = sessionFilename(now);

  const onVercel = process.env.VERCEL === "1";
  if (onVercel || !canWriteToSessionsDir()) {
    return NextResponse.json({
      ok: true,
      mode: "download" as const,
      filename,
      markdown,
    });
  }

  const filePath = path.join(process.cwd(), "sessions", filename);
  fs.writeFileSync(filePath, markdown, "utf8");
  return NextResponse.json({
    ok: true,
    mode: "file" as const,
    filename,
    path: filePath,
    markdown,
  });
}
