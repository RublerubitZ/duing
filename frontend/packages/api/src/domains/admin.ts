import type { KyInstance, ResponsePromise } from 'ky';
import type {
  AdminClubSearchParams,
  AdminClubSummary,
  AdminClubMemberHistoryParams,
  AdminClubMemberHistoryRow,
  AdminPendingCounts,
  AdminSuccessionDetail,
  AdminSuccessionSearchParams,
  AdminSuccessionSummary,
  AssignAdminLeaderPayload,
  ProcessSuccessionPayload,
  AdminUserSearchParams,
  AdminUserSearchResult,
  AdminUserDetail,
  AdminUserPhone,
  ChangeUserStatusPayload,
  UpdateAdminNotePayload,
  AdminReportSearchParams,
  AdminReportSummary,
  AdminReportDetail,
  ProcessReportPayload,
  AdminRecruitmentSearchParams,
  AdminRecruitmentSummary,
  AdminRecruitmentDetail,
  ForceCloseRecruitmentPayload,
  AdminApplicantSearchParams,
  AdminApplicantList,
  AdminApplicationDetail,
  AdminFeeClubSearchParams,
  AdminFeeClubSummary,
  AdminFeePeriodParams,
  AdminFeeDashboard,
  AdminFeeClubDetail,
  AdminFeePolicy,
  AdminFeeBillSearchParams,
  AdminFeeBillRow,
  AdminFeePaymentSearchParams,
  AdminFeePaymentRow,
  AdminFeeAccount,
  AdminFeeAuditLogSearchParams,
  AdminFeeAuditLog,
  AdminFeeAnomalyReport,
  AdminFeeAuditComment,
  FeeAuditCommentKind,
  CreateFeeAuditCommentPayload,
  UpdateFeeAuditCommentPayload,
  AdminPromotionRequestSummary,
  AdminPromotionRequestDetail,
  AdminPromotionRequestSearchParams,
  ProcessPromotionRequestPayload,
  AdminPromotionSummary,
  AdminPromotionSearchParams,
  CreatePromotionPayload,
  UpdatePromotionPayload,
  PageResponse,
  ClubDetail,
  AdminClubMember,
  AdminUpdateClubPayload,
  NoticeDetail,
  NoticeCategory,
  NoticeVisibility,
  AdminNoticeSummary,
  CreateNoticePayload,
  UpdateNoticePayload,
  AdminClubEventCard,
  ClubEventListParams,
  AdminGlobalEventDetail,
  AdminGlobalEventListParams,
  AdminGlobalEventSummary,
  CreateGlobalEventPayload,
  GlobalEventCategoryStats,
  UpdateGlobalEventPayload,
  BankMatchingOverview,
  AdminFacilityBookingSummary,
  AdminFacilityBookingDetail,
  AdminFacilityBookingCounts,
  AdminBookingQueueParams,
  SubmissionCandidatesParams,
  SubmissionCandidatesResponse,
  CreateSubmissionBatchPayload,
  CreateSubmissionBatchResult,
  SubmissionBatchListParams,
  SubmissionBatchSummary,
  SubmissionBatchDetail,
  CompleteSubmissionBatchResult,
  AdminFederationFaqSummary,
  CreateFederationFaqPayload,
  UpdateFederationFaqPayload,
  AdminFederationFaqSearchMiss,
  CreateFederationFaqCategoryPayload,
  UpdateFederationFaqCategoryPayload,
  FederationInquiryStatus,
  AdminFederationInquirySummary,
  AdminFederationInquiryDetail,
  ChangeFederationInquiryStatusPayload,
  AnswerFederationInquiryPayload,
  UpdateFederationInquiryAnswerPayload,
  AdminCrawlReservationGroup,
  AdminCrawlReservationParams,
} from '@duing/types';
import { REQUEST_TIMEOUT_MS, cleanParams } from '../http';

