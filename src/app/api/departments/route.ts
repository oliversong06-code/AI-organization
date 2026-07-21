import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const departments = await prisma.department.findMany({
    where: { status: { not: "archived" } },
    include: {
      officeZone: { select: { key: true, name: true } },
      _count: { select: { employees: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ departments });
}
