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

## 6. MCP 도구 (allowlist) — 총 28개 (Phase 1 원안 — Phase 2 최종 구성은 §Phase 2 진행 로그 P2-12 참고, 실제 반영본은 `.claude/skills/company-manager/SKILL.md`)

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
- 2026-07-21: 18단계 완료(최종) — `path-guard.test.ts`(workspace/외부 경로 traversal 공격 문자열 다수 차단 확인), `taskExecution.test.ts`(MCP 실행 전용 전이 6종) 추가. `README.md`를 프로젝트 실제 구조로 재작성, `scripts/start-windows.ps1`(node_modules/dev.db 존재 여부로 최초 실행과 재실행 구분, 기존 데이터 보존, OneDrive 경로 경고 포함, PowerShell 파서로 문법 검증). `npm run build` 프로덕션 빌드 성공(모든 라우트 정상 생성) 확인. 최종 테스트 53개 전부 통과, 11개 화면 전부 200 확인, dev.db 최종 상태: company=1·officeZone=6·appSetting=3·skill=6(전부 미설치), employee/department/task/automation/artifact/approvalRequest/integration/activityLog 전부 0.

## 완료 조건 체크 (§21 기준)

1. ✅ 사람 없는 사무실 렌더링(6단계)
2. ✅ 초기 직원 0명 / 3. ✅ 부서 0개 / 4. ✅ 업무 0개 / 5. ✅ 자동화 0개 / 6. ✅ 결과물 0개
7. ✅ 샘플 데이터 없음(seed.ts가 zero-state를 코드로 강제)
8. ✅ AI API 키 없이 실행(Anthropic/OpenAI SDK 미사용)
9. ✅ MCP를 통한 제안 등록 가능(28개 도구, e2e 검증됨)
10. ✅ 승인 전 실제 데이터 미생성(materialize.ts, 16개 테스트로 검증)
11. ✅ 승인된 직원만 사무실 표시(LiveEmployeeLayer가 실제 DB만 조회)
12. ✅ 결과물 등록 시 말풍선/공용 알림(ArtifactBubble, /artifacts 공용 탭)
13. ✅ manifest 중복 없이 가져오기(ImportedManifest.runId 유니크, 4개 테스트)
14. ✅ 자동화 기능 존재·데이터는 비어 있음
15. ✅ 모든 중요 변경이 ActivityLog에 기록(withTransaction+logActivity로 강제)

프로젝트 완성. 새 경로(`C:\dev\claude-office-app`)에서 Claude Code 세션을 열면 `.mcp.json`과
`company-manager` 스킬이 인식되어 실제 사용을 시작할 수 있다.

---

# Phase 2 — 운영 정책 전면 개편 (2026-07-21 착수)

## 착수 전 현재 상태 점검

1단계 완료 이후 사용자가 실제로 `C:\dev\claude-office-app`에서 Claude Code 세션을 열어 앱을
사용했다. **dev.db에는 이제 실제 데이터가 있다** — 이번 Phase 2의 최우선 제약은 이 데이터를
절대 건드리지 않는 것이다.

- Department 1개: 리서치·보고서팀(officeZone=open-workspace-1에 배정됨)
- Employee 1명: 리오(리서치 애널리스트, 리서치·보고서팀 소속, rank 없음 → 마이그레이션 필요)
- Task 1개: completed 상태, "AI 회사 운영 시스템 검증 보고서 작성"
- Artifact 1개: `workspace/artifacts/first-test/system-validation-report.md`
- ApprovalRequest 4개: 전부 이미 `approved` 상태(department create/update, employee create, task create) — **현재 pending 상태인 것은 없음**, 따라서 정책 변경으로 인한 강제 취소 대상은 현재 0건(마이그레이션 스크립트는 향후를 위해 반드시 구현하되 지금은 no-op으로 검증됨)
- Skill 6개(seed 카탈로그, 전부 installed:false), EmployeeSkill 0개, Integration 0개, Automation 0개, ActivityLog 7개

또한 `claude` CLI가 이 작업 환경 PATH에 없음을 확인했다(`claude --help` 실행 불가). 4장의
Worker→Claude CLI 비대화형 실행 모듈은 이 사실을 전제로 "CLI 미발견 시 Job을 failed로 안전
종료"하도록 방어적으로 구현하고, 반복 CLI 호출 테스트는 전부 모킹한다(사용자 16장 지시와도 일치).

## 핵심 설계 결정

### 승인 정책 축소
`APPROVAL_REGISTRY`를 `department.create`, `employee.create` 두 조합만 남기고 전부 제거한다.
task/automation/skill/integration의 propose_* 도구와 approve/reject 경로는 이 두 조합 외에는
`unknown_action`으로 이미 거부되므로(기존 `materialize.ts` 로직 재사용) 별도 차단 로직이 거의
필요 없다 — 화이트리스트를 줄이는 것 자체가 곧 "다른 종류는 명시적으로 거부"를 만족시킨다.
`ApprovalStatus`에 `cancelled_by_policy_change`를 추가하고, 정책 변경 시점의 pending 중
department.create/employee.create가 아닌 요청을 이 상태로 전환하는 일회성 마이그레이션
스크립트(`scripts/migrate-policy-v2.ts`)를 작성한다(현재는 대상 0건이지만 재실행 가능하게 유지).

department/employee의 update(일반 정보 수정, 공간/좌석 배치, 설명 변경)는 **직접 실행 MCP
도구**(`update_department`, `update_employee`)로 전환하고 ActivityLog만 남긴다. archive는
MCP 도구로 노출하지 않고 **웹앱 사용자 직접 제어**(기존 Task/Automation 패턴과 동일: 확인창 +
ActivityLog)로만 가능하다 — "회사 운영 규칙에 따른 자동 보관"은 이번 범위에서 규칙 엔진을
새로 만들지 않고, 사용자 직접 클릭 경로만 구현한다(향후 필요 시 확장 가능하도록 함수 분리).

### 직급(rank) 시스템
Employee에 `rank Int @default(1)`(1~4, Zod로 범위 강제) 추가 — DB 기본값 1이 기존 리오 행을
자동으로 rank 1로 마이그레이션한다(사용자가 "임의로 높이지 말라"고 한 요구사항과 일치, 별도
백필 스크립트 불필요). `AppSetting.employeeRequestMinRank`(기본값 3)를 마이그레이션 스크립트로
1회 upsert한다(seed.ts 재실행 아님).

