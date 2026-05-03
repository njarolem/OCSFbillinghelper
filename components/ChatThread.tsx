"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  isDateInRange,
  isoToDisplay,
  parseBlurb,
} from "@/lib/blurbParser";
import {
  countyToAscCounty,
  renderAscTable,
  renderOtherDoctorsTable,
  renderSurgeonTable,
} from "@/lib/billingFormat";
import { renderFcsoWarnings } from "@/lib/fcsoFlags";
import type {
  BillingResult,
  CountyLabel,
  LineItem,
  Modifier,
} from "@/types/billing";

const VALID_MODIFIERS: ReadonlySet<string> = new Set([
  "LT",
  "RT",
  "50",
  "AS",
  "80",
  "82",
]);

function lineItemsFromDisplay(displays: string[]): LineItem[] {
  return displays.map((d) => {
    const parts = d.split("-");
    const cpt = parts[0];
    const modifiers = parts
      .slice(1)
      .filter((m) => VALID_MODIFIERS.has(m)) as Modifier[];
    return { rawToken: d, cpt, modifiers };
  });
}
import MessageBubble from "./MessageBubble";
import CaseInputBox from "./CaseInputBox";
import BillingTable from "./BillingTable";
import FCSOWarning from "./FCSOWarning";
import { saveSession } from "@/lib/sessionStore";
import type { StoredSession } from "@/lib/sessionStore";

type Msg =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; kind: "text"; text: string }
  | { id: string; role: "assistant"; kind: "markdown"; markdown: string }
  | { id: string; role: "assistant"; kind: "tables"; result: BillingResult };

let _nextId = 0;
const newId = () => `m_${++_nextId}`;

// Rewrites the conversation text to resolve modifier conflicts based on the
// user's answer. For each conflicting CPT, finds the user's chosen modifier
// (e.g. "27447 -50" → keep -50) and rewrites the original stacked token
// (e.g. "27447-50-AS") to the resolved form. "both" splits into two tokens.
function resolveConflictsInText(
  text: string,
  conflicts: Array<{ cpt: string; paymentMods: string[] }>,
  answer: string,
): string {
  const wantsBoth = /\bboth\b/i.test(answer);
  let out = text;
  for (const c of conflicts) {
    // Pattern matches e.g. "27447-50-AS" — CPT followed by 2+ "-MOD" segments.
    const tokenRe = new RegExp(
      `\\b${c.cpt}((?:-[A-Z0-9]{1,3})+)\\b`,
      "gi",
    );

    let chosen: string | null = null;
    if (!wantsBoth) {
      // Look near the CPT in the answer for a chosen modifier (e.g. "27447 -50").
      const near = new RegExp(
        `${c.cpt}[^\\n]*?-?\\s*-?(${c.paymentMods.join("|")})\\b`,
        "i",
      );
      const m = near.exec(answer);
      if (m) chosen = m[1].toUpperCase();
      // Fallback: bare modifier in answer when there's only one conflict.
      if (!chosen && conflicts.length === 1) {
        const bare = new RegExp(`-?(${c.paymentMods.join("|")})\\b`, "i");
        const bm = bare.exec(answer);
        if (bm) chosen = bm[1].toUpperCase();
      }
    }

    out = out.replace(tokenRe, (full, suffix: string) => {
      const sideMods = suffix
        .split("-")
        .filter(Boolean)
        .filter((s) => /^(LT|RT)$/i.test(s));
      const sideSuffix = sideMods.length > 0 ? `-${sideMods.join("-")}` : "";

      if (wantsBoth) {
        // Bill both as separate lines, preserving any side modifiers on each.
        return c.paymentMods
          .map((m) => `${c.cpt}-${m}${sideSuffix}`)
          .join(", ");
      }
      if (chosen) {
        return `${c.cpt}-${chosen}${sideSuffix}`;
      }
      // No clear answer — leave original token alone; the parser will re-prompt.
      return full;
    });
  }
  return out;
}

const SURGEON_FOOTNOTE =
  "No multi-procedure (-51) reduction applied. Each line capped at 120% of its own Medicare rate per LOP convention.";

