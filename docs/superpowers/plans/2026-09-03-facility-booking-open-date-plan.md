# 시설 예약 오픈일 정책 — 반월 창 제거 · 시설별 booking_open_date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 반월(pivot 15) 롤링 창을 완전히 제거하고, 총동연이 시설마다 지정한 `facility.booking_open_date` 부터 익월 말일까지를 신청 창으로 삼는다. 오픈일이 없는 시설은 닫혀 있다. FE 는 가용성 응답의 `bookableFrom/bookableUntil` 만을 단일 진실 공급원으로 쓴다.

**Architecture:** BE 는 `BookingOpenDatePolicy`(순수 판정) 가 `[max(오픈일, 오늘), 익월 말일]`(오픈일 NULL 이면 빈 창) 을 계산하고, `BookingApplicationPolicy` 파사드가 `Facility` 를 받아 신청 검증·가용성 메타 두 소비처에 같은 창을 공급한다. 슬롯 상태·크롤·마감·승인 경로는 창을 참조하지 않으므로 무변경. 오픈일은 `facility` 컬럼 1개(V120)에 저장하고 `PATCH /admin/facilities/{id}/booking-open-date`(시설별) 와 `PATCH /admin/facilities/booking-open-date`(활성 시설 전체, 단일 트랜잭션) 로 바꾼다. 전역 `GET /facilities/booking-window` 는 구 FE 번들의 내비게이션을 위해 한 릴리스 동안 참조 창(오늘~익월 말일)을 내리다가 다음 릴리스에서 삭제한다. FE 는 페이지의 전역 창 사용을 `availability` 값으로 치환하고, 홈 카드는 원시 `bookingOpenDate` 로 "M.d부터 예약 가능 / 예약 신청 가능 / 예약 준비 중" 을 표시하며, 관리자 콘솔 `?tab=open` 탭에서 시설별·전체 오픈일을 저장한다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway 10.20.1 / JUnit 5 + Mockito + Testcontainers(인수·경합) · Next.js 15 / React 19 / vitest + testing-library + msw.

**Spec:** 이 문서 §1(최종 정책 결정) 이 스펙이다. 조사 근거: 조사 보고 https://claude.ai/code/artifact/d24a1146-4223-4c55-b904-00a6671e6ae1 (2026-09-03), 구 정책 `docs/superpowers/specs/2026-07-14-facility-ux-refresh-design.md §1.5`.

**개정 이력:** v1(2026-09-03) fork 리뷰 BE/FE 반영 → **v2(2026-09-03) 사용자 최종 확인 3건 반영** — ① NULL=닫힘으로 변경(§1 P3·판단 근거), ② `@DynamicUpdate` 경합 테스트를 실제 DB·Hibernate 더티 체킹 재현으로 확정 + 실패 시 대안(§4.3·T9), ③ 전체 적용을 단일 트랜잭션 엔드포인트로 설계해 부분 성공 상태 자체를 제거(§4.4·§5·§6.2).

## Global Constraints

- 사용자 확정 정책(§1) 을 임의로 뒤집지 않는다. 특히: 시설별 컬럼 1개 · 상한 익월 말일 · NOT_OPEN 상태 신설 금지 · 크롤/TTL/월 조회 범위 무변경 · 기존 PENDING 자동 취소 금지 · HALF_MONTH 완전 삭제 · availability 가 FE 단일 진실 · booking-window 한 릴리스 deprecated 유지 후 삭제 · 이력/감사 테이블 미도입.
- 커밋 메시지: Conventional Commits + 한국어 `{type}({scope}): 대상 — 변경점`. **Co-Authored-By / 🤖 Generated 라인 금지.**
- **구현자는 push · PR 생성 · 머지를 절대 하지 않는다** — 컨트롤러가 리뷰 후 수행한다.
- 모든 "완료" 보고는 실제 명령 출력 근거. FE 태스크 GREEN = `pnpm test` + `pnpm typecheck` + `pnpm lint` 셋 다(루트 스크립트: `pnpm -r test -- --run` / `pnpm -r typecheck` / `pnpm -r lint`).
- BE 명령은 `backend/` 에서 `./gradlew`, FE 명령은 `frontend/` 에서 `pnpm`. 파일은 EOF newline 으로 끝낸다.
- 인수·통합 테스트에서 예약을 생성하는 시설은 반드시 `BookingWindowFixture.opened(facility)` 로 오픈일을 심는다(NULL=닫힘이라 시드 그대로면 400). 신청 날짜는 `BookingWindowFixture.bookableDate()`(오늘+2, KST).
- 하드코딩 미래 절대날짜 금지(CI 타임밤). 단위 테스트는 `Clock.fixed(…, Asia/Seoul)` 로 고정. 과거 고정일(`2020-01-01`)은 허용(판정이 오늘로 clamp).
- 브랜치: BE = `feat/facility-booking-open-date-be`, FE = `feat/facility-booking-open-date-fe`(둘 다 develop `20e88253` 이후 최신에서 분기), 폐기 PR = `chore/facility-booking-window-removal`(다음 릴리스).

---

## 1. 최종 정책 결정 (= 스펙)

| # | 항목 | 결정 |
|---|---|---|
| P1 | 정책 단위 | **시설별.** `facility.booking_open_date DATE NULL`. 정책 이력 테이블은 이번 범위 밖. |
| P2 | 신청 창 | `bookableFrom = max(today, bookingOpenDate)`, `bookableUntil = YearMonth.from(today).plusMonths(1).atEndOfMonth()`. 크롤 월(당월+익월)·FE 열람 월 `[prev, cur, next]`·스냅샷 TTL(10분/24h)·가용성 월 가드(직전~익월) 무변경. |
| P3 | NULL 의미 | **NULL = 닫힘(총동연이 아직 열지 않음).** 가용성은 빈 창(`bookableFrom = 익월 말일 + 1 > bookableUntil`), 신청은 400 "아직 예약 신청이 열리지 않았어요.", FE 는 미래 셀 전부 "예약 기간 아님" + 안내줄. V120 백필 없음 → **BE 배포 시점부터 총동연이 오픈일을 넣기 전까지 전 시설 신청 불가**(§8 런북으로 공백을 분 단위로 묶는다). 판단 근거는 아래. |
| P4 | 오픈일 변경 | 미래로 바꾸면 **신규 신청부터** 그 이전 날짜 400. 기존 PENDING 자동 취소 없음. 승인/확정/취소 경로는 창 미참조 그대로. 과거 오픈일 저장 허용, 판정은 오늘로 clamp. `null` 저장 = 닫기. |
| P5 | 미오픈 슬롯 | BE 슬롯 상태 신설 없음. 슬롯은 AVAILABLE 로 내려가고 FE 가 `bookableFrom/Until` 로 선택 불가 처리(현행 `BookingCalendar`/`WeekTimetable` 게이팅 유지). |
| P6 | 크롤 분리 | 크롤 범위·신선도·자동 매칭 정책 무변경. 크롤 없음/stale 은 이번 범위 밖(현행: 신청 허용, stale 배너, 자동 확정만 스킵). |
| P7 | 15일 정책 제거 | `HalfMonthBookingWindowPolicy`·`BookingWindowPolicy`·`BookingWindowConfig`·`BookingWindowProperties`(HALF_MONTH/MONTHLY/FREE)·yml 키 2개·`BookingWindow.OpenRange/OpenRangeKind`·`availableBookingRanges` 삭제. 폴백 모드 없음. **`BookingWindow(from, until).contains()` 값 객체는 유지**(두 소비처와 예외가 공유, `isEmpty()`·`closed(until)` 추가). |
| P8 | 전역 booking-window | FE 소비처 전부 제거 → 가용성 응답 단일화. BE 는 한 릴리스 동안 엔드포인트를 **참조 창(오늘~익월 말일, 시설 무관)** 으로 유지(구 FE 의 월 기본값·주 이동 클램프가 이 값으로 동작해야 하므로 "닫힘" 을 내리면 안 된다. `availableBookingRanges` 는 제거 — 구 FE 타입에서 optional) → 다음 릴리스 PR 로 삭제. |

**P3 판단 근거(사용자 최종 확인 ①)**

- 요구사항 원문 "운영자가 특정 날짜를 선택하면 **그 날짜부터** 해당 시설의 예약이 열리는 방식" 의 자연스러운 역은 "선택하기 전에는 열리지 않는다" 이다. NULL=오늘부터는 이 역을 깨고 "선택 안 하면 무제한 오픈" 이 된다.
- 운영 맥락: 반월 잠금은 07-14 스펙 §1.5 에 "**사용자 지시**, 항상 **다음 예약 오픈 구간만** 신청 가능" 으로 도입됐고, 07-18 결정 로그에서 "7일 전" 대안까지 철회하며 유지됐다. 총동연이 접수 시기를 통제하려는 의도가 두 번 확인된 셈이다. NULL=오늘부터는 V120 배포 순간 총동연의 선택 없이 익월 전체(1~15일 시점엔 익월 하반기까지) 를 자동으로 열어 이 의도와 정면충돌한다.
- 코드 맥락: 학교 목록 동기화(`FacilitySyncService`)가 새 시설을 만들거나 아카이브를 복구하면 오픈일이 NULL 이다. NULL=오늘부터면 총동연이 검토하기 전에 새 방이 즉시 신청 가능 상태가 된다. NULL=닫힘이면 검토 후 열 수 있다.
- "넓어짐" 자체는 NULL 의미와 무관하게 P2(상한 익월 말일) 의 귀결이다 — 오픈일을 오늘로 넣는 순간 익월 말일까지 열린다. 차이는 **누가 그 결정을 하느냐**뿐이며, NULL=닫힘이면 총동연이 관리자 탭에서 명시적으로 선택한다(예: 배포 당일 "전체 적용 = 오늘" 이면 현행보다 넓게, "= 다음 반월 시작일" 이면 현행과 유사하게).
- 비용: BE 배포 ~ 오픈일 입력 사이 신청 불가 공백. 실측 이용량(dev DB 두 달 20건)과 저사용 시간대 배포 관례를 고려하면 분 단위 공백은 수용 가능하고, §8 런북이 공백을 묶는다.

**추가 결정(조사·리뷰에서 도출)**

