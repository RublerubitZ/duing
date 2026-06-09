import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { InterviewManagementPage } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_pages/InterviewManagementPage';

// MSW 기반 통합 테스트 — TanStack Query 자체를 mock 하지 않고
// 네트워크 레벨에서 mocking 한다 (spec §6 invalidation 매트릭스 검증과 동일 패턴).

const RECRUITMENT_ID = 10;
const server = setupServer();
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  }

  return render(
    <Wrapper>
      <InterviewManagementPage clubId={1} recruitmentId={RECRUITMENT_ID} />
    </Wrapper>,
  );
}

describe('InterviewManagementPage — 자동 단계 결정 (spec §4)', () => {
  it('config 가 없으면 Step 1(면접 설정) 이 active', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-config`, () =>
        HttpResponse.json(
          { ok: false, data: null, message: '면접 설정을 찾을 수 없습니다.' },
          { status: 404 },
        ),
      ),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-slots`, () =>
        HttpResponse.json({ ok: true, data: [], message: null }),
      ),
    );

    renderPage();

    await waitFor(
      () => {
        const activeStep = screen.getByRole('listitem', { current: 'step' });
        expect(activeStep).toHaveTextContent('면접 설정');
      },
      { timeout: 3000 },
    );
  });

  it('config 있고 slots 가 0 개면 Step 2(슬롯 관리) 가 active', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-config`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            configId: 1,
            availabilityDeadline: '2026-06-18T14:00:00Z',
            location: '공학관 2201호',
          },
          message: null,
        }),
      ),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-slots`, () =>
        HttpResponse.json({ ok: true, data: [], message: null }),
      ),
    );

    renderPage();

    await waitFor(() => {
      const activeStep = screen.getByRole('listitem', { current: 'step' });
      expect(activeStep).toHaveTextContent('슬롯 관리');
    });
  });

  it('assignmentCompletedAt 이 있으면 Step 4(일정 관리) 가 active', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-config`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            configId: 1,
            availabilityDeadline: '2026-06-18T14:00:00Z',
            assignmentCompletedAt: '2026-06-19T10:00:00Z',
            location: '공학관 2201호',
          },
          message: null,
        }),
      ),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-slots`, () =>
        HttpResponse.json({
          ok: true,
          data: [
            {
              slotId: 1,
              startTime: '2026-06-19T11:00:00Z',
              endTime: '2026-06-19T11:30:00Z',
              capacity: 2,
              availabilityCount: 0,
              assignedCount: 0,
            },
          ],
          message: null,
        }),
      ),
    );

    renderPage();

    await waitFor(() => {
      const activeStep = screen.getByRole('listitem', { current: 'step' });
      expect(activeStep).toHaveTextContent('일정 관리');
    });
  });
});
