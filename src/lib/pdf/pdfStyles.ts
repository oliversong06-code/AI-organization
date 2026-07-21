import { StyleSheet } from "@react-pdf/renderer";
import { ensureKoreanFontRegistered } from "./koreanFont";

export function createPdfStyles() {
  const fontFamily = ensureKoreanFontRegistered();
  return StyleSheet.create({
    page: { padding: 40, fontFamily, fontSize: 11, lineHeight: 1.5 },
    h1: { fontSize: 20, fontWeight: 700, marginBottom: 12 },
    h2: { fontSize: 16, fontWeight: 700, marginBottom: 10, marginTop: 8 },
    h3: { fontSize: 13, fontWeight: 700, marginBottom: 8, marginTop: 6 },
    paragraph: { marginBottom: 8 },
    listItem: { marginBottom: 4, marginLeft: 12 },
    table: { marginBottom: 12, borderWidth: 1, borderColor: "#cccccc" },
    tableRow: { flexDirection: "row" as const },
    tableHeaderCell: {
      flex: 1,
      padding: 4,
      fontWeight: 700,
      backgroundColor: "#f0f0f0",
      borderWidth: 0.5,
      borderColor: "#cccccc",
    },
    tableCell: { flex: 1, padding: 4, borderWidth: 0.5, borderColor: "#cccccc" },
    note: { marginTop: 12, fontSize: 9, color: "#666666" },
  });
}

export type PdfStyles = ReturnType<typeof createPdfStyles>;