- D1 **빈 창 표현**: 오픈일 NULL → `BookingWindow.closed(until)` = `(until + 1일, until)`; 오픈일 > 익월 말일 → `(오픈일, until)`. 둘 다 `from > until`. FE 는 `from > until` 한 조건으로 "닫힘" 을 판정한다. 필드 형태(문자열 2개)는 유지 — `bookableUntil` null 은 FE 를 깨뜨린다(조사 §4).
- D2 **오픈일 입력 검증**: 형식 오류 400(`GlobalExceptionHandler.java:81-85` 의 `HttpMessageNotReadableException` 경로), **오늘+1년 초과 400** "예약 오픈일은 오늘부터 1년 이내여야 합니다.", 과거 허용, `null` = 닫기.
- D3 **관리자 목록 노출**: 새 `GET /admin/facilities`(ADMIN, `no-store`, 활성 시설 + `bookingOpenDate`). 공개 `GET /facilities`(`FacilitySummaryResponse`) 와 `GET /facilities/usage`(`FacilityUsage`) 에도 원시 `bookingOpenDate` 를 가산 — 홈 카드용. 두 공개 응답은 기존 60초 public 캐시 그대로.
- D4 **동기화 경합 대책**: `Facility` 에 `@DynamicUpdate`. 실제 DB 에서 재현하는 T9 로 고정하고, 실패 시 대안(행 잠금 양측 적용)을 §4.3 에 둔다.
- D5 **검증 순서 변경**: `create` 에서 시설 로드·아카이브 검사가 창 검증보다 앞으로(정책이 `Facility` 를 받아야 하므로). 우선순위를 단언하는 기존 테스트 0건.
- D6 **검증기 당일 가드**: `BookingPolicyValidator` 는 창을 모른다. 당일 경과 슬롯 거부는 새 `PastSlotException`("이미 지난 시간대는 신청할 수 없어요.", 400). create 경로에서는 마감 정책이 선행해 도달 불가.
- D7 **홈 카드 문구**: `bookingOpenDate` 가 미래 → "**M.d부터 예약 가능**", 오늘 이하 → "**예약 신청 가능**", `null` → "**예약 준비 중**", 필드 없음(구 BE) → "예약 신청 가능". 카드는 창 범위를 계산하지 않는다.
- D8 **전체 적용은 단일 트랜잭션 엔드포인트**(사용자 최종 확인 ③): 시설별 PATCH 를 FE 가 순차 호출하면 부분 성공 상태가 생긴다. `PATCH /admin/facilities/booking-open-date` 가 활성 시설 전체를 한 트랜잭션으로 갱신해 전부 성공 또는 전부 실패만 남긴다. 재시도 UX 불필요(멱등).
- D9 **캘린더 안내줄**: NULL=닫힘 도입으로 "닫힌 시설" 이 정상 상태가 되므로 캘린더 상단에 한 줄을 둔다 — 닫힘 "아직 예약 신청을 받지 않는 시설이에요", 오픈일 미래 "M.d부터 신청할 수 있어요", 그 외 없음.

**Out of Scope(이번 계획에서 하지 않는 것)**

- 정책 이력/감사 테이블, `club_audit_event` 재사용(불가: `club_id NOT NULL`). 변이 지점은 `GeneralFacilityAdminService` 의 두 메서드뿐이라 후속에서 그 자리에 붙인다(§9.4).
- 주기 오픈 규칙(N일마다 자동 오픈), 마감일(`booking_close_date`).
- NOT_OPEN 슬롯 상태, availableSlotCount 정합, 오픈 전 날짜의 서버 측 슬롯 표시 변경.
- 크롤 월 확장, 가용성 월 가드 확장, TTL 변경, 자동 매칭 변경, 마감 정책 변경.
- 새 시설 생성/복구 시 총동연 알림(닫힌 채 생성됨 — 관리자 탭에서 "닫힘" 으로 보인다).
- 운영진(`/manage`) 화면, 제출 배치, 알림.

---

## 2. 아키텍처 / 책임 분리

```
facility (엔티티·동기화·이용현황·관리자 오픈일)          facilitybooking (신청 정책·가용성)
────────────────────────────────────────────          ─────────────────────────────────────
Facility.bookingOpenDate (@DynamicUpdate)   ──읽기──▶  BookingOpenDatePolicy.windowFor(openDate, today)
FacilitySyncService.updateDetails (3필드만)               └▶ BookingWindow(from, until).contains/isEmpty/closed
GeneralFacilityAdminService                               BookingApplicationPolicy(Clock)
  ├ updateBookingOpenDate(1건)      ← 변이 지점 2곳         ├ validateApplication(Facility, Club, ClubMember, date)
  └ updateAllBookingOpenDate(활성 전체, 1 tx)               ├ windowFor(Facility, today)      ← 가용성·신청 공용
AdminFacilityApi  GET   /admin/facilities                  └ referenceWindow(today)          ← booking-window(폐기 예정) 전용
                  PATCH /admin/facilities/{id}/booking-open-date
                  PATCH /admin/facilities/booking-open-date      GeneralFacilityAvailabilityService.getAvailability
FacilitySummaryResponse.bookingOpenDate (공개 목록)          └ bookableFrom/Until = windowFor(facility, today)
FacilityUsage.bookingOpenDate (이용현황)                    GeneralFacilityBookingService.create
                                                            └ facility 로드 → validateApplication(facility, …)
```

- **창 계산 책임 = `facilitybooking.service.BookingOpenDatePolicy`** (Spring 빈 아님, `BookingDeadlinePolicy` 와 같은 순수 클래스). 의존 방향은 현행처럼 facilitybooking → facility 단방향. facility 패키지는 창을 계산하지 않는다(이용현황·목록에는 원시 오픈일만).
- **파사드 `BookingApplicationPolicy`** 는 정책을 조합만 한다. 생성자 `(Clock)`. 검증 순서 ① 창 ② 마감 ③ 중앙동아리 ④ 역할 유지.
- **`BookingPolicyValidator`** 는 기술 검증 전담(창 주입 제거).
- **관리자 변이 = `GeneralFacilityAdminService`** 두 메서드. 컨트롤러는 `@PreAuthorize("hasRole('ADMIN')")` 클래스 레벨(`AdminClubController` 전례) + URL 백스톱 `SecurityConfig.java:97`.
- **FE 단일 진실 = `availability.bookableFrom/bookableUntil`.** `BookingCalendar`/`WeekTimetable` 는 이미 이 값을 props 로 받으므로 무변경.

---

## 3. DB migration 계획

**파일**: `backend/src/main/resources/db/migration/V120__facility_booking_open_date.sql` (V119 가 최신, 원격 전 헤드에 V120 없음 — 2026-09-03 확인. 구현 시작 시 `for h in $(git ls-remote --heads origin | cut -f2); do git ls-tree -r --name-only $h -- backend/src/main/resources/db/migration | grep 'V12[0-9]__'; done` 로 재확인.)

```sql
-- 시설별 예약 오픈일(총동연 설정). NULL = 아직 열지 않음(신청 불가). 신청 창 [max(오픈일, 오늘), 익월 말일] 은
-- 저장하지 않고 조회 시점에 파생한다(BookingOpenDatePolicy). 학교 목록 동기화(FacilitySyncService.updateDetails)는
-- 이름·위치·순서만 갱신하므로 이 값을 건드리지 않는다 — Facility 엔티티의 @DynamicUpdate 가 그 보장을 SQL 수준으로 고정한다.
-- 백필하지 않는다: 기존 시설도 총동연이 관리자 탭에서 오픈일을 넣기 전까지 닫힌다(릴리스 런북 참조).
ALTER TABLE facility ADD COLUMN booking_open_date DATE NULL;
```

- 비파괴·롤백 안전: nullable 컬럼 추가만. 구 이미지는 컬럼을 매핑하지 않아 무시. Flyway 는 `application.yml:39-46` 에 `ignore-migration-patterns` 가 없어 **기본값에 의존**한다 — Boot 3.4.1 관리 Flyway 10.20.1 의 기본 `*:future` 가 "적용됐지만 로컬에 없는 미래 버전" 을 검증에서 무시(V116~V118 롤백 전제와 동일). 릴리스 전 prod 부팅 로그에서 `Successfully validated` 확인.
- **백필 없음(P3).** 배포 직후 오픈은 총동연의 선택 — 관리자 탭 "전체 적용" 또는 §8 런북의 1회성 SQL.
- 인덱스 없음(11행). RLS: V69 가 `facility` 에 RLS 를 켰지만 ALTER ADD COLUMN 은 정책 무관.

---

## 4. Backend 구현 계획

### 4.1 파일 구조

**삭제**
- `backend/src/main/java/com/duing/domain/facilitybooking/service/HalfMonthBookingWindowPolicy.java`
- `backend/src/main/java/com/duing/domain/facilitybooking/service/BookingWindowPolicy.java`
- `backend/src/main/java/com/duing/domain/facilitybooking/config/BookingWindowConfig.java`
- `backend/src/main/java/com/duing/domain/facilitybooking/config/BookingWindowProperties.java`
- `backend/src/test/java/com/duing/domain/facilitybooking/service/HalfMonthBookingWindowPolicyTest.java`
- `backend/src/test/java/com/duing/domain/facilitybooking/config/BookingWindowConfigTest.java`
- `backend/src/main/resources/application.yml:255-260`(`booking.window` 블록), `backend/src/test/resources/application.yml:150-153`

**신규**
- `backend/src/main/resources/db/migration/V120__facility_booking_open_date.sql`
- `backend/src/main/java/com/duing/domain/facilitybooking/service/BookingOpenDatePolicy.java`
- `backend/src/main/java/com/duing/domain/facility/api/AdminFacilityApi.java`
- `backend/src/main/java/com/duing/domain/facility/controller/AdminFacilityController.java`
- `backend/src/main/java/com/duing/domain/facility/controller/dto/request/UpdateFacilityBookingOpenDateRequest.java`
- `backend/src/main/java/com/duing/domain/facility/controller/dto/response/AdminFacilityResponse.java`
- `backend/src/main/java/com/duing/domain/facility/service/FacilityAdminService.java`
- `backend/src/main/java/com/duing/domain/facility/service/GeneralFacilityAdminService.java`
- `backend/src/main/java/com/duing/domain/facility/service/dto/command/UpdateFacilityBookingOpenDateCommand.java`
- 테스트: `BookingOpenDatePolicyTest`, `AdminFacilityAcceptanceTest`, `FacilityBookingOpenDateSyncRaceTest`

**수정**
- `facility/entity/Facility.java` — 컬럼·`changeBookingOpenDate`·`@DynamicUpdate`
- `facility/exception/FacilityException.java` — `InvalidBookingOpenDateException`
- `facility/controller/dto/response/FacilitySummaryResponse.java`, `FacilityUsageResponse.java`, `facility/service/dto/query/FacilityUsageItem.java`, `facility/service/GeneralFacilityUsageService.java:118` — `bookingOpenDate` 가산
- `facilitybooking/service/BookingWindow.java`, `BookingApplicationPolicy.java`, `BookingPolicyValidator.java`, `GeneralFacilityAvailabilityService.java`, `GeneralFacilityBookingService.java`, `FacilityAvailabilityService.java`(시그니처 불변, 주석)
- `facilitybooking/exception/FacilityBookingException.java` — `OutOfBookingWindowException` 메시지 분기, `PastSlotException`
- `facilitybooking/controller/dto/response/BookingWindowResponse.java`, `facilitybooking/api/FacilityAvailabilityApi.java`, `facilitybooking/controller/FacilityAvailabilityController.java`
- 테스트 수정: `BookingWindowFixture`, `BookingApplicationPolicyTest`, `BookingPolicyValidatorTest`, `GeneralFacilityAvailabilityServiceTest`, `FacilityAvailabilityAcceptanceTest`, `FacilityBookingServiceIntegrationTest`, `FacilityBookingAdminServiceIntegrationTest`, `FacilitySyncServiceTest`, 예약 생성 경로를 타는 통합 테스트 8개의 시설 시드(T11)

### 4.2 핵심 코드

**`Facility.java`** (기존 필드 뒤에 추가, 클래스에 `@DynamicUpdate`)

```java
import org.hibernate.annotations.DynamicUpdate;

// 더티 플러시가 변경 컬럼만 UPDATE 하게 한다. 학교 목록 동기화(이름·위치·순서·아카이브)와 총동연 오픈일 변경이
// 서로 다른 컬럼을 쓰는 두 트랜잭션이라, 전 컬럼 UPDATE 면 늦게 커밋한 쪽이 상대 컬럼을 옛 스냅샷으로 되돌린다
// (User 의 GeneralUserService.updateProfile 주석이 지적한 결함). 같은 컬럼을 두 관리자가 동시에 쓰는 경우는 last-writer-wins 허용.
// BaseEntity 의 @LastModifiedDate 는 AuditingEntityListener 가 @PreUpdate 에서 더티로 만들어 UPDATE 에 포함된다.
@DynamicUpdate
public class Facility extends BaseEntity {

    /** 총동연이 정한 예약 오픈일. NULL = 아직 열지 않음(닫힘). 신청 창 계산은 BookingOpenDatePolicy. */
    @Column(name = "booking_open_date")
    private LocalDate bookingOpenDate;

    /** updateDetails(학교 동기화)는 이 값을 건드리지 않는다 — 운영자 설정 보존. null = 닫기. */
    public void changeBookingOpenDate(LocalDate newBookingOpenDate) {
        this.bookingOpenDate = newBookingOpenDate;
    }
```

