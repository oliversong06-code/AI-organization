"use client";

import { useEmployees } from "@/lib/hooks/useEmployees";
import { useArtifacts } from "@/lib/hooks/useArtifacts";
import { EmployeeLayer } from "./EmployeeLayer";
import type { OfficeScene } from "@/lib/office-scene-geometry";
import type { EmployeeMarkerData } from "./types";

/** Fetches the live employee list + artifact list (both SWR-polled) and
 * adapts them into EmployeeMarkerData for the pure/presentational
 * EmployeeLayer. Kept separate from EmployeeLayer so EmployeeLayer itself
 * stays a simple, easily-testable function of its props. */
export function LiveEmployeeLayer({ scene }: { scene: OfficeScene }) {
  const { employees } = useEmployees();
  const { artifacts } = useArtifacts();

  const latestArtifactByEmployee = new Map<string, string>();
  for (const artifact of artifacts) {
    if (!artifact.employee || artifact.archivedAt) continue;
    if (!latestArtifactByEmployee.has(artifact.employee.id)) {
      latestArtifactByEmployee.set(artifact.employee.id, artifact.id); // artifacts are already newest-first
    }
  }

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
    latestArtifactId: latestArtifactByEmployee.get(e.id),
  }));

  return <EmployeeLayer scene={scene} employees={markerData} />;
}
