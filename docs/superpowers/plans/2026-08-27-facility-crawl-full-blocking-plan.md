# 시설 크롤 전면 차단 + 기본 확보 시간 대상 구현 계획 (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 크롤 예약 전 행을 전 구간 차단으로 통일하고, 동아리별 "기본 확보 시간 대상" 플래그로 BASIC_SECURED_TIME 분류를 조회 시점 파생하며, 총동연 어드민 토글·크롤 현황(그룹 3모드)·감사를 붙인다.

**Architecture:** 판별 단일 지점(`FacilityAvailabilityPolicy`)의 분류 규칙 교체 + 파서의 구분자 의미론 제거. 차단은 분류와 완전 분리(fail-closed). 분류는 저장하지 않고 파생(플래그 변경 즉시 반영·오염 불가). 플래그는 `club` 컬럼 + `club_audit_event` 감사. 크롤 현황은 월 범위 메모리 로드 후 그룹 단위 페이징(실측 월 84~501행).

**Tech Stack:** Spring Boot 3.4/Java 21, Flyway(V116), Next.js 15/React 19, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-08-27-facility-crawl-full-blocking-design.md` (v2 최종안)

## Global Constraints

- 특정 시설명·동아리명·행사명 하드코딩 금지. 시크릿 하드코딩 금지.
- Flyway 기존 파일 수정 금지 — V116 신규만. 신규 테이블 없음. `reserved_*` 컬럼은 DB 에 남긴다(엔티티 매핑만 제거).
- 차단 판정(`blockingOverlapping`)은 분류·플래그와 독립 — 어떤 task 도 BLOCKED→AVAILABLE 회귀를 만들지 않는다.
- FE: `any`/`as` 금지, 서버 상태 TanStack Query, `packages/api` 경유. 슬롯 선택 가능은 `status === 'AVAILABLE'` 만, 미지 `blockedBy` 도 BLOCKED 표시 유지.
- 커밋: Conventional Commits 한국어, attribution 라인 금지. task 마다 fable fork 리뷰(스펙 준수+품질) 후 진행.

---

### Task 1: 크롤 파서 — 꼬리 전 구간 확장 통일 (BE, 파서 동작만)

> 리뷰 P0 반영: 시그니처는 불변으로 두고 파서 동작만 바꾼다. reserved 가 null 이면 기존 `classify()` 가
> 자동으로 OCCUPIED 를 돌려주므로 "전부 차단"이 이 task 에서 이미 성립하고 컴파일 파손이 0이다.
> `ParsedReservation`/`FacilityReservation` 의 reserved 필드·시그니처 물리 제거는 소비처 전체가
> 어차피 수정 대상인 Task 3 으로 이관.

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facility/parser/ReservationParser.java`
- Modify: `backend/src/main/java/com/duing/domain/facility/parser/ParsedReservation.java` (javadoc 만 — 필드 불변)
- Test: `ReservationParserTest`

**Interfaces:**
- Produces: `ParsedReservation` 7필드 유지, 단 `reservedStartTime`/`reservedEndTime` 는 **항상 null**.

- [x] **파서 테스트 갱신**: 물결 케이스(`고정관념(9:00~20:00)`)를 "start/end 가 9:00/20:00 으로 확장 + reserved 는 null"로 수정, 하이픈·역전·형식 이상·꼬리 없음 케이스 유지. 파서 핵심 diff:

```java
if (trailingTime.find()) {
    TailRange tailRange = parseTailRange(trailingTime.group(1), trailingTime.group(2));
    if (tailRange != TailRange.NONE) {
        // 구분자 무관: 꼬리 범위 = 실예약 구간. 마커 슬롯 대신 [start, end) 전체로 확장(전 구간 차단).
        // 파싱 실패(역전·형식 이상)면 확장 없이 마커 슬롯 유지 — 임의 추정 금지.
        start = tailRange.start();
        end = tailRange.end();
    }
}
String organization = trailingTime.replaceAll("").trim();
return new ParsedReservation(scheduleSeq, reservationDate, start, end, organization, null, null);
```

