import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr-fetcher";
import type { ActivityActor } from "@/lib/enums";

export interface ActivityLogItem {
  id: string;
  timestamp: string;
  actor: ActivityActor;
  action: string;
  entityType: string | null;
  entityId: string | null;
  detail: Record<string, unknown> | null;
  approvalRequestId: string | null;
}

export function useActivityLog() {
  const { data, error, isLoading } = useSWR<{ logs: ActivityLogItem[] }>(
    "/api/activity",
    jsonFetcher,
    { refreshInterval: 4000 }
  );
  return { logs: data?.logs ?? [], isLoading, error };
}
