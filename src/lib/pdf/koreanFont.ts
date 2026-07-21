import path from "node:path";
import { Font } from "@react-pdf/renderer";

const FONT_FAMILY = "NotoSansKR";
let registered = false;

/**
 * Registers the bundled Noto Sans KR font (from the @fontsource/noto-sans-kr
 * npm package — no network fetch, no OS font dependency) with
 * @react-pdf/renderer's fontkit-based engine. Verified by hand before this
 * module existed: rendered a PDF with a Korean heading, a long Korean
 * paragraph spanning two pages, and a table with Korean cell values, then
 * used pdf-parse to confirm every string round-trips out of the PDF bytes —
 * see reviewChain-adjacent P2-6 progress log entry for the exact check.
 * Playwright/Chromium printing was the other candidate but needs a browser
 * binary this sandbox doesn't have (same class of problem as the missing
 * `claude` CLI); PDFKit would need the same manual CJK font wiring as this
 * without @react-pdf's table/pagination layout primitives, so this won it.
 */
export function ensureKoreanFontRegistered(): string {
  if (!registered) {
    const fontDir = path.join(process.cwd(), "node_modules", "@fontsource", "noto-sans-kr", "files");
    Font.register({
      family: FONT_FAMILY,
      fonts: [
        { src: path.join(fontDir, "noto-sans-kr-korean-400-normal.woff2"), fontWeight: 400 },
        { src: path.join(fontDir, "noto-sans-kr-korean-700-normal.woff2"), fontWeight: 700 },
      ],
    });
    registered = true;
  }
  return FONT_FAMILY;
}
