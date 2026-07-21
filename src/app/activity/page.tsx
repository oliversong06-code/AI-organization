"use client";

import { useActivityLog } from "@/lib/hooks/useActivityLog";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";

const ACTOR_LABEL: Record<string, string> = {
  claude_code: "Claude Code",
  user: "사용자",
  system: "시스템",
};

export default function ActivityPage() {
  const { logs, isLoading } = useActivityLog();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-zinc-900">활동 로그</h1>
        <p className="text-sm text-zinc-500">모든 생성·변경·승인·거절·제어 작업이 여기 기록됩니다.</p>
      </header>
      <main className="flex-1 p-6">
        {isLoading ? (
          <p className="text-sm text-zinc-400">불러오는 중…</p>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-white py-24 text-center">
            <History className="h-8 w-8 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-600">아직 활동 기록이 없습니다</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-white">
            <ul className="divide-y">
              {logs.map((log) => (
                <li key={log.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-40 shrink-0 text-xs text-zinc-400">
                    {new Date(log.timestamp).toLocaleString("ko-KR")}
                  </span>
                  <Badge variant="outline">{ACTOR_LABEL[log.actor] ?? log.actor}</Badge>
                  <span className="text-zinc-700">{log.action}</span>
                  {log.entityType && (
                    <span className="text-xs text-zinc-400">
                      {log.entityType}
                      {log.entityId ? `:${log.entityId.slice(0, 8)}` : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
