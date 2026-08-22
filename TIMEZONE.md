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
- system regime 값과 **비교·집계할 경계**를 만들 때도 같은 `TimeMapper`를 쓴다 (유일한 Clock 빈이 KST라 벽시계를 그대로 쓰면 prod에서 9시간 어긋난다):
  - `systemNow(clock)` — 저장 존 기준 "지금". 보존 경계·조회 윈도우 계산용
  - `seoulToSystemWallClock(kstWallClock)` — "오늘 00시" 같은 KST 경계를 저장 존 벽시계로 이동
- **무클럭 `LocalDateTime.now()` 신규 작성 금지** — `ClocklessNowGuardTest`가 파일별 개수 허용목록으로 차단한다. 의도적 예외는 허용목록에 근거와 함께 등재.

### Frontend
- 날짜 표시는 **`@duing/hooks` 공통 유틸만** 사용: `formatDateTimeKst` / `formatDateKst` / `formatTimeKst` / `formatRelativeTime` (+ 특수 포맷은 `kstDateTimeFormatter`, KST 캘린더 연산은 `kstDateString`/`isTodayKst`/`daysUntilKst`).
- 금지: `toLocaleString()`류 직접 호출(timeZone 미지정), 시각 문자열 `slice()`, `getHours()` 등 로컬 게터, 화면별 지역 포맷 함수. Event 필드는 `…Z`라 slice 시 UTC 숫자가 노출된다.
- 파싱 규칙(공통 유틸 내장): 오프셋/Z 있으면 그대로, 없으면 KST 벽시계(`+09:00`)로 간주 — Event(Z)와 Schedule(무오프셋) 모두 자동으로 올바르다.

### DB (현재)
- 컬럼 타입 혼용 상태: 대부분 naive `timestamp`, interview·fee·federation 계열과 `admin_user_action_log`(V94)만 `timestamptz`. **1단계에서는 스키마를 건드리지 않았다.** 통일은 2단계(아래).

## 저장 벽시계 실태 (regime)

같은 DB에 세 갈래 벽시계가 공존한다. 응답 변환·2단계 백필의 기준이 되는 사실이다.

- **system** — JPA 감사 필드(전 테이블 created_at/updated_at/deleted_at) + 무클럭 `LocalDateTime.now()` 저장 값. JVM 존 벽시계: **prod=UTC, 로컬 개발=KST** (환경마다 다르지만 `systemDefault()` 변환이 각 환경에서 올바른 절대시각을 복원).
- **seoul** — `now(seoulClock)` 저장 값(auth_session, phone_verification, payment, facility 운영 필드 등). 항상 KST 벽시계.
- **schedule** — 사용자가 입력한 KST 예정 시각. 변환 대상이 아님.

⚠️ **timestamptz 컬럼 + seoul 벽시계 저장(면접·회비 일부)은 DB에 기록된 절대시각이 실제보다 +9h 왜곡**되어 있다(JDBC 세션 존=UTC로 캐스팅되기 때문). 앱 왕복은 벽시계가 복원되어 정상이지만, SQL 직접 조회·CSV·BI에서는 틀린 값이다. 2단계 백필에서 `- interval '9 hours'` 보정 대상. 해당 컬럼은 아래 대응표에서 ⚠️ 로 표시했다 — `payment.paid_at`·`payment.voided_at`·`bank_transaction.transaction_at`·`interview_round.assignment_completed_at` 이 지금도 왜곡을 적립 중이다.

## 필드별 regime 대응표

응답 DTO에 노출되는 Event Time 필드의 변환 근거. (Schedule "유지" 필드 포함)

**writer 근거는 `파일#메서드` 로 적는다 — 줄번호는 리팩터링마다 드리프트해 오히려 틀린 정보가 된다.**

### Group 1 — application/draft/club/clubevent/clubmember/favorite/globalevent/joincode/notice/notification/promotion/recruitment/report/user

