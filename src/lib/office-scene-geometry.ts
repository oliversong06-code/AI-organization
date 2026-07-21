import { z } from "zod";
import { officeZoneKindSchema } from "@/lib/enums";

// Pure, isomorphic geometry helpers + types — safe to import from Client
// Components. File I/O (reading office-scene.json / office-empty.svg from
// disk) lives in office-scene.ts, which is server-only and must never be
// imported from a "use client" module.

export const officeSceneSchema = z.object({
  schemaVersion: z.literal(1),
  viewBoxWidth: z.number(),
  viewBoxHeight: z.number(),
  iso: z.object({
    originX: z.number(),
    originY: z.number(),
    isoW: z.number(),
    isoH: z.number(),
  }),
  zones: z.array(
    z.object({
      key: z.string(),
      kind: officeZoneKindSchema,
      rect: z.object({
        x0: z.number(),
        y0: z.number(),
        x1: z.number(),
        y1: z.number(),
      }),
    })
  ),
});

export type OfficeScene = z.infer<typeof officeSceneSchema>;
export type OfficeSceneZone = OfficeScene["zones"][number];

export interface IsoConfig {
  originX: number;
  originY: number;
  isoW: number;
  isoH: number;
}

/** Top-down (u,v) in [0,1] -> isometric screen coordinates, matching the
 * transform used by scripts/generate-office-svg.mjs when the background was
 * authored. Employee positions must go through this same function to stay
 * pixel-aligned with the background as it's swapped/edited. */
export function isoProject(u: number, v: number, iso: IsoConfig): [number, number] {
  const x = iso.originX + (u - v) * (iso.isoW / 2);
  const y = iso.originY + (u + v) * (iso.isoH / 2);
  return [x, y];
}

/** Employee posX/posY are normalized (0..1) WITHIN their assigned zone's
 * rect, not the whole canvas — e.g. (0.5, 0.5) is the center of whatever
 * room the employee is in. This resolves that to whole-canvas (u,v). */
export function resolveEmployeeUV(
  zone: OfficeSceneZone,
  posX: number,
  posY: number
): [number, number] {
  const { x0, y0, x1, y1 } = zone.rect;
  return [x0 + posX * (x1 - x0), y0 + posY * (y1 - y0)];
}

export function findZone(scene: OfficeScene, zoneKey: string): OfficeSceneZone | undefined {
  return scene.zones.find((z) => z.key === zoneKey);
}
