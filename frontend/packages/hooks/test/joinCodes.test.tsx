import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { clubQueryKeys } from '../src/clubQueryKeys';
import { useCloseRecruitmentMutation } from '../src/recruitments';
import {
  useActiveJoinCodeQuery,
  useBulkApproveJoinRequestsMutation,
  useClubInviteCodeQuery,
  useCreateClubInviteCodeMutation,
  useCreateJoinCodeMutation,
  useCreateJoinRequestMutation,
  useDecideJoinRequestMutation,
  useJoinRequestDetailQuery,
  useJoinRequestsQuery,
  useRevokeClubInviteCodeMutation,
  useRevokeJoinCodeMutation,
} from '../src/joinCodes';

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

function newQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

const activeJoinCode = {
  joinCodeId: 7,
  code: 'ABCD1234',
  generation: 12,
  maxUses: 30,
  usedCount: 4,
  joinWindowDays: 7,
  joinExpiresAt: null,
  totalRequestCount: 5,
  pendingCount: 2,
  linkType: 'RECRUITMENT',
  inviteExpiresAt: null,
  autoApprove: false,
};

// 부원 초대 링크는 모집에 귀속되지 않고 절대 만료(24/72시간)를 가진다 — 같은 응답 형태에
// linkType·inviteExpiresAt·autoApprove 만 다르게 실린다.
const activeInviteCode = {
  joinCodeId: 9,
  code: 'INVT5678',
  generation: null,
  maxUses: 150,
  usedCount: 0,
  joinWindowDays: 0,
  joinExpiresAt: '2026-08-09T12:00:00Z',
  totalRequestCount: 0,
  pendingCount: 0,
  linkType: 'CLUB_INVITE',
  inviteExpiresAt: '2026-08-09T12:00:00Z',
  autoApprove: true,
};

const pendingRequest = {
  joinRequestId: 41,
  userName: '김두잉',
  studentId: '20231234',
  major: '컴퓨터공학과',
  code: 'ABCD1234',
  generation: 12,
  status: 'PENDING',
  requestedAt: '2026-08-01T02:00:00Z',
  autoApproved: false,
};

let lastRequestsQuery: string | null = null;
let lastCreateBody: unknown = null;
let lastInviteCreateBody: unknown = null;
let lastDecideBody: unknown = null;
let lastBulkBody: unknown = null;

