# TIMEZONE.md — 시간 처리 표준

Du-ing 전체(backend/frontend/DB)의 날짜·시간 처리 정책. 2026-07 타임존 정규화 작업에서 확정됐다.

## 정책 요약

| 구분 | 정의 | 모델 | API 표현 | 예 |
|---|---|---|---|---|
| **Event Time** | 이미 발생한 사건의 시각 | (목표) `Instant` / (현재) 저장은 벽시계 유지, **응답 경계에서 Instant 변환** | ISO-8601 UTC `2026-07-20T04:07:00Z` | createdAt, submittedAt, paidAt, handledAt, readAt, lastUsedAt, 토큰 expiresAt |
| **Schedule Time** | "한국에서 몇 시"가 의미인 예정 시각 | `LocalDate` / `LocalTime` / `LocalDateTime` (KST 벽시계) | 오프셋 없는 문자열 `2026-07-20T18:00:00` | 행사 startAt/endAt, 면접 슬롯, 모집 start/endDate, 공지 노출 종료 expiresAt, 시설 예약 date/time |
| **비즈니스 날짜 판정** | 오늘/마감/D-Day 등 | `now(seoulClock)` — **KST 전용** | - | 모집 마감, 회비 연체, 공지 만료 |
| **화면 표시** | 모든 사용자 노출 시각 | `@duing/hooks`의 `formatDateTimeKst` 등 공통 유틸 | Asia/Seoul 고정 | `2026.07.20 13:07` |

**신규 API 절대 규칙: Event Time을 오프셋 없는 문자열(LocalDateTime JSON)로 반환하지 않는다.** 응답 DTO는 `Instant`를 쓰고, 저장 계층이 벽시계(LocalDateTime)라면 `TimeMapper`로 변환해 내보낸다.

## 레이어별 규칙

### Backend
- **JVM 타임존 = UTC** (`backend/Dockerfile`의 `TZ=UTC`로 계약 고정. 로컬 개발기는 KST — 아래 regime 참고).
- `seoulClock`(`global/config/TimeConfig.java`, 유일한 Clock 빈)은 **KST 날짜/시각 "판정" 전용**이다. 마감·오늘·기간 판정에는 `now(seoulClock)`, Event Time "저장"용으로는 새로 쓰지 않는다 (기존 저장 코드는 2단계까지 유지 — 아래 참조).
- 응답 변환은 `global/time/TimeMapper.java`:
  - `systemWallClockToInstant` — JPA 감사 필드(BaseEntity)·무클럭 `LocalDateTime.now()`로 기록된 값 (JVM 존 벽시계)
  - `seoulWallClockToInstant` — `now(seoulClock)`로 기록된 값 (KST 벽시계)
  - **변환 존은 컬럼 타입이 아니라 "그 필드를 기록한 코드"가 결정한다.** 새 필드를 응답에 노출할 때는 writer를 확인하고 아래 대응표에 행을 추가할 것.

### Frontend
- 날짜 표시는 **`@duing/hooks` 공통 유틸만** 사용: `formatDateTimeKst` / `formatDateKst` / `formatTimeKst` / `formatRelativeTime` (+ 특수 포맷은 `kstDateTimeFormatter`, KST 캘린더 연산은 `kstDateString`/`isTodayKst`/`daysUntilKst`).
- 금지: `toLocaleString()`류 직접 호출(timeZone 미지정), 시각 문자열 `slice()`, `getHours()` 등 로컬 게터, 화면별 지역 포맷 함수. Event 필드는 `…Z`라 slice 시 UTC 숫자가 노출된다.
- 파싱 규칙(공통 유틸 내장): 오프셋/Z 있으면 그대로, 없으면 KST 벽시계(`+09:00`)로 간주 — Event(Z)와 Schedule(무오프셋) 모두 자동으로 올바르다.

### DB (현재)
- 컬럼 타입 혼용 상태: 대부분 naive `timestamp`, interview·fee·federation 계열만 `timestamptz`. **1단계에서는 스키마를 건드리지 않았다.** 통일은 2단계(아래).

## 저장 벽시계 실태 (regime)

