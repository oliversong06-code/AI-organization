import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr-fetcher";
import type { DepartmentStatus } from "@/lib/enums";

export interface DepartmentListItem {
  id: string;
  name: string;
  description: string | null;
  colorTag: string | null;
  status: DepartmentStatus;
  officeZone: { key: string; name: string } | null;
  _count: { employees: number };
}

export interface DepartmentDetail {
  id: string;
  name: string;
  description: string | null;
  colorTag: string | null;
  status: DepartmentStatus;
  officeZone: { key: string; name: string; kind: string } | null;
  employees: Array<{ id: string; name: string; role: string; status: string }>;
}

export function useDepartments() {
  const { data, error, isLoading } = useSWR<{ departments: DepartmentListItem[] }>(
    "/api/departments",
    jsonFetcher,
    { refreshInterval: 4000 }
  );
  return { departments: data?.departments ?? [], isLoading, error };
}

export function useDepartment(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{ department: DepartmentDetail }>(
    id ? `/api/departments/${id}` : null,
    jsonFetcher,
    { refreshInterval: 4000 }
  );
  return { department: data?.department ?? null, isLoading, error, mutate };
}
