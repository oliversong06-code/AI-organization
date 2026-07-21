import {
  loadAvatarSymbolsInnerSvg,
  loadOfficeBackgroundInnerSvg,
  loadOfficeScene,
} from "@/lib/office-scene";
import { isoProject, type OfficeScene as OfficeSceneData } from "@/lib/office-scene-geometry";
import { LiveEmployeeLayer } from "./LiveEmployeeLayer";

/** Invisible clickable regions over each room, one per OfficeZone, so the
 * (currently) client-side interaction layer can pick up a click via
 * `data-zone-key` event delegation and open the zone/department panel —
 * without OfficeScene itself (a Server Component) needing to hold click
 * handlers. */
function ZoneHitRegions({ scene }: { scene: OfficeSceneData }) {
  return (
    <g data-testid="zone-hit-regions">
      {scene.zones.map((zone) => {
        const { x0, y0, x1, y1 } = zone.rect;
        const points = [
          isoProject(x0, y0, scene.iso),
          isoProject(x1, y0, scene.iso),
          isoProject(x1, y1, scene.iso),
          isoProject(x0, y1, scene.iso),
        ]
          .map(([x, y]) => `${x},${y}`)
          .join(" ");
        return (
          <polygon
            key={zone.key}
            data-zone-key={zone.key}
            points={points}
            fill="transparent"
            className="cursor-pointer"
          />
        );
      })}
    </g>
  );
}

/**
 * The office background (public/office/office-empty.svg) and the employee
 * layer live inside ONE <svg viewBox>, so both scale together pixel-for-
 * pixel as the container resizes — no separate HTML overlay to keep in
 * sync. Swapping in a redesigned background later only requires replacing
 * office-empty.svg (+ office-scene.json if the zone layout moves); this
 * component reads both from disk rather than hardcoding any numbers.
 *
 * The avatar <symbol> defs are embedded here too (rather than referenced
 * cross-file) so EmployeeMarker's <use href="#avatar-body"> is a
 * same-document fragment reference, which works everywhere.
 */
export async function OfficeScene() {
  const [scene, backgroundInner, avatarSymbols] = await Promise.all([
    loadOfficeScene(),
    loadOfficeBackgroundInnerSvg(),
    loadAvatarSymbolsInnerSvg(),
  ]);

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${scene.viewBoxWidth} ${scene.viewBoxHeight}`}
        className="block h-auto w-full"
        role="img"
        aria-label="사람이 없는 아이소메트릭 사무실"
      >
        <defs dangerouslySetInnerHTML={{ __html: avatarSymbols }} />
        <g dangerouslySetInnerHTML={{ __html: backgroundInner }} />
        <ZoneHitRegions scene={scene} />
        <LiveEmployeeLayer scene={scene} />
      </svg>
    </div>
  );
}
