# 작업 인계 문서 (컨텍스트 초기화 전 저장)

이 문서는 2026-07-22 세션에서 컨텍스트 한도 때문에 작업을 이어받기 위해 작성됨. **가장 먼저
`IMPLEMENTATION_PLAN.md`를 읽을 것** — 이 문서는 그 안의 "Phase 2 진행 로그"를 보완하는
빠른 재개용 요약이다. 두 문서가 어긋나면 `IMPLEMENTATION_PLAN.md`가 항상 우선한다.

## 프로젝트 위치

`C:\dev\claude-office-app` (OneDrive 밖으로 이미 이관 완료 — 절대 OneDrive 경로로 되돌리지 말 것)

## 절대 원칙 (모든 후속 작업에 적용)

- **dev.db를 절대 재생성/reseed/삭제하지 말 것.** 현재 실제 데이터 보존 중: Company 1,
  Department 1("리서치·보고서팀"), Employee 1("리오", rank 1), Task 1(completed),
  Artifact 1, ApprovalRequest 4(전부 이미 approved). 스키마 변경은 항상 **추가 전용**
  마이그레이션(`npx prisma migrate dev --name ...`)으로, 데이터 변경은 `scripts/` 아래
  **재실행 가능한 멱등 백필 스크립트**로 한다(`prisma/seed.ts`는 건드리지 않음 — 그건
  최초 설치 전용이라 zero-state만 만든다).
- 테스트는 `prisma/test.db`에서만(`npm test`), dev.db는 절대 건드리지 않는다
  (`scripts/check-db-target.ts`가 강제).
- 사용자 승인이 필요한 것은 **딱 두 가지**: `department.create`, `employee.create`.
  그 외 전부(업무/자동화/스킬/연동 생성·수정, 부서/직원 수정, Task 실행 등)는 승인 없이
  직접 실행하거나 사용자가 웹앱에서 직접 클릭하는 제어로 처리한다(자세한 정책은
  `IMPLEMENTATION_PLAN.md`의 "Phase 2" 섹션 참고).
- 외부 서비스 연결, 영구 삭제, 해결 불가능한 충돌이 아니면 **단계마다 사용자 승인을 기다리지
  말고 계속 진행**(사용자의 명시적 지시). 이번 세션에서 dev.db가 사용자의 다른 실행 중인
  세션(포트 3000 dev 서버 등)에 잠긴 적이 있었다 — 이런 충돌이 다시 생기면 먼저 무엇이
  잠갔는지 확인하고, 필요하면 사용자에게 물어본 뒤 그 프로세스만 종료할 것(무관한 다른
  프로세스는 건드리지 말 것 — 예: `./mcp/server.mjs`라는 이 프로젝트와 무관한 프로세스가
  같이 떠 있었음).
- `claude` CLI가 **이 개발 샌드박스 PATH에는 없다**(`claude --help` 실행 불가 확인됨).
  Worker의 Claude CLI 비대화형 실행 모듈은 이를 전제로 방어적으로 구현해야 하고
  (CLI 미발견 시 Job을 failed로 안전 종료), 반복 CLI 호출 테스트는 전부 모킹한다.

## 지금까지 완료된 것 (Phase 1 + Phase 2 P2-1, P2-2)

- **Phase 1(18단계)**: 전체 앱 기본 골격 — Next.js 16 웹앱, Prisma/SQLite, 사람 없는
  아이소메트릭 사무실, 승인함 UI, 로컬 MCP 서버(stdio), company-manager 스킬,
  `.mcp.json`, README, Windows 시작 스크립트. (자세한 내용은 `IMPLEMENTATION_PLAN.md`
  앞부분 참고)
- **P2-1**: 추가 전용 마이그레이션(`phase2_rank_review_worker_dataasset`) — Employee.rank,
  OfficeZone.displayName/defaultDisplayName, Seat, ExecutionJob, Artifact 확장
  (departmentId/importance/currentReviewStatus/legacy), ArtifactVersion,
  ArtifactDepartment, ReviewPolicy, ReviewDecision, Skill 확장 필드, DataAsset+연결모델
  4종. `scripts/migrate-policy-v2.ts`(멱등, 재실행 가능)로 zone 라벨 백필, 좌석 15개
  생성 + 기존 직원 좌석 배정, `employeeRequestMinRank=3` 설정, ReviewPolicy 4건,
  기존 Artifact를 legacy+ArtifactVersion v1로 백필.