**`BookingWindow.java`**

```java
/**
 * 예약 가능 구간 값 객체 — 경계 포함([from, until]). from > until 이면 빈 창(닫힘·오픈 전).
 * 닫힘은 closed(until) 로 만든다: from = until + 1 — 필드는 항상 채워진 채로 "포함 날짜 없음" 을 표현한다(FE 계약: 문자열 2개).
 */
public record BookingWindow(LocalDate from, LocalDate until) {

    public static BookingWindow closed(LocalDate until) {
        return new BookingWindow(until.plusDays(1), until);
    }

    public boolean contains(LocalDate date) {
        return !date.isBefore(from) && !date.isAfter(until);
    }

    public boolean isEmpty() {
        return from.isAfter(until);
    }
}
```

**`BookingOpenDatePolicy.java`**

```java
package com.duing.domain.facilitybooking.service;

import java.time.LocalDate;
import java.time.YearMonth;

/**
 * 시설별 예약 오픈일 정책 — 신청 창 = [max(오픈일, 오늘), 익월 말일]. 오픈일 NULL = 닫힘(빈 창).
 * 상한이 익월 말일인 이유: 크롤 수집 범위(당월+익월)·가용성 열람 범위·FE 열람 월과 같은 축을 유지하기 위해서다.
 * 순수 판정 — Clock 은 호출부(BookingApplicationPolicy)가 보유한다.
 */
public class BookingOpenDatePolicy {

    public BookingWindow windowFor(LocalDate bookingOpenDate, LocalDate today) {
        LocalDate until = YearMonth.from(today).plusMonths(1).atEndOfMonth();
        if (bookingOpenDate == null) {
            return BookingWindow.closed(until);
        }
        LocalDate from = bookingOpenDate.isBefore(today) ? today : bookingOpenDate;
        return new BookingWindow(from, until);
    }

    /** 오픈일과 무관한 참조 창(오늘~익월 말일) — 폐기 예정 booking-window 엔드포인트가 구 FE 내비게이션용으로 쓴다. */
    public BookingWindow referenceWindow(LocalDate today) {
        return new BookingWindow(today, YearMonth.from(today).plusMonths(1).atEndOfMonth());
    }
}
```

**`BookingApplicationPolicy.java`** (전체 교체)

```java
@Component
public class BookingApplicationPolicy {

    private final Clock clock;
    private final BookingOpenDatePolicy openDatePolicy = new BookingOpenDatePolicy();
    private final BookingDeadlinePolicy deadlinePolicy = new BookingDeadlinePolicy();
    private final ClubEligibilityPolicy eligibilityPolicy = new ClubEligibilityPolicy();
    private final BookingRolePolicy rolePolicy = new BookingRolePolicy();

    public BookingApplicationPolicy(Clock clock) {
        this.clock = clock;
    }

    /** 순서 = 오류 우선순위: ① 시설 오픈 창 → ② 신청 마감 → ③ 중앙동아리 → ④ 역할. 첫 실패만 던진다. */
    public void validateApplication(Facility facility, Club club, ClubMember applicant, LocalDate reservationDate) {
        LocalDateTime now = LocalDateTime.now(clock);
        BookingWindow window = windowFor(facility, now.toLocalDate());
        if (!window.contains(reservationDate)) {
            throw new FacilityBookingException.OutOfBookingWindowException(window);
        }
        deadlinePolicy.validate(reservationDate, now);
        eligibilityPolicy.validate(club);
        rolePolicy.validate(applicant);
    }

    /** 시설 창 접근자 — 가용성 응답 메타(bookableFrom/Until)도 이 진입점만 쓴다. */
    public BookingWindow windowFor(Facility facility, LocalDate today) {
        return openDatePolicy.windowFor(facility.getBookingOpenDate(), today);
    }

    /** 폐기 예정 booking-window 엔드포인트 전용(다음 릴리스에 삭제). 닫힘을 내리면 구 FE 가 월 기본값·주 이동을 잃으므로 참조 창을 준다. */
    public BookingWindow referenceWindow(LocalDate today) {
        return openDatePolicy.referenceWindow(today);
    }
}
```

**`BookingPolicyValidator.java`** — 생성자 `(Clock clock)`, 필드 `bookingWindowPolicy` 제거, `validateSlotRange` 의 당일 가드:

```java
        if (date.isEqual(today) && !startTime.plusHours(1).isAfter(currentDateTime.toLocalTime())) {
            throw new FacilityBookingException.PastSlotException();
        }
```

**`FacilityBookingException.java`**

```java
    public static class OutOfBookingWindowException extends FacilityBookingException {
        public OutOfBookingWindowException(BookingWindow window) {
            super(window.isEmpty()
                            ? "아직 예약 신청이 열리지 않았어요."
                            : "지금은 %d월 %d일부터 %d월 %d일까지만 신청할 수 있어요.".formatted(
                                    window.from().getMonthValue(), window.from().getDayOfMonth(),
                                    window.until().getMonthValue(), window.until().getDayOfMonth()),
                    HttpStatus.BAD_REQUEST);
        }
    }

    /** 당일 신청 중 첫 1시간이 완전히 지난 슬롯(기술 검증). create 경로에서는 마감 정책이 선행해 도달하지 않는다. */
    public static class PastSlotException extends FacilityBookingException {
        public PastSlotException() {
            super("이미 지난 시간대는 신청할 수 없어요.", HttpStatus.BAD_REQUEST);
        }
    }
```

**`GeneralFacilityBookingService.create`** — 시설 로드를 정책 앞으로(D5):

```java
        ClubMember applicant = clubAuthService.resolveMembership(command.actorId(), command.clubId());
        requireActiveClubUnderLock(club);
        Facility facility = facilityRepository.findById(command.facilityId())
                .orElseThrow(FacilityException.FacilityNotFoundException::new);
        if (facility.isArchived()) {
            throw new FacilityBookingException.ArchivedFacilityException();
        }
        // 신청 비즈니스 정책 4종(시설 오픈 창→마감→중앙→역할) — 단일 진입점. 첫 실패만 반환한다.
        bookingApplicationPolicy.validateApplication(facility, club, applicant, command.date());
```

**`GeneralFacilityAvailabilityService`**

```java
        BookingWindow window = bookingApplicationPolicy.windowFor(facility, today);   // :102 교체 (facility 는 :70-72 에서 양 분기 공통 로드)
        ...
    @Override
    public BookingWindowResponse getBookingWindow() {
        // 폐기 예정(P8): 구 FE 번들의 월 기본값·주 이동 클램프용 참조 창. 시설별 창은 availability 가 내린다.
        return BookingWindowResponse.from(bookingApplicationPolicy.referenceWindow(LocalDate.now(clock)));
    }
```

**`BookingWindowResponse.java`**

```java
/** @deprecated 전 시설 공통 창은 시설별 오픈일 도입으로 의미를 잃었다. 구 FE 호환용 참조 창으로 한 릴리스 유지 후 삭제(§8). */
@Deprecated
public record BookingWindowResponse(LocalDate bookableFrom, LocalDate bookableUntil) {
    public static BookingWindowResponse from(BookingWindow window) {
        return new BookingWindowResponse(window.from(), window.until());
    }
}
```

`FacilityAvailabilityApi` 의 두 `@Operation` 설명을 갱신하고 booking-window 에 `deprecated = true`.

**관리자 API**

```java
// facility/api/AdminFacilityApi.java
@Tag(name = "시설 관리(총동연)", description = "시설별 예약 오픈일 설정")
@SecurityRequirement(name = "BearerAuth")
public interface AdminFacilityApi {

    @Operation(summary = "활성 시설 목록 + 예약 오픈일", description = "sort_order 순. bookingOpenDate null = 닫힘(신청 불가).")
    @GetMapping("/admin/facilities")
    ResponseEntity<ApiResponse<List<AdminFacilityResponse>>> listFacilities();

    @Operation(summary = "시설 예약 오픈일 변경",
            description = "해당 시설의 신청 창을 [max(오픈일, 오늘), 익월 말일] 로 바꾼다. null 이면 닫기. "
                    + "과거 날짜는 허용(판정은 오늘로 clamp), 오늘+1년 초과는 400. 기존 예약은 영향 없음(신규 신청부터 적용).")
    @PatchMapping("/admin/facilities/{facilityId}/booking-open-date")
    ResponseEntity<ApiResponse<Void>> updateBookingOpenDate(
            @PathVariable Long facilityId,
            @Valid @RequestBody UpdateFacilityBookingOpenDateRequest updateFacilityBookingOpenDateRequest);

    @Operation(summary = "활성 시설 전체 예약 오픈일 변경",
            description = "아카이브되지 않은 모든 시설에 같은 오픈일(또는 null=닫기)을 한 트랜잭션으로 적용한다 — 부분 적용 상태가 남지 않는다.")
    @PatchMapping("/admin/facilities/booking-open-date")
    ResponseEntity<ApiResponse<Void>> updateAllBookingOpenDate(
            @Valid @RequestBody UpdateFacilityBookingOpenDateRequest updateFacilityBookingOpenDateRequest);
}

// facility/controller/dto/request/UpdateFacilityBookingOpenDateRequest.java
/** bookingOpenDate 는 nullable — null 은 "닫기". 형식 오류(yyyy-MM-dd 아님)는 역직렬화 400. */
public record UpdateFacilityBookingOpenDateRequest(LocalDate bookingOpenDate) {
    public UpdateFacilityBookingOpenDateCommand toCommand(Long facilityId) {
        return new UpdateFacilityBookingOpenDateCommand(facilityId, bookingOpenDate);
    }
}

// facility/service/dto/command/UpdateFacilityBookingOpenDateCommand.java
public record UpdateFacilityBookingOpenDateCommand(Long facilityId, LocalDate bookingOpenDate) {}

// facility/controller/dto/response/AdminFacilityResponse.java
public record AdminFacilityResponse(Long id, String roomName, String location, LocalDate bookingOpenDate) {
    public static AdminFacilityResponse from(Facility facility) {
        return new AdminFacilityResponse(facility.getId(), facility.getRoomName(), facility.getLocation(),
                facility.getBookingOpenDate());
    }
}

// facility/service/FacilityAdminService.java
public interface FacilityAdminService {
    List<Facility> listActiveFacilities();
    void updateBookingOpenDate(UpdateFacilityBookingOpenDateCommand command);
    void updateAllBookingOpenDate(LocalDate bookingOpenDate);
}

// facility/service/GeneralFacilityAdminService.java
@Service
@RequiredArgsConstructor
public class GeneralFacilityAdminService implements FacilityAdminService {

    private static final Period MAX_OPEN_DATE_HORIZON = Period.ofYears(1);

    private final FacilityRepository facilityRepository;
    private final Clock clock;

    @Override
    @Transactional(readOnly = true)
    public List<Facility> listActiveFacilities() {
        return facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc();
    }

    /** 오픈일 변이 지점 ① — 후속 감사/이력 테이블은 여기에 붙는다(no-op 은 기록하지 않는 전례 유지). */
    @Override
    @Transactional
    public void updateBookingOpenDate(UpdateFacilityBookingOpenDateCommand command) {
        LocalDate newOpenDate = command.bookingOpenDate();
        assertWithinHorizon(newOpenDate);
        Facility facility = facilityRepository.findById(command.facilityId())
                .orElseThrow(FacilityException.FacilityNotFoundException::new);
        if (Objects.equals(facility.getBookingOpenDate(), newOpenDate)) {
            return;
        }
        facility.changeBookingOpenDate(newOpenDate);
    }

    /** 오픈일 변이 지점 ② — 활성 시설 전체를 한 트랜잭션으로. 하나라도 실패하면 전부 롤백(부분 적용 없음). */
    @Override
    @Transactional
    public void updateAllBookingOpenDate(LocalDate bookingOpenDate) {
        assertWithinHorizon(bookingOpenDate);
        for (Facility facility : facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()) {
            if (!Objects.equals(facility.getBookingOpenDate(), bookingOpenDate)) {
                facility.changeBookingOpenDate(bookingOpenDate);
            }
        }
    }

    private void assertWithinHorizon(LocalDate bookingOpenDate) {
        if (bookingOpenDate != null && bookingOpenDate.isAfter(LocalDate.now(clock).plus(MAX_OPEN_DATE_HORIZON))) {
            throw new FacilityException.InvalidBookingOpenDateException();
        }
    }
}
```

