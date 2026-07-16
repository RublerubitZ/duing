# Rolling Window 예약 오픈 정책 전환 설계 (2026-07-16)

기존 반월 잠금(오늘이 1~15일이면 당월 16~말일만, 16~말일이면 익월 1~15일만)은 pivot을 넘는 순간
직전까지 열려 있던 구간이 통째로 닫혀 "예약 가능했던 기간이 갑자기 막히는" UX 결함이 있다(사용자 지적).
이를 **Rolling Window**로 전환한다: 예약은 "여는(Open)" 개념만 존재하고, 한 번 열린 구간은 지나가기
전까지 닫히지 않는다.

## 1. 정책 정의

**예약 가능 = 현재 진행 중인 반월(오늘 이후) + 다음 반월.** 과거 날짜는 기존처럼 불가.

- 오늘이 1~pivot일: 현재 구간 = [오늘, 당월 pivot일], 다음 구간 = [당월 pivot+1일, 당월 말일]
- 오늘이 pivot+1~말일: 현재 구간 = [오늘, 당월 말일], 다음 구간 = [익월 1일, 익월 pivot일]

두 구간은 항상 **연속**이므로 단일 창 `[bookableFrom=오늘, bookableUntil=다음 반월 말일]`이 성립하고,
기존 `BookingWindow(from, until)` + `contains` 검증 구조를 그대로 유지한다. pivot=15 예시:

| 오늘 | 현재 구간 | 다음 구간 | 단일 창 |
|---|---|---|---|
| 7/1 | 7/1~7/15 | 7/16~7/31 | 7/1~7/31 |
| 7/10 | 7/10~7/15 | 7/16~7/31 | 7/10~7/31 |
| 7/16 | 7/16~7/31 | 8/1~8/15 | 7/16~8/15 |
| 7/31 | 7/31~7/31 | 8/1~8/15 | 7/31~8/15 |

### 결정 사항 (구현 구속)

1. **현재 구간 시작 = 오늘(과거 클립).** "예약 가능"으로 표기되는 구간에 과거 날짜가 포함되면 라벨이
   거짓이 된다. 사용자 예시(7/1, 7/16)는 모두 오늘==반월 시작일이라 구분이 없지만, 7/10이면 현재
   구간은 7/10~7/15다.
2. **당일 신청 허용.** 오늘이 창에 포함되므로 당일 신청이 새로 열린다. 지난 슬롯은 이미 처리되어
   있다 — 어셈블러(`FacilitySlotAssembler.resolveSlot`)가 당일 지난 슬롯을 슬롯 단위 PAST로 마킹하고,
   검증기(`BookingPolicyValidator.validateSlotRange`)의 당일 가드(기존 "실행되지 않는 정책 불변
   가드")가 그대로 활성화된다. 두 계층의 판정 기준은 동일하다(슬롯의 첫 1시간이 완전히 지나면 거부:
   어셈블러 `slotEnd <= now` ↔ 검증기 `startTime+1h <= now`). 가드 주석만 현행화한다.
3. **설정 모드 명칭 `HALF_MONTH` 유지.** 모드는 구간 단위(반월)를 지칭하고, 롤링은 오픈 방식이다.
   `HalfMonthBookingWindowPolicy`의 산식·javadoc을 롤링 의미로 갱신한다. pivotDay(1~27) 설정 유지.
   잠금 방식은 폐기(요구 모드가 아니며 별도 구현체로 보존하지 않는다 — YAGNI).
4. **구간 라벨은 응답 계층 소관.** 도메인은 `OpenRangeKind`(CURRENT/NEXT) enum만 알고, 한글 라벨
   ("현재 예약 가능"/"다음 예약 가능")은 `BookingWindowResponse`에서 매핑한다.
5. **예외 메시지 형식 유지.** 창이 연속이므로 `OutOfBookingWindowException`의
   "지금은 M월 d일부터 M월 d일까지만 신청할 수 있어요." 동적 메시지가 그대로 정확하다.

## 2. 백엔드

### 도메인

```java
public record BookingWindow(LocalDate from, LocalDate until, List<OpenRange> openRanges) {
    public enum OpenRangeKind { CURRENT, NEXT }
    public record OpenRange(LocalDate from, LocalDate until, OpenRangeKind kind) {}
    public boolean contains(LocalDate date) { /* 기존과 동일: [from, until] 경계 포함 */ }
}
```

`HalfMonthBookingWindowPolicy.windowFor(today)`가 위 §1 산식으로 openRanges 2개를 담아 반환.
검증기·가용성 서비스의 소비 방식(from/until/contains)은 무변경.

