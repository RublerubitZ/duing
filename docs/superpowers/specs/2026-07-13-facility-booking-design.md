# 시설 예약(대관 신청) 시스템 설계 — 조회에서 예약 중심으로

- 작성일: 2026-07-13
- 대상: 백엔드(`backend/`, Spring Boot 3.4 / Java 21) + 프론트(`frontend/apps/web`, Next.js 15 App Router)
- 상태: 설계 확정(2026-07-13 사용자 리뷰 완료 — 구현 계획 착수)
- 선행 스펙: [`2026-07-01-facility-usage-design.md`](./2026-07-01-facility-usage-design.md) — 크롤링·조회 인프라는 이 스펙 위에 얹는다(크롤러·파서·스냅샷·온디맨드 single-flight 전부 재사용, 변경 없음)

---

## 1. 목표 · 원칙

현재 시설 탭은 학교 크롤링 데이터를 보여주는 **읽기 전용 이용현황 뷰어**이고, 실제 대관 신청은 신청서를 내려받아 이메일로 보내는 오프라인 절차다. 이번 작업은 이 오프라인 절차(동아리 → 총동연 → 학교)를 홈페이지로 옮긴다.

- **조회는 예약의 과정이 된다.** 시설 탭 진입 → 시설 선택 → 날짜 → 시간 → 신청 → 진행 상태 확인까지 한 흐름.
- **크롤링 데이터가 가용성 판단의 기준(Source of Truth)이다.** 단, 신청 시점의 크롤 데이터는 참고 기준이고, 최종 확정은 승인(총동연) + 크롤 재확인(학교)의 **2단계 검증**으로 한다.
- **총동연 승인 ≠ 예약 완료.** 학교에는 문화팀·외부 행사 등 총동연 경로 밖의 예약이 존재하므로, 크롤 데이터에서 최종 확인돼야 CONFIRMED다.
- **크롤 인프라는 손대지 않는다.** 학교 서버 부하 원칙·fail-safe·TTL 등 선행 스펙의 보장은 그대로 유지한다.
- 신청 주체는 **동아리**(LEADER/OFFICER), 승인 주체는 **ADMIN**(= 현 총동연 관리자). 별도 총동연 Role은 만들지 않되 분리 가능하게 설계한다.

---

## 2. 용어 정의

| 용어 | 코드/DB | 의미 |
|---|---|---|
| **크롤 예약행** | `facility_reservation` (기존) | 학교 시스템에서 수집한 행. 이번 스펙에서 두 종류로 구분한다 |
| **점유행(OCCUPIED)** | `reserved_start_time IS NULL` | 운영시간 꼬리가 없는 행. **실제 예약** — 해당 슬롯은 신청 불가 |
| **운영행(OPERATING)** | `reserved_start_time IS NOT NULL` | `단체명(H:MM~H:MM)` 꼬리가 있는 행. 시설을 상시 운영하는 단체의 개방 시간 — **표시만 하고 신청을 막지 않는다** |
| **예약 신청(Booking)** | `facility_booking` (신규) | 두잉에서 동아리가 생성하는 대관 신청. 크롤 예약행과 테이블을 분리한다(크롤은 월 단위 delete+insert 전면 교체라 같은 테이블에 두면 지워진다) |
| **슬롯** | — | 09:00~22:00을 1시간 단위로 나눈 13칸. 학교 데이터 granularity와 동일 |

> 판별 규칙의 근거: 사용자 확인 결과 일부 시설은 운영 방식상 운영시간 꼬리를 단 단체가 점유 중이어도 그 시간에 대관 신청을 받는다. 따라서 "꼬리 있음 = 점유"로 막지 않고, 신청은 열어두되 총동연 승인 + 크롤 재확인이 정합성 게이트가 된다. 기존 파서가 이미 꼬리를 `reserved_start_time/end_time`으로 분리 저장하므로(V72, §16.1) **스키마 변경 없이 이 컬럼의 null 여부만으로 판별 가능**하다.
>
> 단, 이 컬럼 조건은 판별의 **현재 구현**일 뿐 계약이 아니다. 판별은 `FacilityAvailabilityPolicy`(§3.1 0단계)로 추상화해 서비스·API·UI가 컬럼 구조에 의존하지 않게 하고, 학교 데이터 형식이나 파서가 바뀌면 정책 내부만 교체한다.

---

## 3. 가용성 모델

### 3.1 슬롯 상태 계산 (조회 시, DB 미저장)

**0단계 — 크롤 행 분류 (정책 계층, `FacilityAvailabilityPolicy`)**

가용성 계산에 들어가기 전에 모든 크롤 행을 `CrawlRowType`으로 분류한다. 분류 규칙은 이 정책 컴포넌트 한 곳에만 존재하며, 가용성 계산·API·UI는 **분류 결과만 소비**하고 `reserved_start_time` 같은 컬럼 구조를 알지 못한다 — 학교 데이터 형식·파서가 바뀌어도 교체 범위가 정책 내부로 격리된다.

| CrawlRowType | 현재 판별 구현 | 가용성 효과 |
|---|---|---|
| `OCCUPIED`(점유행) | `reserved_start_time IS NULL` | 겹치는 슬롯 신청 불가 |
| `OPERATING`(운영행) | `reserved_start_time IS NOT NULL` | 어떤 슬롯도 막지 않음 — 정보 라벨만 |

enum은 확장 가능하게 둔다 — 향후 학교 데이터에 별도의 "예약 불가 행" 유형이 생기면 새 타입(예: `UNAVAILABLE`)을 추가하고 정책만 수정한다.

**1단계 — 슬롯 판정**: 한 시설·한 날짜의 13개 슬롯 각각에 대해 아래 우선순위로 판정한다:

1. `PAST` — 지난 날짜, 또는 오늘의 `end ≤ now(Asia/Seoul)` 슬롯 → 신청 불가
2. `BLOCKED(INTERNAL)` — 내부 Booking 중 `APPROVED`/`CONFIRMED`가 슬롯과 겹침 → 신청 불가, 동아리명 비노출 — FE 는 '예약됨' 계열 일반 문구 표시(2026-07-13 사용자 결정). 내부 예약은 아직 학교에 최종 반영되지 않은 신청 정보라 공개 API 에 동아리명을 싣지 않고 `blockedBy=INTERNAL` 로만 구분한다.
3. `BLOCKED(SCHOOL)` — 크롤 **점유행**이 슬롯과 겹침 → 신청 불가, 단체명 노출(학교 크롤 점유행의 단체명은 이미 공개된 정보라 현행 유지)
4. `PENDING_HOLD` — 내부 `PENDING` Booking이 겹침 → **신청 가능하되** "승인 대기중" 표시. 동아리명은 비노출(신청 경쟁 정보 최소화)
5. `AVAILABLE` — 위 어디에도 해당 없음 → 신청 가능

- **운영행은 어느 슬롯도 막지 않는다.** 해당 날짜에 "운영: {단체명} HH:MM~HH:MM" 정보 라벨로만 표시한다.
- 점유행의 겹침 판정은 저장된 1시간 슬롯 원본 행 기준(운영행으로 분류된 행의 슬롯은 제외 — 분류는 0단계 정책 결과를 사용).
- **크롤 예약행이 하나도 없는 날짜 = 종일 AVAILABLE** (선행 스펙의 월 스냅샷 메타가 "정상 수집된 빈 달"을 보장하므로 미수집과 혼동 없음).

**운영행·점유행 공존 시 처리 순서** — 같은 날짜에 둘 다 있을 때 구현은 반드시 이 순서를 따른다:

```
크롤 행 분류 (0단계, FacilityAvailabilityPolicy)
  ├─ 운영행 → 정보 레이어로 분리 (어떤 슬롯도 차단하지 않음)
  └─ 점유행 → 겹치는 슬롯 차단
        ↓
내부 APPROVED / CONFIRMED → 겹치는 슬롯 차단
        ↓
내부 PENDING → PENDING_HOLD 표시 (신청은 가능)
        ↓
나머지 슬롯 = AVAILABLE
```