`AdminFacilityController` 는 `@RestController @RequestMapping("/api/v1") @PreAuthorize("hasRole('ADMIN')")`(URL 백스톱 `SecurityConfig.java:97` 의 `/api/v1/admin/**` hasRole(ADMIN) 과 이중), GET 은 `CacheControl.noStore()`, 두 PATCH 는 **`ResponseEntity.noContent().build()`(204)** — `AdminClubController.updateClubFacilitySecuredTimeTarget`(`:113`)·`AdminFacilityBookingController` Void 5건과 동일. FE `jsonVoid` 가 이 전례를 이미 소비한다. 라우팅: `/admin/facilities/booking-open-date`(리터럴) 와 `/admin/facilities/{facilityId}/booking-open-date`(경로 변수) 는 세그먼트 수가 달라 충돌하지 않는다.

`FacilityException.InvalidBookingOpenDateException`: 메시지 "예약 오픈일은 오늘부터 1년 이내여야 합니다.", `HttpStatus.BAD_REQUEST`(같은 파일의 `FacilityNotFoundException` 형식 복사 — `protected FacilityException(String, HttpStatus)` `:8-10`).

**공개 응답 가산** — `FacilitySummaryResponse(Long id, String roomName, String location, LocalDate bookingOpenDate)`, `FacilityUsageResponse.FacilityUsage(…, List<Reservation> reservations, LocalDate bookingOpenDate)`, `FacilityUsageItem(…, List<ReservationSlot> reservations, LocalDate bookingOpenDate)`, `GeneralFacilityUsageService.java:118` 에 `facility.getBookingOpenDate()` 전달. 맨 뒤 가산(JSON 소비자 무영향, `applicationClosed` 전례).

### 4.3 캐시 · 트랜잭션 · 동시성 영향

| 항목 | 판정 |
|---|---|
| 서버 캐시 | 없음(`@Cacheable` 0건). 변경 즉시 반영. |
| HTTP 캐시 | 가용성 `no-store` → 즉시. `GET /admin/facilities` `no-store`. 공개 `GET /facilities`·`/facilities/usage` 는 60초 public 유지 → 홈 카드 최대 60초 지연 허용(D3). `booking-window` 60초 public 유지(참조 창이라 시설 무관). |
| 트랜잭션 | PATCH 1건·전체 모두 `@Transactional` 단일 트랜잭션. 조회 서비스 `readOnly` 는 메서드 레벨. |
| 동기화 경합 | `FacilitySyncService.sync()` 는 `@Transactional`(`:44`) 안에서 HTTP 수집(`:46`) → `findAll`(`:55`) → `updateDetails`(`:71`) → 커밋. 로드~커밋 사이에 PATCH 가 커밋되면 전 컬럼 UPDATE 가 `booking_open_date` 를 옛 값으로 되돌린다. **`@DynamicUpdate` 로 변경 컬럼만 쓰게 해 구조적으로 차단**(D4). 실제 DB·Hibernate 더티 체킹으로 재현하는 T9 로 고정(아래). |
| 승인·확정 잠금 | `findByIdForUpdate`(시설 행 잠금) 경로는 시설을 변경하지 않아 UPDATE 를 내지 않음 → 무영향. |
| 관리자 동시 PATCH | 같은 컬럼 last-writer-wins 허용(`@Version` 도입 안 함). 전체 적용과 시설별 PATCH 가 겹치면 행 단위 last-writer-wins. |
| 기존 예약 | `facility_booking` 은 창을 저장하지 않고 승인/확정/취소/매칭은 `windowFor` 미호출 → 무영향(P4). |

**T9 가 실제로 재현하는 것(사용자 최종 확인 ②)** — 실 DB(Testcontainers Postgres)에서 두 트랜잭션을 교차시킨다. 흐름과 검증 대상:

1. 스레드 A(동기화 역할): `transactionTemplate.execute` 안에서 `facilityRepository.findAll()` 로 대상 시설을 **영속 상태로 로드**(스냅샷에 `booking_open_date = null`) → `loaded.countDown()` → `patched.await()`.
2. 메인 스레드(관리자 역할): `loaded.await()` → `facilityAdminService.updateBookingOpenDate(new Command(id, D+5))` — 별도 트랜잭션, **커밋 완료** → `patched.countDown()`.
3. 스레드 A: 같은 영속 인스턴스에 `updateDetails("새 이름", location, sortOrder)` 호출 후 트랜잭션 종료 → Hibernate 더티 체킹이 UPDATE 를 발행하고 커밋.
4. 검증(새 트랜잭션, 1차 캐시 없이 `findById`): `roomName == "새 이름"` **그리고** `bookingOpenDate == D+5`. 부수 검증: `updatedAt` 이 A 커밋 시각으로 갱신됨(감사 컬럼이 DynamicUpdate 에서 빠지지 않음).
5. **음성 대조(구현자가 1회 수행, 커밋하지 않음)**: `@DynamicUpdate` 를 잠시 제거하고 T9 를 돌려 `bookingOpenDate == null` 로 **실패하는지** 확인한 뒤 복구. 실패하지 않으면 테스트가 경합을 재현하지 못한 것이므로 교차 순서를 다시 본다.

이 구성이 실제 `sync()` 를 호출하지 않는 이유: `sync()` 안에는 `findAll` 과 커밋 사이에 교차를 끼워 넣을 훅이 없다(HTTP 수집은 로드 **앞**이라 거기서 멈춰도 경합이 안 생긴다). 스레드 A 는 `sync()` 와 동일한 엔티티 메서드(`updateDetails`)·동일한 더티 플러시 경로를 실 DB 위에서 밟으므로 검증 대상(Hibernate 가 어떤 컬럼을 UPDATE 하는가)은 동일하다. `sync()` 경로 자체의 보존은 T10(Mockito 단위 — 저장소 모의, 엔티티 필드 미터치 검증)이 덮고, DB 수준 보장은 T9 가 담당한다.

**T9 가 실패할 때의 대안(우선순위)** — `@DynamicUpdate` 에 고집하지 않는다.

1. **양측 행 잠금**: `FacilityRepository.findAllForUpdate()`(`@Lock(PESSIMISTIC_WRITE) @Query("SELECT f FROM Facility f ORDER BY f.id")`) 를 `FacilitySyncService.sync():55` 의 `findAll()` 대신 쓰고, 두 관리자 메서드는 `findByIdForUpdate`(기존)·`findAllForUpdate` 로 로드한다. 동기화가 잠금을 잡은 뒤에 온 PATCH 는 커밋까지 대기(ms)하고 새 값 위에 쓰며, PATCH 가 먼저 커밋했으면 동기화의 로드가 그 뒤라 옛 스냅샷이 없다. 잠금 순서는 양쪽 다 id 오름차순이라 교착 없음(승인·확정 경로는 시설 1건만 잠그고 시설 외 행으로 넘어가므로 사이클 없음). 비용: 동기화 루프 동안 시설 행 잠금(ms), HTTP 수집은 로드 앞이라 잠금 밖.
2. 잠금까지 실패하면(가능성 낮음) `FacilitySyncService.updateDetails` 경로를 JPQL `UPDATE Facility SET roomName=…, location=…, sortOrder=… WHERE id=…`(`@Modifying`) 로 바꿔 컬럼을 명시한다 — 더티 플러시 자체를 우회.

### 4.4 권한 · 입력 검증 · 전체 적용

- `/admin/facilities/**` 는 클래스 레벨 `@PreAuthorize("hasRole('ADMIN')")` + URL 백스톱. 비로그인 401·비관리자 403 은 인수 테스트로 고정.
- `facilityId` 미존재 404(`FacilityNotFoundException`). 아카이브 시설 PATCH 허용(값 보존, 복구 시 그대로 적용). 전체 적용은 활성 시설만.
- 바디 `bookingOpenDate`: ISO `yyyy-MM-dd` 외 400, 오늘+1년 초과 400, 과거 허용, null = 닫기.
- **전체 적용 필요성 판단(사용자 최종 확인 ③)**: 구 정책은 전역이었고 dev DB 실측에서 시설 간 정책 차이가 0 이다 — 총동연의 실제 운영 단위는 "전 시설 같은 날짜" 이고, 반월 접수 관행이면 월 2회 11개 시설을 같은 날짜로 바꾼다. 시설별 저장만 두면 매번 11번 저장·11번 확인 다이얼로그가 되므로 **필수**. 부분 성공 문제는 FE 순차 호출 대신 **BE 단일 트랜잭션 엔드포인트(D8)** 로 제거한다 — 성공하면 전부, 실패(400/5xx)하면 아무것도 바뀌지 않으며 재시도는 같은 요청을 다시 보내면 된다(멱등).

---

## 5. API 변경 명세

| API | 변경 | 계약 |
|---|---|---|
| `GET /api/v1/facilities/{id}/availability` | 값 의미 변경 | `bookableFrom = max(오픈일, 오늘)`, `bookableUntil = 익월 말일`. 두 필드 항상 문자열(null 없음). **닫힘(오픈일 null)은 `bookableFrom = 익월 말일 + 1`**, 오픈일 > 익월 말일이면 `bookableFrom = 오픈일` — 둘 다 `bookableFrom > bookableUntil`. 슬롯 상태 무변경. |
| `GET /api/v1/facilities/booking-window` | **폐기 예정(한 릴리스 유지)** | 참조 창 `{ bookableFrom: 오늘, bookableUntil: 익월 말일 }`(시설·오픈일 무관). `availableBookingRanges` 제거. Swagger deprecated. 다음 릴리스 PR 로 삭제. |
| `POST /api/v1/clubs/{clubId}/facility-bookings` | 검증 소스·메시지 | 창 밖 400 "지금은 M월 d일부터 M월 d일까지만 신청할 수 있어요." / 닫힘·오픈 전 400 "아직 예약 신청이 열리지 않았어요.". 시설 404·아카이브가 창 400 보다 먼저(D5). |
| `GET /api/v1/facilities` | 가산 | `FacilitySummary.bookingOpenDate: string \| null` (맨 뒤). |
| `GET /api/v1/facilities/usage`, `GET /api/v1/facilities/{id}` | 가산 | `facilities[].bookingOpenDate: string \| null`. |
| `GET /api/v1/admin/facilities` | **신설** | ADMIN. `[{ id, roomName, location, bookingOpenDate }]` 활성 시설 sort_order 순. `Cache-Control: no-store`. |
| `PATCH /api/v1/admin/facilities/{id}/booking-open-date` | **신설** | ADMIN. 바디 `{ "bookingOpenDate": "2026-09-16" }` 또는 `{ "bookingOpenDate": null }`(닫기). **204 No Content**. 400(형식·1년 초과) · 404. |
| `PATCH /api/v1/admin/facilities/booking-open-date` | **신설** | ADMIN. 같은 바디. 활성 시설 전체에 한 트랜잭션으로 적용. **204**. 400(형식·1년 초과). 부분 적용 없음. |
| 취소·목록·상세·관리자 예약 API | 무변경 | — |

