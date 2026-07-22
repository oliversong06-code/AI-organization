import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr-fetcher";
import type { ArtifactSourceType } from "@/lib/enums";

export interface ArtifactListItem {
  id: string;
  title: string;
  summary: string | null;
  fileName: string;
  mimeType: string;
  size: number;
  sourceType: ArtifactSourceType;
  importance: number;
  currentReviewStatus: string;
  createdAt: string;
  archivedAt: string | null;
  task: { id: string; title: string } | null;
  employee: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  latestVersion: { versionNumber: number; format: string } | null;
  currentReviewer: { id: string; name: string } | null;
}

export function useArtifacts() {
  const { data, error, isLoading, mutate } = useSWR<{ artifacts: ArtifactListItem[] }>(
    "/api/artifacts",
    jsonFetcher,
    { refreshInterval: 4000 }
  );
  return { artifacts: data?.artifacts ?? [], isLoading, error, mutate };
}

export function useArtifact(id: string | null) {
  const { data, error, isLoading } = useSWR<{ artifact: ArtifactListItem & { filePath: string; metadata: unknown } }>(
    id ? `/api/artifacts/${id}` : null,
    jsonFetcher
  );
  return { artifact: data?.artifact ?? null, isLoading, error };
}
