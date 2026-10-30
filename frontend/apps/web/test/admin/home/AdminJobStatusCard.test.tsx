import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminJobStatus, AdminJobStatuses } from '@duing/types';

const mockJobStatuses = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useAdminJobStatusesQuery: () => mockJobStatuses(),
}));

import { AdminJobStatusCard } from '@/app/admin/_components/home/AdminJobStatusCard';

const JOB_KEYS = [
  'RECRUITMENT_AUTO_CLOSE',
  'APPLICATION_PENDING_REMINDER',
  'FACILITY_RESERVATION_CRAWL',
  'FACILITY_BOOKING_MATCHING',
  'FEDERATION_INQUIRY_PURGE',
];

function healthyStatus(job: string): AdminJobStatus {
  const finishedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  return { job, health: 'OK', lastFinishedAt: finishedAt, lastSucceededAt: finishedAt, lastOutcome: 'SUCCESS', resultCount: 0, failedCount: 0 };
}

function statusesWith(overrides: Record<string, Partial<AdminJobStatus>>): AdminJobStatuses {
  return { jobs: JOB_KEYS.map((job) => ({ ...healthyStatus(job), ...overrides[job] })) };
}

const loaded = (data: unknown) => ({ data, isError: false });
const failed = () => ({ data: undefined, isError: true });
const loading = () => ({ data: undefined, isError: false });

beforeEach(() => {
  vi.clearAllMocks();
  mockJobStatuses.mockReturnValue(loaded(statusesWith({})));
});

describe('AdminJobStatusCard', () => {
  it('모두 정상이면 정상 문장과 작업 다섯 줄을 보이고, 배지·연락 경로는 숨긴다', () => {
    render(<AdminJobStatusCard />);
    expect(screen.getByRole('heading', { name: '자동 작업' })).toBeInTheDocument();
    expect(screen.getByText('모두 제때 돌고 있어요')).toBeInTheDocument();
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(5);
    for (const name of ['모집 자동 마감', '미처리 지원 리마인더', '학교 시설 예약 수집', '학교 반영 확인', '문의 보관 기간 파기']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.queryByText(/^확인 필요/)).toBeNull();
    expect(screen.queryByText('두잉 담당자에게 알려 주세요')).toBeNull();
    expect(screen.queryByRole('link', { name: '두잉팀 카카오 문의' })).toBeNull();
  });

  it('경고가 있으면 개수·배지·안내와 연락 경로 셋을 보이고, 그 줄에만 업무 영향과 직접 할 일을 붙인다', () => {
    mockJobStatuses.mockReturnValue(
      loaded(statusesWith({ FACILITY_BOOKING_MATCHING: { health: 'OVERDUE' } })),
    );
    render(<AdminJobStatusCard />);
    expect(screen.getByText('확인이 필요한 자동 작업이 1개 있어요')).toBeInTheDocument();
    expect(screen.getByText('확인 필요 1')).toBeInTheDocument();
    expect(screen.getByText('두잉 담당자에게 알려 주세요')).toBeInTheDocument();
    expect(screen.getByText('늦음')).toBeInTheDocument();
    expect(screen.getByText('학교 반영 대기가 자동으로 줄지 않아요')).toBeInTheDocument();
    expect(screen.getByText('시설 예약 관리에서 직접 확정할 수 있어요')).toBeInTheDocument();
    expect(screen.queryByText('시설 예약 현황이 최신이 아닐 수 있어요')).toBeNull();

    const kakao = screen.getByRole('link', { name: '두잉팀 카카오 문의' });
    expect(kakao).toHaveAttribute('href', 'https://open.kakao.com/o/s6JruOzi');
    expect(kakao).toHaveAttribute('target', '_blank');
    expect(kakao).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: '메일 보내기 duing.official@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:duing.official@gmail.com',
    );
    expect(screen.getByRole('link', { name: '1:1 문의' })).toHaveAttribute('href', '/me/inquiries/new');
  });

  it('꺼 둔 작업은 경고로 세지 않지만 꺼 둔 개수와 회색 업무 영향을 남긴다', () => {
    mockJobStatuses.mockReturnValue(
      loaded(statusesWith({ FEDERATION_INQUIRY_PURGE: { health: 'DISABLED' } })),
    );
    render(<AdminJobStatusCard />);
    expect(screen.getByText('모두 제때 돌고 있어요 · 꺼 둔 작업 1개')).toBeInTheDocument();
    expect(screen.getByText('꺼짐')).toBeInTheDocument();
    expect(screen.getByText('두잉 담당자가 꺼 두었어요')).toBeInTheDocument();
    expect(screen.getByText('삭제된 문의 내용이 보관 기간을 넘겨 남아 있을 수 있어요')).toBeInTheDocument();
    expect(screen.queryByText(/^확인 필요/)).toBeNull();
    expect(screen.queryByRole('link', { name: '1:1 문의' })).toBeNull();
  });

  it('모르는 작업 키는 그리지 않고 경고 수에서도 뺀다', () => {
    const statuses = statusesWith({});
    mockJobStatuses.mockReturnValue(
      loaded({ jobs: [...statuses.jobs, { ...healthyStatus('RETIRED_JOB'), health: 'FAILED' }] }),
    );
    render(<AdminJobStatusCard />);
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText('모두 제때 돌고 있어요')).toBeInTheDocument();
  });

  it('받는 중이면 공용 로딩, 실패면 공용 실패 문구다', () => {
    mockJobStatuses.mockReturnValue(loading());
    const { unmount } = render(<AdminJobStatusCard />);
    expect(screen.getByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    unmount();

    mockJobStatuses.mockReturnValue(failed());
    render(<AdminJobStatusCard />);
    expect(screen.getByText('불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
  });

  it('연락 링크는 터치 높이 44px(min-h-11)다', () => {
    mockJobStatuses.mockReturnValue(loaded(statusesWith({ RECRUITMENT_AUTO_CLOSE: { health: 'FAILED', lastOutcome: 'FAILED' } })));
    render(<AdminJobStatusCard />);
    expect(screen.getByRole('link', { name: '두잉팀 카카오 문의' })).toHaveClass('min-h-11');
    expect(screen.getByRole('link', { name: '1:1 문의' })).toHaveClass('min-h-11');
  });
});