같은 DB에 세 갈래 벽시계가 공존한다. 응답 변환·2단계 백필의 기준이 되는 사실이다.

- **system** — JPA 감사 필드(전 테이블 created_at/updated_at/deleted_at) + 무클럭 `LocalDateTime.now()` 저장 값. JVM 존 벽시계: **prod=UTC, 로컬 개발=KST** (환경마다 다르지만 `systemDefault()` 변환이 각 환경에서 올바른 절대시각을 복원).
- **seoul** — `now(seoulClock)` 저장 값(auth_session, phone_verification, payment, facility 운영 필드 등). 항상 KST 벽시계.
- **schedule** — 사용자가 입력한 KST 예정 시각. 변환 대상이 아님.

⚠️ **timestamptz 컬럼 + seoul 벽시계 저장(면접·회비 일부)은 DB에 기록된 절대시각이 실제보다 +9h 왜곡**되어 있다(JDBC 세션 존=UTC로 캐스팅되기 때문). 앱 왕복은 벽시계가 복원되어 정상이지만, SQL 직접 조회·CSV·BI에서는 틀린 값이다. 2단계 백필에서 `- interval '9 hours'` 보정 대상.

## 필드별 regime 대응표

응답 DTO에 노출되는 Event Time 필드의 변환 근거. (Schedule "유지" 필드 포함)

### Group 1 — application/draft/club/clubevent/clubmember/favorite/globalevent/notice/notification/promotion/recruitment/report/user

| 응답DTO.필드 | 원본 테이블.컬럼 | regime | writer 근거 |
|---|---|---|---|
| ApplicantDetailResponse.submittedAt (+ ApplicantResponse/ApplicationSummaryResponse/MyApplicationDetailResponse) | applications.created_at | system | BaseEntity @CreatedDate |
| ApplicantDetailResponse.StatusHistoryItem.changedAt | application_status_histories.created_at | system | BaseEntity |
| ApplicantDetailResponse.ApplicationEvaluationItem.createdAt/updatedAt | application_evaluations.* | system | BaseEntity |
| DraftResponse.updatedAt | application_drafts.updated_at | system | ApplicationDraft.java:52,59 무클럭 now() |
| AdminClubSummaryResponse.statusChangedAt | clubs.status_changed_at | system | Club.java:225 무클럭 now() |
| Recertification{Context,RequestDetail,RequestSummary}Response.createdAt | recertification_requests.created_at | system | BaseEntity |
| RecertificationRequestDetailResponse.handledAt | recertification_requests.handled_at | system | RecertificationRequest.java:77 무클럭 now() |
| RecertificationRoundResponse.openedAt/closedAt | recertification_rounds.* | system | RecertificationRound.java:42,58 무클럭 now() |
| ClubEventDetailResponse.createdAt/updatedAt | club_events.* | system | BaseEntity (startAt/endAt은 Schedule 유지) |
| ClubMember{Export,History,…}Response.joinedAt/createdAt | club_members·club_member_histories.created_at | system | BaseEntity (joinedAt = created_at 알리아스) |
| SuccessionRequest{Detail,Summary}Response.createdAt/handledAt | leader_succession_requests.* | system | BaseEntity / LeaderSuccessionRequest.java:73 무클럭 now() |
| FavoriteClubResponse.favoritedAt | club_favorites.created_at | system | ClubFavorite.java:52 무클럭 now() |
| AdminGlobalEvent{Detail,Summary}Response.createdAt/updatedAt | global_events.* | system | BaseEntity (startAt/endAt은 Schedule 유지) |
| Notice 계열 4종.createdAt/updatedAt | notices.* | system | BaseEntity (expiresAt·EventInfo.startAt/endAt은 Schedule 유지) |
| NotificationResponse.createdAt/readAt | notifications.* / notice_broadcasts.created_at | system | Notification.java:70,80·NoticeBroadcast.java:54 무클럭 now() |
| Promotion 계열.createdAt/updatedAt/handledAt | promotions·promotion_requests.* | system | BaseEntity / PromotionRequest.java:76 무클럭 now() (startAt/endAt은 Schedule 유지) |
| Report{Detail,Summary}Response.createdAt/handledAt | reports.* | system | BaseEntity / Report.java:88 무클럭 now() |
| MySessionResponse.lastUsedAt | auth_sessions.last_used_at | **seoul** | GeneralAuthSessionService.java:73,95 now(clock) |
| PasswordResetStartResponse.expiresAt / PhoneVerificationIssueResponse.expiresAt | phone_verifications.expires_at | **seoul** | GeneralPhoneVerificationService.java:75 now(clock) 파생 |
| RecruitmentDetailResponse 전 시각 필드 | recruitments.* (LocalDate) | 유지 | 모집/면접 일정(Schedule) |

