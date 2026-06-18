"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
      const ok = copyViaDOM(markdown, intro);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
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

// Strips markdown bold (**…**) and pipe whitespace.
function cleanCell(s: string): string {
  return s.trim().replace(/^\*\*(.*)\*\*$/s, "$1").trim();
}

// Builds a real DOM table and copies it via execCommand so the browser
// generates proper CF_HTML format that Word on Windows reliably pastes
// with all cell content intact.
function copyViaDOM(md: string, intro?: string): boolean {
  const lines = md.split("\n").filter((l) => l.trim().startsWith("|"));
  const rows = lines
    .map((l) =>
      l
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map(cleanCell),
    )
    .filter((r) => !r.every((c) => /^-+$/.test(c) || c === ""));

  if (rows.length === 0) return false;

  const [header, ...body] = rows;

  // Render off-screen so selection doesn't flash.
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-9999px;top:0;";

  if (intro) {
    const p = document.createElement("p");
    p.style.cssText =
      "font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:0 0 8pt 0;";
    p.textContent = intro;
    container.appendChild(p);
  }

  const table = document.createElement("table");
  table.style.cssText =
    "border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const cell of header) {
    const th = document.createElement("th");
    th.style.cssText =
      "border:1px solid #000;padding:4px 8px;text-align:left;font-weight:600;";
    th.textContent = cell;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of body) {
    const isTotals = row[0]?.toUpperCase() === "TOTALS";
    const tr = document.createElement("tr");
    for (const cell of row) {
      const td = document.createElement("td");
      td.style.cssText = `border:1px solid #000;padding:4px 8px;${isTotals ? "font-weight:600;" : ""}`;
      td.textContent = cell;
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
