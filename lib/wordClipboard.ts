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
 * This is intentionally identical to the last known-working version (fbde7fb).
 * Any structural divergence from that version has been shown to break Word Online
 * paste (either empty cells or loose-paragraph rendering).
 *
 * Rules:
 *  - Plain HTML fragment — no <html>/<head>/<body> wrapper (breaks Word Online)
 *  - No Office xmlns (breaks Word Online paste handler)
 *  - No <p> inside cells (Word Online treats them as block elements, splits table)
 *  - border on <table> element (not border="1" attribute) — exact working style
 *  - Direct text nodes in cells — Word Online handles these via ClipboardItem
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

  const tableHtml =
    `<table style="border-collapse:collapse;border:1px solid #000;` +
    `font-family:Calibri,Arial,sans-serif;font-size:11pt;">` +
    thead +
    tbody +
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
