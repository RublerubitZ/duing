import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import type { AdminProfileCheck, UpdateAdminProfileCheckPayload } from '@duing/types';
import { ApiClientProvider } from '../src/api-context';
import {
  ProfileCheckSemesterChangedError,
  useAdminProfileCheckQuery,
  useUpdateAdminProfileCheckMutation,
} from '../src/adminProfileCheck';
import { adminQueryKeys } from '../src/adminQueryKeys';
import { shouldRetryQuery } from '../src/retry';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  };
}

const PROFILE_CHECK: AdminProfileCheck = {
  enabled: false,
  semesterYear: 2027,
  semesterTerm: 1,
  currentSemesterYear: 2027,
  currentSemesterTerm: 1,
  title: '새 학기, 내 정보를 확인해 주세요.',
  message: '새 학기가 시작되었습니다!',
  targetCount: 10,
  confirmedCount: 4,
  unconfirmedCount: 6,
};

// 서버가 돌려줄 설정 — 학기 경계를 넘기는 테스트가 바꾼다.
let serverProfileCheck: AdminProfileCheck = PROFILE_CHECK;
// 요청 순서 — 저장 직전 확인용 GET 과 저장 뒤 재조회 GET 이 PUT 앞뒤로 오는지 본다.
let requestLog: string[] = [];
let lastPutBody: unknown = null;

