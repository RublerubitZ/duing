# 시설 예약 마감일(booking_close_date) — 오픈일 창에 상한 추가 설계

**상태:** v2 확정 — fork 스펙 리뷰 반영, **사용자 승인(2026-09-05, Q1~Q5 권장안)** · **선행:** PR #1145(BE)·#1146(FE) 시설 오픈일 정책이 develop 에 머지된 뒤 착수
**작성:** 2026-09-05 · **근거:** 사용자 질문 "9/1~9/15 만 열고 싶으면?" — 현 구조는 상한이 익월 말일로 고정돼 표현 불가

## 0. 한 줄 요약

`facility.booking_close_date DATE NULL` 컬럼 하나를 더하고, 신청 창을 `[max(오픈일, 오늘), min(마감일 ?? 익월 말일, 익월 말일)]` 로 바꾼다. 마감일이 비어 있으면 지금과 완전히 같다. 크롤 범위·열람 월·TTL·슬롯 상태·승인 경로는 건드리지 않는다.

## 1. 현재 구조(선행 PR 기준)와 한계

- 창 산식은 `BookingOpenDatePolicy.windowFor(bookingOpenDate, today)` 한 곳: 오픈일 NULL → `BookingWindow.closed(until)`, 아니면 `[max(오픈일, 오늘), YearMonth.from(today).plusMonths(1).atEndOfMonth()]`.
- 상한을 조정할 수단이 없다. "9/1~9/15 만" 은 (a) 9/1 오픈 → 9/16~10/31 도 함께 열림, (b) 9/16 에 오픈일을 10/1 로 미룸 → 그 시점부터 닫히지만 9/1~9/15 사이에 9/16 이후 날짜가 신청되는 것은 막지 못함.
- 관리자 탭은 시설별 date 입력 1칸(`오픈일`) + 저장/닫기, 전체 적용 1칸.

## 2. 정책 결정

| # | 항목 | 결정 |
|---|---|---|
| C1 | 저장 | `facility.booking_close_date DATE NULL`. NULL = 상한 없음(익월 말일). 이력 테이블 없음(오픈일과 동일 원칙). |
| C2 | 창 | `until = min(마감일 ?? 익월말, 익월말)`. `from > until` 이면 빈 창(기존 표현 그대로, FE 무변경). 마감일 상한은 C4 에서 **익월 말일**로 검증하므로 `min` 은 방어선일 뿐 정상 경로에서 클램프가 일어나지 않는다(관리자 탭 표시값 = 실제 창 상한). |
| C3 | 마감일 < 오늘 | 자연히 빈 창(닫힘). 저장은 허용 — "지난 창" 상태를 남기는 게 운영상 자연스럽다(총동연이 다음 창을 넣을 때까지 닫힘). 부모 플랜 D1 의 빈 창 정의를 "닫힘·오픈 전·**마감 후**" 로 갱신한다. "오늘" 은 정책(`BookingApplicationPolicy`)과 관리자 검증(`GeneralFacilityAdminService`)이 같은 KST `Clock` 빈을 쓴다. |
| C4 | 검증 | 검증은 **매 PATCH 바디의 (오픈일, 마감일) 쌍**에 대해 수행하고 시설의 기존값과는 비교하지 않는다(전체 적용 포함). ① 둘 다 있으면 **마감일 ≥ 오픈일**(같은 날 허용) — 아니면 400 `BookingCloseBeforeOpenException` "예약 마감일은 오픈일보다 빠를 수 없습니다.". ② 마감일 상한 = **익월 말일**(권장, Q5) — 초과 시 400 `InvalidBookingCloseDateException` "예약 마감일은 다음 달 말일까지만 설정할 수 있습니다.". 오픈일 없이 마감일만 있으면 허용(닫힘 유지). 예외는 `FacilityException` 전례대로 클래스당 고정 메시지 1개 → 예외 2개. |
| C5 | API | 기존 두 PATCH 의 바디를 `{ bookingOpenDate, bookingCloseDate }` 로 확장(둘 다 nullable, 필드 제약 없음 — 형식 오류만 역직렬화 400, `@Valid` 는 무해). **부분 갱신 아님** — 바디가 곧 새 상태이며 **`bookingCloseDate` 키 누락과 null 은 동일(해제)**. 구 FE 가 마감일 없이 보내면 마감일 해제 — 선행 PR 과 같은 릴리스면 구 FE 창이 없고, 아니어도 "상한 해제" 뿐이라 안전 방향. `GET /admin/facilities`·공개 `GET /facilities`·`/facilities/usage` 에 `bookingCloseDate` 가산(맨 뒤). |
| C6 | 전체 적용 | 같은 엔드포인트, 바디에 마감일 포함. 단일 트랜잭션·활성만·all-or-nothing 그대로. |
| C7 | 신청 400 문구 | 창이 비었으면 기존 "아직 예약 신청이 열리지 않았어요."(마감 지난 경우도 동일 — 사용자 입장에선 "지금 안 열림"). 창이 있으면 기존 "지금은 M월 d일부터 M월 d일까지만…" 그대로(until 이 마감일이면 자동으로 그 날짜가 찍힌다). |
| C8 | FE 표시 | 가용성 `bookableFrom/Until` 이 이미 창을 실어 오므로 셀 게이팅·주 이동 클램프·딥링크 정리는 **무변경**. 안내줄 한 줄 추가: 창이 있고 `bookableUntil < 익월 말일` 이면 "M.d ~ M.d 신청 가능"(오픈일 미래 문구와 결합 시 "M.d ~ M.d 신청 가능" 하나로). 홈 카드는 오픈일 문구 유지(마감일은 카드에 안 실음 — 카드는 창 산식을 모른다). |
| C9 | 관리자 탭 | 행에 `마감일` date 입력 1칸 추가, 현재값 표시 "오픈일 ~ 마감일"(마감일 없으면 "오픈일 ~"), 저장 버튼 활성 = 둘 중 하나라도 변경. 닫기 = 둘 다 null. 전체 적용 행에 마감일 1칸 추가. `drafts` 와 `PendingChange.before/after` 를 `{open, close}` 쌍으로 확장하고 다이얼로그는 "M.d ~ M.d → M.d ~ M.d" 로 표기(한쪽만 바뀌어도 쌍으로 보여 준다). |
| C10 | 주기 오픈 | 범위 밖. 필요 시 스케줄러가 두 컬럼을 규칙대로 전진(별도 스펙). |

