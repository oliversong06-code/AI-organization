import {
  loadAvatarSymbolsInnerSvg,
  loadOfficeBackgroundInnerSvg,
  loadOfficeScene,
} from "@/lib/office-scene";
import { EmployeeLayer } from "./EmployeeLayer";
import type { EmployeeMarkerData } from "./types";

interface Props {
  employees: EmployeeMarkerData[];
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
export async function OfficeScene({ employees }: Props) {
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
        <EmployeeLayer scene={scene} employees={employees} />
      </svg>
    </div>
  );
}
