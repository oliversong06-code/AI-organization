"use client";

import { mutationFetch } from "@/lib/mutationFetch";
import { useState } from "react";
import { toast } from "sonner";
import { useAutomations, useIntegrations } from "@/lib/hooks/useAutomations";
import { AutomationControlButtons } from "@/components/automations/AutomationControlButtons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Repeat } from "lucide-react";

const SYNC_KINDS = ["google_drive_sync", "git_repo"];

export default function AutomationsPage() {
  const { automations, isLoading, mutate } = useAutomations();
  const { integrations } = useIntegrations();
  const [scanning, setScanning] = useState(false);

  const syncIntegration = integrations.find(
    (i) => SYNC_KINDS.includes(i.kind) && i.status === "configured"
  );

  async function handleScan() {
    if (!syncIntegration) return;
    setScanning(true);
    try {
      const res = await mutationFetch(`/api/integrations/${syncIntegration.id}/scan`, { method: "POST" });
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
      setScanning(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-zinc-900">자동화</h1>
        <p className="text-sm text-zinc-500">
          반복 업무는 Claude Code의 제안과 승인을 거쳐서만 생성됩니다.
        </p>
      </header>
      <main className="flex-1 space-y-4 p-6">
        <Card>
          <CardContent className="flex items-center justify-between py-4 text-sm">
            {syncIntegration ? (
              <>
                <span className="text-zinc-600">
                  외부 결과 동기화: <strong>{syncIntegration.name}</strong> 연결됨
                </span>
                <Button size="sm" onClick={handleScan} disabled={scanning}>
                  {scanning ? "스캔 중…" : "지금 스캔"}
                </Button>
              </>
            ) : (
              <span className="text-zinc-400">외부 결과 동기화가 설정되지 않음</span>
            )}
          </CardContent>
        </Card>

        {isLoading ? (
          <p className="text-sm text-zinc-400">불러오는 중…</p>
        ) : automations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-white py-24 text-center">
            <Repeat className="h-8 w-8 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-600">아직 자동화가 없습니다</p>
            <p className="max-w-sm text-sm text-zinc-400">
              Claude Code에 반복 업무를 요청하면 제안이 승인함에 등록되고, 승인 후 여기 나타납니다.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {automations.map((a) => (
              <Card key={a.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {a.name}
                    <Badge variant={a.enabled ? "default" : "secondary"}>
                      {a.enabled ? "실행 중" : "일시정지"}
                    </Badge>
                    <Badge variant="outline">{a.scheduleType}</Badge>
                    <div className="ml-auto">
                      <AutomationControlButtons
                        automationId={a.id}
                        enabled={a.enabled}
                        archived={false}
                        onDone={() => mutate()}
                      />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-zinc-600">
                  {a.description && <p>{a.description}</p>}
                  <p className="text-zinc-400">
                    마지막 실행: {a.lastRunAt ? new Date(a.lastRunAt).toLocaleString("ko-KR") : "없음"}
                    {a.lastStatus ? ` (${a.lastStatus})` : ""}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
