import { NextResponse } from "next/server";
import { idParamSchema } from "@/lib/zod-schemas/common";
import { csrfGuard } from "@/lib/csrf";
import { scanIntegrationForManifests } from "@/lib/manifest-scanner";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await csrfGuard(req);
  if (blocked) return blocked;
  const { id } = idParamSchema.parse(await context.params);
  try {
    const result = await scanIntegrationForManifests(id);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "scan failed" }, { status: 400 });
  }
}
