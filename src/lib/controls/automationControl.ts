import { prisma } from "@/lib/prisma";
import { withTransaction } from "@/lib/withTransaction";
import { logActivity } from "@/lib/activity-log";

export type AutomationControlTransition = "pause" | "resume" | "archive";

export type ControlResult =
  | { ok: true }
  | { ok: false; error: string; code: "not_found" | "invalid_state" };

/** User-direct-control only (no MCP tool). Automation has no separate
 * status enum — pause/resume just flip `enabled`, archive sets
 * `archivedAt`. propose_automation only ever handles create|update. */
export async function applyAutomationUserControl(
  automationId: string,
  transition: AutomationControlTransition
): Promise<ControlResult> {
  const automation = await prisma.automation.findUnique({ where: { id: automationId } });
  if (!automation) return { ok: false, error: "자동화를 찾을 수 없습니다", code: "not_found" };
  if (automation.archivedAt) {
    return { ok: false, error: "이미 보관된 자동화입니다", code: "invalid_state" };
  }
  if (transition === "pause" && !automation.enabled) {
    return { ok: false, error: "이미 일시정지 상태입니다", code: "invalid_state" };
  }
  if (transition === "resume" && automation.enabled) {
    return { ok: false, error: "이미 실행 중입니다", code: "invalid_state" };
  }

  await withTransaction(async (tx) => {
    if (transition === "pause") {
      await tx.automation.update({
        where: { id: automationId },
        data: { enabled: false, version: { increment: 1 } },
      });
    } else if (transition === "resume") {
      await tx.automation.update({
        where: { id: automationId },
        data: { enabled: true, version: { increment: 1 } },
      });
    } else if (transition === "archive") {
      await tx.automation.update({
        where: { id: automationId },
        data: { enabled: false, archivedAt: new Date(), version: { increment: 1 } },
      });
    }
    await logActivity(tx, {
      actor: "user",
      action: `automation.${transition}`,
      entityType: "automation",
      entityId: automationId,
    });
  });

  return { ok: true };
}
