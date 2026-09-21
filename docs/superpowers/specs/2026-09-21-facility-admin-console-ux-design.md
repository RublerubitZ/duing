# 시설 예약 관리자 콘솔 UX 개선 (감사 #2~#25)

작성 2026-09-21. 선행: 시설 예약 관리 개편(`2026-07-14-facility-ux-refresh-design.md`), 제출 배치(`2026-07-19-facility-submission-batch-design.md`), 동아리 중심 보기(#1061~#1065), 크롤 전면 차단 §3.6(`2026-08-27-facility-crawl-full-blocking-design.md`), 오픈일·마감일(`2026-09-05-facility-booking-close-date-design.md`). 자기 반영 행(OWN) 수정은 PR #1227 로 별도 진행 중.

## 0. 요구 (구속)

사용자 결정(2026-09-21):

1. **제출 목록 워크플로(제출 준비 → 제출 대기 → 제출 이력 → 전사 콕핏)는 유지한다.** 스킵해도 되지만 사용을 전제로 손본다. 감사 #9(워크플로 축소·레일 재배치)는 하지 않는다.
2. **감사 항목 #2~#25(24건)를 전부 수정한다.** 항목 번호는 2026-09-21 UX 감사(fork) 번호를 그대로 쓴다. #1·#2·#3 은 같은 원인(기본 기간)이라 한 묶음.
3. 원칙: 1 PR = 페이지/독립 기능 단위(`develop` 기준, squash). 백엔드 변경은 전부 additive(응답 필드 추가·선택 파라미터 추가)로 프론트 배포 순서와 무관하게 안전해야 한다.

## 1. 현재 상태에서 확인한 사실

| 항목 | 사실 |
|---|---|
| 제출 준비 기본 기간 | FE `_lib/submissionPeriod.ts` `currentMonthRange()` = 이번 달 1일~말일. `SubmissionPrepareTab.tsx:27` `MAX_PERIOD_DAYS = 31`, `:83-85` 로 초과 시 `candidatesParams = null`(조회 안 함). BE `GeneralFacilitySubmissionQueryService.java:55` `MAX_PERIOD_DAYS = 31`, `:234-238` `validatePeriod` → `InvalidCandidatePeriodException`(400, 메시지 "조회 기간은 시작일부터 최대 31일까지 선택할 수 있습니다.", `FacilitySubmissionException.java:76`). BE 필터는 `reservation_date BETWEEN` 이라 승인일이 아니라 **예약일** 기준 |
| 스테퍼 건수 | `AdminFacilityBookingsPage.tsx:128,133` 가 `useSubmissionCandidatesQuery(currentMonthRange())` 의 `summary.awaitingCount` 를 '제출 준비' 탭 건수로 씀 — 준비 탭 기본 조회와 같은 키(캐시 공유) |
| 운영 데이터 | prod 승인 이력 25건 중 22건이 승인 시점 기준 다음 달 예약(예약 창 = 오픈일~익월 말일). `facility_submission_batch` 0행 |
| 탭 렌더 | `AdminFacilityBookingsPage.tsx:259-265` 조건부 렌더(`activeTab === 'review' && <BookingManagementTab/>` …) → 탭 전환 = 언마운트. 검토 탭 상태(`BookingManagementTab.tsx:311-323` 상태칩·시설·기간·정렬·페이지·모달), 준비 탭 상태(`SubmissionPrepareTab.tsx:57-67` 기간·검색·뷰·필터·`excludedById`), 크롤 탭(월·정리기준·시설·페이지), 오픈일 초안이 전부 초기화. 탭 자체는 `?tab=` 로 URL 동기화(ClubExplorePage 전례 `useSearchParams`+`router.replace`) |
| 준비 탭 카드↔셀렉트 | `SubmissionSummaryCards.tsx:6` `SummaryFilter = ALL·APPROVED·NEED·SUBMITTED·CONFIRMED`(카드 클릭=토글). `SubmissionPrepareTab.tsx:118-120`(파생)·`:303-316`(UI) 셀렉트는 NEED·SUBMITTED·ALL 3값만 — APPROVED·CONFIRMED 일 때 '전체'로 표시 |
| 준비 탭 카드 숫자 | `:224-230` `counts={candidatesQuery.data.summary}`(서버 기간 집계) vs 목록은 `:86-92` `searchedBookings`(클라 검색어 필터). BE `summarize()`(`:287-297`): approved=`status==APPROVED`, awaiting=`selectable`, submitted=`submitted`, confirmed=`status==CONFIRMED` — 4값은 상호 배타가 아니다(APPROVED ⊇ NEED ∪ SUBMITTED(APPROVED 분)) |
| 준비 탭 기간 오류 | `:83-88` `periodInvalid` 면 `candidatesParams=null` → 카드·목록 사라지고 `:232-236` 경고만 |
| 제출 대기 예약의 배치 링크 | `SubmissionClubGroupList.tsx:116-118` `submissionNo` 평문. `SubmissionCandidateBooking`(BE record·FE 타입)에 batchId 없음. BE `FacilitySubmissionItemRepository.findActiveByBookingIdIn` 프로젝션 = `bookingId, submissionNo`(JOIN batch 이미 함) |
| 콕핏 | `TranscribeCockpitPage.tsx` 우측 목록 `:274-276` `clubName + startTime` 만(배치=동아리 단위라 전 행 동명, 날짜 없음). 제목 `:74` 고정 "제출 정보 보기"(`:65` 는 backHref). CSV·완료 처리 액션 없음(뒤로가기 `tab=ready` 만). `useTranscribeProgress` 는 sessionStorage + try/catch 관례 |
| 배치 상세 뒤로가기 | `SubmissionBatchDetailPage.tsx:41` `BATCH_LIST_ROUTE = ?tab=archive` 고정, `:138`·`:150` 링크·`:118` 취소 후 replace 도 동일 |
| 제출 대기 탭 진입점 | `SubmissionBatchesTab.tsx:254-268` REVIEWING → `/transcribe` 만, 완료·취소 → `/submission/{id}` 상세만. 검색·필터 없음(`:38 PAGE_SIZE=10`, `:62` `{page,size,status}`). CSV `:242-251` 뮤테이션 1개 공유, disabled 전역·스피너는 해당 행만 |
| 배치 검색 BE | `AdminFacilitySubmissionApi.getBatches(status, pageable)` 만. `SubmissionBatchSearchCondition(status)`, `FacilitySubmissionBatchRepositoryImpl.search` QueryDSL(`statusMatches`). 엔티티 컬럼: `submissionNo(20)`, `clubId`, `facilityId`, `submittedById`, `submittedAt`, `memo(500)`, `cancelledAt`, `completedAt` |
| 크롤 탭 | `FacilityCrawlTab.tsx` 월 옵션 `[currentMonth, nextYearMonth]` 2개(`:56`), 자체 footer 페이징(`:146-169`), 시설 셀렉트 `useFacilityListQuery`(공개 `GET /facilities`). BE `FacilityCrawlAdminQueryService.getReservations(yearMonth, facilityId, groupBy, pageable)` — 당월·익월 외 `MonthOutOfBookingRangeException`(`:60-62`), 전 행 메모리 그룹핑 후 `subList` 페이징(`:98-100`). 검색 파라미터 없음. 직전 월 행: `FacilityReservation` 은 diff 삭제만(`FacilitySnapshotWriter:87`) 있고 월 단위 purge 없음 → 직전 월 행 보관됨. 동아리 측 가용성 `GeneralFacilityAvailabilityService:64-74` 는 이미 직전 월 열람 허용(재크롤 없음) |
| 시설 셀렉트 3종 | 검토 `useFacilityUsageQuery()`(`GET /facilities/usage`, 월 사용량 응답 안의 `facilities[]`), 크롤 `useFacilityListQuery()`(`GET /facilities`), 오픈일 `useAdminFacilitiesQuery()`(`GET /admin/facilities`). BE 3곳 모두 `findByArchivedAtIsNullOrderBySortOrderAsc()` → **아카이브 제외·정렬 동일**. 차이는 페이로드 크기뿐(usage 는 월 크롤까지 조립) |
| 오픈일 탭 | `FacilityOpenDateTab.tsx:321` 전체 적용 다이얼로그 `before='여러 값'`. `:228-231` 현재 창 셀 `"2026-09-20 ~"`(마감 없음). `windowLabel` `:43-46`, `AdminFacility.bookingCloseDate` null = 익월 말일까지 |
| 시간표 | `SubmissionTimetable.tsx:80-84` selectable 블록 클릭=선택 토글, `:102-111` 상세는 `group-hover` CSS 툴팁(터치 불가). 비-selectable 은 `onShowDetail`(Sheet). `SubmissionDetailSheet` 재사용 가능(우측 Sheet) |
| PurposeNote | `PurposeNote.tsx` 정적, 항상 노출. localStorage 관례: `app/_lib/infoMenu.ts`·`authBoot.ts` 등 try/catch 감쌈 |
| 테스트 | FE `test/admin/facility-bookings/{admin-bookings-page,facility-crawl-tab,facility-open-date-tab,…}.test.tsx`, `test/admin/facility-submission/{submission-prepare-tab,submission-batches-tab,submission-batch-detail,transcribe-cockpit,submission-timetable,submission-club-group-list,…}`. BE `facilitysubmission/{controller/AdminFacilitySubmissionAcceptanceTest, service/GeneralFacilitySubmissionQueryServiceIntegrationTest(31일 검증 테스트 :180·:194), repository/…}`, `facilitybooking/{controller/AdminFacilityCrawlAcceptanceTest, service/FacilityCrawlAdminQueryServiceTest(Mockito)}` |

## 2. 설계

### 2.1 백엔드 (PR-A, 전부 additive)

**A1. 후보 조회 기간 상한 31 → 62일 (#3)**
- `GeneralFacilitySubmissionQueryService.MAX_PERIOD_DAYS = 62`, `InvalidCandidatePeriodException` 메시지 "…최대 62일…".
- 수용 기준: 62일 조회 200, 63일 400, 역순 400. 기존 테스트(:180, :194)의 경계값을 62/63 으로 갱신.

**A2. 후보 예약에 활성 배치 id 노출 (#11)**
- `ActiveSubmissionProjection` 에 `getBatchId()` 추가(JPQL `b.id AS batchId`). `SubmissionCandidateBooking` 에 `Long submissionBatchId`(submitted=false 면 null), `SubmissionCandidatesResponse.Booking` 에 `Long submissionBatchId`(`@JsonInclude(NON_NULL)` 불필요 — null 그대로).
- 수용 기준: 활성 배치 소속 예약은 `submissionBatchId == batch.id`, 취소 배치 소속·미제출은 null.

**A3. 배치 목록 검색 (#15)**
- `SubmissionBatchSearchCondition(status, q, submittedFrom, submittedTo)`. `q`: `submissionNo`·`memo`·**동아리명** 부분 일치(대소문자 무시, trim, 빈 문자열=무필터). 동아리명은 배치에 `club_id` 가 직접 있으므로(`FacilitySubmissionBatch.java:29-30`) QueryDSL 서브쿼리 `clubId.in(select club.id from Club where name containsIgnoreCase q)` 한 조각으로 조인 없이 처리한다.
- `submittedFrom/To`(LocalDate, 한쪽만 와도 됨). `submittedAt` 은 `LocalDateTime.now(seoulClock)` 벽시계(`GeneralFacilitySubmissionService.java:75`, `TimeConfig` Asia/Seoul)라 비교는 `submittedAt >= from.atStartOfDay()` · `submittedAt < to.plusDays(1).atStartOfDay()`(상한 배타)로 한다.
- API: `GET /admin/facility-bookings/submission?status=&q=&submittedFrom=&submittedTo=`(`@DateTimeFormat(iso = DATE)`).
- 수용 기준: q="MEMO" 로 메모 매치 1건, q=제출번호 일부로 매치, q=동아리명 일부로 매치, from/to 로 범위 밖 제외(to 당일 23:59 포함·다음날 00:00 제외). 날짜 파싱 실패의 응답 코드는 기존 처리기 관례를 따르며 수용 기준에 넣지 않는다.

**A4. 크롤 예약 단체명 검색 (#17)**
- `getReservations(yearMonth, facilityId, groupBy, q, pageable)`. `q` 는 그룹 생성 **후, 페이징 전**에 `title` 부분 일치(정규화: `OrganizationNameNormalizer.normalize` 로 양쪽 정규화 후 contains — 공백·괄호 차이 흡수). 빈/공백 = 무필터. `CLUB`(제목=매칭 동아리명)·`EXTERNAL`(제목=원문 단체명) 보기는 제목이 정규화 contains 로 매치되면 그룹 전체(전 행)를 유지한다. `FACILITY`·`FACILITY_DATE` 그룹은 제목이 시설명이므로 q 는 그룹 안 `reservations[].organizationName` 을 검사해, 매치 행이 있는 그룹만 남기고 그 행만 싣는다. `totalElements` 는 필터 후 `groups.size()`(페이징과 정합).
- 수용 기준(FacilityCrawlAdminQueryServiceTest): CLUB 보기 q="고정" → "고정관념" 그룹만·totalElements=1; FACILITY 보기 q="고정" → 시설 그룹은 유지되되 reservations 는 매치 행만; q="  " → 전체.

**A5. 크롤 예약 직전 월 열람 (#19)**
- `getReservations` 허용 범위를 `currentMonth.minusMonths(1)`~`plusMonths(1)` 로(가용성 서비스 §2.1 과 동일 규칙, 재크롤 없음 — 이 서비스는 원래 재크롤 안 함).
- 수용 기준: 직전 월 200, 2개월 전 400(`MonthOutOfBookingRangeException` 유지).

### 2.2 제출 준비 탭 (PR-B)

**B1. 기본 기간 = 오늘 ~ 다음 달 말일 + 프리셋 (#1·#2·#3)**
- `submissionPeriod.ts`: `defaultSubmissionRange()` = `{ startDate: 오늘, endDate: 다음 달 말일 }`(최대 62일 — 7/1→8/31·12/1→1/31 이 62일로 최대, 9/1 기준 61일). "오늘"은 기존 `toIso`(브라우저 로컬 날짜)가 아니라 레포의 KST 날짜 헬퍼(`kstDateString` 계열, `hooks/datetime`)로 구해 CI(UTC)·해외 접속에서도 달력이 어긋나지 않게 한다. 기존 `currentMonthRange` 도 같은 헬퍼로 통일. `currentMonthRange` 는 프리셋용으로 남기고 `nextMonthRange`, `currentAndNextMonthRange`(이번 달 1일~다음 달 말일, 최대 62일) 추가. 준비 탭 `MAX_PERIOD_DAYS = 62`, 안내 문구 "최대 62일".
- 프리셋 버튼 3개(이번 달 / 다음 달 / 이번+다음 달)를 기간 입력 옆에 둔다. 클릭 = 두 date 입력을 동시에 세팅.
- `AdminFacilityBookingsPage` 스테퍼 건수도 `defaultSubmissionRange()` 로 바꿔 캐시 공유 유지.
- 수용 기준: 진입 즉시 `useSubmissionCandidatesQuery` 가 `{startDate: 오늘, endDate: 다음 달 말일}` 로 호출; 프리셋 클릭 시 인자 변경; 62일 초과 시 조회 안 함 + 안내. 스테퍼 '제출 준비 N건'이 같은 인자로 호출.

**B2. 카드 ↔ 제출 상태 셀렉트 정합 (#7)**
- 셀렉트를 5값(전체 / 승인 완료 / 미제출 예약 / 제출 대기 예약 / 학교 등록 완료)으로 확장해 `SummaryFilter` 와 1:1. `statusFilterValue` 파생 제거.
- 수용 기준: 카드 '학교 등록 완료' 클릭 → 셀렉트 값 `CONFIRMED`; 셀렉트로 '승인 완료' 선택 → 카드 aria-pressed.

**B3. 검색 중 카드 숫자 = 화면 기준 (#8)**
- `keyword !== ''` 이면 카드 counts 를 `searchedBookings` 에서 BE `summarize` 와 같은 4규칙으로 클라 재계산(`summarizeCandidates(bookings)` 를 `submission/_lib/submissionSections.ts` 에 추가). 검색어 없으면 서버 summary 그대로.
- 수용 기준: 검색어 입력 후 카드 4값이 화면 예약 기준으로 줄어든다.

**B4. 카드 관계 표기 (#10)**
- 카드 4장 유지(사용자 결정: 워크플로 유지, 라벨은 v2.2 테스트로 고정됨). 부제만 관계를 드러내게: 승인 완료 "미제출 + 제출 대기(승인 상태)", 미제출 "승인 완료 중 아직 목록에 없는 예약", 제출 대기 "목록에 담겨 학교 제출을 기다림", 학교 등록 완료 "학교 시스템 반영 확인(확정)".
- 수용 기준: 기존 라벨 테스트(`submission-prepare-tab.test.tsx:335`) 유지, 부제 텍스트 갱신.

**B5. 제출 대기 예약 → 배치 링크 (#11)**
- FE 타입 `SubmissionCandidateBooking.submissionBatchId?: number | null`(구응답 결측 허용). `SubmissionClubGroupList` 의 제출번호를 `submissionBatchId` 가 있으면 `<Link href=/admin/facility-bookings/submission/{id}>` 로, 없으면 평문(폴백).
- 수용 기준: batchId 있는 행은 링크 href 가 상세 경로, 없는 행은 평문.

**B6. 기간 오류 시 직전 결과 유지 (#24)**
- `lastValidRange` 를 `useState`(초기값=기본 기간)로 두고, **시작일·종료일 `onChange` 와 프리셋 클릭 핸들러 안에서** 새 값+상대 값으로 `periodDayCount` 를 계산해 유효(1~62일, 역순 아님)할 때만 `setLastValidRange` 를 함께 호출한다(useEffect 없음). `candidatesParams` 는 항상 `lastValidRange` 에서 파생. 카드·목록은 마지막 유효 기간으로 계속 렌더, 경고는 인라인으로 필터 행 아래에 표시.
- 수용 기준: 유효 조회 후 종료일을 시작일 앞으로 바꿔도 목록이 남고 경고가 뜬다(기존 테스트 :372·:383 은 "조회하지 않는다" 단언을 "새 인자로 재조회하지 않는다"로 조정).

### 2.3 제출 대기·이력·상세·콕핏 (PR-C)

**C1. 콕핏 건 목록에 날짜 (#4)** — `:274-276` `startTime` → `MM/DD HH:mm`(`reservationDate.slice(5).replace('-','/')`). 수용: 두 건이 다른 날이면 목록 텍스트가 구분된다.

**C2. 배치 상세 뒤로가기 상태별 (#5)** — `backRoute = deriveBatchStatus(detail.batch)==='REVIEWING' ? ?tab=ready : ?tab=archive`(로딩 전·404 는 archive). 링크 라벨도 "← 제출 대기"/"← 제출 이력". 취소 성공 후 replace 는 archive(취소됐으므로). 수용: REVIEWING 배치 상세의 뒤로가기 href 가 `tab=ready`.

**C3. 콕핏 헤더 액션 (#12)** — 헤더 우측에 `CSV`·`완료 처리` 버튼. `BatchCompleteDialog`·`BatchCompleteResultDialog`(bookingsById 공급)·`useCompleteSubmissionBatchMutation`·`useDownloadSubmissionCsvMutation` 재사용(상세 페이지 핸들러 동일). 완료 성공 시 토스트 후 `?tab=archive` 로 이동. REVIEWING 이 아니면 완료 버튼 숨김. 수용: 전 건 작성 후 헤더 '완료 처리' 클릭 → 다이얼로그 → 뮤테이션 호출.

**C4. 콕핏 제목 (#13)** — `h1` 을 `batchTitle(detail.batch)` + 서브 제출번호(제목≠번호일 때). 데이터 전엔 "제출 정보 보기" 유지. 수용: 메모 있는 배치는 메모가 제목.

**C5. 제출 대기 행에 읽기 전용 상세 진입 (#14)** — REVIEWING 행 액션에 `상세` 링크 추가(기존 '제출 정보 보기' 옆). 수용: REVIEWING 행에 두 링크 모두 존재.

**C6. 배치 목록 검색 (#15)** — 탭 상단 필터 행: 검색 `type=search`(제출번호·메모), 생성일 from/to date 2개. `useSubmissionBatchesQuery` params 에 `q, submittedFrom, submittedTo` 추가(`SubmissionBatchListParams` 확장, API client 쿼리스트링). 검색어는 `useDeferredValue`(React 19 내장)로 지연. 필터 변경 시 page 0. 빈 결과 문구 "조건에 맞는 제출 목록이 없어요"(필터 있을 때) + 초기화 버튼. 수용: 입력 후 훅 인자에 q 포함, 초기화로 제거.

**C7. CSV 비활성 행별 (#16)** — `disabled={csvMutation.isPending && csvMutation.variables?.batchId === batch.batchId}`. 다른 행은 클릭 가능(뮤테이션은 병렬 허용; CSV_DOWNLOADED 감사 중복은 batchId 가 다르므로 문제 없음). 수용: 한 행 pending 중 다른 행 버튼 enabled.

### 2.4 크롤 예약·오픈일 탭 (PR-D)

**D1. 크롤 단체명 검색 (#17)** — 필터 행에 `type=search` "단체명 검색", `useDeferredValue` 로 `q` 전달, 변경 시 page 0. `AdminCrawlReservationParams.q?: string`, API client 쿼리스트링. 수용: 훅 인자에 q, 빈 문자열은 생략.

**D2. 공용 Pagination (#18)** — 자체 footer 를 `<Pagination page totalPages onChange ariaLabel="크롤 예약 페이지" totalElements pageSize>` 로 교체(카드 아래 `px-[18px] pb-4` 검토 탭 관례). "총 N개 그룹" 표기는 Pagination 의 범위 표기(`1–10 / N건`)로 대체. 수용: 기존 crawl 탭 테스트의 이전/다음 단언을 Pagination 접근성 이름으로 갱신.

**D3. 직전 월 옵션 (#19)** — 월 옵션 `[prevYearMonth, currentMonth, nextYearMonth]`, 라벨 "지난 달 (YYYY-MM)". `crawlGrouping.ts` 에 `previousYearMonth` 추가(nextYearMonth 대칭). 타입 주석 "당월·익월만" 갱신. 수용: 버튼 3개, 지난 달 클릭 시 훅 yearMonth 가 직전 월.

**D4. 시설 셀렉트 통일 (#20)** — 세 BE 엔드포인트가 같은 활성 목록·정렬을 돌려주므로 응답 크기가 가장 작은 공개 `useFacilityListQuery()` 로 검토 탭(`BookingManagementTab.tsx:344`)을 교체(크롤 탭과 동일). 오픈일 탭은 오픈일·마감일 필드가 필요해 `useAdminFacilitiesQuery` 유지(정당). `useFacilityUsageQuery` 는 검토 탭에서 제거. 수용: 검토 탭 테스트의 훅 mock 을 `useFacilityListQuery` 로 교체하고 옵션 렌더 확인.

**D5. 전체 적용 확인창 before 요약 (#21)** — `before` 를 `facilities` 로부터 집계: "열림 N · 닫힘 M(마감 지정 K)". `windowSummary(facilities)` 를 탭 파일 안 순수 함수로. 수용: 열림 2·닫힘 1 픽스처에서 before 텍스트 "열림 2 · 닫힘 1".

**D6. 빈 마감일 의미 (#22)** — 현재 창 셀·다이얼로그 `windowLabel` 에서 마감 null 을 "~ 익월 말일까지" 로 렌더(예: `2026-09-20 ~ 익월 말일`). 수용: 마감 null 행 텍스트에 "익월 말일" 포함.

### 2.5 페이지 셸·공통 (PR-E)

**E1. 탭 상태 보존 (#6)** — **방문한 탭은 언마운트하지 않고 `hidden` 으로 유지한다(lazy keep-alive).** `visitedTabs: Set<FacilityOpsTab>` 를 `useState` 로 두고 활성화 시 추가, 렌더는 `visitedTabs.has(tab) && <div hidden={activeTab !== tab} role="tabpanel">…</div>`. 필터·페이지·선택(`excludedById`)·뷰모드·오픈일 초안이 전부 그대로 남는다.
  - URL 쿼리 승격을 택하지 않은 이유: 검토(6개)·준비(5개)·크롤(4개) 상태를 직렬화/파싱하는 코드가 세 탭에 걸치고, `excludedById`(Map<id,date>) 는 URL 에 못 실어 별도 저장이 또 필요하다. keep-alive 는 셸 한 파일 10줄이고 useEffect 금지 규칙과 무관하다.
  - 부작용·대응: hidden 탭의 React Query 는 마운트 상태라 invalidate 시 함께 refetch 된다(탭 5개 × 소량 — 허용). 구체적으로 제출 배치 완료 뮤테이션이 `facilityBookingsAll` 을 invalidate(`hooks/facilitySubmissionAdmin.ts:75`)하면 keep-alive 된 검토 탭 큐가 백그라운드 refetch 되고 페이지 클램프 effect 가 돌지만 결과는 정상(범위 밖 page 만 되돌림). `refetchOnWindowFocus` 기본값이면 hidden 탭도 포커스 시 refetch — 허용. 첫 진입 시엔 활성 탭만 마운트되므로 초기 요청 수 불변. `role="tab"` 의 `aria-controls` 를 패널 id 에 연결.
  - 수용 기준(`admin-bookings-page.test.tsx`): 검토 탭에서 시설 필터 선택 → 크롤 탭 → 검토 탭 복귀 시 셀렉트 값 유지, 크롤 탭 컴포넌트가 hidden 으로 남아 있음(`toBeVisible` false), 미방문 탭은 DOM 에 없음.

**E2. 시간표 터치 상세 (#23)** — selectable 블록에도 상세 진입을 준다. 블록 자체가 `<button>`(`SubmissionTimetable.tsx:76`)이라 버튼 안에 버튼을 넣을 수 없으므로, 래퍼 `div.group.relative`(`:75`)의 **형제**로 우측 상단 absolute 배치한 작은 `상세` 아이콘 버튼을 둔다(`aria-label="{동아리} {시간} 상세"`, 클릭은 `onShowDetail` 만 호출하고 선택 토글은 일어나지 않는다). 호버 툴팁은 유지. 모바일 전용 레이아웃·롱프레스는 하지 않는다(§12 Out of Scope 유지). 수용: selectable 블록에서 상세 버튼 클릭 시 `onShowDetail` 호출·선택 토글 미호출.

**E3. PurposeNote 접기 (#25)** — `PurposeNote` 에 우측 `접기/펼치기` 토글, 상태는 `localStorage['duing:admin:purpose-note:collapsed']`(try/catch — `infoMenu.ts` 관례). 초기 렌더에서 localStorage 를 읽으면 SSR(펼침)과 클라(접힘)가 달라 하이드레이션 경고가 나므로, `useSyncExternalStore`(서버 스냅샷=펼침, 클라 스냅샷=저장값, 토글 시 저장 후 구독자 통지)로 마운트 뒤에 반영한다. 접힌 상태는 한 줄(아이콘 + "화면 안내 보기"). 수용: 토글 후 리렌더에도 접힘 유지(localStorage mock), 저장 실패 시 메모리 상태로 동작, SSR 마크업은 항상 펼침.

## 3. 테스트 전략

| 영역 | 파일 | 추가·수정 |
|---|---|---|
| BE 기간 상한 | `GeneralFacilitySubmissionQueryServiceIntegrationTest` :180·:194 | 경계 62/63 |
| BE batchId | 같은 파일 :95 케이스 | `submissionBatchId` 단언 추가; `AdminFacilitySubmissionAcceptanceTest` 후보 응답 JSON 필드 |
| BE 배치 검색 | `FacilitySubmissionPersistenceIntegrationTest` 또는 `GeneralFacilitySubmissionHistoryQueryIntegrationTest` | q·from/to 3케이스; Acceptance 에 잘못된 날짜 400 |
| BE 크롤 q·직전 월 | `FacilityCrawlAdminQueryServiceTest`(Mockito) + `AdminFacilityCrawlAcceptanceTest` | A4 3케이스, A5 2케이스 |
| FE 준비 탭 | `submission-prepare-tab.test.tsx` | B1(기본 인자·프리셋), B2, B3, B4 부제, B5 링크, B6 |
| FE 셸 | `admin-bookings-page.test.tsx` | B1 스테퍼 인자, E1 keep-alive 3단언, E3 |
| FE 콕핏·상세·대기 | `transcribe-cockpit.test.tsx`, `submission-batch-detail.test.tsx`, `submission-batches-tab.test.tsx`, `submission-club-group-list.test.tsx` | C1~C7 |
| FE 크롤·오픈일 | `facility-crawl-tab.test.tsx`, `facility-open-date-tab.test.tsx` | D1~D6 |
| FE 시간표 | `submission-timetable.test.tsx` | E2 |
| GREEN 조건 | 태스크마다 `pnpm vitest run <폴더>` + `pnpm typecheck` + `pnpm lint`(FE), `./gradlew test --tests …`(BE, Docker 필요). FE 는 훅 시그니처가 바뀌는 공용 컴포넌트가 있으면 web 전체 스위트 1회 |

## 4. PR 분할·순서

| PR | 포함 | 의존 | 브랜치 |
|---|---|---|---|
| PR-A backend | A1 #3 · A2 #11 · A3 #15 · A4 #17 · A5 #19 | 없음(additive) | `feat/facility-admin-console-api` |
| PR-B 제출 준비 | B1(#1·#2·#3) · B2 #7 · B3 #8 · B4 #10 · B5 #11 · B6 #24 | PR-A(62일·batchId) 머지 후 | `fix/facility-submission-prepare-ux` |
| PR-C 대기·이력·상세·콕핏 | C1 #4 · C2 #5 · C3 #12 · C4 #13 · C5 #14 · C6 #15 · C7 #16 | PR-A(검색) 머지 후 | `fix/facility-submission-batches-ux` |
| PR-D 크롤·오픈일 | D1 #17 · D2 #18 · D3 #19 · D4 #20 · D5 #21 · D6 #22 | PR-A(q·직전 월) 머지 후 | `fix/facility-crawl-open-date-ux` |
| PR-E 셸·공통 | E1 #6 · E2 #23 · E3 #25 | 없음(B·C·D 와 파일 충돌 최소 — 셸 `AdminFacilityBookingsPage`, `PurposeNote`, `SubmissionTimetable`) | `fix/facility-admin-shell-ux` |

PR-B~E 는 화면 파일이 겹치지 않아 PR-A 이후 병렬 가능. 겹치는 곳 두 군데: B1 은 `AdminFacilityBookingsPage.tsx`(스테퍼 건수 한 줄)를 만지므로 E1 과 같은 파일, C6·D1 은 둘 다 `packages/api/src/client.ts`·`packages/types`(다른 줄)를 만진다 — 선행 squash 마다 후행이 재병합 1라운드(squash 라운드 규약).

## 5. 롤아웃·롤백

- 백엔드는 응답 필드 추가·선택 파라미터라 구 프론트와 호환. 프론트는 `submissionBatchId?` 결측 허용(fail-open)이라 구 백엔드와도 호환.
- DB 마이그레이션 없음.

## Out of Scope

- #9 제출 워크플로 축소·레일 재배치(사용자 결정: 유지).
- PR #1227(자기 반영 행 OWN·승인 409) 및 승인 직후 즉시 확정(스케줄러 대기 제거).
- 동아리 측 신청 경로가 자기 이름 행에 막힐 때의 문구("학교 예약과 겹침") 개선.
- 시간표 모바일 전용 레이아웃·롱프레스(선행 스펙 §12 Out of Scope 유지). E2 는 상세 버튼 최소안.
- 검토·준비·크롤 필터의 URL 딥링크(E1 keep-alive 로 대체).
- 크롤 예약 2개월 이전 열람·직전 월 재크롤.
- 미확인: `useFacilityUsageQuery` 를 다른 화면이 함께 쓰는지(제거가 아니라 검토 탭 호출만 교체하므로 영향 없음).