---

## 6. Frontend 구현 계획

### 6.1 파일 구조

**수정**
- `frontend/packages/types/src/facility.ts` — `FacilitySummary.bookingOpenDate?: string | null`, `FacilityItem.bookingOpenDate?: string | null` 추가(optional: 구 BE 폴백). `FacilityBookingRange`·`FacilityBookingWindow` 삭제(importer: `bookingHome.ts:2`, `FacilityBookingPage.tsx:15`, `hooks/facilities.ts:71`, `facilityQueryKeys.ts:14`, `hooks/index.ts:349`, `client.ts:438,1157`, `test/facilities/booking-home-lib.test.ts:3`, 페이지 테스트).
- `frontend/packages/types/src/admin.ts` — `AdminFacility`, `UpdateFacilityBookingOpenDatePayload` 추가.
- `frontend/packages/api/src/client.ts` — `facilities.bookingWindow` 삭제(인터페이스 `:438`, 구현 `:1157`). `frontend/packages/api/src/domains/admin.ts` — `facilities: { list, updateBookingOpenDate, updateAllBookingOpenDate }` 추가(`facilityCrawl` 옆 `:271`/`:591`).
- `frontend/packages/hooks/src/facilities.ts` — `useBookingWindowQuery`(`:67-75`) 삭제. `facilityQueryKeys.ts:14` — `bookingWindow` 삭제. `adminQueryKeys.ts` — `facilitiesAll`, `facilities()` 추가. `index.ts:349` — export 갱신.
- `frontend/apps/web/app/facilities/_lib/bookingHome.ts` — `windowRangeLabel` 삭제, `openDateLabel`·`bookingWindowToastMessage`·`bookingWindowNote` 추가.
- `frontend/apps/web/app/facilities/_components/booking/FacilityHomeCard.tsx` — `windowLabel` prop 삭제, `openDateLabel(facility.bookingOpenDate, todayIso)` 문구(렌더 1곳 `FacilityBookingPage.tsx:437`).
- `frontend/apps/web/app/facilities/_pages/FacilityBookingPage.tsx` — 전역 창 사용 치환 + 익월 오픈 자동 진입 + 안내줄(D9).
- `frontend/apps/web/app/admin/facility-bookings/_pages/AdminFacilityBookingsPage.tsx` — `open` 탭 추가(스테퍼 제외).

**신규**
- `frontend/packages/hooks/src/facilityAdmin.ts` — `useAdminFacilitiesQuery`, `useUpdateFacilityBookingOpenDateMutation`, `useUpdateAllFacilityBookingOpenDateMutation`.
- `frontend/apps/web/app/admin/facility-bookings/_tabs/FacilityOpenDateTab.tsx`
- `frontend/apps/web/app/admin/facility-bookings/_components/FacilityOpenDateConfirmDialog.tsx`
- 테스트 `frontend/apps/web/test/admin/facility-bookings/facility-open-date-tab.test.tsx`

### 6.2 핵심 코드

**타입**

```ts
// packages/types/src/admin.ts
export type AdminFacility = {
  id: number;
  roomName: string;
  location: string | null;
  bookingOpenDate: string | null; // yyyy-MM-dd, null = 닫힘
};
export type UpdateFacilityBookingOpenDatePayload = { bookingOpenDate: string | null };
```

**클라이언트 (`domains/admin.ts`)**

```ts
  // === 시설 관리(총동연) — 시설별 예약 오픈일 ===
  facilities: {
    // GET /api/v1/admin/facilities — 활성 시설 + bookingOpenDate(no-store)
    list(): Promise<AdminFacility[]>;
    // PATCH /api/v1/admin/facilities/{id}/booking-open-date — null 이면 닫기
    updateBookingOpenDate(facilityId: number, payload: UpdateFacilityBookingOpenDatePayload): Promise<void>;
    // PATCH /api/v1/admin/facilities/booking-open-date — 활성 시설 전체, 단일 트랜잭션(부분 적용 없음)
    updateAllBookingOpenDate(payload: UpdateFacilityBookingOpenDatePayload): Promise<void>;
  };
  ...
    facilities: {
      list: () => jsonOk<AdminFacility[]>(http.get('admin/facilities')),
      updateBookingOpenDate: (facilityId, payload) =>
        jsonVoid(http.patch(`admin/facilities/${facilityId}/booking-open-date`, { json: payload })),
      updateAllBookingOpenDate: (payload) =>
        jsonVoid(http.patch('admin/facilities/booking-open-date', { json: payload })),
    },
```

**훅 (`hooks/src/facilityAdmin.ts`)**

```ts
export function useAdminFacilitiesQuery() {
  const client = useApiClient();
  return useQuery({ queryKey: adminQueryKeys.facilities(), queryFn: () => client.admin.facilities.list() });
}

function useInvalidateFacilityOpenDate() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.facilitiesAll });
    // 오픈일은 가용성 bookableFrom·홈 카드(usage/list) 에 즉시 반영돼야 한다 — facilities 프리픽스 전체 무효화.
    queryClient.invalidateQueries({ queryKey: facilityQueryKeys.all });
  };
}

export function useUpdateFacilityBookingOpenDateMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateFacilityOpenDate();
  return useMutation({
    mutationFn: ({ facilityId, payload }: { facilityId: number; payload: UpdateFacilityBookingOpenDatePayload }) =>
      client.admin.facilities.updateBookingOpenDate(facilityId, payload),
    onSuccess: invalidate,
  });
}

export function useUpdateAllFacilityBookingOpenDateMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateFacilityOpenDate();
  return useMutation({
    mutationFn: (payload: UpdateFacilityBookingOpenDatePayload) => client.admin.facilities.updateAllBookingOpenDate(payload),
    onSuccess: invalidate,
  });
}
```

**홈 파생 (`bookingHome.ts`)**

```ts
/** 홈 카드 오픈 안내. 미래 → "M.d부터 예약 가능", 오늘 이하 → "예약 신청 가능", null → "예약 준비 중"(닫힘), 필드 없음(구 BE) → "예약 신청 가능". */
export function openDateLabel(bookingOpenDate: string | null | undefined, todayIso: string): string {
  if (bookingOpenDate === null) return '예약 준비 중';
  if (bookingOpenDate !== undefined && bookingOpenDate > todayIso) {
    return `${Number(bookingOpenDate.slice(5, 7))}.${Number(bookingOpenDate.slice(8, 10))}부터 예약 가능`;
  }
  return '예약 신청 가능';
}

/** 창 밖 셀 탭·무효 딥링크 토스트. 빈 창(from > until)은 "아직 열리지 않음" 으로 안내한다. */
export function bookingWindowToastMessage(bookableFrom: string, bookableUntil: string): string {
  if (bookableFrom > bookableUntil) return '아직 예약 신청이 열리지 않았어요';
  return `현재 예약 가능한 기간이 아니에요 (${rangeDatesLabel(bookableFrom, bookableUntil)})`;
}

/** 캘린더 상단 안내줄(D9). 닫힘 → 시설 문구, 오픈일 미래 → 날짜 문구, 그 외 null(표시 없음). */
export function bookingWindowNote(bookableFrom: string, bookableUntil: string, todayIso: string): string | null {
  if (bookableFrom > bookableUntil) return '아직 예약 신청을 받지 않는 시설이에요';
  if (bookableFrom > todayIso) return `${Number(bookableFrom.slice(5, 7))}.${Number(bookableFrom.slice(8, 10))}부터 신청할 수 있어요`;
  return null;
}
```

**`FacilityBookingPage.tsx` 치환표** (라인은 develop 20e88253 기준)

| 위치 | 현재 | 변경 |
|---|---|---|
| `:6`, `:15` | `useBookingWindowQuery`·`windowRangeLabel` import | 삭제(`bookingWindowToastMessage`·`bookingWindowNote` import 로 교체) |
| `:61, :104-105, :172, :313, :327, :364` | "반월 창"·"windowQuery 로 단일화" 주석 | "시설 오픈일 창(availability.bookableFrom/Until)" 으로 갱신 |
| `:101-102` | `useBookingWindowQuery()`, `windowLabel` | 삭제. **`toastMessage`·`windowNote` 는 `const availability = availabilityQuery.data`(`:129`) 아래에 선언**(위에 두면 TDZ ReferenceError): `const toastMessage = availability ? bookingWindowToastMessage(availability.bookableFrom, availability.bookableUntil) : '현재 예약 가능한 기간이 아니에요';` `const windowNote = availability ? bookingWindowNote(availability.bookableFrom, availability.bookableUntil, todayIso) : null;` |
| `:106,114` | 기본 월 = `windowMonth` | `windowMonth` 삭제 → `yearMonth = yearMonthOverride ?? currentMonth`. **익월 오픈 자동 진입**: `useEffect` — `yearMonthOverride === null && availability !== undefined && availability.bookableFrom <= availability.bookableUntil && availability.bookableFrom.slice(0, 7) === nextMonth` 이면 `setYearMonthOverride(nextMonth)`(`selectFacility:235`·`goHome:245` 가 이미 `setYearMonthOverride(null)` 을 호출하므로 시설 전환 시 stale 없음). deps `[yearMonthOverride, availability, nextMonth]`. 당월 격자 → 익월 격자 1회 전환 깜빡임은 허용. 닫힌 시설은 조건 불충족이라 당월 유지. |
| `:178` | `selectedDate > windowQuery.data.bookableUntil` | `availability !== undefined && selectedDate > availability.bookableUntil` |
| `:189, :292` | 토스트 문자열 조립 | `addToast(toastMessage, { variant: 'error' })` |
| `:316-323` | `changeWeek` 클램프 | `availability.bookableUntil` |
| `:333-338` | `[주]` 기준일 | `availability && availability.bookableFrom <= availability.bookableUntil && isWithinBookable(todayIso, availability.bookableFrom, availability.bookableUntil) ? todayIso : availability && availability.bookableFrom <= availability.bookableUntil ? availability.bookableFrom : todayIso`(빈 창이면 `todayIso`) |
| `:367-372` | `windowUntilMonday`, `canPrevWeek/canNextWeek` 의 `windowQuery.data !== undefined` | `availability` 로 치환 |
| `:437` | `<FacilityHomeCard … windowLabel={windowLabel} />` | prop 제거 |
| `:483-489` 부근(캘린더 위) | — | `{windowNote && <p role="note" className="mb-3 text-sm text-charcoal-2">{windowNote}</p>}` (월간·주간 공통, 성공 스텝 제외) |
| `:490-491, :523-524` | `availability.bookableFrom/Until` props | 무변경 |

`BookingCalendar.tsx`·`WeekTimetable.tsx`·`bookingCalendar.ts(isWithinBookable)` 무변경 — 빈 창은 `isWithinBookable` 이 전부 false 라 미래 셀 전체가 "예약 기간 아님" 이 된다(P5).

