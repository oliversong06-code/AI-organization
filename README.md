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

`.claude/skills/company-manager/SKILL.md`가 Claude Code의 동작 규칙(제안→승인 흐름, 금지된
행동)을 정의합니다.

## 핵심 구조

```
사용자 자연어 요청 → Claude Code 해석 → propose_* MCP 도구 호출
→ ApprovalRequest만 생성(실제 엔티티 미생성)
→ 웹앱 승인함(/approvals)에서 사용자가 승인/거절
→ 승인 시 서버가 payload를 재검증 후 실제 데이터 생성/변경 + ActivityLog 기록
→ 웹앱은 SWR 폴링으로 화면 자동 갱신
```

- **승인 우회 경로 없음**: MCP에는 `approve_*`/`reject_*`/`cancel_approval_request`가 없습니다.
  승인/거절은 웹앱에서만 가능합니다.
- **직원·부서·업무·자동화·스킬·연동의 생성/수정/이동/보관**은 예외 없이 제안→승인 경로만 있습니다.
- **Task/Automation의 일시정지·재개·취소·보관**만 예외적으로 사용자가 웹앱에서 직접 클릭해
  즉시 처리합니다(확인창 + 활동 로그 기록). Claude/MCP는 이 경로를 호출할 수 없습니다.
- **초기 상태는 항상 0**입니다: 직원 0명, 부서 0개, 업무 0개, 자동화 0개, 결과물 0개. 시드
  데이터는 Company 1개, 물리적 사무실 공간(OfficeZone) 6개, 기본 설정, 스킬 카탈로그(전부
  미설치)뿐입니다.

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
prisma/            스키마·마이그레이션·시드
src/app/            Next.js 화면 + API 라우트
src/components/     사무실 시각화, 승인함, 업무/자동화 UI
src/lib/             Prisma 클라이언트, 승인 화이트리스트/재료화, Task 상태 전이,
                     사용자 직접 제어, path-guard, manifest 스캐너
mcp-server/          로컬 MCP 서버(stdio 전용, 28개 도구)
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
