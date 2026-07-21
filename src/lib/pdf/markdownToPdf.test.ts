import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { renderMarkdownToPdfBuffer, parseMarkdownBlocks } from "./markdownToPdf";

describe("parseMarkdownBlocks (pure)", () => {
  it("parses headings, paragraphs, lists, and pipe tables", () => {
    const blocks = parseMarkdownBlocks(
      [
        "# 제목",
        "",
        "본문 문단입니다.",
        "",
        "- 항목 1",
        "- 항목 2",
        "",
        "| 이름 | 값 |",
        "|---|---|",
        "| 매출 | 100 |",
      ].join("\n")
    );

    expect(blocks).toEqual([
      { type: "heading", level: 1, text: "제목" },
      { type: "paragraph", text: "본문 문단입니다." },
      { type: "list", items: ["항목 1", "항목 2"] },
      { type: "table", header: ["이름", "값"], rows: [["매출", "100"]] },
    ]);
  });
});

describe("renderMarkdownToPdfBuffer (real @react-pdf/renderer + Korean font, verified against actual PDF bytes)", () => {
  it("embeds Korean text so it round-trips through PDF text extraction", async () => {
    const buffer = await renderMarkdownToPdfBuffer("한글 보고서", "# 제목\n\n한글 본문 내용입니다.");
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const parsed = new PDFParse({ data: buffer });
    const result = await parsed.getText();
    expect(result.text).toContain("한글 보고서");
    expect(result.text).toContain("한글 본문 내용입니다");
  });

  it("renders a table so its Korean cell values are extractable", async () => {
    const markdown = ["| 항목 | 값 |", "|---|---|", "| 매출 | 1,234,000원 |", "| 이익률 | 12.5% |"].join("\n");
    const buffer = await renderMarkdownToPdfBuffer("표 테스트", markdown);

    const parsed = new PDFParse({ data: buffer });
    const result = await parsed.getText();
    expect(result.text).toContain("매출");
    expect(result.text).toContain("이익률");
    expect(result.text).toContain("12.5%");
  });

  it("paginates across multiple pages for long content", async () => {
    const longParagraph = "페이지 나눔 검증을 위한 반복 문단입니다. ".repeat(60);
    const buffer = await renderMarkdownToPdfBuffer("긴 문서", `${longParagraph}\n\n${longParagraph}`);

    const parsed = new PDFParse({ data: buffer });
    const result = await parsed.getText();
    expect(result.pages.length).toBeGreaterThan(1);
  });
});
