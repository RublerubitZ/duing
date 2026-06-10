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

// Step 2 (SlotSection) 가 모집 시작일을 필요로 하므로 detail mock 을 공용으로 둔다.
// 본 테스트 그룹은 단계 결정 자체만 검증하므로 startDate 는 충분히 미래로 설정.
function mockRecruitmentDetail(startDate = '2099-01-01') {
  return http.get(`*/recruitments/${RECRUITMENT_ID}`, () =>
    HttpResponse.json({
      ok: true,
      data: {
        id: RECRUITMENT_ID,
        clubId: 1,
        clubName: '테스트 동아리',
        title: '테스트 모집',
        startDate,
        endDate: null,
        capacity: 10,
        status: 'OPEN',
        displayStatus: 'UPCOMING',
        effectivelyOpen: false,
        applicationMode: 'SELF',
        externalFormUrl: null,
        useInterview: true,
        targetRole: 'MEMBER',
        content: null,
        questions: [],
        interviewStartDate: null,
        interviewEndDate: null,
        showApplicantCount: false,
        applicantCount: null,
      },
      message: null,
    }),
  );
}

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
      mockRecruitmentDetail(),
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
      mockRecruitmentDetail(),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-config`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            configId: 1,
            availabilityDeadline: '2026-06-18T14:00:00Z',
            location: '공학관 2201호',
            slotLifecyclePhase: 'BEFORE_DEADLINE',
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
      mockRecruitmentDetail(),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-config`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            configId: 1,
            availabilityDeadline: '2026-06-18T14:00:00Z',
            assignmentCompletedAt: '2026-06-19T10:00:00Z',
            location: '공학관 2201호',
            slotLifecyclePhase: 'AFTER_ASSIGNMENT',
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
      // Step 4 진입 시 currentStepProbe >= 3 → useMatchingCandidatesQuery 활성,
      // currentStepProbe >= 4 → useInterviewSchedulesQuery 활성.
      // onUnhandledRequest: 'error' 정책상 두 endpoint 모두 핸들러 등록 필요.
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-schedules`, () =>
        HttpResponse.json({ ok: true, data: [], message: null }),
      ),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-matching-candidates`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            totalCandidates: 0,
            candidatesWithAvailability: 0,
            candidatesWithoutAvailability: 0,
            slots: [],
          },
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
