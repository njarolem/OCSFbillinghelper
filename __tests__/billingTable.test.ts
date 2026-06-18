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

describe("buildWordHtml — Office namespace & structure", () => {
  it("includes Office xmlns namespace declarations", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).toContain('xmlns:w="urn:schemas-microsoft-com:office:word"');
    expect(html).toContain('xmlns:o="urn:schemas-microsoft-com:office:office"');
  });

  it("includes HTML border attribute on table", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).toContain('border="1"');
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

describe("buildWordHtml — cell content (empty-cell bug regression)", () => {
  it("wraps header cells in <p style=\"margin:0;\">", () => {
    const html = buildWordHtml(SAMPLE_MD);
    // Cells must use <p style="margin:0;"> so Word renders text, not an empty-looking paragraph
    expect(html).toContain('<p style="margin:0;">DATE</p>');
    expect(html).toContain('<p style="margin:0;">CPT CODE</p>');
    expect(html).toContain('<p style="margin:0;">120% MEDICARE</p>');
    expect(html).toContain('<p style="margin:0;">OCSF CHARGE</p>');
  });

  it("wraps data cells in <p style=\"margin:0;\">", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).toContain('<p style="margin:0;">04/12/2024</p>');
    expect(html).toContain('<p style="margin:0;">27447</p>');
    expect(html).toContain('<p style="margin:0;">$5,234</p>');
    expect(html).toContain('<p style="margin:0;">$8,900</p>');
  });

  it("wraps bold totals cells in <p style=\"margin:0;\"><strong>", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).toContain('<p style="margin:0;"><strong>TOTALS</strong></p>');
    expect(html).toContain('<p style="margin:0;"><strong>$8,434</strong></p>');
    expect(html).toContain('<p style="margin:0;"><strong>$12,500</strong></p>');
  });
});

describe("buildWordHtml — white background (gray-shading bug regression)", () => {
  it("sets background-color:white on <th> cells", () => {
    const html = buildWordHtml(SAMPLE_MD);
    // Every <th> must have explicit white background so Word doesn't shade it gray
    const thMatches = [...html.matchAll(/<th style="([^"]+)"/g)];
    expect(thMatches.length).toBeGreaterThan(0);
    for (const m of thMatches) {
      expect(m[1]).toContain("background-color:white");
    }
  });

  it("sets background-color:white on <td> cells", () => {
    const html = buildWordHtml(SAMPLE_MD);
    const tdMatches = [...html.matchAll(/<td style="([^"]+)"/g)];
    expect(tdMatches.length).toBeGreaterThan(0);
    for (const m of tdMatches) {
      expect(m[1]).toContain("background-color:white");
    }
  });

  it("sets color:#000 on <th> cells", () => {
    const html = buildWordHtml(SAMPLE_MD);
    const thMatches = [...html.matchAll(/<th style="([^"]+)"/g)];
    for (const m of thMatches) {
      expect(m[1]).toContain("color:#000");
    }
  });

  it("sets color:#000 on <td> cells", () => {
    const html = buildWordHtml(SAMPLE_MD);
    const tdMatches = [...html.matchAll(/<td style="([^"]+)"/g)];
    for (const m of tdMatches) {
      expect(m[1]).toContain("color:#000");
    }
  });

  it("does NOT set a gray background on any cell", () => {
    const html = buildWordHtml(SAMPLE_MD);
    // Previously used background:#f0f0f0 on <th> which caused gray shading in Word
    expect(html).not.toContain("#f0f0f0");
    expect(html).not.toContain("background:#");
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
