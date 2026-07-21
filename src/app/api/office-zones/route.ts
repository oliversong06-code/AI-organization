import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const zones = await prisma.officeZone.findMany({
    select: {
      id: true,
      key: true,
      name: true,
      kind: true,
      displayName: true,
      defaultDisplayName: true,
      departments: {
        where: { status: { not: "archived" } },
        select: { id: true, name: true },
      },
    },
    orderBy: { key: "asc" },
  });

  return NextResponse.json({ zones });
}
