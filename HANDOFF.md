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

## 지금 진행 중이던 것 (P2-10까지 완료, P2-11부터 이어갈 것)

P2-4~P2-10이 전부 완료되어 GitHub main에 커밋+푸시됨(최신 커밋은 `git log`로 확인). 각 단계의
자세한 내용은 `IMPLEMENTATION_PLAN.md`의 Phase 2 진행 로그를 참고 — 요약만 남기면:
- P2-4: `create_task`/`update_task`/`assign_task` MCP 도구 + `worker/` 폴링·claim·재시도 모듈.
- P2-5: `src/lib/review/reviewChain.ts`+`reviewWorkflow.ts` — 검수 체인 계산·착석·승인/수정요청/반려.
- P2-6: `@react-pdf/renderer`+`@fontsource/noto-sans-kr`로 한글 PDF 생성(실측 검증 완료),
  `completeTaskWithDocument`가 PDF 생성 성공 전엔 절대 completed 처리 안 함.
- P2-7: `scripts/reset-skill-catalog.ts`로 미연결 seed 스킬 6개 dev.db에서 삭제(실행 완료),
  `register_skill`/`validate_skill`/`assign_skill` MCP 도구.
- P2-8: `office-empty.svg`의 정적 zone 라벨 제거 → `ZoneLabelLayer`(실시간 `/api/office-zones` 기반).
- P2-9: `/artifacts` 화면을 회사공용/부서별 탭 + 상태·담당자·중요도·형식·검수자·생성일·버전 필터로 재구성.
- P2-10: `src/lib/direct/dataAssetDirect.ts` + MCP 도구 7개(store/list/get/search/update/archive/
  link_to_task, checksum 기반 중복감지 포함) + `/data` 화면 신규.

**다음은 P2-11(사무실 시각 개편)** — `IMPLEMENTATION_PLAN.md`의 "구현 순서"/"핵심 설계 결정"
절에 설계 문서화돼 있음. Seat 모델은 P2-1에서 이미 추가·배필됨. 남은 일: 상태별(idle/queued/
running/reviewing/revision_requested/completed/failed/review_blocked) 자세·아이콘·저강도
애니메이션 + `prefers-reduced-motion` 지원, 배경 SVG에 좌석 4개(open_workspace)/2개
(private_office) 등 전부 대응하는 데스크 그래픽 추가(현재는 좌석 2개분만 그려져 있고 나머지는
좌표만 있음).

## 남은 전체 로드맵 (P2-11 ~ P2-14)

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
