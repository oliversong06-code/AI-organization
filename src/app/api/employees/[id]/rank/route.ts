import { NextResponse } from "next/server";
import { z } from "zod";
import { idParamSchema } from "@/lib/zod-schemas/common";
import { csrfGuard } from "@/lib/csrf";
import { changeEmployeeRank } from "@/lib/direct/employeeDirect";
import { employeeRankSchema } from "@/lib/enums";

const ERROR_STATUS: Record<string, number> = { not_found: 404, forbidden: 403 };
const bodySchema = z.object({ newRank: employeeRankSchema });

// User-direct-control only: authorizedBy is always "user" here — a rank-4
// employee authorizing a change (authorizedBy: "rank4_employee") only ever
// happens through the update_employee_rank MCP tool, not this route.
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await csrfGuard(req);
  if (blocked) return blocked;
  const { id } = idParamSchema.parse(await context.params);
  const { newRank } = bodySchema.parse(await req.json());
  const result = await changeEmployeeRank(id, newRank, "user");
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: ERROR_STATUS[result.code] ?? 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
