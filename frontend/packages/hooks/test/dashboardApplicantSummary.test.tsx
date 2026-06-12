import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { useApplicantSummary } from '../src/dashboard';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (<ApiClientProvider client={apiClient}><QueryClientProvider client={qc}>{children}</QueryClientProvider></ApiClientProvider>);
  };
}
function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function recruitmentRow(id: number, displayStatus: string) {
  return { id, clubId: 10, clubName: '두잉', title: `모집${id}`, startDate: '2026-06-01', endDate: '2026-06-30',
    capacity: 10, status: displayStatus === 'CLOSED' ? 'CLOSED' : 'OPEN', displayStatus, effectivelyOpen: displayStatus !== 'CLOSED',
    applicationMode: 'INTERNAL', externalFormUrl: null, useInterview: true, targetRole: 'MEMBER' };
}
function statsBody(over: Record<string, number>) {
  return { ok: true, message: null,
    data: { total: 0, submitted: 0, underReview: 0, interviewPending: 0, accepted: 0, rejected: 0, capacity: 10, ratio: 0, ...over } };
}

const server = setupServer(
  http.get('*/clubs/10/recruitments', () =>
    HttpResponse.json({ ok: true, message: null, data: [recruitmentRow(1, 'OPEN'), recruitmentRow(2, 'OPEN')] }),
  ),
  http.get('*/leader/recruitments/1/stats/summary', () => HttpResponse.json(statsBody({ total: 5, submitted: 2, accepted: 1 }))),
  http.get('*/leader/recruitments/2/stats/summary', () => HttpResponse.json(statsBody({ total: 3, submitted: 1, interviewPending: 2 }))),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useApplicantSummary', () => {
  it('진행 중 모집들의 통계를 합산한다', async () => {
    const { result } = renderHook(() => useApplicantSummary(10), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.totals.total).toBe(8);
    expect(result.current.totals.submitted).toBe(3);
    expect(result.current.totals.interviewPending).toBe(2);
  });
});