### Group 2 — cashbook/facility/facilitybooking/facilitysubmission/federation/fee/interview

| 응답DTO.필드 | 원본 테이블.컬럼 | regime | writer 근거 |
|---|---|---|---|
| CashbookEntryResponse.createdAt | cashbook_entry.created_at (timestamptz) | system | BaseEntity 감사 (BANK 멱등 경로는 DB now() — prod에선 동일, transactionDate는 Schedule 유지) |
| Facility{Usage,Detail}Response.lastUpdatedAt · FacilityAvailabilityResponse.lastUpdatedAt · FacilityBookingConflictResponse.crawlBasisAt · AdminFacilityBookingDetailResponse.crawlBasisAt | facility_month_snapshot.crawled_at | **seoul** | FacilityCrawlService.java:140 now(clock) — 기존 +09:00 OffsetDateTime 표기를 Z로 통일(절대시각 동일) |
| FacilityBooking{Summary,AdminSummary}Response.createdAt · {Detail,AdminDetail}Response.HistoryItem.changedAt | facility_booking·facility_booking_status_history.created_at | system | BaseEntity 감사 (예약 date/start/endTime은 Schedule 유지) |
| SubmissionBatch 계열 submittedAt/cancelledAt/completedAt | facility_submission_batch.* | **seoul** | GeneralFacilitySubmissionService.java:69,87,98 now(clock) |
| SubmissionBatchDetailResponse.SubmissionAuditResponse.createdAt | facility_submission_audit.created_at | system | BaseEntity 감사 — 기존 쿼리 서비스의 systemDefault→Seoul 선환산을 제거하고 경계 변환으로 일원화 |
| SubmissionCandidatesResponse.Booking.decidedAt | facility_booking.decided_at | **seoul** | GeneralFacilityBookingAdminService.java:58,70,95·FacilityBookingMatchingService.java:149 now(clock) |
| Federation 계열 createdAt/updatedAt/answeredAt (FAQ·문의·답변) | federation_*.* (timestamptz) | system | BaseEntity 감사 / FederationInquiry.java:110,119 무클럭 now() |
| FederationFaqSearchMissResponse.lastSearchedAt | federation_faq_search_miss.last_searched_at (timestamptz) | system | DB NOW() 저장 — JDBC가 JVM 존 벽시계로 읽으므로 system 변환이 원 instant 복원 |
| BankTransactionResponse.transactionAt | bank_transaction.transaction_at (timestamptz) | **seoul** | BankApiHttpClient.java:167 — BANK API를 KST 벽시계로 파싱 |
| PaymentResponse.paidAt · ReceiptResponse.PaymentLine.paidAt | payment.paid_at (timestamptz) | **seoul** | GeneralPaymentService.java:60 atStartOfDay(SEOUL) / GeneralMatchedPaymentService.java:67 (KST) |
| ReceiptResponse.issuedAt | (저장 없음 — 발급 시점) | Instant 직접 | GeneralReceiptService.java:74 `Instant.now(clock)` 로 전환 |
| RoundCandidateResponse.submittedAt | application.created_at | system | BaseEntity 감사 |
| interview availabilityDeadline·slot startTime/endTime, 예약·청구 일정(LocalDate/LocalTime) 전부 | - | 유지 | Schedule — 변경 없음 |

## BaseEntity / JPA Auditing 개선안 (분석 — 이번 릴리스 미적용)

**현재**: `BaseEntity`의 감사 필드가 `LocalDateTime`이고 커스텀 `DateTimeProvider`가 없어 JVM 존 벽시계로 기록된다. 응답 경계의 `TimeMapper.systemWallClockToInstant`가 이를 절대시각으로 복원한다.

