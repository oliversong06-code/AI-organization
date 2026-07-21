import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr-fetcher";
import type { AutomationApprovalMode, AutomationScheduleType } from "@/lib/enums";

export interface AutomationListItem {
  id: string;
  name: string;
  description: string | null;
  taskInstruction: string;
  scheduleType: AutomationScheduleType;
  scheduleExpression: string | null;
  outputFormat: string;
  approvalMode: AutomationApprovalMode;
  enabled: boolean;
  externalScheduleId: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  consecutiveFailures: number;
  createdAt: string;
}

export function useAutomations() {
  const { data, error, isLoading, mutate } = useSWR<{ automations: AutomationListItem[] }>(
    "/api/automations",
    jsonFetcher,
    { refreshInterval: 4000 }
  );
  return { automations: data?.automations ?? [], isLoading, error, mutate };
}

export interface IntegrationListItem {
  id: string;
  name: string;
  kind: string;
  status: string;
  config: Record<string, unknown>;
  lastCheckedAt: string | null;
}

export function useIntegrations() {
  const { data, error, isLoading, mutate } = useSWR<{ integrations: IntegrationListItem[] }>(
    "/api/integrations",
    jsonFetcher,
    { refreshInterval: 4000 }
  );
  return { integrations: data?.integrations ?? [], isLoading, error, mutate };
}