- **P2-2**: `APPROVAL_REGISTRY`를 department.create/employee.create만 남기고 축소.
  `materialize.ts`가 부서 생성 시 빈 zone 자동배정+displayName 갱신을, 직원 생성 시
  빈 좌석 자동배정+좌표 스냅을 같은 트랜잭션에서 처리하도록 재작성. `propose.ts`에
  직원 채용 제안 게이팅(요청자 rank < employeeRequestMinRank면 거부) + 중복 제안 감지
  추가. MCP: propose_task/propose_automation/propose_skill/propose_integration 제거,
  `create_automation`/`update_automation`/`configure_integration`/`update_integration`
  직접 실행 도구 신설. 총 도구 28개 유지. **테스트 55개 통과, `npm run build` 성공.**

## 지금 진행 중이던 것 (P2-3 완료, P2-4부터 이어갈 것)

P2-3(department/employee 직접 실행 도구 + 사용자 직접 archive/rank 제어)이 2026-07-22
세션에서 완료되었다(`employeeDirect.ts` 작성, MCP 도구 4개 신설, API 라우트 3개 신설, 웹 UI
반영, 테스트 74개 통과, `npm run build` 성공, dev.db 데이터 보존 확인 — 자세한 내용은
`IMPLEMENTATION_PLAN.md`의 Phase 2 진행 로그 P2-3 항목 참고).

**다음은 P2-4(Task/Worker 실행 구조)** — `IMPLEMENTATION_PLAN.md`의 "구현 순서"와 "핵심 설계
결정 > Task/Worker 실행 구조" 절에 설계가 이미 문서화되어 있다. 요약: `create_task`/
`update_task`/`assign_task` 직접 실행 MCP 도구를 `mcp-server/tools/tasks.ts`에 추가(현재
list_tasks/get_task/start_task/add_task_log/mark_task_needs_review/complete_task/fail_task만
있고 생성 도구가 없는 상태), Task 생성 시 즉시 queued + 담당자 유효하면 `ExecutionJob(pending)`
자동 생성(스키마는 P2-1에서 이미 추가됨), `worker/` 디렉터리 신설(pending Job 원자적 claim,
동시 실행 수 제한, 모킹 가능한 `claudeCliRunner.ts`, 오래된 lock 복구, `npm run worker` 스크립트).

## 남은 전체 로드맵 (P2-4 ~ P2-14)

`IMPLEMENTATION_PLAN.md`의 "## 구현 순서"와 "## 핵심 설계 결정" 섹션에 각 단계의 구체적 설계가
이미 문서화되어 있음. 요약:

- **P2-4 Task/Worker 실행 구조**: `propose_task` 완전 폐지 완료(P2-2에서 제거함) → 이제
  `create_task`/`update_task`/`assign_task` **직접 실행 MCP 도구**를 `mcp-server/tools/tasks.ts`에
  추가해야 함(현재 list_tasks/get_task/start_task/add_task_log/mark_task_needs_review/
  complete_task/fail_task만 있음, task 생성 도구가 아직 없는 상태!). Task 생성 시 즉시 queued +
  담당자 유효하면 `ExecutionJob(pending)` 자동 생성(스키마는 이미 P2-1에서 추가됨). `worker/`
  디렉터리 신설: pending Job 원자적 claim(조건부 updateMany), 동시 실행 수 제한, `claudeCliRunner.ts`
  (모킹 가능한 주입형 실행자 — 실제 `claude` CLI 스폰은 이 샌드박스에서 검증 불가하니 CLI 없음을
  전제로 방어적 구현), 오래된 lock 복구, `npm run worker` 스크립트.
- **P2-5 검수 시스템**: `src/lib/review/reviewChain.ts`에 `computeRequiredReviewRanks(chainMode, authorRank)`
  구현(ReviewPolicy.chainMode 4종: author_plus_one/sequential_to_rank3/min3_then_rank4/full_chain_rank4 —
  각각의 해석은 `IMPLEMENTATION_PLAN.md` Phase 2 "검수(Review) 시스템" 절 참고). ReviewDecision 생성,
  본인 결과물 자기검수 금지, 적절한 검수자 없으면 `review_blocked` + 필요 직급 기록, 수정요청 시
  ArtifactVersion 새로 생성, 최대 수정 3회 초과 시 사용자에게 **알림만**(승인 요청 아님).
