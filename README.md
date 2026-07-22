# AI 회사 운영 웹앱 (로컬 전용)

Claude Code에 자연어로 요청하면 Claude가 가상의 AI 회사(부서·직원·업무·자동화·결과물)를
만들고 운영하는 로컬 전용 웹앱입니다. 이 앱 자체는 어떤 AI API도 직접 호출하지 않습니다 —
실제 판단과 실행은 Claude Code가 아래의 로컬 MCP 서버를 통해서만 수행하며, 모든 생성·변경은
사용자가 웹앱 승인함에서 직접 승인해야 반영됩니다.

## 요구 사항

- Node.js 20 이상 (개발 시 v24.13.0 사용)
- Windows / macOS / Linux (개발은 Windows 기준)
- **이 프로젝트를 OneDrive/Dropbox 등 클라우드 동기화 폴더 안에 두지 마세요.** SQLite WAL 파일이
  동기화 중 손상되거나 잠길 수 있습니다.

## 처음 실행하기

```bash
npm install
npx prisma migrate deploy   # 이미 생성된 마이그레이션을 dev.db에 적용
npx prisma generate
npm run db:seed             # Company/OfficeZone/AppSetting/Skill 카탈로그만 시드 (직원·부서·업무는 0)
npm run dev                 # http://127.0.0.1:3000
```

Windows에서는 `scripts/start-windows.ps1`로 위 과정을 한 번에 실행할 수 있습니다.

## Claude Code 연결

프로젝트 루트의 `.mcp.json`이 로컬 MCP 서버(`company-manager`)를 등록합니다. 이 프로젝트
폴더(`C:\dev\claude-office-app`)에서 Claude Code를 실행하면 자동으로 인식됩니다. 별도로 MCP
서버를 수동 기동할 필요는 없습니다(Claude Code가 필요할 때 `npx tsx mcp-server/index.ts`를
자식 프로세스로 직접 실행합니다). 수동으로 도구를 점검하려면:

```bash
npm run mcp   # DATABASE_URL=file:./prisma/dev.db 기준으로 직접 실행(대화형 stdio)
```

업무가 실제로 실행되게 하려면(담당 직원이 배정된 Task가 `queued`에 머물지 않고 진행되게)
`npm run dev`와 별도로 워커를 띄웁니다:

```bash
npm run worker   # pending ExecutionJob을 폴링해 Claude Code CLI를 비대화형으로 실행
```

워커는 `claude` CLI가 PATH에 있어야 실제로 동작합니다(없으면 Job이 안전하게 failed로 처리됩니다).

`.claude/skills/company-manager/SKILL.md`가 Claude Code의 동작 규칙(제안→승인 흐름, 금지된
행동)을 정의합니다.

## 핵심 구조

Phase 2부터는 **승인이 필요한 것이 부서 생성과 직원 채용, 딱 두 가지뿐**입니다. 그 외
업무/자동화/스킬/연동/결과물/데이터 자산의 생성·수정·실행은 전부 MCP **직접 실행 도구**로
즉시 반영되고 `ActivityLog`에 기록됩니다.

```
[부서 생성 / 직원 채용]                    [그 외 전부: 업무/자동화/스킬/연동/결과물/데이터 자산]
사용자 요청 → propose_department /         사용자 요청 → Claude Code 해석
             propose_employee 호출         → 해당 직접 실행 MCP 도구 호출(예: create_task,
→ ApprovalRequest만 생성(실제 엔티티 미생성)    update_department, register_artifact, store_data_asset)
→ 웹앱 승인함(/approvals)에서 사용자가 승인/거절 → 즉시 실제 데이터 생성/변경 + ActivityLog 기록
→ 승인 시 서버가 payload를 재검증 후 실제
  데이터 생성/변경(부서→zone 자동배정,
  직원→좌석 자동배정) + ActivityLog 기록
→ 웹앱은 SWR 폴링으로 화면 자동 갱신                → 웹앱은 SWR 폴링으로 화면 자동 갱신
```

- **승인 우회 경로 없음**: MCP에는 `approve_*`/`reject_*`/`cancel_approval_request`가 없습니다.
  부서/직원 생성 승인·거절은 웹앱에서만 가능합니다.
