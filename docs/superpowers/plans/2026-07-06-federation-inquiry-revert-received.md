# 문의 IN_PROGRESS 수동 되돌리기 (P2-4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** 관리자가 "답변 작성"(IN_PROGRESS)을 눌러놓고 방치하면 학생이 문의를 영구 수정 잠금당하는 상태머신 구멍을 봉합한다 — `IN_PROGRESS → RECEIVED` 역전이 허용(enum) + admin 상세 "접수로 되돌리기" 버튼. 기존 changeStatus API 재사용, 새 엔드포인트 없음. auto-revert 잡(P3)을 대체하는 수동 탈출구(스펙 §8 P2-4). PR 2개(백엔드 PR13 → 프론트 PR14).

**Architecture (핵심 설계 결정):**

- **revert도 version echo 필수** — startProgress와 대칭. stale 화면(옛 내용을 보는 관리자)의 되돌리기는 409로 걸러 refetch를 유도한다. echo 검증을 멱등 판정보다 먼저 수행(startProgress 주석의 근거 동일).
- **멱등 no-op** — echo 통과 후 이미 RECEIVED면 204 수렴(다른 관리자가 먼저 되돌림). startProgress의 IN_PROGRESS 멱등과 동일 패턴.
- **동시 전이 경합은 flush로 감지** — `ObjectOptimisticLockingFailureException` → `InquiryContentChangedException`(409). startProgress 전례 그대로.
- **answer() echo 조건부 강화 (역전이가 깨뜨리는 기존 전제의 봉합)** — 기존 규칙 "IN_PROGRESS 진입 자체가 최신 화면 증명이므로 IN_PROGRESS 답변은 echo 불요"(§4)는 역전이가 없다는 전제였다. 역전이 도입 후: A가 IN_PROGRESS에서 답변 작성 중 → B가 RECEIVED로 되돌림 → 학생 수정(version++) → C가 재진입(IN_PROGRESS) → A의 stale 답변 POST가 echo 없이 통과하는 구멍이 생긴다. 봉합: **IN_PROGRESS 답변도 version이 제공된 경우 echo를 검증**한다. 현재 배포된 FE는 IN_PROGRESS 답변에 version을 안 보내므로(하위호환 필수 — 무조건 요구하면 PR13~PR14 배포 사이 답변 등록이 전부 409) "제공 시에만 검증"으로 넣고, PR14에서 FE가 항상 version을 동봉해 방어를 완성한다. 2단계 봉합임을 코드 주석에 명시.
- **알림 없음** — 스펙 §5 알림 표(접수→ADMIN/답변→작성자/무답변 종결→작성자)에 revert 알림 없음. 학생에게 조용히 수정 가능이 복원된다(비밀문의 특성상 상태 노출 최소화).
- **closed_reason 무관** — revert는 IN_PROGRESS에서만 출발하므로 reason 개념 없음. request의 closedReason은 CLOSED 전용 그대로.
- **되돌리기 후 재답변 흐름은 기존 규칙이 그대로 방어** — revert 후 학생 수정 → 관리자 stale 답변 POST는 RECEIVED 경로의 기존 echo 필수 규칙이 409로 차단(설계 시점에 이미 확인된 안전성).

**레퍼런스:** `FederationInquiryStatus.canTransitionTo`, `GeneralFederationInquiryService.changeStatus/startProgress/answer`, `FederationInquiry` 도메인 메서드(startProgress/close/markAnswered), `FederationInquiryAcceptanceTest`(전이 매트릭스·version echo 기존 케이스), FE `AdminInquiryDetailPage.tsx`(RECEIVED→IN_PROGRESS CTA의 409 시 1회 자동 재시도 패턴 L60-96)

---

## PR13 — backend (`feat/federation-inquiry-revert-api`)

### Task 1: 역전이 + echo 강화

