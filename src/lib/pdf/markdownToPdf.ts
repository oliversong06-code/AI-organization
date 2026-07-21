import React from "react";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { createPdfStyles } from "./pdfStyles";

interface HeadingBlock {
  type: "heading";
  level: number;
  text: string;
}
interface ParagraphBlock {
  type: "paragraph";
  text: string;
}
interface ListBlock {
  type: "list";
  items: string[];
}
interface TableBlock {
  type: "table";
  header: string[];
  rows: string[][];
}
type Block = HeadingBlock | ParagraphBlock | ListBlock | TableBlock;

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparatorLine(line: string): boolean {
  return /^\|?[\s:|-]+\|?$/.test(line.trim()) && line.includes("-");
}

/**
 * Deliberately minimal markdown reader — just enough structure (headings,
 * paragraphs, bullet lists, GFM-style pipe tables) to turn the kind of
 * report an AI employee writes into a properly laid-out PDF. Not a
 * CommonMark implementation; inline emphasis/links are left as literal
 * text rather than styled, which is an acceptable trade-off for this
 * project's scope.
 */
export function parseMarkdownBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2].trim() });
      i++;
      continue;
    }

    if (line.trim().startsWith("|") && lines[i + 1] && isTableSeparatorLine(lines[i + 1])) {
      const header = splitTableRow(line).filter((cell) => cell.length > 0);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    if (/^[-*]\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith("|") &&
      !/^[-*]\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: "paragraph", text: paraLines.join(" ") });
  }

  return blocks;
}

function renderBlock(block: Block, key: number, styles: ReturnType<typeof createPdfStyles>) {
  switch (block.type) {
    case "heading": {
      const style = block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3;
      return React.createElement(Text, { key, style }, block.text);
    }
    case "paragraph":
      return React.createElement(Text, { key, style: styles.paragraph }, block.text);
    case "list":
      return React.createElement(
        View,
        { key },
        block.items.map((item, i) => React.createElement(Text, { key: i, style: styles.listItem }, `• ${item}`))
      );
    case "table":
      return React.createElement(
        View,
        { key, style: styles.table },
        React.createElement(
          View,
          { style: styles.tableRow },
          block.header.map((cell, i) => React.createElement(Text, { key: i, style: styles.tableHeaderCell }, cell))
        ),
        ...block.rows.map((row, ri) =>
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
      );
  }
}

/** Renders a markdown document into a paginated A4 PDF buffer with the
 * Korean font embedded. Pagination and table row layout are handled by
 * @react-pdf/renderer's own flow layout (Page defaults to wrap:true) — no
 * manual page-break bookkeeping needed. */
export async function renderMarkdownToPdfBuffer(title: string, markdown: string): Promise<Buffer> {
  const styles = createPdfStyles();
  const blocks = parseMarkdownBlocks(markdown);

  const doc = React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: "A4", style: styles.page, wrap: true },
      React.createElement(Text, { style: styles.h1 }, title),
      ...blocks.map((block, i) => renderBlock(block, i, styles))
    )
  );

  return renderToBuffer(doc);
}
