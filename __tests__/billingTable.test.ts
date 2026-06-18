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
    const hasSeparator = rows.some((r) => r.every((c) => /^-+$/.test(c) || c === ""));
    expect(hasSeparator).toBe(false);
  });
  it("returns header + 3 data rows", () => {
    const rows = parseMarkdownTable(SAMPLE_MD);
    expect(rows).toHaveLength(4); // header + 2 data + totals
  });
  it("strips bold from totals row", () => {
    const rows = parseMarkdownTable(SAMPLE_MD);
    const totals = rows[rows.length - 1];
    expect(totals[0]).toBe("TOTALS");
    expect(totals[2]).toBe("$8,434");
  });
});

describe("buildWordHtml", () => {
  it("includes Office xmlns namespace declarations", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).toContain('xmlns:w="urn:schemas-microsoft-com:office:word"');
    expect(html).toContain('xmlns:o="urn:schemas-microsoft-com:office:office"');
  });

  it("includes HTML border attribute on table", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).toContain('border="1"');
  });

  it("wraps header cells in <p>", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).toContain("<p>DATE</p>");
    expect(html).toContain("<p>CPT CODE</p>");
    expect(html).toContain("<p>120% MEDICARE</p>");
    expect(html).toContain("<p>OCSF CHARGE</p>");
  });

  it("wraps data cells in <p>", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).toContain("<p>04/12/2024</p>");
    expect(html).toContain("<p>27447</p>");
    expect(html).toContain("<p>$5,234</p>");
    expect(html).toContain("<p>$8,900</p>");
  });

  it("wraps bold totals cells in <p><strong>", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).toContain("<p><strong>TOTALS</strong></p>");
    expect(html).toContain("<p><strong>$8,434</strong></p>");
    expect(html).toContain("<p><strong>$12,500</strong></p>");
  });

  it("excludes the separator row", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).not.toContain("------");
    expect(html).not.toContain("---");
  });

  it("returns empty string for empty input", () => {
    expect(buildWordHtml("")).toBe("");
    expect(buildWordHtml("no pipes here")).toBe("");
  });

  it("includes intro paragraph when provided", () => {
    const html = buildWordHtml(SAMPLE_MD, "Patient: John Doe");
    expect(html).toContain("Patient: John Doe");
  });

  it("escapes HTML special characters in cell content", () => {
    const md = `| A & B | C < D |\n| --- | --- |\n| x > y | z |`;
    const html = buildWordHtml(md);
    expect(html).toContain("A &amp; B");
    expect(html).toContain("C &lt; D");
    expect(html).toContain("x &gt; y");
  });
});

describe("buildPlainText", () => {
  it("produces tab-delimited rows", () => {
    const text = buildPlainText(SAMPLE_MD);
    const lines = text.split("\n");
    expect(lines[0]).toBe("DATE\tCPT CODE\t120% MEDICARE\tOCSF CHARGE");
    expect(lines[1]).toBe("04/12/2024\t27447\t$5,234\t$8,900");
  });

  it("prepends intro when provided", () => {
    const text = buildPlainText(SAMPLE_MD, "Patient: Doe");
    expect(text.startsWith("Patient: Doe\n\n")).toBe(true);
  });
});
