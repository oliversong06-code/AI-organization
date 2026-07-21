import "dotenv/config";
import { prisma } from "../src/lib/prisma";

/**
 * One-time (but safely re-runnable) removal of the Phase 1 seed Skill
 * catalog (파일 작업/문서 작성/스프레드시트 처리/웹 검색/Google Drive
 * 동기화/GitHub 저장소 연동), per the Phase 2 P2-7 decision: those 6 rows
 * were never wired into the new instructions/allowedTools/compatibleRanks/
 * compatibleDepartments/validationStatus fields the schema grew in P2-1,
 * and the new register_skill/validate_skill/assign_skill tools replace
 * them going forward. Safety check inline (not just trusted from the
 * plan): refuses to delete any Skill that actually has an EmployeeSkill
 * link, so this can never silently detach a real assignment. Idempotent —
 * running it again when the catalog is already empty is a no-op.
 */
async function main() {
  const skills = await prisma.skill.findMany({ include: { employees: true } });

  const linked = skills.filter((s) => s.employees.length > 0);
  if (linked.length > 0) {
    throw new Error(
      `다음 스킬은 EmployeeSkill 연결이 있어 삭제를 중단합니다: ${linked.map((s) => s.name).join(", ")}`
    );
  }

  const idsToDelete = skills.map((s) => s.id);
  if (idsToDelete.length === 0) {
    console.log("삭제할 스킬이 없습니다 (이미 빈 카탈로그).");
    return;
  }

  const result = await prisma.skill.deleteMany({ where: { id: { in: idsToDelete } } });
  console.log(`삭제된 스킬: ${result.count}개 (${skills.map((s) => s.name).join(", ")})`);

  const remainingSkills = await prisma.skill.count();
  const remainingLinks = await prisma.employeeSkill.count();
  console.log(`최종 상태: skill=${remainingSkills}, employeeSkill=${remainingLinks}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
