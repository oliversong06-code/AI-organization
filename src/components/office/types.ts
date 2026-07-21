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
}
