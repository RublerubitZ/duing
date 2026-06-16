import ky, { type KyInstance, type ResponsePromise, HTTPError } from 'ky';
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
  AdminClubSearchParams,
  AdminClubSummary,
  AdminClubMemberHistoryParams,
  AdminClubMemberHistoryRow,
  AdminSuccessionDetail,
  AdminSuccessionSearchParams,
  AdminSuccessionSummary,
  AssignAdminLeaderPayload,
  ProcessSuccessionPayload,
  SubmitSuccessionRequestPayload,
  AdminRecertificationRound,
  AdminRecertificationRoundSearchParams,
  CreateRecertificationRoundPayload,
  AdminRecertificationRequestSummary,
  AdminRecertificationRequestDetail,
  AdminRecertificationRequestSearchParams,
  ProcessRecertificationPayload,
  CentralClubRecertificationStatus,
  CentralClubRecertificationStatusParams,
  AdminUserSearchParams,
  AdminUserSearchResult,
  AdminReportSearchParams,
  AdminReportSummary,
  AdminReportDetail,
  ProcessReportPayload,
  SubmitReportPayload,
  AdminPromotionRequestSummary,
  AdminPromotionRequestDetail,
  AdminPromotionRequestSearchParams,
  ProcessPromotionRequestPayload,
  SubmitPromotionRequestPayload,
  AdminPromotionSummary,
  AdminPromotionSearchParams,
  CreatePromotionPayload,
  UpdatePromotionPayload,
  ApiResponse,
  PageResponse,
  ClubDetail,
  ClubMember,
  ClubMemberExportRow,
  ClubPhoto,
  ClubSearchParams,
  ClubSummary,
  CreateClubPayload,
  CreateRecruitmentPayload,
  LoginPayload,
  LoginResult,
  ManagedClub,
  MyApplicationDetail,
  ApplicantDetail,
  RecruitmentDetail,
  RecruitmentSummary,
  UpdateRecruitmentPayload,
  SignupPayload,
  UpdateProfilePayload,
  ChangePasswordPayload,
  SendEmailVerificationPayload,
  ConfirmEmailVerificationPayload,
  EmailVerificationResult,
  SubmitApplicationPayload,
  UpdateApplicationStatusPayload,
  UpdateClubPayload,
  UpdateClubStatusPayload,
  UpdateClubCentralClubPayload,
  CloseClubPayload,
  Applicant,
  ApplicantsFilters,
  ApplicantNeighbors,
  UpsertApplicationEvaluationPayload,
  ApplicationScope,
  ApplicationSummary,
  MyClubSummary,
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
  NoticeVisibility,
  AdminNoticeSummary,
  CreateNoticePayload,
  UpdateNoticePayload,
  CreateClubPhotoPayload,
  UpdateClubPhotoPayload,
  ReorderClubPhotosPayload,
  TransferLeaderResult,
  UpdateMemberRolePayload,
  FileUploadResult,
  FilePurpose,
  PromotionCard,
  LeaderRecertificationContext,
  SubmitRecertificationRequestPayload,
  MyClubMembership,
  CreateClubNoticePayload,
  UpdateClubNoticePayload,
  ClubEventCard,
  ClubEventDetail,
  ClubEventListParams,
  CreateClubEventPayload,
  UpdateClubEventPayload,
  AdminGlobalEventDetail,
  AdminGlobalEventListParams,
  AdminGlobalEventSummary,
  CreateGlobalEventPayload,
  GlobalEventCard,
  GlobalEventCategoryStats,
  GlobalEventDetail,
  GlobalEventListParams,
  UpdateGlobalEventPayload,
} from '@duing/types';
import { readToken } from './token';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly payload?: unknown,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function toApiError(error: unknown): Promise<never> {
  if (error instanceof HTTPError) {
    let message = `요청 실패 (${error.response.status})`;
    let payload: unknown;
    let code: string | undefined;
    try {
      const body = (await error.response.json()) as ApiResponse<unknown>;
      if (body && typeof body.message === 'string') {
        message = body.message;
      }
      if (body && typeof body.code === 'string') {
        code = body.code;
      }
      payload = body.data;
    } catch {
      // ignore json parse failure
    }
    throw new ApiError(error.response.status, message, payload, code);
  }
  throw error;
}

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.ok || response.data === null) {
    throw new ApiError(0, response.message ?? '응답이 비어 있습니다.');
  }
  return response.data;
}