- [x] **Commit**: `refactor(backend): 시설 크롤 꼬리 시간표기 전 구간 확장 통일 — 구분자 의미론 제거`
- [x] fork 리뷰 → 반영.

### Task 2: 동아리 플래그 + 감사 스키마 (BE)

**Files:**
- Create: `backend/src/main/resources/db/migration/V116__club_facility_secured_time_target.sql`
- Modify: `backend/src/main/java/com/duing/domain/club/entity/Club.java`
- Modify: `backend/src/main/java/com/duing/domain/clubaudit/entity/ClubAuditEventType.java`
- Modify: `backend/src/main/java/com/duing/domain/clubaudit/entity/ClubAuditEvent.java`
- Modify: `backend/src/main/java/com/duing/domain/club/repository/ClubRepository.java`

**Interfaces:**
- Produces: `Club.isFacilitySecuredTimeTarget()` / `changeFacilitySecuredTimeTarget(boolean)`; `ClubRepository.findSecuredTargetNameRows(): List<ClubSecuredNameProjection>`(전 동아리 name+플래그 — 충돌 판정용, `interface ClubSecuredNameProjection { String getName(); boolean isFacilitySecuredTimeTarget(); }`); `ClubAuditEvent.securedTargetChanged(Long clubId, Long actorUserId, String detail)` + `ClubAuditEventType.SECURED_TARGET_CHANGED`.

- [x] **V116**: club 컬럼 + CHECK 재작성(V105 의 23종 목록 복사 + `SECURED_TARGET_CHANGED`):

```sql
-- 동아리별 "기본 확보 시간 대상" 플래그(기본 OFF). 시간 값이 아니라 분류 정책 — 크롤 실범위를 그대로 쓴다.
ALTER TABLE club ADD COLUMN facility_secured_time_target BOOLEAN NOT NULL DEFAULT false;

-- 이벤트 종류를 늘릴 때는 CHECK 도 함께 갱신한다(V102 절차 주석, V104·V105 선례).
ALTER TABLE club_audit_event DROP CONSTRAINT club_audit_event_event_type_check;
ALTER TABLE club_audit_event ADD CONSTRAINT club_audit_event_event_type_check CHECK (event_type IN (
    'JOIN_LINK_CREATED', 'JOIN_LINK_REGENERATED', 'JOIN_LINK_REVOKED',
    'JOIN_REQUEST_CREATED', 'JOIN_REQUEST_APPROVED', 'JOIN_REQUEST_REJECTED',
    'RECRUITMENT_FORCE_CLOSED', 'APPLICATION_VIEWED',
    'FEE_POLICY_CREATED', 'FEE_POLICY_UPDATED', 'FEE_POLICY_DELETED',
    'FEE_BILL_ISSUED', 'FEE_BILL_CANCELLED',
    'FEE_PAYMENT_RECORDED', 'FEE_PAYMENT_VOIDED',
    'FEE_TX_MANUAL_MATCHED', 'FEE_TX_IGNORED', 'FEE_TX_UNMATCHED',
    'FEE_ACCOUNT_REGISTERED', 'FEE_ACCOUNT_UPDATED', 'FEE_ACCOUNT_DELETED',
    'FEE_ADMIN_DETAIL_VIEWED', 'FEE_ADMIN_CSV_DOWNLOADED',
    'SECURED_TARGET_CHANGED'));
```

- [x] 엔티티·프로젝션·감사 팩토리(detail 은 `AuditDetailJson` 헬퍼로 `{"before":..,"after":..}`). 통합 테스트 기동으로 마이그레이션 적용 검증.
- [x] **Commit**: `feat(backend): 동아리 기본 확보 시간 대상 플래그·감사 이벤트 스키마 (V116)`
- [x] fork 리뷰 → 반영.

### Task 3: 분류 정책 전환 — 전부 차단 + secured 파생 (BE)

