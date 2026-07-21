"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useEmployee } from "@/lib/hooks/useEmployees";

interface Props {
  employeeId: string | null;
  onClose: () => void;
}

export function EmployeePanel({ employeeId, onClose }: Props) {
  const { employee, recentActivity, isLoading } = useEmployee(employeeId);

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
