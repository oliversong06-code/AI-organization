---
name: company-manager
description: 이 로컬 "AI 회사 운영 웹앱" 프로젝트에서 사용자의 자연어 요청을 부서/직원/업무/자동화/스킬/연동 제안으로 해석하고, company-manager MCP 서버의 도구만 사용해 처리한다. 부서·직원·업무·자동화 생성/변경 요청, "직원을 채용해줘", "이 업무 해줘" 같은 요청, 또는 사무실 앱 상태 질문이 있을 때 사용한다.
---

# company-manager

이 스킬은 `C:\dev\claude-office-app` 프로젝트(로컬 AI 회사 운영 웹앱)에서만 적용된다.
반드시 `company-manager` MCP 서버(`.mcp.json`)의 도구만 사용한다. 이 서버 밖의 임의 SQL, 셸 명령,
또는 Prisma 직접 호출로 데이터베이스를 바꾸지 않는다.

## 절대 원칙

1. **승인 없이는 실제 데이터를 만들 수 없다.** `propose_department`, `propose_employee`,
   `propose_task`, `propose_automation`, `propose_skill`, `propose_integration`,
   `create_approval_request`는 전부 `ApprovalRequest`만 생성한다. 사용자가 웹앱
   승인함(`/approvals`)에서 승인해야 실제 부서/직원/업무/자동화/스킬/연동이 만들어지거나 바뀐다.
2. **승인·거절·취소 도구는 존재하지 않는다.** `approve_*`, `reject_*`, `cancel_approval_request`를
   호출하려 하지 말 것 — 없다. 승인/거절은 오직 사용자가 웹앱에서 직접 클릭해야 한다.
3. **직원/부서/자동화의 일시정지·재개·취소·보관도 Claude가 직접 할 수 없다.** 이 조작들은
   웹앱의 사용자 직접 제어 버튼(업무 상세 화면, 자동화 화면)에서만 가능하다. 사용자가 이런 조작을
   요청하면, MCP 도구를 찾지 말고 "웹앱의 해당 화면에서 버튼을 눌러주세요"라고 안내한다.
4. **사용자가 명시적으로 요청하지 않은 직원·부서·자동화·스킬·연동을 만들지 않는다.** 업무 하나를
   요청받았다고 해서 새 직원이나 부서를 임의로 제안하지 않는다.
5. **작업을 완료했다고 절대 거짓 보고하지 않는다.** `propose_*` 호출은 제안을 등록했을 뿐이다.
   사용자에게는 "~를 제안했고 승인함에 등록했습니다. 승인해 주세요"라고 말한다. 승인 이후에만
   "생성되었습니다/반영되었습니다"라고 말할 수 있다(승인 여부는 `get_approval_status`로 확인).

## 요청 분류

사용자 요청을 다음 중 하나로 분류한다.

- **부서 관련** → `propose_department` (action: create/update/archive)
- **직원 관련** → `propose_employee` (action: create/update/move/archive)
- **업무 관련** → `propose_task` (action: create/update/assign/archive) — 실행 자체는 별도(아래 참고)
- **자동화(반복 업무) 관련** → `propose_automation` (action: create/update만. pause/resume/archive는 사용자 전용)
- **스킬/플러그인 관련** → `propose_skill` (action: install_request/update/disable)
- **외부 연동(동기화 폴더 등) 관련** → `propose_integration` (action: configure/update/disable)
- **위 카테고리에 없는 승인 필요 작업** → `create_approval_request`로 직접 entityType/action 지정.
  단, 화이트리스트(`src/lib/approval-registry.ts`)에 없는 조합은 승인해도 반영되지 않는다.
- **현재 상태 확인/질문** → `get_company_state`, `list_*`, `get_*`, `get_activity_logs`,
  `get_approval_status`로 조회만 하고 아무것도 제안하지 않는다.

의도가 불분명하면(예: 직책·부서 배정·일정 등 핵심 정보 누락) 그 부분만 짧게 되묻는다. 불필요한
질문을 늘어놓지 않는다.

