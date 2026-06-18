"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cleanCell, buildWordHtml, buildPlainText } from "@/lib/wordClipboard";

interface Props {
  title: string;
  /** Raw markdown — copied verbatim by the Copy button. */
  markdown: string;
  /** Optional footnote rendered below the table in italic small text. */
  footnote?: string;
  /** Optional intro paragraph copied above the table when the user clicks Copy. */
  intro?: string;
}

export default function BillingTable({ title, markdown, footnote, intro }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      // Primary: execCommand with a fully-rendered DOM table.
      // Each cell gets a <p> child — Word requires paragraph containers
      // inside cells; a bare text node is silently discarded on Windows.
      // opacity:0 keeps the element in the render tree so the browser
      // fully lays it out before execCommand serialises it to CF_HTML.
      const domOk = copyViaDOM(markdown, intro);
      if (domOk) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        return;
      }

      // Fallback: ClipboardItem with explicit Word-compatible HTML.
      const html = buildWordHtml(markdown, intro);
      const text = buildPlainText(markdown, intro);
      if (html && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <section className="bg-white border border-border rounded-lg shadow-card my-3 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-slate-50">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <button
          type="button"
          onClick={copy}
          className="h-9 px-3 rounded-md text-sm font-medium border border-border bg-white hover:bg-slate-50"
          aria-label={`Copy ${title} as markdown`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </header>
      <div className="overflow-x-auto px-4 py-3">
        <div className="md-table">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </div>
        {footnote ? (
          <p className="text-xs italic text-slate-500 mt-2">{footnote}</p>
        ) : null}
      </div>
    </section>
  );
}

function copyViaDOM(md: string, intro?: string): boolean {
  const lines = md.split("\n").filter((l) => l.trim().startsWith("|"));
  const rawRows = lines.map((l) =>
    l
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((c) => c.trim()),
  );
  const nonSepRows = rawRows.filter(
    (r) => !r.every((c) => /^-+$/.test(c) || c === ""),
  );
  if (nonSepRows.length === 0) return false;

  const [headerRow, ...bodyRows] = nonSepRows;

  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;top:0;left:-9999px;pointer-events:none;";

  if (intro) {
    const p = document.createElement("p");
    p.style.cssText =
      "font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:0 0 8pt 0;";
    p.textContent = intro;
    container.appendChild(p);
  }

  const table = document.createElement("table");
  table.setAttribute("border", "1");
  table.setAttribute("cellspacing", "0");
  table.setAttribute("cellpadding", "0");
  table.style.cssText =
    "border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;";

  const thead = document.createElement("thead");
  const headerTr = document.createElement("tr");
  for (const rawCell of headerRow) {
    const th = document.createElement("th");
    th.style.cssText =
      "border:1px solid #000;padding:4px 8px;text-align:left;font-weight:600;background-color:white;color:#000;";
    const p = document.createElement("p");
    p.style.margin = "0";
    p.textContent = cleanCell(rawCell);
    th.appendChild(p);
    headerTr.appendChild(th);
  }
  thead.appendChild(headerTr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of bodyRows) {
    const isTotals = cleanCell(row[0] ?? "").toUpperCase() === "TOTALS";
    const tr = document.createElement("tr");
    for (const rawCell of row) {
      const td = document.createElement("td");
      td.style.cssText = `border:1px solid #000;padding:4px 8px;background-color:white;color:#000;${
        isTotals ? "font-weight:600;" : ""
      }`;
      const p = document.createElement("p");
      p.style.margin = "0";
      p.textContent = cleanCell(rawCell);
      td.appendChild(p);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);

  document.body.appendChild(container);

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(container);
  selection?.removeAllRanges();
  selection?.addRange(range);

  const result = document.execCommand("copy");

  selection?.removeAllRanges();
  document.body.removeChild(container);

  return result;
}