/** 총동연 콘솔 API. `DuingApiClient['admin']` 의 정의 원본 — client.ts 가 이 타입을 import 한다. */
export type AdminApi = {
  /** 콘솔 사이드바 뱃지용 도메인별 미처리 건수. 미처리 판정 기준은 전부 서버가 정한다. */
  pendingCounts(): Promise<AdminPendingCounts>;
  clubs: {
    list(params?: AdminClubSearchParams): Promise<PageResponse<AdminClubSummary>>;
    detail(clubId: number): Promise<ClubDetail>;
    /** 학교 제출용 동아리원 명단(이름·학번·전공·단과대). 총동연 전용, 소속 무관 조회. */
    members(clubId: number): Promise<AdminClubMember[]>;
    /** 총동연 전용 — 잠금 필드(name/category/division/college)까지 수정 가능. */
    update(clubId: number, payload: AdminUpdateClubPayload): Promise<ClubDetail>;
  };
  /**
   * 캘린더용 전 동아리 행사 일정. ACTIVE 동아리만, 카드 정보만 준다.
   * 페이지네이션 없이 창(from~to)으로만 제한한다 — admin.recruitments 와 같은 형태.
   */
  clubEvents: {
    list(params: ClubEventListParams): Promise<AdminClubEventCard[]>;
  };
  users: {
    search(params: AdminUserSearchParams): Promise<PageResponse<AdminUserSearchResult>>;
    detail(userId: number): Promise<AdminUserDetail>;
    changeStatus(userId: number, payload: ChangeUserStatusPayload): Promise<void>;
    updateNote(userId: number, payload: UpdateAdminNotePayload): Promise<void>;
    /** 원본 휴대폰 번호. 서버가 no-store 를 보내며 열람 사실이 감사 로그에 남는다. */
    phone(userId: number): Promise<AdminUserPhone>;
    forceLogout(userId: number): Promise<void>;
  };
  notices: {
    list(params: {
      category?: NoticeCategory;
      visibility?: NoticeVisibility;
      keyword?: string;
      includeExpired?: boolean;
      page: number;
      size: number;
    }): Promise<PageResponse<AdminNoticeSummary>>;
    detail(noticeId: number): Promise<NoticeDetail>;
    create(payload: CreateNoticePayload): Promise<number>;
    update(noticeId: number, payload: UpdateNoticePayload): Promise<void>;
    remove(noticeId: number): Promise<void>;
  };
  federationFaqs: {
    list(params: {
      published?: boolean;
      categoryId?: number;
      keyword?: string;
      page: number;
      size: number;
    }): Promise<PageResponse<AdminFederationFaqSummary>>;
    create(payload: CreateFederationFaqPayload): Promise<number>;
    update(faqId: number, payload: UpdateFederationFaqPayload): Promise<void>;
    remove(faqId: number): Promise<void>;
    reorder(orderedIds: number[]): Promise<void>;
    // 정렬 서버 고정(missCount desc·lastSearchedAt desc), sort 파라미터 미지원.
    searchMisses(params: { page: number; size: number }): Promise<PageResponse<AdminFederationFaqSearchMiss>>;
  };
  federationFaqCategories: {
    create(payload: CreateFederationFaqCategoryPayload): Promise<number>;
    update(categoryId: number, payload: UpdateFederationFaqCategoryPayload): Promise<void>;
    // moveToCategoryId 지정 시 소속 FAQ 전부 이관 후 삭제, 미지정 시 FAQ 가 있으면 409.
    remove(categoryId: number, moveToCategoryId?: number): Promise<void>;
  };
  federationInquiries: {
    list(params: {
      status?: FederationInquiryStatus;
      keyword?: string;
      page: number;
      size: number;
    }): Promise<PageResponse<AdminFederationInquirySummary>>;
    detail(inquiryId: number): Promise<AdminFederationInquiryDetail>;
    changeStatus(inquiryId: number, payload: ChangeFederationInquiryStatusPayload): Promise<void>;
    answer(inquiryId: number, payload: AnswerFederationInquiryPayload): Promise<number>;
    updateAnswer(inquiryId: number, payload: UpdateFederationInquiryAnswerPayload): Promise<void>;
  };
  globalEvents: {
    list(params: AdminGlobalEventListParams): Promise<PageResponse<AdminGlobalEventSummary>>;
    detail(eventId: number): Promise<AdminGlobalEventDetail>;
    create(payload: CreateGlobalEventPayload): Promise<number>;
    update(eventId: number, payload: UpdateGlobalEventPayload): Promise<void>;
    remove(eventId: number): Promise<void>;
    categoryStats(): Promise<GlobalEventCategoryStats>;
  };
  reports: {
    list(params: AdminReportSearchParams): Promise<PageResponse<AdminReportSummary>>;
    get(reportId: number): Promise<AdminReportDetail>;
    process(reportId: number, payload: ProcessReportPayload): Promise<void>;
  };
  recruitments: {
    /** 전 동아리 모집. 페이지네이션 없이 조건에 맞는 목록을 한 번에 준다. */
    list(params: AdminRecruitmentSearchParams): Promise<AdminRecruitmentSummary[]>;
    detail(recruitmentId: number): Promise<AdminRecruitmentDetail>;
    /** 이미 마감된 모집이면 409. */
    forceClose(recruitmentId: number, payload: ForceCloseRecruitmentPayload): Promise<void>;
    /** 자체 지원 모집의 지원자 목록. total·statusCounts 는 검색·필터와 무관한 모집 전체 기준이다. */
    applications(
      recruitmentId: number,
      params: AdminApplicantSearchParams,
    ): Promise<AdminApplicantList>;
    /** 지원서 열람(읽기 전용) — 경로는 모집이 아니라 지원서 단건이다. */
    applicationDetail(applicationId: number): Promise<AdminApplicationDetail>;
  };
  /** 회비 감사 콘솔. 감사자는 회비 데이터를 바꾸지 않는다 — 쓰기는 총동연 자신의 의견·메모뿐이다. */
  fees: {
    list(params: AdminFeeClubSearchParams): Promise<PageResponse<AdminFeeClubSummary>>;
    dashboard(params: AdminFeePeriodParams): Promise<AdminFeeDashboard>;
    /** 호출마다 열람 감사 이벤트가 남는다 — 상세 진입에서만 부른다. */
    detail(clubId: number, params: AdminFeePeriodParams): Promise<AdminFeeClubDetail>;
    policies(clubId: number, params: AdminFeePeriodParams): Promise<AdminFeePolicy[]>;
    bills(clubId: number, params: AdminFeeBillSearchParams): Promise<PageResponse<AdminFeeBillRow>>;
    payments(
      clubId: number,
      params: AdminFeePaymentSearchParams,
    ): Promise<PageResponse<AdminFeePaymentRow>>;
    /** 열람 전용 — 이 경로로 계좌를 바꾸거나 지울 수는 없다. */
    account(clubId: number): Promise<AdminFeeAccount>;
    auditLogs(
      clubId: number,
      params: AdminFeeAuditLogSearchParams,
    ): Promise<PageResponse<AdminFeeAuditLog>>;
    /** 저장된 결과가 아니라 호출 시점에 8개 규칙으로 그 자리에서 평가한 값이다. */
    anomalies(clubId: number, params: AdminFeePeriodParams): Promise<AdminFeeAnomalyReport>;
    comments(clubId: number, kind?: FeeAuditCommentKind): Promise<AdminFeeAuditComment[]>;
    /** 응답은 생성된 의견·메모 ID 뿐이라 목록은 무효화로 다시 받는다. */
    createComment(clubId: number, payload: CreateFeeAuditCommentPayload): Promise<number>;
    updateComment(
      clubId: number,
      commentId: number,
      payload: UpdateFeeAuditCommentPayload,
    ): Promise<void>;
    deleteComment(clubId: number, commentId: number): Promise<void>;
  };
  leaderSuccession: {
    list(params: AdminSuccessionSearchParams): Promise<PageResponse<AdminSuccessionSummary>>;
    get(requestId: number): Promise<AdminSuccessionDetail>;
    process(requestId: number, payload: ProcessSuccessionPayload): Promise<void>;
    assignLeader(clubId: number, payload: AssignAdminLeaderPayload): Promise<void>;
    memberHistory(clubId: number, params: AdminClubMemberHistoryParams): Promise<PageResponse<AdminClubMemberHistoryRow>>;
  };
  promotionRequests: {
    list(params: AdminPromotionRequestSearchParams): Promise<PageResponse<AdminPromotionRequestSummary>>;
    get(requestId: number): Promise<AdminPromotionRequestDetail>;
    process(requestId: number, payload: ProcessPromotionRequestPayload): Promise<void>;
  };
  promotions: {
    list(params: AdminPromotionSearchParams): Promise<PageResponse<AdminPromotionSummary>>;
    detail(promotionId: number): Promise<AdminPromotionSummary>;
    create(payload: CreatePromotionPayload): Promise<number>;
    update(promotionId: number, payload: UpdatePromotionPayload): Promise<void>;
    delete(promotionId: number): Promise<void>;
  };
  facilityBookings: {
    // GET /api/v1/admin/facility-bookings — 큐(정렬은 서버가 status 종속 결정, sort 전송 금지)
    queue(params: AdminBookingQueueParams): Promise<PageResponse<AdminFacilityBookingSummary>>;
    // GET /api/v1/admin/facility-bookings/{bookingId} — 상세+검증 컨텍스트(온디맨드 재크롤)
    detail(bookingId: number): Promise<AdminFacilityBookingDetail>;
    // POST .../approve — 바디 없음. 409+code=FACILITY_BOOKING_SCHOOL_CONFLICT 시 payload에 충돌 상세
    approve(bookingId: number): Promise<void>;
    reject(bookingId: number, reason: string): Promise<void>;
    // POST .../confirm — 수동 확정(자동 매칭 실패분), 바디 없음
    confirm(bookingId: number): Promise<void>;
    markConflict(bookingId: number, detail: string): Promise<void>;
    cancel(bookingId: number, reason: string): Promise<void>;
    // GET .../summary — 대시보드 카드 수치(§9.7)
    summary(): Promise<AdminFacilityBookingCounts>;
  };
  // === 크롤 예약 현황(전면 차단 설계 §3.6) — 읽기 전용, 그룹 단위 페이징 ===
  facilityCrawl: {
    // GET /api/v1/admin/facility-crawl/reservations — 당월·익월만(400), groupBy 기본 CLUB
    reservations(
      params: AdminCrawlReservationParams,
    ): Promise<PageResponse<AdminCrawlReservationGroup>>;
  };
  // === 학교 제출(Submission Batch) — BE §5 ===
  facilitySubmission: {
    // GET .../submission/candidates — 기간 내 전체 예약 + summary(REJECTED 제외)
    candidates(params: SubmissionCandidatesParams): Promise<SubmissionCandidatesResponse>;
    // POST .../submission — all-or-nothing, 409(기제출/미승인)
    create(payload: CreateSubmissionBatchPayload): Promise<CreateSubmissionBatchResult>;
    // GET .../submission/{batchId}/csv — BOM 포함 CSV(비 ApiResponse, Blob 그대로)
    downloadCsv(batchId: number): Promise<Blob>;
    // GET .../submission?page=&size= — 제출 이력 목록(PageResponse)
    list(params: SubmissionBatchListParams): Promise<PageResponse<SubmissionBatchSummary>>;
    // GET .../submission/{batchId} — 상세(batch/bookings/audits, VIEWED 는 BE 부수효과)
    detail(batchId: number): Promise<SubmissionBatchDetail>;
    // POST .../submission/{batchId}/complete — 제출 완료 확정(404/기취소·기완료 409)
    complete(batchId: number): Promise<CompleteSubmissionBatchResult>;
    // DELETE .../submission/{batchId} — 제출 취소(204, 404/기취소·기완료 409)
    cancel(batchId: number): Promise<void>;
  };
  // === BANK 자동매칭 관리 (Sprint 3) ===
  bankMatching: {
    // GET /admin/clubs/bank-matching — 동아리별 상태 목록 + 자동매칭 등록 동아리 수.
    overview(): Promise<BankMatchingOverview>;
    // PUT /admin/clubs/{clubId}/bank-matching — 동아리 자동매칭 허용/해제.
    setActive(clubId: number, active: boolean): Promise<void>;
  };
};

