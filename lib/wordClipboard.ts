// Pure helpers for generating Word-compatible clipboard content.
// No DOM dependencies — safe to import in tests and server components.

// Strips markdown bold (**…**) and surrounding whitespace.
export function cleanCell(s: string): string {
  return s.trim().replace(/^\*\*(.*)\*\*$/s, "$1").trim();
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Returns true when the markdown row is a separator (---|---).
function isSeparatorRow(cells: string[]): boolean {
  return cells.every((c) => /^-+$/.test(c) || c === "");
}

// Parses a pipe-delimited markdown table into rows of cleaned cells.
export function parseMarkdownTable(md: string): string[][] {
  return md
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .map((l) =>
      l
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map(cleanCell),
    )
    .filter((r) => !isSeparatorRow(r));
}

/**
 * Builds the HTML table fragment for clipboard.
 *
 * Target environments, in priority order:
 *   1. Word Desktop on Windows  — most restrictive renderer; needs explicit widths,
 *      HTML4 table attributes, flat <tr> structure (no <thead>/<tbody>), and
 *      mso-* CSS so Word's HTML importer doesn't collapse cells to zero width.
 *   2. Word Desktop on Mac      — more lenient; shares the same HTML here.
 *   3. Outlook on Windows       — reads CF_HTML; tolerant of this markup.
 *   4. Word Online              — handled via ClipboardItem; tolerant of this markup.
 *
 * Key rules (do not change without testing all four targets):
 *   - No <html>/<head>/<body> wrapper — breaks Word Online paste handler.
 *   - No Office xmlns — breaks Word Online paste handler.
 *   - No <p> inside cells — Word Online treats as block, splits the table.
 *   - HTML4 border/cellspacing/cellpadding attributes on <table> — Word Desktop
 *     ignores CSS border-collapse:collapse but does honour these attributes.
 *   - Explicit percentage width on every <td>/<th> — without this, Word Desktop's
 *     HTML importer collapses columns to the border width, producing the "tall empty
 *     box" symptom (structure visible, no content readable).
 *   - Flat <tr> rows directly inside <table> — no <thead>/<tbody> — some Word
 *     Desktop builds mishandle those tags and mis-render the row order.
 *   - mso-border-alt and mso-padding-alt CSS — these are the Word-native equivalents
 *     of border and padding; including them ensures Word's importer applies them even
 *     when it ignores the standard CSS properties.
 *
 * Diagnostic tip: if empty-cell paste reappears in Word, try
 *   Paste Special → Keep Source Formatting.
 *   - Works  → Word was picking a richer clipboard format (EMF/RTF) over CF_HTML.
 *     Fix: ensure Windows path uses ClipboardItem (no EMF generated).
 *   - Still empty → the HTML content itself is the problem; check the rules above.
 */
export function buildWordHtml(md: string, intro?: string): string {
  const lines = md.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length === 0) return "";

  const rows = lines.map((l) =>
    l
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map(cleanCell),
  );

  const dataRows = rows.filter((r) => !isSeparatorRow(r));
  if (dataRows.length === 0) return "";

  const [header, ...body] = dataRows;
  const colCount = header.length;
  const colPct = colCount > 0 ? Math.floor(100 / colCount) : 100;

  // Explicit per-cell width keeps Word Desktop from collapsing columns to zero.
  const thStyle =
    `border:1px solid #000;` +
    `mso-border-alt:solid #000 .75pt;` +
    `padding:4px 8px;` +
    `mso-padding-alt:4px 8px;` +
    `text-align:left;` +
    `font-weight:600;` +
    `width:${colPct}%;`;

  const tdStyle = (bold: boolean) =>
    `border:1px solid #000;` +
    `mso-border-alt:solid #000 .75pt;` +
    `padding:4px 8px;` +
    `mso-padding-alt:4px 8px;` +
    `width:${colPct}%;` +
    (bold ? "font-weight:600;" : "");

  // Flat structure — no <thead>/<tbody> — for maximum Word Desktop compatibility.
  const headerRow =
    "<tr>" +
    header.map((c) => `<th style="${thStyle}">${escapeHtml(c)}</th>`).join("") +
    "</tr>";

  const bodyRows = body
    .map((r) => {
      const isTotals = r[0]?.toUpperCase() === "TOTALS";
      return (
        "<tr>" +
        r.map((c) => `<td style="${tdStyle(isTotals)}">${escapeHtml(c)}</td>`).join("") +
        "</tr>"
      );
    })
    .join("");

  // border/cellspacing/cellpadding HTML4 attributes + CSS — Word Desktop honours
  // the attributes even when it ignores border-collapse:collapse in CSS.
  const tableHtml =
    `<table border="1" cellspacing="0" cellpadding="0" width="100%" ` +
    `style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;` +
    `mso-table-lspace:0pt;mso-table-rspace:0pt;">` +
    headerRow +
    bodyRows +
    `</table>`;

  const introHtml = intro
    ? `<p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:0 0 8pt 0;">${escapeHtml(intro)}</p>`
    : "";

  return introHtml + tableHtml;
}

// Tab-delimited plain-text fallback for clipboard.
export function buildPlainText(md: string, intro?: string): string {
  const rows = parseMarkdownTable(md);
  const tableText = rows.map((r) => r.join("\t")).join("\n");
  return intro ? `${intro}\n\n${tableText}` : tableText;
}
