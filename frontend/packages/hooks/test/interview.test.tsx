import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { interviewQueryKeys } from '../src/interviewQueryKeys';
import { applicationQueryKeys } from '../src/applicationQueryKeys';
import {
  useCreateInterviewSlotsMutation,
  useUpdateInterviewSlotMutation,
  useAutoAssignMutation,
  useAssignInterviewScheduleMutation,
  useCancelInterviewScheduleMutation,
} from '../src/interview';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

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

describe('useCreateInterviewSlotsMutation (spec §6)', () => {
  it('성공 시 slots + candidates + applicantSlots queryKey 가 invalidate 된다', async () => {
    const queryClient = newQueryClient();
    server.use(
      http.post('*/recruitments/10/interview-slots', () =>
        HttpResponse.json({
          ok: true,
          data: { slotIds: [1, 2] },
          message: null,
        }),
      ),
    );

    queryClient.setQueryData(interviewQueryKeys.slots(10), []);
    queryClient.setQueryData(interviewQueryKeys.candidates(10), null);
    queryClient.setQueryData(interviewQueryKeys.applicantSlots(10), []);
    queryClient.setQueryData(interviewQueryKeys.schedules(10), []); // 비대상 — invalidate 안돼야

    const { result } = renderHook(() => useCreateInterviewSlotsMutation(10), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate({
      slots: [{ startTime: '2026-06-18T14:00:00Z', endTime: '2026-06-18T14:30:00Z', capacity: 1 }],
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(interviewQueryKeys.slots(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewQueryKeys.candidates(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewQueryKeys.applicantSlots(10))?.isInvalidated).toBe(true);
    // 비대상: schedules 는 createSlots 단계에서 invalidate 안 함
    expect(queryClient.getQueryState(interviewQueryKeys.schedules(10))?.isInvalidated).toBe(false);
  });
});

describe('useUpdateInterviewSlotMutation (spec §6)', () => {
  it('성공 시 slots + candidates + schedules + applicantSlots 가 invalidate 된다', async () => {
    const queryClient = newQueryClient();
    server.use(
      http.patch('*/interview-slots/77', () =>
        HttpResponse.json({ ok: true, data: null, message: null }),
      ),
    );

    queryClient.setQueryData(interviewQueryKeys.slots(10), []);
    queryClient.setQueryData(interviewQueryKeys.candidates(10), null);
    queryClient.setQueryData(interviewQueryKeys.schedules(10), []);
    queryClient.setQueryData(interviewQueryKeys.applicantSlots(10), []);

    const { result } = renderHook(() => useUpdateInterviewSlotMutation(10), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate({ slotId: 77, payload: { capacity: 3 } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(interviewQueryKeys.slots(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewQueryKeys.candidates(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewQueryKeys.schedules(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewQueryKeys.applicantSlots(10))?.isInvalidated).toBe(true);
  });
});

describe('useAutoAssignMutation (spec §6 + P0 invalidation 확장)', () => {
  it('성공 시 config + schedules + candidates + slots + application 도메인 prefix 가 invalidate 된다', async () => {
    const queryClient = newQueryClient();
    server.use(
      http.post('*/recruitments/10/interview-schedules/auto-assign', () =>
        HttpResponse.json({
          ok: true,
          data: {
            totalCandidates: 2,
            assignedCount: 2,
            unassignedCount: 0,
            noAvailabilityCount: 0,
            assignmentCompletedAt: '2026-06-18T15:00:00Z',
          },
          message: null,
        }),
      ),
    );

    queryClient.setQueryData(interviewQueryKeys.config(10), null);
    queryClient.setQueryData(interviewQueryKeys.schedules(10), []);
    queryClient.setQueryData(interviewQueryKeys.candidates(10), null);
    queryClient.setQueryData(interviewQueryKeys.slots(10), []);
    // 운영진 list / detail / neighbors (`applicationQueryKeys.all` prefix)
    queryClient.setQueryData(applicationQueryKeys.applicants(10), []);
    queryClient.setQueryData(applicationQueryKeys.applicantDetail(55), null);
    // 지원자 my-page (`applicationQueryKeys.allMyLists` prefix)
    queryClient.setQueryData(applicationQueryKeys.myList('ALL'), []);
    queryClient.setQueryData(applicationQueryKeys.myDetail(55), null);

    const { result } = renderHook(() => useAutoAssignMutation(10), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(interviewQueryKeys.config(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewQueryKeys.schedules(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewQueryKeys.candidates(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewQueryKeys.slots(10))?.isInvalidated).toBe(true);
    // 자동배정은 모든 지원자의 assignedSlot 을 변경 → 운영진 detail/list/neighbors 무효화.
    expect(queryClient.getQueryState(applicationQueryKeys.applicants(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(applicationQueryKeys.applicantDetail(55))?.isInvalidated).toBe(true);
    // 지원자 my-page (interview 필드) 도 동시 무효화.
    expect(queryClient.getQueryState(applicationQueryKeys.myList('ALL'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(applicationQueryKeys.myDetail(55))?.isInvalidated).toBe(true);
  });
});

describe('useAssignInterviewScheduleMutation (spec §6)', () => {
  it('성공 시 slots + schedules + candidates 가 invalidate 된다', async () => {
    const queryClient = newQueryClient();
    server.use(
      http.put('*/applications/55/interview-schedule', () =>
        HttpResponse.json({ ok: true, data: null, message: null }),
      ),
    );

    queryClient.setQueryData(interviewQueryKeys.schedules(10), []);
    queryClient.setQueryData(interviewQueryKeys.candidates(10), null);
    queryClient.setQueryData(interviewQueryKeys.slots(10), []);

    const { result } = renderHook(() => useAssignInterviewScheduleMutation(10), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate({ applicationId: 55, slotId: 7 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(interviewQueryKeys.slots(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewQueryKeys.schedules(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewQueryKeys.candidates(10))?.isInvalidated).toBe(true);
  });
});

describe('useCancelInterviewScheduleMutation (spec §6)', () => {
  it('성공 시 slots + schedules + candidates 가 invalidate 된다', async () => {
    const queryClient = newQueryClient();
    server.use(
      http.delete('*/applications/55/interview-schedule', () =>
        HttpResponse.json({ ok: true, data: null, message: null }),
      ),
    );

    queryClient.setQueryData(interviewQueryKeys.slots(10), []);
    queryClient.setQueryData(interviewQueryKeys.schedules(10), []);
    queryClient.setQueryData(interviewQueryKeys.candidates(10), null);

    const { result } = renderHook(() => useCancelInterviewScheduleMutation(10), {
      wrapper: makeWrapper(queryClient),
    });
    result.current.mutate(55);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(interviewQueryKeys.slots(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewQueryKeys.schedules(10))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(interviewQueryKeys.candidates(10))?.isInvalidated).toBe(true);
  });
});

