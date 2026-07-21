import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const automations = await prisma.automation.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ automations });
}
