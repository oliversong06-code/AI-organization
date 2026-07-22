---
name: company-manager
description: 이 로컬 "AI 회사 운영 웹앱" 프로젝트에서 사용자의 자연어 요청을 부서/직원/업무/자동화/스킬/연동/데이터 자산 조작으로 해석하고, company-manager MCP 서버의 도구만 사용해 처리한다. 부서·직원·업무·자동화·결과물·데이터 자산 생성/변경 요청, "직원을 채용해줘", "이 업무 해줘", "결과물 검수해줘" 같은 요청, 또는 사무실 앱 상태 질문이 있을 때 사용한다.
---

# company-manager

이 스킬은 `C:\dev\claude-office-app` 프로젝트(로컬 AI 회사 운영 웹앱)에서만 적용된다.
반드시 `company-manager` MCP 서버(`.mcp.json`)의 도구만 사용한다. 이 서버 밖의 임의 SQL, 셸 명령,
또는 Prisma 직접 호출로 데이터베이스를 바꾸지 않는다. 총 48개 도구가 등록돼 있다(아래 "도구
전체 목록" 참고).

## 절대 원칙

1. **승인이 필요한 것은 딱 두 가지뿐이다: 부서 생성(`propose_department`)과 직원 채용
   (`propose_employee`).** 이 두 도구는 `ApprovalRequest`만 생성한다 — 사용자가 웹앱
   승인함(`/approvals`)에서 승인해야 실제 Department/Employee가 만들어지고 사무실 공간/좌석에
   배정된다. **그 외 모든 것(부서·직원 정보 수정/이동, 업무 생성·수정·배정·실행, 자동화 생성·수정,
   스킬 등록·검증·배정, 연동 설정·수정, 결과물 등록·검수·수정본, 데이터 자산 저장·수정·보관·연결)은
   승인 없이 해당 직접 실행 도구를 바로 호출한다.** `propose_task`/`propose_automation`/
   `propose_skill`/`propose_integration`은 더 이상 존재하지 않는다 — 예전에 이런 이름의 도구를
   호출했던 기억이 있어도 지금은 없다.
2. **승인·거절·취소 도구는 존재하지 않는다.** `approve_*`, `reject_*`, `cancel_approval_request`를
   호출하려 하지 말 것 — 없다. 부서/직원 승인·거절은 오직 사용자가 웹앱에서 직접 클릭해야 한다.
3. **다음 조작은 Claude가 절대 직접 할 수 없다 — 웹앱에서 사용자가 직접 클릭해야 한다:**
   부서 보관, 직원 보관, 직원 직급을 사용자 본인 권한으로 변경(rank4 직원 권한으로는 가능, 아래
   참고), 업무 일시정지·재개·취소·보관, 자동화 일시정지·재개·보관. 사용자가 이런 조작을 요청하면
   MCP 도구를 찾지 말고 "웹앱의 해당 화면에서 버튼을 눌러주세요"라고 안내한다. (데이터 자산 보관은
   예외 — 사람이 보는 결과물이 아니라 AI 직원의 내부 작업 자료라 `archive_data_asset`으로 직접
   처리한다.)
4. **사용자가 명시적으로 요청하지 않은 직원·부서·자동화·스킬·연동을 만들지 않는다.** 업무 하나를
   요청받았다고 해서 새 직원이나 부서를 임의로 제안하지 않는다.
5. **작업을 완료했다고 절대 거짓 보고하지 않는다.** 부서/직원 생성은 제안만 등록했을 뿐이다 —
   "~를 제안했고 승인함에 등록했습니다. 승인해 주세요"라고 말하고, 승인 이후에만
   "생성되었습니다"라고 말한다(`get_approval_status`로 확인). 문서형 결과물은 PDF 생성이 실제로
   성공해야만 업무를 완료 처리한다 — `complete_task_with_document`가 PDF 생성·등록에 실패하면
   업무 상태는 전혀 바뀌지 않으므로, 그 경우 완료됐다고 말하지 않는다.

## 요청 분류

사용자 요청을 다음 중 하나로 분류한다.

- **부서 생성** → `propose_department`(승인 필요). **부서 정보 수정/공간 재배정** →
  `update_department`(직접 실행, 승인 불필요). **부서 보관** → 사용자가 웹앱에서 직접.
- **직원 채용** → `propose_employee`(승인 필요, `requestedByEmployeeId`를 채우면 그 직원의
  직급이 `employeeRequestMinRank`(기본 3) 미만일 때 거부됨 — 낮은 직급 직원은 스스로 채용을
  제안할 수 없다). **직원 정보 수정** → `update_employee`. **부서/좌석 이동** → `move_employee`.
  **직급 변경** → `update_employee_rank`(아래 "직급 변경" 절 참고). **직원 보관** → 사용자가
  웹앱에서 직접.
- **업무 생성/수정/배정** → `create_task`/`update_task`/`assign_task`(전부 직접 실행, 승인
  불필요 — 생성 즉시 `queued`). **업무 실행** → 아래 "승인된 업무 실행" 절 참고. **업무
  일시정지/재개/취소/보관** → 사용자가 웹앱에서 직접.
- **자동화(반복 업무) 생성/수정** → `create_automation`/`update_automation`(직접 실행).
  **일시정지/재개/보관** → 사용자 전용.
- **스킬/플러그인 등록·검증·배정** → `register_skill`(생성, validationStatus=unvalidated로
  시작) → `validate_skill`(passed로 기록해야 실제 사용 가능) → `assign_skill`(직원에게 배정,
  검증 안 된 스킬이나 compatibleRanks/compatibleDepartments 조건 불만족 시 거부됨). 전부 직접
  실행, 승인 불필요.
- **외부 연동(동기화 폴더 등) 설정/수정** → `configure_integration`/`update_integration`(직접
  실행).
- **결과물 등록/검수/수정본** → 아래 "결과물과 검수" 절 참고.
- **데이터 자산(AI 직원 내부 작업 자료) 저장/검색/수정/보관/업무 연결** → 아래 "데이터 자산" 절
  참고.
- **위 카테고리에 없는, 그러나 승인이 필요할 수도 있는 작업** → `create_approval_request`로
  직접 entityType/action 지정할 수 있으나, 화이트리스트(`department.create`/`employee.create`
  두 조합만)에 없는 조합은 승인해도 반영되지 않는다. 사실상 이 도구를 새로 쓸 일은 거의 없다.
- **현재 상태 확인/질문** → `get_company_state`, `list_*`, `get_*`, `search_data_assets`,
  `get_activity_logs`, `get_approval_status`로 조회만 하고 아무것도 만들거나 바꾸지 않는다.

의도가 불분명하면(예: 직책·부서 배정·일정 등 핵심 정보 누락) 그 부분만 짧게 되묻는다. 불필요한
질문을 늘어놓지 않는다.

## 부서/직원 생성 전 확인

`propose_department`/`propose_employee`를 호출하기 **전에** 사용자에게 다음을 구조화해서
보여주고 진행 의사를 확인한다 — 이 두 가지만 승인함에 등록되므로, 다른 직접 실행 도구들보다
신중하게 확인한다.

- 생성될 내용 요약(부서명/직원 이름·역할·직급·소속·배치 위치)
- 직원 채용의 경우: 채용 사유, 예상 업무, 필요 스킬, 중복 인력 검토 결과(payload의 근거 필드에
  그대로 담겨 승인함에 표시됨)
- 예상 결과와 주의사항

직접 실행 도구(update/move/create_task/create_automation/register_skill/store_data_asset 등)는
승인함에 등록되지 않고 즉시 반영되므로, 되돌릴 수 없거나 사용자가 놀랄 만한 변경이면 실행 전에
대화로 간단히 확인하는 편이 안전하다(특히 파일을 새로 만들거나 외부 자료를 참조하는 경우).

## 직급 변경

`update_employee_rank`는 `authorizedBy`가 `"user"` 또는 `"rank4_employee"`여야 한다.
Claude는 사용자를 대신해 `authorizedBy: "user"`로 호출할 수 없다 — 그 경로는 웹앱에서 사용자가
직접 클릭할 때만 쓰인다. Claude가 이 도구를 쓸 수 있는 유일한 경우는 실제로 직급 4인 **다른**
직원이 권한을 행사하는 시나리오(`authorizedBy: "rank4_employee"`, `authorizingEmployeeId`에
그 직원의 id)뿐이며, 서버가 `authorizingEmployeeId`가 실제 직급 4이고 대상 본인이 아닌지 DB로
검증한다.

## 승인된 업무 실행

`create_task`로 만들어진 업무는 즉시 `queued` 상태다(가상 상태인 `draft`/`awaiting_approval`은
존재하지 않는다). `assignedEmployeeId`가 유효하면 `ExecutionJob`이 자동 생성되어 워커가 처리를
시작할 수 있다. 업무 자체를 실행하는 동안은 아래 도구만으로 진행한다.

1. `start_task` — 작업 시작, 상태를 `running`으로 전환.
2. `add_task_log` — 진행 상황을 계속 기록(파일 생성, 조사 결과, 중간 결정 등). 상태를 조용히
   진행시키지 말고 사용자가 나중에 로그로 무슨 일이 있었는지 알 수 있게 남긴다.
3. 필요하면 `mark_task_needs_review` — 사람 검토가 필요한 시점에.
4. 결과 파일은 반드시 프로젝트 workspace 안(`workspace/artifacts/` 권장)에 먼저 저장한다.
5. 완료 처리는 결과물 성격에 따라 갈린다:
   - **문서형 결과물(사람이 읽는 보고서 등)** → `complete_task_with_document` 하나만 호출한다.
     이 도구가 한글 폰트가 포함된 PDF를 실제로 생성하고 결과물로 등록한 뒤에만 업무를
     completed로 전환한다 — PDF 생성이나 등록이 실패하면 업무 상태는 전혀 바뀌지 않으므로 이
     경우 재시도하거나 사용자에게 실패를 알린다. CSV/XLSX가 원본이면 원본은 그대로 두고
     `content.kind: "table_summary"`로 요약 PDF만 만든다.
   - **문서형이 아닌 결과물(코드, 데이터 파일 등)** → 먼저 `register_artifact`로 등록한 뒤
     `complete_task`(resultSummary 포함)를 호출한다.
   - **실패 시** → `fail_task`(errorMessage 필수, 오류를 숨기거나 뭉개서 표현하지 않는다 —
     실제 원인을 그대로 기록).

`update_task_status` 같은 범용 상태 변경 도구는 없다. 위 목적별 도구만 존재하며, 서버가 허용되지
않은 전이를 자동으로 거부한다.

## 결과물과 검수

`register_artifact`(또는 `complete_task_with_document`)로 등록되는 순간 1번 버전
(`ArtifactVersion`)이 생성되고 `importance`에 따른 검수 체인이 즉시 시작된다 — 적절한 검수자가
없으면 `review_blocked`로 표시된다(이 경우 직급 3 이상 직원이 채용 제안을 낼 수 있다). 본인이
작성한 결과물은 스스로 검수할 수 없다.

- 배정된 검수 단계를 처리할 때는 `submit_review_decision`(reviewDecisionId, 실제 검수자
  employeeId, outcome: approved/revision_requested/rejected)을 쓴다. 배정되지 않은 직원으로
  호출하면 거부된다. 승인이면 다음 단계로 자동 진행되거나 마지막 단계면 최종 승인 처리된다.
- 수정 요청을 받은 뒤 새 버전을 만들 때는 `revise_artifact`를 쓴다 — 기존 파일을 덮어쓰지 않고
  항상 새 버전으로 쌓이며, 등록과 동시에 검수 체인이 처음부터 다시 시작된다. 수정 횟수가 정책의
  최대치를 넘겨도 차단되지 않고 활동 로그에 알림만 남는다(사용자에게 승인을 요청하지 않는다).

## 데이터 자산

`DataAsset`은 결과물 보관함(Artifact)과 별개다 — 사람이 보는 최종 산출물이 아니라 AI 직원이
업무 중 참고·생성하는 내부 작업 자료를 위한 저장소다. `store_data_asset`으로 workspace 안에
이미 저장된 파일을 등록하며(동일 내용의 활성 자산이 이미 있으면 checksum으로 감지해 거부),
`search_data_assets`/`get_data_asset`으로 조회하고(조회 시 접근 이력이 자동으로 남는다),
`update_data_asset`으로 정보를 수정하고, `link_data_asset_to_task`로 어떤 업무에서 사용했는지
(used) 또는 그 업무의 산출물인지(produced) 기록하고, 필요 없어지면 `archive_data_asset`으로
직접 보관한다(부서/직원과 달리 이건 승인이나 사용자 클릭 없이 Claude가 직접 처리한다).

## 파일 접근

- 프로젝트 workspace 안(`workspace/` 등)은 자유롭게 읽고 쓴다.
- workspace 밖의 파일은 사용자의 명시적 허가 없이 만들거나 읽지 않는다.
- 외부 동기화 폴더(Google Drive 동기화 폴더 등)는 `configure_integration`으로 직접 설정하되,
  등록 이후에도 항상 읽기 전용으로만 접근한다. 이 폴더에 쓰기를 시도하지 않는다.

## 스킬/플러그인

- 검증되지 않은(`validationStatus`가 `passed`가 아닌) 스킬은 실제로 배정·사용할 수 없다.
  `list_skills`로 실제 상태를 확인하고 답한다.
- 새 스킬/플러그인이 필요하면: 왜 필요한지, 어떤 권한이 필요한지 설명 → `register_skill`로
  등록(승인 불필요, 시작 상태는 항상 unvalidated/비활성) → 실제로 동작을 검증한 뒤
  `validate_skill`로 결과 기록 → `passed`여야 `assign_skill`로 직원에게 배정 가능.
- 사용자가 요청하지 않은 스킬을 자동으로 등록하지 않는다.

## 영구 삭제 금지

어떤 엔티티도 영구 삭제하지 않는다. 항상 archive(보관) action을 사용한다. 사용자가 "완전히
삭제해줘"라고 말해도, 이 앱에는 보관만 존재한다는 점을 안내한다.

## 활동 로그

모든 생성·수정·실행·실패는 서버 쪽에서 자동으로 `ActivityLog`에 기록된다(직접 기록할 필요 없음).
사용자가 "무슨 일이 있었는지" 물으면 `get_activity_logs`로 조회해서 답한다.

## 도구 전체 목록 (48개)

- **회사 상태(2)**: get_company_state, get_activity_logs
- **부서(4)**: list_departments, get_department, propose_department(승인 필요), update_department
- **직원(6)**: list_employees, get_employee, propose_employee(승인 필요), update_employee,
  move_employee, update_employee_rank
- **업무(11)**: list_tasks, get_task, create_task, update_task, assign_task, start_task,
  add_task_log, mark_task_needs_review, complete_task, complete_task_with_document, fail_task
- **결과물/검수(5)**: register_artifact, list_artifacts, get_artifact, submit_review_decision,
  revise_artifact
- **자동화(4)**: list_automations, get_automation, create_automation, update_automation
- **스킬(4)**: list_skills, register_skill, validate_skill, assign_skill
- **연동(3)**: list_integrations, configure_integration, update_integration
- **승인(2)**: create_approval_request, get_approval_status
- **데이터 자산(7)**: store_data_asset, list_data_assets, get_data_asset, search_data_assets,
  update_data_asset, archive_data_asset, link_data_asset_to_task

**존재하지 않는 도구**(호출하려 하지 말 것): approve_*/reject_*/cancel_approval_request,
update_task_status, pause_task/resume_task/cancel_task/archive_task,
pause_automation/archive_automation, archive_employee/archive_department,
propose_task/propose_automation/propose_skill/propose_integration.
