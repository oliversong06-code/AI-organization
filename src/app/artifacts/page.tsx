"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useArtifacts } from "@/lib/hooks/useArtifacts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderOpen } from "lucide-react";

export default function ArtifactsPage() {
  const { artifacts, isLoading, mutate } = useArtifacts();
  const [tab, setTab] = useState<"all" | "unassigned">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = tab === "unassigned" ? artifacts.filter((a) => !a.employee) : artifacts;

  async function handleArchive(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/artifacts/${id}/archive`, { method: "POST" });
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
        <h1 className="text-lg font-semibold text-zinc-900">결과물 보관함</h1>
        <p className="text-sm text-zinc-500">
          담당 직원이 있는 결과물은 사무실의 직원 위 말풍선으로도 표시됩니다.
        </p>
      </header>
      <main className="flex-1 space-y-4 p-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "unassigned")}>
          <TabsList>
            <TabsTrigger value="all">전체</TabsTrigger>
            <TabsTrigger value="unassigned">공용 (담당자 없음)</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <p className="text-sm text-zinc-400">불러오는 중…</p>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-white py-24 text-center">
            <FolderOpen className="h-8 w-8 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-600">아직 결과물이 없습니다</p>
            <p className="max-w-sm text-sm text-zinc-400">
              업무가 완료되면 결과물이 여기와 담당 직원 위 말풍선에 나타납니다.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((a) => (
              <Card key={a.id}>
                <CardHeader>
                  <CardTitle className="text-base">{a.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {a.summary && <p className="text-zinc-600">{a.summary}</p>}
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary">{a.employee?.name ?? "공용"}</Badge>
                    {a.task && <Badge variant="outline">{a.task.title}</Badge>}
                  </div>
                  <p className="text-xs text-zinc-400">
                    {new Date(a.createdAt).toLocaleString("ko-KR")} · {a.fileName}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      render={<a href={`/api/artifacts/${a.id}/download`} />}
                    >
                      다운로드
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === a.id}
                      onClick={() => handleArchive(a.id)}
                    >
                      보관
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        toast.info("Claude Code에게 이 업무를 다시 요청하면 재작업이 시작됩니다.")
                      }
                    >
                      재작업 요청
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
