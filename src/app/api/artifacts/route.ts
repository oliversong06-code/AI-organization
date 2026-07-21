import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const artifacts = await prisma.artifact.findMany({
    where: { archivedAt: null },
    include: { task: { select: { id: true, title: true } } },
    orderBy: { createdAt: "desc" },
  });

  const employeeIds = [...new Set(artifacts.map((a) => a.employeeId).filter(Boolean))] as string[];
  const employees = employeeIds.length
    ? await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true } })
    : [];
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  return NextResponse.json({
    artifacts: artifacts.map((a) => ({ ...a, employee: a.employeeId ? employeeById.get(a.employeeId) ?? null : null })),
  });
}
