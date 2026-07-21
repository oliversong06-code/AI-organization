import { NextResponse } from "next/server";
import { idParamSchema } from "@/lib/zod-schemas/common";
import { approveApprovalRequest } from "@/lib/approvals/materialize";
import { csrfGuard } from "@/lib/csrf";

const ERROR_STATUS: Record<string, number> = {
  not_found: 404,
  not_pending: 409,
  expired: 409,
  unknown_action: 422,
  invalid_payload: 422,
  version_conflict: 409,
  target_not_found: 404,
  invalid_state: 409,
};

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await csrfGuard(req);
  if (blocked) return blocked;

  const { id } = idParamSchema.parse(await context.params);
  const result = await approveApprovalRequest(id, "user");

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: ERROR_STATUS[result.code] ?? 400 }
    );
  }
  return NextResponse.json({ ok: true, entityId: result.entityId });
}
