"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useArtifact } from "@/lib/hooks/useArtifacts";

export function ArtifactPanel({ artifactId, onClose }: { artifactId: string | null; onClose: () => void }) {
  const { artifact, isLoading } = useArtifact(artifactId);

  return (
    <Sheet open={!!artifactId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto">
        {isLoading && <p className="p-4 text-sm text-zinc-400">불러오는 중…</p>}
        {artifact && (
          <>
            <SheetHeader>
              <SheetTitle>{artifact.title}</SheetTitle>
              <SheetDescription>
                {new Date(artifact.createdAt).toLocaleString("ko-KR")} ·{" "}
                {artifact.employee?.name ?? "공용 결과물"}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-3 px-4 pb-6 text-sm">
              {artifact.summary && <p className="text-zinc-700">{artifact.summary}</p>}
              {artifact.task && <Badge variant="outline">관련 업무: {artifact.task.title}</Badge>}
              <p className="text-zinc-500">{artifact.fileName}</p>
              <Button size="sm" render={<a href={`/api/artifacts/${artifact.id}/download`} />}>
                다운로드
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
