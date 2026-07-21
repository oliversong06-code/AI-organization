"use client";

import Link from "next/link";
import { useTasks } from "@/lib/hooks/useTasks";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListChecks } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  queued: "대기",
  running: "진행 중",
  needs_review: "검토 필요",
  completed: "완료",
  failed: "실패",
  paused: "일시정지",
  cancelled: "취소됨",
};

export default function TasksPage() {
  const { tasks, isLoading } = useTasks();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-zinc-900">업무</h1>
        <p className="text-sm text-zinc-500">
          Claude Code가 제안하고 승인된 업무만 여기 표시됩니다. 수동으로 업무를 만드는 화면은 없습니다.
        </p>
      </header>
      <main className="flex-1 p-6">
        {isLoading ? (
          <p className="text-sm text-zinc-400">불러오는 중…</p>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-white py-24 text-center">
            <ListChecks className="h-8 w-8 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-600">아직 업무가 없습니다</p>
            <p className="max-w-sm text-sm text-zinc-400">
              Claude Code에 업무를 요청하면 제안이 승인함에 등록되고, 승인 후 여기 나타납니다.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead>담당자</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>우선순위</TableHead>
                  <TableHead>진행률</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/tasks/${task.id}`} className="font-medium text-zinc-900 hover:underline">
                        {task.title}
                      </Link>
                    </TableCell>
                    <TableCell>{task.assignedEmployee?.name ?? "미배정"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{STATUS_LABEL[task.status] ?? task.status}</Badge>
                    </TableCell>
                    <TableCell>{task.priority}</TableCell>
                    <TableCell>{task.progress}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  );
}