예시 — 같은 날에 운영행 `고정관념(09:00~20:00)` + 점유행 `비호응원단 17~18·18~19`가 공존하면:

| 구간 | 판정 |
|---|---|
| 09~17 | `AVAILABLE` + 운영 라벨("운영: 고정관념 09:00~20:00") |
| 17~19 | `BLOCKED(SCHOOL)` — 비호응원단 |
| 19~22 | `AVAILABLE` + 운영 라벨 |

### 3.2 날짜(캘린더 셀) 상태

월간 캘린더의 날짜별 요약: `AVAILABLE`(전부/일부 가능) / `FULL`(가능 슬롯 0) / `PAST` / `OUT_OF_RANGE`. 일부만 가능한 날은 가능 슬롯 수를 도트/카운트로 구분 표시한다(§9.4).

### 3.3 신청 가능 범위·규칙

| 규칙 | 값 | 근거 |
|---|---|---|
| 시간 그리드 | 09:00~22:00, 1시간 단위, 정시 정렬 | 학교 데이터 granularity와 동일 |
| 1건의 범위 | 같은 날짜 내 **연속** 슬롯 1~13개 | 날짜를 넘는 신청은 별건으로 |
| 신청 가능 기간 | 오늘(남은 슬롯)~**다음 달 말일** | 크롤 수집 범위가 당월+익월이라 그 밖은 가용성 판단 불가 |
| 신청 차단 조건 | BLOCKED 슬롯 포함, 과거 슬롯 포함, 같은 동아리의 겹치는 활성 신청 존재 | 명백히 불가능/중복인 신청만 서버가 차단 |
| PENDING 겹침 | **허용** (Hard Block 없음) | 승인 전 신청이 슬롯을 선점하는 어뷰징 방지. UI 경고 + 승인 시 하나만 생존 |
| 동아리당 활성 신청 상한 | PENDING+APPROVED 합산 10건 (P1 상수) | 스팸 방지 최소 가드. 시설별·기간별 정책은 P2 |

위 신청 규칙 검증은 `BookingPolicyValidator`(정책 컴포넌트) 뒤에 격리한다 — P1은 표의 값을 상수로 구현하지만, P2에서 시설별 예약 정책(운영시간·최대 연속 시간·리드타임)·동아리별 제한·관리자 설정값(정책 테이블 + 설정 UI)으로 교체할 때 검증 호출부는 변하지 않는다.

---

## 4. 예약 상태 머신

### 4.1 상태 정의

| 상태 | 의미 | 종료 상태? |
|---|---|---|
| `PENDING` | 동아리가 신청, 총동연 승인 대기 | 아니오 |
| `APPROVED` | 총동연 승인 완료. 학교 등록 대기(크롤 미확인). UI에는 "학교 반영 대기" 병기 | 아니오 |
| `CONFIRMED` | 크롤 데이터에서 최종 확인된 확정 예약. 수정·변경 불가 — **관리자 취소만 가능**(학교 측 취소·오확정 정정 복구 경로, 2026-07-17 감사 후속) | 아니오(정상 종착이나 취소 전이 존재) |
| `REJECTED` | 총동연 거절(사유 필수). 겹치는 신청이 승인돼 자동 처리된 경우 포함(자동 사유 코드) | 예 |
| `CONFLICT` | **승인 이후** 학교 데이터와 충돌 발견(문화팀·외부 행사 선점 등). 관리자 조치 필요 | 아니오 |
| `CANCELLED` | 신청 동아리 취소(PENDING만) 또는 관리자 취소(APPROVED·CONFLICT·CONFIRMED) | 예 |

> **설계 결정 — 겹침 자동 처리는 `REJECTED`(자동 사유)로, `CONFLICT`는 승인 후 학교 충돌 전용으로 분리한다.** 사용자는 "자동 CONFLICT(또는 REJECTED_CONFLICT)"를 언급했는데, 겹치는 PENDING이 다른 승인으로 죽는 것은 되살릴 일 없는 종료 상태이고, CONFLICT는 관리자가 반드시 봐야 하는 액션 큐다. 하나의 상태에 두 의미를 담으면 관리자 CONFLICT 큐가 종료 건으로 오염된다. `reject_reason`에 자동 처리 여부를 담아 UI에서 "다른 예약 승인으로 자동 거절"로 구분 표기한다. (→ §16 결정 포인트 1)

### 4.2 전이 표

| From → To | 트리거 | 주체 | 단계 |
|---|---|---|---|
| (생성) → PENDING | 신청 제출 | LEADER/OFFICER | P1 |
| PENDING → APPROVED | 승인(재검증 통과 시에만) | ADMIN | P1 |
| PENDING → REJECTED | 거절(사유 입력) | ADMIN | P1 |
| PENDING → REJECTED | 겹치는 신청 APPROVED → 자동 거절 + 알림 | 시스템 | **P2** (P1은 승인 재검증이 이중 승인만 차단, 잔여 PENDING은 관리자가 수동 거절) |
| PENDING → CANCELLED | 신청 취소 | 신청 동아리 운영진 | P1 |
| APPROVED → CONFIRMED | 매칭 잡의 크롤 확인(보수적 정확 매칭) 또는 관리자 수동 확정 | 시스템/ADMIN | P1 |
| APPROVED → CONFLICT | 크롤에서 타 단체 점유행이 겹침 감지 | 시스템(P2) / ADMIN 수동(P1) | P1(수동)·P2(자동) |
| APPROVED → CANCELLED | 관리자 취소(사유) | ADMIN | P1 |
| CONFLICT → APPROVED | 재승인(재검증 통과 — 예: 학교 일정이 옮겨짐) | ADMIN | P1 |
| CONFLICT → CANCELLED | 관리자 취소(사유) | ADMIN | P1 |
| CONFIRMED → CANCELLED | 관리자 취소(사유) — 학교 측 취소·오확정 정정 복구 경로 | ADMIN | P1 (2026-07-17 감사 후속) |

**불변식**
- CONFIRMED 탈출 전이는 관리자 취소(CONFIRMED → CANCELLED) 하나뿐이다 — 학교 측 취소·오확정 정정용 복구 경로. (종전 "완전 터미널" 결정을 2026-07-17 감사 후속으로 대체: 복구 경로 부재 시 슬롯이 영구 하드 차단되고 DB 수작업 외 수단이 없었다.)
- 모든 전이는 `facility_booking_status_history`에 append-only 기록된다(§7.5).
- APPROVED/CONFIRMED로 들어가는 전이는 반드시 겹침 재검증(§5.2)을 통과해야 하며, DB EXCLUDE 제약(§6.1)이 최종 백스톱이다. 단, **수동 확정은 내부 겹침 재검증만 수행한다** — 학교 점유 재검증은 자기 등록 행(표기 차이로 자동 매칭 불발)을 타 단체 행과 구분할 수 없어 본래 시나리오를 전부 409로 차단하므로 걸지 않는다(관리자 오버라이드, 2026-07-17 감사 후속).
- 상태 전이는 전부 조건부 UPDATE(현재 상태 확인)로 수행 — 중복 클릭·경합 시 두 번째 요청은 409.

### 4.3 상태별 권한 매트릭스

수정(내용 변경) 기능은 P1에 없다 — 변경이 필요하면 **취소 후 재신청**이 유일한 경로이며, 이는 PENDING에서만 가능하다.

| 상태 | 신청자(동아리 운영진) | 관리자(ADMIN) |
|---|---|---|
| `PENDING` | **취소 가능** · 수정 불가(취소 후 재신청) | 승인 / 거절 |
| `APPROVED` | **수정·취소 불가** — "학교 반영 대기" 표시, 취소가 필요하면 총동연 문의 안내 | 취소(사유) / 수동 확정 / 수동 충돌 전환 |
| `CONFIRMED` | 불가 | 취소(사유) — 학교 측 취소·오확정 정정 복구 경로 |
| `CONFLICT` | 불가 | 재승인 / 취소(사유) |
| `REJECTED` / `CANCELLED` | 조회만 | 조회만 |

