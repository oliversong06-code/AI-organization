/**
 * Per-zone seat slot layout, in zone-relative normalized coordinates (0..1
 * within the zone's rect — same convention as Employee.posX/posY /
 * resolveEmployeeUV). Seats 1-2 of each open_workspace/private_office zone
 * intentionally reuse the exact coordinates the desk graphics were drawn
 * at in scripts/generate-office-svg.mjs, so an employee "sitting" there
 * lines up with the desk pixel-for-pixel. Extra slots give room capacity
 * beyond what's currently drawn; P2-11 adds matching desk graphics for
 * them.
 */
export const OFFICE_SEATS_CONFIG: Record<string, Array<{ normX: number; normY: number }>> = {
  "open-workspace-1": [
    { normX: 0.303, normY: 0.316 },
    { normX: 0.697, normY: 0.632 },
    { normX: 0.2, normY: 0.75 },
    { normX: 0.75, normY: 0.25 },
  ],
  "open-workspace-2": [
    { normX: 0.303, normY: 0.35 },
    { normX: 0.697, normY: 0.65 },
    { normX: 0.2, normY: 0.85 },
    { normX: 0.8, normY: 0.15 },
  ],
  "private-office-1": [
    { normX: 0.5, normY: 0.375 },
    { normX: 0.5, normY: 0.75 },
  ],
  "meeting-room-1": [
    { normX: 0.3, normY: 0.3 },
    { normX: 0.7, normY: 0.7 },
  ],
  "lounge-1": [{ normX: 0.5, normY: 0.5 }],
  "artifact-area-1": [
    { normX: 0.3, normY: 0.5 },
    { normX: 0.7, normY: 0.5 },
  ],
};
