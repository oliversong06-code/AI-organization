# 로컬 "AI 회사 운영 웹앱" 구현 계획

> 이 문서는 확정된 구현 계획의 저장본이다. 구현 중 계획이 바뀌면 **변경 이유와 내용을 이 파일에 반영**하되, 사용자의 핵심 요구사항(승인 우회 불가, zero-state 시작, 사람 없는 사무실, AI API 미직접호출 등)은 임의로 바꾸지 않는다.

## Context (왜 만드는가)

사용자는 Claude Code에 자연어로 지시하면 Claude가 가상의 "AI 회사"(부서·AI 직원·업무·자동화·결과물)를 만들고 운영해주는 로컬 전용 웹앱을 원한다. 앱 자체는 AI 판단을 하지 않는 순수한 **표시/승인/제어 계층**이고, 실제 판단과 실행은 Claude Code가 로컬 MCP 서버를 통해 수행한다. 핵심 제약: "사람이 전혀 없는 사무실", "승인 없이는 어떤 데이터도 생성되지 않는 zero-state", **Claude/MCP가 승인을 우회할 구조적 경로가 전혀 없어야 함**. 참고 이미지(`reference/워크스페이스.jpg`)는 디자인 참고용일 뿐 코드/에셋에 그대로 쓰지 않는다.

## 0. 환경 점검 및 프로젝트 이관 (완료)

- 원래 경로(OneDrive 동기화 폴더)는 SQLite WAL 손상/잠금, node_modules 동기화 부하 위험이 있어 `C:\dev\claude-office-app`으로 이관했다. `reference\워크스페이스.jpg`만 복사, 원본은 OneDrive에 보존.
- 이후 모든 파일 생성/명령은 이 경로를 명시적으로 대상으로 한다.
- `.mcp.json`/프로젝트 스킬은 Claude Code가 세션 시작 시점에 프로젝트 루트를 인식해야 발견되므로, 실제로 세션 재시작이 필요한 지점(15~17단계 부근)에서만 안내한다.
- Node v24.13.0, npm 11.6.2 확인됨.

## 1. 구현 가능 여부 및 구조

```
사용자 자연어 요청 → Claude Code 해석 → propose_* MCP 도구 호출(action 파라미터 포함)
→ ApprovalRequest만 생성(payload=JSON, 실제 엔티티 미생성)
→ 웹앱 승인함에 표시 → 사용자가 승인/거절 클릭
→ Next.js API가 approval-registry.ts의 action별 Zod 스키마로 재검증 후 실제 로우 생성/변경 + ActivityLog
→ 웹앱은 SWR 폴링으로 화면 갱신
```

추가로, **사용자가 웹앱에서 직접 클릭하는 Task/Automation 운영 제어**(일시정지·재개·취소·보관)는 확인창 + ActivityLog만으로 즉시 실행되며, Claude/MCP는 이 경로를 호출할 수 없다(§4).

## 2. 보안 원칙 적용 방식

- MCP는 allowlist 도구만 노출, stdio 전송만 사용(포트 미개방), 임의 SQL/셸 없음.
- Claude/MCP의 구성 변경(생성·수정·이동/배정·보관)은 예외 없이 ApprovalRequest 경유. 사용자 직접 제어(Task/Automation 일시정지 등)만 예외.
- `approve`/`reject`/`cancel_approval_request`는 MCP에 없음 — 웹앱 사용자 전용.
- **승인 실행 화이트리스트**(`src/lib/approval-registry.ts`): entityType+action 조합이 사전 등록된 것만 실행, 미등록 조합은 승인해도 무시.
- `expiresAt` 만료 검사는 승인함 조회·승인 시도·`get_approval_status` 3곳에서 강제.
- 경로 접근 2단계 allowlist: workspace 루트(rw), 승인된 외부 동기화 폴더만(ro).
- Next.js는 `127.0.0.1`에만 바인딩, mutation/승인 API는 same-origin 검증 + 로컬 세션 토큰(CSRF 방지).
- 모든 mutation은 `withTransaction`(트랜잭션+ActivityLog+SQLITE_BUSY 재시도)으로 강제. 영구 삭제 없음, 전부 archive.
- **테스트 DB는 `prisma/test.db`로 완전히 분리**하고 dev.db는 절대 건드리지 않는다.
- `git init`+`.gitignore`는 초기에 적용(완료), GitHub 원격 생성/push/외부 업로드는 사용자 승인 없이 하지 않는다.

## 3. 폴더 구조 (C:\dev\claude-office-app 기준)

