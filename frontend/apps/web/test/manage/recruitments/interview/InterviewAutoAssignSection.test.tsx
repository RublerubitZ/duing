import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { MatchingCandidatesView } from '@duing/types';
import { InterviewAutoAssignSection } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_components/InterviewAutoAssignSection';

const RECRUITMENT_ID = 77;
const server = setupServer();
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const candidatesFixture: MatchingCandidatesView = {
  totalCandidates: 12,
  candidatesWithAvailability: 10,
  candidatesWithoutAvailability: 2,
  slots: [
    { slotId: 1, startTime: '', capacity: 4, availabilityCount: 5, alreadyAssignedCount: 0 },
    { slotId: 2, startTime: '', capacity: 4, availabilityCount: 5, alreadyAssignedCount: 0 },
  ],
};

function renderSection({
  candidates = candidatesFixture,
  alreadyAssigned = false,
  assignmentCompletedAt = null as string | null,
}: {
  candidates?: MatchingCandidatesView;
  alreadyAssigned?: boolean;
  assignmentCompletedAt?: string | null;
} = {}) {
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
      <InterviewAutoAssignSection
        recruitmentId={RECRUITMENT_ID}
        candidates={candidates}
        alreadyAssigned={alreadyAssigned}
        assignmentCompletedAt={assignmentCompletedAt}
      />
    </Wrapper>,
  );
}

describe('InterviewAutoAssignSection — Step 3 dry-run + 실행', () => {
  it('candidates 응답 기반 5 지표가 정확히 계산되어 표시된다', () => {
    renderSection();

    // totalCandidates 12, totalCapacity 8, expectedAssigned min(10,8)=8, expectedUnassigned 2, no-avail 2
    expect(screen.getByText('총 후보자')).toBeInTheDocument();
    expect(screen.getByText('12명')).toBeInTheDocument();
    expect(screen.getByText('총 Capacity')).toBeInTheDocument();
    expect(screen.getByText('예상 배정 (추정)')).toBeInTheDocument();
    expect(screen.getByText('예상 미배정 (추정)')).toBeInTheDocument();
    expect(screen.getByText('가능시간 미제출')).toBeInTheDocument();
    // 8명: totalCapacity + expectedAssigned — 두 곳 동시 노출.
    expect(screen.getAllByText('8명').length).toBeGreaterThanOrEqual(2);
    // 2명: expectedUnassigned + noAvailability — 두 곳 동시 노출.
    expect(screen.getAllByText('2명').length).toBeGreaterThanOrEqual(2);
  });

  it('자동 배정 실행 → confirm 후 mutation 호출, 성공 시 결과 메시지 노출', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    let posted = false;
    server.use(
      http.post(
        `*/recruitments/${RECRUITMENT_ID}/interview-schedules/auto-assign`,
        () => {
          posted = true;
          return HttpResponse.json({
            ok: true,
            data: {
              totalCandidates: 12,
              assignedCount: 8,
              unassignedCount: 2,
              noAvailabilityCount: 2,
              assignmentCompletedAt: '2026-06-19T10:00:00',
            },
            message: null,
          });
        },
      ),
    );

    renderSection();
    await user.click(screen.getByRole('button', { name: '자동 배정 실행' }));

    await waitFor(() => {
      expect(posted).toBe(true);
    });
    expect(await screen.findByRole('status')).toHaveTextContent('자동 배정 완료');

    confirmSpy.mockRestore();
  });

  it('alreadyAssigned=true 면 버튼이 disabled 되고 완료 안내가 표시된다', () => {
    renderSection({
      alreadyAssigned: true,
      assignmentCompletedAt: '2026-06-19T10:00:00',
    });

    const button = screen.getByRole('button', { name: '자동 배정 실행' });
    expect(button).toBeDisabled();
    expect(
      screen.getByText(/이미 자동 배정이 완료되었습니다/),
    ).toBeInTheDocument();
  });
});
