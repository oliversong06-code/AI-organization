import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const dataAssets = await prisma.dataAsset.findMany({
    include: {
      department: { select: { id: true, name: true } },
      ownerEmployee: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ dataAssets });
}