**Files:**
- Modify: `CrawlRowType.java`(값 `CRAWLED_RESERVATION`/`BASIC_SECURED_TIME`), `FacilityAvailabilityPolicy.java`, `FacilitySlotAssembler.java`, `FacilityAvailabilityResponse.java`(`SlotBlockSource.BASIC_SECURED`)
- Modify: `ParsedReservation.java`(5필드로), `FacilityReservation.java`(reserved 매핑·비교 제거), `FacilitySnapshotWriter.java`, `GeneralFacilityUsageService.java`(`mergeWithOperatingHoursPrecedence` 제거 → SlotMerger 단일) — Task 1 에서 이관(리뷰 P0)
- Modify: `GeneralFacilityAvailabilityService.java`, `GeneralFacilityBookingService.java`, `GeneralFacilityBookingAdminService.java`, `FacilityBookingAdminQueryService.java`
- Modify: `FacilityBookingMatchingService.java`, `FacilityBookingMatchingScheduler.java`
- Test: `FacilityAvailabilityPolicyTest`, `FacilitySlotAssemblerTest`, `FacilityBookingMatchingServiceTest`, `FacilityBookingServiceIntegrationTest`, `FacilityAvailabilityAcceptanceTest`, `FacilityBookingMatchingSchedulerIntegrationTest`, `FacilityCrawlDiffIntegrationTest`(재크롤 2회 분류 불변 케이스 추가)
- Test(리뷰 P1 — reserved/7필드/OPERATING/verifyAndConfirm 소비처): `FacilityBookingMatchingFailureIsolationTest`, `FacilityBookingNotificationIntegrationTest`, `FacilityBookingAdminQueryIntegrationTest`, `FacilityBookingAdminServiceIntegrationTest`, `AdminFacilityBookingAcceptanceTest`, `SlotMergerTest`, `FacilityCrawlTruncationIntegrationTest`, `FacilityUsageServiceTest`, `FacilityOnDemandCrawlIntegrationTest`, `FacilityUsageAcceptanceTest`

**Interfaces:**
- Produces: `policy.securedOrganizationKeys(): Set<String>`, `policy.classify(FacilityReservation, Set<String>): CrawlRowType`, `policy.blockingOverlapping(rows, date, start, end): Stream<FacilityReservation>`(분류 필터 없음), `matchingService.verifyAndConfirm(Long bookingId, String clubName, Set<String> ambiguousNormalizedKeys, Set<String> securedOrganizationKeys)`.
- `CrawlSlice(date, start, end, organization, type)` — operating 필드 제거. `operatingNotes` 는 `List.of()` 발행.

- [x] **정책 TDD**: 플래그 ON 정확 일치→BASIC_SECURED_TIME / OFF·미등록·기관·충돌→CRAWLED_RESERVATION / `blockingOverlapping` 은 두 분류 모두 통과. 추가(리뷰 P2 — 스펙 §5 명시 배정): ① ON 상태에서 크롤 시간이 바뀐 행 → 바뀐 실범위로 분류·차단 ② 동일 행 고정 + securedKeys 만 교체(플래그 토글 시뮬레이션) → 재크롤 없이 분류 즉시 반전. 핵심:

```java
public Set<String> securedOrganizationKeys() {
    List<ClubRepository.ClubSecuredNameProjection> rows = clubRepository.findSecuredTargetNameRows();
    Map<String, Long> keyCounts = rows.stream()
            .collect(Collectors.groupingBy(row -> normalizer.normalize(row.getName()), Collectors.counting()));
    return rows.stream()
            .filter(ClubRepository.ClubSecuredNameProjection::isFacilitySecuredTimeTarget)
            .map(row -> normalizer.normalize(row.getName()))
            .filter(key -> !key.isEmpty() && keyCounts.get(key) == 1) // 정규화 키 충돌 시 매칭 포기(P5)
            .collect(Collectors.toUnmodifiableSet());
}
```