const server = setupServer(
  http.get('*/admin/profile-check', () => {
    requestLog.push('GET');
    return HttpResponse.json({ ok: true, message: null, data: serverProfileCheck });
  }),
  http.put('*/admin/profile-check', async ({ request }) => {
    requestLog.push('PUT');
    lastPutBody = await request.json();
    return new HttpResponse(null, { status: 204 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  serverProfileCheck = PROFILE_CHECK;
  requestLog = [];
  lastPutBody = null;
});
afterAll(() => server.close());

function renderSettingsHooks(
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  const rendered = renderHook(
    () => ({
      profileCheckQuery: useAdminProfileCheckQuery(),
      updateMutation: useUpdateAdminProfileCheckMutation(),
    }),
    { wrapper: makeWrapper(queryClient) },
  );
  return { queryClient, ...rendered };
}

describe('useAdminProfileCheckQuery', () => {
  it('설정과 확인 현황을 그대로 돌려준다', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAdminProfileCheckQuery(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(PROFILE_CHECK);
  });

  it('쿼리키는 admin 접두사 아래 profile-check 하나다 — 파라미터 축이 없다', () => {
    expect(adminQueryKeys.profileCheck()).toEqual(['admin', 'profile-check']);
  });
});

describe('useUpdateAdminProfileCheckMutation', () => {
  it('학기가 그대로면 저장 직전에 설정을 다시 받아 확인한 뒤 PUT 하고, 설정을 다시 받은 뒤에 끝난다', async () => {
    const { result } = renderSettingsHooks();
    await waitFor(() => expect(result.current.profileCheckQuery.isSuccess).toBe(true));
    expect(requestLog).toEqual(['GET']);

    const payload: UpdateAdminProfileCheckPayload = {
      title: '새 제목',
      message: '새 문구',
      enabled: true,
    };
    // act 는 끝나기 전에 남은 작업을 흘려보내 기다리지 않은 재조회도 마치므로, 저장 Promise 가 풀린 순간의 요청 기록을 잡는다.
    let requestLogAtSave: string[] = [];
    await act(async () => {
      await result.current.updateMutation.mutateAsync({
        payload,
        expectedSemester: { currentSemesterYear: 2027, currentSemesterTerm: 1 },
      });
      requestLogAtSave = [...requestLog];
    });

    expect(lastPutBody).toEqual(payload);
    // 처음 GET → 저장 직전 확인용 GET → PUT → 재조회 GET. 무효화를 기다리므로 저장이 끝난 시점에 재조회가 이미 끝나 있다 —
    // 화면이 이 뒤에 초안을 비워도 옛 값이 비치지 않는다.
    expect(requestLogAtSave).toEqual(['GET', 'GET', 'PUT', 'GET']);
  });

  it('화면을 그린 뒤 학기가 바뀌었으면 PUT 하지 않고 전용 오류로 끝나며, 다시 받은 설정이 캐시를 갱신한다', async () => {
    serverProfileCheck = { ...PROFILE_CHECK, enabled: true };
    const { queryClient, result } = renderSettingsHooks();
    await waitFor(() => expect(result.current.profileCheckQuery.isSuccess).toBe(true));
    // 8/31 에 켜 둔 화면을 9/1 에 저장한다 — 서버의 오늘 학기는 2학기가 됐고 1학기 팝업은 기간이 끝나 꺼졌다.
    serverProfileCheck = { ...PROFILE_CHECK, enabled: false, currentSemesterTerm: 2 };

    await act(async () => {
      await expect(
        result.current.updateMutation.mutateAsync({
          payload: { title: PROFILE_CHECK.title, message: '고친 문구', enabled: true },
          expectedSemester: { currentSemesterYear: 2027, currentSemesterTerm: 1 },
        }),
      ).rejects.toBeInstanceOf(ProfileCheckSemesterChangedError);
    });

    // enabled:true 가 가면 아무도 다시 켜지 않았는데 서버가 새 학기 팝업을 시작한다(스펙 D7).
    expect(requestLog).toEqual(['GET', 'GET']);
    expect(lastPutBody).toBeNull();
    expect(queryClient.getQueryData(adminQueryKeys.profileCheck())).toEqual(serverProfileCheck);
  });

  it('끄는 저장은 학기가 바뀌었어도 확인 조회 없이 PUT 하고, 설정을 다시 받은 뒤에 끝난다', async () => {
    serverProfileCheck = { ...PROFILE_CHECK, enabled: true };
    const { result } = renderSettingsHooks();
    await waitFor(() => expect(result.current.profileCheckQuery.isSuccess).toBe(true));
    // 8/31 에 켜 둔 화면에서 9/1 에 끈다 — 끄기는 학기를 기록하지 않아(서버가 학기 칸을 그대로 둔다) 막을 이유가 없다.
    serverProfileCheck = { ...PROFILE_CHECK, enabled: false, currentSemesterTerm: 2 };
    const payload: UpdateAdminProfileCheckPayload = {
      title: PROFILE_CHECK.title,
      message: PROFILE_CHECK.message,
      enabled: false,
    };

    let requestLogAtSave: string[] = [];
    await act(async () => {
      await result.current.updateMutation.mutateAsync({
        payload,
        expectedSemester: { currentSemesterYear: 2027, currentSemesterTerm: 1 },
      });
      requestLogAtSave = [...requestLog];
    });

    expect(lastPutBody).toEqual(payload);
    // 처음 GET → PUT → 재조회 GET — 확인용 GET 이 없고, 재조회가 끝난 뒤에 저장이 끝난다.
    expect(requestLogAtSave).toEqual(['GET', 'PUT', 'GET']);
  });

  it('켜는 저장의 확인 조회가 실패하면 다시 시도하지 않고 PUT 없이 바로 끝난다', async () => {
    // 앱 전역 재시도 정책(providers.tsx)으로 돌린다 — 대기 없이 재시도하게 해 두 번째 요청이 나가면 바로 드러나게 한다.
    const { result } = renderSettingsHooks(
      new QueryClient({
        defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 0 }, mutations: { retry: false } },
      }),
    );
    await waitFor(() => expect(result.current.profileCheckQuery.isSuccess).toBe(true));
    server.use(
      http.get('*/admin/profile-check', () => {
        requestLog.push('GET');
        return HttpResponse.json({ ok: false, data: null, message: '일시적인 오류입니다.' }, { status: 500 });
      }),
    );

    await act(async () => {
      await expect(
        result.current.updateMutation.mutateAsync({
          payload: { title: PROFILE_CHECK.title, message: '고친 문구', enabled: true },
          expectedSemester: { currentSemesterYear: 2027, currentSemesterTerm: 1 },
        }),
      ).rejects.toMatchObject({ status: 500 });
    });

    expect(requestLog).toEqual(['GET', 'GET']);
    expect(lastPutBody).toBeNull();
  });
});
