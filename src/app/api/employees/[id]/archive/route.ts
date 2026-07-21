import { NextResponse } from "next/server";
import { idParamSchema } from "@/lib/zod-schemas/common";
import { csrfGuard } from "@/lib/csrf";
import { archiveEmployee } from "@/lib/direct/employeeDirect";

const ERROR_STATUS: Record<string, number> = { not_found: 404 };

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await csrfGuard(req);
  if (blocked) return blocked;
  const { id } = idParamSchema.parse(await context.params);
  const result = await archiveEmployee(id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: ERROR_STATUS[result.code] ?? 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
