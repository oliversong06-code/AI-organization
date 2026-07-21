import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/zod-schemas/common";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = idParamSchema.parse(await context.params);

  const artifact = await prisma.artifact.findUnique({
    where: { id },
    include: { task: { select: { id: true, title: true, requiredSkills: true } } },
  });
  if (!artifact) {
    return NextResponse.json({ error: "artifact not found" }, { status: 404 });
  }
  const employee = artifact.employeeId
    ? await prisma.employee.findUnique({ where: { id: artifact.employeeId }, select: { id: true, name: true } })
    : null;

  return NextResponse.json({ artifact: { ...artifact, employee } });
}