- **P2-6 PDF 생성**: Windows에서 한글 안 깨지는 방식 실제 검증 필요(Playwright Chromium 인쇄 /
  `@react-pdf/renderer` / PDFKit 후보 — 표·페이지분할·한글폰트 임베딩 실제 테스트 후 택1).
  생성 실패 시 절대 completed 처리 금지.
- **P2-7 스킬 초기화**: 미연결 seed 스킬 6개 dev.db에서 삭제(EmployeeSkill 0건이라 안전 확인됨,
  P2-1 완료 시점 기준 — 재확인 필요). `register_skill`/`validate_skill`/`assign_skill` MCP 직접
  도구 신설.
- **P2-8 사무실 표시 이름**: OfficeZone.displayName은 P2-1/P2-2에서 이미 배필+갱신 로직 구현됨.
  남은 일은 **프론트엔드**: `office-empty.svg`에 박혀 있는 정적 `<text>` 라벨 제거하고
  `/api/office-zones` 데이터 기반 동적 `ZoneLabelLayer` 컴포넌트로 교체(`OfficeScene.tsx`에 추가).
- **P2-9 결과물 부서별 분류**: `/artifacts` 화면을 회사 공용/부서별(최종/검수중/수정요청/보관)
  구조로 재구성, 필터(부서/담당자/중요도/상태/형식/생성일/검수자/버전) 추가.
- **P2-10 DataAsset**: 스키마는 P2-1에서 이미 추가됨. MCP 도구(store/list/get/search/update/
  archive/link_to_task) + `/data` 화면 + checksum 중복감지 + DataAccessLog 신설.
- **P2-11 사무실 시각 개편**: Seat 모델은 P2-1에서 이미 추가·배필됨(`src/lib/office-seats-config.ts`
  참고 — 기존 데스크 좌표 재사용). 남은 일은 상태별(idle/queued/running/reviewing/
  revision_requested/completed/failed/review_blocked) 자세·아이콘·저강도 애니메이션과
  `prefers-reduced-motion` 지원. 배경 SVG에 좌석 4개(open_workspace)/2개(private_office) 등
  전부 대응하는 데스크 그래픽 추가(현재는 좌석 2개분만 그려져 있고 나머지는 좌표만 있음).
- **P2-12 MCP 도구 재구성 최종본**: 요구사항 13장 목록과 실제 구현을 최종 대조, README/SKILL.md
  전체 재작성(도구 목록·개수 변경 반영).
- **P2-13 Claude Code 권한 설정**: `.claude/settings.json` 프로젝트 전용 파일 신설,
  company-manager MCP 도구별 정확한 allowlist(`mcp__company-manager__도구이름` 패턴),
  `--dangerously-skip-permissions` 사용 금지, Bash 전체/외부쓰기/영구삭제 등은 절대 allow 안 함.
- **P2-14 최종**: 전체 회귀 테스트, `npm run build`, dev.db 데이터 보존 최종 확인, 완료 보고
  (사용자가 원래 요청한 17장 형식대로: 승인 정책/MCP 도구 목록/자동허용 목록/직급·검수 정책/
  PDF 방식과 테스트 결과/부서별 분류/DataAsset 구조/사무실 디자인/데이터 마이그레이션 결과/
  테스트 통과 개수/빌드 결과/dev.db 보존 데이터 개수/실행 방법/재시작 필요 여부).

## 재개 방법

1. `IMPLEMENTATION_PLAN.md` 전체(특히 "Phase 2" 이후) 읽기.
2. 이 문서의 "지금 진행 중이던 것" 섹션부터 이어서 구현.
3. 각 P2 단계 완료 시: 테스트 실행 → `npm run build` → dev.db 데이터 보존 확인 →
   `IMPLEMENTATION_PLAN.md` 진행 로그에 기록 → git commit → 다음 단계로 (사용자 지시:
   외부 연결/영구 삭제/해결 불가 충돌이 아니면 승인 기다리지 말고 계속 진행, 보고는 간결하게).
