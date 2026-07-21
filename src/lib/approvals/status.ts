import { prisma } from "@/lib/prisma";

/** Third of the three expiresAt enforcement points (the other two are the
 * approvals list/detail routes and approveApprovalRequest itself). Used by
 * the MCP get_approval_status tool so Claude Code sees "expired" rather
 * than a stale "pending" if it polls after the deadline passed. */
export async function getApprovalStatus(id: string) {
  const request = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!request) return null;

  if (request.status === "pending" && request.expiresAt.getTime() < Date.now()) {
    return prisma.approvalRequest.update({ where: { id }, data: { status: "expired" } });
  }
  return request;
}