export type DuingApiClient = {
  auth: {
    signup(payload: SignupPayload): Promise<number>;
    login(payload: LoginPayload): Promise<LoginResult>;
    sendEmailVerification(payload: SendEmailVerificationPayload): Promise<EmailVerificationResult>;
    confirmEmailVerification(payload: ConfirmEmailVerificationPayload): Promise<void>;
    logout(): Promise<void>;
  };
  users: {
    me(): Promise<User>;
    myApplications(scope?: ApplicationScope): Promise<ApplicationSummary[]>;
    myClubs(): Promise<MyClubSummary[]>;
    updateProfile(payload: UpdateProfilePayload): Promise<void>;
    changePassword(payload: ChangePasswordPayload): Promise<void>;
    withdraw(): Promise<void>;
  };
  clubs: {
    list(params?: ClubSearchParams): Promise<PageResponse<ClubSummary>>;
    detail(clubId: number): Promise<ClubDetail>;
    create(payload: CreateClubPayload): Promise<number>;
    update(clubId: number, payload: UpdateClubPayload): Promise<ClubDetail>;
    updateStatus(clubId: number, payload: UpdateClubStatusPayload): Promise<void>;
    updateCentralClub(clubId: number, payload: UpdateClubCentralClubPayload): Promise<void>;
    close(clubId: number, payload: CloseClubPayload): Promise<void>;
    photos(clubId: number): Promise<ClubPhoto[]>;
    createPhoto(clubId: number, payload: CreateClubPhotoPayload): Promise<ClubPhoto>;
    updatePhoto(clubId: number, photoId: number, payload: UpdateClubPhotoPayload): Promise<void>;
    reorderPhotos(clubId: number, payload: ReorderClubPhotosPayload): Promise<ClubPhoto[]>;
    deletePhoto(clubId: number, photoId: number): Promise<void>;
    members(clubId: number): Promise<ClubMember[]>;
    membersExport(clubId: number, includePhone: boolean): Promise<ClubMemberExportRow[]>;
    updateMemberRole(clubId: number, memberId: number, payload: UpdateMemberRolePayload): Promise<void>;
    removeMember(clubId: number, memberId: number): Promise<void>;
    leaveClub(clubId: number): Promise<void>;
    transferLeader(clubId: number, memberId: number): Promise<TransferLeaderResult>;
    recruitmentsByClub(clubId: number): Promise<RecruitmentSummary[]>;
    managedByMe(): Promise<ManagedClub[]>;
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
  };
  applications: {
    submit(recruitmentId: number, payload: SubmitApplicationPayload): Promise<number>;
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
      page: number;
      size: number;
    }): Promise<PageResponse<NoticeCardItem>>;
    detail(noticeId: number): Promise<NoticeDetail>;
  };
  promotions: {
    list(): Promise<PageResponse<PromotionCard>>;
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
  recertificationRequests: {
    context(clubId: number): Promise<LeaderRecertificationContext>;
    submit(clubId: number, payload: SubmitRecertificationRequestPayload): Promise<number>;
  };
  clubMembership: {
    get(clubId: number): Promise<MyClubMembership>;
  };
  clubNotices: {
    listForClub(
      clubId: number,
      params: { page?: number; size?: number },
    ): Promise<PageResponse<NoticeCardItem>>;
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
  admin: {
    clubs: {
      list(params?: AdminClubSearchParams): Promise<PageResponse<AdminClubSummary>>;
      detail(clubId: number): Promise<ClubDetail>;
    };
    users: {
      search(params: AdminUserSearchParams): Promise<PageResponse<AdminUserSearchResult>>;
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
    leaderSuccession: {
      list(params: AdminSuccessionSearchParams): Promise<PageResponse<AdminSuccessionSummary>>;
      get(requestId: number): Promise<AdminSuccessionDetail>;
      process(requestId: number, payload: ProcessSuccessionPayload): Promise<void>;
      assignLeader(clubId: number, payload: AssignAdminLeaderPayload): Promise<void>;
      memberHistory(clubId: number, params: AdminClubMemberHistoryParams): Promise<PageResponse<AdminClubMemberHistoryRow>>;
    };
    recertificationRounds: {
      list(params: AdminRecertificationRoundSearchParams): Promise<PageResponse<AdminRecertificationRound>>;
      create(payload: CreateRecertificationRoundPayload): Promise<number>;
      close(roundId: number): Promise<void>;
    };
    recertificationRequests: {
      list(params: AdminRecertificationRequestSearchParams): Promise<PageResponse<AdminRecertificationRequestSummary>>;
      get(requestId: number): Promise<AdminRecertificationRequestDetail>;
      process(requestId: number, payload: ProcessRecertificationPayload): Promise<void>;
      centralClubStatus(params: CentralClubRecertificationStatusParams): Promise<PageResponse<CentralClubRecertificationStatus>>;
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
  };
  interviewRounds: {
    // === 면접 라운드 후보 조회 (BE#2) ===
    // GET /leader/recruitments/{recruitmentId}/interview-round-candidates
    candidates(recruitmentId: number, includeUnderReview: boolean): Promise<InterviewRoundCandidate[]>;
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
  raw: KyInstance;
};

export type CreateApiClientOptions = {
  baseUrl: string;
};

// 로그아웃의 서버 폐기는 best-effort 다. 백엔드가 행(hang)/오프라인이어도 로컬 로그아웃이
// 전역 타임아웃(15s)까지 묶이지 않도록 짧은 타임아웃을 둔다(실패해도 로컬 정리는 계속 진행).
const LOGOUT_REVOKE_TIMEOUT_MS = 5_000;

export function createApiClient({ baseUrl }: CreateApiClientOptions): DuingApiClient {
  const http = ky.create({
    prefixUrl: baseUrl.replace(/\/$/, ''),
    timeout: 15_000,
    hooks: {
      beforeRequest: [
        async (request) => {
          const token = await readToken();
          if (token) {
            request.headers.set('Authorization', `Bearer ${token}`);
          }
        },
      ],
      afterResponse: [
        (request, _options, response) => {
          // 인증 토큰을 실어 보낸 요청이 401 이면 세션 만료로 간주하고 앱에 알린다.
          // (토큰 없는 로그인 실패 401 은 Authorization 헤더가 없어 제외된다)
          // 단, 로그아웃 요청의 401 은 세션 만료 신호가 아니다 — 사용자가 의도적으로 로그아웃 중이며
          // 이미 만료/무효화된 토큰으로도 폐기를 시도하므로 401 이 정상이다. 전역 만료 핸들러
          // (세션만료 에러 토스트 + 홈 이동)를 깨우면 의도적 로그아웃에 오탐 에러가 뜬다.
          const isLogoutRequest = request.url.endsWith('/auth/logout');
          if (response.status === 401 && request.headers.has('Authorization') && !isLogoutRequest) {
            notifyUnauthorized();
          }
        },
      ],
    },
  });

  async function jsonOk<T>(promise: ResponsePromise): Promise<T> {
    try {
      const res = await promise;
      const body = (await res.json()) as ApiResponse<T>;
      return unwrap(body);
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

  return {
    auth: {
      signup: (payload) =>
        jsonOk<number>(http.post('auth/signup', { json: payload })),
      login: (payload) =>
        jsonOk<LoginResult>(http.post('auth/login', { json: payload })),
      sendEmailVerification: (payload) =>
        jsonOk<EmailVerificationResult>(http.post('auth/email-verifications', { json: payload })),
      confirmEmailVerification: (payload) =>
        jsonVoid(http.post('auth/email-verifications/confirm', { json: payload })),
      logout: () => jsonVoid(http.post('auth/logout', { timeout: LOGOUT_REVOKE_TIMEOUT_MS })),
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
      withdraw: () => jsonVoid(http.delete('users/me')),
    },
    clubs: {
      list: (params) =>
        jsonOk<PageResponse<ClubSummary>>(
          http.get('clubs', {
            searchParams: cleanParams(params),
          }),
        ),
      detail: (clubId) => jsonOk<ClubDetail>(http.get(`clubs/${clubId}`)),
      create: (payload) =>
        jsonOk<number>(http.post('admin/clubs', { json: payload })),
      update: (clubId, payload) =>
        jsonOk<ClubDetail>(http.patch(`clubs/${clubId}`, { json: payload })),
      updateStatus: (clubId, payload) =>
        jsonVoid(http.patch(`admin/clubs/${clubId}/status`, { json: payload })),
      updateCentralClub: (clubId, payload) =>
        jsonVoid(http.patch(`admin/clubs/${clubId}/central-club`, { json: payload })),
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
      members: (clubId) =>
        jsonOk<ClubMember[]>(http.get(`clubs/${clubId}/members`)),
      membersExport: (clubId, includePhone) =>
        jsonOk<ClubMemberExportRow[]>(
          http.get(`clubs/${clubId}/members/export`, {
            searchParams: { includePhone: String(includePhone) },
          }),
        ),
      updateMemberRole: (clubId, memberId, payload) =>
        jsonVoid(http.patch(`clubs/${clubId}/members/${memberId}/role`, { json: payload })),
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
    },
    files: {
      upload: (file, purpose) => {
        const body = new FormData();
        body.append('file', file);
        // ky 는 FormData 를 자동으로 multipart/form-data 로 처리한다.
        return jsonOk<FileUploadResult>(
          http.post('files', { body, searchParams: { purpose } }),
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
    },
    applications: {
      submit: (recruitmentId, payload) =>
        jsonOk<number>(
          http.post(`recruitments/${recruitmentId}/applications`, { json: payload }),
        ),
      applicants: (recruitmentId, filters) => {
        const search = new URLSearchParams();
        if (filters?.status) search.set('status', filters.status);
        if (filters?.college) search.set('college', filters.college);
        if (filters?.q) search.set('q', filters.q);
        if (filters?.submittedFrom) search.set('submittedFrom', filters.submittedFrom);
        if (filters?.submittedTo) search.set('submittedTo', filters.submittedTo);
        const qs = search.toString();
        const path = `leader/recruitments/${recruitmentId}/applications${qs ? `?${qs}` : ''}`;
        return jsonOk<Applicant[]>(http.get(path));
      },
      applicantNeighbors: (recruitmentId, applicationId, filters) => {
        const search = new URLSearchParams();
        if (filters?.status) search.set('status', filters.status);
        if (filters?.college) search.set('college', filters.college);
        if (filters?.q) search.set('q', filters.q);
        if (filters?.submittedFrom) search.set('submittedFrom', filters.submittedFrom);
        if (filters?.submittedTo) search.set('submittedTo', filters.submittedTo);
        const qs = search.toString();
        const path = `leader/recruitments/${recruitmentId}/applications/${applicationId}/neighbors${qs ? `?${qs}` : ''}`;
        return jsonOk<ApplicantNeighbors>(http.get(path));
      },
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
      list: ({ category, tags, keyword, page, size }) => {
        const searchParams = new URLSearchParams();
        searchParams.append('page', String(page));
        searchParams.append('size', String(size));
        if (category) searchParams.append('category', category);
        if (keyword) searchParams.append('keyword', keyword);
        (tags ?? []).forEach((tag) => searchParams.append('tags', tag));
        return jsonOk<PageResponse<NoticeCardItem>>(
          http.get(`notices?${searchParams.toString()}`),
        );
      },
      detail: (noticeId) =>
        jsonOk<NoticeDetail>(http.get(`notices/${noticeId}`)),
    },
    promotions: {
      list: () => jsonOk<PageResponse<PromotionCard>>(http.get('promotions')),
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
    recertificationRequests: {
      context: (clubId) =>
        jsonOk<LeaderRecertificationContext>(
          http.get(`clubs/${clubId}/recertification-context`),
        ),
      submit: (clubId, payload) =>
        jsonOk<number>(
          http.post(`clubs/${clubId}/recertification-requests`, { json: payload }),
        ),
    },
    clubMembership: {
      get: (clubId) =>
        jsonOk<MyClubMembership>(http.get(`clubs/${clubId}/membership`)),
    },
    clubNotices: {
      listForClub: (clubId, params) =>
        jsonOk<PageResponse<NoticeCardItem>>(
          http.get(`clubs/${clubId}/notices`, { searchParams: cleanParams(params) }),
        ),
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
    admin: {
      clubs: {
        list: (params) =>
          jsonOk<PageResponse<AdminClubSummary>>(
            http.get('admin/clubs', { searchParams: cleanParams(params) }),
          ),
        detail: (clubId) => jsonOk<ClubDetail>(http.get(`admin/clubs/${clubId}`)),
      },
      users: {
        search: (params) =>
          jsonOk<PageResponse<AdminUserSearchResult>>(
            http.get('admin/users', { searchParams: cleanParams(params) }),
          ),
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
      recertificationRounds: {
        list: (params) =>
          jsonOk<PageResponse<AdminRecertificationRound>>(
            http.get('admin/recertification-rounds', { searchParams: cleanParams(params) }),
          ),
        create: (payload) =>
          jsonOk<number>(http.post('admin/recertification-rounds', { json: payload })),
        close: (roundId) =>
          jsonVoid(http.patch(`admin/recertification-rounds/${roundId}/close`, { json: {} })),
      },
      recertificationRequests: {
        list: (params) =>
          jsonOk<PageResponse<AdminRecertificationRequestSummary>>(
            http.get('admin/recertification-requests', { searchParams: cleanParams(params) }),
          ),
        get: (requestId) =>
          jsonOk<AdminRecertificationRequestDetail>(
            http.get(`admin/recertification-requests/${requestId}`),
          ),
        process: (requestId, payload) =>
          jsonVoid(http.patch(`admin/recertification-requests/${requestId}`, { json: payload })),
        centralClubStatus: (params) =>
          jsonOk<PageResponse<CentralClubRecertificationStatus>>(
            http.get('admin/clubs/recertification-status', { searchParams: cleanParams(params) }),
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
    },
    applicantInterview: {
      view: (applicationId) =>
        jsonOk<ApplicantInterviewView>(http.get(`applications/${applicationId}/interview`)),
      respond: (applicationId, payload) =>
        jsonVoid(http.put(`applications/${applicationId}/interview-availability`, { json: payload })),
    },
    interviewRounds: {
      candidates: (recruitmentId, includeUnderReview) =>
        jsonOk<InterviewRoundCandidate[]>(
          http.get(`leader/recruitments/${recruitmentId}/interview-round-candidates`, {
            searchParams: { includeUnderReview },
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

function cleanParams<T extends object>(params: T | undefined): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (!params) return searchParams;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    // 배열은 같은 키를 여러 번 append 해 Spring `@RequestParam List<T>` 와 호환되게 한다.
    // (e.g. tags=[a,b] → ?tags=a&tags=b)
    if (Array.isArray(value)) {
      for (const element of value) {
        if (element === undefined || element === null || element === '') continue;
        searchParams.append(key, String(element));
      }
      continue;
    }
    searchParams.append(key, String(value));
  }
  return searchParams;
}
