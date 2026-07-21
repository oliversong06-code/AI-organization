import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { officeSceneSchema, type OfficeScene } from "@/lib/office-scene-geometry";

export type { OfficeScene, OfficeSceneZone, IsoConfig } from "@/lib/office-scene-geometry";
export { isoProject, resolveEmployeeUV, findZone } from "@/lib/office-scene-geometry";

let cachedScene: OfficeScene | null = null;

/**
 * Reads public/office/office-scene.json from disk (server-only). Cached in
 * memory for the process lifetime — swapping the file requires a server
 * restart, same as swapping office-empty.svg.
 */
export async function loadOfficeScene(): Promise<OfficeScene> {
  if (cachedScene) return cachedScene;
  const filePath = path.join(process.cwd(), "public", "office", "office-scene.json");
  const raw = await fs.readFile(filePath, "utf-8");
  cachedScene = officeSceneSchema.parse(JSON.parse(raw));
  return cachedScene;
}

/** Reads public/office/office-empty.svg and returns just the inner markup
 * (without the outer <svg> tag) so it can be embedded inside our own
 * <svg viewBox> alongside the employee layer. */
export async function loadOfficeBackgroundInnerSvg(): Promise<string> {
  const filePath = path.join(process.cwd(), "public", "office", "office-empty.svg");
  const raw = await fs.readFile(filePath, "utf-8");
  const match = raw.match(/<svg[^>]*>([\s\S]*)<\/svg>\s*$/);
  if (!match) {
    throw new Error("office-empty.svg does not look like a valid <svg>...</svg> document");
  }
  return match[1];
}

/** Reads public/avatars/avatar-sprites.svg and returns just the <symbol>
 * definitions. Embedded once inside OfficeScene's own <defs> so
 * EmployeeMarker can reference them with a same-document `#avatar-body`
 * fragment — cross-file `<use href="other.svg#id">` isn't reliably
 * supported outside real browsers (e.g. server-side SVG rasterizers), so
 * same-document refs are the safer, universally-supported choice. */
export async function loadAvatarSymbolsInnerSvg(): Promise<string> {
  const filePath = path.join(process.cwd(), "public", "avatars", "avatar-sprites.svg");
  const raw = await fs.readFile(filePath, "utf-8");
  const match = raw.match(/<svg[^>]*>([\s\S]*)<\/svg>\s*$/);
  if (!match) {
    throw new Error("avatar-sprites.svg does not look like a valid <svg>...</svg> document");
  }
  return match[1];
}
