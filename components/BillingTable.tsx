"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { buildWordHtml, buildPlainText } from "@/lib/wordClipboard";

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
    const html = buildWordHtml(markdown, intro);
    const text = buildPlainText(markdown, intro);

    // Primary: async Clipboard API with both formats.
    // text/html  → Word for the web, Word Desktop, Outlook all read this.
    // text/plain → tab-delimited fallback; user can run Convert Text to Table.
    // No DOM element is created so no CF_ENHMETAFILE (Windows Enhanced Metafile)
    // is placed on the clipboard — EMF was the root cause of the empty-box symptom
    // in Word Desktop on Windows when execCommand was used instead.
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      return;
    } catch {
      // ClipboardItem unavailable or permission denied — fall through to plain text.
    }

    // Fallback: plain text only (tab-delimited).
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — nothing more we can do
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
          aria-label={`Copy ${title} as table`}
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
