import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr-fetcher";

export interface CompanyStateResponse {
  company: { id: string; name: string; description: string | null } | null;
  counts: {
    employees: number;
    departments: number;
    tasks: number;
    automations: number;
    artifacts: number;
    pendingApprovals: number;
  };
}

const EMPTY_COUNTS: CompanyStateResponse["counts"] = {
  employees: 0,
  departments: 0,
  tasks: 0,
  automations: 0,
  artifacts: 0,
  pendingApprovals: 0,
};

export function useCompanyState() {
  const { data, error, isLoading } = useSWR<CompanyStateResponse>(
    "/api/company",
    jsonFetcher,
    { refreshInterval: 4000 }
  );

  return {
    company: data?.company ?? null,
    counts: data?.counts ?? EMPTY_COUNTS,
    isLoading,
    error,
  };
}
