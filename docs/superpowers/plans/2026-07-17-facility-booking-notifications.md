# 시설 예약 상태 알림 연결(스펙 §7.6 이행) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설계 스펙 §7.6(P2로 미뤄뒀던 알림)을 기존 인앱 알림 인프라(이벤트 발행 → `@TransactionalEventListener(AFTER_COMMIT)` → `NotificationService.createIfAbsent` dedup 멱등)로 이행한다. 2026-07-17 감사에서 "불리한 전이(거절·충돌·취소)가 순수 pull 의존"으로 지적된 공백을 닫는다.

**Architecture:** 스펙 §7.6 표 그대로 + 감사 후속으로 열린 관리자 취소(CONFIRMED 포함)를 `FACILITY_BOOKING_CANCELLED`로 확장. 이벤트는 슬림(bookingId·clubId·historyId·사유)하게 두고 표시 문안 조립(시설명·일시)은 리스너가 AFTER_COMMIT 후 조회로 수행 — 발행부(서비스)에 표시용 조회를 끼워 넣지 않는다. dedup 키는 전이 인스턴스 단위(`:h={historyId}`, FederationAnswered 의 `:a={answerId}` 전례)로 CONFLICT→재승인 같은 재전이도 억제 없이 알린다. 리스너는 파일 6개 대신 단일 `FacilityBookingNotificationListener`(핸들러 6개, 문안 조립 헬퍼 공유)로 둔다 — 수신자·문안만 다른 동형 코드 6벌 복제를 피한다.

**Tech Stack:** Spring `ApplicationEventPublisher` + `@TransactionalEventListener(AFTER_COMMIT)` / 기존 notification 도메인 / TestContainers

## Global Constraints

- 커밋: Conventional Commits 한국어 `feat(backend): ...`, attribution 금지
- 브랜치: `feat/facility-booking-notifications` (develop 분기)
- DB 변경 없음 (notification.type 은 VARCHAR(40) CHECK 없음, dedup UNIQUE 기존)
- 알림 실패가 상태 전이를 굴리면 안 됨 — AFTER_COMMIT + 수신자별 try/catch log.warn (전 리스너 전례)
- body ≤300자 (사유 500자 가능 → 절단)
- gradlew 는 backend/ cwd 에서 실행, BUILD SUCCESSFUL 출력 직접 확인

## Out of Scope

- FE 변경 없음 — FE 는 서버 title/body/linkUrl 을 그대로 렌더하고 type 유니온은 런타임 미검증(FEE_* 전례로 무해 확인)
- 메일 발송 (인프라 제거됨 #629, 스펙 명시 인앱 전용)
- 동아리 자체 취소(cancelByClub) 알림 — 자기 행위라 불필요
- 겹치는 PENDING 자동 거절 알림(스펙 P2 잔여 — 자동 거절 기능 자체가 미구현)
- SUBMITTED 대량 수신 최적화(broadcaster) — ADMIN 극소수라 loop 로 충분(FederationReceived 전례)

## 알림 명세 (스펙 §7.6 + CANCELLED 확장)

| 타입 | 수신자 | 트리거 | dedup |
|---|---|---|---|
| FACILITY_BOOKING_SUBMITTED | ADMIN 전원 | create | `:b={bookingId}` |
| FACILITY_BOOKING_APPROVED | 신청 동아리 운영진 | approve | `:b=..:h={historyId}` |
| FACILITY_BOOKING_REJECTED | 운영진 | reject (사유 포함) | 〃 |
| FACILITY_BOOKING_CONFIRMED | 운영진 | confirmManually + 매칭 잡 자동 확정 | 〃 |
| FACILITY_BOOKING_CONFLICT | ADMIN 전원 + 운영진 | markConflict (상세 포함) | 〃 |
| FACILITY_BOOKING_CANCELLED | 운영진 | 관리자 cancel (사유 포함) | 〃 |

링크: 운영진 `/manage/clubs/{clubId}/facility-bookings`, ADMIN `/admin/facility-bookings`.
수신자 해석: 운영진 = `ClubMemberRepository.findOfficerUserIdsByClubIdIn`, ADMIN = `UserRepository.findAllByRole(ADMIN)`.

### Task 1: 통합 테스트(red) → 타입·이벤트·리스너·발행부 구현(green)

**Files:**
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/FacilityBookingNotificationIntegrationTest.java` (신규, 사이드 파일 픽스처 패턴)
- Modify: `backend/src/main/java/com/duing/domain/notification/entity/NotificationType.java` (+6)
- Create: `backend/src/main/java/com/duing/domain/notification/event/FacilityBooking{Submitted,Approved,Rejected,Confirmed,Conflict,Cancelled}Event.java`
- Create: `backend/src/main/java/com/duing/domain/notification/listener/FacilityBookingNotificationListener.java`
- Modify: `GeneralFacilityBookingService.create`(Submitted 발행), `GeneralFacilityBookingAdminService` 5개 메서드(history 저장 결과 캡처 후 발행), `FacilityBookingMatchingService.verifyAndConfirm`(Confirmed 발행)

**Steps:** 테스트 작성(컴파일 실패 = red) → 구현 → `./gradlew test --tests FacilityBookingNotificationIntegrationTest` green → facilitybooking·notification 패키지 전체 green → 커밋

### Task 2: 스펙 문서 이행 반영 + 전체 테스트 + 리뷰 + PR

- 스펙 §7.4/§7.6 의 "(P2)" 표기를 이행 완료로 갱신, CANCELLED 행 추가 (2026-07-17 감사 후속 명기)
- `./gradlew test` 전체 green → duing-code-reviewer 리뷰 → self-check → push + PR (머지는 지시 대기)
