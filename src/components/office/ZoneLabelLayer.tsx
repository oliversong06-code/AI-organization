"use client";

import { useOfficeZones } from "@/lib/hooks/useOfficeZones";
import { findZone, isoProject, type OfficeScene } from "@/lib/office-scene-geometry";

// Matches the look of the labels that used to be baked directly into
// office-empty.svg (white rounded pill + bold warm-gray text) — see the
// P2-8 progress log for the pixel math this was reverse-engineered from.
const CHAR_WIDTH = 17;
const LABEL_H_PADDING = 24;
const LABEL_HEIGHT = 24;
const ANCHOR_OFFSET_X = -5;
const ANCHOR_OFFSET_Y = -6;

/**
 * Replaces the static `<text>` labels that used to be drawn directly into
 * office-empty.svg — this reads live OfficeZone.displayName (falling back
 * to defaultDisplayName) from /api/office-zones (SWR-polled, same 4s
 * cadence as the rest of the live layers) so a zone's label updates the
 * moment a department is assigned/moved/archived, with no need to touch
 * the background SVG ever again. Positioned at each zone rect's "north"
 * corner in isometric projection (scene geometry only, no live data),
 * matching where the original hand-placed labels sat.
 */
export function ZoneLabelLayer({ scene }: { scene: OfficeScene }) {
  const { zones } = useOfficeZones();

  return (
    <g data-testid="zone-label-layer">
      {zones.map((zone) => {
        const sceneZone = findZone(scene, zone.key);
        if (!sceneZone) return null;

        const label = zone.displayName ?? zone.defaultDisplayName;
        const [anchorX, anchorY] = isoProject(sceneZone.rect.x0, sceneZone.rect.y0, scene.iso);
        const rectX = anchorX + ANCHOR_OFFSET_X;
        const rectY = anchorY + ANCHOR_OFFSET_Y;
        const width = label.length * CHAR_WIDTH + LABEL_H_PADDING;

        return (
          <g key={zone.key}>
            <rect x={rectX} y={rectY} width={width} height={LABEL_HEIGHT} rx={6} fill="#FFFFFF" opacity={0.78} />
            <text
              x={rectX + 8}
              y={rectY + 17}
              fontFamily="'Segoe UI', sans-serif"
              fontSize={15}
              fontWeight={600}
              fill="#7A6E4E"
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
