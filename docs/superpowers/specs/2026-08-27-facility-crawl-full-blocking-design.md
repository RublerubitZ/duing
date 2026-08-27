# 시설 크롤 전면 차단 + 동아리별 기본 확보 시간 대상 설계 (최종안)

- 작성일: 2026-08-27 (v2 — 사용자 수정 1~9 + fork 적대 리뷰 반영)
- 대상: `backend/` (Spring Boot 3.4 / Java 21) + `frontend/apps/web` (Next.js 15)
- 상태: 사용자 정책 확정(메시지 3건 + 증분 수정 9건). 리뷰: fork 적대 리뷰 P0 0건, P1/P2 전건 반영.
- 선행: `2026-07-13-facility-booking-design.md` §3.1(분류 0단계), PR #1057(하이픈 꼬리 확장)

---

## 1. 정책 결정 (사용자 확정 — 불변)

| # | 결정 | 내용 |
|---|---|---|
| P1 | **크롤 예약 = 전부 차단 (fail-closed)** | 학교 크롤 행은 등록 여부·주체 유형(동아리/행사/부서/기관)·꼬리 구분자와 무관하게 겹치는 슬롯을 전부 차단한다. 미등록·미매칭·형식 이상을 이유로 예약 가능 상태로 풀지 않는다. |
| P2 | **꼬리 시간표기 = 전 구간 interval** | `단체명(H:MM~H:MM)`·`단체명(H:MM-H:MM)` 모두 `[start, end)` 하나의 예약 구간으로 확장. `~`/`-` 구분자 의미론(#1057) 폐지. 역전·형식 이상은 확장 없이 마커 슬롯 유지(임의 추정 금지). 꼬리 없는 행은 무변경. |
| P3 | **분류 2종, 둘 다 차단** | `CRAWLED_RESERVATION`(기본값) / `BASIC_SECURED_TIME`(총동연 정책 대상 표시). 차이는 관리·표시 의미뿐, 가용성 효과는 동일(차단). |
| P4 | **분류는 동아리별 플래그에서 파생** | `club.facility_secured_time_target`(기본 false). 크롤 행 단체명이 플래그 ON 동아리와 **정규화 정확 일치**할 때만 BASIC_SECURED_TIME. **시간 값 컬럼(securedStart/End 류)은 만들지 않는다** — 매 크롤 행의 실범위를 그대로 사용(수정 5). |
| P5 | **매칭은 보수적** | 기존 `OrganizationNameNormalizer` 정확 일치 재사용. 부분 문자열 매칭 금지(ABC동아리 ≠ ABC동아리2). 정규화 키가 2개 이상 동아리와 충돌하면 매칭 포기 → CRAWLED_RESERVATION 유지(차단은 그대로). |
| P6 | **플래그 변경 = 총동연 ADMIN 전용 + 감사** | 백엔드 `hasRole('ADMIN')` + `/api/v1/admin/**` URL 백스톱 이중 게이트. 변경 시 actor/target/before/after/createdAt 감사(`club_audit_event` 재사용). |
| P7 | **분류 미저장 + 즉시 파생** | 분류를 크롤 시점에 저장하지 않고 **조회 시점에 파생**(기존 §3.1 0단계 아키텍처). 재크롤이 분류를 초기화할 수 없고, 플래그 변경은 **재크롤 없이 기존 크롤 행에 즉시 반영**되며(수정 6), 데이터 오염이 원천 불가능하다. 동일 예약 식별은 학교 자연키 `schedule_seq`(전역 UNIQUE) 기존 체계 유지. |
| P8 | **어드민 가시성** | ① 동아리 관리 화면에서 동아리별 플래그 ON/OFF. ② 크롤 예약 현황 읽기 전용 화면 — **정리 기준 3종**(§3.6, 수정 1~4). |

## 2. 현재 상태와 root cause

- "10:00-17:00 이 양끝 두 시각만 차단" 문제의 원인은 학교가 시작·끝 마커 슬롯만 내려주는 데이터 형태였고, 하이픈 꼬리는 PR #1057 이 이미 전 구간 확장으로 수정했다.
- **남은 갭**: 물결(`~`) 꼬리는 여전히 `reservedStart/EndTime` 으로 추출되어 `CrawlRowType.OPERATING`(비차단 정보 라벨)이 된다. 즉 `고정관념(9:00~20:00)` 은 현재 아무 슬롯도 막지 않는다. 이번 변경이 이 자동 비차단 경로를 제거한다.
- 판별 단일 지점: `FacilityAvailabilityPolicy.classify()` / `occupiedOverlapping()` — 신청 차단·승인 재검증·충돌의심·부분반영이 전부 이 두 메서드를 경유(소비처 전수 grep 으로 리뷰 검증 완료 — 누락 없음).
- 자동 확정의 실제 의미(수정 8 사전 조사): `decide()` = 정규화 동명 행의 1시간 서브슬롯 닫힌 포함 커버, `verifyAndConfirm()` = 세대 결박(스냅샷 `isFacilitySynced`) 하의 "학교가 이 예약을 반영했다"는 증거 판정. → **증거 의미가 맞으므로 BASIC_SECURED_TIME 은 증거에서 제외한다**(§3.4).

## 3. 설계

### 3.1 크롤 파이프라인 (파서~저장)

- `ReservationParser`: 꼬리 시간표기를 구분자 무관하게 **행 범위 확장**으로 통일. `securedHours`(OperatingHours) 추출 제거. 역전·형식 이상은 마커 유지+꼬리 제거(기존 정책).
- `ParsedReservation`: `reservedStartTime`/`reservedEndTime` 필드 제거(5필드).
- `FacilityReservation`: 두 컬럼 매핑·비교 제거. **DB 컬럼(V72)은 남긴다**(롤백 하한선 보호 — 물리 drop 은 릴리스 안정화 후 후속 마이그레이션).
- `GeneralFacilityUsageService.mergeWithOperatingHoursPrecedence` 제거 → 전 행 `SlotMerger` 병합(확장 행 중복은 기존 겹침 병합이 접는다).

### 3.2 분류 (조회 시점 파생)

```java
public enum CrawlRowType { CRAWLED_RESERVATION, BASIC_SECURED_TIME }

// FacilityAvailabilityPolicy
public Set<String> securedOrganizationKeys()            // 플래그 ON 동아리의 정규화 이름 집합
                                                        // (전체 동아리 대비 정규화 키 충돌 시 제외 — P5)
public CrawlRowType classify(FacilityReservation row, Set<String> securedOrganizationKeys)
public Stream<FacilityReservation> blockingOverlapping( // 구 occupiedOverlapping — 분류 필터 제거,
        Collection<FacilityReservation> rows, ...)      // 크롤 행 전부가 차단 대상 (P1)
```

- `securedOrganizationKeys()` 는 `ClubRepository` 프로젝션(name + 플래그) 1쿼리로 계산. 요청당 1회(동아리 테이블 소규모 — 스케줄러 `findAllNames()` 전례와 동일 비용).
- **차단 판정(`blockingOverlapping`)은 분류와 무관** — 분류·플래그 조회가 어떻게 되든 차단이 풀릴 수 없는 구조(수정 8 독립성 요건).

### 3.3 가용성 응답 + FE 안전 규칙

- `FacilitySlotAssembler`: 크롤 slice 전부 차단. 겹침 시 표시 우선순위 `PAST → BLOCKED(INTERNAL) → BLOCKED(SCHOOL=CRAWLED) → BLOCKED(BASIC_SECURED) → PENDING_HOLD → AVAILABLE`.
- `SlotBlockSource` 에 `BASIC_SECURED` 추가. organization 은 기존 SCHOOL 관례대로 노출(크롤 단체명은 공개 정보).
- `operatingNotes` 는 **항상 빈 배열**로 유지 발행(응답 계약 유지 — 필드 제거는 후속). **FE 는 operatingNotes 를 예약 가능 판단에 절대 사용하지 않는다**(수정 7).
- **FE fail-closed 규칙(수정 7)**: 슬롯 선택 가능 여부는 `status === 'AVAILABLE'` 명시 판정만 허용한다. `blockedBy` 는 표시 라벨 결정 전용이며, **미지의 blockedBy 값도 BLOCKED 표시를 유지**한다(AVAILABLE 로 fallback 금지). 미지값의 라벨은 INTERNAL 계열('예약됨') 폴백 — 차단 여부에는 영향 없음.

### 3.4 자동 확정 매칭 (수정 8)

- `decide()` 의 OCCUPIED 필터 제거(분류 enum 이 아니라 이름 일치 기준 유지).
- **BASIC_SECURED_TIME 은 자동 확정 증거가 아니다**: `verifyAndConfirm` 에 secured 키 스킵 가드 추가 — 플래그 ON 동아리는 정의상 이름 일치 행 전부가 BASIC_SECURED_TIME 이므로 동아리 단위 스킵 ≡ 행 단위 증거 제외. 수동 확정 폴백(보수 방향).
- 플래그 OFF 등록 동아리의 물결 꼬리 행은 이제 차단 행이 되어 자동 확정 후보에 정상 편입(기존에는 OPERATING 이라 누락 — 사실상 버그 수정).
- **차단과 독립**: 자동 확정 변경은 `blockingOverlapping` 경로에 손대지 않는다 — BLOCKED → AVAILABLE 회귀 불가.
- 관리자 칩 영향(리뷰 P2): 구 OPERATING 행이 차단 행이 되면서 `conflictSuspected`(불일치 겹침)에 새로 잡힌다(의도 — 실제로 학교 측을 막는 행). 플래그 ON 동아리의 APPROVED 예약은 `decide` 가 secured 행 커버로 confirmed 를 돌려줘 "부분 반영" 칩이 꺼진 채 자동 확정만 스킵된다 — 관리자는 기존 수동 확정 경로를 쓴다.

### 3.5 동아리 플래그 + 감사

- V116: `ALTER TABLE club ADD COLUMN facility_secured_time_target BOOLEAN NOT NULL DEFAULT false;` + `club_audit_event` CHECK 재작성(기존 23종 + `SECURED_TARGET_CHANGED` — 22자 < length 30, V105 목록과 일치 리뷰 검증 완료).
- `Club.facilitySecuredTimeTarget` + `changeFacilitySecuredTimeTarget(boolean)` (centralClub 전례).
- 감사: `ClubAuditEvent.securedTargetChanged(clubId, actorUserId, detail)` — detail JSONB `{"before":false,"after":true}`. no-op(미변경) 요청은 기록하지 않는다.

### 3.6 어드민 API

**플래그 토글**
- `PATCH /api/v1/admin/clubs/{clubId}/facility-secured-time-target` body `{facilitySecuredTimeTarget: boolean}` → 204 (central-club 전례 + 감사).
- `GET /api/v1/admin/clubs` 응답에 `facilitySecuredTimeTarget` 추가.

**크롤 예약 현황 (수정 1~4)**
- `GET /api/v1/admin/facility-crawl/reservations?yearMonth=&facilityId=&groupBy=CLUB|FACILITY|FACILITY_DATE&page=&size=`
- `yearMonth` 기본 당월, **당월·익월만 허용**(크롤 창 밖 과거 월 잔존 행은 대상 아님 — 리뷰 P2). `groupBy` 기본 `CLUB`(동아리별).
- **페이징 단위 = 그룹**(수정 4 — 같은 주체가 페이지 간 분리되지 않는다). 응답: `PageResponse<AdminCrawlReservationGroupResponse>`
  - group = `{groupType: CLUB|EXTERNAL|FACILITY|FACILITY_DATE, clubId(매칭 시), title, facilitySecuredTimeTarget(CLUB 그룹만), reservations: [...]}`
  - reservation(leaf) = `{reservationId, facilityId, facilityName, organizationName, reservationDate, startTime, endTime, classification, matchedClubId, matchedClubName, crawledAt}`
- **groupBy=CLUB**: 매칭 성공 행은 clubId 로, 미매칭 행(행사·부서·기관·미등록·정규화 충돌)은 **정규화 단체명 키의 별도 EXTERNAL 그룹**으로 — 누락 금지(수정 2). 그룹 순서: 매칭 동아리(이름순) → 외부 주체(이름순). 그룹 내 행 정렬: 시설(sortOrder)→일자→시작시각.
- **groupBy=FACILITY**: 시설 단위 그룹(sortOrder 순), 그룹 내 일자→시작시각.
- **groupBy=FACILITY_DATE**: (시설, 일자) 단위 그룹 — 기존 방식의 평면 열람 순서를 그룹 헤더로 유지.
- **구현 방식(사전 조사 결과)**: 월 범위 행을 메모리 로드 후 그룹핑·그룹 단위 페이징. 근거 — 실측 월당 84~501행·단체 6~32·시설 ≤10(개발 DB), 당월·익월 한정, 어드민 전용. `countConflictSuspected` 전수 계산 전례와 동일 규모 논리. FE 전체 일괄 조회 아님(그룹 페이지 응답).
- **예약 맥락 분리(수정 3)**: 크롤 행에는 purpose 가 없다(사전 조사 — `facility_reservation` 컬럼에 목적 없음, 신규 컬럼 추가 금지 요건 준수). 따라서 맥락 = **(주체, 시설) 내 동일 [start,end) 의 연속 일자 묶음**으로 정의하고, 이 접기는 FE 순수 함수(`_lib`)로 수행한다. 예: `08/28·08/29·08/30 10:00~17:00` → "08/28~08/30 10:00~17:00" 1맥락, `09/10 회의실` 은 별도 맥락.
- 권한: `@PreAuthorize("hasRole('ADMIN')")` + URL 백스톱, 익명 401 / STUDENT 403 인수 테스트.

### 3.7 프론트엔드

- `/facilities`: `blockedBy === 'BASIC_SECURED'` 블록을 기존 기본 확보 시각 언어(sage 점선)로 렌더하되 **차단 상태**로. "예약 신청 가능" 문구·가이드 셀(`isWithinOperating`)·아코디언 등 `operatingNotes` 소비 제거. 현황 카드는 sage 도트+"(기본 확보)" 유지(슬롯에서 파생). 범례 문구 갱신. `DaySlotList.slotStatusLabel` 과 `bookingEntryOf` 의 복제 라벨 로직은 **선통합 후 변경**(리뷰 P2).
- `/admin/clubs`: 테이블에 "기본 확보 대상" 토글(ConfirmDialog + 토스트, 성공 시 clubs·availability·크롤 현황 키 무효화).
- `/admin/facility-crawl`(신설): 정리 기준 3종 세그먼트(동아리별 기본), 당월/익월 전환, 시설 필터, 그룹 카드 + 맥락 접기, Pagination. `adminSections` 등록.

### 3.8 배포·스큐 (리뷰 P1·P2)

- **구 FE + 신 BE**: 미지 `blockedBy=BASIC_SECURED` 를 구 FE 가 INTERNAL 라벨로 강등하나 차단 표시는 유지(안전). `operatingNotes` 빈 배열은 구 FE 무가드 접근과 정합.
- **신 FE + 구 BE**(롤백 창): 구 BE 가 물결 행을 비차단으로 내리면 현행 정책 그대로 보인다 — 신규 회귀 아님.
- **배포 직후 구행 공백 창**: 기존 DB 물결 행의 `start/end` 는 마커 슬롯이라, 배포 후 첫 크롤 diff 반영 전까지(≤10분) 가용성·신청 1차 게이트가 마커 슬롯만 차단한다. 자기치유(크롤 1주기)되고 승인 재검증이 최종 게이트라 수용 — **릴리스 체크리스트에 "배포 후 크롤 1주기 경과 + 물결 행 확장 반영 확인" 명시**.

## 4. Out of Scope

- 크롤 예약 **건별** 수동 분류 전환 UI/API — 2차 메시지("매 예약마다 수동 변경 필요 없다")로 대체됨. 필요 시 후속.
- `reserved_start_time`/`reserved_end_time` 컬럼 물리 drop, `operatingNotes` 응답 필드 제거 — 릴리스 안정화 후 후속 정리.
- 크롤 행 purpose/그룹 컬럼 신설(수정 3 금지), 표기명 매핑·유사도 매칭(P2 기존 유예), 크롤 주기·TTL·diff 저장 구조 변경(무변경).
- `facility_booking`(DUING_BOOKING) 상태·권한·취소 정책 — 무변경.

## 5. 테스트·검증 계획

- **파서**: `~`/`-` 동일 확장, 역전·형식 이상 마커 유지, 단체명 추출, 꼬리 없는 행 무변경.
- **분류**: 플래그 ON 정확 일치=BASIC_SECURED_TIME, OFF/미등록/기관·행사/정규화 키 충돌=CRAWLED_RESERVATION. ON 상태에서 크롤 시간이 바뀌면 바뀐 실범위 사용(수정 9).
- **즉시 파생(수정 6·9)**: 동일 크롤 행 고정 상태에서 플래그 OFF→ON·ON→OFF 각각 재크롤 없이 분류 즉시 변경. **재크롤 유지**: 크롤 2회 수행 통합 테스트로 분류 불변 실증(리뷰 P2 — diff 통합 테스트 스타일).
- **가용성**: `[10:00,17:00)` 전 슬롯 BLOCKED + 경계(09~10, 17~18) 비차단, blockedBy 구분, 두 분류 모두 BLOCKED.
- **신청/승인**: 확장 행과 겹치는 create 거부·approve 409.
- **자동 확정(수정 9)**: secured 동아리 스킵(availability 는 BLOCKED 유지), OFF 동아리 물결 행 확정 편입, CRAWLED 기존 동작 유지.
- **권한**: 익명 401 / STUDENT 403(동아리 운영진 포섭 — 전역 role 은 STUDENT) / ADMIN 성공 — 플래그 변경·크롤 현황 조회.
- **감사**: 변경 시 1건(before/after detail), no-op 0건.
- **그룹핑(수정 9)**: 동일 주체+동일 시설+연속 일자 → 1맥락 / 다른 시설 → 분리 / 비동아리·미매칭 주체 별도 그룹 누락 없음 / 그룹 단위 페이징(주체가 페이지 간 분리 안 됨).
- **FE(수정 9)**: BASIC_SECURED → 차단 표시·선택 불가, 미지 blockedBy → BLOCKED 유지·AVAILABLE fallback 없음.
- **회귀**: 백엔드 전체 `./gradlew test`(예약 생성/취소/availability/상태 이력/권한/기존 크롤 포함), FE `pnpm lint/typecheck/test`.
- **실화면(§18)**: 로컬 BE+FE(:3000) + 시드(학생생활상담센터 10:00-17:00 · 헌혈 행사 10:00-15:00 · 장학복지팀 09:00-18:00 · 고정관념 13:00-17:00)로 /facilities 슬롯 차단(문자열 표시가 아니라 선택 가능 여부), 고정관념 플래그 ON 시 기본 확보 표시 전환·차단 유지, 어드민 토글·크롤 현황 3모드 실동작 Playwright 확인.
