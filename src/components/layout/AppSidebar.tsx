"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ListChecks,
  Repeat,
  FolderOpen,
  CheckSquare,
  Puzzle,
  Plug,
  History,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "사무실", icon: Building2 },
  { href: "/tasks", label: "업무", icon: ListChecks },
  { href: "/automations", label: "자동화", icon: Repeat },
  { href: "/artifacts", label: "결과물", icon: FolderOpen },
  { href: "/approvals", label: "승인함", icon: CheckSquare },
  { href: "/skills", label: "스킬/플러그인", icon: Puzzle },
  { href: "/integrations", label: "연동", icon: Plug },
  { href: "/activity", label: "활동 로그", icon: History },
  { href: "/settings", label: "설정", icon: Settings },
] as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex w-56 shrink-0 flex-col gap-0.5 border-r bg-white p-3">
      <div className="mb-2 px-2 text-sm font-semibold text-zinc-900">AI 회사 운영</div>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
              active
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
