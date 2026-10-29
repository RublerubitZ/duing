import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminFacilityBookingCounts } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

const mockSummary = vi.fn();
vi.mock('@duing/hooks', () => ({
  useAdminFacilityBookingSummaryQuery: () => mockSummary(),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

import { AdminSchoolSyncCard } from '@/app/admin/_components/home/AdminSchoolSyncCard';

const COUNTS: AdminFacilityBookingCounts = {
  pendingCount: 11,
  todaySubmittedCount: 2,
  oldestPendingWaitingDays: 3,
  approvedWaitingCount: 4,
  oldestApprovedWaitingDays: 4,
  conflictCount: 1,
  conflictSuspectedCount: 0,
  confirmedThisMonthCount: 20,
};
const summaryOf = (overrides: Partial<AdminFacilityBookingCounts>) => ({
  data: { ...COUNTS, ...overrides },
  isLoading: false,
  isError: false,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSummary.mockReturnValue(summaryOf({}));
});

describe('AdminSchoolSyncCard', () => {
  it('승인했지만 학교 일정에 안 보이는 예약 건수와 가장 오래 기다린 기간을 보인다', () => {
    render(<AdminSchoolSyncCard />);
    expect(screen.getByText('승인했지만 학교 일정에 아직 안 보이는 예약')).toBeInTheDocument();
    expect(screen.getByText('4건')).toBeInTheDocument();
    expect(screen.getByText('가장 오래 기다림 D+4')).toHaveClass('bg-graysoft', 'text-charcoal-2');
    expect(screen.getByRole('link', { name: '시설 예약 관리' })).toHaveAttribute('href', '/admin/facility-bookings?tab=review');
  });

  it.each([
    [6, 'bg-graysoft'],
    [7, 'bg-coral/10'],
  ])('D+%i 이면 %s 톤', (days, toneClass) => {
    mockSummary.mockReturnValue(summaryOf({ oldestApprovedWaitingDays: days }));
    render(<AdminSchoolSyncCard />);
    expect(screen.getByText(`가장 오래 기다림 D+${days}`)).toHaveClass(toneClass);
  });

  it('0건이면 "반영 대기 없음"을 본문으로 그리고 링크는 남긴다', () => {
    mockSummary.mockReturnValue(summaryOf({ approvedWaitingCount: 0, oldestApprovedWaitingDays: 0 }));
    render(<AdminSchoolSyncCard />);
    expect(screen.getByText('반영 대기 없음')).toBeInTheDocument();
    expect(screen.queryByText(/가장 오래 기다림/)).toBeNull();
    expect(screen.getByRole('link', { name: '시설 예약 관리' })).toBeInTheDocument();
  });

  it('받지 못하면 오류 안내를 띄우고 링크는 남긴다', () => {
    mockSummary.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<AdminSchoolSyncCard />);
    expect(screen.getByText('불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '시설 예약 관리' })).toBeInTheDocument();
  });

  it('아직 받지 못했으면(멈춘 조회 포함) 로딩이다', () => {
    mockSummary.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    render(<AdminSchoolSyncCard />);
    expect(screen.getByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
  });
});
