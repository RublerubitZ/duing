import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { ApiError, createApiClient } from '@duing/api';
import type { AdminProfileCheck } from '@duing/types';
import { ApiClientProvider } from '../src/api-context';
import {
  ProfileCheckSemesterChangedError,
  useAdminProfileCheckQuery,
  useUpdateAdminProfileCheckMutation,
  type UpdateAdminProfileCheckVariables,
} from '../src/adminProfileCheck';
import { adminQueryKeys } from '../src/adminQueryKeys';

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
// 요청 순서 — 저장이 PUT 하나이고, 저장 뒤(또는 학기 바뀜 거절 뒤) 재조회 GET 이 PUT 뒤에 오는지 본다.
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
  it('켜는 저장은 화면이 본 학기를 함께 보내 PUT 하나로 저장하고, 설정을 다시 받은 뒤에 끝난다', async () => {
    const { result } = renderSettingsHooks();
    await waitFor(() => expect(result.current.profileCheckQuery.isSuccess).toBe(true));
    expect(requestLog).toEqual(['GET']);

    const payload: UpdateAdminProfileCheckVariables['payload'] = {
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

    // 서버가 저장과 같은 순간에 오늘 학기와 견주도록 화면이 본 학기를 본문에 함께 싣는다.
    expect(lastPutBody).toEqual({ ...payload, currentSemesterYear: 2027, currentSemesterTerm: 1 });
    // 처음 GET → PUT → 재조회 GET. 저장 직전 확인 조회가 없고, 무효화를 기다리므로 저장이 끝난 시점에 재조회가 이미 끝나 있다 —
    // 화면이 이 뒤에 초안을 비워도 옛 값이 비치지 않는다.
    expect(requestLogAtSave).toEqual(['GET', 'PUT', 'GET']);
  });

  it('서버가 학기 바뀜(409)으로 거절하면 최신 설정을 다시 받은 뒤 ProfileCheckSemesterChangedError 다', async () => {
    serverProfileCheck = { ...PROFILE_CHECK, enabled: true };
    const { queryClient, result } = renderSettingsHooks();
    await waitFor(() => expect(result.current.profileCheckQuery.isSuccess).toBe(true));
    // 8/31 에 켜 둔 화면을 9/1 에 저장한다 — 서버의 오늘 학기는 2학기가 됐고 1학기 팝업은 기간이 끝나 꺼졌다.
    serverProfileCheck = { ...PROFILE_CHECK, enabled: false, currentSemesterTerm: 2 };
    server.use(
      http.put('*/admin/profile-check', () => {
        requestLog.push('PUT');
        return HttpResponse.json(
          {
            ok: false,
            data: null,
            message: '학기가 바뀌었습니다. 최신 설정을 확인한 뒤 다시 저장해 주세요.',
            code: 'PROFILE_CHECK_SEMESTER_CHANGED',
          },
          { status: 409 },
        );
      }),
    );

    // 거부되는 순간의 기록·캐시를 잡는다 — act 는 끝나기 전에 남은 재조회를 흘려보내, act 뒤에 보면 무효화를 기다리지 않는
    // 구현도 통과한다.
    let rejection: unknown = null;
    let requestLogAtReject: string[] = [];
    let cachedAtReject: unknown = undefined;
    await act(async () => {
      try {
        await result.current.updateMutation.mutateAsync({
          payload: { title: PROFILE_CHECK.title, message: '고친 문구', enabled: true },
          expectedSemester: { currentSemesterYear: 2027, currentSemesterTerm: 1 },
        });
      } catch (error) {
        rejection = error;
        requestLogAtReject = [...requestLog];
        cachedAtReject = queryClient.getQueryData(adminQueryKeys.profileCheck());
      }
    });
    expect(rejection).toBeInstanceOf(ProfileCheckSemesterChangedError);
    // 처음 GET → 거절된 PUT → 최신 설정 재조회 GET. 화면은 알림을 받기 전에 이미 새 학기로 다시 그려진다.
    expect(requestLogAtReject).toEqual(['GET', 'PUT', 'GET']);
    expect(cachedAtReject).toEqual(serverProfileCheck);
  });

  it('그 밖의 실패(500)는 그대로 ApiError 이고 설정을 다시 받지 않는다', async () => {
    const { result } = renderSettingsHooks();
    await waitFor(() => expect(result.current.profileCheckQuery.isSuccess).toBe(true));
    server.use(
      http.put('*/admin/profile-check', () => {
        requestLog.push('PUT');
        return HttpResponse.json({ ok: false, data: null, message: '일시적인 오류입니다.' }, { status: 500 });
      }),
    );

    let rejection: unknown = null;
    let requestLogAtReject: string[] = [];
    await act(async () => {
      try {
        await result.current.updateMutation.mutateAsync({
          payload: { title: PROFILE_CHECK.title, message: '고친 문구', enabled: true },
          expectedSemester: { currentSemesterYear: 2027, currentSemesterTerm: 1 },
        });
      } catch (error) {
        rejection = error;
        requestLogAtReject = [...requestLog];
      }
    });
    expect(rejection).toBeInstanceOf(ApiError);
    expect(rejection).toMatchObject({ status: 500 });
    expect(requestLogAtReject).toEqual(['GET', 'PUT']);
  });
});
