import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr-fetcher";
import type { SkillConnectionType, SkillHealthStatus, SkillSource } from "@/lib/enums";

export interface SkillListItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  source: SkillSource;
  connectionType: SkillConnectionType;
  enabled: boolean;
  installed: boolean;
  healthStatus: SkillHealthStatus;
  createdAt: string;
}

export function useSkills() {
  const { data, error, isLoading } = useSWR<{ skills: SkillListItem[] }>(
    "/api/skills",
    jsonFetcher,
    { refreshInterval: 4000 }
  );
  return { skills: data?.skills ?? [], isLoading, error };
}
