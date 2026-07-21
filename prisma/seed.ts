import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { Prisma } from "../src/generated/prisma/client";

/**
 * Seeds ONLY what the plan allows as initial data: one Company row, the
 * physical office zones (not departments), default AppSettings, and a
 * Skill catalog with everything installed:false/enabled:false. No
 * employees, departments, tasks, automations, artifacts, or approval
 * requests are ever created here.
 */

const OFFICE_ZONES = [
  {
    key: "open-workspace-1",
    name: "개방형 업무 공간 1",
    kind: "open_workspace",
    rectNormX0: 0.05,
    rectNormY0: 0.08,
    rectNormX1: 0.38,
    rectNormY1: 0.46,
  },
  {
    key: "open-workspace-2",
    name: "개방형 업무 공간 2",
    kind: "open_workspace",
    rectNormX0: 0.05,
    rectNormY0: 0.52,
    rectNormX1: 0.38,
    rectNormY1: 0.92,
  },
  {
    key: "private-office-1",
    name: "독립 사무 공간",
    kind: "private_office",
    rectNormX0: 0.42,
    rectNormY0: 0.08,
    rectNormX1: 0.62,
    rectNormY1: 0.4,
  },
  {
    key: "meeting-room-1",
    name: "회의 공간",
    kind: "meeting_room",
    rectNormX0: 0.42,
    rectNormY0: 0.46,
    rectNormX1: 0.62,
    rectNormY1: 0.78,
  },
  {
    key: "lounge-1",
    name: "휴게 공간",
    kind: "lounge",
    rectNormX0: 0.42,
    rectNormY0: 0.82,
    rectNormX1: 0.62,
    rectNormY1: 0.95,
  },
  {
    key: "artifact-area-1",
    name: "공용 결과물 공간",
    kind: "artifact_area",
    rectNormX0: 0.66,
    rectNormY0: 0.08,
    rectNormX1: 0.95,
    rectNormY1: 0.92,
  },
] as const;

const APP_SETTINGS: Array<{ key: string; value: unknown }> = [
  { key: "sync_folder_path", value: null },
  { key: "approval_default_expiry_hours", value: 24 },
  { key: "workspace_artifacts_path", value: "workspace/artifacts" },
];

const SKILL_CATALOG = [
  {
    name: "파일 작업",
    description: "workspace 내 파일 읽기/쓰기, 결과물 저장",
    category: "core",
    source: "builtin",
    connectionType: "none",
    inputSchema: {},
    outputSchema: {},
    permissions: ["workspace:read", "workspace:write"],
    healthStatus: "available",
  },
  {
    name: "문서 작성",
    description: "Markdown/TXT 보고서 및 요약 문서 생성",
    category: "core",
    source: "builtin",
    connectionType: "none",
    inputSchema: {},
    outputSchema: {},
    permissions: ["workspace:write"],
    healthStatus: "available",
  },
  {
    name: "스프레드시트 처리",
    description: "Excel/CSV 파일 미리보기, 시트 읽기, 결과 파일 생성",
    category: "data",
    source: "builtin",
    connectionType: "none",
    inputSchema: {},
    outputSchema: {},
    permissions: ["workspace:read", "workspace:write"],
    healthStatus: "available",
  },
  {
    name: "웹 검색",
    description: "외부 웹 검색으로 자료 조사",
    category: "research",
    source: "external",
    connectionType: "api_key",
    inputSchema: {},
    outputSchema: {},
    permissions: ["network:external"],
    healthStatus: "installation_required",
  },
  {
    name: "Google Drive 동기화",
    description: "사용자가 승인한 로컬 동기화 폴더에서 클라우드 결과물 manifest 가져오기",
    category: "sync",
    source: "external",
    connectionType: "oauth_stub",
    inputSchema: {},
    outputSchema: {},
    permissions: ["external_folder:read"],
    healthStatus: "installation_required",
  },
  {
    name: "GitHub 저장소 연동",
    description: "GitHub 저장소를 통한 결과물 동기화(사용자 승인 필요)",
    category: "sync",
    source: "external",
    connectionType: "oauth_stub",
    inputSchema: {},
    outputSchema: {},
    permissions: ["external_folder:read"],
    healthStatus: "installation_required",
  },
] as const;

async function main() {
  const companyCount = await prisma.company.count();
  if (companyCount === 0) {
    await prisma.company.create({
      data: {
        name: "AI 회사",
        description: "Claude Code가 자연어 요청에 따라 운영하는 로컬 가상 회사",
      },
    });
    console.log("Created Company");
  } else {
    console.log("Company already exists, skipping");
  }

  for (const zone of OFFICE_ZONES) {
    await prisma.officeZone.upsert({
      where: { key: zone.key },
      update: {},
      create: zone,
    });
  }
  console.log(`Ensured ${OFFICE_ZONES.length} OfficeZone rows`);

  for (const setting of APP_SETTINGS) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: {
        key: setting.key,
        value: setting.value === null ? Prisma.JsonNull : (setting.value as Prisma.InputJsonValue),
      },
    });
  }
  console.log(`Ensured ${APP_SETTINGS.length} AppSetting rows`);

  for (const skill of SKILL_CATALOG) {
    const existing = await prisma.skill.findFirst({ where: { name: skill.name } });
    if (!existing) {
      await prisma.skill.create({
        data: {
          ...skill,
          enabled: false,
          installed: false,
        },
      });
    }
  }
  console.log(`Ensured ${SKILL_CATALOG.length} Skill catalog rows`);

  const [employees, departments, tasks, automations, artifacts, approvals] = await Promise.all([
    prisma.employee.count(),
    prisma.department.count(),
    prisma.task.count(),
    prisma.automation.count(),
    prisma.artifact.count(),
    prisma.approvalRequest.count(),
  ]);
  console.log({ employees, departments, tasks, automations, artifacts, approvals });
  if (employees || departments || tasks || automations || artifacts || approvals) {
    throw new Error(
      "Zero-state violated: seed must not create employees/departments/tasks/automations/artifacts/approvals"
    );
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
