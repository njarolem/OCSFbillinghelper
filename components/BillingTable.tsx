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

    // Strategy 1 (PRIMARY): execCommand("copy") from a visibility:hidden element.
    //
    // Why primary: Chrome on Windows has a regression in navigator.clipboard.write()
    // where text/html content loses cell text during the HTML→CF_HTML→HTML round-trip
    // (cells arrive with correct structure but empty content in Word Online).
    // execCommand("copy") bypasses that path — the browser serialises the live DOM
    // directly to CF_HTML, which preserves all text nodes.
    //
    // Why visibility:hidden (not left:-9999px or opacity:0):
    // - left:-9999px: Chromium paint-clips off-screen elements, stripping text from CF_HTML
    // - opacity:0: same issue on some Windows builds
    // - visibility:hidden at top:0/left:0: element is in the layout tree and fully
    //   rendered at the correct position; only the paint output is suppressed.
    //   The DOM serialiser used by execCommand sees all text nodes.
    const domOk = copyViaDOM(html);
    if (domOk) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      return;
    }

    // Strategy 2 (FALLBACK): ClipboardItem with text/html.
    // Used when execCommand is unavailable or blocked (some Firefox configs).
    try {
      if (html && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        return;
      }
    } catch {
      // fall through to plain text
    }

    // Strategy 3: plain text last resort.
    try {
      await navigator.clipboard.writeText(text);
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

/**
 * Copies an HTML string to the clipboard via execCommand("copy").
 * The element is rendered at position (0,0) with visibility:hidden so Chrome
 * fully lays it out and serialises all text nodes into CF_HTML, then it is
 * removed before the user can see it.
 */
function copyViaDOM(html: string): boolean {
  if (typeof document === "undefined") return false;

  const container = document.createElement("div");
  // visibility:hidden keeps the element in the layout/render tree so the
  // browser includes all text when serialising to CF_HTML for the clipboard.
  container.style.cssText =
    "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;";
  container.innerHTML = html;
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