- [x] **조립기**: 전 crawl slice 차단, 같은 슬롯 겹침 시 CRAWLED 우선 표기, `SlotBlockSource.BASIC_SECURED` + organization 노출. 경계 테스트(09~10 가용/10~17 차단/17~18 가용).
- [x] **호출부**: 가용성 서비스(securedKeys 1회 조회→classify), 신청·승인·어드민 큐(단순 리네임 — 분류 불요).
- [x] **매칭**: `decide` 분류 필터 제거, `verifyAndConfirm` secured 스킵(로그 포함), 스케줄러가 사이클당 1회 `policy.securedOrganizationKeys()` 전달. 테스트: secured 스킵 + availability BLOCKED 유지, OFF 물결 행 확정 편입, CRAWLED 기존 동작.
- [x] **Commit**: `feat(backend): 크롤 예약 전면 차단 + 기본 확보 시간 대상 조회 시점 분류`
- [x] fork 리뷰 → 반영.

### Task 4: 어드민 API — 플래그 토글 + 크롤 현황 그룹 조회 (BE)

**Files:**
- Modify: `AdminClubApi.java`, `AdminClubController.java`, `ClubService.java`, `GeneralClubService.java`, `AdminClubSummaryResponse.java`, `AdminClubSummaryQuery` + `ClubRepositoryImpl.java`(L176 생성자 프로젝션 — 리뷰 P2 파일명 명기)
- Create: `club/controller/dto/request/UpdateClubFacilitySecuredTimeTargetRequest.java`, `club/service/dto/command/UpdateClubFacilitySecuredTimeTargetCommand.java`
- Create: `facilitybooking/api/AdminFacilityCrawlApi.java`, `controller/AdminFacilityCrawlController.java`, `service/FacilityCrawlAdminQueryService.java`, 응답 DTO(`AdminCrawlReservationGroupResponse` + leaf)
- Modify: `FacilityReservationRepository` — 시설 무필터 월 조회가 없으므로(리뷰 P1) 파생 쿼리 `List<FacilityReservation> findByYearMonth(YearMonth yearMonth)` 1개 추가(활성 시설 id 선조회 우회보다 짧음)
- Test: `AdminClubSecuredTargetAcceptanceTest`(401/403/204/감사 1건/no-op 0건/404), `AdminFacilityCrawlAcceptanceTest`(401/403, groupBy 3모드, EXTERNAL 그룹 포함, 그룹 페이징 비분리, 당월·익월 외 400)

**Interfaces:**
- `PATCH /api/v1/admin/clubs/{clubId}/facility-secured-time-target` body `{facilitySecuredTimeTarget: Boolean @NotNull}` → 204. 서비스: 로드→미변경 no-op→변경+`ClubAuditEvent.securedTargetChanged` 저장(단일 tx).
- `GET /api/v1/admin/facility-crawl/reservations?yearMonth&facilityId&groupBy&page&size` → `PageResponse<AdminCrawlReservationGroupResponse>` (스펙 §3.6 형태·순서 규칙). 메모리 그룹핑+`PageImpl` 페이징.

- [x] 플래그 토글(central-club 전례 복제 + actor 전달 + 감사) → 인수 테스트 green.
- [x] 크롤 현황 쿼리 서비스(월 로드→매칭 맵/secured 키→classify→groupBy 별 그룹·정렬·페이징) → 인수 테스트 green.
- [x] **Commit**: `feat(backend): 총동연 기본 확보 대상 토글·크롤 예약 현황 그룹 조회 API`
- [x] fork 리뷰 → 반영.

### Task 5: FE — /facilities 표시 정책 (page 단위)

**Files:**
- Modify: `frontend/packages/types/src/facility.ts`(`BookingSlotBlockSource` + `'BASIC_SECURED'`)
- Modify: `apps/web/app/facilities/_lib/bookingCalendar.ts`(라벨 로직 `slotStatusLabel` 과 선통합, kind 3분기, operating 소비 제거)
- Modify: `_components/booking/WeekTimetable.tsx`, `DaySlotList.tsx`, `DayBookingOverview.tsx`, `BookingViewHeader.tsx`, `WeekBlockSheet.tsx`, `FacilityUsageGuide.tsx`
- Test: `apps/web/test/facilities/booking-calendar-lib.test.ts`, `booking-components.test.tsx`, `facility-booking-page.test.tsx`

