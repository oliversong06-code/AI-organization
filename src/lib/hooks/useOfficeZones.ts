import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr-fetcher";

export interface OfficeZoneListItem {
  id: string;
  key: string;
  name: string;
  kind: string;
  displayName: string | null;
  defaultDisplayName: string;
  departments: Array<{ id: string; name: string }>;
}

export function useOfficeZones() {
  const { data, error, isLoading } = useSWR<{ zones: OfficeZoneListItem[] }>(
    "/api/office-zones",
    jsonFetcher,
    { refreshInterval: 4000 }
  );
  return { zones: data?.zones ?? [], isLoading, error };
}
