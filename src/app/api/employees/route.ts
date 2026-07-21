import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const employees = await prisma.employee.findMany({
    where: { status: { not: "archived" } },
    include: {
      department: { select: { id: true, name: true } },
      officeZone: { select: { key: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ employees });
}
