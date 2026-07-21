"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useIntegrations } from "@/lib/hooks/useAutomations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plug } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  not_configured: "미구성",
  configured: "구성됨",
  error: "오류",
};

const SYNC_KINDS = ["google_drive_sync", "git_repo", "local_folder"];

export default function IntegrationsPage() {
  const { integrations, isLoading, mutate } = useIntegrations();
  const [scanningId, setScanningId] = useState<string | null>(null);

  async function handleScan(id: string) {
    setScanningId(id);
    try {
      const res = await fetch(`/api/integrations/${id}/scan`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "동기화에 실패했습니다");
      } else {
        toast.success(
          `스캔 완료 — 새로 가져옴 ${data.result.imported}건, 중복 ${data.result.skipped}건, 무효 ${data.result.invalid}건`
        );
        mutate();
      }
    } finally {
      setScanningId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-zinc-900">외부 연동</h1>
        <p className="text-sm text-zinc-500">
          연동 추가·변경은 Claude Code의 제안과 승인을 거쳐서만 반영됩니다. 승인된 폴더는 읽기 전용으로만 접근합니다.
        </p>
      </header>
      <main className="flex-1 p-6">
        {isLoading ? (
          <p className="text-sm text-zinc-400">불러오는 중…</p>
        ) : integrations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-white py-24 text-center">
            <Plug className="h-8 w-8 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-600">등록된 연동이 없습니다</p>
            <p className="max-w-sm text-sm text-zinc-400">
              Claude Code에 외부 폴더 동기화 등을 요청하면 제안이 승인함에 등록됩니다.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {integrations.map((i) => (
              <Card key={i.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {i.name}
                    <Badge variant={i.status === "configured" ? "default" : "secondary"}>
                      {STATUS_LABEL[i.status] ?? i.status}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-zinc-600">
                  <Badge variant="outline">{i.kind}</Badge>
                  <p className="text-xs text-zinc-400">
                    마지막 확인: {i.lastCheckedAt ? new Date(i.lastCheckedAt).toLocaleString("ko-KR") : "없음"}
                  </p>
                  {SYNC_KINDS.includes(i.kind) && i.status === "configured" && (
                    <Button size="sm" disabled={scanningId === i.id} onClick={() => handleScan(i.id)}>
                      {scanningId === i.id ? "스캔 중…" : "지금 스캔"}
                    </Button>
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
