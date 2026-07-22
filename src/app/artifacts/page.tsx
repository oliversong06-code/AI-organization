"use client";

import { mutationFetch } from "@/lib/mutationFetch";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useArtifacts, type ArtifactListItem } from "@/lib/hooks/useArtifacts";
import { useDepartments } from "@/lib/hooks/useDepartments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderOpen } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  pending: "검수중",
  reviewing: "검수중",
  approved: "최종",
  revision_requested: "수정요청",
  rejected: "반려",
  blocked: "차단",
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "approved", label: "최종" },
  { value: "reviewing", label: "검수중" },
  { value: "revision_requested", label: "수정요청" },
  { value: "rejected", label: "반려" },
  { value: "blocked", label: "차단" },
  { value: "archived", label: "보관" },
];

const ALL = "all";

function statusBadgeVariant(status: string): "secondary" | "outline" | "destructive" {
  if (status === "approved") return "secondary";
  if (status === "rejected" || status === "blocked") return "destructive";
  return "outline";
}

export default function ArtifactsPage() {
  const { artifacts, isLoading, mutate } = useArtifacts();
  const { departments } = useDepartments();
  const [deptTab, setDeptTab] = useState<string>("company");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [employeeFilter, setEmployeeFilter] = useState(ALL);
  const [importanceFilter, setImportanceFilter] = useState(ALL);
  const [formatFilter, setFormatFilter] = useState(ALL);
  const [reviewerFilter, setReviewerFilter] = useState(ALL);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [versionsOnly, setVersionsOnly] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const byDeptTab = useMemo(
    () =>
      artifacts.filter((a) => (deptTab === "company" ? !a.department : a.department?.id === deptTab)),
    [artifacts, deptTab]
  );

  const employeeOptions = useMemo(
    () => uniqueBy(byDeptTab.map((a) => a.employee).filter(Boolean) as Array<{ id: string; name: string }>),
    [byDeptTab]
  );
  const formatOptions = useMemo(
    () => [...new Set(byDeptTab.map((a) => a.latestVersion?.format).filter(Boolean) as string[])],
    [byDeptTab]
  );
  const reviewerOptions = useMemo(
    () => uniqueBy(byDeptTab.map((a) => a.currentReviewer).filter(Boolean) as Array<{ id: string; name: string }>),
    [byDeptTab]
  );

  const visible = useMemo(() => {
    let list = byDeptTab.filter((a) => {
      if (statusFilter === "archived") return !!a.archivedAt;
      if (a.archivedAt) return false; // archived items only ever show under the "보관" filter
      if (statusFilter === ALL) return true;
      if (statusFilter === "reviewing") return a.currentReviewStatus === "pending" || a.currentReviewStatus === "reviewing";
      return a.currentReviewStatus === statusFilter;
    });
    if (employeeFilter !== ALL) list = list.filter((a) => a.employee?.id === employeeFilter);
    if (importanceFilter !== ALL) list = list.filter((a) => a.importance === Number(importanceFilter));
    if (formatFilter !== ALL) list = list.filter((a) => a.latestVersion?.format === formatFilter);
    if (reviewerFilter !== ALL) list = list.filter((a) => a.currentReviewer?.id === reviewerFilter);
    if (versionsOnly) list = list.filter((a) => (a.latestVersion?.versionNumber ?? 1) > 1);

    list = [...list].sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortOrder === "newest" ? -diff : diff;
    });
    return list;
  }, [byDeptTab, statusFilter, employeeFilter, importanceFilter, formatFilter, reviewerFilter, versionsOnly, sortOrder]);

  async function handleArchive(id: string) {
    setBusyId(id);
    try {
      const res = await mutationFetch(`/api/artifacts/${id}/archive`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "보관 처리에 실패했습니다");
      } else {
        toast.success("보관되었습니다");
        mutate();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-zinc-900">결과물 보관함</h1>
        <p className="text-sm text-zinc-500">
          담당 직원이 있는 결과물은 사무실의 직원 위 말풍선으로도 표시됩니다.
        </p>
      </header>
      <main className="flex-1 space-y-4 p-6">
        <Tabs value={deptTab} onValueChange={setDeptTab}>
          <TabsList>
            <TabsTrigger value="company">회사 공용</TabsTrigger>
            {departments.map((d) => (
              <TabsTrigger key={d.id} value={d.id}>
                {d.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap gap-2">
          <FilterSelect label="상태" value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} />
          <FilterSelect
            label="담당자"
            value={employeeFilter}
            onChange={setEmployeeFilter}
            options={[{ value: ALL, label: "전체" }, ...employeeOptions.map((e) => ({ value: e.id, label: e.name }))]}
          />
          <FilterSelect
            label="중요도"
            value={importanceFilter}
            onChange={setImportanceFilter}
            options={[
              { value: ALL, label: "전체" },
              { value: "1", label: "1" },
              { value: "2", label: "2" },
              { value: "3", label: "3" },
              { value: "4", label: "4" },
            ]}
          />
          <FilterSelect
            label="형식"
            value={formatFilter}
            onChange={setFormatFilter}
            options={[{ value: ALL, label: "전체" }, ...formatOptions.map((f) => ({ value: f, label: f }))]}
          />
          <FilterSelect
            label="검수자"
            value={reviewerFilter}
            onChange={setReviewerFilter}
            options={[{ value: ALL, label: "전체" }, ...reviewerOptions.map((r) => ({ value: r.id, label: r.name }))]}
          />
          <FilterSelect
            label="생성일"
            value={sortOrder}
            onChange={(v) => setSortOrder(v as "newest" | "oldest")}
            options={[
              { value: "newest", label: "최신순" },
              { value: "oldest", label: "오래된순" },
            ]}
          />
          <Button size="sm" variant={versionsOnly ? "default" : "outline"} onClick={() => setVersionsOnly((v) => !v)}>
            수정 이력만
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-zinc-400">불러오는 중…</p>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-white py-24 text-center">
            <FolderOpen className="h-8 w-8 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-600">해당 조건의 결과물이 없습니다</p>
            <p className="max-w-sm text-sm text-zinc-400">
              업무가 완료되면 결과물이 여기와 담당 직원 위 말풍선에 나타납니다.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((a) => (
              <ArtifactCard key={a.id} artifact={a} busy={busyId === a.id} onArchive={() => handleArchive(a.id)} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ArtifactCard({
  artifact: a,
  busy,
  onArchive,
}: {
  artifact: ArtifactListItem;
  busy: boolean;
  onArchive: () => void;
}) {
  const effectiveStatus = a.archivedAt ? "archived" : a.currentReviewStatus;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{a.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {a.summary && <p className="text-zinc-600">{a.summary}</p>}
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">{a.employee?.name ?? "공용"}</Badge>
          {a.department && <Badge variant="outline">{a.department.name}</Badge>}
          <Badge variant={statusBadgeVariant(effectiveStatus)}>
            {effectiveStatus === "archived" ? "보관" : STATUS_LABELS[effectiveStatus] ?? effectiveStatus}
          </Badge>
          <Badge variant="outline">중요도 {a.importance}</Badge>
          {a.latestVersion && <Badge variant="outline">v{a.latestVersion.versionNumber}</Badge>}
          {a.currentReviewer && <Badge variant="outline">검수자: {a.currentReviewer.name}</Badge>}
          {a.task && <Badge variant="outline">{a.task.title}</Badge>}
        </div>
        <p className="text-xs text-zinc-400">
          {new Date(a.createdAt).toLocaleString("ko-KR")} · {a.fileName}
        </p>
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" render={<a href={`/api/artifacts/${a.id}/download`} />}>
            다운로드
          </Button>
          {!a.archivedAt && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onArchive}>
              보관
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const labelByValue = new Map(options.map((opt) => [opt.value, opt.label]));

  return (
    <Select value={value} onValueChange={(v) => onChange(v as string)}>
      <SelectTrigger size="sm">
        <SelectValue placeholder={label}>
          {(v: string) => `${label}: ${labelByValue.get(v) ?? v}`}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function uniqueBy<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) seen.set(item.id, item);
  return [...seen.values()];
}
