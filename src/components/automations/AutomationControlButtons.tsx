"use client";

import { mutationFetch } from "@/lib/mutationFetch";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  automationId: string;
  enabled: boolean;
  archived: boolean;
  onDone: () => void;
}

export function AutomationControlButtons({ automationId, enabled, archived, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  if (archived) return null;

  const actions: Array<{ action: "pause" | "resume" | "archive"; label: string }> = enabled
    ? [{ action: "pause", label: "일시정지" }, { action: "archive", label: "보관" }]
    : [{ action: "resume", label: "재개" }, { action: "archive", label: "보관" }];

  async function run(action: string) {
    setBusy(true);
    try {
      const res = await mutationFetch(`/api/automations/${automationId}/${action}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "처리에 실패했습니다");
      } else {
        toast.success("반영되었습니다");
        onDone();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      {actions.map(({ action, label }) => (
        <AlertDialog key={action}>
          <AlertDialogTrigger render={<Button size="sm" variant="outline" disabled={busy} />}>
            {label}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>자동화를 {label}할까요?</AlertDialogTitle>
              <AlertDialogDescription>이 작업은 활동 로그에 기록됩니다.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction onClick={() => run(action)}>{label}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ))}
    </div>
  );
}
