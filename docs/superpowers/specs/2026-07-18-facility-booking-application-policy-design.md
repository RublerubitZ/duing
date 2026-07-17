# 시설 예약 신청 정책 — 마감·권한 추가 + 공통 Policy 통합 설계

날짜: 2026-07-18
브랜치: `feat/facility-booking-policy`

## 배경 / 목표

시설 예약 **신청(create)** 에 두 정책을 추가하고, 신청 관련 비즈니스 정책을 단일 진입점으로 통합한다.

1. **신청 마감**: 사용일 전날 12:00(KST)까지만 신청 가능
2. **신청 권한**: 중앙동아리의 회장(LEADER)·운영진(OFFICER)만 신청 가능
3. **공통 Policy 통합**: 외부는 `BookingApplicationPolicy` 하나만 호출, 내부에서 정책 조합

기존 반월 예약 가능 정책·상태 머신·승인 프로세스·크롤링·조회/취소·API 계약은 **무변경**.

## 정책 정의

### 1. 신청 마감 (BookingDeadlinePolicy)

- 사용일 `D`의 마감 시각 = `D-1일 12:00 KST`, **분 단위 경계**
  - `now < D-1 12:01:00` → 허용 (12:00:59까지 허용)
  - `now ≥ D-1 12:01:00` → 거부
- 판정식: `now.isBefore(D.minusDays(1).atTime(12, 1))` — truncate 불필요
- **귀결: 당일 신청은 항상 불가** (오늘 사용분 마감은 어제 12:00) — 사용자 승인됨
- 서버 `seoulClock` 기준. 클라이언트 시간은 검증에 사용하지 않는다.

### 2. 신청 권한

| 구분 | 결과 |
|---|---|
| 중앙동아리 + LEADER | 가능 |
| 중앙동아리 + OFFICER | 가능 |
| 중앙동아리 + MEMBER | 불가 — `FACILITY_BOOKING_PERMISSION_DENIED` |
| 일반동아리 (역할 무관) | 불가 — `FACILITY_BOOKING_CENTRAL_CLUB_ONLY` |

- 중앙동아리 판별: 기존 `Club.centralClub` boolean (DB 마이그레이션 불필요)
- 역할 판별: 기존 `ClubMemberRole.canManageClub()` (LEADER/OFFICER)
- 비회원(멤버십 없음)은 기존 예외 유지 (매트릭스 외, 동작 무변경)

### 3. 오류 계약

| 상황 | HTTP | code | message |
|---|---|---|---|
| 신청 마감 | 400 | `FACILITY_BOOKING_DEADLINE_PASSED` | 시설 사용일 전날 12:00까지만 신청할 수 있어요. |
| 중앙동아리 아님 | 403 | `FACILITY_BOOKING_CENTRAL_CLUB_ONLY` | 시설 예약은 중앙동아리만 신청할 수 있어요. |
| 역할 부족 | 403 | `FACILITY_BOOKING_PERMISSION_DENIED` | 회장 또는 운영진만 시설 예약을 신청할 수 있어요. |

`FacilityBookingException` 하위 예외로 추가, `ApplicationException`의 `code` 필드 사용 (기존 `FACILITY_BOOKING_SLOT_UNAVAILABLE` 패턴).

### 4. 오류 우선순위

여러 정책을 동시에 만족하지 못하는 경우 아래 우선순위에서 **첫 번째로 실패한 정책의 오류만** 반환한다. 동시에 여러 오류를 반환하지 않는다.

1. 반월 예약 가능 정책 (`OutOfBookingWindowException`)
2. 신청 마감 정책 (`FACILITY_BOOKING_DEADLINE_PASSED`)
3. 중앙동아리 여부 (`FACILITY_BOOKING_CENTRAL_CLUB_ONLY`)
4. 회장/운영진 권한 (`FACILITY_BOOKING_PERMISSION_DENIED`)

날짜 자체가 신청 불가능한 경우 권한보다 날짜 정책을 우선 안내한다 — 사용자에게 가장 먼저 알려야 하는 것은 예약 가능한 날짜인지 여부다. 이로써 API 동작을 예측 가능하게 유지하고 FE의 오류 처리·UX를 일관되게 만든다.

