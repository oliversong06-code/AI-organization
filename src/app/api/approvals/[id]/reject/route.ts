import { NextResponse } from "next/server";
import { z } from "zod";
import { idParamSchema } from "@/lib/zod-schemas/common";
import { rejectApprovalRequest } from "@/lib/approvals/materialize";
import { csrfGuard } from "@/lib/csrf";

const ERROR_STATUS: Record<string, number> = {
  not_found: 404,
  not_pending: 409,
  expired: 409,
};

const bodySchema = z.object({ reason: z.string().min(1) });

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await csrfGuard(req);
  if (blocked) return blocked;

  const { id } = idParamSchema.parse(await context.params);
  const { reason } = bodySchema.parse(await req.json());
  const result = await rejectApprovalRequest(id, reason, "user");

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: ERROR_STATUS[result.code] ?? 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
