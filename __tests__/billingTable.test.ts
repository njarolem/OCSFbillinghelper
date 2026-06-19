import { describe, it, expect } from "vitest";
import {
  buildWordHtml,
  buildPlainText,
  parseMarkdownTable,
  cleanCell,
} from "@/lib/wordClipboard";

const SAMPLE_MD = `
| DATE | CPT CODE | 120% MEDICARE | OCSF CHARGE |
| ------ | ---------- | --------------- | ------------- |
| 04/12/2024 | 27447 | $5,234 | $8,900 |
| 04/12/2024 | 27130 | $3,200 | $3,600 |
| **TOTALS** |  | **$8,434** | **$12,500** |
`.trim();

describe("cleanCell", () => {
  it("strips bold markers", () => {
    expect(cleanCell("**TOTALS**")).toBe("TOTALS");
    expect(cleanCell("**$8,434**")).toBe("$8,434");
  });
  it("trims whitespace", () => {
    expect(cleanCell("  DATE  ")).toBe("DATE");
  });
  it("leaves plain text unchanged", () => {
    expect(cleanCell("$5,234")).toBe("$5,234");
  });
});

describe("parseMarkdownTable", () => {
  it("drops the separator row", () => {
    const rows = parseMarkdownTable(SAMPLE_MD);
    expect(rows.some((r) => r.every((c) => /^-+$/.test(c) || c === ""))).toBe(false);
  });
  it("returns header + 3 data rows", () => {
    expect(parseMarkdownTable(SAMPLE_MD)).toHaveLength(4);
  });
  it("strips bold from totals row", () => {
    const rows = parseMarkdownTable(SAMPLE_MD);
    expect(rows[rows.length - 1][0]).toBe("TOTALS");
    expect(rows[rows.length - 1][2]).toBe("$8,434");
  });
});

describe("buildWordHtml — exact fbde7fb structure (last known working)", () => {
  it("produces a bare fragment — no <html>/<head>/<body> wrapper", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).not.toContain("<html");
    expect(html).not.toContain("<head");
    expect(html).not.toContain("<body");
  });

  it("has no Office xmlns (breaks Word Online)", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).not.toContain("xmlns:w");
    expect(html).not.toContain("xmlns:o");
  });

  it("has no <p> inside cells (breaks Word Online table structure)", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).not.toMatch(/<t[dh][^>]*><p/);
    expect(html).not.toContain("<p>");
  });

  it("uses border on the <table> element (exact working style)", () => {
    const html = buildWordHtml(SAMPLE_MD);
    // border:1px solid #000 appears on every <th>/<td> via inline style.
    // The <table> itself now uses the HTML4 border="1" attribute + border-collapse
    // in CSS — this is intentional for Word Desktop on Windows compatibility.
    expect(html).toContain('border:1px solid #000');
    expect(html).toMatch(/<table\s[^>]*border="1"/);
    expect(html).toContain('border-collapse:collapse');
  });

  it("header cells contain text directly", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).toContain(">DATE<");
    expect(html).toContain(">CPT CODE<");
    expect(html).toContain(">120% MEDICARE<");
    expect(html).toContain(">OCSF CHARGE<");
  });

  it("data cells contain text directly", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).toContain(">04/12/2024<");
    expect(html).toContain(">27447<");
    expect(html).toContain(">$5,234<");
    expect(html).toContain(">$8,900<");
  });

  it("totals row text is present (bold stripped)", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).toContain(">TOTALS<");
    expect(html).toContain(">$8,434<");
    expect(html).toContain(">$12,500<");
  });

  it("totals row has font-weight:600", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).toContain("font-weight:600");
  });

  it("returns empty string for empty input", () => {
    expect(buildWordHtml("")).toBe("");
    expect(buildWordHtml("no pipes here")).toBe("");
  });

  it("includes intro paragraph when provided", () => {
    const html = buildWordHtml(SAMPLE_MD, "Patient: John Doe");
    expect(html).toContain("Patient: John Doe");
    expect(html).toContain("<p style=");
  });

  it("escapes HTML special characters", () => {
    const md = `| A & B | C < D |\n| --- | --- |\n| x > y | z |`;
    const html = buildWordHtml(md);
    expect(html).toContain("A &amp; B");
    expect(html).toContain("C &lt; D");
    expect(html).toContain("x &gt; y");
  });

  it("separator row is excluded", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).not.toContain("------");
    expect(html).not.toContain("---");
  });
});

describe("buildPlainText", () => {
  it("produces tab-delimited rows", () => {
    const text = buildPlainText(SAMPLE_MD);
    expect(text.split("\n")[0]).toBe("DATE\tCPT CODE\t120% MEDICARE\tOCSF CHARGE");
    expect(text.split("\n")[1]).toBe("04/12/2024\t27447\t$5,234\t$8,900");
  });

  it("prepends intro when provided", () => {
    expect(buildPlainText(SAMPLE_MD, "Patient: Doe").startsWith("Patient: Doe\n\n")).toBe(true);
  });
});
