import ky, { type KyInstance, type ResponsePromise } from 'ky';
import { notifyUnauthorized } from './unauthorized-context';
import type {
  InterviewRoundCandidate,
  InterviewRoundSummary,
  InterviewRoundDetail,
  CreateInterviewRoundPayload,
  CreateInterviewRoundResult,
  CreateRoundSlotsPayload,
  CreateRoundSlotsResult,
  UpdateInterviewRoundPayload,
  AvailabilityRequestResult,
  ApplicantInterviewView,
  RespondAvailabilityPayload,
  RoundAutoAssignResult,
  RoundConfirmResult,
  UpdateInterviewSlotPayload,
} from '@duing/types';
import type {
  SubmitSuccessionRequestPayload,
  SubmitReportPayload,
  SubmitPromotionRequestPayload,
  ApiResponse,
  PageResponse,
  ClubDetail,
  ClubMember,
  ClubMemberExportRow,
  ClubMemberPhone,
  JoinCodeSummary,
  JoinCodeCheck,
  CreateJoinCodePayload,
  CreateClubInviteCodePayload,
  JoinRequestStatus,
  JoinRequestSummary,
  JoinRequestDetail,
  DecideJoinRequestPayload,
  JoinRequestDecisionResponse,
  BulkApproveJoinRequestsPayload,
  BulkApproveResult,
  ClubPhoto,
  ClubSearchParams,
  ClubStats,
  ClubSummary,
  RecordClubViewPayload,
  CreateClubPayload,
  CreateRecruitmentPayload,
  LoginPayload,
  LoginResult,
  WebLoginResult,
  ManagedClub,
  MyApplicationDetail,
  ApplicantDetail,
  RecruitmentDetail,
  RecruitmentSummary,
  UpdateRecruitmentPayload,
  SignupPayload,
  UpdateProfilePayload,
  ChangePasswordPayload,
  StartPhoneVerificationPayload,
  PhoneVerificationSession,
  PhoneVerificationStatus,
  ChangePhonePayload,
  RequestPasswordResetPayload,
  PasswordResetSession,
  CompletePasswordResetPayload,
  SubmitApplicationPayload,
  UpdateApplicationStatusPayload,
  UpdateClubPayload,
  UpdateClubStatusPayload,
  UpdateClubCentralClubPayload,
  UpdateClubFacilitySecuredTimeTargetPayload,
  CloseClubPayload,
  Applicant,
  ApplicantsFilters,
  ApplicantNeighbors,
  UpsertApplicationEvaluationPayload,
  ApplicationScope,
  ApplicationSummary,
  MyClubSummary,
  MySession,
  BulkUpdateApplicationStatusPayload,
  BulkUpdateApplicationStatusResult,
  User,
  StatsSummary,
  StatsDailyPoint,
  StatsFunnel,
  FavoriteClub,
  FavoriteIds,
  ApplicationDraft,
  UpsertDraftPayload,
  Notification,
  NoticeCardItem,
  NoticeDetail,
  NoticeCategory,
  NoticeSource,
  CreateClubPhotoPayload,
  UpdateClubPhotoPayload,
  ReorderClubPhotosPayload,
  ClubHeroActivity,
  CreateHeroActivityPayload,
  UpdateHeroActivityPayload,
  ReorderHeroActivitiesPayload,
  TransferLeaderResult,
  UpdateMemberRolePayload,
  FileUploadResult,
  FilePurpose,
  PromotionCard,
  MyClubMembership,
  CreateClubNoticePayload,
  UpdateClubNoticePayload,
  ClubNoticeDetail,
  ClubEventCard,
  ClubEventDetail,
  ClubEventListParams,
  CreateClubEventPayload,
  UpdateClubEventPayload,
  GlobalEventCard,
  GlobalEventDetail,
  GlobalEventListParams,
  FeePolicy,
  FeeBill,
  MyFee,
  GenerateBillsResult,
  CreateFeePolicyPayload,
  UpdateFeePolicyPayload,
  GenerateBillsPayload,
  BillSearchParams,
  MyFeeSearchParams,
  FeeAccount,
  FeeAccountPayload,
  Payment,
  RecordPaymentPayload,
  Receipt,
  FeeBillSummary,
  FeeSummaryParams,
  BankTransaction,
  BankTransactionSearchParams,
  BankMatchingStatus,
  SyncResult,
  SyncBankTransactionsPayload,
  CashbookEntry,
  CashbookSummary,
  CashbookSearchParams,
  CreateCashbookEntryPayload,
  UpdateCashbookEntryPayload,
  PublicActivityFeed,
  PublicActivityListParams,
  FacilitySummary,
  FacilityUsageResponse,
  FacilityDetailResponse,
  FacilityAvailabilityResponse,
  FacilityBookingWindow,
  PurposePreset,
  CreateFacilityBookingPayload,
  CreateFacilityBookingResult,
  BookingStatus,
  FacilityBookingSummary,
  FacilityBookingDetail,
  FederationFaqCategory,
  FederationFaqItem,
  FederationFaqFeedbackPayload,
  FederationInquiryStatus,
  FederationInquirySummary,
  FederationInquiryDetail,
  CreateFederationInquiryPayload,
  UpdateFederationInquiryPayload,
} from '@duing/types';
import { clearToken, readToken, writeToken } from './token';
import { isKnownOffline } from './connectivity';
import { createRefreshCoordinator } from './refresh-coordinator';
import type { RefreshOutcome } from './refresh-coordinator';
import {
  ApiError,
  BLOB_BODY_READ_TIMEOUT_MS,
  JSON_BODY_READ_TIMEOUT_MS,
  NETWORK_ERROR_MESSAGE,
  REQUEST_TIMEOUT_MS,
  cleanParams,
  readBodyWithTimeout,
  toApiError,
  unwrap,
  unwrapNullable,
} from './http';
import { createAdminApi, type AdminApi } from './domains/admin';

// 공통 HTTP 원시값(ApiError·언래퍼·타임아웃 상수·cleanParams)은 http.ts 로 옮겼지만,
// 소비자와 테스트가 '../src/client' 경로로 잡아 온 표면은 재수출로 그대로 유지한다.
export * from './http';

