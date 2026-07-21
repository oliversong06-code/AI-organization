import type { Direction, EmployeeStatus } from "@/lib/enums";

export interface EmployeeMarkerData {
  id: string;
  name: string;
  officeZoneKey: string;
  posX: number;
  posY: number;
  direction: Direction;
  scale: number;
  avatarId: string;
  status: EmployeeStatus;
  /** Most recent unarchived Artifact tied to this employee, if any — shown
   * as a clickable speech bubble on the marker (step 11). */
  latestArtifactId?: string;
}
