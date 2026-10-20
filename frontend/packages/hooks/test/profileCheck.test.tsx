import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { useAuthStore } from '@duing/stores';
import type { ProfileCheckStatus, User } from '@duing/types';
import { ApiClientProvider } from '../src/api-context';
import { useConfirmProfileCheckMutation, useProfileCheckQuery } from '../src/profileCheck';
import { shouldRetryQuery } from '../src/retry';
import { userQueryKeys } from '../src/userQueryKeys';

const BASE = 'http://localhost:8080/api/v1';
const apiClient = createApiClient({ baseUrl: BASE });

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  };
}

function newQueryClient() {
  // 앱 기본값(apps/web/app/providers.tsx 의 staleTime 30초)과 맞춘다 — 훅이 내 정보를 staleTime 0 으로 다시 받지 않으면
  // 캐시의 옛 학년으로 판정하게 되는데, 기본값 0 인 클라이언트에서는 그 회귀가 드러나지 않는다.
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } },
  });
}

const pendingStatus: ProfileCheckStatus = {
  pending: true,
  semesterYear: 2026,
  semesterTerm: 1,
  title: '새 학기, 내 정보를 확인해 주세요.',
  message: '새 학기가 시작되었습니다!',
  grade: 'SOPHOMORE',
  college: 'IT_ENGINEERING',
  major: '컴퓨터정보공학부',
  suggestedGrade: 'JUNIOR',
};

