import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { RecruitmentDetail } from '@duing/types';
import { InterviewScheduleCard } from '@/app/me/applications/[applicationId]/_components/InterviewScheduleCard';

const APPLICATION_ID = 501;
const RECRUITMENT_ID = 42;

const server = setupServer();
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

type RecruitmentOpts = {
  useInterview?: boolean;
  interviewAvailabilityDeadline?: string | null;
};

function makeRecruitment({
  useInterview = true,
  interviewAvailabilityDeadline = null,
}: RecruitmentOpts = {}): RecruitmentDetail {
  return {
    id: RECRUITMENT_ID,
    clubId: 1,
    clubName: '테스트 동아리',
    title: '2026 신입 모집',
    startDate: '2026-06-01',
    endDate: '2026-06-15',
    capacity: 10,
    status: 'OPEN',
    displayStatus: 'OPEN',
    effectivelyOpen: true,
    applicationMode: 'SELF',
    externalFormUrl: null,
    useInterview,
    targetRole: 'MEMBER',
    content: null,
    questions: ['지원 동기는?'],
    interviewStartDate: null,
    interviewEndDate: null,
    showApplicantCount: false,
    applicantCount: null,
    interviewAvailabilityDeadline,
  };
}

type ScheduleOpts =
  | { assigned: false }
  | {
      assigned: true;
      status?: 'ASSIGNED' | 'CANCELLED';
      location?: string | null;
    };

function mockRecruitmentDetail(recruitment: RecruitmentDetail) {
  server.use(
    http.get(`*/recruitments/${RECRUITMENT_ID}`, () =>
      HttpResponse.json({ ok: true, data: recruitment, message: null }),
    ),
  );
}

function mockMySchedule(opts: ScheduleOpts) {
  server.use(
    http.get(
      `*/applications/${APPLICATION_ID}/interview-schedule`,
      () => {
        if (!opts.assigned) {
          return HttpResponse.json({
            ok: true,
            data: { assigned: false },
            message: null,
          });
        }
        return HttpResponse.json({
          ok: true,
          data: {
            assigned: true,
            schedule: {
              scheduleId: 9001,
              slotId: 1,
              startTime: '2026-06-20T10:00:00',
              endTime: '2026-06-20T10:30:00',
              status: opts.status ?? 'ASSIGNED',
              assignedAt: '2026-06-19T10:00:00',
            },
            location: opts.location ?? null,
          },
          message: null,
        });
      },
    ),
  );
}

function renderCard() {
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
      <InterviewScheduleCard
        applicationId={APPLICATION_ID}
        recruitmentId={RECRUITMENT_ID}
      />
    </Wrapper>,
  );
}

describe('InterviewScheduleCard', () => {
  it('useInterview=false 인 모집은 카드 자체를 렌더하지 않는다', async () => {
    mockRecruitmentDetail(makeRecruitment({ useInterview: false }));
    mockMySchedule({ assigned: false });

    const { container } = renderCard();

    await waitFor(() => {
      expect(container.querySelector('section')).toBeNull();
    });
    expect(screen.queryByText('면접 일정')).not.toBeInTheDocument();
  });

  it('assigned=false 시 "자동 배정 대기 중" 문구를 노출한다', async () => {
    mockRecruitmentDetail(
      makeRecruitment({ interviewAvailabilityDeadline: '2099-12-31T23:59:00' }),
    );
    mockMySchedule({ assigned: false });

    renderCard();

    expect(await screen.findByText('자동 배정 대기 중')).toBeInTheDocument();
  });

  it('deadline 전이면 "가능시간 수정" 버튼이 노출된다', async () => {
    mockRecruitmentDetail(
      makeRecruitment({ interviewAvailabilityDeadline: '2099-12-31T23:59:00' }),
    );
    mockMySchedule({ assigned: false });

    renderCard();

    expect(
      await screen.findByRole('button', { name: '가능시간 수정' }),
    ).toBeInTheDocument();
  });

  it('deadline 가 지났으면 수정 버튼 대신 종료 안내가 노출된다', async () => {
    mockRecruitmentDetail(
      makeRecruitment({ interviewAvailabilityDeadline: '2000-01-01T00:00:00' }),
    );
    mockMySchedule({ assigned: false });

    renderCard();

    expect(await screen.findByText('자동 배정 대기 중')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '가능시간 수정' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('가능시간 수정 기간이 종료되었습니다.'),
    ).toBeInTheDocument();
  });

  it('assigned=true, ASSIGNED, location 있으면 일시·장소가 표시된다', async () => {
    mockRecruitmentDetail(makeRecruitment());
    mockMySchedule({
      assigned: true,
      status: 'ASSIGNED',
      location: '공학관 2201호',
    });

    renderCard();

    expect(await screen.findByText(/6월 20일 10:00 ~ 10:30/)).toBeInTheDocument();
    expect(screen.getByText('공학관 2201호')).toBeInTheDocument();
    expect(screen.queryByText('취소됨')).not.toBeInTheDocument();
  });

  it('assigned=true, location=null 이면 "장소는 추후 안내됩니다" fallback', async () => {
    mockRecruitmentDetail(makeRecruitment());
    mockMySchedule({ assigned: true, status: 'ASSIGNED', location: null });

    renderCard();

    expect(
      await screen.findByText('장소는 추후 안내됩니다.'),
    ).toBeInTheDocument();
  });

  it('assigned=true, status=CANCELLED 시 "취소됨" 배지가 노출된다', async () => {
    mockRecruitmentDetail(makeRecruitment());
    mockMySchedule({ assigned: true, status: 'CANCELLED', location: null });

    renderCard();

    expect(await screen.findByText('취소됨')).toBeInTheDocument();
  });

  it('수정 버튼 클릭 시 EditAvailabilityModal 이 열린다', async () => {
    const user = userEvent.setup();
    mockRecruitmentDetail(
      makeRecruitment({ interviewAvailabilityDeadline: '2099-12-31T23:59:00' }),
    );
    mockMySchedule({ assigned: false });
    // 모달이 열리면 availabilities + applicant-slots 가 fetch 된다.
    server.use(
      http.get(
        `*/applications/${APPLICATION_ID}/interview-availabilities`,
        () =>
          HttpResponse.json({ ok: true, data: { slotIds: [] }, message: null }),
      ),
      http.get(
        `*/recruitments/${RECRUITMENT_ID}/applicant-interview-slots`,
        () => HttpResponse.json({ ok: true, data: [], message: null }),
      ),
    );

    renderCard();

    const editButton = await screen.findByRole('button', {
      name: '가능시간 수정',
    });
    await user.click(editButton);

    expect(
      await screen.findByRole('dialog', {
        name: '면접 가능시간 수정',
        hidden: true,
      }),
    ).toBeInTheDocument();
  });
});
