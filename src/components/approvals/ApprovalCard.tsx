"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
import type { ApprovalListItem } from "@/lib/hooks/useApprovals";

const ENTITY_LABEL: Record<string, string> = {
  department: "부서",
  employee: "직원",
  task: "업무",
  automation: "자동화",
  skill: "스킬",
  integration: "연동",
};

const ACTION_LABEL: Record<string, string> = {
  create: "생성",
  update: "수정",
  archive: "보관",
  move: "이동",
  assign: "담당자 배정",
  install_request: "설치",
  disable: "비활성화",
  configure: "구성",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "대기 중",
  approved: "승인됨",
  rejected: "거절됨",
  expired: "만료됨",
};

// Fields the spec calls out explicitly (필요한 권한/연결될 스킬/접근할 파일) get a
// dedicated row when present in the payload; everything else falls back to
// a generic key/value dump so this works across all 6 entity types without
// a bespoke preview component per entityType+action combination.
const HIGHLIGHT_FIELDS: Array<{ key: string; label: string }> = [
  { key: "requiredSkills", label: "연결될 스킬" },
  { key: "requestedPermissions", label: "필요한 권한" },
  { key: "inputFiles", label: "접근할 파일/데이터" },
];

interface Props {
  approval: ApprovalListItem;
  onResolved: () => void;
}

export function ApprovalCard({ approval, onResolved }: Props) {
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  const isPending = approval.status === "pending";
  const expiresAt = new Date(approval.expiresAt);
  const isSensitive = approval.riskLevel === "sensitive";

  async function handleApprove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/approvals/${approval.id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "승인 처리에 실패했습니다");
      } else {
        toast.success("승인되어 반영되었습니다");
        onResolved();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    try {
      const res = await fetch(`/api/approvals/${approval.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason || "사유 없음" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "거절 처리에 실패했습니다");
      } else {
        toast.success("거절되었습니다");
        onResolved();
      }
    } finally {
      setBusy(false);
    }
  }

  const highlighted = HIGHLIGHT_FIELDS.filter(
    ({ key }) => Array.isArray(approval.payload[key]) && (approval.payload[key] as unknown[]).length > 0
  );
  const highlightedKeys = new Set(highlighted.map((h) => h.key));
  const remainingEntries = Object.entries(approval.payload).filter(([k]) => !highlightedKeys.has(k));

  return (
    <Card className={isSensitive ? "border-red-300" : undefined}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Badge variant="secondary">
            {ENTITY_LABEL[approval.entityType] ?? approval.entityType} ·{" "}
            {ACTION_LABEL[approval.action] ?? approval.action}
          </Badge>
          <Badge variant={isPending ? "default" : "outline"}>
            {STATUS_LABEL[approval.status] ?? approval.status}
          </Badge>
          {isSensitive && <Badge variant="destructive">민감 작업</Badge>}
          <span className="ml-auto text-xs font-normal text-zinc-400">
            {isPending ? `만료: ${expiresAt.toLocaleString("ko-KR")}` : ""}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-zinc-800">{approval.summary}</p>

        {highlighted.map(({ key, label }) => (
          <div key={key}>
            <div className="mb-1 text-xs font-medium text-zinc-400">{label}</div>
            <div className="flex flex-wrap gap-1">
              {(approval.payload[key] as string[]).map((v) => (
                <Badge key={v} variant="outline">
                  {v}
                </Badge>
              ))}
            </div>
          </div>
        ))}

        {remainingEntries.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-400">생성/변경 예정 정보</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-zinc-600">
              {remainingEntries.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-zinc-400">{k}</dt>
                  <dd className="truncate">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {approval.status === "rejected" && approval.rejectionReason && (
          <p className="text-red-600">거절 사유: {approval.rejectionReason}</p>
        )}

        {isPending && (
          <div className="flex items-center gap-2 pt-2">
            <AlertDialog>
              <AlertDialogTrigger render={<Button size="sm" disabled={busy} />}>
                승인
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>이 제안을 승인할까요?</AlertDialogTitle>
                  <AlertDialogDescription>{approval.summary}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={handleApprove}>승인</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger render={<Button size="sm" variant="outline" disabled={busy} />}>
                거절
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>이 제안을 거절할까요?</AlertDialogTitle>
                  <AlertDialogDescription>거절 사유를 남겨주세요.</AlertDialogDescription>
                </AlertDialogHeader>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="예: 지금은 필요하지 않습니다"
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReject}>거절</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
