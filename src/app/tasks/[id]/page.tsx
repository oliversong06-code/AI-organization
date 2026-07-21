"use client";

import { use } from "react";
import Link from "next/link";
import { useTask } from "@/lib/hooks/useTasks";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { task, isLoading } = useTask(id);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-white px-6 py-4">
        <Link href="/tasks" className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" /> 업무 목록
        </Link>
        <h1 className="text-lg font-semibold text-zinc-900">{task?.title ?? (isLoading ? "불러오는 중…" : "업무를 찾을 수 없습니다")}</h1>
      </header>
      <main className="flex-1 space-y-4 p-6">
        {!isLoading && !task && (
          <p className="text-sm text-zinc-500">
            존재하지 않거나 아직 승인되지 않은 업무입니다.
          </p>
        )}
        {task && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Badge variant="secondary">{task.status}</Badge>
                  <Badge variant="outline">{task.priority}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-zinc-700">
                <p>{task.description}</p>
                <p className="text-zinc-500">담당자: {task.assignedEmployee?.name ?? "미배정"}</p>
                <p className="text-zinc-500">진행률: {task.progress}%</p>
                {task.resultSummary && <p className="text-zinc-700">결과 요약: {task.resultSummary}</p>}
                {task.errorMessage && <p className="text-red-600">오류: {task.errorMessage}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">진행 로그</CardTitle>
              </CardHeader>
              <CardContent>
                {task.logs.length === 0 ? (
                  <p className="text-sm text-zinc-400">아직 로그가 없습니다.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {task.logs.map((log) => (
                      <li key={log.id} className="text-zinc-600">
                        <span className="text-zinc-400">
                          [{new Date(log.timestamp).toLocaleString("ko-KR")}]
                        </span>{" "}
                        {log.message}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">결과물</CardTitle>
              </CardHeader>
              <CardContent>
                {task.artifacts.length === 0 ? (
                  <p className="text-sm text-zinc-400">아직 결과물이 없습니다.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {task.artifacts.map((artifact) => (
                      <li key={artifact.id}>{artifact.title} ({artifact.fileName})</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
