import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { csrfGuard } from "@/lib/csrf";
import { logActivity } from "@/lib/activity-log";
import { withTransaction } from "@/lib/withTransaction";
import type { Prisma } from "@/generated/prisma/client";

export async function GET() {
  const settings = await prisma.appSetting.findMany({ orderBy: { key: "asc" } });
  return NextResponse.json({ settings });
}

// Direct user preferences only — no approval gate needed (plan §4/§14).
// Only these keys are editable from the settings screen; everything else
// (sync folder path) comes from an approved Integration instead.
const EDITABLE_KEYS: Record<string, z.ZodTypeAny> = {
  approval_default_expiry_hours: z.number().int().positive().max(168),
};

const bodySchema = z.object({ key: z.string(), value: z.unknown() });

export async function PATCH(req: Request) {
  const blocked = await csrfGuard(req);
  if (blocked) return blocked;

  const { key, value } = bodySchema.parse(await req.json());
  const valueSchema = EDITABLE_KEYS[key];
  if (!valueSchema) {
    return NextResponse.json({ error: "이 설정은 여기서 직접 변경할 수 없습니다" }, { status: 403 });
  }
  const parsed = valueSchema.safeParse(value);
  if (!parsed.success) {
    return NextResponse.json({ error: "값이 올바르지 않습니다" }, { status: 422 });
  }

  await withTransaction(async (tx) => {
    await tx.appSetting.update({ where: { key }, data: { value: parsed.data as Prisma.InputJsonValue } });
    await logActivity(tx, { actor: "user", action: "setting.update", detail: { key, value: parsed.data } });
  });

  return NextResponse.json({ ok: true });
}
