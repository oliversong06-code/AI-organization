"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { EmployeePanel } from "./EmployeePanel";
import { ZonePanel } from "./ZonePanel";
import { ArtifactPanel } from "./ArtifactPanel";

interface Props {
  children: ReactNode;
}

/**
 * OfficeScene itself is a Server Component (reads SVG/JSON off disk), so it
 * can't hold click state directly. This client wrapper listens for clicks
 * via DOM delegation against the `data-artifact-id` / `data-employee-id` /
 * `data-zone-key` attributes OfficeScene already renders, and owns the
 * panel open/close state — no server->client callback prop needed.
 * Checked most-specific-first: the artifact bubble and employee marker are
 * nested inside the zone hit-region, so a bubble click must not also open
 * the employee panel underneath it.
 */
export function OfficeSceneInteractionLayer({ children }: Props) {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [zoneKey, setZoneKey] = useState<string | null>(null);
  const [artifactId, setArtifactId] = useState<string | null>(null);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as Element;

    const artifactEl = target.closest("[data-artifact-id]");
    if (artifactEl) {
      setArtifactId(artifactEl.getAttribute("data-artifact-id"));
      return;
    }
    const employeeEl = target.closest("[data-employee-id]");
    if (employeeEl) {
      setEmployeeId(employeeEl.getAttribute("data-employee-id"));
      return;
    }
    const zoneEl = target.closest("[data-zone-key]");
    if (zoneEl) {
      setZoneKey(zoneEl.getAttribute("data-zone-key"));
    }
  }

  return (
    <div onClick={handleClick}>
      {children}
      <EmployeePanel employeeId={employeeId} onClose={() => setEmployeeId(null)} />
      <ZonePanel zoneKey={zoneKey} onClose={() => setZoneKey(null)} />
      <ArtifactPanel artifactId={artifactId} onClose={() => setArtifactId(null)} />
    </div>
  );
}
