"use client";

import type { OfficeScene } from "@/lib/office-scene-geometry";
import { EmployeeMarker } from "./EmployeeMarker";
import type { EmployeeMarkerData } from "./types";

interface Props {
  scene: OfficeScene;
  employees: EmployeeMarkerData[];
  onSelectEmployee?: (employeeId: string) => void;
}

/** Renders 0..n employee markers. With the real app's zero-state
 * (employees === []) this renders an empty <g> — the office looks exactly
 * like the empty background. */
export function EmployeeLayer({ scene, employees, onSelectEmployee }: Props) {
  return (
    <g data-testid="employee-layer">
      {employees.map((employee) => {
        const zone = scene.zones.find((z) => z.key === employee.officeZoneKey);
        if (!zone) return null; // unknown zone key — fail closed, don't render off-scene
        return (
          <EmployeeMarker
            key={employee.id}
            employee={employee}
            zone={zone}
            iso={scene.iso}
            onSelect={onSelectEmployee}
          />
        );
      })}
    </g>
  );
}
