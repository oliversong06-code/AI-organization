"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useOfficeZones } from "@/lib/hooks/useOfficeZones";
import { useDepartment } from "@/lib/hooks/useDepartments";

interface Props {
  zoneKey: string | null;
  onClose: () => void;
}

/** Doubles as the "부서 상세 패널" screen: a zone with no department shows
 * just the physical space info; a zone with a department shows the full
 * department detail (name, employees, etc). Departments are only ever
 * assigned to a zone through the propose→approve flow — there's no way to
 * create one from here. */
export function ZonePanel({ zoneKey, onClose }: Props) {
  const { zones, isLoading: zonesLoading } = useOfficeZones();
  const zone = zones.find((z) => z.key === zoneKey) ?? null;
  const departmentId = zone?.departments[0]?.id ?? null;
  const { department, isLoading: deptLoading } = useDepartment(departmentId);

  return (
    <Sheet open={!!zoneKey} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto">
        {zonesLoading && <p className="p-4 text-sm text-zinc-400">불러오는 중…</p>}
        {!zonesLoading && !zone && (
          <p className="p-4 text-sm text-zinc-400">공간 정보를 찾을 수 없습니다.</p>
        )}
        {zone && !departmentId && (
          <>
            <SheetHeader>
              <SheetTitle>{zone.name}</SheetTitle>
              <SheetDescription>물리적 사무실 공간</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6 text-sm text-zinc-500">
              이 공간에는 아직 배정된 부서가 없습니다. Claude Code에 부서 생성을 요청하면 이
              공간이 배정 후보로 제안될 수 있습니다.
            </div>
          </>
        )}
        {departmentId && deptLoading && <p className="p-4 text-sm text-zinc-400">불러오는 중…</p>}
        {department && (
          <>
            <SheetHeader>
              <SheetTitle>{department.name}</SheetTitle>
              <SheetDescription>{department.officeZone?.name}</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-6 text-sm">
              {department.description && <p className="text-zinc-700">{department.description}</p>}
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-400">소속 직원</div>
                {department.employees.length === 0 ? (
                  <p className="text-zinc-400">없음</p>
                ) : (
                  <ul className="space-y-1">
                    {department.employees.map((e) => (
                      <li key={e.id} className="flex items-center justify-between">
                        <span className="text-zinc-700">{e.name}</span>
                        <Badge variant="secondary">{e.status}</Badge>
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