**관리자 탭** — `AdminFacilityBookingsPage.tsx` 터치 포인트: `:17-19` import, `:21` `TAB_KEYS` **끝(crawl 뒤)** 에 `'open'`(앞에 끼우면 `indexOf` 기반 스테퍼 번호가 밀린다), `:24-30` `TAB_LABELS.open = '오픈일 설정'`, `:33-64` `TAB_PURPOSE.open` = "시설마다 **예약 신청을 여는 날짜**를 정합니다. 비워 두면 닫혀 있고, 정한 날짜부터 다음 달 말일까지 신청받습니다."(둘 다 `Record<FacilityOpsTab,…>` 라 누락 시 컴파일 실패), `:109` `activeStepIndex = activeTab === 'crawl' || activeTab === 'open' ? -1 : …`, `:224-229` 렌더 분기에 `<FacilityOpenDateTab />`. `resolveTab:73-79`·`tabCountOf:96-101` 무변경.

`FacilityOpenDateConfirmDialog` 는 `app/admin/clubs/_components/AdminClubSecuredTargetToggleDialog.tsx` 를 복제한다 — `@/components/ui/dialog`(shadcn/Radix), `onPointerDownOutside` preventDefault(`:46`), pending 중 Escape 차단(`:47-49`), props `{ title, before, after, isPending, errorMessage, onConfirm, onCancel }`.

`FacilityOpenDateTab.tsx` 구조(네이티브 `<input type="date">`, 클래스는 `BookingManagementTab.tsx:189-193` 의 date input 재사용, 값 형식 `yyyy-MM-dd` = API 형식):

```
[전체 적용]  <input type=date>  [모든 시설에 적용]  [모든 시설 닫기]
  → FacilityOpenDateConfirmDialog("활성 시설 N개", "여러 값" → 날짜 또는 "닫힘") → updateAll 1회 호출(단일 트랜잭션)
  → 성공: 닫힘 + 목록 재조회 / 실패: 다이얼로그 안 오류(ApiError.message, `@duing/api`), 아무 시설도 바뀌지 않았음을 문구로 명시
     ("적용되지 않았어요. 다시 시도해 주세요.") — 재시도는 같은 버튼.
표: 시설 | 위치 | 현재 오픈일(null → "닫힘") | <input type=date value=draft> | [저장] [닫기]
  - 저장 활성 = draft 가 현재값과 다를 때만. 닫기 노출 = 현재값이 있을 때만(닫기 = null PATCH).
  - 저장/닫기 → 같은 다이얼로그(시설명, 이전 → 이후) → 시설별 mutate → 성공 시 닫힘, 실패 시 다이얼로그 안 오류.
```

### 6.3 캘린더 게이팅 · 딥링크 · 월/주 이동 영향

- 월간·주간 셀 게이팅: **유지**(props 가 이미 availability). 닫힌 시설은 미래 셀 전부 "예약 기간 아님" + 안내줄.
- 딥링크 `?date=`: 창 이후 판정이 `availability.bookableUntil`(= 익월 말일) 로 바뀌어 사실상 "익월 말일 이후" 만 정리. 오픈일 이전(창 앞) 딥링크는 현행처럼 셀이 비활성일 뿐 선택 자체는 정리하지 않는다(기존 동작과 동일). availability 실패 시 정리 게이트가 닫히는 것은 수용("다시 시도"로 회복).
- 월 이동 `[prev, cur, next]` 상한 유지. 주 이동 상한 = `bookableUntil` 주(= 익월 말일 주).
- 시설 전환 시 창이 시설마다 달라지므로 `availability` 로딩 전엔 `canPrevWeek/canNextWeek` 잠금(현행 `windowQuery` 로드 전 잠금과 동일 의미).

---

## 7. 테스트 계획

### 7.1 Backend

| ID | 파일 | 케이스 |
|---|---|---|
| T1 | `BookingOpenDatePolicyTest`(신규) | **null → `closed(until)`: from = 익월 말일+1, `isEmpty()` true, `contains(오늘)` false** · 과거→from=오늘 · 오늘→오늘 · 익월 안 미래→그 날 · until = 익월 말일(1/31→2/28, 2024-01-31→2/29, 12월→익년 1/31) · 오픈일 > 익월 말일 → from=오픈일, `isEmpty()` · `contains` 경계(from-1 false, from true, until true, until+1 false) · `referenceWindow` = [오늘, 익월 말일] |
| T2 | `BookingApplicationPolicyTest` | 생성자 `(clock)`(`:34`). 창 4건 재작성: (a) **오픈일 null 시설 → 모든 날짜 거부, 메시지 "아직 예약 신청이 열리지 않았어요."** (b) 오픈일 D+5, D+2 거부·D+5 통과·익월 말일+1 거부 (c) 오픈일 과거(D-30) → 오늘 하한 유지, 어제 거부, 오늘~익월 말일 통과 (d) 오픈일 = 익월 말일+1 → 같은 메시지. 우선순위(창→마감→중앙→역할)·마감 경계 6건은 **오픈일 과거(2020-01-01) 시설 픽스처**를 넣어 유지 |
| T3 | `BookingPolicyValidatorTest` | 생성자 `(clock)`(`:24`); 당일 경과 슬롯 단언 `:56-57` → `PastSlotException` |
| T4 | `GeneralFacilityAvailabilityServiceTest` | `new BookingApplicationPolicy(clock)`(`:66`). 추가: 오픈일 D+5 → `bookableFrom = D+5` · **null → `bookableFrom = 익월 말일+1`, `bookableUntil = 익월 말일`, 슬롯은 여전히 AVAILABLE(P5)** · 빈 창 응답 그대로(from > until) · stale=true 여도 창 동일(크롤 독립) |
| T5 | `FacilityAvailabilityAcceptanceTest` | `@Autowired BookingWindowPolicy` 필드·import(`:33,65`) 제거; 시드 8곳 중 창을 단언하는 곳은 `BookingWindowFixture.opened(...)` 로; `:84-95` 기대값 = `new BookingOpenDatePolicy().windowFor(OPEN_SINCE, today)`; `:154-171` booking-window 는 2필드만·참조 창; 신규: 오픈일 D+5 → `bookableFrom = D+5`, D+2 슬롯 AVAILABLE · **오픈일 null 시설 → from = 익월 말일+1** |
| T6 | `FacilityBookingServiceIntegrationTest` | 시설 시드 `opened(...)`. 오픈일 D+5 시설에 D+2 신청 → 400 · 오픈일 D+1, D+2 신청 → 201 · 오픈일 D-30, D+2 → 201 · **오픈일 null → 400 "아직 예약 신청이 열리지 않았어요."** · 빈 창(익월 말일+1) → 400 같은 메시지 · 존재하지 않는 시설 + 창 밖 → 404(D5) · 스냅샷 FAILED + 오픈일 과거 → 201(크롤 독립) |
| T7 | `FacilityBookingAdminServiceIntegrationTest` | PENDING(D+2) 생성 후 오픈일을 D+10 으로 변경 → approve 성공 · cancel 성공 · **오픈일 null 로 닫은 뒤에도 approve 성공**(창 미참조 P4) |
| T8 | `AdminFacilityAcceptanceTest`(신규) | GET: ADMIN 200 + `no-store` + `bookingOpenDate` null/값 · 비로그인 401 · 일반 사용자 403. PATCH 1건: 설정 204 후 GET 반영 · null 닫기 204 · `"2026-13-01"` 400 · 오늘+1년+1일 400 · 과거 204 · 없는 id 404 · 동일 값 재요청 204(no-op). **PATCH 전체: 활성 3 + 아카이브 1 시드 → 활성 3 만 바뀜 204 · null 전체 닫기 204 · 1년 초과 400 이면 아무 행도 안 바뀜(트랜잭션 롤백 확인)** |
| T9 | `FacilityBookingOpenDateSyncRaceTest`(신규, 통합) | §4.3 흐름 그대로. 복제 템플릿 `backend/src/test/java/com/duing/domain/joincode/service/ClubInviteConcurrencyTest.java`(`@Import(TestcontainersConfiguration) @SpringBootTest extends IntegrationTestBase`, `@Autowired TransactionTemplate`, `CountDownLatch` 2개, `ExecutorService` 1스레드, 타임아웃 10초). 단언: `roomName` 새 값 **and** `bookingOpenDate = D+5` **and** `updatedAt` 갱신. 음성 대조 절차(§4.3 5번) 수행 결과를 태스크 보고에 남긴다 |
| T10 | `FacilitySyncServiceTest` | 기존 시설에 오픈일 D+5 설정 → 이름 변경된 목록으로 실제 `sync()`(모의 클라이언트) → 오픈일 보존 · 아카이브→복구 경로에서도 보존 · **신규 시설은 오픈일 null 로 생성** |
| T11 | `BookingWindowFixture` | `window()` 삭제(호출처 0 확인됨), `bookableDate()` 유지. **추가 `public static final LocalDate OPEN_SINCE = LocalDate.of(2020, 1, 1)`, `public static Facility opened(Facility facility)`(`changeBookingOpenDate(OPEN_SINCE)` 후 반환)**. 예약 생성 경로를 타는 통합 테스트의 시설 시드(각 1곳)를 `opened(Facility.create(...))` 로: `FacilityBookingServiceIntegrationTest`·`FacilityBookingQueryIntegrationTest`·`FacilityBookingAdminQueryIntegrationTest`·`FacilityBookingAdminServiceIntegrationTest`·`FacilityBookingNotificationIntegrationTest`·`FacilityBookingMatchingSchedulerIntegrationTest`·`FacilityBookingMatchingFailureIsolationTest`·`AdminFacilityBookingAcceptanceTest`(= 79건의 소재지 8파일. `ClubFacilityBookingSecurityAcceptanceTest` 는 401 만 단언해 정책 미도달 — 제외). 크롤·동기화·이용현황·제출 테스트(`Facility.create` 29파일 중 나머지)는 정책을 타지 않아 무수정 |
| T12 | 컴파일 | `new FacilityUsageItem(` 는 main `GeneralFacilityUsageService:118` 1곳뿐(테스트 0건); `new BookingApplicationPolicy(` 테스트 2곳 `(clock)`; `new BookingPolicyValidator(` 테스트 1곳 |

### 7.2 Frontend

