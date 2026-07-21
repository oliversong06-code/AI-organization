import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr-fetcher";
import type { Direction, EmployeeStatus } from "@/lib/enums";

export interface EmployeeListItem {
  id: string;
  name: string;
  role: string;
  rank: number;
  status: EmployeeStatus;
  avatarId: string;
  posX: number;
  posY: number;
  direction: Direction;
  scale: number;
  department: { id: string; name: string } | null;
  officeZone: { key: string; name: string };
}

export interface EmployeeDetail extends EmployeeListItem {
  currentTaskId: string | null;
  createdAt: string;
  updatedAt: string;
  skills: Array<{ skill: { id: string; name: string; category: string } }>;
  assignedTasks: Array<{ id: string; title: string; status: string; priority: string }>;
}

export function useEmployees() {
  const { data, error, isLoading } = useSWR<{ employees: EmployeeListItem[] }>(
    "/api/employees",
    jsonFetcher,
    { refreshInterval: 4000 }
  );
  return { employees: data?.employees ?? [], isLoading, error };
}

export function useEmployee(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{
    employee: EmployeeDetail;
    recentActivity: Array<{ id: string; action: string; timestamp: string; detail: unknown }>;
  }>(id ? `/api/employees/${id}` : null, jsonFetcher, { refreshInterval: 4000 });
  return {
    employee: data?.employee ?? null,
    recentActivity: data?.recentActivity ?? [],
    isLoading,
    error,
    mutate,
  };
}
