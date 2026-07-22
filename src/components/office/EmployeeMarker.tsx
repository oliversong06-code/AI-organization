"use client";

import {
  isoProject,
  resolveEmployeeUV,
  type OfficeSceneZone,
  type IsoConfig,
} from "@/lib/office-scene-geometry";
import { avatarColor } from "./avatar-palette";
import { StatusBadge } from "./StatusBadge";
import { ArtifactBubble } from "./ArtifactBubble";
import type { EmployeeMarkerData } from "./types";
import type { EmployeeStatus } from "@/lib/enums";

interface Props {
  employee: EmployeeMarkerData;
  zone: OfficeSceneZone;
  iso: IsoConfig;
  onSelect?: (employeeId: string) => void;
}

const AVATAR_W = 46; // rendered width in canvas px at scale=1
const AVATAR_H = AVATAR_W * (132 / 100);

/**
 * Per-status body lean, in degrees, rotated around the avatar's feet
 * (bottom-center of its own 0..100 x 0..132 viewBox) — a lightweight,
 * asset-free way to give each status a distinct "posture" without
 * drawing separate pose artwork per state. Forward lean reads as
 * focused/active work, backward/slumped lean reads as stuck or failed;
 * everything else stays upright.
 */
const POSTURE_ROTATION: Record<EmployeeStatus, number> = {
  idle: 0,
  queued: 0,
  running: -3,
  awaiting_approval: 0,
  needs_review: 0,
  reviewing: -3,
  revision_requested: 3,
  review_blocked: 6,
  completed: 0,
  failed: 8,
  paused: 4,
  archived: 0,
};

export function EmployeeMarker({ employee, zone, iso, onSelect }: Props) {
  if (employee.status === "archived") return null;

  const [u, v] = resolveEmployeeUV(zone, employee.posX, employee.posY);
  const [x, y] = isoProject(u, v, iso);
  const flip = employee.direction === "left" ? -1 : 1;
  const scale = employee.scale || 1;

  return (
    <g
      data-employee-id={employee.id}
      data-testid="employee-marker"
      transform={`translate(${x} ${y}) scale(${scale})`}
      onClick={onSelect ? () => onSelect(employee.id) : undefined}
      style={{ cursor: onSelect ? "pointer" : undefined }}
    >
      <g transform={`translate(${(-AVATAR_W / 2) * flip} ${-AVATAR_H}) scale(${flip} 1)`}>
        <g transform={`scale(${AVATAR_W / 100} ${AVATAR_H / 132})`}>
          <g transform={`rotate(${POSTURE_ROTATION[employee.status]} 50 132)`}>
            <use
              href="#avatar-body"
              width={100}
              height={132}
              style={{ color: avatarColor(employee.avatarId) }}
            />
          </g>
          <StatusBadge status={employee.status} />
          {employee.latestArtifactId && <ArtifactBubble artifactId={employee.latestArtifactId} />}
        </g>
      </g>
      <text
        x={0}
        y={10}
        textAnchor="middle"
        fontSize={11}
        fontFamily="'Segoe UI', sans-serif"
        fill="#5B5347"
        stroke="#FFFFFF"
        strokeWidth={3}
        paintOrder="stroke"
      >
        {employee.name}
      </text>
    </g>
  );
}