```
/
├── IMPLEMENTATION_PLAN.md
├── .mcp.json
├── .claude/skills/company-manager/SKILL.md
├── .gitignore
├── .env (DATABASE_URL=file:./dev.db), .env.test (DATABASE_URL=file:./test.db)
├── prisma/schema.prisma, prisma/seed.ts, prisma/migrations/
├── src/
│   ├── app/  (화면 11개 + api/*, api/tasks/[id]/{pause,resume,cancel,archive},
│   │          api/automations/[id]/{pause,resume,archive})
│   ├── components/office/, components/panels/, components/approvals/, components/ui/
│   ├── lib/prisma.ts, lib/enums.ts, lib/zod-schemas/,
│   │   lib/approval-registry.ts, lib/taskTransitions.ts, lib/path-guard.ts,
│   │   lib/csrf.ts, lib/hooks/
│   └── store/
├── mcp-server/index.ts, mcp-server/tools/*.ts, mcp-server/lib/withTransaction.ts
├── public/office/office-empty.svg, office-scene.json, public/avatars/
├── scripts/check-env.ts, scripts/check-db-target.ts, start-windows.ps1
└── reference/워크스페이스.jpg, package.json, tsconfig.json, next.config.js, tailwind.config.ts, README.md
```

## 4. 핵심 설계 결정

### 승인 화이트리스트 (`src/lib/approval-registry.ts`)
```
department: { create, update, archive }
employee:   { create, update, move, archive }
task:       { create, update, assign, archive }
automation: { create, update }
skill:      { install_request, update, disable }
integration:{ configure, update, disable }
```
등록되지 않은 entityType/action 조합은 승인해도 실행하지 않는다. `propose_task`는 `action`(create\|update\|assign\|archive)을 받고 action별 Zod 스키마로 검증한다. **`task.create` 승인 시 실제 Task 행이 곧바로 `status="queued"`로 생성**된다. `draft`/`awaiting_approval`은 실제 Task 행의 상태가 아니라 승인함 표시용 가상 상태다.

### Task 상태 전이 (`src/lib/taskTransitions.ts` — 단일 진실 소스)

- MCP 직접 실행(승인 불필요): `queued→running`(start_task), `running→needs_review`(mark_task_needs_review), `running|needs_review→completed`(complete_task), `running|needs_review→failed`(fail_task), `add_task_log`(상태 불변).
- 승인 경유(propose_task): `create`(→queued 생성), `update`(필드 변경), `assign`(담당자 배정/변경), `archive`(대상은 `completed|failed|cancelled`만).
- 사용자 직접 제어(MCP 없음, 확인창+ActivityLog): `queued|running|needs_review→paused`(statusBeforePause 저장) / `paused→statusBeforePause` / `queued|running|needs_review|paused→cancelled` / `completed|failed|cancelled→archived`.
- 허용 안 된 전이는 웹 UI와 API 서버 양쪽에서 거부.

### Automation
`propose_automation`은 `create|update`만. pause/resume/archive는 `/api/automations/[id]/pause|resume|archive`(사용자 직접 클릭)에서만.

### 테스트 DB 분리
- `.env`(dev.db)/`.env.test`(test.db) 분리, PowerShell 비호환 `DATABASE_URL=... command` 형식 미사용, `dotenv-cli`/`cross-env` 사용.
- `npm run dev`→dev.db, `npm test`→test.db, `npm run test:studio`→test.db.
- `scripts/check-db-target.ts`가 실제 연결 DB 경로를 출력하고 dev.db면 즉시 중단.
- 캐릭터 렌더링 검증 포함 모든 테스트 데이터는 test.db에만. dev.db는 끝까지 전 항목 0건.

### 기타
- Employee/Department/Automation/Skill/Integration에 `version`. ApprovalRequest에 `idempotencyKey, entityVersion, expiresAt, resolvedAt, resolvedBy`.
- DB 반영은 SWR 폴링(일반 4초, 승인함 1.5초).
- 사무실: 배경 SVG+직원 레이어를 하나의 `<svg viewBox>`에 통합, `office-scene.json`으로 zone 좌표 계약. 사람 형태 SVG 아바타 + `EmployeeLayer`는 지금 구현, 렌더링 검증은 test.db에서만.
- 말풍선: 별도 테이블 없이 최신 완료 Artifact/ActivityLog 조회.
- SQLite: WAL + busy_timeout + SQLITE_BUSY 재시도.
- 초기 시드(dev.db, 허용): Company 1개, 물리적 OfficeZone들, AppSetting 기본값, Skill 카탈로그(installed:false). 그 외 전부 0.

## 5. 데이터 모델

`Company, OfficeZone, Department, Employee, Skill, EmployeeSkill, Task(+statusBeforePause), TaskStep, TaskLog, Artifact, TaskArtifact, Automation, AutomationRun, ApprovalRequest, Integration, ActivityLog, AppSetting, ImportedManifest`.

## 6. MCP 도구 (allowlist) — 총 28개

- 회사 상태(2): get_company_state, get_activity_logs
- 부서(3): list_departments, get_department, propose_department
- 직원(3): list_employees, get_employee, propose_employee
- 업무(8): list_tasks, get_task, propose_task / start_task, add_task_log, mark_task_needs_review, complete_task, fail_task
- 결과물(3): register_artifact, list_artifacts, get_artifact
- 자동화(3): list_automations, get_automation, propose_automation
- 스킬/연동(4): list_skills, propose_skill, list_integrations, propose_integration
- 승인(2): create_approval_request, get_approval_status

