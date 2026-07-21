"use client";

import { useSkills } from "@/lib/hooks/useSkills";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Puzzle } from "lucide-react";

const HEALTH_LABEL: Record<string, string> = {
  available: "사용 가능",
  installation_required: "설치 필요",
  configuration_required: "구성 필요",
  connected: "연결됨",
  disabled: "비활성화",
  error: "오류",
};

const HEALTH_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  available: "outline",
  installation_required: "secondary",
  configuration_required: "secondary",
  connected: "default",
  disabled: "outline",
  error: "destructive",
};

export default function SkillsPage() {
  const { skills, isLoading } = useSkills();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-zinc-900">스킬 및 플러그인</h1>
        <p className="text-sm text-zinc-500">
          설치·연결·비활성화는 Claude Code의 제안과 승인을 거쳐서만 반영됩니다. 여기서 직접 토글할 수 없습니다.
        </p>
      </header>
      <main className="flex-1 p-6">
        {isLoading ? (
          <p className="text-sm text-zinc-400">불러오는 중…</p>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-white py-24 text-center">
            <Puzzle className="h-8 w-8 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-600">등록된 스킬이 없습니다</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map((s) => (
              <Card key={s.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {s.name}
                    <Badge variant={HEALTH_VARIANT[s.healthStatus] ?? "outline"}>
                      {HEALTH_LABEL[s.healthStatus] ?? s.healthStatus}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-zinc-600">
                  {s.description && <p>{s.description}</p>}
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Badge variant="outline">{s.category}</Badge>
                    <Badge variant="outline">{s.installed ? "설치됨" : "미설치"}</Badge>
                    <Badge variant="outline">{s.enabled ? "사용 중" : "비활성"}</Badge>
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