- [ ] `FederationInquiryStatus.canTransitionTo`: `case IN_PROGRESS -> next == CLOSED || next == RECEIVED` (Javadoc의 전이 표 갱신 — RECEIVED 역전이가 수동 탈출구라는 근거 한 줄)
- [ ] `FederationInquiry`에 `revertToReceived()` 도메인 메서드 (startProgress 전례 — canTransitionTo 가드 + status 변경, dirty checking으로 version 증가)
- [ ] `GeneralFederationInquiryService.changeStatus`: `case RECEIVED -> revertToReceived(inquiry, command.version())` 분기 추가, default(직접 지정 불가)는 ANSWERED만 남음 — 주석 갱신
- [ ] `revertToReceived(inquiry, version)` private 메서드: echo 검증(null 또는 불일치 → InquiryContentChangedException) → 이미 RECEIVED면 멱등 no-op → `inquiry.revertToReceived()` → flush 경합 감지. startProgress와 완전 대칭 구조로.
- [ ] `answer()`: RECEIVED 경로 echo 검증을 "상태 무관, version 제공 시 검증"으로 확장 — `if (command.version() != null && !command.version().equals(inquiry.getVersion())) throw` + RECEIVED일 때는 미제공도 거부(기존 규칙 유지). 주석에 2단계 봉합(FE가 PR14부터 항상 동봉) 명시.
- [ ] 인수 테스트 (기존 `FederationInquiryAcceptanceTest` 전이 매트릭스 케이스 갱신 포함):
  ① IN_PROGRESS → RECEIVED 되돌리기 204 + 상세 status RECEIVED
  ② 되돌리기 후 학생 본인 수정 200/204 성공 (영구 잠금 해제 실증 — 핵심 시나리오)
  ③ stale version으로 되돌리기 → 409
  ④ 이미 RECEIVED인 문의에 최신 echo로 되돌리기 → 204 멱등
  ⑤ ANSWERED → RECEIVED 시도 → 4xx (직접 지정 불가/전이 불가)
  ⑥ CLOSED → RECEIVED 시도 → 4xx
  ⑦ 되돌리기 후 학생 수정 → 관리자가 옛 version으로 RECEIVED 직행 답변 → 409 (기존 echo 규칙 재확인)
  ⑧ IN_PROGRESS 답변 + stale version 제공 → 409 (신규 조건부 echo)
  ⑨ IN_PROGRESS 답변 + version 미제공 → 성공 (하위호환 보존)
- [ ] 전이 매트릭스를 단언하던 기존 테스트에서 IN_PROGRESS→RECEIVED가 "불가"로 잠겨 있으면 갱신
- [ ] 전체 `./gradlew test` green → Commit `feat(backend): 문의 IN_PROGRESS 접수 되돌리기 (역전이+echo 강화)`

### Task 2 (게이트): spec 리뷰 + duing-code-reviewer + codex adversarial(상태전이·동시성 — 필수 트리거) → 반영 → push → PR13

## PR14 — web (`feat/federation-inquiry-revert-web`) — PR13 머지 후

### Task 3: 버튼 + version 동봉

- [ ] AdminInquiryDetailPage: status가 IN_PROGRESS일 때 "접수로 되돌리기" 버튼(보조 스타일 — 파괴적 아님) → `changeStatusMutation` `{status:'RECEIVED', version: inquiry.version}`. 409 시 기존 IN_PROGRESS CTA와 동일하게 refetch 후 정확히 1회 자동 재시도. 성공 토스트("접수 상태로 되돌렸어요") + refetch.
- [ ] 답변 등록 payload에 `version: inquiry.version` 동봉(2단계 봉합 완성) — types/client의 payload 타입에 version 필드 추가(백엔드 request는 이미 수용)
- [ ] 테스트: 버튼 노출 조건(IN_PROGRESS만)·클릭 시 mutation 인자(status+version)·409→재시도 1회, answer payload에 version 포함 단언
- [ ] 검증 4종 + 시각 QA(비로그인 스킵 영역이므로 admin 계정 가용 시에만 실화면, 불가 시 컴포넌트 테스트로 대체) + FE 리뷰 + codex → push → PR14

## Out of Scope
- auto-revert 잡·RECEIVED 7일+ 리마인더 잡(P3, 방치 실측 후), in_progress_by "작성 중" 표시(P3, 관리자 2인+ 시), revert 알림, 재오픈(CLOSED→) 전이

## Self-Review
- 역전이의 유일한 실질 위험(다중 관리자 stale 답변)을 answer 조건부 echo로 봉합하되 배포 순서 하위호환을 지켰는가 — "제공 시에만 검증"이라 PR13 단독 배포에서도 기존 FE 동작 불변. 잔여 구멍(PR13~14 사이 version 미제공 답변)은 기존 수준과 동일(개악 아님)이고 관리자 1인 운영 현실에서 위험 미미.
- revert echo·멱등·flush 순서가 startProgress와 대칭이라 리뷰 비용 최소.
- 스펙 §8 P2-4 문구("전이 허용 + 버튼 + 기존 API 재사용")를 벗어나는 신규 표면 없음.
