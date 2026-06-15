# BE#13 — 확정 후 일정 변경 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax로 tracking.
> **구현 subagent 는 push·PR 생성·머지를 절대 하지 않는다 — Task 5 는 리뷰 후 컨트롤러가 수행한다.**

**Goal:** SCHEDULED 라운드에서 ① 슬롯 생성·수정·삭제 허용 ② ASSIGNED 멤버의 개별 재배정(교체) + `INTERVIEW_UPDATED` 알림 발행 — 운영진 사정 변경의 시스템 내 구제 경로 (스펙 §6.4, 신규 엔드포인트 0개 — 기존 API 의 phase 확장).

**Architecture:** 기존 가드 2곳의 phase 집합 확장이 전부다: `GeneralInterviewSlotService.requireSlotChangeablePhase` 에 SCHEDULED 추가(Rule 2 재초대는 COLLECTING 조건이라 자연 미발동 — 확인 테스트로 고정), `GeneralInterviewAssignmentService.assignSchedule` 의 ASSIGNING 한정 가드를 {ASSIGNING, SCHEDULED} 로. SCHEDULED 재배정 성공 시 보존된 `InterviewUpdatedEvent(applicationId, slotId, recruitmentId)` 발행 (리스너 무변경 — dedupKey `INTERVIEW_UPDATED:a=:s=`, A→B→A 경계 수용은 §6.4 명문). **unassign 은 ASSIGNING 한정 유지** — §16-1("확정 후 모든 ASSIGNED 는 활성 schedule 1개") 보존. 잠금·교체 로직·capacity 체크는 기존 그대로 (§16-7-4 상속 — 변경 없음).

**Tech Stack:** Spring Boot 3.4 / Java 21 / RestAssured + Testcontainers

**근거 스펙:** §6.4·§8·§9.1 API 4·9·§16-1 / 인프라: `InterviewUpdatedEvent.java`·`InterviewUpdatedListener.java` (기존재 — 발행만)
**리뷰 정책:** duing-code-reviewer + codex 기본 + **codex adversarial** (상태전이 확장 + §16-1 불변식)

---

## 핵심 결정

