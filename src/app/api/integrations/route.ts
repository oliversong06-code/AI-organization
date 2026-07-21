import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const integrations = await prisma.integration.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ integrations });
}
