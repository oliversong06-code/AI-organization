import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/zod-schemas/common";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = idParamSchema.parse(await context.params);

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignedEmployee: { select: { id: true, name: true } },
      steps: { orderBy: { stepNumber: "asc" } },
      logs: { orderBy: { timestamp: "asc" } },
      artifacts: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!task) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }

  return NextResponse.json({ task });
}
