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
}

export default function BillingTable({ title, markdown, footnote }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      const { html, text } = mdTableToHtmlAndText(markdown);
      if (
        typeof ClipboardItem !== "undefined" &&
        navigator.clipboard?.write
      ) {
        const item = new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        });
        await navigator.clipboard.write([item]);
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

// Strips markdown bold (**…**) and pipe whitespace.
function cleanCell(s: string): string {
  return s.trim().replace(/^\*\*(.*)\*\*$/s, "$1").trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Converts our generated markdown tables into a real HTML <table> (so Word
// pastes them as an actual table) and a tab-delimited plain-text fallback.
function mdTableToHtmlAndText(md: string): { html: string; text: string } {
  const lines = md.split("\n").filter((l) => l.trim().startsWith("|"));
  const rows = lines.map((l) =>
    l
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map(cleanCell),
  );

  // Drop the markdown separator row (---|---).
  const dataRows = rows.filter((r) => !r.every((c) => /^-+$/.test(c) || c === ""));
  if (dataRows.length === 0) return { html: "", text: md };

  const [header, ...body] = dataRows;

  const thead =
    "<thead><tr>" +
    header
      .map(
        (c) =>
          `<th style="border:1px solid #000;padding:4px 8px;text-align:left;font-weight:600;">${escapeHtml(c)}</th>`,
      )
      .join("") +
    "</tr></thead>";

  const tbody =
    "<tbody>" +
    body
      .map((r) => {
        const isTotals = r[0]?.toUpperCase() === "TOTALS";
        const cells = r
          .map((c) => {
            const style = `border:1px solid #000;padding:4px 8px;${isTotals ? "font-weight:600;" : ""}`;
            return `<td style="${style}">${escapeHtml(c)}</td>`;
          })
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("") +
    "</tbody>";

  const html =
    `<table style="border-collapse:collapse;border:1px solid #000;font-family:Calibri,Arial,sans-serif;font-size:11pt;">${thead}${tbody}</table>`;

  const text = dataRows.map((r) => r.join("\t")).join("\n");

  return { html, text };
}