**개선안**: `BaseEntity` 감사 필드를 `Instant`로 전환.
- **장점**: 존-무관 절대시각이 저장 계층부터 보장되어 TimeMapper 임시 계층 제거, 직렬화 자동 `…Z`, 비교·정렬의 존 함정 소멸.
- **영향 범위**: `createdAt`/`updatedAt`/`deletedAt`을 참조하는 QueryDSL 쿼리·soft-delete 벌크·DTO·테스트 전반(레포에 LocalDateTime 사용 파일 233개)이 연쇄 수정 대상 — 대공사.
- **데이터 호환**: Hibernate는 Instant를 UTC 정규화로 읽고 쓰므로 **prod 기존 데이터(UTC 벽시계)와는 무변환 호환**. 단 로컬/개발 DB의 KST 벽시계 이력은 9시간 오독되므로 개발 DB 백필 필요.
- **마이그레이션 필요 여부**: 코드만으로도 prod는 동작하지만, naive `timestamp` 컬럼을 유지한 채 전환하면 "타입은 Instant인데 컬럼은 존 없는 timestamp"라는 어긋남이 남는다. **2단계(timestamptz 통일 + 백필)와 동시 수행을 권장** — 그때 seoul regime 저장 코드(`now(seoulClock)` 저장)도 `Instant.now(clock)` 계열로 함께 전환하고 TimeMapper를 제거한다.

## 알려진 이슈 (1단계 미해결 — 후속 결정 대기)

1. **동아리 행사(club_event) start_at/end_at 기존 데이터 오염** — 등록 폼이 과거에 `toISOString()`으로 UTC를 전송해 **입력보다 9시간 이른 벽시계가 저장**되어 있었다(편집 재저장 시마다 −9h 누적). **입력 경로는 1단계에서 수정 완료**(폼이 KST 벽시계 원문 전송) — 신규 저장은 정합. 수정 이전에 저장된 행만 2단계 백필 대상이며, **수정 배포 시점 전/후를 나눠** 보정해야 한다.
2. **미전환 판정 잔존 (여전히 JVM 존 = prod UTC, 후속 PR 대상)** — 행사/전역행사 기본 조회 윈도우(`GeneralClubEventService`, `GeneralGlobalEventService` — KST 00~09시에 기본 표시 범위가 하루 어긋남), 면접 `availabilityDeadline` 생성 검증(`GeneralInterviewRoundService` — 응답 마감 판정은 KST라 같은 필드를 두 시계로 판정, 생성 순간의 가드만 약함). 영향도 낮음(데이터 무손상)으로 후속 PR로 분리. ※ 프로모션 공개 노출 판정은 1단계에서 seoulClock으로 전환 완료.
3. **배포 전환기 일시 현상** — 응답이 `…Z`로 바뀌므로, 배포 직후 캐시된 구버전 FE 번들의 문자열 절단 표시(영수증 날짜 등)는 새 번들 로드 전까지 UTC 숫자를 노출할 수 있다.

## 2단계: DB 마이그레이션 계획 (별도 릴리스)

1. 위 regime 대응표가 백필 명세다. 컬럼별로:
   - system(naive) → `timestamptz`: prod 데이터는 `AT TIME ZONE 'UTC'` 백필
   - seoul(naive) → `timestamptz`: `AT TIME ZONE 'Asia/Seoul'` 백필
   - seoul(이미 timestamptz, +9h 왜곡) → `- interval '9 hours'` 보정
   - schedule 필드는 naive 유지(또는 date+time 분리) — 마이그레이션 대상 아님
   - **제외 대상**: `admin_user_action_log.created_at` — 신규 테이블이라 처음부터 `timestamptz` + 엔티티 `Instant`. 백필·변환 대상이 아니다.
2. BaseEntity·seoul 저장 코드의 Instant 전환 + TimeMapper 제거를 같은 릴리스에서.
3. 백업 리허설 필수. 앱 릴리스와 마이그레이션 릴리스 분리 원칙(자동 롤백 호환성) 준수.