| ID | 파일 | 케이스 |
|---|---|---|
| F1 | `test/facilities/booking-home-lib.test.ts` | `windowRangeLabel` 테스트(`:16-21`) → `openDateLabel`(미래/오늘/과거/**null → "예약 준비 중"**/undefined → "예약 신청 가능") · `bookingWindowToastMessage`(정상/빈 창) · `bookingWindowNote`(닫힘/미래/그 외 null) |
| F2 | `test/facilities/booking-components.test.tsx` | `:687-691` 카드 `windowLabel` prop → `makeFacility({ bookingOpenDate })` 픽스처 필드 추가: 미래 "9.16부터 예약 가능" / null "예약 준비 중" / 과거 "예약 신청 가능". 캘린더·주간 (a) 5건(`:120, :243, :802, :815, :853`)은 props 기반이라 **무변경** |
| F3 | `test/facilities/facility-booking-page.test.tsx` | **픽스처(:48-110)**: `halfMonthWindow`·`BOOKING_RANGES`·`WINDOW_LABEL`·`OUT_OF_WINDOW_*` 삭제. 시설 1 = `WINDOW = { from: TODAY_ISO, until: 익월 말일 }`(오픈일 과거), 시설 2 = `bookableFrom: TODAY+5`, **시설 3 = 닫힘(`from = until+1`)**. 마감 셀은 `DEADLINE_DATE = TODAY+1` 로 명명 분리. **핸들러(:248-249)** 삭제. **헬퍼 `waitForBookingWindowLoaded`(:328-339, 호출 7곳 :536·:980·:1033·:1047·:1078·:1121·:1170)** 삭제 → `findByRole` 셀 대기로 대체. **시나리오**: 2(:366, 창 첫날 = 오늘 셀)·6(:530, 시설 2 창 앞 셀 탭 토스트 `M.d ~ M.d`)·7(:548, `shiftDateByDays(WINDOW.until, 1)` 딥링크)·마감 게이트(:854, DEADLINE_DATE)·14-b(:940)·14-c(:962, "기본 월 = 당월, 오픈일 익월이면 익월 자동 진입")·18(:1072, 시설 2 [주] 기준일 = bookableFrom)·21(:1146)·22(:1163) 재작성, 15·16(:1028-1050) 삭제(컴포넌트 테스트 `:222` 가 회귀 가드 유지), 이월 (a)(b)(c)(e)(:1465-1556) 는 `installCarryoverHandlers` 가 availability 에 창을 직접 주입하므로 **booking-window `server.use` 1줄(:1468-1470, :1555-1556) 삭제만**. 신규: 시설 3 → 미래 셀 전부 "예약 기간 아님" + 안내줄 "아직 예약 신청을 받지 않는 시설이에요" + 탭 토스트 "아직 예약 신청이 열리지 않았어요" · 시설 2 → 안내줄 "M.d부터 신청할 수 있어요" · 오픈일이 익월이면 익월 자동 진입 · 시설 1→2→3 전환 시 창·안내줄 갱신 |
| F4 | `test/admin/facility-bookings/facility-open-date-tab.test.tsx`(신규) | 목록 렌더(null = "닫힘") · 날짜 입력 → 저장 → 확인 다이얼로그 → PATCH `{bookingOpenDate:'…'}` · 닫기 → `{bookingOpenDate:null}` · 저장 버튼은 draft = 현재값이면 비활성 · 실패 시 다이얼로그 오류 문구 · **전체 적용 → `admin/facilities/booking-open-date` 1회 호출, 성공 후 목록 재조회 · 전체 적용 실패 → "적용되지 않았어요" 문구 + 목록 불변 · 전체 닫기 → null 1회 호출** |
| F5 | `test/admin/facility-bookings/admin-bookings-page.test.tsx` | `:201-207`(crawl 스테퍼 제외) 복제로 `?tab=open` 렌더·스테퍼 제외 단언. 탭 개수 단언 없음(`:170`) → 추가 안전 |
| F6 | 전체 게이트 | `pnpm test` · `pnpm typecheck` · `pnpm lint` |

---

## 8. 배포 / 스큐 전략

| 순서 | 단계 | 비고 |
|---|---|---|
| 1 | PR-BE1 → develop | V120, 정책 교체, 관리자 API(1건·전체), booking-window 참조 창 유지 |
| 2 | PR-FE1 → develop | 소비처 제거·홈 카드·안내줄·관리자 탭. BE1 머지 후 |
| 3 | 릴리스 N(2주 주기) — **런북** | ① **BE(Lightsail) 먼저** → Flyway V120 로그 확인 → **이 순간부터 전 시설 닫힘**(신청 400 "아직 예약 신청이 열리지 않았어요", 구 FE 셀 "예약 기간 아님"). ② **곧바로 FE(Vercel)**. ③ **총동연이 관리자 탭 "전체 적용"으로 오픈일 입력** — 권장값은 총동연 결정: 배포 당일 = 현행보다 넓게(익월 말일까지), 다음 반월 시작일 = 현행과 유사. ④ 공백을 0 에 가깝게 하려면 ①과 ② 사이에 운영자가 1회성 SQL `UPDATE facility SET booking_open_date = CURRENT_DATE WHERE archived_at IS NULL;` 을 실행해도 된다(멱등, 관리자 탭에서 즉시 재조정 가능). 저사용 시간대 배포. 릴리스 노트: "반월 창 폐지, 시설별 오픈일 도입(오픈일 없는 시설은 신청 불가), 총동연이 관리자 콘솔에서 설정" |
| 4 | PR-BE2(`chore/facility-booking-window-removal`) → 릴리스 N+1 | `getBookingWindow`·`BookingWindowResponse`·`referenceWindow`·`FacilityAvailabilityApi` 항목·인수 테스트 삭제 |

**스큐 매트릭스**

| 조합 | 동작 | 판정 |
|---|---|---|
| 신 BE + 구 FE(①~② 사이) | 셀 게이팅 = availability(시설별, 닫힘이면 전부 비활성). 내비·토스트·홈 카드 = booking-window 참조 창(오늘~익월 말일) — 홈 카드 "예약 가능 M.d ~ M.d" 가 잠시 부정확, 토스트 범위 문구 부정확. `availableBookingRanges` 부재는 구 타입 optional | 허용(분 단위) |
| 신 FE + 구 BE(순서 역전 시) | `bookingOpenDate` 없음 → 카드 "예약 신청 가능" 폴백. 관리자 탭 GET 404 → 오류 표시. 가용성 필드는 존재 → 캘린더 정상(반월 값) | 동작하나 순서 준수 |
| 릴리스 N 이후 BE2 전 | booking-window 는 살아 있으나 소비처 0 | 무해 |

---

## 9. 리스크 및 롤백 전략

| # | 리스크 | 대응 |
|---|---|---|
| R1 | BE 배포 ~ 오픈일 입력 사이 전 시설 신청 불가(P3) | §8 런북(①→② 즉시, ③ 전체 적용, 선택적 ④ SQL). 저사용 시간대. |
| R2 | 총동연이 오픈일을 넓게(오늘) 넣으면 익월 전체가 열림 | 의도된 선택. 좁히려면 다음 반월 시작일 입력. 관리자 탭 문구가 "정한 날짜부터 다음 달 말일까지" 를 명시. |
| R3 | 동기화 트랜잭션이 오픈일을 덮어씀 | `@DynamicUpdate` + T9(실 DB 재현·음성 대조) + T10. 실패 시 양측 행 잠금(§4.3 대안 1). |
| R4 | 오타 오픈일(먼 미래)로 시설이 조용히 닫힘 | 오늘+1년 상한(D2) + 확인 다이얼로그(이전→이후) + 홈 카드 "M.d부터"/"예약 준비 중" 노출 + 캘린더 안내줄. |
| R5 | 새 시설·복구 시설이 닫힌 채 방치 | 관리자 탭 목록에 "닫힘" 으로 보임. 알림은 Out of Scope. |
| R6 | 검증 순서 변경(D5) | 우선순위를 단언하는 기존 테스트 0건 → T6 신설. |
| R7 | `FacilityUsageItem`·`BookingApplicationPolicy` 시그니처 변경 → 컴파일 | T12(기계적). 예약 생성 통합 테스트 8파일 시드 `opened(...)`(T11) 누락 시 400 으로 일괄 실패 — 첫 실행에서 드러남. |
| R8 | 공개 목록/이용현황 60초 캐시로 홈 카드 지연 | 허용(D3). 관리자 화면은 no-store. |
| R9 | 구 FE 번들 잔존 중 booking-window 삭제 | BE2 를 다음 릴리스로 분리(P8). 참조 창을 내리므로 구 FE 내비 유지. |
| R10 | Flyway 롤백 | 구 BE 이미지는 V120 을 `*:future` 로 무시(기본값), 컬럼 미매핑 → 기동 정상. 롤백하면 반월 창 복귀·관리자 API 404 → **FE 도 함께 롤백**(신 FE 는 카드 폴백·캘린더 정상이나 관리자 탭 오류). 컬럼은 남겨도 무해(재릴리스 시 값 재사용). |
| R11 | 감사 로그 부재 | MVP 생략(Out of Scope). 변이 지점이 서비스 2메서드라 후속에 `facility_booking_open_policy`(facility_id, open_date, actor, created_at) 행 적재를 그 자리에 추가하면 됨(§9.4). |

**9.4 후속 확장 가능성 점검** — 컬럼 1개 모델에서 이력 테이블로 갈 때: (1) 테이블 신설 + 현재 컬럼 값을 최초 행으로 백필, (2) `GeneralFacilityAdminService` 두 메서드가 행을 추가하고 컬럼도 갱신(컬럼 = "현재 유효값" 캐시), (3) 정책·응답·FE 는 컬럼을 계속 읽으므로 무변경. 주기 오픈(N일마다)도 같은 자리에서 스케줄러가 컬럼을 갱신하는 형태로 얹을 수 있다. 현재 설계가 막는 것 없음.

---

## 10. 구현 작업 순서

> 디스패치 단위(SDD 사전 점검 판정): Task 2(B1) 는 파사드 시그니처 변경으로 main 컴파일을 깨므로 **Task 2+3 을 한 구현자에게 연속 디스패치**(커밋은 태스크별, 리뷰는 합산 1회). Task 5(F1) 도 `useBookingWindowQuery` 삭제로 typecheck 가 깨지므로 **Task 5+6 을 한 구현자에게**. Task 8(C1) 은 다음 릴리스 — 이번 실행에서 제외.

### Part A — Backend (`feat/facility-booking-open-date-be`)

#### Task 1 (B0): 마이그레이션 + 엔티티

**Files:** Create `V120__facility_booking_open_date.sql`; Modify `facility/entity/Facility.java`; Test `FacilitySyncServiceTest.java`(T10).

**Interfaces:** Produces `Facility.getBookingOpenDate(): LocalDate`(nullable), `Facility.changeBookingOpenDate(LocalDate)`, `@DynamicUpdate`.

- [ ] Step 1: T10 테스트 추가 → 실행 실패(메서드 없음)
- [ ] Step 2: 컬럼·`changeBookingOpenDate`·`@DynamicUpdate` 추가(§4.2), V120 작성(§3)
- [ ] Step 3: `./gradlew test --tests '*FacilitySyncServiceTest'` 통과, 통합 테스트 부팅으로 V120 적용 로그 확인
- [ ] Step 4: 커밋 `feat(backend): 시설 예약 오픈일 — facility.booking_open_date(V120)·@DynamicUpdate`

#### Task 2 (B1): 정책 코어 교체 — `BookingOpenDatePolicy` + `BookingWindow` + 파사드/검증기

**Files:** Create `facilitybooking/service/BookingOpenDatePolicy.java`; Modify `BookingWindow.java`, `BookingApplicationPolicy.java`, `BookingPolicyValidator.java`, `FacilityBookingException.java`; Delete `HalfMonthBookingWindowPolicy.java`, `BookingWindowPolicy.java`, `config/BookingWindowConfig.java`, `config/BookingWindowProperties.java`, `HalfMonthBookingWindowPolicyTest.java`, `BookingWindowConfigTest.java`; Modify `application.yml:255-260`, test `application.yml:150-153`; Test `BookingOpenDatePolicyTest.java`(신규), `BookingApplicationPolicyTest.java`, `BookingPolicyValidatorTest.java`.

**Interfaces:** Consumes B0. Produces `BookingOpenDatePolicy.windowFor(LocalDate bookingOpenDate, LocalDate today): BookingWindow`, `referenceWindow(LocalDate today)`, `BookingWindow.closed(until)/contains/isEmpty`, `BookingApplicationPolicy(Clock)`, `validateApplication(Facility, Club, ClubMember, LocalDate)`, `windowFor(Facility, LocalDate)`, `referenceWindow(LocalDate)`, `BookingPolicyValidator(Clock)`, `FacilityBookingException.PastSlotException`.

- [ ] Step 1: T1 테스트 작성(§7.1) → 실행 실패(클래스 없음)
- [ ] Step 2: `BookingOpenDatePolicy`·`BookingWindow` 구현 → T1 통과
- [ ] Step 3: 4개 파일 삭제, yml 키 2곳 삭제, 파사드·검증기·예외 교체(§4.2)
- [ ] Step 4: T2·T3 재작성 → `./gradlew test --tests '*BookingOpenDatePolicyTest' --tests '*BookingApplicationPolicyTest' --tests '*BookingPolicyValidatorTest'` 통과
- [ ] Step 5: `./gradlew compileTestJava` 로 남은 컴파일 오류 목록 확보(B2 입력)
- [ ] Step 6: 커밋 `refactor(backend): 시설 예약 창 — 반월 정책 삭제·BookingOpenDatePolicy 도입·PastSlotException 분리`