function meWithGrade(grade: User['grade']): User {
  return {
    id: 1,
    studentId: '20240001',
    name: '홍길동',
    phone: '010-1234-5678',
    grade,
    role: 'STUDENT',
    college: 'IT_ENGINEERING',
    major: '컴퓨터정보공학부',
  };
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useProfileCheckQuery', () => {
  it('로그인하지 않았으면 조회하지 않는다', () => {
    const { result } = renderHook(() => useProfileCheckQuery(), { wrapper: makeWrapper(newQueryClient()) });

    // onUnhandledRequest: 'error' — 요청이 나갔다면 MSW 가 실패시킨다.
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('로그인 상태면 팝업 상태를 조회한다', async () => {
    useAuthStore.setState({ status: 'authenticated', isVerified: true, user: null });
    server.use(
      http.get(`${BASE}/users/me/profile-check`, () =>
        HttpResponse.json({ ok: true, data: pendingStatus, message: null }),
      ),
    );

    const { result } = renderHook(() => useProfileCheckQuery(), { wrapper: makeWrapper(newQueryClient()) });

    await waitFor(() => expect(result.current.data).toEqual(pendingStatus));
  });

  it('백엔드가 없으면(404 — FE 선배포·BE 롤백 중) 다시 요청하지 않는다', async () => {
    useAuthStore.setState({ status: 'authenticated', isVerified: true, user: null });
    let statusRequests = 0;
    server.use(
      http.get(`${BASE}/users/me/profile-check`, () => {
        statusRequests += 1;
        return HttpResponse.json({ ok: false, data: null, message: '찾을 수 없습니다.' }, { status: 404 });
      }),
    );
    // 앱의 전역 재시도 정책(providers.tsx)으로 돌린다 — 대기 없이 재시도하게 해 두 번째 요청이 나가면 바로 드러나게 한다.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 0 } } });

    const { result } = renderHook(() => useProfileCheckQuery(), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(statusRequests).toBe(1);
  });
});

describe('useConfirmProfileCheckMutation', () => {
  it('학년 없이 확인하면 내 정보를 다시 받지 않고 confirmed 를 돌려준다', async () => {
    let sentBody: unknown = null;
    let meRequests = 0;
    server.use(
      http.put(`${BASE}/users/me/profile-check`, async ({ request }) => {
        sentBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${BASE}/users/me`, () => {
        meRequests += 1;
        return HttpResponse.json({ ok: true, data: meWithGrade('SOPHOMORE'), message: null });
      }),
    );
    const { result } = renderHook(() => useConfirmProfileCheckMutation(), {
      wrapper: makeWrapper(newQueryClient()),
    });

    let outcome: string | null = null;
    await act(async () => {
      outcome = await result.current.mutateAsync({ semesterYear: 2026, semesterTerm: 1, grade: null });
    });

    expect(outcome).toBe('confirmed');
    expect(sentBody).toEqual({ semesterYear: 2026, semesterTerm: 1, grade: null });
    expect(meRequests).toBe(0);
  });

  it('보낸 학년이 내 정보에 반영돼 있으면 confirmed 를 돌려주고 내 정보 캐시를 새 학년으로 갈아 끼운다', async () => {
    server.use(
      http.put(`${BASE}/users/me/profile-check`, () => new HttpResponse(null, { status: 204 })),
      http.get(`${BASE}/users/me`, () =>
        HttpResponse.json({ ok: true, data: meWithGrade('JUNIOR'), message: null }),
      ),
    );
    const queryClient = newQueryClient();
    queryClient.setQueryData(userQueryKeys.me(), meWithGrade('SOPHOMORE'));
    const { result } = renderHook(() => useConfirmProfileCheckMutation(), { wrapper: makeWrapper(queryClient) });

    let outcome: string | null = null;
    await act(async () => {
      outcome = await result.current.mutateAsync({ semesterYear: 2026, semesterTerm: 1, grade: 'JUNIOR' });
    });

    expect(outcome).toBe('confirmed');
    expect(queryClient.getQueryData<User>(userQueryKeys.me())?.grade).toBe('JUNIOR');
  });

  it('보낸 학년과 내 정보 학년이 다르면(다른 곳에서 먼저 확인) alreadyConfirmedElsewhere 를 돌려준다', async () => {
    server.use(
      http.put(`${BASE}/users/me/profile-check`, () => new HttpResponse(null, { status: 204 })),
      http.get(`${BASE}/users/me`, () =>
        HttpResponse.json({ ok: true, data: meWithGrade('SOPHOMORE'), message: null }),
      ),
    );
    const { result } = renderHook(() => useConfirmProfileCheckMutation(), {
      wrapper: makeWrapper(newQueryClient()),
    });

    let outcome: string | null = null;
    await act(async () => {
      outcome = await result.current.mutateAsync({ semesterYear: 2026, semesterTerm: 1, grade: 'JUNIOR' });
    });

    expect(outcome).toBe('alreadyConfirmedElsewhere');
  });

  it('내 정보 재조회가 실패해도 확인은 성공으로 돌려준다', async () => {
    server.use(
      http.put(`${BASE}/users/me/profile-check`, () => new HttpResponse(null, { status: 204 })),
      http.get(`${BASE}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '일시적인 오류입니다.' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useConfirmProfileCheckMutation(), {
      wrapper: makeWrapper(newQueryClient()),
    });

    let outcome: string | null = null;
    await act(async () => {
      outcome = await result.current.mutateAsync({ semesterYear: 2026, semesterTerm: 1, grade: 'JUNIOR' });
    });

    expect(outcome).toBe('confirmed');
  });

  it('성공하면 팝업 상태 쿼리를 무효화한다', async () => {
    server.use(http.put(`${BASE}/users/me/profile-check`, () => new HttpResponse(null, { status: 204 })));
    const queryClient = newQueryClient();
    queryClient.setQueryData(userQueryKeys.profileCheck(), pendingStatus);
    const { result } = renderHook(() => useConfirmProfileCheckMutation(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync({ semesterYear: 2026, semesterTerm: 1, grade: null });
    });

    expect(queryClient.getQueryState(userQueryKeys.profileCheck())?.isInvalidated).toBe(true);
  });

  it('기간이 아니면(409) 코드와 함께 실패하고 팝업 상태 쿼리를 무효화한다', async () => {
    server.use(
      http.put(`${BASE}/users/me/profile-check`, () =>
        HttpResponse.json(
          { ok: false, data: null, message: '지금은 정보 확인 기간이 아닙니다.', code: 'PROFILE_CHECK_CLOSED' },
          { status: 409 },
        ),
      ),
    );
    const queryClient = newQueryClient();
    queryClient.setQueryData(userQueryKeys.profileCheck(), pendingStatus);
    const { result } = renderHook(() => useConfirmProfileCheckMutation(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ semesterYear: 2026, semesterTerm: 1, grade: 'JUNIOR' }),
      ).rejects.toMatchObject({ status: 409, code: 'PROFILE_CHECK_CLOSED' });
    });

    expect(queryClient.getQueryState(userQueryKeys.profileCheck())?.isInvalidated).toBe(true);
  });

  it('확인이 실패하면 내 정보를 무효화한다 — 시간 초과여도 서버는 학년을 올리고 커밋했을 수 있다', async () => {
    server.use(
      http.put(`${BASE}/users/me/profile-check`, () =>
        HttpResponse.json({ ok: false, data: null, message: '일시적인 오류입니다.' }, { status: 500 }),
      ),
    );
    const queryClient = newQueryClient();
    queryClient.setQueryData(userQueryKeys.me(), meWithGrade('SOPHOMORE'));
    queryClient.setQueryData(userQueryKeys.myClubs(), []);
    const { result } = renderHook(() => useConfirmProfileCheckMutation(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ semesterYear: 2026, semesterTerm: 1, grade: 'JUNIOR' }),
      ).rejects.toMatchObject({ status: 500 });
    });

    // 서버가 학년을 올렸을 수 있으니 다음 구독(설정 화면의 학년 표시·프로필 수정 창)이 다시 받는다 — 옛 학년으로 저장해 되돌리지 않게.
    expect(queryClient.getQueryState(userQueryKeys.me())?.isInvalidated).toBe(true);
    // 내 정보 키 아래의 다른 쿼리까지 다시 받지는 않는다(exact).
    expect(queryClient.getQueryState(userQueryKeys.myClubs())?.isInvalidated).toBe(false);
  });

  it('팝업 상태 키는 내 정보 키 아래라 프로필 수정의 접두 무효화에 같이 걸린다', () => {
    expect(userQueryKeys.profileCheck()).toEqual(['users', 'me', 'profile-check']);
    expect(userQueryKeys.profileCheck().slice(0, 2)).toEqual([...userQueryKeys.me()]);
  });
});
