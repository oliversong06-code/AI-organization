import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr-fetcher";

export interface DataAssetListItem {
  id: string;
  name: string;
  description: string | null;
  dataType: string;
  storagePath: string;
  mimeType: string;
  size: number;
  sourceType: string;
  sensitivity: string;
  status: string;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
  department: { id: string; name: string } | null;
  ownerEmployee: { id: string; name: string } | null;
}

export function useDataAssets() {
  const { data, error, isLoading, mutate } = useSWR<{ dataAssets: DataAssetListItem[] }>(
    "/api/data-assets",
    jsonFetcher,
    { refreshInterval: 4000 }
  );
  return { dataAssets: data?.dataAssets ?? [], isLoading, error, mutate };
}