#### Task 3 (B2): 신청·가용성 소비처 전환 + 통합 테스트 시드

**Files:** Modify `GeneralFacilityBookingService.java:57-70`, `GeneralFacilityAvailabilityService.java:102,115-118`, `BookingWindowResponse.java`, `FacilityAvailabilityApi.java`, `FacilityAvailabilityController.java`(주석); Test `BookingWindowFixture`(T11 — `opened`/`OPEN_SINCE` 추가 + 8파일 시드), `GeneralFacilityAvailabilityServiceTest`(T4), `FacilityAvailabilityAcceptanceTest`(T5), `FacilityBookingServiceIntegrationTest`(T6), `FacilityBookingAdminServiceIntegrationTest`(T7), T12 컴파일 정리.

**Interfaces:** Consumes B0·B1. Produces 가용성 응답 `bookableFrom/Until` 시설별 값, `BookingWindowResponse(bookableFrom, bookableUntil)`(참조 창), `BookingWindowFixture.opened(Facility)`, `OPEN_SINCE`.

- [ ] Step 1: T11 픽스처 추가 + 8파일 시드 교체(먼저 — 이걸 빼면 79건이 400 으로 일괄 실패)
- [ ] Step 2: T4·T5·T6·T7 추가/재작성 → 실패 확인
- [ ] Step 3: 서비스·응답·API 문서 수정(§4.2), T12 컴파일 정리
- [ ] Step 4: `./gradlew test --tests 'com.duing.domain.facilitybooking.*'` 통과
- [ ] Step 5: 커밋 `feat(backend): 시설 예약 신청·가용성 — 시설 오픈일 창 적용(NULL=닫힘)·booking-window 참조 창 유지(폐기 예정)`

#### Task 4 (B3): 관리자 오픈일 API(1건·전체) + 공개 응답 가산 + 경합 테스트

**Files:** Create `AdminFacilityApi.java`, `AdminFacilityController.java`, `UpdateFacilityBookingOpenDateRequest.java`, `AdminFacilityResponse.java`, `FacilityAdminService.java`, `GeneralFacilityAdminService.java`, `UpdateFacilityBookingOpenDateCommand.java`; Modify `FacilityException.java`, `FacilitySummaryResponse.java`, `FacilityUsageResponse.java`, `FacilityUsageItem.java`, `GeneralFacilityUsageService.java:118`; Test `AdminFacilityAcceptanceTest.java`(T8), `FacilityBookingOpenDateSyncRaceTest.java`(T9), 이용현황 인수 테스트에 `bookingOpenDate` 필드 단언 1건.

**Interfaces:** Consumes B0. Produces §5 의 관리자 3 엔드포인트, `FacilitySummaryResponse.bookingOpenDate`, `FacilityUsage.bookingOpenDate`.

- [ ] Step 1: T8·T9 작성 → 실패 확인
- [ ] Step 2: 구현(§4.2, §4.4)
- [ ] Step 3: T9 음성 대조(§4.3 5번) 1회 수행 → 결과 보고. 실패하면 §4.3 대안 1 로 전환하고 플랜 §4.3 을 갱신
- [ ] Step 4: `./gradlew test` 전체 통과(3242+ 기준선 대비 증감 보고)
- [ ] Step 5: 커밋 `feat(backend): 시설 관리 — 관리자 오픈일 조회/변경(시설별·전체 1 tx) API·공개 목록/이용현황 bookingOpenDate 가산`

### Part B — Frontend (`feat/facility-booking-open-date-fe`, BE1 머지 후 develop 에서 분기)

#### Task 5 (F1): 계약·훅 정리 + 홈 파생

**Files:** Modify `types/facility.ts`, `types/admin.ts`, `api/client.ts`, `api/domains/admin.ts`, `hooks/facilities.ts`, `hooks/facilityQueryKeys.ts`, `hooks/adminQueryKeys.ts`, `hooks/index.ts`, `_lib/bookingHome.ts`, `_components/booking/FacilityHomeCard.tsx`; Create `hooks/facilityAdmin.ts`; Test F1·F2.

**Interfaces:** Produces `openDateLabel`, `bookingWindowToastMessage`, `bookingWindowNote`, `useAdminFacilitiesQuery`, `useUpdateFacilityBookingOpenDateMutation`, `useUpdateAllFacilityBookingOpenDateMutation`, `adminQueryKeys.facilitiesAll/facilities()`, 타입 `AdminFacility`·`UpdateFacilityBookingOpenDatePayload`.

- [ ] Step 1: F1·F2 테스트 작성 → 실패
- [ ] Step 2: 타입·클라이언트·훅·파생·카드 구현(§6.2)
- [ ] Step 3: `cd frontend/apps/web && pnpm vitest --run test/facilities/booking-home-lib.test.ts test/facilities/booking-components.test.tsx` + 루트 `pnpm typecheck`(페이지가 아직 `useBookingWindowQuery` 를 참조해 typecheck 실패 예상 → F2 에서 해소하므로 이 단계에선 test 만 GREEN 보고, typecheck 실패 사유 명시)
- [ ] Step 4: 커밋 `refactor(frontend): 시설 예약 계약 — booking-window 타입/훅 삭제·bookingOpenDate 가산·홈 카드 오픈일 문구`

#### Task 6 (F2): 예약 페이지 단일화 + 안내줄

**Files:** Modify `_pages/FacilityBookingPage.tsx`; Test F3.

- [ ] Step 1: F3 재작성/추가 → 실패
- [ ] Step 2: 치환표(§6.2) 적용 + 익월 자동 진입 + 안내줄(D9)
- [ ] Step 3: `pnpm test` + `pnpm typecheck` + `pnpm lint` GREEN
- [ ] Step 4: 커밋 `feat(frontend): 시설 예약 캘린더 — 가용성 bookableFrom/Until 단일화·닫힘/오픈 전 안내·익월 오픈 자동 진입`

#### Task 7 (F3): 관리자 오픈일 설정 탭

**Files:** Modify `AdminFacilityBookingsPage.tsx`; Create `_tabs/FacilityOpenDateTab.tsx`, `_components/FacilityOpenDateConfirmDialog.tsx`; Test F4·F5.

- [ ] Step 1: F4·F5 작성 → 실패
- [ ] Step 2: 탭·다이얼로그 구현(§6.2). 네이티브 `<input type="date">`, 다이얼로그는 `AdminClubSecuredTargetToggleDialog` 복제
- [ ] Step 3: `pnpm test` + `pnpm typecheck` + `pnpm lint` GREEN, 브라우저 QA(로컬 BE + dev DB, :3000): 시설별 설정→캘린더 반영→닫기, 전체 적용→전체 닫기, 1년 초과 오류, 전체 적용 실패(BE 중단) 시 목록 불변 확인
- [ ] Step 4: 커밋 `feat(frontend): 시설 관리 — 관리자 오픈일 설정 탭(시설별 저장·닫기·전체 적용 단일 요청)`

### Part C — 폐기 (`chore/facility-booking-window-removal`, 릴리스 N+1)

#### Task 8 (C1): booking-window 삭제

**Files:** Modify `FacilityAvailabilityApi.java`, `FacilityAvailabilityController.java`, `FacilityAvailabilityService.java`, `GeneralFacilityAvailabilityService.java`, `BookingApplicationPolicy.java`·`BookingOpenDatePolicy.java`(`referenceWindow` 삭제), `FacilityAvailabilityAcceptanceTest.java`, `BookingOpenDatePolicyTest.java`; Delete `BookingWindowResponse.java`.

- [ ] Step 1: 인수 테스트에서 booking-window 케이스 삭제, `GET /api/v1/facilities/booking-window` 404 단언 1건 추가 → 실패
- [ ] Step 2: 삭제 → 전체 테스트 통과
- [ ] Step 3: 커밋 `chore(backend): 시설 booking-window 엔드포인트 폐기 — FE 가용성 단일화 완료 후 제거`

---

## 11. 구현 예상 범위 / 난이도

| 파트 | 파일 수(신규/수정/삭제) | 테스트 | 난이도 | 비고 |
|---|---|---|---|---|
| BE B0+B1+B2 | 1/9/6 + 시드 8파일 | 재작성 ~24, 시드 8줄, 신규 T1 | M | 기계적 치환이 대부분. NULL=닫힘 때문에 시드 누락 시 79건 일괄 400 |
| BE B3 | 7/6/0 | 신규 T8·T9·T10 | M | 실 DB 경합 테스트 + 음성 대조가 가장 손이 감 |
| FE F1+F2 | 1/10/0 | 재작성 ~19 + 픽스처 ~40 + 닫힘 시나리오 | M~L | 페이지 테스트 픽스처 재정의가 대부분 |
| FE F3 | 2/1/0 | 신규 F4·F5 | M | UI 신규 화면 1개, 전체 적용은 단일 요청 |
| C1 | 0/7/1 | 삭제 3 | S | 다음 릴리스 |

SDD 기준 BE 1세션 + FE 1세션(병렬 워크트리 가능, FE 는 BE1 머지 후 분기 권장 — 타입 계약이 확정된 뒤 MSW 픽스처를 맞추기 위해).

---

## 12. 구현 시작 전에 남은 결정사항

사용자 최종 확인 3건은 반영 완료(v2). 아래는 기본안을 두고 진행 가능한 잔여 항목이다.

| # | 결정 | 기본안(미결정 시 적용) |
|---|---|---|
| Q1 | 홈 카드 문구 — "M.d부터 예약 가능" / "예약 신청 가능" / "예약 준비 중" | 기본안 채택 |
| Q2 | 오픈일 상한 검증(오늘+1년) | 채택 |
| Q3 | 관리자 UI 위치 — `/admin/facility-bookings?tab=open` vs 별도 메뉴 | 탭 |
| Q4 | 빈 창 문구 "아직 예약 신청이 열리지 않았어요"(BE 400·FE 토스트) / 안내줄 "아직 예약 신청을 받지 않는 시설이에요" | 채택 |
| Q5 | 검증 순서 변경(시설 404/아카이브가 창 400 보다 먼저) 수용 | 수용 |
| Q6 | 아카이브 시설 PATCH 허용(전체 적용은 활성만) | 허용 |
| Q7 | 릴리스 런북 ④ 1회성 SQL(배포 직후 전 시설 오늘 오픈) 사용 여부 — 총동연이 곧바로 관리자 탭에서 넣을 수 있으면 불필요 | 런북에 선택지로만 기재, 실행은 릴리스 시 결정 |

**제안(범위 밖, 후속 아이디어)**

- **주기 오픈**(총동연이 "N일마다 열림" 을 원할 때): 컬럼 모델을 바꾸지 말고 스케줄러가 `booking_open_date` 를 규칙대로 전진시키는 방식(예: `facility.booking_open_rule = EVERY_14_DAYS` + 앵커일)이 가장 작다. 창 상한을 오픈일+N 으로 두는 "배치 창" 모델은 반월 창의 재도입이라 권하지 않는다 — 필요하면 `booking_close_date` 컬럼 1개를 더해 `[open, min(close, 익월 말일)]` 로 확장하는 쪽이 같은 정책 클래스 한 줄 변경으로 끝난다.
- **새 시설 알림**: 학교 목록 동기화가 새 방을 만들면 닫힌 채 생기므로, 관리자 알림(기존 `AdminNotification` 경로) 한 건이면 방치를 막는다. 이번 범위 밖.
