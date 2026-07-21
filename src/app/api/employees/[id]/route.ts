import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/zod-schemas/common";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = idParamSchema.parse(await context.params);

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true } },
      officeZone: { select: { key: true, name: true } },
      skills: { include: { skill: { select: { id: true, name: true, category: true } } } },
      assignedTasks: {
        where: { status: { not: "archived" } },
        select: { id: true, title: true, status: true, priority: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!employee) {
    return NextResponse.json({ error: "employee not found" }, { status: 404 });
  }

  const recentActivity = await prisma.activityLog.findMany({
    where: { entityType: "employee", entityId: id },
    orderBy: { timestamp: "desc" },
    take: 10,
  });

  return NextResponse.json({ employee, recentActivity });
}
