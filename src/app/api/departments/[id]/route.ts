import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/zod-schemas/common";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = idParamSchema.parse(await context.params);

  const department = await prisma.department.findUnique({
    where: { id },
    include: {
      officeZone: { select: { key: true, name: true, kind: true } },
      employees: {
        where: { status: { not: "archived" } },
        select: { id: true, name: true, role: true, status: true },
      },
    },
  });

  if (!department) {
    return NextResponse.json({ error: "department not found" }, { status: 404 });
  }

  return NextResponse.json({ department });
}