## 3. 변경 범위

**BE**
- **V122** `ALTER TABLE facility ADD COLUMN booking_close_date DATE NULL` — 비파괴, 백필 없음(origin/develop 최신 V119, #1143 V120, #1145 V121 — 두 PR 머지 후 착수하므로 충돌 없음; #1143 이 번호를 올리는 사고만 주의).
- `Facility`: 필드 + **`changeBookingCloseDate(LocalDate)` 추가, 기존 `changeBookingOpenDate` 유지**(호출처 test 8파일 12곳 보존). `@DynamicUpdate` 그대로라 동기화 경합 대책도 그대로(`FacilitySyncService.updateDetails` 는 마감일을 만지지 않는다).
- `BookingOpenDatePolicy.windowFor(openDate, closeDate, today)`: 3줄 변경. `referenceWindow` 무변경.
- `BookingApplicationPolicy.windowFor(Facility, today)`: 인자 전달만.
- `UpdateFacilityBookingOpenDateRequest`·Command: 필드 1개 추가. `GeneralFacilityAdminService`: 바디 쌍 검증 `assertWindowOrder`(둘 다 있을 때 마감 ≥ 오픈) + `assertCloseWithinNextMonthEnd`(마감 ≤ 익월 말일). 예외 2개 `BookingCloseBeforeOpenException`·`InvalidBookingCloseDateException`(고정 MESSAGE, `FacilityException` 전례).
- `AdminFacilityResponse`·`FacilitySummaryResponse`·`FacilityUsage`·`FacilityUsageItem`: `bookingCloseDate` 맨 뒤 가산.
- 테스트: `BookingOpenDatePolicyTest` +6(마감일 창 안·**open == close 하루 창**·익월말 초과 방어 클램프·마감일<오늘 빈 창·마감일만 있음 빈 창·null 동일), `AdminFacilityAcceptanceTest` +6(설정·시설별 순서 400·**전체 적용 순서 400**·상한 400·전체 적용 포함·**GET 노출 `bookingCloseDate`**), 공개 `GET /facilities` 가산 +1, 신청 통합 +2(마감일 다음날 400·마감일 당일 201), 가용성 +1. 기존 `opened()` 픽스처는 마감일 null 이라 무수정.

**FE**
- 타입 `AdminFacility.bookingCloseDate`, `FacilitySummary/FacilityItem.bookingCloseDate?`, payload 확장.
- `bookingWindowNote`: 분기 1개 추가(창 있고 until < 익월 말 → 범위 문구). `monthDayLabel` 재사용.
- `FacilityOpenDateTab`: 행 입력 1칸·전체 적용 1칸·다이얼로그 문구·저장 활성 조건. `drafts`·`PendingChange` 를 `{open, close}` 쌍으로.
- 테스트: 탭 +5(마감일 저장·**한 필드만 변경 시 저장 활성**·순서 400 문구·전체 적용 바디 포함·닫기 둘 다 null; MSW 핸들러 2줄이 `bookingCloseDate` 도 복사하도록 수정), `booking-home-lib` +2, 페이지 테스트 +1(마감일 창 안내줄·창 밖 셀). 페이지·정책 픽스처는 `bookingCloseDate` 없음 = 상한 익월 말이라 무수정.

## 4. 영향 없음(명시)

크롤 월·스냅샷 TTL·가용성 월 가드·슬롯 상태(AVAILABLE/PENDING_HOLD/…)·승인/확정/취소/매칭·기존 예약(창 미저장). booking-window 참조 창은 전역이라 마감일을 반영할 수 없고 구 FE 내비 전용으로만 남는다(폐기 예정).

## 5. 스큐

BE 먼저 배포. 구 FE(선행 PR 버전)가 마감일 없이 PATCH 하면 마감일이 null 로 저장된다 — 같은 릴리스로 묶으면 창이 없고, 묶지 않아도 "상한 해제" 뿐이라 안전 방향.

## 6. Out of Scope

주기 오픈 규칙, 이력/감사 테이블, 홈 카드에 마감일 표시, 마감일 지난 시설의 별도 문구("접수가 끝났어요" 등 — C7 로 통일), 관리자 알림.

## 7. 확정된 결정(2026-09-05, 사용자 "권장안으로 진행")

- Q1 C3: 마감일 < 오늘 저장 **허용**(빈 창으로 닫힘, 다음 창 입력까지).
- Q2 C7: 마감 지난 시설 문구 **"아직 예약 신청이 열리지 않았어요" 로 통일**(안내줄·토스트·400 분기 없음).
- Q3 C8: 홈 카드에 마감일 **노출 안 함**.
- Q4 착수 시점: **#1145·#1146 머지 후** 별도 브랜치·PR(같은 릴리스에 태울지는 머지 시점에 결정 — 스큐 안전 방향이라 어느 쪽도 가능).
- Q5 C4: 마감일 상한 = **익월 말일**(초과 400, 클램프는 방어선).
