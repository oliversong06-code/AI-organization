"use client";

import { mutationFetch } from "@/lib/mutationFetch";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useDataAssets } from "@/lib/hooks/useDataAssets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Database } from "lucide-react";

const ALL = "all";
const SENSITIVITY_LABELS: Record<string, string> = {
  public: "공개",
  internal: "내부",
  confidential: "기밀",
};

function isExpired(validUntil: string | null): boolean {
  return !!validUntil && new Date(validUntil).getTime() < Date.now();
}

export default function DataAssetsPage() {
  const { dataAssets, isLoading, mutate } = useDataAssets();
  const [showArchived, setShowArchived] = useState(false);
  const [dataTypeFilter, setDataTypeFilter] = useState(ALL);
  const [sensitivityFilter, setSensitivityFilter] = useState(ALL);
  const [searchText, setSearchText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const dataTypeOptions = useMemo(() => [...new Set(dataAssets.map((a) => a.dataType))], [dataAssets]);

  const visible = useMemo(() => {
    return dataAssets.filter((a) => {
      if (showArchived ? a.status !== "archived" : a.status === "archived") return false;
      if (dataTypeFilter !== ALL && a.dataType !== dataTypeFilter) return false;
      if (sensitivityFilter !== ALL && a.sensitivity !== sensitivityFilter) return false;
      if (searchText && !a.name.includes(searchText) && !(a.description ?? "").includes(searchText)) return false;
      return true;
    });
  }, [dataAssets, showArchived, dataTypeFilter, sensitivityFilter, searchText]);

  async function handleArchive(id: string) {
    setBusyId(id);
    try {
      const res = await mutationFetch(`/api/data-assets/${id}/archive`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "보관 처리에 실패했습니다");
      } else {
        toast.success("보관되었습니다");
        mutate();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-zinc-900">데이터 자산</h1>
        <p className="text-sm text-zinc-500">
          AI 직원이 업무 중 참고·생성하는 내부 작업 자료입니다. 사람이 보는 최종 결과물은 결과물
          보관함을 확인하세요.
        </p>
      </header>
      <main className="flex-1 space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="이름/설명 검색"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-48"
          />
          <Select value={dataTypeFilter} onValueChange={(v) => setDataTypeFilter(v as string)}>
            <SelectTrigger size="sm">
              <SelectValue placeholder="유형">
                {(v: string) => `유형: ${v === ALL ? "전체" : v}`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전체</SelectItem>
              {dataTypeOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sensitivityFilter} onValueChange={(v) => setSensitivityFilter(v as string)}>
            <SelectTrigger size="sm">
              <SelectValue placeholder="민감도">
                {(v: string) => `민감도: ${v === ALL ? "전체" : SENSITIVITY_LABELS[v] ?? v}`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전체</SelectItem>
              <SelectItem value="public">공개</SelectItem>
              <SelectItem value="internal">내부</SelectItem>
              <SelectItem value="confidential">기밀</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant={showArchived ? "default" : "outline"} onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "보관된 자산 보는 중" : "활성 자산 보는 중"}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-zinc-400">불러오는 중…</p>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-white py-24 text-center">
            <Database className="h-8 w-8 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-600">해당 조건의 데이터 자산이 없습니다</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((a) => (
              <Card key={a.id}>
                <CardHeader>
                  <CardTitle className="text-base">{a.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {a.description && <p className="text-zinc-600">{a.description}</p>}
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary">{a.dataType}</Badge>
                    <Badge variant="outline">{SENSITIVITY_LABELS[a.sensitivity] ?? a.sensitivity}</Badge>
                    {a.department && <Badge variant="outline">{a.department.name}</Badge>}
                    {a.ownerEmployee && <Badge variant="outline">{a.ownerEmployee.name}</Badge>}
                    {isExpired(a.validUntil) && <Badge variant="destructive">유효기간 만료</Badge>}
                  </div>
                  <p className="text-xs text-zinc-400">
                    {new Date(a.createdAt).toLocaleString("ko-KR")} · {a.storagePath}
                  </p>
                  {!showArchived && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => handleArchive(a.id)}>
                        보관
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