export default function ChatThread({
  viewSession,
  onSessionSaved,
  onNewCase: onNewCaseExternal,
}: {
  viewSession?: StoredSession | null;
  onSessionSaved?: () => void;
  onNewCase?: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: newId(),
      role: "assistant",
      kind: "text",
      text:
        "Paste a case blurb — include the date of service, county or city, and the CPT codes (with modifiers like -LT, -RT, -50, -AS, -80, -82). I'll do the rest.",
    },
  ]);
  const [conversationText, setConversationText] = useState("");
  const [followUps, setFollowUps] = useState<
    Array<{ question: string; answer: string }>
  >([]);
  const [originalBlurb, setOriginalBlurb] = useState("");
  const [phase, setPhase] = useState<
    "awaiting-blurb" | "awaiting-followup" | "computing" | "done" | "error"
  >("awaiting-blurb");
  const [pendingFollowUp, setPendingFollowUp] = useState<string | null>(null);
  const [pendingConflicts, setPendingConflicts] = useState<
    Array<{ cpt: string; paymentMods: string[] }>
  >([]);
  const [result, setResult] = useState<BillingResult | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, savedNotice]);

  // Load a past session for read-only viewing
  useEffect(() => {
    if (!viewSession) return;
    setMessages([
      {
        id: newId(),
        role: "assistant",
        kind: "text",
        text: `Viewing past case — ${viewSession.dosDisplay}, ${viewSession.county}.`,
      },
      { id: newId(), role: "user", text: viewSession.blurb },
      { id: newId(), role: "assistant", kind: "tables", result: viewSession.result },
    ]);
    setResult(viewSession.result);
    setOriginalBlurb(viewSession.blurb);
    setPhase("done");
    setSavedNotice(null);
  }, [viewSession]);

  function appendUser(text: string) {
    setMessages((m) => [...m, { id: newId(), role: "user", text }]);
  }
  function appendAssistant(text: string) {
    setMessages((m) => [
      ...m,
      { id: newId(), role: "assistant", kind: "text", text },
    ]);
  }
  function appendAssistantMd(markdown: string) {
    setMessages((m) => [
      ...m,
      { id: newId(), role: "assistant", kind: "markdown", markdown },
    ]);
  }
  function appendTables(r: BillingResult) {
    setMessages((m) => [
      ...m,
      { id: newId(), role: "assistant", kind: "tables", result: r },
    ]);
  }

  async function runCompute(
    dosIso: string,
    county: CountyLabel,
    lineItems: ReturnType<typeof parseBlurb>["lineItems"],
    doctorName?: string,
  ) {
    setPhase("computing");
    const res = await fetch("/api/compute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dosIso, county, lineItems, doctorName }),
    });
    const data = (await res.json()) as
      | { ok: true; result: BillingResult }
      | { ok: false; error: string };
    if (!data.ok) {
      appendAssistant(`Error: ${data.error}`);
      setPhase("error");
      return;
    }
    setResult(data.result);
    appendTables(data.result);

    // Note when an input-side column header was included but has no data
    // beneath it (e.g., user pasted a "Dr. Roush" column with empty cells).
    const otherRows = data.result.otherDoctors.rows;
    if (
      otherRows.length > 0 &&
      otherRows.every((r) => r.drChargeRaw === undefined || r.drChargeRaw === 0)
    ) {
      const drName = data.result.otherDoctors.doctorName || "Dr.";
      appendAssistant(
        `Note: the ${drName} column was included in your input but no dollar amounts were provided in any row.`,
      );
    }

    if (data.result.fcsoFlags.length > 0) {
      appendAssistantMd(renderFcsoWarnings(data.result.fcsoFlags));
    }
    setPhase("done");

    // Save to localStorage for sidebar history.
    saveSession(data.result, originalBlurb);
    onSessionSaved?.();

    // Save the session (or trigger download) in the background.
    const followUpsAtSave = [...followUps];
    fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        blurb: originalBlurb,
        followUps: followUpsAtSave,
        dosIso,
        county,
        lineItems,
      }),
    })
      .then((r) => r.json())
      .then((d: { ok: boolean; mode?: "file" | "download"; filename?: string; markdown?: string; path?: string }) => {
        if (!d.ok) return;
        if (d.mode === "file" && d.path) {
          setSavedNotice(`Session saved to ${d.path}.`);
        }
      })
      .catch(() => {
        /* non-fatal */
      });
  }

  async function handleFirstSubmit(blurb: string) {
    appendUser(blurb);
    setOriginalBlurb(blurb);
    setConversationText(blurb);

    const parsed = parseBlurb(blurb);

    if (parsed.dos && !isDateInRange(parsed.dos)) {
      appendAssistant(
        `Date of service ${isoToDisplay(parsed.dos)} is outside the supported range (2022–2026). Try another DOS.`,
      );
      setPhase("error");
      return;
    }

    if (parsed.followUp) {
      appendAssistant(parsed.followUp);
      setPendingFollowUp(parsed.followUp);
      setPendingConflicts(parsed.conflicts ?? []);
      setPhase("awaiting-followup");
      return;
    }

    if (parsed.dos && parsed.county && parsed.lineItems.length > 0) {
      await runCompute(parsed.dos, parsed.county, parsed.lineItems, parsed.doctorName);
    }
  }

  async function handleFollowUpAnswer(answer: string) {
    appendUser(answer);
    if (pendingFollowUp) {
      setFollowUps((f) => [...f, { question: pendingFollowUp, answer }]);
    }

    // If the pending question was a modifier-conflict prompt, rewrite the
    // conversation text to apply the user's choice before re-parsing.
    let merged: string;
    if (pendingConflicts.length > 0) {
      merged = resolveConflictsInText(conversationText, pendingConflicts, answer);
      setPendingConflicts([]);
    } else {
      merged = `${conversationText}\n${answer}`;
    }
    setConversationText(merged);

    const parsed = parseBlurb(merged);
    if (parsed.dos && !isDateInRange(parsed.dos)) {
      appendAssistant(
        `Date of service ${isoToDisplay(parsed.dos)} is outside the supported range (2022–2026).`,
      );
      setPhase("error");
      return;
    }
    if (parsed.followUp) {
      appendAssistant(parsed.followUp);
      setPendingFollowUp(parsed.followUp);
      setPendingConflicts(parsed.conflicts ?? []);
      setPhase("awaiting-followup");
      return;
    }
    if (parsed.dos && parsed.county && parsed.lineItems.length > 0) {
      setPendingFollowUp(null);
      setPendingConflicts([]);
      await runCompute(parsed.dos, parsed.county, parsed.lineItems, parsed.doctorName);
    }
  }

  function onSubmit(text: string) {
    if (phase === "awaiting-blurb") {
      void handleFirstSubmit(text);
    } else if (phase === "awaiting-followup") {
      void handleFollowUpAnswer(text);
    } else if (phase === "done" || phase === "error") {
      // Start a new case inline without clearing the thread.
      setMessages((m) => [
        ...m,
        {
          id: newId(),
          role: "assistant",
          kind: "text",
          text: "─── New case ───",
        },
      ]);
      setConversationText("");
      setFollowUps([]);
      setOriginalBlurb("");
      setPhase("awaiting-blurb");
      setPendingFollowUp(null);
      setPendingConflicts([]);
      setResult(null);
      setSavedNotice(null);
      onNewCaseExternal?.();
      void handleFirstSubmit(text);
    }
  }

  function onNewCase() {
    onNewCaseExternal?.();
    setMessages([
      {
        id: newId(),
        role: "assistant",
        kind: "text",
        text:
          "New case. Paste a fresh blurb — DOS, county or city, and CPT codes with modifiers.",
      },
    ]);
    setConversationText("");
    setFollowUps([]);
    setOriginalBlurb("");
    setPhase("awaiting-blurb");
    setPendingFollowUp(null);
    setResult(null);
    setSavedNotice(null);
  }

  async function downloadCurrentSession() {
    if (!result) return;
    const lineItems = lineItemsFromDisplay(
      result.surgeon.rows.map((r) => r.cptDisplay),
    );
    const dosIso = (() => {
      const [m, d, y] = result.dosDisplay.split("/");
      return `${y}-${m}-${d}`;
    })();
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        blurb: originalBlurb,
        followUps,
        dosIso,
        county: result.county,
        lineItems,
      }),
    });
    const data = (await res.json()) as {
      ok: boolean;
      mode?: "file" | "download";
      filename?: string;
      markdown?: string;
    };
    if (data.ok && data.markdown && data.filename) {
      downloadMarkdown(data.filename, data.markdown);
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <Toolbar
        onNewCase={onNewCase}
        onDownload={result ? downloadCurrentSession : undefined}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-4">
          {messages.map((m) => (
            <MessageRenderer
              key={m.id}
              msg={m}
              showLocalityToggle={
                m.role === "assistant" &&
                m.kind === "tables" &&
                m.result.locality === "03"
              }
            />
          ))}
          {phase === "computing" ? (
            <MessageBubble role="assistant">
              <span className="text-slate-500 text-sm">Computing…</span>
            </MessageBubble>
          ) : null}
          {savedNotice ? (
            <p className="text-xs text-slate-500 mt-2 text-center">{savedNotice}</p>
          ) : null}
          <div ref={endRef} />
        </div>
      </div>

      <CaseInputBox
        placeholder={
          phase === "awaiting-followup"
            ? "Type your answer…"
            : phase === "computing"
              ? "Computing…"
              : "Paste a case blurb — DOS, county, and CPT codes. Paste another when ready for the next case."
        }
        onSubmit={onSubmit}
        disabled={phase === "computing"}
        multiline={phase === "awaiting-blurb" || phase === "done" || phase === "error"}
      />
    </div>
  );
}

