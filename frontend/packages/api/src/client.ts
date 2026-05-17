import ky, { type KyInstance, type ResponsePromise, HTTPError } from 'ky';
import type {
  ApiResponse,
  PageResponse,
  ClubDetail,
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
  UpdateInterviewPayload,
  RecruitmentDetail,
  RecruitmentSummary,
  UpdateRecruitmentPayload,
  SignupPayload,
  SubmitApplicationPayload,
  UpdateApplicationStatusPayload,
  UpdateClubStatusPayload,
  Applicant,
  ApplicationSummary,
  User,
  StatsSummary,
  StatsDailyPoint,
  StatsFunnel,
  FavoriteClub,
  FavoriteIds,
  ApplicationDraft,
  UpsertDraftPayload,
  Notification,
} from '@duing/types';
import { readToken } from './token';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function toApiError(error: unknown): Promise<never> {
  if (error instanceof HTTPError) {
    let message = `요청 실패 (${error.response.status})`;
    try {
      const body = (await error.response.json()) as ApiResponse<unknown>;
      if (body && typeof body.message === 'string') {
        message = body.message;
      }
    } catch {
      // ignore json parse failure
    }
    throw new ApiError(error.response.status, message);
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
  };
  users: {
    me(): Promise<User>;
    myApplications(): Promise<ApplicationSummary[]>;
  };
  clubs: {
    list(params?: ClubSearchParams): Promise<PageResponse<ClubSummary>>;
    detail(clubId: number): Promise<ClubDetail>;
    create(payload: CreateClubPayload): Promise<number>;
    updateStatus(clubId: number, payload: UpdateClubStatusPayload): Promise<void>;
    photos(clubId: number): Promise<ClubPhoto[]>;
    recruitmentsByClub(clubId: number): Promise<RecruitmentSummary[]>;
    managedByMe(): Promise<ManagedClub[]>;
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
    applicants(recruitmentId: number): Promise<Applicant[]>;
    updateStatus(
      applicationId: number,
      payload: UpdateApplicationStatusPayload,
    ): Promise<void>;
    myDetail(applicationId: number): Promise<MyApplicationDetail>;
    detail(applicationId: number): Promise<ApplicantDetail>;
    updateInterview(applicationId: number, payload: UpdateInterviewPayload): Promise<void>;
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
  notifications: {
    list(unreadOnly: boolean, page: number, size: number): Promise<PageResponse<Notification>>;
    unreadCount(): Promise<{ count: number }>;
    markRead(notificationId: number): Promise<void>;
    markAllRead(): Promise<void>;
  };
  raw: KyInstance;
};

export type CreateApiClientOptions = {
  baseUrl: string;
};

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
    },
    users: {
      me: () => jsonOk<User>(http.get('users/me')),
      myApplications: () => jsonOk<ApplicationSummary[]>(http.get('users/me/applications')),
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
      updateStatus: (clubId, payload) =>
        jsonVoid(http.patch(`admin/clubs/${clubId}/status`, { json: payload })),
      photos: (clubId) => jsonOk<ClubPhoto[]>(http.get(`clubs/${clubId}/photos`)),
      recruitmentsByClub: (clubId) =>
        jsonOk<RecruitmentSummary[]>(http.get(`clubs/${clubId}/recruitments`)),
      managedByMe: () =>
        jsonOk<ManagedClub[]>(http.get('leader/clubs/me/managed')),
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
      applicants: (recruitmentId) =>
        jsonOk<Applicant[]>(http.get(`leader/recruitments/${recruitmentId}/applications`)),
      updateStatus: (applicationId, payload) =>
        jsonVoid(
          http.patch(`leader/applications/${applicationId}/status`, { json: payload }),
        ),
      myDetail: (applicationId) =>
        jsonOk<MyApplicationDetail>(http.get(`users/me/applications/${applicationId}`)),
      detail: (applicationId) =>
        jsonOk<ApplicantDetail>(http.get(`leader/applications/${applicationId}`)),
      updateInterview: (applicationId, payload) =>
        jsonVoid(
          http.patch(`leader/applications/${applicationId}/interview`, { json: payload }),
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
