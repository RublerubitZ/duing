import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type {
  InterviewConfig,
  ScheduleListView,
  SlotListView,
} from '@duing/types';
import { InterviewScheduleManagementSection } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_components/InterviewScheduleManagementSection';

const RECRUITMENT_ID = 99;
const server = setupServer();
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const baseConfig: InterviewConfig = {
  configId: 1,
  availabilityDeadline: '2026-06-18T14:00:00',
  assignmentCompletedAt: '2026-06-19T10:00:00',
  location: '공학관 2201호',
  slotLifecyclePhase: 'AFTER_ASSIGNMENT',
};

const baseSchedules: ScheduleListView[] = [
  {
    slotId: 1,
    startTime: '2026-06-20T10:00:00',
    endTime: '2026-06-20T10:30:00',
    capacity: 2,
    location: '공학관 2201호',
    assigned: [
      {
        scheduleId: 100,
        applicationId: 501,
        status: 'ASSIGNED',
        assignedAt: '2026-06-19T10:00:00',
      },
    ],
  },
  {
    slotId: 2,
    startTime: '2026-06-20T11:00:00',
    endTime: '2026-06-20T11:30:00',
    capacity: 2,
    location: '공학관 2201호',
    assigned: [],
  },
];

const baseSlots: SlotListView[] = [
  {
    slotId: 1,
    startTime: '2026-06-20T10:00:00',
    endTime: '2026-06-20T10:30:00',
    capacity: 2,
    availabilityCount: 3,
    assignedCount: 1,
  },
  {
    slotId: 2,
    startTime: '2026-06-20T11:00:00',
    endTime: '2026-06-20T11:30:00',
    capacity: 2,
    availabilityCount: 2,
    assignedCount: 0,
  },
];

function renderSection({
  schedules = baseSchedules,
  config = baseConfig,
  slots = baseSlots,
}: {
  schedules?: ScheduleListView[];
  config?: InterviewConfig | null;
  slots?: SlotListView[];
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
      <InterviewScheduleManagementSection
        recruitmentId={RECRUITMENT_ID}
        schedules={schedules}
        config={config}
        slots={slots}
      />
    </Wrapper>,
  );
}

describe('InterviewScheduleManagementSection — Step 4 일정 관리', () => {
  it('config.location 이 있으면 banner 가 노출된다', () => {
    renderSection();
    expect(screen.getByText(/면접 장소:/)).toBeInTheDocument();
    expect(screen.getByText('공학관 2201호')).toBeInTheDocument();
  });

  it('config.location 이 null 이면 banner 가 숨겨진다', () => {
    renderSection({
      config: { ...baseConfig, location: undefined },
    });
    expect(screen.queryByText(/면접 장소:/)).not.toBeInTheDocument();
  });

  it('슬롯별 보기 탭에서 assigned 지원자 chip 이 표시되고 onCancel 호출 시 mutation 호출', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let cancelledApplicationId: number | null = null;
    server.use(
      http.delete(`*/applications/:applicationId/interview-schedule`, ({ params }) => {
        cancelledApplicationId = Number(params.applicationId);
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    renderSection();

    // ManagementSlotCard 에 지원자 #501 라벨이 표시되어야 함.
    expect(screen.getAllByText('지원자 #501').length).toBeGreaterThanOrEqual(1);

    // 슬롯별 보기 탭이 기본. 카드의 "취소" 버튼 클릭.
    const cancelButtons = screen.getAllByRole('button', { name: '취소' });
    // 카드 내부 취소 버튼 — 최상위 footer 의 일반 취소 버튼이 없으므로 첫 번째 호출.
    const firstCancelButton = cancelButtons[0];
    if (!firstCancelButton) throw new Error('취소 버튼이 렌더되지 않았다');
    await user.click(firstCancelButton);

    await waitFor(() => {
      expect(cancelledApplicationId).toBe(501);
    });

    confirmSpy.mockRestore();
  });

  it('탭 전환 — 슬롯별(기본) → 전체 일정 클릭 시 list 가 노출된다', async () => {
    const user = userEvent.setup();
    renderSection();

    // 기본은 슬롯별 보기 — ManagementSlotCard 의 capacity 표기.
    expect(screen.getAllByText(/배정 \d+\/\d+명/).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole('tab', { name: '전체 일정' }));

    // 전체 일정 탭으로 전환 후 시간순 list 노출 — applicantLabel + 시간 range.
    const allPanel = await screen.findByRole('tabpanel', { name: '전체 일정' });
    expect(allPanel).toBeInTheDocument();
    expect(allPanel.textContent).toContain('지원자 #501');
  });
});