- **부서/직원 보관, 업무/자동화의 일시정지·재개·취소·보관**만 예외적으로 사용자가 웹앱에서
  직접 클릭해 즉시 처리합니다(확인창 + 활동 로그 기록). Claude/MCP는 이 경로를 호출할 수
  없습니다(데이터 자산 보관은 예외 — 내부 작업 자료라 Claude가 직접 처리 가능).
- **결과물은 등록과 동시에 검수 체인이 시작**됩니다(`importance`에 따라 필요한 직급이 순차
  검수, 적절한 검수자가 없으면 `review_blocked`). 문서형 결과물은 한글 PDF 생성이 실제로
  성공해야만 업무가 completed로 전환됩니다.
- **초기 상태는 항상 0**입니다: 직원 0명, 부서 0개, 업무 0개, 자동화 0개, 결과물 0개, 데이터
  자산 0개. 시드 데이터는 Company 1개, 물리적 사무실 공간(OfficeZone) 6개, 기본 설정뿐입니다
  (Phase 1의 스킬 카탈로그 시드는 Phase 2 P2-7에서 제거됨 — 스킬은 이제 `register_skill`로
  직접 등록·검증합니다).

자세한 도구 목록/승인 정책/직급·검수 정책은 `.claude/skills/company-manager/SKILL.md`,
설계 이유와 단계별 진행 기록은 `IMPLEMENTATION_PLAN.md`를 참고하세요.

## 테스트

테스트는 `prisma/test.db`에서만 실행되며 `prisma/dev.db`는 절대 건드리지 않습니다
(`scripts/check-db-target.ts`가 실수로 dev.db를 가리키면 테스트 전체를 즉시 중단시킵니다).

```bash
npm test              # vitest run, .env.test 자동 로드
npm run test:watch    # 워치 모드
npm run test:studio   # test.db를 Prisma Studio로 열람
npm run db:studio     # dev.db를 Prisma Studio로 열람
```

## 폴더 구조

```
prisma/              스키마·마이그레이션·시드
src/app/              Next.js 화면(사무실/업무/자동화/결과물/데이터 자산/승인함/스킬/연동/
                       활동로그/설정) + API 라우트
src/components/       사무실 시각화, 승인함, 업무/자동화/결과물 UI
src/lib/direct/        부서/직원/업무/스킬/데이터자산 직접 실행 로직(승인 불필요)
src/lib/review/        결과물 검수 체인 계산·진행
src/lib/pdf/            한글 폰트 포함 PDF 생성(마크다운/표 요약)
src/lib/artifacts/      결과물 등록 공통 로직(MCP 도구·업무완료 경로 공용)
src/lib/execution/      Task MCP 실행 전용 전이, 문서 결과물과 함께 업무 완료
src/lib/              Prisma 클라이언트, 승인 화이트리스트/재료화, Task 상태 전이,
                     사용자 직접 제어, path-guard, manifest 스캐너
worker/              Task 실행 워커(pending ExecutionJob 폴링·claim·Claude CLI 비대화형 실행)
mcp-server/          로컬 MCP 서버(stdio 전용, 48개 도구)
public/office/       사람 없는 아이소메트릭 사무실 배경(office-empty.svg)과 좌표 계약(office-scene.json)
public/avatars/      직원 캐릭터 아바타 스프라이트(추상적 형태, 실제 인물 아님)
.claude/skills/      company-manager 스킬(Claude Code 동작 규칙)
IMPLEMENTATION_PLAN.md  확정 계획 + 단계별 진행 로그(변경 이유 포함)
```

## 배경 이미지 교체

`public/office/office-empty.svg`만 같은 `viewBox`(0 0 1600 1000) 규칙을 지켜 교체하면 코드
변경 없이 사무실 디자인을 바꿀 수 있습니다. Zone 배치를 바꾸려면 `public/office/office-scene.json`도
함께 수정하세요. `scripts/generate-office-svg.mjs`는 현재 배경을 만든 생성 스크립트로, 참고용으로
남아 있습니다(런타임에는 사용되지 않음).