- [x] 미지 `blockedBy` fail-closed 테스트(BLOCKED 표시 유지·선택 불가·AVAILABLE fallback 없음) 포함 TDD.
- [x] BASIC_SECURED 블록 = sage 점선 + "기본 확보 시간" 라벨, 선택 불가. 범례·가이드 문구에서 "예약 신청 가능" 제거.
- [x] **Commit**: `feat(frontend): 기본 확보 시간 차단 표시 전환 — 크롤 예약 전면 차단 반영`
- [x] fork 리뷰 → 반영.

### Task 6: FE — 어드민 동아리 토글 + 크롤 현황 페이지

**Files:**
- Modify: `packages/types/src/club.ts`, `packages/types/src/facility.ts`(그룹 응답 타입), `packages/api/src/client.ts`(club admin 메서드 실위치 — 리뷰 P2) + `packages/api/src/domains/admin.ts`(크롤 현황), `packages/hooks/src/admin.ts`(central-club 토글 훅 전례) + `packages/hooks/src/adminQueryKeys.ts` + 신규 `packages/hooks/src/facilityCrawlAdmin.ts`, `packages/hooks/src/index.ts`
- Modify: `apps/web/app/admin/clubs/_components/AdminClubsTable.tsx` + **전례 복제**: `AdminClubCentralClubToggleDialog.tsx`(central-club 토글 다이얼로그 실전례 — 리뷰 P2)
- Create: `apps/web/app/admin/facility-crawl/{page.tsx,_pages/AdminFacilityCrawlPage.tsx,_components/,_lib/crawlGrouping.ts}` + `apps/web/app/admin/_lib/adminSections.ts` 등록
- Test: `apps/web/test/admin/clubs/*`, `apps/web/test/admin/facility-crawl/*`

- [x] 토글: 확인 다이얼로그(ON/OFF 방향별 문구), 성공 시 clubs + `facilityQueryKeys.availabilityAll()` + 크롤 현황 키 무효화.
- [x] 크롤 현황: groupBy 세그먼트(동아리별 기본)·당월/익월·시설 필터·Pagination. `_lib/crawlGrouping.ts` 맥락 접기(동일 [start,end) 연속 일자 병합) 순수 함수 + 테스트(수정 9 그룹핑 4종).
- [x] **Commit**: `feat(frontend): 총동연 기본 확보 대상 토글·크롤 예약 현황 화면`
- [x] fork 리뷰 → 반영.

### Task 7: 전체 검증

- [x] `backend ./gradlew test` 전체 green, `frontend pnpm lint / typecheck / test` green.
- [x] 로컬 BE(bootRun, 크롤러 비활성) + 시드: `facility_month_snapshot` 신선(crawledAt=now)·`facility_reservation` 4행(학생생활상담센터 10:00-17:00 / 헌혈 행사 10:00-15:00 / 장학복지팀 09:00-18:00 / 고정관념 13:00-17:00) + FE :3000.
- [x] Playwright: ① /facilities 각 범위 전 슬롯 선택 불가 + 경계 슬롯 선택 가능 ② 고정관념 플래그 ON → 재크롤 없이 기본 확보 표시 전환·차단 유지 ③ 어드민 토글 확인 다이얼로그·토스트 ④ 크롤 현황 3모드·EXTERNAL 그룹·페이징 ⑤ 시드 정리.
- [x] 릴리스 체크리스트 기록: 배포 후 크롤 1주기 경과 + 물결 행 확장 반영 확인(스펙 §3.8).

## Self-Review

- 스펙 커버리지: P1~P8·수정 1~9 ↔ Task 1(P2)/2(P4·P6 스키마)/3(P1·P3·P5·P7·수정 8)/4(P8·수정 1~4)/5(§3.7·수정 7)/6(P8 UI·수정 9 그룹핑)/7(§5 검증) — 공백 없음.
- 플레이스홀더 없음(핵심 diff·SQL·시그니처 명시, 나머지는 전례 파일 지정).
- 타입 일관성: `securedOrganizationKeys`/`blockingOverlapping`/`facilitySecuredTimeTarget`/`SECURED_TARGET_CHANGED` 명칭이 task 간 동일.