function Toolbar({
  onNewCase,
  onDownload,
}: {
  onNewCase: () => void;
  onDownload?: () => void;
}) {
  return (
    <div className="border-b border-border bg-white">
      <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onNewCase}
          className="h-9 px-3 rounded-md text-sm font-medium border border-border bg-white hover:bg-slate-50"
        >
          + New Case
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={!onDownload}
          className="h-9 px-3 rounded-md text-sm font-medium border border-border bg-white hover:bg-slate-50 disabled:opacity-40"
        >
          Download session log (.md)
        </button>
      </div>
    </div>
  );
}

function MessageRenderer({
  msg,
  showLocalityToggle,
}: {
  msg: Msg;
  showLocalityToggle: boolean;
}) {
  if (msg.role === "user") {
    return <MessageBubble role="user">{msg.text}</MessageBubble>;
  }
  if (msg.kind === "text" && msg.text === "─── New case ───") {
    return (
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 border-t border-border" />
        <span className="text-xs text-slate-400 font-medium">New case</span>
        <div className="flex-1 border-t border-border" />
      </div>
    );
  }
  if (msg.kind === "tables") {
    return <TablesBlock result={msg.result} showLocalityToggle={showLocalityToggle} />;
  }
  if (msg.kind === "markdown") {
    return msg.markdown.includes("FCSO verification needed") ? (
      <FCSOWarning markdown={msg.markdown} />
    ) : (
      <MessageBubble role="assistant" markdown={msg.markdown} />
    );
  }
  return <MessageBubble role="assistant">{msg.text}</MessageBubble>;
}

