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

## Phase 2 전체 완료 (2026-07-23)

**P2-1부터 P2-14까지 14단계 전부 완료되어 GitHub main에 커밋+푸시됨.** 더 이상 이어받을
작업이 없다 — 이 문서는 이제 순수 이력 기록이다. 각 단계 자세한 내용은
`IMPLEMENTATION_PLAN.md`의 "Phase 2 진행 로그"를 참고(모든 단계가 변경 파일·테스트 결과·
dev.db 보존 확인까지 기록돼 있음). 요약:

- **P2-1**: 스키마 확장(Employee.rank, Seat, ExecutionJob, ArtifactVersion, ReviewPolicy/
  ReviewDecision, DataAsset+연결모델 4종 등) + 멱등 백필 스크립트.
- **P2-2**: 승인 화이트리스트를 department.create/employee.create 두 가지로 축소, 나머지는
  직접 실행 도구로 전환.
- **P2-3**: 부서/직원 직접 실행 도구(update/move/rank) + 사용자 직접 보관·직급변경 제어.
- **P2-4**: `create_task`/`update_task`/`assign_task` + `worker/` 폴링·claim·재시도 모듈.
- **P2-5**: 검수 체인 시스템(`reviewChain.ts`/`reviewWorkflow.ts`) — 착석·승인/수정요청/반려.
- **P2-6**: `@react-pdf/renderer`+`@fontsource/noto-sans-kr` 한글 PDF 생성, PDF 실패 시
  업무 completed 처리 절대 안 함.
- **P2-7**: 미연결 seed 스킬 6개 삭제, `register_skill`/`validate_skill`/`assign_skill`.
- **P2-8**: 사무실 zone 라벨을 정적 SVG에서 실시간 `ZoneLabelLayer`로 전환.
- **P2-9**: `/artifacts`를 회사공용/부서별 탭 + 6종 필터로 재구성.
- **P2-10**: DataAsset 서브시스템(MCP 도구 7개, checksum 중복감지, `/data` 화면).
- **P2-11**: 사무실 데스크 그래픽 전 좌석 대응, 상태별 애니메이션+자세, prefers-reduced-motion.
- **P2-12**: `.claude/skills/company-manager/SKILL.md`+`README.md`를 48개 도구 기준으로 재작성.
- **P2-13**: `.claude/settings.json` — 48개 도구 전부 allowlist, 위험한 broad-allow 없음.
- **P2-14**: 최종 회귀(테스트 155개/tsc/lint/build 전부 통과) + dev.db 데이터 보존 최종 확인 +
  완료 보고.

**최종 dev.db 상태**(전부 세션 시작 시점과 동일하게 보존): company=1, officeZone=6, seat=15,
appSetting=4, department=1("리서치·보고서팀"), employee=1("리오", rank=1), task=1(completed),
artifact=1, artifactVersion=1, approvalRequest=4, reviewPolicy=4, activityLog=9,
skill=0/automation=0/integration=0/dataAsset=0(의도된 zero-state).

앞으로 이 프로젝트에 새 작업을 시작할 때는 이 문서 대신 `IMPLEMENTATION_PLAN.md`(설계
근거)와 `.claude/skills/company-manager/SKILL.md`(현재 동작 규칙)를 참고할 것.
