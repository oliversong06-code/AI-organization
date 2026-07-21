import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { renderTableSummaryToPdfBuffer } from "./tableSummaryToPdf";

describe("renderTableSummaryToPdfBuffer (real @react-pdf/renderer + Korean font)", () => {
  it("renders a CSV/XLSX-style preview table with a note, Korean text extractable", async () => {
    const buffer = await renderTableSummaryToPdfBuffer({
      title: "판매 데이터 요약",
      header: ["지역", "매출"],
      rows: [
        ["서울", "1,000,000"],
        ["부산", "500,000"],
      ],
      note: "전체 128행 중 처음 2행만 표시",
    });

    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const parsed = new PDFParse({ data: buffer });
    const result = await parsed.getText();
    expect(result.text).toContain("판매 데이터 요약");
    expect(result.text).toContain("서울");
    expect(result.text).toContain("부산");
    expect(result.text).toContain("128행");
  });
});