### API — `GET /api/v1/facilities/booking-window`

```json
{
  "bookableFrom": "2026-07-16",
  "bookableUntil": "2026-08-15",
  "availableBookingRanges": [
    { "startDate": "2026-07-16", "endDate": "2026-07-31", "label": "현재 예약 가능" },
    { "startDate": "2026-08-01", "endDate": "2026-08-15", "label": "다음 예약 가능" }
  ]
}
```

- `bookableFrom/Until`은 하위호환 유지. `availableBookingRanges`는 정책이 바뀌어도(비연속 창 등)
  UI가 유연하게 대응하도록 구간 배열을 노출한다(사용자 권고 형식 준수).
- 가용성 응답(`FacilityAvailabilityResponse`)의 `bookableFrom/Until`은 형태 무변경(값만 롤링 산출).
- 월 파라미터 클램프(당월·익월)는 유지 — 증명: 오늘≤pivot이면 창=[오늘, 당월 말일]⊆당월,
  오늘>pivot이면 창=[오늘, 익월 pivot일]⊆당월∪익월.

### 테스트 정합 (타임밤 주의)

- `BookingWindowFixture.firstBookableDate()`는 롤링 전환 시 `window().from() == 오늘`이 되어,
  고정 슬롯 시각(예: 10:00)을 쓰는 테스트가 KST 실행 시각에 따라 당일 가드에 걸리는 **새 타임밤**이
  된다. `bookableDate()`로 교체하고 **내일**(`LocalDate.now(KST).plusDays(1)`)을 반환한다 —
  내일은 항상 창 내부다(증명: until = 다음 반월 말일 > 다음 반월 시작일 > 오늘 ⇒ until ≥ 오늘+1).
- `HalfMonthBookingWindowPolicyTest` 재작성: §1 표의 경계(1일·pivot일·pivot+1일·말일) + 2월 +
  pivot 변형 + openRanges 연속성(현재.until+1일 == 다음.from)·단일 창 정합(from==현재.from,
  until==다음.until).
- 당일 신청 케이스 추가: 당일 미래 슬롯 허용, 당일 지난 슬롯 거부(검증기 단위 테스트 — Clock 고정).

## 3. 프론트엔드 (/facilities 캘린더 — PR #647 브랜치에 반영)

- `FacilityBookingWindow` 타입에 `availableBookingRanges?: FacilityBookingRange[]` 추가.
  **옵셔널** — FE(Vercel)가 BE(Lightsail)보다 먼저 배포되는 전환기에 구 응답으로도 동작해야 한다
  (fail-open 가드 전례). 부재 시 기존 단일 배지로 폴백.
- 캘린더 창 배지 행: ranges가 있으면 구간별 칩 2개(`현재 예약 가능 7.16 ~ 7.31` /
  `다음 예약 가능 8.1 ~ 8.15` — 라벨은 API `label` 그대로), 없으면 기존 `예약 가능 기간 {windowLabel}`
  단일 배지.
- **"예약 오픈" 마커**: 다음 구간 시작일(`ranges[다음].startDate`) 셀에 소형 "오픈" 마커 표시
  (확장성 요구 — 데이터(ranges)로 구동하며 하드코딩 없음). 셀 aria-label에 "예약 오픈일" 포함.
- 월 이동(당월⇄익월 클램프)·기본 월(`bookableFrom` 월 = 이제 항상 당월)·창 밖 토스트·딥링크 정리
  이펙트는 구조 무변경 — 경계값만 롤링 산출로 바뀐다. `isWithinBookable` 무변경.
- msw 픽스처에 ranges 반영 + 폴백(부재) 케이스 테스트.

## 4. 배포 순서

BE PR(정책 전환) 먼저 머지 → FE(#647) 머지. FE는 ranges 부재 폴백이 있어 역순이어도 기능은 동작하나,
칩·오픈 마커는 BE 배포 후 노출된다.

## 5. Out of Scope

- MONTHLY/FREE 모드 구현(기존과 동일 — 인터페이스 확장점만 유지)
- `FacilityAvailabilityResponse`에 ranges 추가(캘린더는 창 API로 충분)
- 시설 홈 카드의 구간 세분 표시(연속 단일 라벨 `7.16 ~ 8.15` 유지)
- 오픈 예고 알림·관리자 정책 설정 UI
- 주간 타임테이블(WeekTimetable) 구조 변경(창 경계값 반영은 기존 props로 자동)
- `gen:api` 스키마 재생성(시설 클라이언트는 packages/types 수동 타입 — regen은 로컬 백엔드 기동
  필요, 별도 후속)