export type DuingApiClient = {
  auth: {
    signup(payload: SignupPayload): Promise<number>;
    login(payload: LoginPayload): Promise<User>;
    startPhoneVerification(
      payload: StartPhoneVerificationPayload,
      includeQr: boolean,
    ): Promise<PhoneVerificationSession>;
    getPhoneVerificationStatus(verificationToken: string): Promise<PhoneVerificationStatus>;
    requestPasswordReset(
      payload: RequestPasswordResetPayload,
      includeQr: boolean,
    ): Promise<PasswordResetSession>;
    completePasswordReset(payload: CompletePasswordResetPayload): Promise<void>;
    logout(): Promise<void>;
  };
  users: {
    me(): Promise<User>;
    myApplications(scope?: ApplicationScope): Promise<ApplicationSummary[]>;
    myClubs(): Promise<MyClubSummary[]>;
    updateProfile(payload: UpdateProfilePayload): Promise<void>;
    changePassword(payload: ChangePasswordPayload): Promise<void>;
    startPhoneChangeVerification(
      payload: StartPhoneVerificationPayload,
      includeQr: boolean,
    ): Promise<PhoneVerificationSession>;
    changePhone(payload: ChangePhonePayload): Promise<void>;
    withdraw(): Promise<void>;
    sessions(): Promise<MySession[]>;
    revokeSession(sessionId: number): Promise<void>;
    logoutAllSessions(): Promise<void>;
  };
  clubs: {
    list(params?: ClubSearchParams): Promise<PageResponse<ClubSummary>>;
    /** 공개 통계(총 수·모집중 수·카테고리별 수)를 한 번에. */
    stats(): Promise<ClubStats>;
    detail(clubId: number): Promise<ClubDetail>;
    /** 상세 조회 1건 기록(관심도 집계). 실패해도 화면에 영향을 주지 않는 fire-and-forget 용도다. */
    recordView(clubId: number, payload: RecordClubViewPayload): Promise<void>;
    create(payload: CreateClubPayload): Promise<number>;
    update(clubId: number, payload: UpdateClubPayload): Promise<ClubDetail>;
    updateStatus(clubId: number, payload: UpdateClubStatusPayload): Promise<void>;
    updateCentralClub(clubId: number, payload: UpdateClubCentralClubPayload): Promise<void>;
    updateFacilitySecuredTimeTarget(
      clubId: number,
      payload: UpdateClubFacilitySecuredTimeTargetPayload,
    ): Promise<void>;
    close(clubId: number, payload: CloseClubPayload): Promise<void>;
    photos(clubId: number): Promise<ClubPhoto[]>;
    createPhoto(clubId: number, payload: CreateClubPhotoPayload): Promise<ClubPhoto>;
    updatePhoto(clubId: number, photoId: number, payload: UpdateClubPhotoPayload): Promise<void>;
    reorderPhotos(clubId: number, payload: ReorderClubPhotosPayload): Promise<ClubPhoto[]>;
    deletePhoto(clubId: number, photoId: number): Promise<void>;
    heroActivities(clubId: number): Promise<ClubHeroActivity[]>;
    createHeroActivity(clubId: number, payload: CreateHeroActivityPayload): Promise<ClubHeroActivity>;
    updateHeroActivity(
      clubId: number,
      heroActivityId: number,
      payload: UpdateHeroActivityPayload,
    ): Promise<void>;
    reorderHeroActivities(
      clubId: number,
      payload: ReorderHeroActivitiesPayload,
    ): Promise<ClubHeroActivity[]>;
    deleteHeroActivity(clubId: number, heroActivityId: number): Promise<void>;
    members(clubId: number): Promise<ClubMember[]>;
    // memberIds 를 주면 그 멤버만 내려온다(화면 필터 결과 범위) — 생략하면 전체.
    membersExport(
      clubId: number,
      includePhone: boolean,
      memberIds?: number[],
    ): Promise<ClubMemberExportRow[]>;
    // 원본 연락처. 회장 전용이며 호출 자체가 백엔드 감사 로그로 남는다 — 화면에 필요할 때만 부른다.
    memberPhone(clubId: number, memberId: number): Promise<ClubMemberPhone>;
    updateMemberRole(clubId: number, memberId: number, payload: UpdateMemberRolePayload): Promise<void>;
    // generation=null 이면 기수를 비운다(클리어). LEADER 전용(OFFICER 403).
    updateMemberGeneration(
      clubId: number,
      memberId: number,
      payload: { generation: number | null },
    ): Promise<void>;
    removeMember(clubId: number, memberId: number): Promise<void>;
    leaveClub(clubId: number): Promise<void>;
    transferLeader(clubId: number, memberId: number): Promise<TransferLeaderResult>;
    recruitmentsByClub(clubId: number): Promise<RecruitmentSummary[]>;
    managedByMe(): Promise<ManagedClub[]>;
    // 동아리원 회비 입금 계좌 조회. 미등록 시 404 — 호출부(훅)가 ApiError 로 빈 상태를 판별한다.
    feeAccount(clubId: number): Promise<FeeAccount>;
  };
  joinCodes: {
    // 코드는 모집에 귀속된다 — 같은 동아리라도 모집마다 활성 코드가 따로 있다(스펙 v2 §4.3).
    // 기존 활성 코드가 있으면 폐기 후 새로 만드는 원자 재생성이고, 자체 폼 모집이거나
    // 모집이 실질 진행 중이 아니면 409 다(스펙 v2 §4.2).
    createForRecruitment(
      clubId: number,
      recruitmentId: number,
      payload: CreateJoinCodePayload,
    ): Promise<JoinCodeSummary>;
    // 활성 코드가 없으면 200 + data:null 이 정상 응답이라 null 을 그대로 돌려준다.
    // 만료된 코드도 폐기 전이면 활성으로 내려온다 — 사용 가능 판정은 호출부 몫이다.
    // 상태 카드용 누적/대기 수치(totalRequestCount·pendingCount)도 이 응답에 함께 담긴다.
    getActiveForRecruitment(
      clubId: number,
      recruitmentId: number,
    ): Promise<JoinCodeSummary | null>;
    revokeForRecruitment(
      clubId: number,
      recruitmentId: number,
      joinCodeId: number,
    ): Promise<void>;
    // 부원 초대 링크는 모집이 아니라 동아리에 귀속된다 — 동아리당 활성 링크 1개이고, 기존 활성
    // 링크가 있으면 폐기 후 새로 만드는 원자 재생성이다(동시 생성 경쟁만 409).
    createClubInvite(clubId: number, payload: CreateClubInviteCodePayload): Promise<JoinCodeSummary>;
    // 활성 초대 링크가 없으면 200 + data:null 이 정상 응답이라 null 을 그대로 돌려준다.
    // 만료된 링크도 폐기 전이면 활성으로 내려온다 — 사용 가능 판정은 호출부 몫이다.
    getActiveClubInvite(clubId: number): Promise<JoinCodeSummary | null>;
    // 이미 폐기된 링크도 204(멱등). 없는 링크·모집 링크·타 동아리 링크는 404(열거 차단).
    revokeClubInvite(clubId: number, joinCodeId: number): Promise<void>;
    listRequests(clubId: number, status: JoinRequestStatus): Promise<JoinRequestSummary[]>;
    // 전화번호는 이 상세 응답에만 담긴다(목록에는 없음).
    getRequestDetail(clubId: number, joinRequestId: number): Promise<JoinRequestDetail>;
    // 승인 요청이라도 이미 가입된 회원이면 AUTO_REJECTED 로 돌아오므로 204 가 아닌 본문을 읽는다.
    decideRequest(
      clubId: number,
      joinRequestId: number,
      payload: DecideJoinRequestPayload,
    ): Promise<JoinRequestDecisionResponse>;
    bulkApproveRequests(
      clubId: number,
      payload: BulkApproveJoinRequestsPayload,
    ): Promise<BulkApproveResult>;
    // 학생용 코드 확인 — 비로그인도 호출할 수 있는 공개 조회다. 없는 코드는 404 로 떨어진다.
    check(code: string): Promise<JoinCodeCheck>;
    // 학생용 가입 요청 — 인증 필수(401). 사용 불가·이미 가입·대기 중은 모두 409 이고
    // 사유는 서버 message 로만 구분되므로 호출부가 그 문구를 그대로 보여준다.
    createRequest(code: string): Promise<void>;
  };
  files: {
    upload(file: File, purpose: FilePurpose): Promise<FileUploadResult>;
  };
  recruitments: {
    calendar(yearMonth: string): Promise<RecruitmentSummary[]>;
    detail(recruitmentId: number): Promise<RecruitmentDetail>;
    create(clubId: number, payload: CreateRecruitmentPayload): Promise<number>;
    update(recruitmentId: number, payload: UpdateRecruitmentPayload): Promise<void>;
    close(recruitmentId: number): Promise<void>;
    // 상시모집 전용 접수 마감 — 종료일을 어제로 확정해 신규 지원만 차단한다(심사는 계속, status 는 OPEN 유지).
    // 상시모집이 아니거나 시작일이 지나지 않았으면 400, 이미 마감(CLOSED)이면 409.
    stopIntake(recruitmentId: number): Promise<void>;
    remove(recruitmentId: number): Promise<void>;
  };
  applications: {
    submit(recruitmentId: number, payload: SubmitApplicationPayload): Promise<number>;
    checkEligibility(recruitmentId: number): Promise<void>;
    applicants(recruitmentId: number, filters?: ApplicantsFilters): Promise<Applicant[]>;
    applicantNeighbors(
      recruitmentId: number,
      applicationId: number,
      filters?: ApplicantsFilters,
    ): Promise<ApplicantNeighbors>;
    updateStatus(
      applicationId: number,
      payload: UpdateApplicationStatusPayload,
    ): Promise<void>;
    bulkUpdateStatus(
      payload: BulkUpdateApplicationStatusPayload,
    ): Promise<BulkUpdateApplicationStatusResult>;
    myDetail(applicationId: number): Promise<MyApplicationDetail>;
    withdraw(applicationId: number): Promise<void>;
    detail(applicationId: number): Promise<ApplicantDetail>;
    upsertMyApplicationEvaluation(
      applicationId: number,
      payload: UpsertApplicationEvaluationPayload,
    ): Promise<void>;
    deleteMyApplicationEvaluation(applicationId: number): Promise<void>;
  };
  stats: {
    summary(recruitmentId: number): Promise<StatsSummary>;
    daily(recruitmentId: number): Promise<StatsDailyPoint[]>;
    funnel(recruitmentId: number): Promise<StatsFunnel>;
  };
  favorites: {
    list(page: number, size: number): Promise<PageResponse<FavoriteClub>>;
    ids(): Promise<FavoriteIds>;
    add(clubId: number): Promise<number>;
    remove(clubId: number): Promise<void>;
  };
  drafts: {
    get(recruitmentId: number): Promise<ApplicationDraft>;
    upsert(recruitmentId: number, payload: UpsertDraftPayload): Promise<void>;
    remove(recruitmentId: number): Promise<void>;
  };
  notices: {
    list(params: {
      category?: NoticeCategory;
      tags?: string[];
      keyword?: string;
      source?: NoticeSource;
      page: number;
      size: number;
    }): Promise<PageResponse<NoticeCardItem>>;
    detail(noticeId: number): Promise<NoticeDetail>;
  };
  federationFaqs: {
    list(params: {
      categoryId?: number;
      keyword?: string;
      page: number;
      size: number;
    }): Promise<PageResponse<FederationFaqItem>>;
    detail(faqId: number): Promise<FederationFaqItem>;
    submitFeedback(faqId: number, payload: FederationFaqFeedbackPayload): Promise<void>;
  };
  federationFaqCategories: {
    list(): Promise<FederationFaqCategory[]>;
  };
  federationInquiries: {
    create(payload: CreateFederationInquiryPayload): Promise<number>;
    listMine(params: {
      status?: FederationInquiryStatus;
      page: number;
      size: number;
    }): Promise<PageResponse<FederationInquirySummary>>;
    detail(inquiryId: number): Promise<FederationInquiryDetail>;
    update(inquiryId: number, payload: UpdateFederationInquiryPayload): Promise<void>;
    remove(inquiryId: number): Promise<void>;
    // 원본 바이트 스트리밍 — ApiResponse 로 감싸지 않는다(작성자 본인 또는 ADMIN 만 접근, 그 외 404).
    downloadAttachment(inquiryId: number, attachmentId: number): Promise<Blob>;
  };
  promotions: {
    list(): Promise<PageResponse<PromotionCard>>;
  };
  publicActivities: {
    // GET /api/v1/public-activities — 공개·인증불요. 6도메인 최근 활동 집계(occurredAt DESC).
    list(params?: PublicActivityListParams): Promise<PublicActivityFeed>;
  };
  facilities: {
    // GET /api/v1/facilities — 공개·인증불요. 활성 시설 목록(가벼움).
    list(): Promise<FacilitySummary[]>;
    // GET /api/v1/facilities/usage?yearMonth=YYYY-MM — yearMonth 생략 시 현재월.
    usage(yearMonth?: string): Promise<FacilityUsageResponse>;
    // GET /api/v1/facilities/{facilityId}?yearMonth=YYYY-MM — 단일 시설 상세(타임라인용).
    get(facilityId: number, yearMonth?: string): Promise<FacilityDetailResponse>;
    // GET /api/v1/facilities/{facilityId}/availability?yearMonth= — 공개. 직전 월·당월·익월만 허용(400). 직전 월은 저장 스냅샷 열람.
    availability(facilityId: number, yearMonth?: string): Promise<FacilityAvailabilityResponse>;
    // GET /api/v1/facilities/booking-purpose-presets — 공개. 사용 목적 Preset(시드).
    purposePresets(): Promise<PurposePreset[]>;
    // GET /api/v1/facilities/booking-window — 공개. 현재 예약 오픈 구간(전 시설 공통).
    bookingWindow(): Promise<FacilityBookingWindow>;
  };
  facilityBookings: {
    // POST /api/v1/clubs/{clubId}/facility-bookings — 운영진 전용(쿠키 세션). 409=슬롯 불가/중복/상한.
    create(clubId: number, payload: CreateFacilityBookingPayload): Promise<CreateFacilityBookingResult>;
    // GET /api/v1/clubs/{clubId}/facility-bookings?status= — 운영진 전용, P1 미페이징(최신순)
    list(clubId: number, status?: BookingStatus): Promise<FacilityBookingSummary[]>;
    // GET /api/v1/clubs/{clubId}/facility-bookings/{bookingId} — 상태 이력(최신순) 포함
    get(clubId: number, bookingId: number): Promise<FacilityBookingDetail>;
    // POST /api/v1/clubs/{clubId}/facility-bookings/{bookingId}/cancel — PENDING 전용, 바디 없음(204)
    cancel(clubId: number, bookingId: number): Promise<void>;
  };
  notifications: {
    list(unreadOnly: boolean, page: number, size: number): Promise<PageResponse<Notification>>;
    unreadCount(): Promise<{ count: number }>;
    markRead(notificationId: number): Promise<void>;
    markAllRead(): Promise<void>;
    markBroadcastRead(broadcastId: number): Promise<void>;
  };
  leaderSuccession: {
    submitRequest(clubId: number, payload: SubmitSuccessionRequestPayload): Promise<number>;
  };
  promotionRequests: {
    submit(clubId: number, payload: SubmitPromotionRequestPayload): Promise<number>;
  };
  clubMembership: {
    /** 해당 동아리의 멤버가 아니면 null (200 + data:null). 접근 거부(비 ACTIVE 동아리 등)만 ApiError. */
    get(clubId: number): Promise<MyClubMembership | null>;
  };
  clubNotices: {
    listForClub(
      clubId: number,
      params: { page?: number; size?: number },
    ): Promise<PageResponse<NoticeCardItem>>;
    get(clubId: number, noticeId: number): Promise<ClubNoticeDetail>;
    create(clubId: number, payload: CreateClubNoticePayload): Promise<number>;
    update(clubId: number, noticeId: number, payload: UpdateClubNoticePayload): Promise<void>;
    remove(clubId: number, noticeId: number): Promise<void>;
  };
  clubEvents: {
    list(clubId: number, params?: ClubEventListParams): Promise<ClubEventCard[]>;
    get(clubId: number, eventId: number): Promise<ClubEventDetail>;
    create(clubId: number, payload: CreateClubEventPayload): Promise<number>;
    update(clubId: number, eventId: number, payload: UpdateClubEventPayload): Promise<void>;
    remove(clubId: number, eventId: number): Promise<void>;
  };
  globalEvents: {
    list(params?: GlobalEventListParams): Promise<GlobalEventCard[]>;
    get(eventId: number): Promise<GlobalEventDetail>;
  };
  reports: {
    submit(payload: SubmitReportPayload): Promise<number>;
  };
  admin: AdminApi;
  interviewRounds: {
    // === 면접 라운드 후보 조회 (BE#2) ===
    // GET /leader/recruitments/{recruitmentId}/interview-round-candidates
    candidates(recruitmentId: number, includeUndecided: boolean): Promise<InterviewRoundCandidate[]>;
    // === 면접 라운드 목록 (BE#6) ===
    // GET /leader/recruitments/{recruitmentId}/interview-rounds
    list(recruitmentId: number): Promise<InterviewRoundSummary[]>;
    // === 면접 라운드 상세 (BE#6) ===
    // GET /leader/interview-rounds/{roundId}
    detail(roundId: number): Promise<InterviewRoundDetail>;
    // === 면접 라운드 생성 (BE#3) ===
    // POST /leader/recruitments/{recruitmentId}/interview-rounds
    create(recruitmentId: number, payload: CreateInterviewRoundPayload): Promise<CreateInterviewRoundResult>;
    // === 면접 라운드 수정 (BE#12) ===
    // PATCH /leader/interview-rounds/{roundId}
    update(roundId: number, payload: UpdateInterviewRoundPayload): Promise<void>;
    // === 면접 라운드 취소 ===
    // POST /leader/interview-rounds/{roundId}/cancel
    cancel(roundId: number): Promise<void>;
    // === 슬롯 일괄 생성 (BE#4) ===
    // POST /leader/interview-rounds/{roundId}/slots
    createSlots(roundId: number, payload: CreateRoundSlotsPayload): Promise<CreateRoundSlotsResult>;
    // === 슬롯 삭제 ===
    // DELETE /leader/interview-slots/{slotId}
    deleteSlot(slotId: number): Promise<void>;
    // === 가능시간 요청 발송 (BE#5) ===
    // POST /leader/interview-rounds/{roundId}/request-availability
    requestAvailability(roundId: number): Promise<AvailabilityRequestResult>;
    // === 자동배정 실행 (BE#11) ===
    // POST /leader/interview-rounds/{roundId}/auto-assign
    autoAssign(roundId: number): Promise<RoundAutoAssignResult>;
    // === 수동 배정 (BE#11) ===
    // PUT /leader/interview-rounds/{roundId}/members/{memberId}/schedule
    assignMemberSchedule(roundId: number, memberId: number, payload: { slotId: number }): Promise<void>;
    // === 배정 해제 (BE#11) ===
    // DELETE /leader/interview-rounds/{roundId}/members/{memberId}/schedule
    unassignMemberSchedule(roundId: number, memberId: number): Promise<void>;
    // === 멤버 제외 (BE#11) ===
    // POST /leader/interview-rounds/{roundId}/members/{memberId}/exclude
    excludeMember(roundId: number, memberId: number): Promise<void>;
    // === 라운드 확정 (BE#11) — force=false 시 409 + UnresolvedMembersPayload ===
    // POST /leader/interview-rounds/{roundId}/confirm?force=
    confirm(roundId: number, force: boolean): Promise<RoundConfirmResult>;
    // === 재알림 발송 (BE#11) ===
    // POST /leader/interview-rounds/{roundId}/remind
    // 발송과 동일 응답 형태 (notifiedMemberCount)
    remind(roundId: number): Promise<AvailabilityRequestResult>;
    // === 슬롯 수정 (BE#11) ===
    // PATCH /leader/interview-slots/{slotId}
    updateSlot(slotId: number, payload: UpdateInterviewSlotPayload): Promise<void>;
  };
  applicantInterview: {
    // === 지원자 면접 진행 단계 조회 (BE#7) ===
    // GET /applications/{applicationId}/interview
    view(applicationId: number): Promise<ApplicantInterviewView>;
    // === 면접 가능 시간 응답 (BE#8 — XOR payload) ===
    // PUT /applications/{applicationId}/interview-availability
    respond(applicationId: number, payload: RespondAvailabilityPayload): Promise<void>;
  };
  leader: {
    // === 회비(fee) 정책·청구 (운영진 LEADER/OFFICER) ===
    fees: {
      listPolicies(clubId: number): Promise<FeePolicy[]>;
      createPolicy(clubId: number, payload: CreateFeePolicyPayload): Promise<number>;
      updatePolicy(clubId: number, policyId: number, payload: UpdateFeePolicyPayload): Promise<void>;
      deletePolicy(clubId: number, policyId: number): Promise<void>;
      generateBills(
        clubId: number,
        policyId: number,
        payload: GenerateBillsPayload,
      ): Promise<GenerateBillsResult>;
      listBills(clubId: number, params: BillSearchParams): Promise<PageResponse<FeeBill>>;
      cancelBill(clubId: number, billId: number): Promise<void>;
      payments: {
        record(clubId: number, billId: number, payload: RecordPaymentPayload): Promise<number>;
        list(clubId: number, billId: number): Promise<Payment[]>;
        void(clubId: number, billId: number, paymentId: number, reason?: string): Promise<void>;
      };
      summary(clubId: number, params: FeeSummaryParams): Promise<FeeBillSummary>;
      // 청구 영수증(ACTIVE 납부 없거나 취소 청구면 404).
      receipt(clubId: number, billId: number): Promise<Receipt>;
      // 회비 계좌 (동아리당 1건 — upsert 는 생성된/갱신된 계좌 id 반환).
      // get 은 계좌 미등록 시 404 — 호출부(훅)가 ApiError(status 404)로 빈 상태를 판별한다(null 로 삼키지 않는다).
      account: {
        get(clubId: number): Promise<FeeAccount>;
        upsert(clubId: number, payload: FeeAccountPayload): Promise<number>;
        remove(clubId: number): Promise<void>;
      };
      // === BANK 매칭 (Sprint 3) ===
      // 민감 인증정보(계좌 비번·주민번호)는 sync 페이로드로만 전달하고 어디에도 영속화/로깅하지 않는다.
      bank: {
        // GET /leader/clubs/{clubId}/bank-matching — 자동매칭 사용 가능 여부(거래 동기화 사전 게이팅용).
        status(clubId: number): Promise<BankMatchingStatus>;
        // POST /leader/clubs/{clubId}/bank-transactions/sync — 거래 동기화(적재 건수 반환).
        sync(clubId: number, payload: SyncBankTransactionsPayload): Promise<SyncResult>;
        // GET /leader/clubs/{clubId}/bank-transactions — 검토 큐 조회(status 미지정 시 백엔드 PENDING).
        list(clubId: number, params: BankTransactionSearchParams): Promise<PageResponse<BankTransaction>>;
        // POST /leader/clubs/{clubId}/bank-transactions/{txId}/approve — 후보 청구로 매칭 승인.
        approve(clubId: number, txId: number, feeBillId: number): Promise<void>;
        // POST /leader/clubs/{clubId}/bank-transactions/{txId}/ignore — 거래 무시 처리.
        ignore(clubId: number, txId: number): Promise<void>;
        // POST /leader/clubs/{clubId}/bank-transactions/{txId}/unmatch — 매칭 해제(납부 무효화).
        unmatch(clubId: number, txId: number): Promise<void>;
      };
    };
    // === 금전출납부(cashbook) — 동아리 회계 장부(수입·지출) ===
    cashbook: {
      list(clubId: number, params: CashbookSearchParams): Promise<PageResponse<CashbookEntry>>;
      summary(clubId: number, params: CashbookSearchParams): Promise<CashbookSummary>;
      create(clubId: number, payload: CreateCashbookEntryPayload): Promise<number>;
      update(clubId: number, entryId: number, payload: UpdateCashbookEntryPayload): Promise<void>;
      remove(clubId: number, entryId: number): Promise<void>;
      setExclusion(clubId: number, entryId: number, excluded: boolean): Promise<void>;
    };
  };
  my: {
    // === 회원 본인 회비 조회 ===
    fees(params: MyFeeSearchParams): Promise<MyFee[]>;
    // 회원 본인 청구 영수증(ACTIVE 납부 없거나 취소·타인 청구면 404).
    feeReceipt(billId: number): Promise<Receipt>;
  };
  raw: KyInstance;
};

