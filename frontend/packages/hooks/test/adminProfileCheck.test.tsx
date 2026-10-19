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
  useAdminProfileCheckQuery,
  useUpdateAdminProfileCheckMutation,
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

// 저장 뒤 재조회가 끝났는지를 GET 도달 횟수로 본다.
let getRequestCount = 0;
let lastPutBody: unknown = null;

const server = setupServer(
  http.get('*/admin/profile-check', () => {
    getRequestCount += 1;
    return HttpResponse.json({ ok: true, message: null, data: PROFILE_CHECK });
  }),
  http.put('*/admin/profile-check', async ({ request }) => {
    lastPutBody = await request.json();
    return new HttpResponse(null, { status: 204 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  getRequestCount = 0;
  lastPutBody = null;
});
afterAll(() => server.close());

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
  it('저장하면 제목·문구·노출 여부를 PUT 하고, 설정을 다시 받은 뒤에 끝난다', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(
      () => ({
        profileCheckQuery: useAdminProfileCheckQuery(),
        updateMutation: useUpdateAdminProfileCheckMutation(),
      }),
      { wrapper: makeWrapper(queryClient) },
    );
    await waitFor(() => expect(result.current.profileCheckQuery.isSuccess).toBe(true));
    expect(getRequestCount).toBe(1);

    const payload: UpdateAdminProfileCheckPayload = {
      title: '새 제목',
      message: '새 문구',
      enabled: true,
    };
    // act 는 끝나기 전에 남은 작업을 흘려보내 기다리지 않은 재조회도 마치므로, 저장 Promise 가 풀린 순간의 GET 횟수를 잡는다.
    let getRequestCountAtSave = 0;
    await act(async () => {
      await result.current.updateMutation.mutateAsync(payload);
      getRequestCountAtSave = getRequestCount;
    });

    expect(lastPutBody).toEqual(payload);
    // 무효화를 기다리므로 저장이 끝난 시점에 재조회가 이미 끝나 있다 — 화면이 이 뒤에 초안을 비워도 옛 값이 비치지 않는다.
    expect(getRequestCountAtSave).toBe(2);
  });
});
