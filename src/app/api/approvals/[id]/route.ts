import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/zod-schemas/common";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = idParamSchema.parse(await context.params);

  const approval = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!approval) {
    return NextResponse.json({ error: "approval not found" }, { status: 404 });
  }

  if (approval.status === "pending" && approval.expiresAt.getTime() < Date.now()) {
    const expired = await prisma.approvalRequest.update({
      where: { id },
      data: { status: "expired" },
    });
    return NextResponse.json({ approval: expired });
  }

  return NextResponse.json({ approval });
}
