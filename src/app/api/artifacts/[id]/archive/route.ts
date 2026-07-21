import { NextResponse } from "next/server";
import { idParamSchema } from "@/lib/zod-schemas/common";
import { assertSameOrigin, CrossOriginRequestError } from "@/lib/csrf";
import { archiveArtifact } from "@/lib/controls/artifactControl";

const ERROR_STATUS: Record<string, number> = { not_found: 404, invalid_state: 409 };

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
  const result = await archiveArtifact(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: ERROR_STATUS[result.code] ?? 400 });
  }
  return NextResponse.json({ ok: true });
}