**존재하지 않는 도구**: approve_*/reject_*/cancel_approval_request/update_task_status/pause_task/resume_task/cancel_task/archive_task/pause_automation/archive_automation 및 직원·부서·자동화·스킬·연동 직접 변경 도구 전부.

## 7. 단계별 개발 계획 (진행 상황은 아래 "진행 로그"에 기록)

0. 프로젝트 이관 — **완료**
1. Next.js 스캐폴딩
2. shadcn/ui
3. 의존성 설치 + prisma init
4. schema.prisma + migrate dev, DATABASE_URL 실증, WAL/busy_timeout
5. seed.ts (dev.db)
6. office SVG + 직원 캐릭터, test.db에서만 렌더링 검증
7. 공용 Prisma 클라이언트 + 첫 읽기 API + SWR
8. 부서/직원/업무 읽기 전용 화면
9. 승인 자재화 플로우 + 승인함 UI
10. Task/Automation 사용자 직접 제어 API
11. 결과물 보관함 + 말풍선
12. 자동화 관리 + manifest 스캐너
13. 스킬/연동 레지스트리 화면
14. 활동 로그 + 설정 화면
15. 로컬 MCP 서버(28개 도구)
16. .mcp.json 등록 (세션 재시작 필요 시 안내)
17. company-manager 스킬 작성
18. 보안 테스트 + README + start-windows.ps1

## 8. 진행 로그

- 2026-07-21: 0단계 완료 — `C:\dev\claude-office-app` 생성, reference 이미지 이관, git init(main 브랜치), .gitignore, 본 문서 작성.
- 2026-07-21: 1단계 완료 — Next.js 16 / React 19 스캐폴딩(App Router, TS, Tailwind v4), dev/start를 `127.0.0.1`에 바인딩.
- 2026-07-21: 2단계 완료 — shadcn/ui 초기화 및 기본 컴포넌트 17종 추가, layout에 TooltipProvider/Toaster 적용.
- 2026-07-21: **계획 변경(3단계 진행 중)** — 설치된 Prisma가 7.9.0으로, v7부터는 (a) `.env`를 CLI가 자동 로드하지 않고 `prisma.config.ts`에서 `import "dotenv/config"`로 명시적으로 로드해야 하며, (b) SQLite도 드라이버 어댑터가 필수다. 원래 계획한 `@prisma/adapter-better-sqlite3`(better-sqlite3)를 설치 시도했으나 Node v24.13.0 + Windows용 사전 빌드 바이너리가 없어 node-gyp 네이티브 컴파일로 폴백했고, Visual Studio Build Tools(C++ 워크로드)가 설치돼 있지 않아 실패했다. **사전 빌드 바이너리를 쓰는 `@prisma/adapter-libsql` + `@libsql/client`로 전환**(설치·로드 확인 완료, `win32-x64-msvc` 네이티브 바이너리 정상 동작). 핵심 요구사항(승인 우회 불가, zero-state, 사람 없는 사무실 등)에는 영향 없음 — SQLite 연결 방식만 바뀐 것이며, WAL/busy_timeout PRAGMA와 `withTransaction` 재시도 로직은 4·7단계에서 이 어댑터 기준으로 구현한다. `.env.example`/`.env.test`를 추가하고 `test`/`test:studio`/`db:studio`/`mcp` npm 스크립트를 등록했다(`dotenv-cli`로 `.env.test` 로드).
- 2026-07-21: 4단계 완료 — `prisma/schema.prisma`에 18개 모델 전부 작성(version/idempotencyKey/entityVersion/expiresAt/statusBeforePause 포함), `migrate dev`로 초기 마이그레이션 생성. **실측 결과 계획 문서의 가정과 달리 SQLite 상대경로는 schema.prisma 위치가 아니라 프로세스 작업 디렉터리(cwd) 기준으로 해석됨을 확인** — `.env`/`.env.test`를 `file:./prisma/dev.db`, `file:./prisma/test.db`로 명시해 둘 다 `prisma/` 안에 위치하도록 고정. `dotenv -e .env.test -- npx prisma migrate deploy`로 test.db 분리도 실측 검증(dotenv-cli가 설정한 값이 prisma.config.ts의 기본 `.env` 로드보다 우선함을 확인, dev.db는 건드리지 않음). `src/lib/prisma.ts`(libSQL 어댑터 싱글턴 + WAL/busy_timeout PRAGMA, 스모크 테스트로 검증)와 `src/lib/enums.ts`(상태값 단일 진실 소스) 작성.
- 2026-07-21: 5단계 완료 — `prisma/seed.ts` 작성·실행(dev.db): Company 1개, OfficeZone 6개(개방형 업무 공간×2/독립 사무 공간/회의 공간/휴게 공간/공용 결과물 공간), AppSetting 3개(sync_folder_path=null 등), Skill 카탈로그 6개(전부 installed:false/enabled:false). 재실행 시 upsert로 중복 없음을 확인. 스크립트 자체가 employees/departments/tasks/automations/artifacts/approvals 카운트를 검사해 0이 아니면 예외를 던지도록 만들어 zero-state를 코드 레벨로 강제함 — 실행 결과 전부 0 확인.
