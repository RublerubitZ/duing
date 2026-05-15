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
  MyApplicationDetail,
  RecruitmentDetail,
  RecruitmentSummary,
  SignupPayload,
  SubmitApplicationPayload,
  UpdateApplicationStatusPayload,
  UpdateClubStatusPayload,
  Applicant,
  ApplicationSummary,
  User,
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

export interface DuingApiClient {
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
  };
  recruitments: {
    calendar(yearMonth: string): Promise<RecruitmentSummary[]>;
    detail(recruitmentId: number): Promise<RecruitmentDetail>;
    create(clubId: number, payload: CreateRecruitmentPayload): Promise<number>;
  };
  applications: {
    submit(recruitmentId: number, payload: SubmitApplicationPayload): Promise<number>;
    applicants(recruitmentId: number): Promise<Applicant[]>;
    updateStatus(
      applicationId: number,
      payload: UpdateApplicationStatusPayload,
    ): Promise<void>;
    myDetail(applicationId: number): Promise<MyApplicationDetail>;
  };
  raw: KyInstance;
}

export interface CreateApiClientOptions {
  baseUrl: string;
}

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
    },
    raw: http,
  };
}

function cleanParams<T extends object>(params: T | undefined): Record<string, string> {
  if (!params) return {};
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)]),
  );
}
