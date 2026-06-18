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

describe("buildWordHtml — structure", () => {
  it("includes HTML border attribute on table (Word Online reads attributes)", () => {
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

describe("buildWordHtml — Word Online compatibility (no xmlns, no <p> in cells, no doc envelope)", () => {
  it("does NOT include Office xmlns (breaks Word Online paste handler)", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).not.toContain("xmlns:w");
    expect(html).not.toContain("xmlns:o");
    expect(html).not.toContain("urn:schemas-microsoft-com");
  });

  it("does NOT wrap in <html><head><body> envelope (breaks Word Online table paste)", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).not.toContain("<html");
    expect(html).not.toContain("<head");
    expect(html).not.toContain("<body");
  });

  it("does NOT wrap cell text in <p> tags (Word Online splits them out of the table)", () => {
    const html = buildWordHtml(SAMPLE_MD);
    // <p> inside <td> causes Word Online to render cells as loose paragraphs
    expect(html).not.toMatch(/<td[^>]*><p/);
    expect(html).not.toMatch(/<th[^>]*><p/);
  });

  it("places data directly in <th> cells", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).toContain(">DATE<");
    expect(html).toContain(">CPT CODE<");
    expect(html).toContain(">120% MEDICARE<");
    expect(html).toContain(">OCSF CHARGE<");
  });

  it("places data directly in <td> cells", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).toContain(">04/12/2024<");
    expect(html).toContain(">27447<");
    expect(html).toContain(">$5,234<");
    expect(html).toContain(">$8,900<");
  });

  it("wraps bold totals in <strong> only (no <p>)", () => {
    const html = buildWordHtml(SAMPLE_MD);
    expect(html).toContain("<strong>TOTALS</strong>");
    expect(html).toContain("<strong>$8,434</strong>");
    expect(html).toContain("<strong>$12,500</strong>");
    expect(html).not.toContain("<p>");
  });
});

describe("buildWordHtml — white background (gray-shading regression)", () => {
  it("sets background-color:white on <th> cells", () => {
    const html = buildWordHtml(SAMPLE_MD);
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

  it("sets color:black on all cells", () => {
    const html = buildWordHtml(SAMPLE_MD);
    const cellMatches = [...html.matchAll(/<t[dh] style="([^"]+)"/g)];
    for (const m of cellMatches) {
      expect(m[1]).toContain("color:black");
    }
  });

  it("does NOT use gray background on any cell", () => {
    const html = buildWordHtml(SAMPLE_MD);
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
