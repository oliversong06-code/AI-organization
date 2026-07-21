import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/zod-schemas/common";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = idParamSchema.parse(await context.params);
  const automation = await prisma.automation.findUnique({
    where: { id },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  if (!automation) {
    return NextResponse.json({ error: "automation not found" }, { status: 404 });
  }
  return NextResponse.json({ automation });
}