## 백엔드 설계

### 구조

```
BookingApplicationPolicy (@Component) ← 비즈니스 정책 유일 진입점
 ├─ BookingRolePolicy             (신규) LEADER/OFFICER 판정
 ├─ ClubEligibilityPolicy         (신규) 중앙동아리 판정
 ├─ HalfMonthBookingWindowPolicy  (기존, 무수정 — BookingWindowPolicy 인터페이스·설정 포함)
 └─ BookingDeadlinePolicy         (신규) 전날 12:00 마감 판정

BookingPolicyValidator (기존 유지) ← 기술적 검증 전담
 └─ 슬롯 그리드 유효성 · 당일 경과 슬롯 · 활성 상한 등 기존 검증
    (반월 윈도우 체크만 BookingApplicationPolicy로 이관)
```

- **BookingApplicationPolicy의 역할**: 각 정책을 직접 구현하는 클래스가 아니라, 예약 신청 관련 비즈니스 정책을 **조합하고 검증 순서를 관리하는 단일 진입점(Facade / Orchestrator)** 이다. 실제 계산은 내부 Policy 클래스가 담당하고 facade는 조합만 수행한다. 향후 시험기간·시설별·관리자 예외 정책이 추가되어도 외부 호출부는 변경 없이 내부 정책만 확장한다.
- **책임 분리**: Validator = 기술적 검증(슬롯 유효성·그리드·충돌), ApplicationPolicy = 비즈니스 정책 조합. Validator는 제거하지 않는다.
- 내부 정책 클래스는 순수 판정만 수행 (DB 접근 없음). 엔티티 로드는 서비스가 담당하고 도메인 객체(`Club`, `ClubMember`)를 넘긴다.
- 새 정책(시험기간·시설별·관리자 예외 등) 추가 시 내부 정책 클래스 추가 + `BookingApplicationPolicy` 조합만 수정.

### create 흐름 (GeneralFacilityBookingService)

1. 멤버십 조회 (기존 `ClubAuthService` 조회 메서드 — `requireManager`는 create에서 더 이상 사용하지 않음. 역할 거부를 정책 예외로 매핑하기 위함. 비회원은 기존 예외 그대로)
2. club 로드 (기존 행잠금 + ACTIVE 체크 경로 유지)
3. `BookingApplicationPolicy.validate(...)` — 순서: **반월 윈도우 → 마감 → 중앙동아리 → 역할** (오류 우선순위 절과 동일, 첫 실패만 반환)
4. `BookingPolicyValidator` — 그리드·당일·상한 등 기존 기술 검증 (윈도우 체크 제외 무수정)
5. 기존 충돌/중복 검사 → 저장

주의점:
- 정책이 validator보다 먼저 실행되므로 당일 신청은 `DEADLINE_PASSED`로 응답. validator의 "당일 경과 슬롯" 체크는 도달 불가가 되지만 기존 코드 보존 원칙에 따라 유지.
- 날짜 정책(반월·마감)이 권한보다 먼저이므로, 권한 없는 사용자가 마감된 날짜로 신청해도 400(날짜 오류)이 먼저 반환된다 — 의도된 동작.
- `requireManager` 미사용으로 비ACTIVE 클럽 처리가 create 내 잠금 후 ACTIVE 체크로 일원화됨 — 예외 타입 동일 여부를 구현 시 확인 (회귀 포인트).
- cancel/list/detail은 계속 `requireManager` 사용, 무변경.

### Availability / BookingWindow

- `GeneralFacilityAvailabilityService`의 `BookingWindowPolicy` 직접 주입 제거 → `BookingApplicationPolicy.windowFor(today)` 경유 (내부 위임, 계산 무변경).
- availability·booking-window 응답 스키마·값 **무변경** (마감·권한 미반영 — 읽기 API는 기존 계약 유지).
- **Availability의 성격**: 시설의 운영 가능 기간을 표현하는 **조회용 API**이며, 실제 예약 신청 가능 여부를 보장하지 않는다. 실제 신청 가능 여부는 Create API에서 `BookingApplicationPolicy`가 최종 검증한다 — 예약 생성 시 서버 정책이 항상 최종 판단 기준(Single Source of Truth).

