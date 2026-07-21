"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useEmployee } from "@/lib/hooks/useEmployees";
import { mutationFetch } from "@/lib/mutationFetch";

interface Props {
  employeeId: string | null;
  onClose: () => void;
}

const RANK_OPTIONS = [1, 2, 3, 4];

export function EmployeePanel({ employeeId, onClose }: Props) {
  const { employee, recentActivity, isLoading, mutate } = useEmployee(employeeId);
  const [busy, setBusy] = useState(false);

  async function handleRankChange(newRank: number) {
    if (!employee || newRank === employee.rank) return;
    setBusy(true);
    try {
      const res = await mutationFetch(`/api/employees/${employee.id}/rank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newRank }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "직급 변경에 실패했습니다");
      } else {
        toast.success("직급이 변경되었습니다");
        mutate();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (!employee) return;
    setBusy(true);
    try {
      const res = await mutationFetch(`/api/employees/${employee.id}/archive`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "보관에 실패했습니다");
      } else {
        toast.success("보관되었습니다");
        mutate();
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!employeeId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto">
        {isLoading && <p className="p-4 text-sm text-zinc-400">불러오는 중…</p>}
        {!isLoading && !employee && (
          <p className="p-4 text-sm text-zinc-400">직원을 찾을 수 없습니다.</p>
        )}
        {employee && (
          <>
            <SheetHeader>
              <SheetTitle>{employee.name}</SheetTitle>
              <SheetDescription>
                {employee.department?.name ?? "부서 미배정"} · {employee.role}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-6 text-sm">
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-400">현재 상태</div>
                <Badge variant="secondary">{employee.status}</Badge>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-zinc-400">위치</div>
                <p className="text-zinc-700">{employee.officeZone.name}</p>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-zinc-400">직급</div>
                <Select
                  value={employee.rank}
                  onValueChange={(v) => handleRankChange(v as number)}
                >
                  <SelectTrigger disabled={busy || employee.status === "archived"}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RANK_OPTIONS.map((rank) => (
                      <SelectItem key={rank} value={rank}>
                        직급 {rank}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {employee.status !== "archived" && (
                <AlertDialog>
                  <AlertDialogTrigger render={<Button size="sm" variant="destructive" disabled={busy} />}>
                    보관
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{employee.name} 님을 보관할까요?</AlertDialogTitle>
                      <AlertDialogDescription>
                        좌석이 해제되고 사무실 화면에서 더 이상 표시되지 않습니다. 이 작업은 활동
                        로그에 기록됩니다.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction onClick={handleArchive}>보관</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              <Separator />

              <div>
                <div className="mb-1 text-xs font-medium text-zinc-400">연결된 스킬</div>
                {employee.skills.length === 0 ? (
                  <p className="text-zinc-400">없음</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {employee.skills.map((s) => (
                      <Badge key={s.skill.id} variant="outline">
                        {s.skill.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-zinc-400">담당 업무</div>
                {employee.assignedTasks.length === 0 ? (
                  <p className="text-zinc-400">없음</p>
                ) : (
                  <ul className="space-y-1">
                    {employee.assignedTasks.map((t) => (
                      <li key={t.id} className="flex items-center justify-between">
                        <span className="text-zinc-700">{t.title}</span>
                        <Badge variant="secondary">{t.status}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Separator />

              <div>
                <div className="mb-1 text-xs font-medium text-zinc-400">최근 활동</div>
                {recentActivity.length === 0 ? (
                  <p className="text-zinc-400">기록 없음</p>
                ) : (
                  <ul className="space-y-1">
                    {recentActivity.map((a) => (
                      <li key={a.id} className="text-zinc-600">
                        <span className="text-zinc-400">
                          [{new Date(a.timestamp).toLocaleString("ko-KR")}]
                        </span>{" "}
                        {a.action}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
