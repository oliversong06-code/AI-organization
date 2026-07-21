import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr-fetcher";
import type { ApprovalRiskLevel, ApprovalStatus } from "@/lib/enums";

export interface ApprovalListItem {
  id: string;
  entityType: string;
  action: string;
  relatedEntityId: string | null;
  payload: Record<string, unknown>;
  summary: string;
  riskLevel: ApprovalRiskLevel;
  status: ApprovalStatus;
  requestedBy: string;
  rejectionReason: string | null;
  entityVersion: number | null;
  expiresAt: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export function useApprovals() {
  const { data, error, isLoading, mutate } = useSWR<{ approvals: ApprovalListItem[] }>(
    "/api/approvals",
    jsonFetcher,
    { refreshInterval: 1500 }
  );
  return { approvals: data?.approvals ?? [], isLoading, error, mutate };
}
