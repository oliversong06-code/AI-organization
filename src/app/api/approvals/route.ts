import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Lists approval requests, lazily flipping any pending-but-expired row to
 * status="expired" first — one of the three enforcement points for
 * expiresAt (the others are the approve attempt itself and MCP's
 * get_approval_status, added in step 15).
 */
export async function GET() {
  const now = new Date();
  await prisma.approvalRequest.updateMany({
    where: { status: "pending", expiresAt: { lt: now } },
    data: { status: "expired" },
  });

  const approvals = await prisma.approvalRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ approvals });
}
