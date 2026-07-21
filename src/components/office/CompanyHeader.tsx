"use client";

import { useCompanyState } from "@/lib/hooks/useCompanyState";

const STAT_LABELS: Array<{ key: keyof ReturnType<typeof useCompanyState>["counts"]; label: string }> = [
  { key: "employees", label: "직원" },
  { key: "departments", label: "부서" },
  { key: "tasks", label: "업무" },
  { key: "automations", label: "자동화" },
  { key: "artifacts", label: "결과물" },
  { key: "pendingApprovals", label: "승인 대기" },
];

export function CompanyHeader() {
  const { company, counts, isLoading } = useCompanyState();

  return (
    <header className="border-b bg-white px-6 py-4">
      <h1 className="text-lg font-semibold text-zinc-900">
        {company?.name ?? "AI 회사"} 사무실
      </h1>
      <p className="text-sm text-zinc-500">
        Claude Code에 요청하면 부서·직원·업무가 이 사무실에 나타납니다.
      </p>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-600">
        {STAT_LABELS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-1.5">
            <dt className="text-zinc-400">{label}</dt>
            <dd className="font-medium tabular-nums text-zinc-800">
              {isLoading ? "…" : counts[key]}
            </dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