function TablesBlock({
  result,
  showLocalityToggle,
}: {
  result: BillingResult;
  showLocalityToggle: boolean;
}) {
  const [ascCountyOverride, setAscCountyOverride] = useState<CountyLabel | null>(
    null,
  );
  const [ascResult, setAscResult] = useState<BillingResult>(result);
  const [recomputing, setRecomputing] = useState(false);

  const surgeonMd = useMemo(() => renderSurgeonTable(result), [result]);
  const ascMd = useMemo(() => renderAscTable(ascResult), [ascResult]);
  const otherDoctorsMd = useMemo(() => renderOtherDoctorsTable(result), [result]);

  async function recomputeAscFor(other: CountyLabel) {
    setRecomputing(true);
    const dosIso = (() => {
      const [m, d, y] = result.dosDisplay.split("/");
      return `${y}-${m}-${d}`;
    })();
    const lineItems = lineItemsFromDisplay(
      result.surgeon.rows.map((r) => r.cptDisplay),
    );
    const res = await fetch("/api/compute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dosIso, county: other, lineItems }),
    });
    const data = (await res.json()) as
      | { ok: true; result: BillingResult }
      | { ok: false; error: string };
    setRecomputing(false);
    if (data.ok) {
      setAscResult(data.result);
      setAscCountyOverride(other);
    }
  }

  return (
    <div className="my-2">
      <div className="text-xs text-slate-500 mb-1">
        Resolved as {result.county} (locality {result.locality}, ASC{" "}
        {ascCountyOverride
          ? countyToAscCounty(ascCountyOverride)
          : result.ascCounty}
        ).{" "}
        {showLocalityToggle ? (
          <button
            type="button"
            onClick={() =>
              recomputeAscFor(
                result.county === "Broward" ? "Palm Beach" : "Broward",
              )
            }
            disabled={recomputing}
            className="text-accent underline hover:text-sky-800 disabled:opacity-50"
          >
            {ascCountyOverride
              ? `Reset ASC to ${result.county}`
              : `If ASC was in ${result.county === "Broward" ? "Palm Beach" : "Broward"}, click to recompute`}
          </button>
        ) : null}
        {ascCountyOverride ? (
          <button
            type="button"
            onClick={() => {
              setAscCountyOverride(null);
              setAscResult(result);
            }}
            className="ml-2 text-slate-500 underline"
          >
            Reset
          </button>
        ) : null}
      </div>
      {result.surgeon.rows.length > 0 && (
        <BillingTable
          title="Surgeon Charge"
          markdown={surgeonMd}
          footnote={SURGEON_FOOTNOTE}
          intro="The following table shows the charges for the procedures done in this case for a surgeon coded appropriately at 120% of Medicare and the charges that would have been generated through the Orthopaedic Center of South Florida for these CPT codes."
        />
      )}
      {result.asc.rows.length > 0 && (
        <BillingTable
          title="Surgery Center and Anesthesia Charge"
          markdown={ascMd}
          intro="The following table shows the charges for a surgery center and anesthesia for the procedures in this case coded correctly at 120% of Medicare:"
        />
      )}
      {result.otherDoctors.rows.length > 0 && (
        <BillingTable
          title="Other Doctors Surgeon Charge"
          markdown={otherDoctorsMd}
          intro="Other Doctors Surgeon Charge:"
        />
      )}
    </div>
  );
}

function downloadMarkdown(filename: string, body: string) {
  const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
