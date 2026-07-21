import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [company, employees, departments, tasks, automations, artifacts, pendingApprovals] =
    await Promise.all([
      prisma.company.findFirst(),
      prisma.employee.count({ where: { status: { not: "archived" } } }),
      prisma.department.count({ where: { status: { not: "archived" } } }),
      prisma.task.count({ where: { status: { not: "archived" } } }),
      prisma.automation.count({ where: { archivedAt: null } }),
      prisma.artifact.count(),
      prisma.approvalRequest.count({ where: { status: "pending" } }),
    ]);

  return NextResponse.json({
    company,
    counts: {
      employees,
      departments,
      tasks,
      automations,
      artifacts,
      pendingApprovals,
    },
  });
}