const server = setupServer(
  http.post('*/clubs/10/recruitments/55/join-codes', async ({ request }) => {
    lastCreateBody = await request.json();
    return HttpResponse.json({ ok: true, message: null, data: activeJoinCode }, { status: 201 });
  }),
  http.get('*/clubs/10/recruitments/55/join-codes/active', () =>
    HttpResponse.json({ ok: true, message: null, data: activeJoinCode }),
  ),
  http.delete('*/clubs/10/recruitments/55/join-codes/7', () => new HttpResponse(null, { status: 204 })),
  http.post('*/clubs/10/join-codes', async ({ request }) => {
    lastInviteCreateBody = await request.json();
    return HttpResponse.json({ ok: true, message: null, data: activeInviteCode }, { status: 201 });
  }),
  http.get('*/clubs/10/join-codes/active', () =>
    HttpResponse.json({ ok: true, message: null, data: activeInviteCode }),
  ),
  http.delete('*/clubs/10/join-codes/9', () => new HttpResponse(null, { status: 204 })),
  http.patch('*/leader/recruitments/55/close', () => new HttpResponse(null, { status: 204 })),
  http.get('*/clubs/10/join-requests', ({ request }) => {
    lastRequestsQuery = new URL(request.url).searchParams.get('status');
    return HttpResponse.json({ ok: true, message: null, data: [pendingRequest] });
  }),
  http.get('*/clubs/10/join-requests/41', () =>
    HttpResponse.json({
      ok: true,
      message: null,
      data: { ...pendingRequest, phone: '010-1234-5678', rejectReason: null, reviewedAt: null },
    }),
  ),
  http.patch('*/clubs/10/join-requests/bulk-approve', async ({ request }) => {
    lastBulkBody = await request.json();
    return HttpResponse.json({
      ok: true,
      message: null,
      data: { approvedCount: 1, failures: [{ joinRequestId: 42, reason: '잔여 인원이 부족합니다.' }] },
    });
  }),
  http.patch('*/clubs/10/join-requests/41', async ({ request }) => {
    lastDecideBody = await request.json();
    return HttpResponse.json({ ok: true, message: null, data: { result: 'AUTO_REJECTED' } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  lastRequestsQuery = null;
  lastCreateBody = null;
  lastInviteCreateBody = null;
  lastDecideBody = null;
  lastBulkBody = null;
});
afterAll(() => server.close());

describe('가입 링크 훅', () => {
  it('활성 코드를 조회한다', async () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useActiveJoinCodeQuery(10, 55), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(activeJoinCode);
  });

  it('활성 코드가 없으면 200 + data null 을 null 로 돌려준다(오류 아님)', async () => {
    server.use(
      http.get('*/clubs/10/recruitments/55/join-codes/active', () =>
        HttpResponse.json({ ok: true, message: null, data: null }),
      ),
    );
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useActiveJoinCodeQuery(10, 55), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('recruitmentId 가 없으면 조회하지 않는다', () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useActiveJoinCodeQuery(10, undefined), {
      wrapper: makeWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe('idle');
  });

  it('같은 동아리라도 모집이 다르면 캐시를 공유하지 않는다', async () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useActiveJoinCodeQuery(10, 55), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(clubQueryKeys.joinCode(10, 55))).toEqual(activeJoinCode);
    expect(queryClient.getQueryData(clubQueryKeys.joinCode(10, 56))).toBeUndefined();
  });

  it('clubId 가 없으면 조회하지 않는다', () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useActiveJoinCodeQuery(undefined, 55), {
      wrapper: makeWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe('idle');
  });

  it('링크 생성 성공 시 가입 링크 키를 무효화하고 가입 가능 기간 프리셋을 그대로 보낸다', async () => {
    const queryClient = newQueryClient();
    queryClient.setQueryData(clubQueryKeys.joinCode(10, 55), null);

    const { result } = renderHook(() => useCreateJoinCodeMutation(10, 55), {
      wrapper: makeWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync({ maxUses: 30, joinWindowDays: 14, generation: 12 });
    });

    expect(lastCreateBody).toEqual({ maxUses: 30, joinWindowDays: 14, generation: 12 });
    expect(queryClient.getQueryState(clubQueryKeys.joinCode(10, 55))?.isInvalidated).toBe(true);
  });

  // 마감하면 가입 가능 기간이 "종료 후 N일" 텍스트에서 실제 만료 일시로 바뀐다 — 링크 응답이
  // 달라지므로 마감 뮤테이션이 해당 모집의 링크 캐시까지 무효화해야 상태 카드가 바로 따라온다.
  it('모집 마감 성공 시 그 모집의 가입 링크 키도 무효화한다', async () => {
    const queryClient = newQueryClient();
    queryClient.setQueryData(clubQueryKeys.joinCode(10, 55), activeJoinCode);
    queryClient.setQueryData(clubQueryKeys.joinCode(10, 56), activeJoinCode);

    const { result } = renderHook(() => useCloseRecruitmentMutation(55, 10), {
      wrapper: makeWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(queryClient.getQueryState(clubQueryKeys.joinCode(10, 55))?.isInvalidated).toBe(true);
    // 같은 동아리의 다른 모집 링크까지 건드리지 않는다.
    expect(queryClient.getQueryState(clubQueryKeys.joinCode(10, 56))?.isInvalidated).toBe(false);
  });

  it('링크 폐기 성공 시 가입 링크 키를 무효화한다', async () => {
    const queryClient = newQueryClient();
    queryClient.setQueryData(clubQueryKeys.joinCode(10, 55), activeJoinCode);

    const { result } = renderHook(() => useRevokeJoinCodeMutation(10, 55), {
      wrapper: makeWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync(7);
    });

    expect(queryClient.getQueryState(clubQueryKeys.joinCode(10, 55))?.isInvalidated).toBe(true);
  });
});

describe('부원 초대 링크 훅', () => {
  it('활성 초대 링크를 조회하고 모집 링크 캐시와 섞이지 않는다', async () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useClubInviteCodeQuery(10), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(activeInviteCode);
    expect(queryClient.getQueryData(clubQueryKeys.clubInviteCode(10))).toEqual(activeInviteCode);
    expect(queryClient.getQueryData(clubQueryKeys.joinCode(10, 55))).toBeUndefined();
  });

  it('활성 초대 링크가 없으면 200 + data null 을 null 로 돌려준다(오류 아님)', async () => {
    server.use(
      http.get('*/clubs/10/join-codes/active', () =>
        HttpResponse.json({ ok: true, message: null, data: null }),
      ),
    );
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useClubInviteCodeQuery(10), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('clubId 가 없으면 초대 링크를 조회하지 않는다', () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useClubInviteCodeQuery(undefined), {
      wrapper: makeWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe('idle');
  });

  it('초대 링크 생성 성공 시 발급 설정을 그대로 보내고 초대 링크 키를 무효화한다', async () => {
    const queryClient = newQueryClient();
    queryClient.setQueryData(clubQueryKeys.clubInviteCode(10), null);

    const { result } = renderHook(() => useCreateClubInviteCodeMutation(10), {
      wrapper: makeWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync({ maxUses: 150, expiresInHours: 72, autoApprove: true });
    });

    expect(lastInviteCreateBody).toEqual({ maxUses: 150, expiresInHours: 72, autoApprove: true });
    expect(queryClient.getQueryState(clubQueryKeys.clubInviteCode(10))?.isInvalidated).toBe(true);
  });

  it('초대 링크 폐기 성공 시 초대 링크 키를 무효화한다', async () => {
    const queryClient = newQueryClient();
    queryClient.setQueryData(clubQueryKeys.clubInviteCode(10), activeInviteCode);

    const { result } = renderHook(() => useRevokeClubInviteCodeMutation(10), {
      wrapper: makeWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync(9);
    });

    expect(queryClient.getQueryState(clubQueryKeys.clubInviteCode(10))?.isInvalidated).toBe(true);
  });
});

describe('가입 요청 훅', () => {
  it('상태 필터를 쿼리 파라미터로 보내고 상태별로 키를 분리한다', async () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useJoinRequestsQuery(10, 'APPROVED'), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastRequestsQuery).toBe('APPROVED');
    expect(queryClient.getQueryData(clubQueryKeys.joinRequests(10, 'APPROVED'))).toEqual([
      pendingRequest,
    ]);
    expect(queryClient.getQueryData(clubQueryKeys.joinRequests(10, 'PENDING'))).toBeUndefined();
  });

  it('상세 조회는 전화번호를 포함한다', async () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useJoinRequestDetailQuery(10, 41), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.phone).toBe('010-1234-5678');
  });

  it('joinRequestId 가 없으면 상세를 조회하지 않는다', () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useJoinRequestDetailQuery(10, null), {
      wrapper: makeWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe('idle');
  });

  it('단건 처리는 결과를 그대로 반환하고 요청·멤버·코드 키를 무효화한다', async () => {
    const queryClient = newQueryClient();
    queryClient.setQueryData(clubQueryKeys.joinRequests(10, 'PENDING'), [pendingRequest]);
    queryClient.setQueryData(clubQueryKeys.members(10), []);
    queryClient.setQueryData(clubQueryKeys.joinCode(10, 55), activeJoinCode);
    queryClient.setQueryData(clubQueryKeys.clubInviteCode(10), activeInviteCode);

    const { result } = renderHook(() => useDecideJoinRequestMutation(10), {
      wrapper: makeWrapper(queryClient),
    });
    let decision: string | undefined;
    await act(async () => {
      const response = await result.current.mutateAsync({
        joinRequestId: 41,
        payload: { status: 'APPROVED' },
      });
      decision = response.result;
    });

    expect(lastDecideBody).toEqual({ status: 'APPROVED' });
    expect(decision).toBe('AUTO_REJECTED');
    expect(
      queryClient.getQueryState(clubQueryKeys.joinRequests(10, 'PENDING'))?.isInvalidated,
    ).toBe(true);
    expect(queryClient.getQueryState(clubQueryKeys.members(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(clubQueryKeys.joinCode(10, 55))?.isInvalidated).toBe(true);
    // 승인 한 건은 초대 링크의 usedCount·대기 수도 바꾼다 — 클럽 프리픽스 무효화가 초대 링크 키까지 덮어야 한다.
    expect(queryClient.getQueryState(clubQueryKeys.clubInviteCode(10))?.isInvalidated).toBe(true);
  });

  it('일괄 승인은 승인 수와 실패 사유를 반환하고 관련 키를 무효화한다', async () => {
    const queryClient = newQueryClient();
    queryClient.setQueryData(clubQueryKeys.joinRequests(10, 'PENDING'), [pendingRequest]);
    queryClient.setQueryData(clubQueryKeys.members(10), []);
    queryClient.setQueryData(clubQueryKeys.joinCode(10, 55), activeJoinCode);

    const { result } = renderHook(() => useBulkApproveJoinRequestsMutation(10), {
      wrapper: makeWrapper(queryClient),
    });
    let bulkResult: { approvedCount: number; failures: { reason: string }[] } | undefined;
    await act(async () => {
      bulkResult = await result.current.mutateAsync({ joinRequestIds: [41, 42] });
    });

    expect(lastBulkBody).toEqual({ joinRequestIds: [41, 42] });
    expect(bulkResult?.approvedCount).toBe(1);
    expect(bulkResult?.failures[0]?.reason).toBe('잔여 인원이 부족합니다.');
    expect(
      queryClient.getQueryState(clubQueryKeys.joinRequests(10, 'PENDING'))?.isInvalidated,
    ).toBe(true);
    expect(queryClient.getQueryState(clubQueryKeys.members(10))?.isInvalidated).toBe(true);
  });

  it('학생 가입 요청이 409 로 실패해도 코드 확인을 무효화한다', async () => {
    server.use(
      http.post('*/join-codes/ABCD1234/requests', () =>
        HttpResponse.json(
          { ok: false, message: '이미 대기 중인 요청이 있습니다.', data: null },
          { status: 409 },
        ),
      ),
    );
    const queryClient = newQueryClient();
    queryClient.setQueryData(clubQueryKeys.joinCodeCheck('ABCD1234'), { usable: true });

    const { result } = renderHook(() => useCreateJoinRequestMutation('ABCD1234'), {
      wrapper: makeWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });

    expect(result.current.isError).toBe(true);
    expect(
      queryClient.getQueryState(clubQueryKeys.joinCodeCheck('ABCD1234'))?.isInvalidated,
    ).toBe(true);
  });
});