### ManagedClub 응답 확장

- `GET leader/clubs/me/managed` 응답에 `centralClub: boolean` 추가 (FE 권한 게이트용, 하위호환 추가 필드).

## 프론트엔드 설계

기존 반월 UI·캘린더 무변경. 서버 결과를 소비하며 정책을 중복 구현하지 않는다.

1. **권한 게이트** (`BookingForm`): `ManagedClub.centralClub` 필터.
   - 운영 동아리 없음 → 기존 문구 유지
   - 운영 동아리는 있으나 중앙동아리 없음 → "시설 예약은 중앙동아리만 신청할 수 있어요." + 신청 UI 비활성
   - 클럽 선택지는 중앙동아리만 노출
2. **마감 안내** (패널·폼 레벨): 선택 날짜가 마감이면(당일 항상, 익일은 클라 KST가 12:01 이상일 때 — 서버와 동일 경계식 미러) 신청 버튼 비활성 + "시설 사용일 전날 12:00까지만 신청할 수 있어요."
   - 클라 시각은 **표시용 힌트만** — 최종 판단은 서버. 힌트가 틀려도 서버 400 메시지로 정정됨.
3. **서버 오류 코드 매핑**: 3종 code → 지정 메시지 표시 (기존 에러 정규화 경로에 추가), code 없으면 서버 message 폴백.
4. 타입: `packages/types` `ManagedClub`에 `centralClub` 추가.

## 테스트 계획

### 백엔드
- **BookingApplicationPolicy 단위**: 4개 정책이 진입점 하나로 동작 검증. 마감 경계(12:00:59 허용 / 12:01:00 거부, `Clock.fixed`), 당일 거부, 역할 매트릭스(LEADER/OFFICER/MEMBER), 중앙/일반 동아리.
- **BookingDeadlinePolicy 등 신규 정책 단위 테스트**.
- **기존 반월 테스트 무수정 통과** (`HalfMonthBookingWindowPolicyTest` 등) — 회귀 확인.
- **BookingPolicyValidator 테스트**: 윈도우 케이스만 facade 테스트로 이동, 나머지 유지.
- **통합**: 중앙 LEADER/OFFICER 성공, MEMBER 403, 일반동아리 403, 마감 400 (code 단언 포함).

### 회귀 주의 (필수 수정)
1. `BookingWindowFixture.bookableDate()` = 내일 → **CI가 KST 12시 이후 실행 시 마감 걸려 실패**. `오늘+2`로 변경 (모든 시각 안전, 반월 윈도우 내 항상 포함).
2. 기존 테스트 클럽 픽스처 `centralClub=false` 기본값 → create 통합 테스트 403 전멸. 픽스처 `centralClub=true` 세팅.

### 프론트
- MSW 기반: 중앙동아리 필터 분기(중앙 없음 안내), 마감 날짜 버튼 비활성+안내 문구, 서버 3종 code → 메시지 표시.

## Out of Scope

- 캘린더 날짜 셀 단위 마감 표시·스타일 변경 (반월 UI 유지 원칙)
- `FacilityUsageGuide` 문구 수정 ("7일전부터"는 학교 규정 안내 원문 — 유지)
- cancel/list/detail 권한 강화 (기존 예약 조회·취소 보존)
- availability/booking-window API 응답 스키마 변경 (마감 반영 `bookableFrom` 등)
- 시험기간·시설별·관리자 예외 정책 (확장점만 마련)
- 비회원 에러 형태 변경
- DB 마이그레이션 (불필요 — `centralClub` 기존 컬럼)

## 결정 로그

- 당일 예약 불가 = 정책 귀결로 승인 (2026-07-18)
- 마감 경계 = 분 단위, 12:01:00부터 거부 (2026-07-18)
- 신청 시작 경계 "7일 전" 변경안 → **철회**, 반월 유지 (2026-07-18)
- Validator 제거안 → **철회**, 기술 검증/비즈니스 정책 분리 유지 (2026-07-18)
- 역할 거부는 create 한정으로 `FACILITY_BOOKING_PERMISSION_DENIED` 매핑 (기타 경로는 기존 `AccessDeniedException` 유지)