`propose_employee`(employeeCreateSchema)에 요구사항 3장의 모든 필드(요청자/요청자 직급/부서/
이름 제안/목표 직급/역할/책임/사유/예상 업무/데이터 접근 범위/필요 스킬/배치 위치/미승인 시
문제/중복 인력 검토 결과)를 추가한다. `createProposal`에 employee.create 전용 사전 검사를
추가: `requestedByEmployeeId`가 있으면 그 직원의 rank를 조회해 `employeeRequestMinRank` 미만이면
`rank_too_low`로 거부, 없으면(사용자가 직접 요청) 무조건 허용. 같은 부서+역할의 pending 요청이
이미 있으면 idempotencyKey 없이도 `deduped:true`로 기존 요청을 반환한다(반복 생성 방지).

직급 변경은 `update_employee_rank` MCP 도구로 노출하되 `authorizedBy: "user" | "rank4_employee"`
+ (rank4인 경우) `authorizingEmployeeId`를 요구하고, 지정된 직원이 실제 rank 4인지 DB로
검증한다. 자기 자신의 rank를 올리는 것은 이 흐름상 자연히 차단된다(요청자 검증 대상은 항상
"다른" rank4 직원이거나 사용자). 웹앱 직원 패널에도 동일 규칙의 직접 변경 UI를 추가한다.

### Task/Worker 실행 구조
`propose_task`와 task의 ApprovalRequest 경로를 완전히 제거하고 `create_task`/`update_task`/
`assign_task`를 직접 실행 MCP 도구로 추가한다. Task 생성 시 즉시 `queued`이며, `assignedEmployeeId`가
유효(존재·비보관)하면 `ExecutionJob(status:"pending")`을 함께 생성한다. 신규 `worker/` 모듈이
pending Job을 폴링해 원자적으로 claim(조건부 `updateMany` where status='pending'으로 경합
방지)하고, 동시 실행 개수를 제한하며, `worker/claudeCliRunner.ts`(모킹 가능한 주입형 실행자)로
Claude Code CLI를 비대화형 실행한다. 실행 결과에 따라 초안 결과물 등록 → 검수 프로세스(아래) →
`complete_task`/`fail_task`/`needs_review`로 이어진다. 오래된 lock(`lockedAt` 초과)은 별도
복구 루틴이 pending으로 되돌리고 `attempts`를 증가시키며 `maxAttempts` 초과 시 failed로 확정한다.

### 검수(Review) 시스템
`ReviewPolicy`(하드코딩 없이 importance별 기본값 시드), `ReviewDecision`, `ArtifactVersion`을
추가한다. 결과물은 항상 새 `ArtifactVersion`으로 쌓이고 기존 파일을 덮어쓰지 않는다. 작성자
rank보다 높은 직급을 importance에 따라 순차 검수하며, 작성자와 동일 인물은 검수자가 될 수
없다. 같은 부서에 적절한 상위 직급이 없으면 회사 전체에서 탐색하고, 그래도 없으면
`status:"review_blocked"`로 두고 필요한 직급/역할을 기록한다(이 경우 rank3+ 직원이 직원 생성
요청을 제안할 수 있음 — 위 직원 생성 정책과 동일 경로). 수정 요청(`revision_requested`) 시
새 버전을 만들며 기본 최대 3회 초과 시 사용자에게는 승인 요청이 아닌 **알림**만 표시한다.

### PDF 산출물
사람이 읽는 문서형 결과물은 PDF로 최종 제공한다. Windows에서 한글이 깨지지 않는 방식을
실제로 검증해 선택한다(후보: Playwright Chromium 인쇄, `@react-pdf/renderer`, PDFKit — 한글
폰트 임베딩과 표/페이지 나눔이 실제로 되는지 확인 후 결정, 아래 조사 로그에 기록). 원본이
CSV/XLSX인 경우 원본은 유지하고 PDF 요약본을 별도로 만든다. PDF 생성 실패 시 업무를
completed로 처리하지 않는다.

### 스킬 초기화
기존 seed 스킬 6개는 어떤 EmployeeSkill에도 연결되어 있지 않음을 확인했다(EmployeeSkill=0건) →
안전하게 삭제 가능. 삭제 후 Skill 0개, EmployeeSkill 0개가 새 초기 상태가 된다. Skill 모델
필드를 요구사항 8장에 맞게 확장(instructions/allowedTools/compatibleRanks/compatibleDepartments/
validationStatus)하고, 생성 자체는 승인 불필요하되 validationStatus가 통과해야 활성화되는
구조를 유지한다.

### 사무실 공간 표시 이름
`OfficeZone.displayName`(초기값 "미배정 공간 N", 부서 배정 시 부서명으로 자동 갱신, 부서
이동/보관 시 복구)을 추가하고 zone 라벨을 **정적 SVG에 박아넣지 않고** 실시간 데이터 기반
레이어로 다시 렌더링한다(office-empty.svg의 baked-in `<text>` 라벨 제거).

### 결과물 부서별 분류 + DataAsset
Artifact에 `departmentId`(기본 담당자 부서 자동 유도) + 공동 작업을 위한 `ArtifactDepartment`
조인 테이블을 추가한다. 결과물 보관함을 회사 공용/부서별(최종/검수중/수정요청/보관) 구조로
재구성한다. 결과물과 별도로 AI 직원 전용 내부 자료 저장소 `DataAsset`(+ 부서/직원/업무 연결,
`DataAccessLog`)을 신설하고, 항상 workspace 내부 승인된 data workspace 경로만 사용하며
checksum 기반 중복 감지와 유효기간 확인을 구현한다.

### 사무실 시각 개편
`Seat` 모델(zone별 좌석 슬롯, zone-relative 정규화 좌표)을 추가한다. 기존 desk 배경 그래픽과
동일 좌표를 좌석 슬롯으로 재사용해 캐릭터-가구 정렬 비용을 최소화하고, open_workspace/
private_office 존에 좌석을 추가로 확충해 배경 SVG를 재생성한다. 직원 상태(idle/queued/running/
reviewing/revision_requested/completed/failed/review_blocked)별 자세·아이콘·저강도 애니메이션을
추가하고 `prefers-reduced-motion`을 지원한다. 좌석은 부서 배정/이동 시 자동 할당·해제한다.

### MCP 도구/권한 재구성
28개 도구를 요구사항 13장 목록에 맞게 재구성한다(propose_department/propose_employee/
get_approval_status만 승인형으로 유지, 나머지는 조회 또는 직접 실행). `.claude/settings.json`
프로젝트 전용 파일에 company-manager MCP 도구별 정확한 allowlist를 등록해 매번 확인창이
뜨지 않게 하되, Bash 전체·프로젝트 외부 쓰기·영구 삭제·시스템 설정 변경·자격증명 조회 등은
allowlist에 넣지 않는다. `--dangerously-skip-permissions`류의 전면 허용은 사용하지 않는다.

## 구현 순서 (진행 로그에 단계별 기록)

