"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { jsonFetcher } from "@/lib/swr-fetcher";
import { mutationFetch } from "@/lib/mutationFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface AppSetting {
  id: string;
  key: string;
  value: unknown;
  updatedAt: string;
}

export default function SettingsPage() {
  const { data, mutate } = useSWR<{ settings: AppSetting[] }>("/api/settings", jsonFetcher);
  const settings = data?.settings ?? [];
  const expiryHours = settings.find((s) => s.key === "approval_default_expiry_hours");
  const [expiryDraft, setExpiryDraft] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function saveExpiry() {
    const value = Number(expiryDraft || expiryHours?.value);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("1 이상의 숫자를 입력하세요");
      return;
    }
    setBusy(true);
    try {
      const res = await mutationFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "approval_default_expiry_hours", value }),
      });
      if (!res.ok) {
        const body = await res.json();
        toast.error(body.error ?? "저장에 실패했습니다");
      } else {
        toast.success("저장되었습니다");
        mutate();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-zinc-900">설정</h1>
        <p className="text-sm text-zinc-500">
          이 화면의 값은 승인 절차 없이 바로 반영되는 사용자 개인 설정입니다. 외부 동기화 폴더는
          연동 화면에서 Claude Code의 제안을 승인해야 등록됩니다.
        </p>
      </header>
      <main className="flex-1 space-y-4 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">승인 요청 기본 만료 시간</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end gap-3">
            <div>
              <Label htmlFor="expiry">시간 (1~168)</Label>
              <Input
                id="expiry"
                type="number"
                min={1}
                max={168}
                placeholder={String(expiryHours?.value ?? 24)}
                value={expiryDraft}
                onChange={(e) => setExpiryDraft(e.target.value)}
                className="w-32"
              />
            </div>
            <Button size="sm" onClick={saveExpiry} disabled={busy}>
              저장
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">기타 설정 (읽기 전용)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-zinc-600">
            {settings
              .filter((s) => s.key !== "approval_default_expiry_hours")
              .map((s) => (
                <div key={s.key} className="flex justify-between">
                  <span className="text-zinc-400">{s.key}</span>
                  <span>{s.value === null ? "미설정" : String(s.value)}</span>
                </div>
              ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