/**
 * client.ts 의 클로저 헬퍼(http 인스턴스·응답 언래퍼)를 인자로 받아 admin 구현을 조립한다.
 * 헬퍼가 createApiClient 스코프에 갇혀 있어 모듈 임포트로는 닿지 않으므로 주입한다.
 */
export function createAdminApi(deps: {
  http: KyInstance;
  jsonOk: <T>(promise: ResponsePromise) => Promise<T>;
  jsonVoid: (promise: ResponsePromise) => Promise<void>;
  blobOk: (promise: ResponsePromise) => Promise<Blob>;
}): AdminApi {
  const { http, jsonOk, jsonVoid, blobOk } = deps;
  return {
    pendingCounts: () => jsonOk<AdminPendingCounts>(http.get('admin/pending-counts')),
    clubs: {
      list: (params) =>
        jsonOk<PageResponse<AdminClubSummary>>(
          http.get('admin/clubs', {
            searchParams: cleanParams(params),
            timeout: REQUEST_TIMEOUT_MS.search,
          }),
        ),
      detail: (clubId) => jsonOk<ClubDetail>(http.get(`admin/clubs/${clubId}`)),
      members: (clubId) =>
        jsonOk<AdminClubMember[]>(http.get(`admin/clubs/${clubId}/members`)),
      update: (clubId, payload) =>
        jsonOk<ClubDetail>(http.patch(`admin/clubs/${clubId}`, { json: payload })),
    },
    clubEvents: {
      list: (params) =>
        jsonOk<AdminClubEventCard[]>(
          http.get('admin/club-events', { searchParams: cleanParams(params) }),
        ),
    },
    users: {
      search: (params) =>
        jsonOk<PageResponse<AdminUserSearchResult>>(
          http.get('admin/users', {
            searchParams: cleanParams(params),
            timeout: REQUEST_TIMEOUT_MS.search,
          }),
        ),
      detail: (userId) => jsonOk<AdminUserDetail>(http.get(`admin/users/${userId}`)),
      changeStatus: (userId, payload) =>
        jsonVoid(http.patch(`admin/users/${userId}/status`, { json: payload })),
      updateNote: (userId, payload) =>
        jsonVoid(http.put(`admin/users/${userId}/admin-note`, { json: payload })),
      phone: (userId) => jsonOk<AdminUserPhone>(http.get(`admin/users/${userId}/phone`)),
      forceLogout: (userId) => jsonVoid(http.post(`admin/users/${userId}/force-logout`)),
    },
    notices: {
      list: (params) => {
        const search = new URLSearchParams();
        search.append('page', String(params.page));
        search.append('size', String(params.size));
        if (params.category) search.append('category', params.category);
        if (params.visibility) search.append('visibility', params.visibility);
        if (params.keyword) search.append('keyword', params.keyword);
        if (params.includeExpired) search.append('includeExpired', 'true');
        return jsonOk<PageResponse<AdminNoticeSummary>>(
          http.get(`admin/notices?${search.toString()}`),
        );
      },
      detail: (noticeId) =>
        jsonOk<NoticeDetail>(http.get(`admin/notices/${noticeId}`)),
      create: (payload) =>
        jsonOk<number>(http.post('admin/notices', { json: payload })),
      update: (noticeId, payload) =>
        jsonVoid(http.patch(`admin/notices/${noticeId}`, { json: payload })),
      remove: (noticeId) =>
        jsonVoid(http.delete(`admin/notices/${noticeId}`)),
    },
    federationFaqs: {
      list: (params) =>
        jsonOk<PageResponse<AdminFederationFaqSummary>>(
          http.get('admin/federation/faqs', { searchParams: cleanParams(params) }),
        ),
      create: (payload) => jsonOk<number>(http.post('admin/federation/faqs', { json: payload })),
      update: (faqId, payload) =>
        jsonVoid(http.patch(`admin/federation/faqs/${faqId}`, { json: payload })),
      remove: (faqId) => jsonVoid(http.delete(`admin/federation/faqs/${faqId}`)),
      reorder: (orderedIds) =>
        jsonVoid(http.put('admin/federation/faqs/order', { json: { orderedIds } })),
      searchMisses: (params) =>
        jsonOk<PageResponse<AdminFederationFaqSearchMiss>>(
          http.get('admin/federation/faq-search-misses', { searchParams: cleanParams(params) }),
        ),
    },
    federationFaqCategories: {
      create: (payload) =>
        jsonOk<number>(http.post('admin/federation/faq-categories', { json: payload })),
      update: (categoryId, payload) =>
        jsonVoid(http.patch(`admin/federation/faq-categories/${categoryId}`, { json: payload })),
      remove: (categoryId, moveToCategoryId) =>
        jsonVoid(
          http.delete(`admin/federation/faq-categories/${categoryId}`, {
            searchParams: cleanParams({ moveToCategoryId }),
          }),
        ),
    },
    federationInquiries: {
      list: (params) =>
        jsonOk<PageResponse<AdminFederationInquirySummary>>(
          http.get('admin/federation/inquiries', { searchParams: cleanParams(params) }),
        ),
      detail: (inquiryId) =>
        jsonOk<AdminFederationInquiryDetail>(http.get(`admin/federation/inquiries/${inquiryId}`)),
      changeStatus: (inquiryId, payload) =>
        jsonVoid(http.patch(`admin/federation/inquiries/${inquiryId}/status`, { json: payload })),
      answer: (inquiryId, payload) =>
        jsonOk<number>(
          http.post(`admin/federation/inquiries/${inquiryId}/answer`, { json: payload }),
        ),
      updateAnswer: (inquiryId, payload) =>
        jsonVoid(http.patch(`admin/federation/inquiries/${inquiryId}/answer`, { json: payload })),
    },
    globalEvents: {
      list: (params) =>
        jsonOk<PageResponse<AdminGlobalEventSummary>>(
          http.get('admin/global-events', { searchParams: cleanParams(params) }),
        ),
      detail: (eventId) =>
        jsonOk<AdminGlobalEventDetail>(http.get(`admin/global-events/${eventId}`)),
      create: (payload) =>
        jsonOk<number>(http.post('admin/global-events', { json: payload })),
      update: (eventId, payload) =>
        jsonVoid(http.patch(`admin/global-events/${eventId}`, { json: payload })),
      remove: (eventId) =>
        jsonVoid(http.delete(`admin/global-events/${eventId}`)),
      categoryStats: async () => {
        const wrapper = await jsonOk<{ distribution: GlobalEventCategoryStats }>(
          http.get('admin/global-events/category-stats'),
        );
        return wrapper.distribution;
      },
    },
    reports: {
      list: (params) =>
        jsonOk<PageResponse<AdminReportSummary>>(
          http.get('admin/reports', { searchParams: cleanParams(params) }),
        ),
      get: (reportId) =>
        jsonOk<AdminReportDetail>(http.get(`admin/reports/${reportId}`)),
      process: (reportId, payload) =>
        jsonVoid(http.patch(`admin/reports/${reportId}`, { json: payload })),
    },
    recruitments: {
      list: (params) =>
        jsonOk<AdminRecruitmentSummary[]>(
          http.get('admin/recruitments', {
            searchParams: cleanParams(params),
            timeout: REQUEST_TIMEOUT_MS.search,
          }),
        ),
      detail: (recruitmentId) =>
        jsonOk<AdminRecruitmentDetail>(http.get(`admin/recruitments/${recruitmentId}`)),
      forceClose: (recruitmentId, payload) =>
        jsonVoid(http.patch(`admin/recruitments/${recruitmentId}/close`, { json: payload })),
      applications: (recruitmentId, params) =>
        jsonOk<AdminApplicantList>(
          http.get(`admin/recruitments/${recruitmentId}/applications`, {
            searchParams: cleanParams(params),
          }),
        ),
      applicationDetail: (applicationId) =>
        jsonOk<AdminApplicationDetail>(http.get(`admin/applications/${applicationId}`)),
    },
    fees: {
      list: (params) =>
        jsonOk<PageResponse<AdminFeeClubSummary>>(
          http.get('admin/fees', {
            searchParams: cleanParams(params),
            timeout: REQUEST_TIMEOUT_MS.search,
          }),
        ),
      dashboard: (params) =>
        jsonOk<AdminFeeDashboard>(
          http.get('admin/fees/dashboard', { searchParams: cleanParams(params) }),
        ),
      detail: (clubId, params) =>
        jsonOk<AdminFeeClubDetail>(
          http.get(`admin/fees/${clubId}`, { searchParams: cleanParams(params) }),
        ),
      policies: (clubId, params) =>
        jsonOk<AdminFeePolicy[]>(
          http.get(`admin/fees/${clubId}/policies`, { searchParams: cleanParams(params) }),
        ),
      bills: (clubId, params) =>
        jsonOk<PageResponse<AdminFeeBillRow>>(
          http.get(`admin/fees/${clubId}/bills`, {
            searchParams: cleanParams(params),
            timeout: REQUEST_TIMEOUT_MS.search,
          }),
        ),
      payments: (clubId, params) =>
        jsonOk<PageResponse<AdminFeePaymentRow>>(
          http.get(`admin/fees/${clubId}/payments`, { searchParams: cleanParams(params) }),
        ),
      account: (clubId) =>
        jsonOk<AdminFeeAccount>(http.get(`admin/fees/${clubId}/account`)),
      // types 배열은 cleanParams 가 같은 키 반복으로 직렬화한다(Spring List<T> 호환).
      auditLogs: (clubId, params) =>
        jsonOk<PageResponse<AdminFeeAuditLog>>(
          http.get(`admin/fees/${clubId}/audit-logs`, {
            searchParams: cleanParams(params),
            timeout: REQUEST_TIMEOUT_MS.search,
          }),
        ),
      anomalies: (clubId, params) =>
        jsonOk<AdminFeeAnomalyReport>(
          http.get(`admin/fees/${clubId}/anomalies`, { searchParams: cleanParams(params) }),
        ),
      comments: (clubId, kind) =>
        jsonOk<AdminFeeAuditComment[]>(
          http.get(`admin/fees/${clubId}/audit-comments`, { searchParams: cleanParams({ kind }) }),
        ),
      createComment: (clubId, payload) =>
        jsonOk<number>(http.post(`admin/fees/${clubId}/audit-comments`, { json: payload })),
      updateComment: (clubId, commentId, payload) =>
        jsonVoid(
          http.patch(`admin/fees/${clubId}/audit-comments/${commentId}`, { json: payload }),
        ),
      deleteComment: (clubId, commentId) =>
        jsonVoid(http.delete(`admin/fees/${clubId}/audit-comments/${commentId}`)),
    },
    leaderSuccession: {
      list: (params) =>
        jsonOk<PageResponse<AdminSuccessionSummary>>(
          http.get('admin/leader-succession-requests', { searchParams: cleanParams(params) }),
        ),
      get: (requestId) =>
        jsonOk<AdminSuccessionDetail>(http.get(`admin/leader-succession-requests/${requestId}`)),
      process: (requestId, payload) =>
        jsonVoid(http.patch(`admin/leader-succession-requests/${requestId}`, { json: payload })),
      assignLeader: (clubId, payload) =>
        jsonVoid(http.post(`admin/clubs/${clubId}/leader`, { json: payload })),
      memberHistory: (clubId, params) =>
        jsonOk<PageResponse<AdminClubMemberHistoryRow>>(
          http.get(`admin/clubs/${clubId}/member-history`, { searchParams: cleanParams(params) }),
        ),
    },
    promotionRequests: {
      list: (params) =>
        jsonOk<PageResponse<AdminPromotionRequestSummary>>(
          http.get('admin/promotion-requests', { searchParams: cleanParams(params) }),
        ),
      get: (requestId) =>
        jsonOk<AdminPromotionRequestDetail>(
          http.get(`admin/promotion-requests/${requestId}`),
        ),
      process: (requestId, payload) =>
        jsonVoid(http.patch(`admin/promotion-requests/${requestId}`, { json: payload })),
    },
    promotions: {
      list: (params) =>
        jsonOk<PageResponse<AdminPromotionSummary>>(
          http.get('admin/promotions', { searchParams: cleanParams(params) }),
        ),
      detail: (promotionId) =>
        jsonOk<AdminPromotionSummary>(http.get(`admin/promotions/${promotionId}`)),
      create: (payload) =>
        jsonOk<number>(http.post('admin/promotions', { json: payload })),
      update: (promotionId, payload) =>
        jsonVoid(http.patch(`admin/promotions/${promotionId}`, { json: payload })),
      delete: (promotionId) =>
        jsonVoid(http.delete(`admin/promotions/${promotionId}`)),
    },
    facilityBookings: {
      queue: (params) =>
        jsonOk<PageResponse<AdminFacilityBookingSummary>>(
          http.get('admin/facility-bookings', { searchParams: cleanParams(params) }),
        ),
      detail: (bookingId) =>
        // 관리자 상세도 온디맨드 재크롤(ensureFresh)을 경유한다 — 공개 가용성과 동일한 타임아웃 필요
        jsonOk<AdminFacilityBookingDetail>(
          http.get(`admin/facility-bookings/${bookingId}`, {
            timeout: REQUEST_TIMEOUT_MS.facilityOnDemand,
          }),
        ),
      approve: (bookingId) => jsonVoid(http.post(`admin/facility-bookings/${bookingId}/approve`)),
      reject: (bookingId, reason) =>
        jsonVoid(http.post(`admin/facility-bookings/${bookingId}/reject`, { json: { reason } })),
      confirm: (bookingId) => jsonVoid(http.post(`admin/facility-bookings/${bookingId}/confirm`)),
      markConflict: (bookingId, detail) =>
        jsonVoid(http.post(`admin/facility-bookings/${bookingId}/conflict`, { json: { detail } })),
      cancel: (bookingId, reason) =>
        jsonVoid(http.post(`admin/facility-bookings/${bookingId}/cancel`, { json: { reason } })),
      summary: () => jsonOk<AdminFacilityBookingCounts>(http.get('admin/facility-bookings/summary')),
    },
    facilityCrawl: {
      reservations: (params) =>
        jsonOk<PageResponse<AdminCrawlReservationGroup>>(
          http.get('admin/facility-crawl/reservations', { searchParams: cleanParams(params) }),
        ),
    },
    facilitySubmission: {
      candidates: (params) =>
        jsonOk<SubmissionCandidatesResponse>(
          http.get('admin/facility-bookings/submission/candidates', { searchParams: cleanParams(params) }),
        ),
      create: (payload) =>
        jsonOk<CreateSubmissionBatchResult>(
          http.post('admin/facility-bookings/submission', { json: payload }),
        ),
      // 원본 바이트(BOM CSV·비 ApiResponse) — 첨부 다운로드와 동일하게 blobOk 로 에러 정규화+본문 타임아웃.
      downloadCsv: (batchId) =>
        blobOk(http.get(`admin/facility-bookings/submission/${batchId}/csv`)),
      list: (params) =>
        jsonOk<PageResponse<SubmissionBatchSummary>>(
          http.get('admin/facility-bookings/submission', { searchParams: cleanParams(params) }),
        ),
      detail: (batchId) =>
        jsonOk<SubmissionBatchDetail>(http.get(`admin/facility-bookings/submission/${batchId}`)),
      complete: (batchId) =>
        jsonOk<CompleteSubmissionBatchResult>(
          http.post(`admin/facility-bookings/submission/${batchId}/complete`),
        ),
      cancel: (batchId) =>
        jsonVoid(http.delete(`admin/facility-bookings/submission/${batchId}`)),
    },
    bankMatching: {
      overview: () =>
        jsonOk<BankMatchingOverview>(http.get('admin/clubs/bank-matching')),
      setActive: (clubId, active) =>
        jsonVoid(http.put(`admin/clubs/${clubId}/bank-matching`, { json: { active } })),
    },
  };
}
