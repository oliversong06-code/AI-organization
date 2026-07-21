"use client";

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
import type { TaskStatus } from "@/lib/enums";

const AVAILABLE: Record<TaskStatus, Array<{ action: "pause" | "resume" | "cancel" | "archive"; label: string }>> = {
  queued: [{ action: "pause", label: "일시정지" }, { action: "cancel", label: "취소" }],
  running: [{ action: "pause", label: "일시정지" }, { action: "cancel", label: "취소" }],
  needs_review: [{ action: "pause", label: "일시정지" }, { action: "cancel", label: "취소" }],
  paused: [{ action: "resume", label: "재개" }, { action: "cancel", label: "취소" }],
  completed: [{ action: "archive", label: "보관" }],
  failed: [{ action: "archive", label: "보관" }],
  cancelled: [{ action: "archive", label: "보관" }],
  archived: [],
};

export function TaskControlButtons({ taskId, status, onDone }: { taskId: string; status: TaskStatus; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const actions = AVAILABLE[status] ?? [];
  if (actions.length === 0) return null;

  async function run(action: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/${action}`, { method: "POST" });
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
              <AlertDialogTitle>업무를 {label}할까요?</AlertDialogTitle>
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