export type AuthTransport = 'bearer' | 'cookie';

export type CreateApiClientOptions = {
  baseUrl: string;
  authTransport?: AuthTransport;
};

export function createApiClient(options: CreateApiClientOptions): DuingApiClient {
  const { baseUrl } = options;
  const authTransport = options.authTransport ?? 'bearer';
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  // refresh 호출은 bare ky — http 인스턴스의 훅(401→갱신)을 태우면 자기재귀가 되므로 분리한다.
  // throwHttpErrors:false 로 상태코드를 직접 분기: 401/404=세션 종료(404 는 BE 롤백 호환 §19.2),
  // 그 외 실패(5xx·네트워크·타임아웃)=일시 장애로 보고 세션을 유지한다(§17).
  // notifyUnauthorized 는 이 실행기(single-flight 로 사이클당 1회만 실행)에서 발화한다 —
  // 대기자마다 부르면 동시 401 N건이 알림을 N번 쏜다(하류 핸들러가 멱등이어도 계약은 1회가 명확).
  const refreshCoordinator =
    authTransport === 'cookie'
      ? createRefreshCoordinator(async (): Promise<RefreshOutcome> => {
          try {
            const refreshResponse = await ky.post(`${normalizedBaseUrl}/auth/web/refresh`, {
              credentials: 'include',
              retry: 0,
              timeout: REQUEST_TIMEOUT_MS.authFlow,
              throwHttpErrors: false,
            });
            if (refreshResponse.status === 204) return 'refreshed';
            if (refreshResponse.status === 401 || refreshResponse.status === 404) {
              notifyUnauthorized();
              return 'session-expired';
            }
            return 'unavailable';
          } catch {
            return 'unavailable';
          }
        })
      : null;
  const http = ky.create({
    prefixUrl: normalizedBaseUrl,
    credentials: authTransport === 'cookie' ? 'include' : 'same-origin',
    timeout: REQUEST_TIMEOUT_MS.default,
    // 재시도의 단일 진실원은 React Query 정책(shouldRetryQuery) — 스펙 §3.4 일원화.
    // ky 레벨 재시도(GET 계열 기본 2회)를 켜두면 5xx·네트워크 실패를 RQ 와 이중으로 재시도하고,
    // 오프라인 fail-fast(beforeRequest 즉시 실패)마저 3회 평가돼 "즉시"가 아니게 되므로 끈다.
    retry: 0,
    hooks: {
      beforeRequest: [
        async (request) => {
          // 확실한 오프라인이면 타임아웃까지 기다리지 않고 즉시 실패시킨다. (스펙 §3.3)
          if (isKnownOffline()) {
            throw new ApiError(0, NETWORK_ERROR_MESSAGE, undefined, 'NETWORK');
          }
          if (authTransport === 'bearer') {
            const token = await readToken();
            if (token) {
              request.headers.set('Authorization', `Bearer ${token}`);
            }
          }
        },
      ],
      afterResponse: [
        async (request, options, response) => {
          if (response.status !== 401) {
            return;
          }
          if (authTransport === 'cookie') {
            // authTransport==='cookie' 면 refreshCoordinator 는 구조상 항상 존재하지만,
            // 타입 내로잉으로 non-null 단언(!)을 피한다(레포 규약). 도달 불가 가드.
            if (refreshCoordinator === null) {
              return;
            }
            // 로그인(자격 오류)·로그아웃(의도적)·refresh 자신(조율기가 전담)의 401 은 갱신 대상이 아니다.
            const isAuthPath =
              request.url.endsWith('/auth/web/login') ||
              request.url.endsWith('/auth/web/logout') ||
              request.url.endsWith('/auth/web/refresh');
            if (isAuthPath) {
              return;
            }
            const outcome = await refreshCoordinator.ensureFreshSession();
            if (outcome === 'refreshed' || outcome === 'skipped') {
              // ky 공식 재시도 패턴 — bare ky 는 이 훅을 다시 타지 않아 루프가 없고,
              // 재시도가 다시 401 이어도 그대로 표면화된다(다음 요청이 새 갱신 사이클을 연다).
              // retry:0 명시 — bare ky 기본값은 GET 계열 5xx 에 2회 자동 재시도라, 비워두면
              // "재시도 단일 진실원=RQ(retry:0)" 정책(전역 http 훅 주석 참조)이 이 경로에서만 깨진다.
              // 원 요청의 per-request timeout(업로드 60s·facilityOnDemand 18s 등)을 물려준다 —
              // 훅 2번째 인자 options 는 런타임엔 정규화된 timeout(number | false, 기본 10s)을 담지만
              // ky 타입엔 빠져 있어 Reflect.get + 런타임 가드로 as 없이 추출한다.
              const preservedTimeout = Reflect.get(options, 'timeout');
              if (typeof preservedTimeout === 'number' || preservedTimeout === false) {
                return ky(request, { retry: 0, timeout: preservedTimeout });
              }
              return ky(request, { retry: 0 });
            }
            // 'session-expired'(알림은 실행기가 1회 발화) · 'unavailable' — 원 401 표면화 (§17)
            return;
          }
          // Bearer(모바일) 모드는 기존 동작 유지 — refresh 연동은 RN(PR-4)에서.
          // 단, 로그아웃 요청의 401 은 세션 만료 신호가 아니다 — 이미 만료/무효화된 토큰으로도
          // 폐기를 시도하므로 401 이 정상이다. 전역 만료 핸들러를 깨우면 의도적 로그아웃에 오탐이 뜬다.
          const isBearerLogoutRequest = request.url.endsWith('/auth/logout');
          if (request.headers.has('Authorization') && !isBearerLogoutRequest) {
            notifyUnauthorized();
          }
        },
      ],
    },
  });

  async function jsonOk<T>(promise: ResponsePromise): Promise<T> {
    try {
      const res = await promise;
      const body = (await readBodyWithTimeout(res.json(), JSON_BODY_READ_TIMEOUT_MS)) as ApiResponse<T>;
      return unwrap(body);
    } catch (error) {
      return toApiError(error);
    }
  }

  // 200 + data:null 이 정상 결과인 조회 전용 — jsonOk 는 null 을 오류로 바꾼다.
  async function jsonOkNullable<T>(promise: ResponsePromise): Promise<T | null> {
    try {
      const res = await promise;
      const body = (await readBodyWithTimeout(
        res.json(),
        JSON_BODY_READ_TIMEOUT_MS,
      )) as ApiResponse<T | null>;
      return unwrapNullable(body);
    } catch (error) {
      return toApiError(error);
    }
  }

  async function jsonVoid(promise: ResponsePromise): Promise<void> {
    try {
      await promise;
    } catch (error) {
      return toApiError(error);
    }
  }

  // 원본 바이트 응답(ApiResponse 미래핑) 전용 — 성공 시 body 를 blob 으로 읽는다.
  // 실패(HTTPError)는 GlobalExceptionHandler 가 이 엔드포인트에서도 ApiResponse JSON 을 그대로
  // 내려주므로 jsonOk/jsonVoid 와 동일하게 toApiError 로 위임한다.
  async function blobOk(promise: ResponsePromise): Promise<Blob> {
    try {
      const res = await promise;
      return await readBodyWithTimeout(res.blob(), BLOB_BODY_READ_TIMEOUT_MS);
    } catch (error) {
      return toApiError(error);
    }
  }

  return {
    auth: {
      signup: (payload) =>
        jsonOk<number>(http.post('auth/signup', { json: payload, timeout: REQUEST_TIMEOUT_MS.authFlow })),
      login: async (payload) => {
        if (authTransport === 'cookie') {
          const result = await jsonOk<WebLoginResult>(
            http.post('auth/web/login', { json: payload, timeout: REQUEST_TIMEOUT_MS.login }),
          );
          return result.user;
        }
        const result = await jsonOk<LoginResult>(
          http.post('auth/login', { json: payload, timeout: REQUEST_TIMEOUT_MS.login }),
        );
        await writeToken(result.accessToken);
        return result.user;
      },
      startPhoneVerification: (payload, includeQr) =>
        jsonOk<PhoneVerificationSession>(
          http.post('auth/phone-verifications', {
            json: payload,
            searchParams: includeQr ? { qr: 'true' } : undefined,
            timeout: REQUEST_TIMEOUT_MS.authFlow,
          }),
        ),
      getPhoneVerificationStatus: (verificationToken) =>
        jsonOk<PhoneVerificationStatus>(
          http.post('auth/phone-verifications/status', {
            json: { verificationToken },
            timeout: REQUEST_TIMEOUT_MS.authFlow,
          }),
        ),
      requestPasswordReset: (payload, includeQr) =>
        jsonOk<PasswordResetSession>(
          http.post('auth/password-resets', {
            json: payload,
            searchParams: includeQr ? { qr: 'true' } : undefined,
            timeout: REQUEST_TIMEOUT_MS.authFlow,
          }),
        ),
      completePasswordReset: (payload) =>
        jsonVoid(
          http.post('auth/password-resets/complete', {
            json: payload,
            timeout: REQUEST_TIMEOUT_MS.authFlow,
          }),
        ),
      logout: async () => {
        if (authTransport === 'cookie') {
          return jsonVoid(
            http.post('auth/web/logout', { timeout: REQUEST_TIMEOUT_MS.logoutRevoke }),
          );
        }
        try {
          await jsonVoid(http.post('auth/logout', { timeout: REQUEST_TIMEOUT_MS.logoutRevoke }));
        } catch {
          // Bearer 로그아웃의 서버 토큰 폐기는 best-effort이다.
        } finally {
          await clearToken();
        }
      },
    },
    users: {
      me: () => jsonOk<User>(http.get('users/me')),
      myApplications: (scope) =>
        jsonOk<ApplicationSummary[]>(
          http.get('users/me/applications', {
            searchParams: scope ? { scope } : undefined,
          }),
        ),
      myClubs: () => jsonOk<MyClubSummary[]>(http.get('me/clubs')),
      updateProfile: (payload) => jsonVoid(http.patch('users/me', { json: payload })),
      changePassword: (payload) => jsonVoid(http.patch('users/me/password', { json: payload })),
      startPhoneChangeVerification: (payload, includeQr) =>
        jsonOk<PhoneVerificationSession>(
          http.post('users/me/phone-verifications', {
            json: payload,
            searchParams: includeQr ? { qr: 'true' } : undefined,
            timeout: REQUEST_TIMEOUT_MS.authFlow,
          }),
        ),
      changePhone: (payload) =>
        jsonVoid(
          http.patch('users/me/phone', { json: payload, timeout: REQUEST_TIMEOUT_MS.authFlow }),
        ),
      withdraw: () => jsonVoid(http.delete('users/me')),
      sessions: () => jsonOk<MySession[]>(http.get('users/me/sessions')),
      revokeSession: (sessionId) => jsonVoid(http.delete(`users/me/sessions/${sessionId}`)),
      logoutAllSessions: () =>
        jsonVoid(http.delete('users/me/sessions', { timeout: REQUEST_TIMEOUT_MS.logoutRevoke })),
    },
    clubs: {
      list: (params) =>
        jsonOk<PageResponse<ClubSummary>>(
          http.get('clubs', {
            searchParams: cleanParams(params),
            timeout: REQUEST_TIMEOUT_MS.search,
          }),
        ),
      stats: () => jsonOk<ClubStats>(http.get('clubs/stats')),
      detail: (clubId) => jsonOk<ClubDetail>(http.get(`clubs/${clubId}`)),
      recordView: (clubId, payload) =>
        jsonVoid(http.post(`clubs/${clubId}/views`, { json: payload })),
      create: (payload) =>
        jsonOk<number>(http.post('admin/clubs', { json: payload })),
      update: (clubId, payload) =>
        jsonOk<ClubDetail>(http.patch(`clubs/${clubId}`, { json: payload })),
      updateStatus: (clubId, payload) =>
        jsonVoid(http.patch(`admin/clubs/${clubId}/status`, { json: payload })),
      updateCentralClub: (clubId, payload) =>
        jsonVoid(http.patch(`admin/clubs/${clubId}/central-club`, { json: payload })),
      updateFacilitySecuredTimeTarget: (clubId, payload) =>
        jsonVoid(http.patch(`admin/clubs/${clubId}/facility-secured-time-target`, { json: payload })),
      close: (clubId, payload) =>
        jsonVoid(http.post(`admin/clubs/${clubId}/close`, { json: payload })),
      photos: (clubId) => jsonOk<ClubPhoto[]>(http.get(`clubs/${clubId}/photos`)),
      createPhoto: (clubId, payload) =>
        jsonOk<ClubPhoto>(http.post(`clubs/${clubId}/photos`, { json: payload })),
      updatePhoto: (clubId, photoId, payload) =>
        jsonVoid(http.patch(`clubs/${clubId}/photos/${photoId}`, { json: payload })),
      reorderPhotos: (clubId, payload) =>
        jsonOk<ClubPhoto[]>(http.put(`clubs/${clubId}/photos/order`, { json: payload })),
      deletePhoto: (clubId, photoId) =>
        jsonVoid(http.delete(`clubs/${clubId}/photos/${photoId}`)),
      heroActivities: (clubId) =>
        jsonOk<ClubHeroActivity[]>(http.get(`clubs/${clubId}/hero-activities`)),
      createHeroActivity: (clubId, payload) =>
        jsonOk<ClubHeroActivity>(http.post(`clubs/${clubId}/hero-activities`, { json: payload })),
      updateHeroActivity: (clubId, heroActivityId, payload) =>
        jsonVoid(http.patch(`clubs/${clubId}/hero-activities/${heroActivityId}`, { json: payload })),
      reorderHeroActivities: (clubId, payload) =>
        jsonOk<ClubHeroActivity[]>(http.put(`clubs/${clubId}/hero-activities/order`, { json: payload })),
      deleteHeroActivity: (clubId, heroActivityId) =>
        jsonVoid(http.delete(`clubs/${clubId}/hero-activities/${heroActivityId}`)),
      members: (clubId) =>
        jsonOk<ClubMember[]>(http.get(`clubs/${clubId}/members`)),
      membersExport: (clubId, includePhone, memberIds) => {
        // memberIds 는 반복 파라미터(memberIds=1&memberIds=2)로 보낸다 — Spring List<Long> 바인딩 형식.
        const searchParams = new URLSearchParams({ includePhone: String(includePhone) });
        memberIds?.forEach((memberId) => searchParams.append('memberIds', String(memberId)));
        return jsonOk<ClubMemberExportRow[]>(
          http.get(`clubs/${clubId}/members/export`, { searchParams }),
        );
      },
      memberPhone: (clubId, memberId) =>
        jsonOk<ClubMemberPhone>(http.get(`clubs/${clubId}/members/${memberId}/phone`)),
      updateMemberRole: (clubId, memberId, payload) =>
        jsonVoid(http.patch(`clubs/${clubId}/members/${memberId}/role`, { json: payload })),
      updateMemberGeneration: (clubId, memberId, payload) =>
        jsonVoid(http.patch(`clubs/${clubId}/members/${memberId}/generation`, { json: payload })),
      removeMember: (clubId, memberId) =>
        jsonVoid(http.delete(`clubs/${clubId}/members/${memberId}`)),
      leaveClub: (clubId) =>
        jsonVoid(http.delete(`clubs/${clubId}/members/me`)),
      transferLeader: (clubId, memberId) =>
        jsonOk<TransferLeaderResult>(http.post(`clubs/${clubId}/members/${memberId}/transfer-leader`)),
      recruitmentsByClub: (clubId) =>
        jsonOk<RecruitmentSummary[]>(http.get(`clubs/${clubId}/recruitments`)),
      managedByMe: () =>
        jsonOk<ManagedClub[]>(http.get('leader/clubs/me/managed')),
      feeAccount: (clubId) =>
        jsonOk<FeeAccount>(http.get(`clubs/${clubId}/fee-account`)),
    },
    joinCodes: {
      createForRecruitment: (clubId, recruitmentId, payload) =>
        jsonOk<JoinCodeSummary>(
          http.post(`clubs/${clubId}/recruitments/${recruitmentId}/join-codes`, { json: payload }),
        ),
      getActiveForRecruitment: (clubId, recruitmentId) =>
        jsonOkNullable<JoinCodeSummary>(
          http.get(`clubs/${clubId}/recruitments/${recruitmentId}/join-codes/active`),
        ),
      revokeForRecruitment: (clubId, recruitmentId, joinCodeId) =>
        jsonVoid(
          http.delete(`clubs/${clubId}/recruitments/${recruitmentId}/join-codes/${joinCodeId}`),
        ),
      createClubInvite: (clubId, payload) =>
        jsonOk<JoinCodeSummary>(http.post(`clubs/${clubId}/join-codes`, { json: payload })),
      getActiveClubInvite: (clubId) =>
        jsonOkNullable<JoinCodeSummary>(http.get(`clubs/${clubId}/join-codes/active`)),
      revokeClubInvite: (clubId, joinCodeId) =>
        jsonVoid(http.delete(`clubs/${clubId}/join-codes/${joinCodeId}`)),
      listRequests: (clubId, status) =>
        jsonOk<JoinRequestSummary[]>(
          http.get(`clubs/${clubId}/join-requests`, { searchParams: { status } }),
        ),
      getRequestDetail: (clubId, joinRequestId) =>
        jsonOk<JoinRequestDetail>(http.get(`clubs/${clubId}/join-requests/${joinRequestId}`)),
      decideRequest: (clubId, joinRequestId, payload) =>
        jsonOk<JoinRequestDecisionResponse>(
          http.patch(`clubs/${clubId}/join-requests/${joinRequestId}`, { json: payload }),
        ),
      bulkApproveRequests: (clubId, payload) =>
        jsonOk<BulkApproveResult>(
          http.patch(`clubs/${clubId}/join-requests/bulk-approve`, { json: payload }),
        ),
      check: (code) => jsonOk<JoinCodeCheck>(http.get(`join-codes/${encodeURIComponent(code)}`)),
      createRequest: (code) =>
        jsonVoid(http.post(`join-codes/${encodeURIComponent(code)}/requests`)),
    },
    files: {
      upload: (file, purpose) => {
        const body = new FormData();
        body.append('file', file);
        // ky 는 FormData 를 자동으로 multipart/form-data 로 처리한다.
        return jsonOk<FileUploadResult>(
          http.post('files', { body, searchParams: { purpose }, timeout: REQUEST_TIMEOUT_MS.upload }),
        );
      },
    },
    recruitments: {
      calendar: (yearMonth) =>
        jsonOk<RecruitmentSummary[]>(
          http.get('recruitments', { searchParams: { yearMonth } }),
        ),
      detail: (recruitmentId) =>
        jsonOk<RecruitmentDetail>(http.get(`recruitments/${recruitmentId}`)),
      create: (clubId, payload) =>
        jsonOk<number>(
          http.post(`leader/clubs/${clubId}/recruitments`, { json: payload }),
        ),
      update: (recruitmentId, payload) =>
        jsonVoid(
          http.patch(`leader/recruitments/${recruitmentId}`, { json: payload }),
        ),
      close: (recruitmentId) =>
        jsonVoid(http.patch(`leader/recruitments/${recruitmentId}/close`)),
      stopIntake: (recruitmentId) =>
        jsonVoid(http.patch(`leader/recruitments/${recruitmentId}/stop-intake`)),
      remove: (recruitmentId) =>
        jsonVoid(http.delete(`leader/recruitments/${recruitmentId}`)),
    },
    applications: {
      submit: (recruitmentId, payload) =>
        jsonOk<number>(
          http.post(`recruitments/${recruitmentId}/applications`, { json: payload }),
        ),
      checkEligibility: (recruitmentId) =>
        jsonVoid(http.get(`recruitments/${recruitmentId}/applications/eligibility`)),
      // 지원자 필터 5개는 전부 문자열이라 cleanParams 의 빈값 제거 규칙(undefined·null·'')이
      // 필드별 수기 falsy 검사와 같은 결과를 낸다. 목록과 이웃 탐색은 같은 조건을 보내야 하므로 한 벌로 둔다.
      applicants: (recruitmentId, filters) =>
        jsonOk<Applicant[]>(
          http.get(`leader/recruitments/${recruitmentId}/applications`, {
            searchParams: cleanParams(filters),
            timeout: REQUEST_TIMEOUT_MS.search,
          }),
        ),
      applicantNeighbors: (recruitmentId, applicationId, filters) =>
        jsonOk<ApplicantNeighbors>(
          http.get(`leader/recruitments/${recruitmentId}/applications/${applicationId}/neighbors`, {
            searchParams: cleanParams(filters),
          }),
        ),
      updateStatus: (applicationId, payload) =>
        jsonVoid(
          http.patch(`leader/applications/${applicationId}/status`, { json: payload }),
        ),
      bulkUpdateStatus: (payload) =>
        jsonOk<BulkUpdateApplicationStatusResult>(
          http.patch('leader/applications/bulk-status', { json: payload }),
        ),
      myDetail: (applicationId) =>
        jsonOk<MyApplicationDetail>(http.get(`users/me/applications/${applicationId}`)),
      withdraw: (applicationId) =>
        jsonVoid(http.delete(`users/me/applications/${applicationId}`)),
      detail: (applicationId) =>
        jsonOk<ApplicantDetail>(http.get(`leader/applications/${applicationId}`)),
      upsertMyApplicationEvaluation: (applicationId, payload) =>
        jsonVoid(
          http.put(`leader/applications/${applicationId}/evaluations/me`, { json: payload }),
        ),
      deleteMyApplicationEvaluation: (applicationId) =>
        jsonVoid(
          http.delete(`leader/applications/${applicationId}/evaluations/me`),
        ),
    },
    stats: {
      summary: (recruitmentId) =>
        jsonOk<StatsSummary>(
          http.get(`leader/recruitments/${recruitmentId}/stats/summary`),
        ),
      daily: (recruitmentId) =>
        jsonOk<StatsDailyPoint[]>(
          http.get(`leader/recruitments/${recruitmentId}/stats/daily`),
        ),
      funnel: (recruitmentId) =>
        jsonOk<StatsFunnel>(
          http.get(`leader/recruitments/${recruitmentId}/stats/funnel`),
        ),
    },
    favorites: {
      list: (page, size) =>
        jsonOk<PageResponse<FavoriteClub>>(
          http.get('me/favorites', { searchParams: { page, size } }),
        ),
      ids: () => jsonOk<FavoriteIds>(http.get('me/favorites/ids')),
      add: (clubId) => jsonOk<number>(http.post(`me/favorites/${clubId}`)),
      remove: (clubId) => jsonVoid(http.delete(`me/favorites/${clubId}`)),
    },
    drafts: {
      get: (recruitmentId) =>
        jsonOk<ApplicationDraft>(http.get(`recruitments/${recruitmentId}/draft`)),
      upsert: (recruitmentId, payload) =>
        jsonVoid(http.put(`recruitments/${recruitmentId}/draft`, { json: payload })),
      remove: (recruitmentId) =>
        jsonVoid(http.delete(`recruitments/${recruitmentId}/draft`)),
    },
    notices: {
      list: ({ category, tags, keyword, source, page, size }) => {
        const searchParams = new URLSearchParams();
        searchParams.append('page', String(page));
        searchParams.append('size', String(size));
        if (category) searchParams.append('category', category);
        if (keyword) searchParams.append('keyword', keyword);
        if (source) searchParams.append('source', source);
        (tags ?? []).forEach((tag) => searchParams.append('tags', tag));
        return jsonOk<PageResponse<NoticeCardItem>>(
          http.get(`notices?${searchParams.toString()}`),
        );
      },
      detail: (noticeId) =>
        jsonOk<NoticeDetail>(http.get(`notices/${noticeId}`)),
    },
    federationFaqs: {
      list: (params) =>
        jsonOk<PageResponse<FederationFaqItem>>(
          http.get('federation/faqs', { searchParams: cleanParams(params) }),
        ),
      detail: (faqId) => jsonOk<FederationFaqItem>(http.get(`federation/faqs/${faqId}`)),
      // 비로그인도 호출 가능한 공개 경로(permitAll) — http 인스턴스는 토큰이 없으면
      // Authorization 헤더 자체를 붙이지 않으므로(beforeRequest 훅) 별도 분기 불필요.
      submitFeedback: (faqId, payload) =>
        jsonVoid(http.post(`federation/faqs/${faqId}/feedback`, { json: payload })),
    },
    federationFaqCategories: {
      list: () => jsonOk<FederationFaqCategory[]>(http.get('federation/faq-categories')),
    },
    federationInquiries: {
      create: (payload) =>
        jsonOk<number>(http.post('federation/inquiries', { json: payload })),
      listMine: (params) =>
        jsonOk<PageResponse<FederationInquirySummary>>(
          http.get('me/federation-inquiries', { searchParams: cleanParams(params) }),
        ),
      detail: (inquiryId) =>
        jsonOk<FederationInquiryDetail>(http.get(`federation/inquiries/${inquiryId}`)),
      update: (inquiryId, payload) =>
        jsonVoid(http.patch(`federation/inquiries/${inquiryId}`, { json: payload })),
      remove: (inquiryId) =>
        jsonVoid(http.delete(`federation/inquiries/${inquiryId}`)),
      downloadAttachment: (inquiryId, attachmentId) =>
        blobOk(http.get(`federation/inquiries/${inquiryId}/attachments/${attachmentId}`)),
    },
    promotions: {
      list: () => jsonOk<PageResponse<PromotionCard>>(http.get('promotions')),
    },
    publicActivities: {
      list: (params) =>
        jsonOk<PublicActivityFeed>(
          http.get('public-activities', { searchParams: cleanParams(params) }),
        ),
    },
    facilities: {
      list: () => jsonOk<FacilitySummary[]>(http.get('facilities')),
      // usage/get/availability 는 온디맨드 재크롤을 경유할 수 있는 경로 — facilityOnDemand 타임아웃 적용
      usage: (yearMonth) =>
        jsonOk<FacilityUsageResponse>(
          http.get('facilities/usage', {
            searchParams: yearMonth ? { yearMonth } : undefined,
            timeout: REQUEST_TIMEOUT_MS.facilityOnDemand,
          }),
        ),
      get: (facilityId, yearMonth) =>
        jsonOk<FacilityDetailResponse>(
          http.get(`facilities/${facilityId}`, {
            searchParams: yearMonth ? { yearMonth } : undefined,
            timeout: REQUEST_TIMEOUT_MS.facilityOnDemand,
          }),
        ),
      availability: (facilityId, yearMonth) =>
        jsonOk<FacilityAvailabilityResponse>(
          http.get(`facilities/${facilityId}/availability`, {
            searchParams: yearMonth ? { yearMonth } : undefined,
            timeout: REQUEST_TIMEOUT_MS.facilityOnDemand,
          }),
        ),
      purposePresets: () => jsonOk<PurposePreset[]>(http.get('facilities/booking-purpose-presets')),
      bookingWindow: () => jsonOk<FacilityBookingWindow>(http.get('facilities/booking-window')),
    },
    facilityBookings: {
      create: (clubId, payload) =>
        jsonOk<CreateFacilityBookingResult>(
          http.post(`clubs/${clubId}/facility-bookings`, { json: payload }),
        ),
      list: (clubId, status) =>
        jsonOk<FacilityBookingSummary[]>(
          http.get(`clubs/${clubId}/facility-bookings`, {
            searchParams: status ? { status } : undefined,
          }),
        ),
      get: (clubId, bookingId) =>
        jsonOk<FacilityBookingDetail>(http.get(`clubs/${clubId}/facility-bookings/${bookingId}`)),
      cancel: (clubId, bookingId) =>
        jsonVoid(http.post(`clubs/${clubId}/facility-bookings/${bookingId}/cancel`)),
    },
    notifications: {
      list: (unreadOnly, page, size) =>
        jsonOk<PageResponse<Notification>>(
          http.get('me/notifications', { searchParams: { unreadOnly, page, size } }),
        ),
      unreadCount: () =>
        jsonOk<{ count: number }>(http.get('me/notifications/unread-count')),
      markRead: (notificationId) =>
        jsonVoid(http.patch(`me/notifications/${notificationId}/read`)),
      markAllRead: () => jsonVoid(http.patch('me/notifications/read-all')),
      markBroadcastRead: (broadcastId) =>
        jsonVoid(http.patch(`me/notifications/broadcasts/${broadcastId}/read`)),
    },
    leaderSuccession: {
      submitRequest: (clubId, payload) =>
        jsonOk<number>(
          http.post(`clubs/${clubId}/leader-succession-requests`, { json: payload }),
        ),
    },
    promotionRequests: {
      submit: (clubId, payload) =>
        jsonOk<number>(
          http.post(`clubs/${clubId}/promotion-requests`, { json: payload }),
        ),
    },
    clubMembership: {
      get: (clubId) =>
        jsonOkNullable<MyClubMembership>(http.get(`clubs/${clubId}/membership`)),
    },
    clubNotices: {
      listForClub: (clubId, params) =>
        jsonOk<PageResponse<NoticeCardItem>>(
          http.get(`clubs/${clubId}/notices`, { searchParams: cleanParams(params) }),
        ),
      get: (clubId, noticeId) =>
        jsonOk<ClubNoticeDetail>(http.get(`clubs/${clubId}/notices/${noticeId}`)),
      create: (clubId, payload) =>
        jsonOk<number>(http.post(`clubs/${clubId}/notices`, { json: payload })),
      update: (clubId, noticeId, payload) =>
        jsonVoid(http.patch(`clubs/${clubId}/notices/${noticeId}`, { json: payload })),
      remove: (clubId, noticeId) =>
        jsonVoid(http.delete(`clubs/${clubId}/notices/${noticeId}`)),
    },
    clubEvents: {
      list: (clubId, params) =>
        jsonOk<ClubEventCard[]>(
          http.get(`clubs/${clubId}/events`, { searchParams: cleanParams(params ?? {}) }),
        ),
      get: (clubId, eventId) =>
        jsonOk<ClubEventDetail>(http.get(`clubs/${clubId}/events/${eventId}`)),
      create: (clubId, payload) =>
        jsonOk<number>(http.post(`clubs/${clubId}/events`, { json: payload })),
      update: (clubId, eventId, payload) =>
        jsonVoid(http.patch(`clubs/${clubId}/events/${eventId}`, { json: payload })),
      remove: (clubId, eventId) =>
        jsonVoid(http.delete(`clubs/${clubId}/events/${eventId}`)),
    },
    globalEvents: {
      list: (params) =>
        jsonOk<GlobalEventCard[]>(
          http.get('global-events', { searchParams: cleanParams(params ?? {}) }),
        ),
      get: (eventId) =>
        jsonOk<GlobalEventDetail>(http.get(`global-events/${eventId}`)),
    },
    reports: {
      submit: (payload) =>
        jsonOk<number>(http.post('reports', { json: payload })),
    },
    admin: createAdminApi({ http, jsonOk, jsonVoid, blobOk }),
    applicantInterview: {
      view: (applicationId) =>
        jsonOk<ApplicantInterviewView>(http.get(`applications/${applicationId}/interview`)),
      respond: (applicationId, payload) =>
        jsonVoid(http.put(`applications/${applicationId}/interview-availability`, { json: payload })),
    },
    leader: {
      fees: {
        listPolicies: (clubId) =>
          jsonOk<FeePolicy[]>(http.get(`leader/clubs/${clubId}/fee-policies`)),
        createPolicy: (clubId, payload) =>
          jsonOk<number>(http.post(`leader/clubs/${clubId}/fee-policies`, { json: payload })),
        updatePolicy: (clubId, policyId, payload) =>
          jsonVoid(http.patch(`leader/clubs/${clubId}/fee-policies/${policyId}`, { json: payload })),
        deletePolicy: (clubId, policyId) =>
          jsonVoid(http.delete(`leader/clubs/${clubId}/fee-policies/${policyId}`)),
        generateBills: (clubId, policyId, payload) =>
          jsonOk<GenerateBillsResult>(
            http.post(`leader/clubs/${clubId}/fee-policies/${policyId}/bills`, { json: payload }),
          ),
        listBills: (clubId, params) =>
          jsonOk<PageResponse<FeeBill>>(
            http.get(`leader/clubs/${clubId}/fee-bills`, { searchParams: cleanParams(params) }),
          ),
        cancelBill: (clubId, billId) =>
          jsonVoid(http.delete(`leader/clubs/${clubId}/fee-bills/${billId}`)),
        payments: {
          record: (clubId, billId, payload) =>
            jsonOk<number>(http.post(`leader/clubs/${clubId}/fee-bills/${billId}/payments`, { json: payload })),
          list: (clubId, billId) =>
            jsonOk<Payment[]>(http.get(`leader/clubs/${clubId}/fee-bills/${billId}/payments`)),
          void: (clubId, billId, paymentId, reason) =>
            jsonVoid(http.post(`leader/clubs/${clubId}/fee-bills/${billId}/payments/${paymentId}/void`, { json: { reason } })),
        },
        summary: (clubId, params) =>
          jsonOk<FeeBillSummary>(http.get(`leader/clubs/${clubId}/fee-bills/summary`, { searchParams: cleanParams(params) })),
        receipt: (clubId, billId) =>
          jsonOk<Receipt>(http.get(`leader/clubs/${clubId}/fee-bills/${billId}/receipt`)),
        account: {
          get: (clubId) =>
            jsonOk<FeeAccount>(http.get(`leader/clubs/${clubId}/fee-account`)),
          upsert: (clubId, payload) =>
            jsonOk<number>(http.put(`leader/clubs/${clubId}/fee-account`, { json: payload })),
          remove: (clubId) =>
            jsonVoid(http.delete(`leader/clubs/${clubId}/fee-account`)),
        },
        bank: {
          status: (clubId) =>
            jsonOk<BankMatchingStatus>(http.get(`leader/clubs/${clubId}/bank-matching`)),
          // 보안: payload(계좌 비번·주민번호)는 절대 로깅/영속화하지 않는다 — 요청 본문으로만 전달한다.
          sync: (clubId, payload) =>
            jsonOk<SyncResult>(
              http.post(`leader/clubs/${clubId}/bank-transactions/sync`, {
                json: payload,
                timeout: REQUEST_TIMEOUT_MS.bankSync,
              }),
            ),
          list: (clubId, params) =>
            jsonOk<PageResponse<BankTransaction>>(
              http.get(`leader/clubs/${clubId}/bank-transactions`, { searchParams: cleanParams(params) }),
            ),
          approve: (clubId, txId, feeBillId) =>
            jsonVoid(
              http.post(`leader/clubs/${clubId}/bank-transactions/${txId}/approve`, {
                json: { feeBillId },
              }),
            ),
          ignore: (clubId, txId) =>
            jsonVoid(http.post(`leader/clubs/${clubId}/bank-transactions/${txId}/ignore`)),
          unmatch: (clubId, txId) =>
            jsonVoid(http.post(`leader/clubs/${clubId}/bank-transactions/${txId}/unmatch`)),
        },
      },
      cashbook: {
        list: (clubId, params) =>
          jsonOk<PageResponse<CashbookEntry>>(
            http.get(`leader/clubs/${clubId}/cashbook`, { searchParams: cleanParams(params) }),
          ),
        summary: (clubId, params) =>
          jsonOk<CashbookSummary>(
            http.get(`leader/clubs/${clubId}/cashbook/summary`, { searchParams: cleanParams(params) }),
          ),
        create: (clubId, payload) =>
          jsonOk<number>(http.post(`leader/clubs/${clubId}/cashbook`, { json: payload })),
        update: (clubId, entryId, payload) =>
          jsonVoid(http.patch(`leader/clubs/${clubId}/cashbook/${entryId}`, { json: payload })),
        remove: (clubId, entryId) =>
          jsonVoid(http.delete(`leader/clubs/${clubId}/cashbook/${entryId}`)),
        setExclusion: (clubId, entryId, excluded) =>
          jsonVoid(http.patch(`leader/clubs/${clubId}/cashbook/${entryId}/exclusion`, { json: { excluded } })),
      },
    },
    my: {
      fees: (params) =>
        jsonOk<MyFee[]>(http.get('my/fees', { searchParams: cleanParams(params) })),
      feeReceipt: (billId) =>
        jsonOk<Receipt>(http.get(`my/fees/${billId}/receipt`)),
    },
    interviewRounds: {
      candidates: (recruitmentId, includeUndecided) =>
        jsonOk<InterviewRoundCandidate[]>(
          http.get(`leader/recruitments/${recruitmentId}/interview-round-candidates`, {
            searchParams: { includeUndecided },
          }),
        ),
      list: (recruitmentId) =>
        jsonOk<InterviewRoundSummary[]>(
          http.get(`leader/recruitments/${recruitmentId}/interview-rounds`),
        ),
      detail: (roundId) =>
        jsonOk<InterviewRoundDetail>(
          http.get(`leader/interview-rounds/${roundId}`),
        ),
      create: (recruitmentId, payload) =>
        jsonOk<CreateInterviewRoundResult>(
          http.post(`leader/recruitments/${recruitmentId}/interview-rounds`, { json: payload }),
        ),
      update: (roundId, payload) =>
        jsonVoid(http.patch(`leader/interview-rounds/${roundId}`, { json: payload })),
      cancel: (roundId) =>
        jsonVoid(http.post(`leader/interview-rounds/${roundId}/cancel`)),
      createSlots: (roundId, payload) =>
        jsonOk<CreateRoundSlotsResult>(
          http.post(`leader/interview-rounds/${roundId}/slots`, { json: payload }),
        ),
      deleteSlot: (slotId) =>
        jsonVoid(http.delete(`leader/interview-slots/${slotId}`)),
      requestAvailability: (roundId) =>
        jsonOk<AvailabilityRequestResult>(
          http.post(`leader/interview-rounds/${roundId}/request-availability`),
        ),
      autoAssign: (roundId) =>
        jsonOk<RoundAutoAssignResult>(
          http.post(`leader/interview-rounds/${roundId}/auto-assign`),
        ),
      assignMemberSchedule: (roundId, memberId, payload) =>
        jsonVoid(
          http.put(`leader/interview-rounds/${roundId}/members/${memberId}/schedule`, { json: payload }),
        ),
      unassignMemberSchedule: (roundId, memberId) =>
        jsonVoid(
          http.delete(`leader/interview-rounds/${roundId}/members/${memberId}/schedule`),
        ),
      excludeMember: (roundId, memberId) =>
        jsonVoid(
          http.post(`leader/interview-rounds/${roundId}/members/${memberId}/exclude`),
        ),
      confirm: (roundId, force) =>
        jsonOk<RoundConfirmResult>(
          http.post(`leader/interview-rounds/${roundId}/confirm`, {
            searchParams: { force },
          }),
        ),
      remind: (roundId) =>
        jsonOk<AvailabilityRequestResult>(
          http.post(`leader/interview-rounds/${roundId}/remind`),
        ),
      updateSlot: (slotId, payload) =>
        jsonVoid(
          http.patch(`leader/interview-slots/${slotId}`, { json: payload }),
        ),
    },
    raw: http,
  };
}
