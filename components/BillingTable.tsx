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

    // === Clipboard strategy overview ===
    //
    // The root problem on Windows + Chrome + Word Desktop:
    //   execCommand("copy") on a DOM element puts TWO formats on the clipboard:
    //   CF_HTML (the actual HTML) and CF_ENHMETAFILE (a Windows Enhanced Metafile —
    //   a vector image of the rendered DOM). Word on Windows prefers EMF over CF_HTML.
    //   The EMF shows table borders (hence the correctly-shaped empty boxes users see)
    //   but contains no text, because the copy element was clipped or hidden during
    //   rendering. Outlook ignores EMF and reads CF_HTML directly (works). Mac has no
    //   EMF format (works). Word Desktop on Windows picks EMF and gets empty cells.
    //
    // Fix for Windows: use ClipboardItem (navigator.clipboard.write), which only puts
    //   text/html and text/plain on the clipboard — no EMF. Word finds no EMF and reads
    //   the HTML correctly.
    //
    // Why execCommand is kept for non-Windows:
    //   Chrome on Windows also has a regression in navigator.clipboard.write() where
    //   text/html loses cell text for Word Online. On Mac/Linux, execCommand is clean
    //   and avoids that path entirely.
    //
    // Diagnostic tip: if empty-cell paste ever reappears, try
    //   Paste Special → Keep Source Formatting in Word.
    //   - If that ALSO shows empty cells → the HTML content itself is wrong.
    //   - If that works but Ctrl+V doesn't → Word is picking the wrong clipboard format
    //     (EMF or RTF taking priority over CF_HTML).

    const isWindows = typeof navigator !== "undefined" &&
      /Win/i.test(navigator.platform || navigator.userAgent);

    if (!isWindows) {
      // Non-Windows (Mac, Linux): execCommand produces clean CF_HTML with no EMF.
      const domOk = copyViaDOM(html);
      if (domOk) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        return;
      }
    }

    // Windows primary path (and universal fallback): ClipboardItem with text/html only.
    // No DOM element is created, so no EMF is generated. Word Desktop reads CF_HTML.
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
      // fall through
    }

    // Windows fallback: execCommand (in case ClipboardItem is blocked).
    if (isWindows) {
      const domOk = copyViaDOM(html);
      if (domOk) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        return;
      }
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
 *
 * The element is clipped to 1×1 px via overflow:hidden rather than hidden
 * with visibility:hidden. Chrome on Windows stopped serialising text nodes
 * from visibility:hidden elements into CF_HTML (the format Word desktop reads)
 * in some builds — execCommand() still returns true but Word receives empty
 * cells. The overflow:hidden clip keeps the element fully in the layout and
 * render tree so all text nodes are captured, while preventing any flash.
 *
 * Diagnostic tip: if empty-cell paste re-appears, test in Word with
 * Paste Special → Keep Source Formatting. If *that* also produces empty cells
 * the HTML content itself is the problem; if it works, the issue is in how the
 * browser is negotiating the clipboard format with Word (CF_HTML vs. RTF).
 *
 * History of discarded approaches:
 *  - left:-9999px   → Chromium paint-clips off-screen elements, strips CF_HTML text
 *  - opacity:0      → same paint-clip issue on some Windows Chrome builds
 *  - visibility:hidden → was working, broke silently with a Chrome/Windows update;
 *                        structure arrives in Word correctly but text nodes are lost
 */
function copyViaDOM(html: string): boolean {
  if (typeof document === "undefined") return false;

  const container = document.createElement("div");
  // overflow:hidden at 1×1px clips the element visually while keeping it fully
  // in the layout/render tree so Chrome includes all text in the CF_HTML payload.
  container.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;pointer-events:none;";
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