| 응답DTO.필드 | 원본 테이블.컬럼 | regime | writer 근거 |
|---|---|---|---|
| ApplicantDetailResponse.submittedAt (+ ApplicantResponse/ApplicationSummaryResponse/MyApplicationDetailResponse) | applications.created_at | system | BaseEntity @CreatedDate |
| ApplicantDetailResponse.StatusHistoryItem.changedAt | application_status_histories.created_at | system | BaseEntity |
| ApplicantDetailResponse.ApplicationEvaluationItem.createdAt/updatedAt | application_evaluations.* | system | BaseEntity |
| AdminApplicantResponse.submittedAt · AdminApplicationDetailResponse.submittedAt | applications.created_at | system | 위 ApplicantDetailResponse.submittedAt 과 같은 컬럼·같은 변환(총동연 지원자 조회) |
| AdminApplicationDetailResponse.AdminStatusHistoryItem.changedAt | application_status_histories.created_at | system | 위 StatusHistoryItem.changedAt 과 같은 컬럼·같은 변환 |
| DraftResponse.updatedAt | application_drafts.updated_at | system | ApplicationDraft#create·#replace 무클럭 now() |
| AdminClubSummaryResponse.statusChangedAt | clubs.status_changed_at | system | Club#changeStatus 무클럭 now() |
| ClubEventDetailResponse.createdAt/updatedAt | club_events.* | system | BaseEntity (startAt/endAt은 Schedule 유지) |
| ClubMember{Export,History,…}Response.joinedAt/createdAt | club_members·club_member_histories.created_at | system | BaseEntity (joinedAt = created_at 알리아스) |
| SuccessionRequest{Detail,Summary}Response.createdAt/handledAt | leader_succession_requests.* | system | BaseEntity / LeaderSuccessionRequest#process 무클럭 now() (승인·거절 공용) |
| FavoriteClubResponse.favoritedAt | club_favorites.created_at | system | ClubFavorite#create 무클럭 now() |
| AdminGlobalEvent{Detail,Summary}Response.createdAt/updatedAt | global_events.* | system | BaseEntity (startAt/endAt은 Schedule 유지) |
| RecruitmentSummaryResponse.closedAt (공개 모집 목록·캘린더 공용) | recruitment.closed_at | **seoul** | GeneralRecruitmentService 의 5개 writer — #create(만료 OPEN 자동 마감)·#close(수동)·#replaceActive·#closeAllOnClubClosure(폐쇄 시 행별 마감)·#closeAllOnClubDeactivation(벌크 closeAllOpenByClubId) 모두 now(clock). 아래 joinExpiresAt 의 기준점이기도 하다. #stopIntake 는 closed_at 을 쓰지 않는다 |
| JoinCodeResponse.joinExpiresAt | (파생 — 저장 컬럼 없음) | **seoul** | recruitment.closed_at + club_join_code.join_window_days 로 계산(ClubJoinCode#getJoinExpiresAt) 후 seoulWallClockToInstant. 기준점이 seoul 이라 파생값도 seoul |
| JoinCodeResponse.inviteExpiresAt (V107 부원 초대 링크) | club_join_code.invite_expires_at | **seoul** | GeneralJoinCodeService#createClubInvite 가 now(clock) + expiresInHours 로 계산해 저장. 같은 DTO 의 joinExpiresAt 과 동일 regime 이지만 이쪽은 실제 저장 컬럼이다 |
| AdminJoinLinkStatusResponse.joinExpiresAt | (파생 — 저장 컬럼 없음) | **seoul** | 위 JoinCodeResponse.joinExpiresAt 과 같은 파생·같은 변환(총동연 상세의 가입 링크 현황) |
| AdminRecruitment{Summary,Detail}Response.updatedAt | recruitment.updated_at | system | BaseEntity @LastModifiedDate — 같은 응답의 closedAt·joinLink.joinExpiresAt(seoul) 과 regime 이 갈린다 |
| AdminRecruitment{Summary,Detail}Response.closedAt | recruitment.closed_at | **seoul** | 위 RecruitmentSummaryResponse.closedAt 과 같은 컬럼·같은 변환(총동연 콘솔이 강제 마감 판단 근거로 쓴다) |
| JoinRequest{Summary,Detail}Response.requestedAt | club_join_request.created_at | system | BaseEntity @CreatedDate |
| JoinRequestDetailResponse.reviewedAt | club_join_request.reviewed_at | **seoul** | GeneralJoinRequestService#applyDecision(#decide·#bulkApprove 공용) 과 #createRequest(자동 승인 경로) 가 now(clock) — 같은 DTO 의 requestedAt(system) 과 regime 이 갈린다 |
| Notice 계열 4종.createdAt/updatedAt | notices.* | system | BaseEntity (expiresAt·EventInfo.startAt/endAt은 Schedule 유지) |
| NotificationResponse.createdAt/readAt | notifications.* / notice_broadcasts.created_at | system | Notification#create·#markRead · NoticeBroadcast#snapshot 무클럭 now() (읽음 벌크는 NotificationRepositoryImpl 무클럭 now()) |
| Promotion 계열.createdAt/updatedAt/handledAt | promotions·promotion_requests.* | system | BaseEntity / PromotionRequest#process 무클럭 now() (startAt/endAt은 Schedule 유지) |
| Report{Detail,Summary}Response.createdAt/handledAt | reports.* | system | BaseEntity / Report#process 무클럭 now() |
| PublicActivityResponse.Item.occurredAt (공개 활동 피드) | recruitment·notice·interview_round·club_event·fee_policy.created_at (5종) | system | PublicActivityQueryRepository#toItems 의 기본 변환이 systemWallClockToInstant — 이 5종은 BaseEntity 감사라 정합 |
| ⚠️ PublicActivityResponse.Item.occurredAt (INTERVIEW_RESULT 피드만) | interview_round.assignment_completed_at | **seoul** | GeneralInterviewAssignmentService#confirmRound 가 now(clock) — 쓰기 seoul × 읽기 seoulWallClockToInstant 로 **표기 정합(2026-08-21)**, 저장 절대시각 왜곡은 2단계 백필 대상 |
| AdminUserDetailResponse.createdAt | users.created_at | system | BaseEntity 감사 |
| AdminUserDetailResponse.lastLoginAt | users.last_login_at | system | GeneralUserService#login 무클럭 now() → User#recordSuccessfulLogin |
| AdminUserDetailResponse.phoneVerifiedAt | users.phone_verified_at | **seoul** | GeneralUserService#signup(가입)·#changePhone(번호 변경) now(clock) — writer 양쪽 모두 seoulClock. 같은 응답의 나머지 시각(createdAt/lastLoginAt/clubs.joinedAt)은 system 이라 한 DTO 에 두 regime 이 섞인다 |
| AdminUserDetailResponse.ClubItem.joinedAt | club_member.created_at | system | BaseEntity 감사 (joinedAt = created_at 알리아스) |
| MySessionResponse.lastUsedAt | auth_sessions.last_used_at | **seoul** | GeneralAuthSessionService#issue·#rotate now(clock) |
| PasswordResetStartResponse.expiresAt / PhoneVerificationIssueResponse.expiresAt | phone_verifications.expires_at | **seoul** | GeneralPhoneVerificationService#issue 의 now(clock) 에서 파생(#startPasswordReset 도 #issue 로 위임) |
| RecruitmentDetailResponse 전 시각 필드 | recruitments.* (LocalDate) | 유지 | 모집/면접 일정(Schedule) |

### Group 2 — cashbook/facility/facilitybooking/facilitysubmission/federation/fee/interview

| 응답DTO.필드 | 원본 테이블.컬럼 | regime | writer 근거 |
|---|---|---|---|
| CashbookEntryResponse.createdAt | cashbook_entry.created_at (timestamptz) | system | BaseEntity 감사 (BANK 멱등 경로는 DB now() — prod에선 동일, transactionDate는 Schedule 유지) |
| Facility{Usage,Detail}Response.lastUpdatedAt · FacilityAvailabilityResponse.lastUpdatedAt · FacilityBookingConflictResponse.crawlBasisAt · AdminFacilityBookingDetailResponse.crawlBasisAt · AdminFacilityBookingCountsResponse.crawledAt | facility_month_snapshot.crawled_at (naive TIMESTAMP — V71, 왜곡 없음·백필 규칙 2 대상) | **seoul** | FacilityCrawlService#crawlAndReplace now(clock) — 기존 +09:00 OffsetDateTime 표기를 Z로 통일(절대시각 동일) |
| FacilityBooking{Summary,AdminSummary}Response.createdAt · {Detail,AdminDetail}Response.HistoryItem.changedAt | facility_booking·facility_booking_status_history.created_at | system | BaseEntity 감사 (예약 date/start/endTime은 Schedule 유지) |
| SubmissionBatch 계열 submittedAt/cancelledAt/completedAt | facility_submission_batch.* | **seoul** | GeneralFacilitySubmissionService#create·#cancel·#complete now(clock) |
| SubmissionBatchDetailResponse.SubmissionAuditResponse.createdAt | facility_submission_audit.created_at | system | BaseEntity 감사 — 기존 쿼리 서비스의 systemDefault→Seoul 선환산을 제거하고 경계 변환으로 일원화 |
| SubmissionCandidatesResponse.Booking.decidedAt | facility_booking.decided_at | **seoul** | GeneralFacilityBookingAdminService#approve·#reject now(clock). 수기 확정(#confirmManually)·매칭 확정(FacilityBookingMatchingService#verifyAndConfirm)은 decided_at 이 아니라 confirmed_at 을 쓰며 응답에 노출되지 않는다 |
| Federation 계열 createdAt/updatedAt/answeredAt (FAQ·문의·답변) | federation_*.* (timestamptz) | system | BaseEntity 감사 / FederationInquiry#markAnswered·#close 무클럭 now() |
| FederationFaqSearchMissResponse.lastSearchedAt | federation_faq_search_miss.last_searched_at (timestamptz) | system | DB NOW() 저장 — JDBC가 JVM 존 벽시계로 읽으므로 system 변환이 원 instant 복원 |
| ⚠️ BankTransactionResponse.transactionAt | bank_transaction.transaction_at (timestamptz) | **seoul** | BankApiHttpClient#appendTransaction — BANK API 응답의 date·time 을 존 변환 없이 KST 벽시계로 조립 |
| ⚠️ PaymentResponse.paidAt · ReceiptResponse.PaymentLine.paidAt | payment.paid_at (timestamptz) | **seoul** | 수기: GeneralPaymentService#record 가 입력 LocalDate 를 `atStartOfDay(SEOUL)` 로 승격 — LocalDate 기점이라 존 변환은 실제로 일어나지 않고 KST 벽시계 자정이 그대로 저장된다. 매칭: GeneralMatchedPaymentService#createMatchedPayment 는 시각 계산 없이 `transaction.getTransactionAt()` 을 그대로 저장 — bank_transaction 과 동일 regime |
| ⚠️ AdminFeePaymentRowResponse.voidedAt (#893 회비 감사) | payment.voided_at (timestamptz) | **seoul** | GeneralPaymentService#voidPayment 가 `now(clock)` 의 KST 벽시계를 timestamptz 컬럼에 저장 → **DB-01 과 같은 +9h 왜곡을 지금도 적립 중**. 2단계에서 `- interval '9 hours'` 보정 대상 |
| AdminFeePaymentRowResponse.paidAt · AdminFeeBillRowResponse.lastPaidAt (#893) | payment.paid_at (timestamptz) / MAX(payment.paid_at) | **seoul** | 위 PaymentResponse.paidAt 과 같은 컬럼·같은 변환 |
| AdminFeeClubSummaryResponse.lastPaidAt | payment.paid_at (timestamptz) | **seoul** | 위 PaymentResponse.paidAt 과 같은 컬럼·같은 변환(총동연 회비 감사 목록) |
| AdminFeeClubSummaryResponse.lastTransactionAt | bank_transaction.transaction_at (timestamptz) | **seoul** | 위 BankTransactionResponse.transactionAt 과 같은 컬럼·같은 변환 |
| AdminFeeBillRowResponse.createdAt (#893) | fee_bill.created_at (timestamptz) | system | BaseEntity 감사 — 같은 행의 lastPaidAt(seoul) 과 regime 이 갈린다 |
| AdminFeeAuditCommentResponse.createdAt/updatedAt (#893) | admin_fee_audit_comment.* (timestamptz) | system | BaseEntity 감사 |
| AdminFeeAuditLogResponse.createdAt (#893) | club_audit_event.created_at (timestamptz) | system | BaseEntity 감사 |
| AdminFeePolicyResponse.createdAt (#893) | fee_policy.created_at (timestamptz) | system | BaseEntity 감사 |
| ReceiptResponse.issuedAt | (저장 없음 — 발급 시점) | Instant 직접 | GeneralReceiptService#buildReceipt 가 `Instant.now(clock)` 으로 생성 |
| RoundCandidateResponse.submittedAt | application.created_at | system | BaseEntity 감사 |
| interview availabilityDeadline·slot startTime/endTime, 예약·청구 일정(LocalDate/LocalTime) 전부 | - | 유지 | Schedule — 변경 없음 |

## BaseEntity / JPA Auditing 개선안 (분석 — 이번 릴리스 미적용)

**현재**: `BaseEntity`의 감사 필드가 `LocalDateTime`이고 커스텀 `DateTimeProvider`가 없어 JVM 존 벽시계로 기록된다. 응답 경계의 `TimeMapper.systemWallClockToInstant`가 이를 절대시각으로 복원한다.

**개선안**: `BaseEntity` 감사 필드를 `Instant`로 전환.
- **장점**: 존-무관 절대시각이 저장 계층부터 보장되어 TimeMapper 임시 계층 제거, 직렬화 자동 `…Z`, 비교·정렬의 존 함정 소멸.
- **영향 범위**: `createdAt`/`updatedAt`/`deletedAt`을 참조하는 QueryDSL 쿼리·soft-delete 벌크·DTO·테스트 전반(main 기준 LocalDateTime 사용 파일 약 230개, 테스트 포함 시 두 배)이 연쇄 수정 대상 — 대공사.
- **데이터 호환**: Hibernate는 Instant를 UTC 정규화로 읽고 쓰므로 **prod 기존 데이터(UTC 벽시계)와는 무변환 호환**. 단 로컬/개발 DB의 KST 벽시계 이력은 9시간 오독되므로 개발 DB 백필 필요.
- **마이그레이션 필요 여부**: 코드만으로도 prod는 동작하지만, naive `timestamp` 컬럼을 유지한 채 전환하면 "타입은 Instant인데 컬럼은 존 없는 timestamp"라는 어긋남이 남는다. **2단계(timestamptz 통일 + 백필)와 동시 수행을 권장** — 그때 seoul regime 저장 코드(`now(seoulClock)` 저장)도 `Instant.now(clock)` 계열로 함께 전환하고 TimeMapper를 제거한다.

## 알려진 이슈 (1단계 미해결 — 후속 결정 대기)

1. **동아리 행사(club_event) start_at/end_at 기존 데이터 오염** — 등록 폼이 과거에 `toISOString()`으로 UTC를 전송해 **입력보다 9시간 이른 벽시계가 저장**되어 있었다(편집 재저장 시마다 −9h 누적). **입력 경로는 1단계에서 수정 완료**(폼이 KST 벽시계 원문 전송) — 신규 저장은 정합. 수정 이전에 저장된 행만 2단계 백필 대상이며, **수정 배포 시점 전/후를 나눠** 보정해야 한다.
2. **미전환 판정 잔존 — 해소됨(#729)** — 과거 지목했던 세 곳(`GeneralClubEventService`·`GeneralGlobalEventService` 기본 조회 윈도우, `GeneralInterviewRoundService` 의 `availabilityDeadline` 생성 검증)은 전부 `now(seoulClock)` 으로 전환 완료다. **판정 경로에 남은 미전환은 없다.** 남은 무클럭 `now()` 는 셋뿐이며 모두 의도적이다 — ① 엔티티 저장 스탬프(10개 엔티티 13곳: 같은 컬럼에 두 regime 이 섞이면 2단계 백필이 불가능해지므로 **개별 전환 금지**), ② 의도적 system-regime 계산(soft-delete·읽음 벌크, `GeneralClubMetricService` 집계 경계), ③ `GeneralUserService#login`(users.last_login_at 저장 겸용이라 동결 — 여기만 바꾸면 같은 컬럼의 기존 행과 regime 이 갈린다. 2단계와 같은 릴리스에서만 전환). 신규 도입은 `ClocklessNowGuardTest` 가 차단한다.
3. **공개 활동 피드 INTERVIEW_RESULT 의 regime 불일치 — 해소됨(2026-08-21)** — `interview_round.assignment_completed_at` 은 `GeneralInterviewAssignmentService#confirmRound` 가 `now(clock)`(KST 벽시계)로 쓰는데, 읽기는 6개 피드 공용의 `systemWallClockToInstant` 였다. 로컬(JVM=KST)에서는 우연히 맞지만 **prod(JVM=UTC)에서는 이 피드 항목만 발생 시각이 9시간 늦게 표기**되고, 조회 윈도우 비교도 같은 폭만큼 어긋났다. **이 피드만 `seoulWallClockToInstant` 로 읽고 윈도우 경계도 같은 KST 축(`seoulSince`)으로 따로 산출하도록 전환 완료** — 다른 5종은 BaseEntity 감사라 기존 system 변환 그대로다. 표기·조회 창은 정합해졌지만 **DB 에 적립된 +9h 저장 왜곡은 그대로 남는다**(timestamptz 컬럼 — 아래 2단계 백필 목록 유지).
4. **삭제된 recertification 도메인의 고아 테이블** — Java 코드·DTO·엔티티는 전부 제거됐지만, 생성 마이그레이션(`V29__create_recertification_round_and_request.sql`)은 Flyway 불변 원칙상 남아 있고 DROP 마이그레이션이 없어 **DB에 `recertification_round`·`recertification_request`(단수형) 테이블이 물리 잔존**한다(2026-08-19 dev DB `information_schema` 실측, 둘 다 naive `timestamp`). 쓰는 코드가 없으므로 **2단계 백필 대상이 아니며**, DROP 은 별도 정리 과제로 분리한다.
5. **배포 전환기 일시 현상** — 응답이 `…Z`로 바뀌므로, 배포 직후 캐시된 구버전 FE 번들의 문자열 절단 표시(영수증 날짜 등)는 새 번들 로드 전까지 UTC 숫자를 노출할 수 있다.

## 2단계: DB 마이그레이션 계획 (별도 릴리스)

1. 위 regime 대응표가 백필 명세다. 컬럼별로:
   - system(naive) → `timestamptz`: prod 데이터는 `AT TIME ZONE 'UTC'` 백필
   - seoul(naive) → `timestamptz`: `AT TIME ZONE 'Asia/Seoul'` 백필
   - seoul(이미 timestamptz, +9h 왜곡) → `- interval '9 hours'` 보정. 대응표의 ⚠️ 행이 전부 여기 해당한다 — `payment.paid_at`·`payment.voided_at`·`bank_transaction.transaction_at`·`interview_round.assignment_completed_at`
   - schedule 필드는 naive 유지(또는 date+time 분리) — 마이그레이션 대상 아님
   - **제외 대상**: `admin_user_action_log.created_at` — 신규 테이블이라 처음부터 `timestamptz` + 엔티티 `Instant`. 백필·변환 대상이 아니다.
   - **제외 대상**: `recertification_round`·`recertification_request` — 쓰는 코드가 없는 고아 테이블(알려진 이슈 4). 백필하지 말고 별도 DROP 과제로 넘긴다.
2. BaseEntity·seoul 저장 코드의 Instant 전환 + TimeMapper 제거를 같은 릴리스에서.
3. 백업 리허설 필수. 앱 릴리스와 마이그레이션 릴리스 분리 원칙(자동 롤백 호환성) 준수.
