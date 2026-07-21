import { NextResponse } from "next/server";
import { idParamSchema } from "@/lib/zod-schemas/common";
import { approveApprovalRequest } from "@/lib/approvals/materialize";
import { assertSameOrigin, CrossOriginRequestError } from "@/lib/csrf";

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
  try {
    assertSameOrigin(req);
  } catch (err) {
    if (err instanceof CrossOriginRequestError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const { id } = idParamSchema.parse(await context.params);
  // TODO(step 14): also require the local session-token header here.
  const result = await approveApprovalRequest(id, "user");

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: ERROR_STATUS[result.code] ?? 400 }
    );
  }
  return NextResponse.json({ ok: true, entityId: result.entityId });
}
