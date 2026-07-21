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
- 2026-07-21: 6단계 완료 — `scripts/generate-office-svg.mjs`로 사람이 전혀 없는 아이소메트릭 사무실을 직접 작성(노랑/그레이/화이트 팔레트, 컷어웨이 벽+창문, 6개 구역을 데스크/책상/소파/선반/식물 등으로 구분), `public/office/office-empty.svg` + `public/office/office-scene.json`(zone 좌표 계약, 배경 교체만으로 리디자인 가능) 생성. `public/avatars/avatar-sprites.svg`(추상적인 사람 형태 토큰 아바타, currentColor로 색상 변경)와 `OfficeScene`/`EmployeeLayer`/`EmployeeMarker`/`StatusBadge` 컴포넌트를 구현 — 배경과 직원 레이어를 하나의 `<svg viewBox>`에 통합해 반응형 확대/축소 시 좌표가 항상 일치하게 했다. **직원 posX/posY는 전체 캔버스가 아니라 배정된 zone 안에서 0..1로 정규화**된다는 설계를 `resolveEmployeeUV`로 확정. 직원 0명인 실제 홈 화면은 사람이 전혀 없는 배경만 렌더링됨을 `curl`+Next 개발 서버로 확인. `<use href="/other.svg#id">` 같은 크로스 파일 참조는 서버사이드 래스터라이저(및 잠재적으로 일부 임베딩 환경)에서 깨지는 것을 발견해 아바타 심볼도 OfficeScene 안에 동일 문서로 인라인하도록 수정, `<use>`에 명시적 width/height를 지정하지 않으면 심볼이 뷰포트 100%로 확대되는 SVG 스펙 함정도 발견해 수정. 브라우저 프리뷰 도구가 현재 환경에서 응답하지 않아(로컬호스트·example.com 모두 실패) `sharp`로 실제 렌더링된 SVG를 래스터화해 육안 검증(임시 파일, 커밋되지 않음). **캐릭터 렌더링은 test.db에만 임시 Employee를 만들어 검증**(`src/lib/employee-marker-data.integration.test.ts`, 생성→조회→삭제 후 count 원복 확인) + 순수 좌표 변환 유닛 테스트(`office-scene-geometry.test.ts`) 총 9개 테스트 전부 통과, dev.db는 여전히 employee=0/officeZone=6로 무영향 확인. `vitest.config.ts` + `scripts/check-db-target.ts`(globalSetup, DATABASE_URL이 dev.db를 가리키면 테스트 전체를 즉시 중단)를 이번 단계에서 함께 구축.
- 2026-07-21: 7단계 완료 — `/api/company` 읽기 API(회사 정보 + 직원/부서/업무/자동화/결과물/승인대기 카운트, archived 제외) 작성, `src/lib/hooks/useCompanyState.ts`(SWR, 4초 폴링) + `CompanyHeader.tsx`(홈 화면 헤더에 실시간 카운트 표시)로 연결. `npm run dev` + `curl /api/company`로 dev.db 기준 전 카운트 0 확인, 홈 화면 HTML에 헤더 라벨 정상 렌더링 확인. 기존 test.db 테스트 9개 재실행해 회귀 없음 확인.
- 2026-07-21: 8단계 완료 — `AppSidebar`(9개 화면 내비게이션: 사무실/업무/자동화/결과물/승인함/스킬/연동/활동로그/설정)를 루트 레이아웃에 적용. `/api/departments`, `/api/departments/[id]`, `/api/employees`, `/api/employees/[id]`, `/api/tasks`, `/api/tasks/[id]`, `/api/office-zones` 읽기 전용 API와 대응 SWR 훅 작성. `/tasks`(목록, empty-state) + `/tasks/[id]`(상세: 상태·로그·결과물) 화면 구현. "부서 상세 패널"/"직원 상세 패널"은 별도 목록 화면이 아니라 **사무실 화면에서 구역/직원 클릭 시 여는 Sheet**로 구현(`ZonePanel`, `EmployeePanel`) — `OfficeScene`(Server Component)에 각 zone의 아이소메트릭 hit-region(`data-zone-key`)을 추가하고, 클릭 위임을 처리하는 `OfficeSceneInteractionLayer`(client)로 감싸는 방식을 사용해 서버→클라이언트 콜백 전달 문제를 우회했다. 또한 직원 레이어를 정적 prop에서 **SWR로 실시간 조회하는 `LiveEmployeeLayer`**로 전환해, 향후 직원이 승인되면 사무실 화면이 자동 갱신되도록 했다(순수 렌더링용 `EmployeeLayer`는 테스트 용이성을 위해 그대로 유지). `curl`로 전 API 0건/빈 배열 확인, `/tasks/999` 류 미존재 id에 404 확인, 사이드바 라벨 렌더링 확인, test.db 테스트 9개 재실행 회귀 없음 확인.
- 2026-07-21: 9단계 완료 — Task에 `version` 컬럼 추가(마이그레이션, dev/test 양쪽 적용). `src/lib/approval-registry.ts`(entityType+action 화이트리스트) + `zod-schemas/proposals.ts`(6개 엔티티 스키마) + `taskTransitions.ts`(공유 상태 전이 규칙) + `withTransaction.ts`(SQLITE_BUSY 재시도) + `activity-log.ts` 작성. 핵심 `src/lib/approvals/materialize.ts`가 승인 시 payload를 현재 스키마로 재검증, entityVersion 충돌 검사, expiresAt 만료 검사(3곳 중 목록/상세 조회 2곳 포함) 후 트랜잭션으로 실제 엔티티 생성/변경 + ActivityLog 기록. `/api/approvals`(목록/상세/승인/거절) + same-origin 검사(`csrf.ts`, 세션 토큰은 14단계 예정) + `/approvals` 승인함 UI(ApprovalCard: 위험도 배지, 스킬/권한/파일 하이라이트, AlertDialog 승인·거절). 이번 프로젝트의 Base UI 기반 shadcn은 Radix의 `asChild` 대신 `render` prop을 쓴다는 점을 발견해 수정. **테스트 16개 전부 통과**(승인 성공/미등록 조합 거부/중복 승인 거부/만료 거부/버전 충돌/idempotencyKey 유니크 제약/거절 시 엔티티 미생성, 전부 test.db), dev.db는 department/approvalRequest/activityLog 모두 0 확인.
- 2026-07-21: 10단계 완료 — `taskControl.ts`/`automationControl.ts`(taskTransitions 재사용, MCP 미노출, 확인창+ActivityLog) + `/api/tasks/[id]/{pause,resume,cancel,archive}`, `/api/automations/[id]/{pause,resume,archive}` + `TaskControlButtons`(업무 상세 화면). 테스트 23개 통과.
- 2026-07-21: 11단계 완료 — `src/lib/path-guard.ts`(workspace rw / 승인된 외부 경로 ro, path traversal 차단) 작성. Artifact에 `archivedAt` 추가(마이그레이션). `/api/artifacts`(목록/상세/보관/다운로드, path-guard로 파일 서빙) + `/artifacts` 보관함 화면(전체/공용 탭). 직원 마커에 `ArtifactBubble`(완료 결과물 말풍선, 클릭 시 상세 패널) 추가 — `data-artifact-id`가 `data-employee-id`보다 우선 처리되도록 클릭 위임 순서 조정. 테스트 24개 통과, dev.db artifact=0 확인.
- 2026-07-21: 12단계 완료 — `/api/automations`, `/api/integrations`(목록), `/automations` 화면(제어 버튼, "외부 결과 동기화가 설정되지 않음" 표시). `manifest-scanner.ts`: manifest.json zod 검증, runId 중복 스킵(ImportedManifest 유니크), 산출물은 승인된 외부 폴더에서 workspace/artifacts로 복사(외부 폴더는 read-only 유지). vitest 파일 병렬 실행이 동일 SQLite 커넥션에 SQLITE_BUSY를 유발해 `fileParallelism:false`로 전환, 테스트 간 공유 폴더로 인한 카운트 오염도 발견해 테스트별 격리된 임시 폴더로 수정. 테스트 28개 통과, dev.db automation/integration/importedManifest 모두 0 확인.
- 2026-07-21: 13단계 완료 — `/api/skills` + `/skills`, `/integrations`(스캔 버튼 포함) 읽기 전용 화면. 직접 토글 없음(설치/변경/비활성화는 승인 경로만). dev.db 기준 스킬 카탈로그 6건 정상 반환·installed 전부 false 확인.
- 2026-07-21: 14단계 완료 — CSRF 2단계 방어 완성: `src/middleware.ts`(non-httpOnly 세션 쿠키 발급) + `session-token.ts`(더블서밋 검증) + `mutationFetch.ts`(클라이언트 fetch 래퍼) + `csrfGuard`로 승인/제어/설정 라우트 전부 통일. `/api/activity`+`/activity`(로그 화면), `/api/settings`(PATCH는 승인 만료 시간만 직접 편집 허용, 화이트리스트 키 외 403)+`/settings`. server-only 상수/로직을 client 코드에서 import하던 번들링 버그 재발견해 `csrf-constants.ts`로 분리, `middleware.ts`는 src-dir 컨벤션에 맞춰 `src/middleware.ts`로 이동(Next 16의 "proxy" 신규 컨벤션 경고는 남아있음, 기능은 정상). 테스트 32개 통과, dev.db activityLog=0 확인.
- 2026-07-21: 15단계 완료 — 로컬 MCP 서버(stdio 전용, 포트 미개방) 28개 도구 구현: `src/lib/approvals/propose.ts`(모든 propose_* 및 create_approval_request가 공유하는 단일 진실 소스 — 화이트리스트 재검증·entityVersion 스냅샷·idempotencyKey 중복 방지 P2002 처리), `src/lib/approvals/status.ts`(get_approval_status의 만료 검사, 3곳 중 마지막), `src/lib/execution/taskExecution.ts`(taskTransitions 재사용한 실행 전용 도구). `mcp-server/index.ts` + `tools/*.ts` 9개 파일. **`@modelcontextprotocol/sdk`의 Client로 실제 서버 프로세스를 spawn해 test.db로 접속하는 e2e 테스트**(`mcp-server/mcp-server.test.ts`) 작성 — 도구 28개 정확히 노출, 금지 도구(approve/reject/cancel/update_task_status/pause_task 등) 전부 부재, propose_department가 실제 Department를 만들지 않고 ApprovalRequest만 생성, 미등록 action 거부까지 확인. StdioClientTransport가 부모 프로세스 env를 자동 상속하지 않는다는 점을 발견해 DATABASE_URL을 명시적으로 전달; JSDoc 주석 안의 `*/` 문자열이 주석을 조기 종료시키는 문법 함정 발견해 수정; `server-only` 패키지가 순수 Node 테스트 환경에서 즉시 throw하는 문제를 vitest alias 스텁으로 해결. 이전 세션의 실패한 테스트 실행들이 test.db에 남긴 잔여 행(부서 3, 승인 5)도 이번에 정리. 최종 테스트 36개 전부 통과, dev.db department/approvalRequest 모두 0 확인.
- 2026-07-21: 16단계 완료 — `.mcp.json` 작성(`npx tsx mcp-server/index.ts`, `DATABASE_URL=file:./prisma/dev.db`). Next 서버 `127.0.0.1` 바인딩은 1단계에서 이미 적용됨. `npx tsx mcp-server/index.ts < /dev/null`로 정상 기동/종료 확인(exit 0), 이후 dev.db 전 카운트(직원/부서/업무/자동화/결과물/승인) 0 재확인. **이 세션은 OneDrive 경로에서 시작되어 `.mcp.json`을 자동 인식하지 못한다 — 실제 도구 인식 확인은 `C:\dev\claude-office-app`에서 새 Claude Code 세션을 열어야 가능**(§0에서 예고한 재시작 필요 시점).
- 2026-07-21: 17단계 완료 — `.claude/skills/company-manager/SKILL.md` 작성: 승인 우회 불가·approve/reject/cancel 도구 부재·사용자 전용 일시정지/취소/보관·완료 거짓 보고 금지를 절대 원칙으로 명시, 요청 분류→제안 전 확인→승인된 업무 실행(start_task~fail_task)→파일 접근 범위→스킬 승인 절차→영구 삭제 금지→활동 로그 자동 기록 순으로 실제 구현된 28개 도구 이름과 정확히 매칭되게 작성.
