// Pure helpers for generating Word-compatible clipboard content.
// No DOM dependencies — safe to import in tests and server components.

// Strips markdown bold (**…**) and surrounding whitespace.
export function cleanCell(s: string): string {
  return s.trim().replace(/^\*\*(.*)\*\*$/s, "$1").trim();
}

function escapeHtml(s: string): string {
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
// Strips the separator row and empty leading/trailing pipe artifacts.
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

// Returns true when a cell value came from markdown bold (used for Totals row).
function isBold(raw: string): boolean {
  return /^\*\*.*\*\*$/.test(raw.trim());
}

// Parses the raw (pre-cleanCell) cells from a line to detect bold markup.
function parseRawCells(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

/**
 * Builds a clean HTML table for ClipboardItem paste into Word Online and
 * desktop Word.
 *
 * Design rationale:
 *  - NO Office xmlns (xmlns:w/xmlns:o) — those activate desktop Word's legacy
 *    HTML importer but confuse Word Online's browser-based paste handler,
 *    causing cells to be dropped or rendered as loose paragraphs.
 *  - NO <p> wrapper inside cells — Word Online treats <p> inside <td> as a
 *    block element and may split it out of the table, producing loose text.
 *    Direct text nodes in <td> work for both Word Online and desktop Word
 *    when delivered via ClipboardItem (as opposed to execCommand, where bare
 *    text nodes can be lost).
 *  - border="1" + cellpadding HTML attributes — Word (both versions) reads
 *    HTML attributes for table layout, not just CSS.
 *  - background-color:white + color:black explicit on every cell — prevents
 *    Word from applying default gray shading.
 *  - <strong> for bold totals row — universally understood by both versions.
 */
export function buildWordHtml(md: string, intro?: string): string {
  const lines = md.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length === 0) return "";

  const rawRows = lines.map(parseRawCells);
  const nonSepLines = lines.filter((_, i) => !isSeparatorRow(rawRows[i]));
  if (nonSepLines.length === 0) return "";

  const [headerLine, ...bodyLines] = nonSepLines;
  const headerCells = parseRawCells(headerLine);

  const thStyle =
    "border:1px solid black;padding:6px 8px;background-color:white;" +
    "color:black;font-weight:bold;text-align:left;";
  const tdStyle =
    "border:1px solid black;padding:6px 8px;background-color:white;color:black;";
  const tdBoldStyle = tdStyle + "font-weight:bold;";

  const thead =
    "<thead><tr>" +
    headerCells
      .map((c) => `<th style="${thStyle}">${escapeHtml(cleanCell(c))}</th>`)
      .join("") +
    "</tr></thead>";

  const tbody =
    "<tbody>" +
    bodyLines
      .map((line) => {
        const cells = parseRawCells(line);
        const isTotal = cleanCell(cells[0] ?? "").toUpperCase() === "TOTALS";
        return (
          "<tr>" +
          cells
            .map((c) => {
              const clean = cleanCell(c);
              const style = isTotal ? tdBoldStyle : tdStyle;
              const content = isBold(c)
                ? `<strong>${escapeHtml(clean)}</strong>`
                : escapeHtml(clean);
              return `<td style="${style}">${content}</td>`;
            })
            .join("") +
          "</tr>"
        );
      })
      .join("") +
    "</tbody>";

  const tableHtml =
    `<table border="1" cellspacing="0" cellpadding="0" ` +
    `style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;` +
    `font-size:11pt;background-color:white;">` +
    thead +
    tbody +
    `</table>`;

  const introHtml = intro
    ? `<p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;` +
      `margin:0 0 8pt 0;">${escapeHtml(intro)}</p>`
    : "";

  // Return a bare fragment (no <html><head><body> wrapper).
  // Word Online's paste handler receives this as a text/html ClipboardItem and
  // renders it inline — wrapping in a full document envelope breaks the table
  // paste (regression introduced in bf43966). Desktop Word also handles plain
  // fragments fine via ClipboardItem.
  return `${introHtml}${tableHtml}`;
}

// Tab-delimited plain-text fallback for clipboard.
export function buildPlainText(md: string, intro?: string): string {
  const rows = parseMarkdownTable(md);
  const tableText = rows.map((r) => r.join("\t")).join("\n");
  return intro ? `${intro}\n\n${tableText}` : tableText;
}
