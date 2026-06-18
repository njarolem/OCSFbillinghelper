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

function cellHtml(rawCell: string, tag: "th" | "td", extraStyle = ""): string {
  // background-color:white and color:#000 must be explicit — Word on Windows
  // applies its own gray shading and may use a light theme color when absent.
  const base =
    "border:1px solid #000;padding:4px 8px;background-color:white;color:#000;" +
    (tag === "th" ? "font-weight:600;" : "") +
    extraStyle;
  const clean = cleanCell(rawCell);
  // margin:0 on <p> prevents Word from rendering extra blank space above/below
  // the text, which can make cells appear visually empty.
  const inner = isBold(rawCell)
    ? `<p style="margin:0;"><strong>${escapeHtml(clean)}</strong></p>`
    : `<p style="margin:0;">${escapeHtml(clean)}</p>`;
  return `<${tag} style="${base}">${inner}</${tag}>`;
}

/**
 * Builds a Word-compatible HTML string from a pipe-delimited markdown table.
 * Key requirements satisfied:
 *  - xmlns namespace declarations activate Word's full HTML import filter
 *  - border/cellspacing/cellpadding HTML attributes (Word reads attributes, not just CSS)
 *  - Every cell contains <p style="margin:0;">text</p> — Word discards bare text nodes
 *  - background-color:white + color:#000 override Word's default gray shading
 *  - Bold totals rows use <strong> inside the <p>
 */
export function buildWordHtml(md: string, intro?: string): string {
  const lines = md.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length === 0) return "";

  // Separate header, separator, and body lines while preserving raw markup.
  const rawRows = lines.map(parseRawCells);
  const nonSepLines = lines.filter(
    (_, i) => !isSeparatorRow(rawRows[i]),
  );
  if (nonSepLines.length === 0) return "";

  const [headerLine, ...bodyLines] = nonSepLines;
  const headerCells = parseRawCells(headerLine);

  const thead =
    "<thead><tr>" +
    headerCells.map((c) => cellHtml(c, "th")).join("") +
    "</tr></thead>";

  const tbody =
    "<tbody>" +
    bodyLines
      .map((line) => {
        const cells = parseRawCells(line);
        return (
          "<tr>" +
          cells.map((c) => cellHtml(c, "td")).join("") +
          "</tr>"
        );
      })
      .join("") +
    "</tbody>";

  const tableHtml =
    `<table border="1" cellspacing="0" cellpadding="0" ` +
    `style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;background-color:white;">` +
    thead +
    tbody +
    `</table>`;

  const introHtml = intro
    ? `<p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:0 0 8pt 0;">${escapeHtml(intro)}</p>`
    : "";

  return (
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:w="urn:schemas-microsoft-com:office:word" ` +
    `xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8"></head>` +
    `<body>${introHtml}${tableHtml}</body>` +
    `</html>`
  );
}

// Tab-delimited plain-text fallback for clipboard.
export function buildPlainText(md: string, intro?: string): string {
  const rows = parseMarkdownTable(md);
  const tableText = rows.map((r) => r.join("\t")).join("\n");
  return intro ? `${intro}\n\n${tableText}` : tableText;
}
