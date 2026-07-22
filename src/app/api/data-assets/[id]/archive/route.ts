import { NextResponse } from "next/server";
import { idParamSchema } from "@/lib/zod-schemas/common";
import { csrfGuard } from "@/lib/csrf";
import { archiveDataAsset } from "@/lib/direct/dataAssetDirect";

const ERROR_STATUS: Record<string, number> = { not_found: 404 };

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await csrfGuard(req);
  if (blocked) return blocked;
  const { id } = idParamSchema.parse(await context.params);
  const result = await archiveDataAsset(id, "user");
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: ERROR_STATUS[result.code] ?? 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
