"use client";

import { useState } from "react";
import { useApprovals } from "@/lib/hooks/useApprovals";
import { ApprovalCard } from "@/components/approvals/ApprovalCard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckSquare } from "lucide-react";

export default function ApprovalsPage() {
  const { approvals, isLoading, mutate } = useApprovals();
  const [tab, setTab] = useState<"pending" | "all">("pending");

  const visible = tab === "pending" ? approvals.filter((a) => a.status === "pending") : approvals;
  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-zinc-900">승인함</h1>
        <p className="text-sm text-zinc-500">
          Claude Code의 제안은 여기서 승인해야만 실제로 반영됩니다. 취소도 이 화면에서만 가능합니다.
        </p>
      </header>
      <main className="flex-1 space-y-4 p-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "pending" | "all")}>
          <TabsList>
            <TabsTrigger value="pending">대기 중 ({pendingCount})</TabsTrigger>
            <TabsTrigger value="all">전체</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <p className="text-sm text-zinc-400">불러오는 중…</p>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-white py-24 text-center">
            <CheckSquare className="h-8 w-8 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-600">
              {tab === "pending" ? "대기 중인 승인 요청이 없습니다" : "승인 기록이 없습니다"}
            </p>
            <p className="max-w-sm text-sm text-zinc-400">
              Claude Code가 부서·직원·업무·자동화·스킬·연동을 제안하면 여기에 나타납니다.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} onResolved={() => mutate()} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