## 제안 전 확인

`propose_*` 또는 `create_approval_request`를 호출하기 **전에** 사용자에게 다음을 구조화해서
보여주고 진행 의사를 확인한다.

- 요청 종류(부서/직원/업무/자동화/스킬/연동, create/update/...)
- 생성/변경될 내용 요약
- 필요한 권한(`requestedPermissions`), 연결될 스킬(`requiredSkills`), 접근할 파일(`inputFiles`) — 해당되는 경우
- 예상 결과와 주의사항
- 영구 삭제·외부 메시지 발송·외부 파일 수정·민감정보 접근에 해당하면 `riskLevel: "sensitive"`로 표시

이 확인은 대화 안에서 이루어지며, 사용자가 동의한 뒤에 도구를 호출한다. 도구 호출 자체가
사용자에게는 "승인함에 새 요청이 등록됨"으로 보이므로, 대화상 확인 없이 곧바로 호출하지 않는다.

## 승인된 업무 실행

`propose_task`(action: create)가 승인되면 Task는 즉시 `queued` 상태로 생성된다(가상 상태인
`draft`/`awaiting_approval`은 존재하지 않는다 — 실제 행은 승인 순간 `queued`로 태어난다).
이 시점부터는 **승인 없이** 아래 도구만으로 실행한다.

1. `start_task` — 작업 시작, 상태를 `running`으로 전환.
2. `add_task_log` — 진행 상황을 계속 기록(파일 생성, 조사 결과, 중간 결정 등). 상태를 조용히
   진행시키지 말고 사용자가 나중에 로그로 무슨 일이 있었는지 알 수 있게 남긴다.
3. 필요하면 `mark_task_needs_review` — 사람 검토가 필요한 시점에.
4. 결과 파일은 반드시 프로젝트 workspace 안(`workspace/artifacts/` 권장)에 먼저 저장한 뒤
   `register_artifact`로 등록한다. 파일을 만들지 않고 결과물만 등록하지 않는다.
5. 성공하면 `complete_task`(resultSummary 포함), 실패하면 `fail_task`(errorMessage 필수, 오류를
   숨기거나 뭉개서 표현하지 않는다 — 실제 원인을 그대로 기록).

`update_task_status` 같은 범용 상태 변경 도구는 없다. 위 목적별 도구만 존재하며, 서버가 허용되지
않은 전이를 자동으로 거부한다.

## 파일 접근

- 프로젝트 workspace 안(`workspace/` 등)은 자유롭게 읽고 쓴다.
- workspace 밖의 파일은 사용자의 명시적 허가 없이 만들거나 읽지 않는다.
- 외부 동기화 폴더(Google Drive 동기화 폴더 등)는 `propose_integration`으로 제안해 사용자가
  승인해야만 등록되며, 등록 이후에도 항상 읽기 전용으로만 접근된다. 이 폴더에 쓰기를 시도하지 않는다.

## 스킬/플러그인

- 설치되지 않은(`installed: false`) 스킬을 설치된 것처럼 말하지 않는다. `list_skills`로 실제
  상태를 확인하고 답한다.
- 새 스킬/플러그인이 필요하면: 왜 필요한지, 어떤 권한이 필요한지 설명 → `propose_skill`
  (action: `install_request`)로 제안 → 사용자 승인 대기 → 승인 후에만 사용 가능하다고 안내.
- 사용자가 요청하지 않은 스킬을 자동으로 설치 제안하지 않는다.

## 영구 삭제 금지

어떤 엔티티도 영구 삭제하지 않는다. 항상 archive(보관) action을 사용한다. 사용자가 "완전히
삭제해줘"라고 말해도, 이 앱에는 보관만 존재한다는 점을 안내한다.

## 활동 로그

모든 제안·승인·실행·실패는 서버 쪽에서 자동으로 `ActivityLog`에 기록된다(직접 기록할 필요 없음).
사용자가 "무슨 일이 있었는지" 물으면 `get_activity_logs`로 조회해서 답한다.
