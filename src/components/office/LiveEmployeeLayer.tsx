"use client";

import { useEmployees } from "@/lib/hooks/useEmployees";
import { EmployeeLayer } from "./EmployeeLayer";
import type { OfficeScene } from "@/lib/office-scene-geometry";
import type { EmployeeMarkerData } from "./types";

/** Fetches the live employee list (SWR-polled) and adapts it into
 * EmployeeMarkerData for the pure/presentational EmployeeLayer. Kept
 * separate from EmployeeLayer so EmployeeLayer itself stays a simple,
 * easily-testable function of its props. */
export function LiveEmployeeLayer({ scene }: { scene: OfficeScene }) {
  const { employees } = useEmployees();

  const markerData: EmployeeMarkerData[] = employees.map((e) => ({
    id: e.id,
    name: e.name,
    officeZoneKey: e.officeZone.key,
    posX: e.posX,
    posY: e.posY,
    direction: e.direction,
    scale: e.scale,
    avatarId: e.avatarId,
    status: e.status,
  }));

  return <EmployeeLayer scene={scene} employees={markerData} />;
}
