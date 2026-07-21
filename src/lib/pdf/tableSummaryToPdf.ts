import React from "react";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { createPdfStyles } from "./pdfStyles";

export interface TableSummaryInput {
  title: string;
  header: string[];
  rows: string[][];
  /** e.g. "전체 128행 중 처음 50행만 표시" — shown under the table. */
  note?: string;
}

/**
 * Renders a small preview table (header + a handful of rows) into a PDF —
 * used for the "PDF summary alongside the untouched original" rule for
 * CSV/XLSX artifacts: the source spreadsheet is never modified or
 * replaced, this is purely a human-readable companion document. Shares
 * the same Korean-font table styling as markdownToPdf.
 */
export async function renderTableSummaryToPdfBuffer(input: TableSummaryInput): Promise<Buffer> {
  const styles = createPdfStyles();

  const doc = React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: "A4", style: styles.page, wrap: true },
      React.createElement(Text, { style: styles.h1 }, input.title),
      React.createElement(
        View,
        { style: styles.table },
        React.createElement(
          View,
          { style: styles.tableRow },
          input.header.map((cell, i) => React.createElement(Text, { key: i, style: styles.tableHeaderCell }, cell))
        ),
        ...input.rows.map((row, ri) =>
          React.createElement(
            View,
            { key: `r${ri}` },
            React.createElement(
              View,
              { style: styles.tableRow },
              row.map((cell, ci) => React.createElement(Text, { key: ci, style: styles.tableCell }, cell))
            )
          )
        )
      ),
      input.note ? React.createElement(Text, { style: styles.note }, input.note) : null
    )
  );

  return renderToBuffer(doc);
}
