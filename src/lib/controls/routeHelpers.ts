import { NextResponse } from "next/server";
import { idParamSchema } from "@/lib/zod-schemas/common";
import { assertSameOrigin, CrossOriginRequestError } from "@/lib/csrf";
import { applyTaskUserControl } from "./taskControl";
import { applyAutomationUserControl, type AutomationControlTransition } from "./automationControl";
import type { UserControlTransition } from "@/lib/taskTransitions";

const ERROR_STATUS: Record<string, number> = { not_found: 404, invalid_state: 409 };

export function makeTaskControlHandler(transition: UserControlTransition) {
  return async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
    try {
      assertSameOrigin(req);
    } catch (err) {
      if (err instanceof CrossOriginRequestError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      throw err;
    }
    const { id } = idParamSchema.parse(await context.params);
    const result = await applyTaskUserControl(id, transition);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: ERROR_STATUS[result.code] ?? 400 }
      );
    }
    return NextResponse.json({ ok: true });
  };
}

export function makeAutomationControlHandler(transition: AutomationControlTransition) {
  return async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
    try {
      assertSameOrigin(req);
    } catch (err) {
      if (err instanceof CrossOriginRequestError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      throw err;
    }
    const { id } = idParamSchema.parse(await context.params);
    const result = await applyAutomationUserControl(id, transition);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: ERROR_STATUS[result.code] ?? 400 }
      );
    }
    return NextResponse.json({ ok: true });
  };
}