P2-1 스키마 마이그레이션(추가 전용) + 데이터 백필 스크립트
P2-2 승인 정책 축소(레지스트리·상태·API 거부) + pending 취소 마이그레이션
P2-3 department/employee 직접 실행 도구 + 사용자 직접 archive/rank 제어
P2-4 Task/Worker 실행 구조(ExecutionJob, create/update/assign_task, worker 모듈)
P2-5 검수 시스템(ReviewPolicy/ReviewDecision/ArtifactVersion)
P2-6 PDF 생성(라이브러리 조사·선택·구현)
P2-7 스킬 초기화 + 모델 확장
P2-8 사무실 공간 표시 이름 자동화
P2-9 결과물 부서별 분류 화면
P2-10 DataAsset 서브시스템
P2-11 사무실 시각 개편(Seat, 상태별 렌더링)
P2-12 MCP 도구 재구성 최종본 + README/SKILL.md 동기화
P2-13 Claude Code 프로젝트 권한 설정(.claude/settings.json)
P2-14 종합 테스트 + 프로덕션 빌드 + 최종 보고

각 단계 완료 시 진행 로그에 변경 파일·테스트 결과·dev.db 데이터 보존 확인을 간결하게 기록한다.

## Phase 2 진행 로그

- 2026-07-22: P2-1 완료 — 추가 전용 마이그레이션(`phase2_rank_review_worker_dataasset`) 적용. **적용 중 dev.db가 사용자의 다른 실행 중인 세션(포트 3000 dev 서버 + MCP 서버 프로세스 3개)에 잠겨 `database is locked` 발생 → 사용자 승인 받고 해당 프로세스만 종료(무관한 `./mcp/server.mjs`는 유지) 후 재시도해 해결**. 신규: Employee.rank(기본1), OfficeZone.displayName/defaultDisplayName, Seat, ExecutionJob, Artifact.departmentId/importance/currentReviewStatus/legacy, ArtifactVersion, ArtifactDepartment, ReviewPolicy, ReviewDecision, Skill 확장 필드, DataAsset+연결모델 4종. `scripts/migrate-policy-v2.ts`(재실행 가능한 백필, prisma/seed.ts와 별개)로 zone별 미배정 라벨 1~6 부여(open-workspace-1만 "리서치·보고서팀" 유지), 좌석 15개 생성(기존 데스크 좌표 재사용) 후 리오를 좌석1에 배정(posX/posY 스냅), employeeRequestMinRank=3 시딩, ReviewPolicy 4건 시딩, 기존 결과물 legacy=true+ArtifactVersion v1 생성, pending 정책위반 승인 취소(현재 0건, 로직은 검증됨) — **재실행 시 전부 0건으로 idempotent 확인**. dev.db 핵심 데이터(company=1/department=1/employee=1/task=1/artifact=1) 전부 보존 확인.
- 2026-07-22: P2-2 완료 — `APPROVAL_REGISTRY`를 department.create/employee.create 두 조합만 남기고 축소(`approvalEntityTypeSchema`도 동일하게 축소, "cancelled_by_policy_change" 상태값 추가). `proposals.ts`를 승인형 전용으로 재작성(부서 create만, 직원 create는 3장 요구사항의 근거 필드 전부 포함) + `direct-department-employee.ts`(P2-3용 update/move/rank 스키마 선분리). `materialize.ts`를 create-only로 대폭 축소하고, 부서 생성 시 **동일 트랜잭션 안에서** 빈 업무공간을 자동 배정하고 그 zone의 displayName을 부서명으로 갱신, 직원 생성 시 대상 zone의 빈 좌석에 자동 배정하고 posX/posY를 좌석 좌표로 스냅하도록 구현(더 이상 별도 department.update 승인 불필요). `propose.ts`에 직원 채용 제안 게이팅 추가(requestedByEmployeeId의 rank < employeeRequestMinRank면 `rank_too_low` 거부, requestedByEmployeeId 없으면 사용자 직접 요청으로 간주해 게이팅 면제) + 동일 부서·역할의 pending 중복 요청 자동 감지. MCP 서버: propose_task/propose_automation/propose_skill/propose_integration 제거, `create_automation`/`update_automation`/`configure_integration`/`update_integration`을 직접 실행 도구로 신설(list_skills만 우선 유지, 전면 개편은 P2-7/P2-12). 총 도구 28개 유지(구성만 변경). 테스트 55개 통과(zone 자동배정 테스트가 test.db의 공유 시드 zone과 충돌해 처음 실패 → 명시적 zone 지정 테스트와 "임의의 빈 zone 자동배정" 테스트로 분리해 해결), `npm run build` 성공, dev.db 데이터(department=1/employee=1/task=1/artifact=1/approvalRequest=4) 전부 보존 확인.
- 2026-07-22: P2-3 완료(컨텍스트 초기화 후 HANDOFF.md 기준으로 재개) — `src/lib/direct/employeeDirect.ts` 신규 작성: `updateEmployee`(일반 정보+skillIds 교체, ActivityLog만), `moveEmployee`(기존 좌석 해제 → 대상 zone 빈 좌석 탐색·배정+posX/posY 스냅, 빈 좌석 없으면 (0.5,0.5) 폴백), `archiveEmployee`(사용자 직접 제어 전용, 좌석 해제 후 archived), `changeEmployeeRank`(authorizedBy가 rank4_employee면 authorizingEmployeeId가 대상 본인이 아니고 실제 DB상 rank 4인 다른 직원인지 검증, 아니면 forbidden). 이미 작성돼 있던 `departmentDirect.ts`(WIP 커밋)는 그대로 재사용. MCP 도구 4개 신설: `update_department`(mcp-server/tools/departments.ts), `update_employee`/`move_employee`/`update_employee_rank`(mcp-server/tools/employees.ts) — 전부 `direct-department-employee.ts`의 기존 zod 스키마 재사용. 사용자 직접 제어 API 라우트 3개 신규: `POST /api/departments/[id]/archive`, `POST /api/employees/[id]/archive`, `POST /api/employees/[id]/rank`(authorizedBy를 "user"로 고정 — rank4_employee 경로는 MCP 도구 전용) — 전부 기존 `csrfGuard`+`idParamSchema` 패턴 재사용, archive_department/archive_employee는 MCP에 노출하지 않음. 웹 UI: `EmployeePanel.tsx`에 직급 변경 Select(1~4) + 보관 AlertDialog, `ZonePanel.tsx`(부서 표시부)에 보관 AlertDialog 추가, 둘 다 `mutationFetch`+로컬 SWR `mutate` 사용(`useEmployees.ts`/`useDepartments.ts`에 `mutate` 반환 추가, `EmployeeListItem`에 `rank` 필드 추가). 테스트: `departmentDirect.test.ts`(update 일반 필드/zone 이동 시 라벨 갱신/not_found, archive 시 zone 해제+라벨 초기화/not_found), `employeeDirect.test.ts`(update 필드+skillIds 교체, move 성공/좌석 없을 때 폴백/not_found, archive 성공/not_found, rank 변경 user/rank4_employee 승인/자기 자신 승인 거부/authorizingEmployeeId 누락 거부/비rank4 승인자 거부/not_found) — 전부 test.db 전용, 전용 zone key(`test-dept-direct-zone-*`/`test-emp-direct-zone-*`)로 기존 공유 시드와 충돌 회피. `mcp-server.test.ts`의 도구 목록에 update_department/update_employee/move_employee/update_employee_rank 추가, 개수 28→32로 갱신(archive_department/archive_employee는 forbidden 목록에 그대로 유지). **최종 테스트 74개 전부 통과**, `npx tsc --noEmit`/`npm run lint`(신규 파일 관련 에러·경고 0건, 기존 materialize.ts의 미사용 변수 경고 9건은 무관하게 그대로 존재) 통과, `npm run build` 성공(신규 라우트 3개 모두 정상 생성). dev.db 데이터(department=1/employee=1/task=1/artifact=1/approvalRequest=4) 최종 확인 결과 전부 보존됨.
- 2026-07-22: P2-4 완료 — `src/lib/direct/taskDirect.ts` 신규 작성: `createTask`(즉시 queued로 생성, assignedEmployeeId가 유효(존재·비보관)하면 같은 트랜잭션에서 `ExecutionJob(pending)` 자동 생성), `updateTask`(제목/설명/우선순위/입력파일/필요스킬/요청권한만 — 상태·담당자는 별도 경로), `assignTask`(담당자 배정/변경, 대상이 queued이고 ExecutionJob이 아직 없으면 이 시점에 생성 — 이미 있으면 중복 생성하지 않음). `src/lib/zod-schemas/direct-task.ts`(taskCreateSchema/taskUpdateSchema/taskAssignSchema) 신규. MCP 도구 3개 신설(`mcp-server/tools/tasks.ts`): `create_task`/`update_task`/`assign_task` — `archive_task`는 여전히 MCP에 노출하지 않음(사용자 직접 제어 전용, 기존 그대로). **`worker/` 디렉터리 신설**: `claimJob.ts`(조건부 `updateMany`로 원자적 claim — affected-row count가 0이면 이미 다른 워커가 선점한 것으로 보고 null 반환), `claudeCliRunner.ts`(모킹 가능한 `ClaudeCliRunner` 인터페이스 + `realClaudeCliRunner` — `claude -p <prompt>`를 프로젝트 루트 cwd로 non-interactive 스폰해 스폰된 프로세스가 자기 자신의 MCP 연결로 start_task~complete_task/fail_task를 직접 호출하게 하는 방식이라 러너 자신은 Task 행을 절대 직접 건드리지 않음; `spawn` ENOENT/비정상 종료를 전부 `{ok:false}`로 안전 변환 — 이 샌드박스에 `claude` CLI가 없다는 P2 착수 시점의 확인을 그대로 전제로 방어적으로 구현, 테스트는 전부 mock 러너 사용), `staleLockRecovery.ts`(`lockedAt` 초과 판정 → maxAttempts 미만이면 pending 복귀+attempts 증가, 초과 시 Job failed + Task가 아직 terminal이 아니면 Task도 failed로 확정 + ActivityLog `actor:"system"`), `runWorker.ts`(`runJob` 단일 실행 단위 + `runWorkerLoop` 폴링 루프, `WORKER_MAX_CONCURRENT`/`WORKER_POLL_INTERVAL_MS`/`WORKER_STALE_CHECK_INTERVAL_MS` 환경변수로 동시 실행 수·주기 조절), `index.ts`(`npm run worker` 진입점, `mcp-server/index.ts`와 동일하게 `dotenv/config` 직접 로드). `vitest.config.ts`의 `include`에 `worker/**/*.test.ts` 추가. 테스트: `taskDirect.test.ts`(생성 시 미배정/배정 시 Job 생성, 미존재·보관 직원 배정 거부, 필드 수정, 배정/재배정 시 Job 중복 생성 방지), `claimJob.test.ts`(선점 성공, 두 pending job을 서로 다른 워커가 각각 하나씩 claim, pending 없으면 null), `staleLockRecovery.test.ts`(재시도 여유 시 pending 복귀, 소진 시 Job+Task 둘 다 failed, 신선한 lock은 무변경), `runWorker.test.ts`(mock 러너로 성공/재시도/소진 시 Task failed/이미 terminal인 Task는 덮어쓰지 않음 — 이 마지막 케이스는 스폰된 CLI가 이미 complete_task를 호출한 뒤 wrapper가 비정상 종료를 보고하는 엣지 케이스를 대비) — 전부 test.db 전용, 실제 `claude` CLI는 어떤 테스트에서도 스폰하지 않음. `mcp-server.test.ts`의 도구 목록에 create_task/update_task/assign_task 추가, 개수 32→35로 갱신. **최종 테스트 94개 전부 통과**, `npx tsc --noEmit`/`npm run lint`(신규 코드 관련 경고·에러 0건) 통과, `npm run build` 성공. dev.db 데이터(department=1/employee=1/task=1/artifact=1/approvalRequest=4/executionJob=0) 전부 보존 확인.
- 2026-07-22: P2-5 완료 — `src/lib/review/reviewChain.ts`: `computeRequiredReviewRanks(chainMode, authorRank)` 순수함수로 4가지 chainMode를 전부 authorRank+1부터의 오름차순 구간 계산으로 통일(author_plus_one=[author+1], sequential_to_rank3=[author+1..max(3,author+1)], min3_then_rank4=[3,4] 중 author보다 높은 것만, full_chain_rank4=[author+1..4]) — 결과가 빈 배열이면 review_blocked. `findReviewerCandidate(tx, {requiredRank, excludeEmployeeId, preferDepartmentId})`: 작성자 제외·비보관만, 같은 부서 우선 탐색 후 전사 탐색으로 폴백. `src/lib/review/reviewWorkflow.ts`: `startReviewForVersion`(ReviewPolicy 조회 → 체인 계산 → 0번째 단계 착석 or 즉시 승인(빈 체인)/차단), `submitReviewDecision`(호출자가 실제 배정된 검수자인지 + 본인 결과물 자기검수 금지를 이중으로 검증, approved면 다음 단계 자동 착석 or 최종 승인, revision_requested/rejected는 상태만 기록), `createRevisionVersion`(revision_requested 상태에서만 허용, 새 ArtifactVersion 생성 후 체인을 0번째부터 재시작, revisionCount가 policy.maxRevisions 초과해도 차단하지 않고 ActivityLog `artifact.revision_limit_notice`만 남김). `register_artifact` MCP 도구를 확장해 등록과 동시에 ArtifactVersion v1을 생성하고 즉시 검수 체인을 시작하도록 수정(기존에는 Artifact 행만 만들고 `currentReviewStatus` 스키마 기본값 "approved"에 기대 사실상 검수를 건너뛰고 있었음 — 이번에 실제로 연결). `importance`/`departmentId`(생략 시 employeeId 소속 부서로 자동 유도) 파라미터 추가. MCP 도구 2개 신설: `submit_review_decision`, `revise_artifact`(둘 다 direct-execution, 승인 불필요). 테스트: `reviewChain.test.ts`(4개 chainMode × 여러 authorRank 조합의 순수함수 단위 테스트 + findReviewerCandidate의 부서우선/전사폴백/자기제외 통합 테스트), `reviewWorkflow.test.ts`(단일·다단계 체인 착석, 후보 없을 때 차단, author가 이미 rank4라 빈 체인일 때 즉시 승인, 승인 시 다음 단계 진행/최종 승인, 수정요청/반려 기록, 배정되지 않은 검수자·이미 처리된 검수 거부, 수정본 생성 시 체인 재시작+revisionCount 증가, 상태가 revision_requested가 아니면 수정본 생성 거부, 수정 횟수 초과 시 알림 로그만 남고 차단되지 않음). `mcp-server.test.ts`에 submit_review_decision/revise_artifact 추가, 개수 35→37로 갱신. **최종 테스트 119개 전부 통과**, `npx tsc --noEmit`/`npm run lint`(신규 코드 경고·에러 0건)/`npm run build` 전부 통과. dev.db 데이터(department=1/employee=1/task=1/artifact=1/artifactVersion=1/approvalRequest=4/executionJob=0) 전부 보존 확인.
- 2026-07-22: P2-6 완료 — **후보 3종(Playwright Chromium 인쇄/`@react-pdf/renderer`/PDFKit) 중 실측으로 검증**: Playwright는 이 샌드박스에 브라우저 바이너리가 없어(️`claude` CLI와 같은 종류의 제약) 제외, PDFKit은 `@react-pdf/renderer`와 동일하게 CJK 폰트를 수동 등록해야 하면서 테이블·페이지분할 레이아웃 프리미티브가 없어 제외. `@react-pdf/renderer` + `@fontsource/noto-sans-kr`(npm 패키지로 폰트 파일 자체를 받아옴, 외부 폰트 CDN 불필요)를 실제로 설치해 한글 제목·긴 한글 문단(2페이지 분할)·한글 표 셀 값을 렌더링한 뒤 `pdf-parse`로 PDF 바이트에서 문자열을 실제로 추출해 전부 왕복 확인(임시 검증 스크립트, 커밋되지 않음)한 후 채택. `src/lib/pdf/koreanFont.ts`(폰트 1회 등록), `pdfStyles.ts`(공용 스타일), `markdownToPdf.ts`(제목/문단/글머리목록/GFM 파이프 테이블만 지원하는 의도적으로 최소한의 markdown 파서 + PDF 렌더러 — react-pdf의 기본 `wrap:true` 흐름 레이아웃이 페이지분할을 자동 처리), `tableSummaryToPdf.ts`(CSV/XLSX 원본은 그대로 두고 미리보기 표+안내문구만 담는 별도 요약 PDF). **`src/lib/artifacts/registerArtifact.ts` 신설**: 기존 `register_artifact` MCP 도구 안에 있던 로직(Artifact+ArtifactVersion v1 생성+검수체인 시작)을 `registerArtifactDirect`로 추출해 MCP 도구와 신규 완료 경로가 함께 재사용하도록 리팩터링(mcp-server/tools/artifacts.ts는 이제 이 함수를 호출하는 얇은 래퍼). **`src/lib/execution/completeTaskWithDocument.ts` 신설**: "PDF 생성 실패 시 업무를 completed로 처리하지 않는다"는 요구를 구조적으로 보장하는 유일한 경로 — PDF 렌더링(마크다운 또는 표 요약) → workspace에 파일 쓰기 → `registerArtifactDirect`로 결과물 등록까지 전부 성공해야만 마지막에 `completeTask`를 호출하며, 그 전 어느 단계든 실패하면 Task 상태를 전혀 건드리지 않고 실패 코드(`pdf_generation_failed`/`invalid_path`/`file_not_found`)를 반환. MCP 도구 신설: `complete_task_with_document`. 테스트: `markdownToPdf.test.ts`(마크다운 파서 단위 테스트 + 실제 PDF 렌더링 결과에서 한글 제목/본문/표 셀 값 추출 확인 + 긴 문서가 2페이지 이상으로 분할됨을 확인), `tableSummaryToPdf.test.ts`(표 요약 PDF의 한글 셀 값·안내문구 추출 확인), `registerArtifact.test.ts`(확장자별 mimeType/format 추론, 정상 등록, workspace 밖 경로 거부, 존재하지 않는 파일 거부), `completeTaskWithDocument.test.ts`(markdown/table_summary 둘 다 실제 PDF를 생성해 성공적으로 완료 처리됨을 파일시스템+DB 양쪽에서 확인, 경로가 잘못됐을 때 Task 상태가 전혀 바뀌지 않음을 확인, 존재하지 않는 Task는 아무 파일도 만들지 않고 not_found 반환) — 전부 test.db + 실제 PDF 렌더링(모킹 없음, 실제 파일시스템 워크스페이스 사용). `mcp-server.test.ts`에 complete_task_with_document 추가, 개수 37→38로 갱신. **최종 테스트 132개 전부 통과**, `npx tsc --noEmit`/`npm run lint`(신규 코드 경고·에러 0건)/`npm run build` 전부 통과. dev.db 데이터(department=1/employee=1/task=1/artifact=1/artifactVersion=1/approvalRequest=4/executionJob=0) 전부 보존 확인. `package.json`에 `@react-pdf/renderer`/`@fontsource/noto-sans-kr`(런타임 의존성)와 `pdf-parse`(테스트 전용 devDependency) 추가.
- 2026-07-22: P2-7 완료 — Skill 모델 확장 필드(instructions/allowedTools/compatibleRanks/compatibleDepartments/validationStatus)는 P2-1에서 이미 스키마에 반영돼 있었음을 확인, 이번 단계는 (a) 실제 데이터 정리와 (b) 그 필드들을 실제로 사용하는 도구 3종 추가. `scripts/reset-skill-catalog.ts`(재실행 가능한 멱등 스크립트, `prisma/seed.ts`와 별개): 삭제 전 각 Skill의 EmployeeSkill 연결 수를 다시 실측 확인(0건이 아니면 예외를 던지고 중단 — 계획 문서의 과거 확인을 맹신하지 않음), dev.db에 실제 적용해 seed 스킬 6개(파일 작업/문서 작성/스프레드시트 처리/웹 검색/Google Drive 동기화/GitHub 저장소 연동) 삭제, 재실행 시 "삭제할 스킬 없음"으로 idempotent 확인. `src/lib/direct/skillDirect.ts`: `registerSkill`(승인 불필요, validationStatus=unvalidated/enabled=false/installed=false로 시작), `validateSkill`(passed면 enabled=installed=true+healthStatus=available, failed면 enabled=false+healthStatus=error), `assignSkillToEmployee`(validationStatus!==passed면 거부, compatibleRanks/compatibleDepartments가 설정돼 있으면 그 조건을 만족하는 직원에게만 허용 — 필드가 그냥 저장만 되고 아무 데도 안 쓰이는 장식적 컬럼이 되지 않도록 실제로 배정 로직에 연결). MCP 도구 3개 신설: `register_skill`/`validate_skill`/`assign_skill`(전부 direct-execution). 테스트: `skillDirect.test.ts`(등록 시 초기 상태, 검증 통과/실패에 따른 enabled·healthStatus 전환, 미검증 스킬 배정 거부, 정상 배정, 중복 배정 거부, compatibleRanks/compatibleDepartments 제약 각각 만족·불만족 케이스, 직원/스킬 미존재 처리) — 전부 test.db. `mcp-server.test.ts`에 register_skill/validate_skill/assign_skill 추가, 개수 38→41로 갱신. **최종 테스트 142개 전부 통과**, `npx tsc --noEmit`/`npm run lint`(신규 코드 경고·에러 0건)/`npm run build` 전부 통과. dev.db 핵심 데이터(department=1/employee=1/task=1/artifact=1/approvalRequest=4) 보존 확인, skill/employeeSkill은 계획대로 0/0으로 초기화됨(의도된 변경).
- 2026-07-22: P2-8 완료 — `office-empty.svg`에 박혀 있던 정적 라벨 그룹(흰색 알약 배경+한글 `<text>` 6개, "개방형 업무 공간 1" 등)을 통째로 제거(가구/구조물 레이어는 그대로 유지, XML 정상 종료 확인). `/api/office-zones`가 `displayName`/`defaultDisplayName`을 함께 반환하도록 확장, `useOfficeZones` 훅 타입도 동기화. **`src/components/office/ZoneLabelLayer.tsx` 신규**(client, `useOfficeZones`로 4초 SWR 폴링): zone의 `displayName ?? defaultDisplayName`을 실시간으로 그리며, 위치는 라이브 데이터가 아닌 `office-scene.json`의 정적 zone rect만으로 계산(`isoProject(x0,y0,iso)`로 각 zone의 "북쪽" 꼭짓점을 구하고 원래 하드코딩 라벨의 좌표와 역산해 맞춘 고정 오프셋 적용) — 기존 라벨 스타일(흰 알약 배경 rx=6 opacity=0.78 + 'Segoe UI' 15px 600 #7A6E4E)을 그대로 재현. `OfficeScene.tsx`에 `<ZoneLabelLayer scene={scene} />`를 zone hit-region과 직원 레이어 사이에 삽입. **`npm run dev`로 실제 브라우저 검증**: 부서 없는 zone은 "미배정 공간 N", 리서치·보고서팀이 배정된 zone은 실제 부서명("리서치·보고서팀")을 표시함을 페이지 텍스트 추출+네트워크 요청(둘 다 200 OK, 콘솔 에러 0건)으로 확인(스크린샷 도구 자체는 이 세션에서 타임아웃했으나 DOM/네트워크/콘솔 확인으로 대체 검증). 회귀 없음(테스트 142개 그대로 통과, `office-scene-geometry.test.ts` 등 기존 기하 테스트 무관). `npx tsc --noEmit`/`npm run lint`/`npm run build` 전부 통과. 스키마·데이터 변경 없는 순수 프론트엔드 단계라 dev.db 데이터(department=1/employee=1/task=1/artifact=1/approvalRequest=4/officeZone=6) 그대로 보존.
- 2026-07-22: P2-9 완료(전날 세션 크레딧 소진으로 중단 후 재개, 코드는 이미 작성돼 있었고 이번 세션에서 build/브라우저 검증부터 이어감) — Artifact.departmentId/ArtifactDepartment/ArtifactVersion 등 스키마는 P2-1/P2-5에서 이미 갖춰져 있었으므로 이번 단계는 순수 조회 API + 화면 재구성. `/api/artifacts` GET을 확장해 department/importance/currentReviewStatus/archivedAt/최신 ArtifactVersion(versionNumber·format)/그 버전의 pending 검수자를 함께 반환하도록 재작성(기존엔 `archivedAt: null` 필터가 있어 보관된 결과물이 아예 안 보였는데, 이제 전부 반환하고 화면에서 "보관" 필터로 노출). `useArtifacts.ts`의 `ArtifactListItem` 타입 동기화. **`/artifacts` 화면 전면 재작성**: 상단 Tabs를 "회사 공용"(departmentId 없음) + 부서별(`useDepartments()`로 동적 생성)로 재구성하고, 그 아래 필터 6종(상태/담당자/중요도/형식/검수자/생성일-정렬) + "수정 이력만" 토글을 추가. 상태 필터는 최종(approved)/검수중(pending·reviewing 통합)/수정요청/반려/차단/보관(archivedAt!=null, 다른 상태보다 우선)으로 매핑. 각 카드에 부서·중요도·버전·검수자 배지 추가. **부수 수정**: `/api/artifacts`가 이제 보관된 결과물도 반환하게 되면서 `LiveEmployeeLayer.tsx`가 그걸 "최신 결과물"로 오인해 이미 보관된 항목의 말풍선을 직원 위에 계속 띄우는 회귀를 발견해 `archivedAt` 체크 한 줄 추가로 수정. **버그 발견·수정**: 초기 구현에서 필터 Select 트리거가 값 그대로("all", "newest")를 표시하는 문제 발견 — Base UI의 `Select.Value`는 `items`를 Root에 넘기지 않으면 라벨이 아닌 raw value를 그대로 렌더링한다는 것을 확인, `<SelectValue>{(v) => `${label}: ${labelByValue.get(v)}`}</SelectValue>` 형태의 render-prop children으로 해결. **`npm run dev` 실브라우저 검증**: 탭 전환("회사 공용" ↔ "리서치·보고서팀") 시 담당 부서가 없는 기존 레거시 결과물이 "회사 공용"에만 나타나고 부서 탭에서는 정확히 빈 상태를 보임을 확인, 필터 라벨이 올바르게 "상태: 전체" 등으로 표시됨을 확인, 콘솔에서 기존에도 있던(내가 만들지 않은, ArtifactPanel.tsx 등에서 이미 쓰이던) `Button render={<a/>}` nativeButton 경고 외에 새로운 에러 없음을 확인(드롭다운 옵션 클릭 자체는 이 세션의 스크린샷/좌표 해석 도구 문제로 끝까지 조작하지 못했으나, 탭 클릭과 동일한 클릭 메커니즘이고 값 매핑 로직은 순수 함수로 검증 가능해 위험 낮음으로 판단). 테스트 142개 회귀 없이 그대로 통과(이 단계는 새 유닛 테스트 대상 로직이 없는 순수 조회 API+프레젠테이션 계층), `npx tsc --noEmit`/`npm run lint`/`npm run build` 전부 통과. 스키마·데이터 변경 없어 dev.db(department=1/employee=1/task=1/artifact=1/approvalRequest=4) 그대로 보존.
- 2026-07-23: P2-10 완료 — DataAsset/DataAssetDepartment/DataAssetEmployee/DataAssetTask/DataAccessLog 스키마는 P2-1에서 이미 갖춰져 있었으므로 이번 단계는 로직·화면 구현. `src/lib/direct/dataAssetDirect.ts`: `storeDataAsset`(workspace 안 기존 파일을 SHA-256 checksum과 함께 등록, 활성 자산 중 동일 checksum이 있으면 새로 만들지 않고 `duplicate_checksum` 거부 — plan의 "checksum 기반 중복 감지"), `updateDataAsset`(일반 정보만, storagePath/checksum은 불변 — 내용이 바뀌면 새 자산으로 등록해야 함, Artifact가 파일을 덮어쓰지 않는 것과 동일한 원칙), `archiveDataAsset`(보관, 영구 삭제 아님), `linkDataAssetToTask`(used/produced 관계 기록 + DataAccessLog에 write/reuse로 접근 이력 남김, 중복 연결 거부), `searchDataAssets`(텍스트/유형/부서/민감도 필터, `includeExpired` 기본 false — plan의 "유효기간 확인"을 검색 결과에서 만료된 자산을 기본적으로 제외하는 것으로 구현. 구현 중 `OR` 조건을 텍스트 검색과 유효기간 검사 양쪽에 동시에 쓰면 JS 객체 스프레드가 뒤에 spread된 `OR` 키로 앞의 것을 덮어써버리는 문제를 미리 인지해 `AND: [...]` 배열로 조건을 합치는 방식으로 작성), `getDataAssetAndLogAccess`(조회 시 DataAccessLog에 read 기록). `mcp-server/tools/data-assets.ts`에 MCP 도구 7개 신설: `store_data_asset`/`list_data_assets`/`get_data_asset`/`search_data_assets`/`update_data_asset`/`archive_data_asset`/`link_data_asset_to_task` — DataAsset은 사람이 보는 결과물이 아니라 AI 직원의 내부 작업 자료라 department/employee와 달리 archive도 직접 실행 도구로 노출(plan에 명시된 대로). `/api/data-assets`(목록) + `/api/data-assets/[id]/archive`(사용자 직접 보관, csrfGuard 적용) + `useDataAssets` 훅 + **`/data` 화면 신규**(유형/민감도/텍스트 검색 필터, 활성·보관 토글, 유효기간 만료 배지) + 사이드바에 "데이터 자산" 메뉴 추가. `npm run dev` 실브라우저 검증: 필터 라벨 정상 렌더링, `/api/data-assets` 200 OK, dev.db가 zero-state이므로 빈 상태 화면 정상 표시, 콘솔 에러 0건 확인. 테스트: `dataAssetDirect.test.ts`(등록+checksum 생성, 동일 내용 중복 등록 거부, workspace 밖 경로·존재하지 않는 파일 거부, 일반 정보 수정+버전 증가, not_found, 보관, 업무 연결+접근로그 기록, 중복 연결 거부, 연결 대상 미존재 처리, 검색 시 보관/만료 자산 기본 제외+`includeExpired`로 포함, 조회 시 접근 로그 기록) — 전부 test.db + 실제 workspace 파일시스템 사용. `mcp-server.test.ts`에 7개 도구 추가, 개수 41→48로 갱신. **최종 테스트 155개 전부 통과**, `npx tsc --noEmit`/`npm run lint`/`npm run build` 전부 통과. dev.db 핵심 데이터(department=1/employee=1/task=1/artifact=1/approvalRequest=4) 보존, dataAsset=0(의도된 zero-state) 확인.
- 2026-07-23: P2-11 완료 — Seat 모델·배정 로직은 P2-1/P2-3에서 이미 구현돼 있었으므로 이번 단계는 시각 자산·상태 표현. **좌석 2개분만 그려져 있던 데스크 그래픽을 나머지 좌석까지 확장**: `scripts/generate-office-svg.mjs`(런타임 미사용, 배경 재생성용 참고 스크립트)에 `src/lib/office-seats-config.ts`의 나머지 좌석 좌표(개방형 업무 공간 1·2 각 좌석 3·4, 독립 사무 공간 좌석 2)를 zone rect 기준으로 역산해 desk() 호출 5개 추가, 정적으로 박혀 있던 zone 라벨 생성 블록은 P2-8에서 이미 화면단으로 옮겨졌으므로 스크립트에서도 제거(스크립트와 실제 파일의 불일치 해소). 재생성 결과를 기존 `office-empty.svg`와 diff해 새 데스크 30개 폴리곤(5개×6폴리곤)만 추가되고 나머지는 완전히 동일함을 확인한 뒤 적용(가구가 아닌 zone rect/wall/floor 등은 무변경). **상태별 표시**: 기존 `StatusBadge.tsx`가 이미 12개 EmployeeStatus 전부에 대해 서로 다른 색상·아이콘을 갖고 있었음을 확인(Phase 1 구현) — 이번엔 애니메이션을 아이콘 모양과 분리해 `animated` 플래그로 관리하도록 리팩터링하고 `reviewing`에도 저강도 펄스 링을 추가(기존엔 `running`만 있었음). **자세(posture)**: 새 아트 에셋 없이 코드만으로 상태별 몸짓을 구분하기 위해 `EmployeeMarker.tsx`에 `POSTURE_ROTATION`(상태별 회전각, 발밑 기준점으로 회전) 추가 — 집중 업무 중(running/reviewing)은 살짝 앞으로, 막힘·실패·일시정지는 정도를 달리해 뒤로 기울어짐, 그 외 중립. **`prefers-reduced-motion` 지원**: `src/lib/hooks/usePrefersReducedMotion.ts` 신규(matchMedia 구독) — `StatusBadge`가 이 값이 true면 애니메이션 링을 아예 렌더링하지 않음. 구현 중 `useEffect` 안에서 초기값을 `setState`로 동기 설정하면 react-hooks 린트 규칙(`set-state-in-effect`)에 걸리는 것을 발견해 `useState`의 lazy initializer로 초기값을 계산하고 effect는 change 이벤트 구독에만 쓰도록 수정. **`npm run dev` 실브라우저 검증**: 콘솔 에러 0건 확인 후 JS로 SVG DOM 직접 조회해 `data-employee-id`/`data-status`(idle 확인)/`rotate(0 50 132)` 자세 transform이 실제로 적용됨과, idle 상태에는 `<animate>` 엘리먼트가 0개(애니메이션 없음)임을 확인 — dev.db의 유일한 직원이 idle이라 애니메이션 상태 자체는 직접 못 봤지만 조건부 렌더링 로직이 올바르게 동작함을 코드 경로로 확인. 회귀 없이 테스트 155개 그대로 통과(이 단계는 렌더링 전용이라 새 유닛 테스트 대상 없음), `npx tsc --noEmit`/`npm run lint`(usePrefersReducedMotion 수정 후 에러 0건)/`npm run build` 전부 통과. 스키마·데이터 변경 없어 dev.db(department=1/employee=1/task=1/artifact=1/approvalRequest=4/seat=15) 그대로 보존.
- 2026-07-23: P2-12 완료 — `mcp-server.test.ts`의 e2e 검증(실제 spawn된 서버 프로세스 대상)이 이미 정확한 48개 도구 최종 목록의 단일 진실 소스 역할을 하고 있었음을 확인(회사 상태 2/부서 4/직원 6/업무 11/결과물·검수 5/자동화 4/스킬 4/연동 3/승인 2/데이터 자산 7 = 48개), 이번 단계는 그 실제 구현을 문서 3곳에 반영. **`.claude/skills/company-manager/SKILL.md` 전면 재작성**: Phase 1 당시의 "모든 것은 propose_*" 서술을 걷어내고 "승인 필요한 것은 부서 생성·직원 채용 두 가지뿐, 나머지는 전부 직접 실행"으로 정정, 요청 분류표를 48개 도구 이름과 정확히 매칭되게 재작성, 직급 변경(authorizedBy 두 경로)·업무 완료(문서형 vs 비문서형 분기)·검수(submit_review_decision/revise_artifact)·데이터 자산 절을 신규 추가, "존재하지 않는 도구" 목록에 propose_task/propose_automation/propose_skill/propose_integration 추가. **`README.md`**: "핵심 구조" 다이어그램을 승인 두 가지/직접 실행 나머지의 두 갈래로 재작성, 폴더 구조에 `src/lib/direct·review·pdf·artifacts·execution`/`worker/` 추가, `npm run worker` 사용법 추가, mcp-server 설명의 "28개 도구"를 "48개 도구"로 갱신, 스킬 카탈로그 시드가 P2-7에서 제거됐음을 zero-state 설명에 반영. **`IMPLEMENTATION_PLAN.md` §6**: Phase 1 원안(28개)은 역사 기록으로 그대로 남기고, 그 옆에 "Phase 2 최종 구성은 이 로그 항목과 SKILL.md 참고"라는 안내만 추가(계획 문서 자체의 "구현 중 바뀌면 이유와 함께 반영" 원칙에 따라 과거 기록을 덮어쓰지 않고 갱신 이유를 로그에 남기는 방식 유지). 코드 변경 없는 순수 문서 동기화 단계라 테스트/빌드에 영향 없음(기존 155개 테스트 그대로 유효) — `npm test`/`npx tsc --noEmit`/`npm run build` 재확인해 회귀 없음 확인. dev.db 데이터도 무변경.
- 2026-07-23: P2-13 완료 — `.claude/settings.json`(프로젝트 공유 파일, git 추적됨 — 기존에 있던 `.claude/settings.local.json`은 개인용 미추적 파일이라 그대로 두고 손대지 않음) 신설: `permissions.allow`에 `mcp__company-manager__도구이름` 패턴으로 현재 48개 도구 전부를 정확히 나열(개수 스크립트로 검증), `enabledMcpjsonServers: ["company-manager"]`. Bash 전체 허용(`Bash`/`Bash(*)`)이나 `--dangerously-skip-permissions`류 항목은 의도적으로 하나도 넣지 않음(정규식으로 재검증). 외부 쓰기·영구 삭제·시스템 설정 변경·자격증명 조회 관련 permission도 전혀 추가하지 않음 — 이 파일은 오직 company-manager MCP 도구 호출이 매번 확인창 없이 진행되게 하는 것만 목적이며, 그 외 Bash/파일쓰기 등은 Claude Code의 기본 확인 흐름을 그대로 따른다. 순수 설정 파일 추가라 코드 변경 없음 — `npx tsc --noEmit`/`npm test`(155개) 재확인해 회귀 없음 확인. dev.db 데이터 무변경.
- 2026-07-23: **P2-14 완료 — Phase 2 전체 완료.** 최종 회귀: `npm test` 155개 전부 통과, `npx tsc --noEmit` 통과, `npm run lint` 통과(기존 `materialize.ts`의 미사용 변수 경고 9건만 남음, 전부 Phase 1부터 있던 것으로 이번 범위 밖), `npm run build` 성공(26개 라우트 전부 정상 생성). dev.db 최종 상태 확인: company=1, officeZone=6, seat=15, appSetting=4, department=1("리서치·보고서팀", active), employee=1("리오", rank=1, idle), task=1(completed), artifact=1, artifactVersion=1, approvalRequest=4, reviewPolicy=4, activityLog=9 — 전부 세션 시작 시점과 동일하게 보존됨. skill=0/employeeSkill=0(P2-7에서 의도적으로 초기화), automation=0/integration=0/dataAsset=0/executionJob=0(전부 아직 실사용 없는 정상 zero-state). 최종 완료 보고는 대화 응답으로 작성(승인 정책/48개 MCP 도구 목록/`.claude/settings.json` 자동허용 목록/직급·검수 정책/PDF 방식과 검증 결과/결과물 부서별 분류 구조/DataAsset 구조/사무실 디자인 변경/데이터 마이그레이션 결과/테스트 통과 개수/빌드 결과/dev.db 보존 데이터/실행 방법/재시작 필요 여부 전부 포함).

**Phase 2 전체 요약**: P2-1(스키마+백필) → P2-2(승인 축소) → P2-3(부서/직원 직접실행+사용자제어) → P2-4(Task/Worker) → P2-5(검수 시스템) → P2-6(PDF) → P2-7(스킬 초기화) → P2-8(zone 라벨 프론트) → P2-9(결과물 분류 화면) → P2-10(DataAsset) → P2-11(사무실 시각) → P2-12(문서 동기화) → P2-13(권한 설정) → P2-14(최종 검증). 총 14단계 전부 완료, dev.db 실사용 데이터(부서 1/직원 1/업무 1/결과물 1/승인 4) 단 한 번도 손실 없이 보존.

