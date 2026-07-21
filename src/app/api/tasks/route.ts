import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const tasks = await prisma.task.findMany({
    where: { status: { not: "archived" } },
    include: {
      assignedEmployee: { select: { id: true, name: true } },
      _count: { select: { artifacts: true, logs: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ tasks });
}
