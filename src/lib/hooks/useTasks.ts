import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr-fetcher";
import type { TaskPriority, TaskStatus } from "@/lib/enums";

export interface TaskListItem {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  assignedEmployee: { id: string; name: string } | null;
  _count: { artifacts: number; logs: number };
  createdAt: string;
}

export interface TaskDetail extends TaskListItem {
  description: string;
  resultSummary: string | null;
  errorMessage: string | null;
  retryable: boolean;
  createdAt: string;
  approvedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  steps: Array<{ id: string; stepNumber: number; title: string; status: string }>;
  logs: Array<{ id: string; timestamp: string; level: string; message: string }>;
  artifacts: Array<{ id: string; title: string; fileName: string; createdAt: string }>;
}

export function useTasks() {
  const { data, error, isLoading } = useSWR<{ tasks: TaskListItem[] }>(
    "/api/tasks",
    jsonFetcher,
    { refreshInterval: 4000 }
  );
  return { tasks: data?.tasks ?? [], isLoading, error };
}

export function useTask(id: string | null) {
  const { data, error, isLoading } = useSWR<{ task: TaskDetail }>(
    id ? `/api/tasks/${id}` : null,
    jsonFetcher,
    { refreshInterval: 4000 }
  );
  return { task: data?.task ?? null, isLoading, error };
}