---

## 5. 예약 프로세스

### 5.1 신청 (동아리 운영진)

1. `/facilities`에서 시설·날짜·연속 슬롯 선택 → 신청 폼(동아리 선택[운영진인 동아리가 복수면], 사용 목적, 사용 인원).
2. 서버 검증: canManageClub + §3.3 규칙 + BLOCKED 겹침 없음. PENDING 겹침은 허용하되 응답에 `overlappingPendingCount` 포함(제출 전 UI에도 "승인 대기중" 슬롯으로 사전 노출 + "이미 예약 신청이 접수된 시간입니다" 확인 문구).
3. PENDING 생성 + history 기록. (P2: ADMIN들에게 인앱 알림)

### 5.2 승인 (2단계 재검증 — 트랜잭션 경계 분리)

외부 크롤을 DB 트랜잭션 안에서 수행하지 않는다(사용자 합의). 순서:

1. **[트랜잭션 밖]** 관리자가 신청 상세를 열면 상세 API가 해당 월 온디맨드 재크롤을 시도한다(기존 `ensureFresh` single-flight·쿨다운 30s·온디맨드 예산 그대로 재사용). 응답에 `crawlBasisAt`(스냅샷 기준 시각)과 `stale` 포함.
   - 재크롤 실패 시: 승인을 막지 않고 관리자 UI에 **"최신 크롤링을 확인하지 못했습니다. 마지막 수집({N분 전}) 데이터를 기준으로 승인합니다."** 배너를 띄워 관리자가 판단하게 한다.
2. **[트랜잭션 안]** 승인 API:
   a. `facility` 행 `PESSIMISTIC_WRITE` 잠금(시설 단위 승인 직렬화 — `BankTransactionRepository` 전례)
   b. 대상 Booking을 재조회, `status = PENDING`(또는 CONFLICT 재승인) 확인 — 아니면 409
   c. 겹침 검사: ① 크롤 **점유행**과 겹침 → 409 + "학교 예약과 시간이 충돌하여 승인할 수 없습니다"(충돌 행 정보 포함) ② 내부 APPROVED/CONFIRMED와 겹침 → 409
   d. 통과 → APPROVED, `decided_by/decided_at` 기록, history에 `crawl_basis_at`(검증에 사용한 스냅샷 시각) 기록
3. DB **EXCLUDE 제약**이 c를 우회하는 어떤 경로(버그·수동 SQL)도 최종 차단한다.

### 5.3 학교 반영 · CONFIRMED 매칭 (매칭 잡)

실제 운영: 총동연이 승인 건을 정리해 학교 담당자에게 전달 → 학교가 등록 → 다음 크롤에 나타남.

- **매칭 잡**: `@Scheduled(cron = "0 3-59/10 * * * *", zone = "Asia/Seoul")` — 크롤 잡(매 10분 0초)과 3분 오프셋. 크롤 커버 월의 APPROVED Booking을 스캔한다. 토글 `duing.facility.booking.matching.enabled`(기존 `DUING_*_ENABLED` 관례, base=false·prod=true — **prod 기본 활성이므로 배포 체크리스트에 env 명시**).
- **CONFIRMED 판정(P1, 보수적)**: 같은 시설·같은 날짜의 점유행들이 Booking의 모든 1시간 서브슬롯을 빠짐없이 덮고, 그 행들의 `organization_name` 정규화 결과가 동아리명 정규화 결과와 **정확히 일치**할 때만 자동 CONFIRMED. `matched_schedule_seq`(대표 행)와 `crawl_basis_at`을 기록.
  - 정규화: 공백 제거 + 끝 괄호 그룹 제거 + 소문자화. 학교 표기가 달라 자동 매칭이 안 되는 건 관리자 **수동 확정 버튼**으로 처리(P1). 동아리별 학교 표기명 매핑은 P2 확장.
  - **이 정확 매칭은 P1의 보수적 초기 정책이지 최종 구조가 아니다.** 매칭 판정은 `FacilityBookingMatchingService` 안의 교체 가능한 정책으로 캡슐화하고, 소비자는 판정 결과(자동 확정 / 확인 필요 후보 / 미매칭)만 본다. 확장 경로: ① 동아리별 학교 표기명 매핑(P2) ② 이름 없이 시설+날짜+시간 일치만으로 후보를 뽑아 관리자 원클릭 확인 큐로 승격 ③ 유사도 기반 매칭 제안 — 어느 쪽이든 매칭 정책 내부 교체로 끝나야 한다.
- **미매칭 APPROVED**: 그대로 유지. 관리자 목록에 "학교 반영 대기 D+N"으로 경과일 표시. **자동 취소 없음**(사용자 합의 — 실운영상 총동연 승인 건은 대부분 학교도 승인).
- **충돌 감지**: 겹치는 점유행이 있는데 이름이 불일치하면 —
  - P1: 자동 전이하지 않고 관리자 상세/목록에 "충돌 의심" 플래그로 노출(이름 표기 차이 오탐 방지), 관리자가 확인 후 수동 CONFLICT 전환 또는 수동 확정.
  - P2: 연속 2회 크롤에서 동일 충돌이 관측되면 자동 CONFLICT + 관리자·신청 동아리 인앱 알림.
- **부분 겹침**(같은 이름인데 시간이 일부만 등록됨): 자동 전환 없이 "부분 반영" 플래그로 관리자 주의 표시(P1), 처리(범위 수정 승인 등)는 관리자 판단.
- 매칭 잡은 **멱등**: CONFIRMED는 스킵, 같은 입력에 같은 결과. `fetch_status = SUCCESS`인 월 스냅샷만 신뢰한다(PARTIAL/FAILED 월은 그 사이클 스킵 — 반쪽 데이터로 오판 방지).

### 5.4 취소

- PENDING: 신청 동아리 운영진이 즉시 취소 가능(P1).
- APPROVED/CONFLICT: 관리자만 취소(사유 필수). 신청 동아리 UI에는 "승인된 예약 취소는 총동연에 문의"를 안내(P1). 동아리발 취소 요청 플로우는 P3.
- CONFIRMED: 관리자만 취소(사유 필수) — 학교 측 취소·오확정 정정용 복구 경로(§4.2, 2026-07-17 감사 후속).

---

## 6. 데이터 모델

구현 브랜치는 **V82/V83/V84**(연속 세 개)를 선점하고 `V81`은 열린 PR #629(email 인프라 제거) 몫으로 남긴다(아래 `V8x/V8y/V8z`는 이 V82/V83/V84 세 개를 가리키는 자리표시). Flyway는 out-of-order 적용을 금지하므로 두 브랜치가 같은 번호를 쓰면 부팅에 실패한다 — 머지 순서가 역전돼 이 브랜치가 #629보다 먼저 배포되면 #629가 V85+로 리넘버한다(구현 계획 Task 1에 재확인 절차 포함). 모든 신규 테이블 RLS 활성화(V59 정책·`RowLevelSecurityMigrationTest` 가드).

### 6.1 `facility_booking` (V8x)

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE facility_booking (
    id                   BIGSERIAL PRIMARY KEY,
    facility_id          BIGINT       NOT NULL REFERENCES facility(id),
    club_id              BIGINT       NOT NULL REFERENCES club(id),
    applicant_id         BIGINT       NOT NULL REFERENCES users(id),
    reservation_date     DATE         NOT NULL,
    start_time           TIME         NOT NULL,
    end_time             TIME         NOT NULL,
    purpose              VARCHAR(200) NOT NULL,
    attendee_count       INT,
    status               VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    reject_reason        VARCHAR(500),
    conflict_detail      VARCHAR(500),
    matched_schedule_seq BIGINT,
    crawl_basis_at       TIMESTAMP,
    decided_by           BIGINT       REFERENCES users(id),
    decided_at           TIMESTAMP,
    confirmed_at         TIMESTAMP,
    version              BIGINT       NOT NULL DEFAULT 0,
    created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMP,
    CONSTRAINT chk_facility_booking_time
        CHECK (start_time >= '09:00' AND end_time <= '22:00' AND start_time < end_time)
);