1. **신규 엔드포인트·예외·레포 메서드 0개** — phase 집합 2곳 확장 + 이벤트 발행 1곳. 도메인 메서드도 무변경 (멤버는 ASSIGNED 그대로 — `assignSchedule` 의 멤버 가드는 EXCLUDED 거부뿐이라 ASSIGNED 통과, BE#10 주석의 "phase 가 선차단" 전제만 갱신).
2. **알림 발행 위치**: `assignSchedule` 에서 round.status == SCHEDULED 일 때만 `eventPublisher.publishEvent(new InterviewUpdatedEvent(applicationId, slotId, round.recruitmentId))` — TX 내 마지막, AFTER_COMMIT 리스너가 롤백 시 미발송 보장 (BE#11 전례). ASSIGNING 은 기존대로 무발행 (draft).
3. **Rule 2 미발동 확인**: `reinviteNoAvailableSlotMembers` 호출 조건이 이미 COLLECTING 한정인지 코드로 확인하고 테스트로 고정 — SCHEDULED 슬롯 추가가 NO_AVAILABLE_SLOT… 멤버를 재초대하면 안 된다 (수집 종료).
4. **CANCELLED 는 모든 경로 불변** — phase 확장 시 CANCELLED 가 새지 않는지 (집합 명시: 슬롯 {DRAFT, COLLECTING, SCHEDULED}, 배정 {ASSIGNING, SCHEDULED}).
5. capacity 축소의 `CapacityBelowAssigned` 검사(BE#9 충전)가 SCHEDULED 에서 실동작하게 됨 — "도달 불가 방어" 주석을 현행화.

## File Map

| 구분 | 파일 | 책임 |
|---|---|---|
| Modify | `service/GeneralInterviewSlotService.java` | phase 집합 +SCHEDULED, 주석 현행화 |
| Modify | `service/GeneralInterviewAssignmentService.java` | assignSchedule phase 확장 + SCHEDULED 시 이벤트 발행 |
| Modify | `api/LeaderInterviewSlotApi.java`·`LeaderInterviewAssignmentApi.java` | @Operation description 갱신 |
| Test Create | `controller/LeaderInterviewRescheduleControllerTest.java` | RestAssured 10건 |
| Test Modify | (기존 테스트 중 "SCHEDULED 불가" 단언이 있으면 §6.4 기준으로 보정 — grep `SCHEDULED` in slot/manage tests) | |

커밋 1개: `feat(backend): 확정 후 일정 변경 — SCHEDULED 슬롯 관리·개별 재배정 + INTERVIEW_UPDATED 알림`

---

### Task 1: 브랜치 생성

- [x] `git checkout develop && git pull origin develop && git checkout -b feat/post-confirm-reschedule`

### Task 2: 통합 테스트 (RED)

- [x] **Step 1**: `LeaderInterviewRescheduleControllerTest` (TestSupport 상속, 기존 헬퍼 패턴 — saveRound(SCHEDULED)·saveSlot·saveMember(ASSIGNED)+schedule):

1. `확정된 라운드에 새 슬롯을 추가할 수 있다` (201)
2. `확정된 라운드에서 슬롯을 추가해도 가능없음 멤버가 재초대되지 않는다` (NO_AVAILABLE_SLOT 멤버 상태 불변 + 알림 부재)
3. `확정된 라운드의 참조 없는 슬롯은 수정·삭제할 수 있다` (PATCH capacity 204 / DELETE 204)
4. `확정된 멤버를 다른 슬롯으로 옮기면 배정이 교체되고 변경 알림이 발송된다` — schedule 교체 단언 + dedupKey `INTERVIEW_UPDATED:a={app}:s={newSlot}` 알림 존재 + 멤버 ASSIGNED 유지
5. `배정 검토 중의 수동 배정은 변경 알림을 보내지 않는다` (ASSIGNING 재배정 → 알림 부재)
6. `확정된 라운드의 정원이 찬 슬롯으로는 옮길 수 없다` (409 SlotCapacityExceeded)
7. `확정된 라운드에서 배정 해제는 여전히 불가하다` (DELETE schedule 409 — §16-1)
8. `취소된 라운드는 슬롯 추가도 재배정도 불가하다` (409 ×2)
9. `확정된 라운드에서 멤버 제외는 여전히 불가하다` (409 — 터미널 의미 유지)
10. `같은 슬롯으로 다시 옮기는 멱등 재배정도 성공한다` (만석 본인 멱등 — BE#10 전례, SCHEDULED 에서)

- [x] **Step 2**: RED 확인 (1·3·4·6·10 FAIL — 현 가드가 409). 기존 슬롯·운영 테스트 중 "ASSIGNING/SCHEDULED 불가" 류 단언 grep — §6.4 와 충돌하는 단언만 보정 목록화. **커밋 금지.**

### Task 3: 구현 (GREEN)

- [x] **Step 1**: `GeneralInterviewSlotService` — phase 집합에 SCHEDULED 추가 (`requireSlotChangeablePhase` 또는 해당 가드 — 기존 구조가 정답), Rule 2 호출부가 COLLECTING 조건인지 확인(아니면 조건 명시), BE#9 의 "도달 불가" 주석 현행화 (§6.4 로 도달 가능해짐).
- [x] **Step 2**: `GeneralInterviewAssignmentService.assignSchedule` — 가드를 `{ASSIGNING, SCHEDULED}.contains(...)` 로, 메서드 끝에서 `if (round.getStatus() == RoundStatus.SCHEDULED) publishEvent(new InterviewUpdatedEvent(...))` (eventPublisher 기존 주입 — BE#11). Javadoc·Api description 갱신.
- [x] **Step 3**: Task 2 Step 2 의 충돌 단언 보정 (의미 무변경 원칙 — 새 정책 반영만). GREEN 10건 + 전체 `./gradlew test` (872+10−보정 예상).
- [x] **Step 4**: 커밋.

### Task 4: 전체 검증

- [x] self-check 7항목 (체크박스 마킹·EOF·금지 라인 — repo 루트).

### Task 5: push + PR (컨트롤러 수행 — 구현 subagent 금지, 머지 금지)

- [x] PR `feat(backend): 확정 후 일정 변경 — SCHEDULED 재조정 + 변경 알림` — 본문: 🚀(운영진 사정 변경 구제 — 신규 엔드포인트 0, phase 확장 2곳+알림 발행, 터미널 의미 유지) / 🤔(해제 불허 근거 §16-1·Rule 2 미발동·A→B→A dedup 수용·제외 불변) / 💬(phase 집합 경계·알림 발행 조건). 스펙 §6.4 링크.

---

## Self-Review (작성 후 점검 완료)

- **스펙 §6.4 전수**: 슬롯 3종 확장→테스트 1·3, Rule 2 미발동→2, 재배정+알림→4·5, 해제 불허→7, capacity→6, CANCELLED 불변→8, 제외 불변→9, §16-1 유지→교체 로직 무변경+7.
- **주의**: ① 기존 테스트 보정은 "SCHEDULED 라서 409" 를 단언하던 것만 — ASSIGNING 슬롯 변경 409 단언은 유지 (ASSIGNING 은 여전히 불가). ② 이벤트 발행이 §16-7-4 잠금 순서·기존 잠금과 무관(읽기만 추가)함을 리뷰에서 확인. ③ dedupKey 는 리스너 기존 형식 그대로 — 테스트 4 의 단언이 리스너 소스의 키 조립과 일치해야.
