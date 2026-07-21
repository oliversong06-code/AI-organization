import { NextResponse } from "next/server";
import { idParamSchema } from "@/lib/zod-schemas/common";
import { assertSameOrigin, CrossOriginRequestError } from "@/lib/csrf";
import { scanIntegrationForManifests } from "@/lib/manifest-scanner";

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
  try {
    const result = await scanIntegrationForManifests(id);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "scan failed" }, { status: 400 });
  }
}