-- 활성(APPROVED/CONFIRMED) 예약의 시설·시간 겹침을 DB 레벨에서 차단 (동시성 최종 백스톱)
ALTER TABLE facility_booking ADD CONSTRAINT excl_facility_booking_active_overlap
    EXCLUDE USING gist (
        facility_id WITH =,
        tsrange((reservation_date + start_time), (reservation_date + end_time)) WITH &&
    ) WHERE (status IN ('APPROVED', 'CONFIRMED') AND deleted_at IS NULL);

CREATE INDEX idx_facility_booking_slot   ON facility_booking (facility_id, reservation_date);
CREATE INDEX idx_facility_booking_club   ON facility_booking (club_id, created_at DESC);
CREATE INDEX idx_facility_booking_queue  ON facility_booking (status, reservation_date)
    WHERE status IN ('PENDING', 'APPROVED', 'CONFLICT');

ALTER TABLE facility_booking ENABLE ROW LEVEL SECURITY;
```

- `btree_gist` 확장은 Supabase(개발·prod 모두 PostgreSQL)에서 사용 가능. EXCLUDE 제약은 상태가 APPROVED/CONFIRMED로 **바뀌는 UPDATE에도** 재평가되므로 승인 경합의 마지막 방어선이 된다.
- 크롤 미러(`facility_reservation`)와 완전 분리 — 크롤의 월 단위 delete+insert가 Booking을 건드릴 일이 없다.
- 이름은 `facility_booking`으로 확정(기존 `facility_reservation`과의 혼동 방지, 코드 전반에서 크롤=reservation / 신청=booking 용어 통일).

### 6.2 `facility_booking_status_history` (V8y) — append-only 감사 로그

`application_status_history`(V43) 패턴 그대로:

```sql
CREATE TABLE facility_booking_status_history (
    id              BIGSERIAL PRIMARY KEY,
    booking_id      BIGINT      NOT NULL REFERENCES facility_booking(id),
    previous_status VARCHAR(20),
    new_status      VARCHAR(20) NOT NULL,
    changed_by      BIGINT      REFERENCES users(id),   -- 시스템 자동 전이는 NULL
    reason          VARCHAR(500),
    crawl_basis_at  TIMESTAMP,                          -- 전이 판단에 사용한 크롤 스냅샷 시각
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fbsh_booking ON facility_booking_status_history (booking_id, created_at);
ALTER TABLE facility_booking_status_history ENABLE ROW LEVEL SECURITY;
```

- 생성(NULL → PENDING) 포함 모든 전이를 기록. 엔티티에서 update/delete 차단(전례 동일).
- 관리자 메모(자유 텍스트, 상태 전이와 무관)는 P2에서 별도 테이블로 추가한다.

### 6.3 `facility_booking_purpose_preset` (V8z) — 사용 목적 Preset

```sql
CREATE TABLE facility_booking_purpose_preset (
    id         BIGSERIAL   PRIMARY KEY,
    label      VARCHAR(50) NOT NULL UNIQUE,
    sort_order INT         NOT NULL DEFAULT 0,
    active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);
ALTER TABLE facility_booking_purpose_preset ENABLE ROW LEVEL SECURITY;

INSERT INTO facility_booking_purpose_preset (label, sort_order) VALUES
    ('동아리 정기 모임', 0), ('동아리 정기 연습', 1), ('정기 합주', 2),
    ('공연 연습', 3), ('행사 준비', 4), ('회의', 5), ('세미나', 6),
    ('신입부원 교육', 7), ('촬영', 8);
```

- 조회는 `active = TRUE` + `sort_order` 정렬. "기타(직접 입력)"는 DB 행이 아니라 FE 고정 칩(§9.4).
- P1은 시드 + 공개 GET만. 관리자 CRUD(추가·수정·정렬·비활성)는 P2 — 테이블이 이미 있으므로 API·화면만 얹으면 된다.

---

## 7. 백엔드 설계

### 7.1 패키지 — 신규 `domain/facilitybooking/`

크롤 도메인(`domain/facility`)과 분리한다. 생명주기·쓰기 패턴·권한이 전혀 다르고, 크롤 패키지의 "읽기 전용 미러" 불변식을 지키기 위해서다. Booking → Facility 참조는 ID 참조(`facilityId`)로, 기존 도메인 간 관례(application → club)와 동일.

```
domain/facilitybooking/
├── entity/       FacilityBooking, FacilityBookingStatusHistory, FacilityBookingPurposePreset, BookingStatus(enum)
├── repository/   FacilityBookingRepository, FacilityBookingStatusHistoryRepository, FacilityBookingPurposePresetRepository
├── service/      FacilityBookingService          — 신청·취소 (동아리 측)
│                 FacilityBookingAdminService     — 승인·거절·확정·취소 (관리자 측, 재검증 포함)
│                 FacilityAvailabilityService     — 슬롯 상태 계산 (크롤 조회 서비스 재사용)
│                 FacilityBookingMatchingService  — CONFIRMED 매칭 (교체 가능한 판정 정책, §5.3)
│                 FacilityAvailabilityPolicy      — 크롤 행 분류(운영행/점유행) 정책 (§3.1 0단계)
│                 BookingPolicyValidator          — 신청 규칙 검증 (P1 상수 → P2 설정값, §3.3)
│                 OrganizationNameNormalizer      — 이름 정규화 (순수 함수)
├── scheduler/    FacilityBookingMatchingScheduler — @Scheduled + @ConditionalOnProperty
├── controller/   FacilityAvailabilityController, ClubFacilityBookingController,
│                 AdminFacilityBookingController (+ 각 Api 인터페이스)
└── dto/          request/response records
```

### 7.2 엔티티 핵심

- `FacilityBooking`: `BaseEntity` 상속 + `@Version`(낙관적 잠금 — Application 전례). 상태 전이는 엔티티 도메인 메서드로만(`approve(adminId, crawlBasisAt)`, `reject(adminId, reason)`, `confirm(...)`, `markConflict(detail)`, `cancel(...)`) — 각 메서드가 현재 상태를 검증하고 아니면 도메인 예외.
- `BookingStatus`: `PENDING, APPROVED, CONFIRMED, REJECTED, CONFLICT, CANCELLED` + `isTerminal()`, `isActive()`(PENDING/APPROVED/CONFIRMED — 겹침 계산 대상은 이 중 APPROVED/CONFIRMED).

### 7.3 트랜잭션 · 동시성

| 지점 | 전략 |
|---|---|
| 신청 생성 | 잠금 없음. BLOCKED 겹침 검증은 일반 조회(오탐은 승인 단계가 거른다) |
| 승인/재승인/수동확정 | `facility` 행 `PESSIMISTIC_WRITE` → 상태 확인 → 겹침 검사 → 전이. 시설 단위 직렬화로 "관리자 A·B가 겹치는 두 신청을 동시에 승인" 차단 |
| DB 백스톱 | §6.1 EXCLUDE 제약. 잠금 로직에 버그가 있어도 이중 승인은 커밋 불가(23P01 → 409로 변환) |
| 취소 vs 승인 경합 | 둘 다 조건부 전이라 한쪽만 성공, 다른 쪽 409 |
| 매칭 잡 vs 승인 | 매칭 잡도 시설 행 잠금 후 전이(짧은 트랜잭션, 시설·날짜 단위로 쪼개 처리) |
| 크롤 교체 vs 검증 읽기 | MVCC로 충분 — 검증은 커밋된 스냅샷을 읽고, `crawl_basis_at`으로 판단 근거를 남긴다 |
| readOnly 함정 | `FacilityAvailabilityService`는 온디맨드 크롤(쓰기)을 유발할 수 있으므로 클래스 레벨 `@Transactional(readOnly)` 금지 — 무트랜잭션 오케스트레이션(선행 스펙 CRITICAL 후속과 동일 원칙) |

### 7.4 멱등성

- 상태 전이 API: 조건부 전이로 자연 멱등(중복 클릭 → 409, 부작용 없음).
- 매칭 잡: CONFIRMED 스킵 + 같은 스냅샷이면 같은 결과. 실행 겹침은 `AtomicBoolean` 가드(크롤 스케줄러 전례, 단일 인스턴스).
- 알림(P2): `dedup_key = "FACILITY_BOOKING_{event}_{bookingId}"`로 기존 UNIQUE 제약 멱등.

### 7.5 감사 로그

§6.2 테이블에 모든 전이 기록. 서비스 레이어에서 전이 커밋과 같은 트랜잭션으로 append. 승인·매칭은 `crawl_basis_at`을 함께 남겨 "그때 무엇을 근거로 판단했나"를 재구성 가능하게 한다.

### 7.6 알림 (P2)

기존 인프라(이벤트 발행 → `@EventListener` → `NotificationService.create`, dedup_key 멱등) 재사용. `NotificationType` 추가:

| 타입 | 수신자 | 시점 |
|---|---|---|
| `FACILITY_BOOKING_SUBMITTED` | ADMIN 전원 | 신청 접수 |
| `FACILITY_BOOKING_APPROVED` / `REJECTED` | 신청 동아리 운영진 | 승인/거절(자동 거절 포함) |
| `FACILITY_BOOKING_CONFIRMED` | 신청 동아리 운영진 | 크롤 확인 확정 |
| `FACILITY_BOOKING_CONFLICT` | ADMIN 전원 + 신청 동아리 운영진 | 충돌 전환 |

메일 인프라는 제거됐으므로(#629) 인앱 전용.

### 7.7 스케줄러 영향

- 기존 크롤 잡(10분)·시설 동기화(04:00): **변경 없음**.
- 신규 매칭 잡(10분, +3분 오프셋): 읽기(크롤 스냅샷·APPROVED 목록) + 소량 전이 쓰기. 대상이 커야 수십 건이라 부하 무시 가능.
- 단일 인스턴스 전제(기존과 동일). 멀티 인스턴스 전환 시 크롤 잡과 함께 ShedLock/PG advisory lock 승격(선행 스펙 §10 TODO에 편승).

---

## 8. API 설계

베이스 `/api/v1`, `ApiResponse<T>` 래퍼, DTO는 record + static `from()`. 표기: 🌐 공개 / 🔐 인증 / 👑 ADMIN.

| # | 메서드 · 경로 | 권한 | 설명 |
|---|---|---|---|
| 1 | `GET /facilities/{facilityId}/availability?yearMonth=` | 🌐 | 월 단위 가용성(날짜별 13슬롯 상태). 기존 온디맨드 신선도 로직 경유 |
| 2 | `POST /clubs/{clubId}/facility-bookings` | 🔐 canManageClub | 신청 생성 |
| 3 | `GET /clubs/{clubId}/facility-bookings?status=` | 🔐 canManageClub | 동아리 신청 목록 (P1 미페이징 — 캘린더 기반 탐색·동아리당 규모 작음, 페이징은 P2 관리자 큐와 함께 도입) |
| 4 | `GET /clubs/{clubId}/facility-bookings/{bookingId}` | 🔐 canManageClub | 신청 상세(+이력) |
| 5 | `POST /clubs/{clubId}/facility-bookings/{bookingId}/cancel` | 🔐 canManageClub | PENDING 취소 |
| 6 | `GET /admin/facility-bookings?status=&facilityId=&dateFrom=&dateTo=&page=` | 👑 | 관리자 큐(기본 PENDING 우선 정렬, "학교 반영 대기 D+N"·충돌 의심 플래그 포함) |
| 7 | `GET /admin/facility-bookings/{id}` | 👑 | 상세 + 검증 컨텍스트(해당 월 온디맨드 재크롤 시도 → `crawlBasisAt`/`stale`, 겹치는 점유행·내부 예약·겹치는 PENDING 목록) |
| 8 | `POST /admin/facility-bookings/{id}/approve` | 👑 | 승인(§5.2 재검증). 충돌 시 409 + 충돌 상세 |
| 9 | `POST /admin/facility-bookings/{id}/reject` | 👑 | 거절 `{reason}` |
| 10 | `POST /admin/facility-bookings/{id}/confirm` | 👑 | 수동 확정(자동 매칭 실패분) |
| 11 | `POST /admin/facility-bookings/{id}/conflict` | 👑 | 수동 충돌 전환 `{detail}` (P1 — 자동 전환은 P2) |
| 12 | `POST /admin/facility-bookings/{id}/cancel` | 👑 | APPROVED/CONFLICT 취소 `{reason}` |
| 13 | `GET /admin/facility-bookings/summary` | 👑 | 대시보드 카드 수치(승인 대기·학교 반영 대기·충돌·이달 확정 — §9.7) |
| 14 | `GET /facilities/booking-purpose-presets` | 🌐 | 사용 목적 Preset 목록(§9.4). 기존 `/api/v1/facilities/**` GET permitAll 범위라 Security 변경 불필요 |

관리자 API는 `/api/v1/admin/**` 관례(URL 백스톱 `hasRole('ADMIN')` + 컨트롤러 `@PreAuthorize`) 그대로.

### 8.1 가용성 응답 예시 (핵심 DTO)

```json
{
  "facilityId": 12,
  "yearMonth": "2026-07",
  "lastUpdatedAt": "2026-07-13T11:20:00+09:00",
  "stale": false,
  "bookableFrom": "2026-07-13",
  "bookableUntil": "2026-08-31",
  "days": [
    {
      "date": "2026-07-15",
      "dayStatus": "AVAILABLE",
      "availableSlotCount": 9,
      "operatingNotes": [ { "organization": "고정관념", "start": "09:00", "end": "20:00" } ],
      "slots": [
        { "start": "09:00", "end": "10:00", "status": "AVAILABLE" },
        { "start": "17:00", "end": "18:00", "status": "BLOCKED", "blockedBy": "SCHOOL", "organization": "비호응원단" },
        { "start": "19:00", "end": "20:00", "status": "BLOCKED", "blockedBy": "INTERNAL" },
        { "start": "20:00", "end": "21:00", "status": "PENDING_HOLD" }
      ]
    }
  ]
}
```

(슬롯 13개 × 최대 31일 ≈ 400개 항목 — gzip 후 수 KB, 월 1회 페치로 충분)

### 8.2 신청 생성 요청/응답 예시

```json
// POST /clubs/{clubId}/facility-bookings
{ "facilityId": 12, "date": "2026-07-15", "startTime": "18:00", "endTime": "20:00",
  "purpose": "정기 공연 리허설", "attendeeCount": 15 }

// 201 응답
{ "bookingId": 31, "status": "PENDING", "overlappingPendingCount": 1 }
```

### 8.3 승인 충돌 응답 예시 (409)

```json
{ "code": "FACILITY_BOOKING_SCHOOL_CONFLICT",
  "message": "학교 예약과 시간이 충돌하여 승인할 수 없습니다.",
  "data": { "conflicts": [ { "source": "SCHOOL", "organization": "문화팀", "start": "18:00", "end": "19:00" } ],
            "crawlBasisAt": "2026-07-13T11:20:00+09:00" } }
```

---

## 9. 프론트엔드 UX 설계

### 9.1 IA · 라우트

```
/facilities                          예약 홈 (시설 칩 + 월간 캘린더 + 오늘 현황 축약)  ← 전면 교체
/facilities?facilityId=12&date=...   딥링크 (칩·날짜 선택 상태를 쿼리로 유지)
/facilities/[facilityId]             → /facilities?facilityId= 로 redirect (기존 링크 호환)
/manage/clubs/[clubId]/facility-bookings   동아리 예약 관리 (운영진)
/admin/facility-bookings             총동연 승인 큐
```

> **설계 결정 — 시설 전환을 라우트 이동이 아니라 단일 페이지 + 쿼리 파라미터로 한다.** 예약 플로우(시설↔날짜↔시간 왕복 탐색)에서 라우트 전환은 체감 지연과 상태 리셋을 만든다. 칩 전환은 즉각적이고, 쿼리 스트링으로 딥링크·뒤로가기도 보존된다. "시설탭 하나에서 전부"라는 목표와도 부합. (→ §16 결정 포인트 2)

### 9.2 시설 선택 UX — 비교와 결정

시설이 **10개 고정 수준**(커뮤니티룸 3, 공동연습실 4, 빛광장, 자유광장, 웅지관 강당)이라는 사실이 결정 근거다.

| 방식 | 판정 | 이유 |
|---|---|---|
| **Horizontal Chips** | ✅ **채택** | 1터치 전환, 현재 선택 상시 노출, 가로 스와이프가 모바일 자연스러움. 10개 규모에 최적 |
| Searchable Combobox | ❌ | 검색이 필요한 규모(수십 개+)가 아님. 최소 2터치 + 키보드 노출 |
| Bottom Sheet Picker | ❌ | 2터치 + 캘린더 컨텍스트 이탈. 시설 수가 적어 과함 |
| Tabs | ❌ | 10개는 탭 패턴의 한계(4~5개) 초과. 칩과 달리 줄바꿈/스크롤 어색 |
| Select(네이티브) | ❌ | 선택지 프리뷰 불가, 두잉 디자인 톤과 불일치 |

칩 스트립: 가로 스크롤, 선택 칩 `bg-ink text-white`(DESIGN.md pill 규격), 미선택 `border-line bg-paper`. 각 칩에 "지금 사용중" 상태 도트(기존 Overview의 상태점 재사용) — 시설 비교 정보를 칩 레벨로 흡수.

### 9.3 메인 플로우 (예약 홈)

```
[시설 칩 스트립]  ← 기본 선택: 첫 시설 (딥링크 시 쿼리값)
[월간 캘린더 그리드]  ← /calendar 의 buildMonth 자체 구현 재사용
[오늘 현황(전 시설 비교) — 접이식 축약 섹션]  ← 기존 FacilityOverviewTimeline 강등 배치
```

- 캘린더 셀: 가능(기본) / 일부 가능(남은 슬롯 수 표기) / FULL(흐림 + 취소선 없음, "마감" 라벨) / 과거·범위 밖(비활성). 오늘 코랄 링. 다음 달 말일까지만 활성(§3.3) — 범위 밖 셀에 이유 툴팁("예약 현황이 아직 제공되지 않는 기간").
- 월 이동: 당월⇄익월 2개 월만(신청 가능 범위와 일치). 기존 상세의 과거 월 조회(±12개월)는 예약 홈에서 제공하지 않는다 — 주간 뷰에 현재 주의 지난 요일이 보이는 정도가 전부이며, 과거 월 탐색이 필요하면 P3에서 별도 뷰로 재검토(§16 결정 포인트 5).

### 9.4 날짜 클릭(Day View) — 비교와 결정

| 방식 | 판정 | 이유 |
|---|---|---|
| **Bottom Sheet(모바일) + 인라인 우측 패널(데스크탑)** | ✅ **채택** | DESIGN.md 규칙("폼·다단 입력·스크롤 → Bottom Sheet") 그대로 + CalendarPage의 하이브리드(데스크탑 grid 슬라이드-인 패널 / 모바일 백드롭+시트) 전례 재사용. 캘린더 컨텍스트를 유지한 채 상세 진입 |
| Modal + Timeline | ❌ | 모바일에서 세로 공간 부족, 캘린더 가림 |
| Animated Drawer(측면) | ❌ | 모바일 측면 드로어는 캘린더 완전 가림 + 스와이프 제스처 충돌 |
| Floating Panel | ❌ | 모바일 부적합, 데스크탑도 앵커 관리 복잡 |

시트/패널 내부 = **수직 시간축 슬롯 리스트**(09~22, 13행):
- 각 행: 시간 라벨(mono) + 상태(AVAILABLE=탭 가능 / BLOCKED=회색 채움 — `blockedBy=SCHOOL`은 단체명 표시, `INTERNAL`은 동아리명 비노출이라 "예약됨" 일반 문구(§3.1 결정 20) / PENDING_HOLD=“승인 대기중” 배지, 탭 가능 / PAST=흐림). 상단에 운영행 정보 라벨("운영: 고정관념 09:00~20:00").
- **연속 범위 선택**: 첫 탭=시작(1시간 선택), 두 번째 탭=끝(사이가 전부 선택 가능하면 범위 확장, 아니면 새 시작으로 재시작). 선택 구간 `bg-ink-soft` 하이라이트 + 하단 sticky CTA "18:00~20:00 예약 신청".
- CTA 탭 → 시트 안에서 신청 폼 단계로 전환(시트 유지, 뒤로 가능): 동아리 선택(운영진 동아리 1개면 자동 고정 표시), 사용 목적(필수 — 아래 Preset + 자유 입력 하이브리드), 사용 인원(선택). 폼 필드는 MVP 최소 구성이되, 학교 전달 양식 변경에 대비해 폼 스키마(필드 정의·검증)를 한 모듈에 모아 필드 추가가 국소적이게 한다. PENDING_HOLD 포함 시 폼 상단에 "이미 예약 신청이 접수된 시간입니다. 계속 신청하시겠습니까?" 경고 블록.

**사용 목적 입력 — Preset + 자유 입력 하이브리드**

| 방식 | 판정 | 이유 |
|---|---|---|
| **Preset Chip** | ✅ **채택** | 10개 내외 선택지가 폼 안에 즉시 노출, 1터치 채움, 모바일 시트·기존 칩 문법과 궁합. "선택 후 자유 수정" 흐름이 가장 자연스러움 |
| Select | ❌ | 선택지 미리보기 불가 + 최소 2터치, 선택값을 이어서 수정하는 UX가 부자연 |
| Combobox | ❌ | 검색이 필요한 규모가 아님. 구현 복잡도 대비 이득 없음 |

- 동작: 칩 탭 → 사용 목적 입력란에 해당 문구 **자동 채움**(이후 자유 수정 가능). 입력값이 칩 문구와 일치하는 동안만 칩이 선택 상태로 보이고, 수정하면 해제된다. "기타(직접 입력)" 칩은 FE 고정 칩(항상 마지막)으로, 입력란을 비우고 포커스만 준다.
- 서버에는 **최종 텍스트만** 저장한다(`purpose` 컬럼 그대로, preset FK 없음) — Preset은 입력 보조 UX일 뿐 데이터 모델에 침투하지 않는다.
- Preset 목록은 하드코딩하지 않는다: `facility_booking_purpose_preset` 테이블(§6.3, 시드: 동아리 정기 모임 / 동아리 정기 연습 / 정기 합주 / 공연 연습 / 행사 준비 / 회의 / 세미나 / 신입부원 교육 / 촬영) + 공개 GET(§8 #14)으로 서빙. 관리자 추가·수정 CRUD는 P2.
- 제출 → 성공 화면(시트 내): 상태 스텝퍼(신청 완료 → 총동연 승인 → 학교 확정) + "내 예약에서 확인" 링크.

**모바일 터치 카운트**: 날짜(1) → 슬롯(2) → 신청 CTA(3) → [폼 입력] → 제출. 목표(3터치 이내 진입) 충족.

### 9.5 주간 Time Table (P1)

시트/패널 상단 토글(일간 리스트 ⇄ 주간)로 제공 — 별도 화면이 아니라 Day View의 확장 보기.

- 에브리타임 식 **7열(월~일) × 13행(09~22)** 그리드. 선택 날짜가 포함된 주를 표시하고 **선택일 컬럼 하이라이트**(배경 tint + 헤더 강조).
- 셀 채움: BLOCKED=회색 채움(SCHOOL은 단체명 약칭, INTERNAL은 "예약됨" — §3.1 결정 20), PENDING_HOLD=점선 테두리, AVAILABLE=빈 칸. 주간 뷰에서도 셀 탭 = 그 날짜·슬롯 선택(선택일 자동 전환).
- 데스크탑: 우측 패널이 넓어 기본 주간, 모바일: 기본 일간 리스트 + 토글 시 가로 스크롤 그리드(선택일 중앙 정렬).

### 9.6 내 예약 (동아리 운영진)

- `manage/clubs/[clubId]/facility-bookings`: `/me/applications` 완성형 전례(리스트 + 상태 필터 탭 + 상세 모달)를 본뜬다. 행 = 시설·날짜·시간·상태 배지, 상세 모달 = `ApplicationStepper` 재사용한 3단계(신청 → 총동연 승인 → 학교 확정) + 이력 + PENDING이면 취소 버튼.
- 상태 배지 색: PENDING=warm, APPROVED=ink-soft("학교 반영 대기" 서브라벨), CONFIRMED=ink, REJECTED/CANCELLED=charcoal-3, CONFLICT=coral.
- 예약 홈(`/facilities`)에도 로그인+운영진이면 상단에 "내 신청 N건 진행 중" 칩 → manage 페이지 링크.

### 9.7 관리자 화면 (`/admin/facility-bookings`)

- **상단 Summary Cards(대시보드)** — 큐 위에 지표 카드 4장(API #13). 카드 클릭 = 해당 필터로 목록 전환:

  | 카드 | 수치 | 강조 |
  |---|---|---|
  | 승인 대기 | PENDING 총 건수(+오늘 접수 N건) | 가장 오래된 대기 경과일 |
  | 학교 반영 대기 | APPROVED 건수 | 최장 D+N — 오래된 건 coral 경고 |
  | 충돌 | CONFLICT + 충돌 의심 플래그 건수 | 1건이라도 있으면 coral |
  | 이달 확정 | 해당 월 CONFIRMED 건수 | — |

- **충돌 카드 계약**: 카드 수치 = `conflictCount`(CONFLICT 상태 건수) + `conflictSuspectedCount`(당월·익월 APPROVED 중 이름 불일치 점유행 겹침 파생 건수) **합산** 표시. 카드 클릭 = CONFLICT 상태 필터 + APPROVED 큐의 `conflictSuspected`(및 `partiallyMatched`) 플래그 배지 조합 — 실제 CONFLICT와 '의심' 대기 건을 한 화면에서 함께 처리한다.
- 기존 admin 콘솔 패턴(테이블 + 필터) 재사용. 기본 뷰 = PENDING 큐(오래된 순 — `status==PENDING`이면 `createdAt asc`, 그 외 최신순). 필터: 상태/시설/기간. APPROVED 행에 "학교 반영 대기 D+N", 충돌 의심·부분 반영 플래그 배지.
- 상세(모달 또는 상세 행 확장): 신청 정보 + **검증 컨텍스트 시각화** — 해당 날짜의 13슬롯 미니 타임라인에 신청 구간·크롤 점유행·겹치는 PENDING을 겹쳐 그림. 상단에 크롤 신선도("마지막 수집 N분 전", 실패 시 §5.2의 경고 배너). 액션: 승인/거절(사유)/수동 확정/충돌 전환/취소.

### 9.8 상태별 UX (Empty · Loading · Error)

- 캘린더 로딩: 셀 스켈레톤(motion-reduce 대응 — 탐색 스켈레톤 전례).
- `stale=true`: 기존 `FacilityUpdateBanner` 재사용("최신 캐시 데이터 표시 중").
- 빈 상태: 신청 내역 0건("아직 신청한 예약이 없어요" + 예약 홈 CTA), 관리자 큐 0건("대기 중인 신청이 없습니다").
- 오프라인/타임아웃: 기존 네트워크 내성 스택(fail-fast·재시도 버튼) 그대로.
- 신청 실패(마감 경합): "방금 다른 예약이 확정되어 신청할 수 없습니다" + 가용성 재조회.

### 9.9 애니메이션

- 시트 등장: 기존 `sheet.tsx`(Radix) slide-up 그대로. 데스크탑 패널: CalendarPage 슬라이드-인 전례.
- 슬롯 선택: 배경색 전환만(DESIGN.md — transform/opacity·색 전환만, 무한 애니메이션 금지). 범위 확장 시 `transition-colors`.
- 상태 스텝퍼 진입: 기존 FadeIn(스크롤 리빌) — above-the-fold에는 미적용(PR #635 원칙).
- 페이지 전환: 기존 View Transitions 유지, 시트는 라우트가 아니라 상태라 VT와 무관.
- `prefers-reduced-motion`: 전역 MotionConfig + motion-reduce 유틸 일관 적용.

### 9.10 반응형

- 데스크탑(md+): 좌 캘린더 + 우 상주 패널(주간 기본) 2컬럼. 태블릿은 md+ 레이아웃 축소(기존 컨벤션 — md 단일 분기).
- 모바일(<md): 캘린더 풀폭 + Bottom Sheet. 입력 16px 하한·터치 타깃 ≥44px(DESIGN.md Form 규격).

---

## 10. 캐싱 전략

| 대상 | 정책 | 근거 |
|---|---|---|
| `GET .../availability` | **`Cache-Control: no-store`** | PENDING_HOLD·BLOCKED가 신청/승인 직후 즉시 반영돼야 함. 기존 60s public 캐시를 쓰면 신청 직후 자기 신청이 안 보이는 혼란. 서버 부담은 크롤 캐시(DB) 조회라 경미 |
| 기존 usage/상세 GET | `public, max-age=60` 유지 | 변경 없음(조회 전용 소비처) |
| FE React Query | availability는 신청 성공·취소 시 `invalidateQueries`, staleTime 짧게(30s) | 슬롯 상태 신선도 |
| 크롤 TTL | 기존 그대로(당월·익월 10분 / 그 외 24h) | 변경 없음 |

---

## 11. 기존 기능 정리 (유지 / 대체 / 제거)

| 기능 | 처분 | 단계 |
|---|---|---|
| 크롤러·파서·스냅샷·온디맨드 인프라 전체 | **유지**(무변경) | — |
| `GET /facilities`, `/facilities/usage`, `/facilities/{id}` API | **유지**(오늘 현황 섹션·기존 소비처) | — |
| `/facilities` 목록 페이지(Overview 타임라인) | **대체** — 예약 홈으로 전면 교체, Overview는 접이식 "오늘 현황" 섹션으로 강등 | P1 |
| `/facilities/[facilityId]` 상세(월 칩 + 가로 타임라인) | **대체** — 예약 홈으로 redirect. 과거 월 열람 기능은 소멸(P3에서 필요성 재검토) | P1 |
| `FacilityUsageGuide`(이메일 신청 안내) | **교체** — 인앱 신청이 생기는 순간 오도성 안내가 되므로 P1에서 시설 이용 수칙만 남기고 이메일 신청 문구 제거 | P1 |
| `FacilityUpdateBanner`, 상태점, 시간축 계산 lib | **유지·재사용** | — |
| 기존 시설 테스트 6종 | Overview·배너 관련은 수정 유지, 구 상세 타임라인 스펙은 새 UI 스펙으로 대체 | P1 |

---

## 12. 릴리스 계획

사용자 합의된 P1/P2/P3. 각 P는 여러 PR로 쪼갠다(1브랜치 1PR 원칙 — 백엔드 API 단위/프론트 페이지 단위).

**P1 (MVP)**
1. BE: 스키마(V8x·V8y·V8z) + 엔티티 + 신청·취소 API + 가용성 API + 목적 Preset GET
2. BE: 관리자 승인·거절·수동확정·충돌·취소 API(재검증 포함) + 매칭 잡(자동 CONFIRMED)
3. FE: 예약 홈(칩 + 월간 캘린더 + Day View 시트/패널 + 주간 토글 + 신청 폼)
4. FE: 동아리 예약 관리 페이지 + 관리자 승인 큐
5. 기존 화면 교체·redirect·안내 문구 정리

**P2** — 인앱 알림(§7.6), 자동 CONFLICT·겹침 PENDING 자동 거절, 예약 정책 설정화(시설별 운영시간·최대 시간·리드타임 + 동아리별 제한을 관리자 설정값으로 — §3.3 `BookingPolicyValidator` 내부 교체), 동아리별 학교 표기명 매핑, 관리자 메모, 목적 Preset 관리자 CRUD(§6.3), HOLD UI 고도화(대기 순번 등)

**P3** — 기존 조회 잔재 정리(과거 월 열람 재검토 포함), UX·애니메이션 폴리시, 반복 예약·블랙아웃 기간·관리자 직접 예약, 동아리발 취소 요청 플로우

**배포 순서 주의**: `btree_gist` 확장 생성 마이그레이션은 Supabase 권한 확인을 개발 DB에서 선행한다(MCP supabase = 개발 DB). 매칭 잡 env(`DUING_FACILITY_BOOKING_MATCHING_ENABLED`)는 prod 기본 true — 배포 체크리스트에 명시.

---

## 13. 장애 · 엣지 전략 (Fail-safe)

| 상황 | 대응 |
|---|---|
| 크롤 장기 실패 | 가용성은 STALE_CACHE + `stale=true` 배너(기존). 승인은 §5.2 경고 후 관리자 판단. 매칭 잡은 SUCCESS 월만 처리하므로 오판 없음 — CONFIRMED 전환만 지연(무해) |
| 학교 표기 ≠ 두잉 동아리명 | 자동 CONFIRMED 불발 → APPROVED 유지 + 관리자 수동 확정. P2에서 표기명 매핑 |
| 학교가 승인 건을 다른 시간으로 등록 | 같은 이름 부분/불일치 겹침 → "부분 반영" 플래그, 관리자 판단 |
| 관리자 이중 승인(같은 신청 더블클릭) | 조건부 전이 → 두 번째 409 |
| 겹치는 두 신청 동시 승인(관리자 2명) | 시설 행 잠금 직렬화 + EXCLUDE 백스톱 |
| 승인 도중 신청자 취소 | 조건부 전이 경합 — 한쪽만 성공 |
| 신청 남용 | 동아리당 활성 10건 상한 + 승인 게이트. 정교한 정책은 P2 |
| 시설 아카이브(학교 목록에서 소멸) | 신청 생성 시 `archived_at IS NULL` 검증. 기존 활성 Booking은 유지하고 관리자 큐에 시설 아카이브 표시 |

---

## 14. 테스트 전략

- **상태 머신 단위**: 모든 허용/차단 전이(도메인 메서드), CONFIRMED 터미널 불변식.
- **가용성 계산**: 점유행/운영행/빈 날/PENDING_HOLD/과거 슬롯 조합 픽스처(운영행이 막지 않는 것 필수 검증).
- **승인 동시성(실스레드)**: `ExecutorService` + latch — 겹치는 두 신청 동시 승인 → 정확히 1건 APPROVED(기존 동시성 테스트 전례, 잠금 도입 시 기본 포함).
- **EXCLUDE 제약(실 PG)**: 잠금 우회 상황에서 제약 위반 롤백 검증(Testcontainers/통합).
- **매칭 잡**: 정확 매칭 CONFIRMED / 표기 불일치 미전환 / PARTIAL 월 스킵 / 멱등(2회 실행 동일 결과).
- **승인 재검증**: 크롤 점유행 겹침 409, stale 스냅샷 경고 경로(재크롤 실패 모킹).
- **권한**: canManageClub(멤버·비멤버 403), ADMIN 백스톱.
- **날짜**: 하드코딩 미래 절대날짜 금지(CI timebomb) — `Clock` 주입·상대 날짜.
- **FE**: 슬롯 범위 선택 로직(연속성·재시작), 캘린더 셀 상태, 시트 플로우(jsdom), 신청 경고 분기. 시트·캘린더 인터랙션은 실브라우저 QA 필수(jsdom이 못 잡는 포인터 이슈 전례).

---

## 15. Out of Scope

- 반복 예약, 블랙아웃 기간, 관리자 직접 예약(P3 확장 구조만 고려)
- 이메일·푸시 알림(메일 인프라 제거됨 — 인앱만)
- 학교 시스템에 예약을 **쓰는** 자동화(등록은 총동연 오프라인 절차 유지)
- 총동연 전용 Role 분리(ADMIN 재사용, URL·서비스 경계만 분리 가능하게)
- 시설 이미지·부가 정보, 결제/사용료
- 멀티 인스턴스 잡 락(단일 인스턴스 전제, 선행 스펙 TODO에 편승)
- 크롤 인프라 변경(수집 주기·범위·파서)

---

## 16. 확정 결정 기록 · 열린 결정 포인트

**확정(사용자 합의)**
1. 운영행(꼬리)은 신청을 막지 않는다. 빈 날짜 = 종일 신청 가능.
2. 신청 주체 = 동아리(LEADER/OFFICER, canManageClub 재사용). 무소속·일반 멤버 불가.
3. 관리자 = 기존 ADMIN Role + `/admin` 콘솔. 총동연 Role 분리는 확장성만 확보.
4. PENDING → APPROVED(총동연) → 크롤 확인 → CONFIRMED 2단계 검증. CONFIRMED = 완전 불변.
5. APPROVED 미반영 자동 취소 없음 — "학교 반영 대기 D+N" 표시.
6. 승인 재검증: 재크롤은 트랜잭션 밖, 실패 시 경고 후 관리자 판단.
7. Hard Block 없음: PENDING 겹침 허용 + 경고 + 승인 시 정리.
8. 릴리스 P1/P2/P3 분할, 알림은 인앱 전용.
9. 크롤 행 판별(운영행/점유행)은 `FacilityAvailabilityPolicy`로 추상화 — 컬럼 구조 의존은 정책 내부에만 격리(§3.1 0단계).
10. 상태별 권한 매트릭스(§4.3) — PENDING만 신청자 취소 가능, APPROVED는 관리자만 취소, CONFIRMED는 누구도 불가.
11. 자동 CONFIRMED 정확 매칭은 P1의 보수적 초기 정책 — 매칭 판정은 교체 가능한 정책으로 캡슐화(§5.3).
12. 신청 규칙 상수(활성 10건 등)는 `BookingPolicyValidator` 뒤에 격리 — P2 설정화 시 호출부 불변(§3.3).

**추가 확정(2026-07-13 스펙 리뷰에서 사용자 확정)**
13. 겹침 자동 처리 = `REJECTED`(자동 사유). CONFLICT는 승인 후 학교 충돌 전용(§4.1) — 관리자 큐 명확성.
14. 시설 전환 = 단일 페이지 + 쿼리 파라미터(§9.1), 기존 `/facilities/[id]`는 redirect.
15. 신청 폼 = 사용 목적(필수) + 사용 인원(선택). 학교 전달 양식 변경에 대비해 필드 추가가 국소적인 구조 유지.
16. 자동 CONFIRMED P1 포함 — 보수적 정확 매칭으로 시작, §5.3 확장 경로 유지.
17. 과거 월 열람은 P1에서 제거(현재 예약·신청 프로세스 우선), 필요 시 P3 재검토.
18. 사용 목적 입력 = **Preset Chip + 자유 입력 하이브리드**(§9.4). Preset 목록은 DB 테이블 + 공개 GET 서빙(하드코딩 금지, §6.3), 관리자 CRUD는 P2.
19. 동아리 목록 API 는 P1 미페이징 — P2 에서 관리자 큐 페이징과 함께 도입(2026-07-13 사용자 확정).
20. 공개 가용성의 `BLOCKED(INTERNAL)` 동아리명 비노출 — `blockedBy` 로만 구분, FE 일반 문구 표시(2026-07-13 사용자 확정, §3.1 개정).
