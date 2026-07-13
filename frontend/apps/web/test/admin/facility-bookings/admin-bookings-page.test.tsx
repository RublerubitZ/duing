import { render, screen, fireEvent, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminFacilityBookingCounts, AdminFacilityBookingSummary } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockRefetch = vi.fn();
const mockQueueQuery = vi.fn();
const mockSummaryQuery = vi.fn();
const mockUsageQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useAdminFacilityBookingQueueQuery: (...args: unknown[]) => mockQueueQuery(...args),
  useAdminFacilityBookingSummaryQuery: () => mockSummaryQuery(),
  useFacilityUsageQuery: () => mockUsageQuery(),
}));

/* ── 대상 ───────────────────────────────────────────────────── */
import { AdminFacilityBookingsPage } from '../../../app/admin/facility-bookings/_pages/AdminFacilityBookingsPage';

/* ── 테스트 데이터 ───────────────────────────────────────────── */
function makeCounts(overrides: Partial<AdminFacilityBookingCounts> = {}): AdminFacilityBookingCounts {
  return {
    pendingCount: 7,
    todaySubmittedCount: 1,
    oldestPendingWaitingDays: 2,
    approvedWaitingCount: 4,
    oldestApprovedWaitingDays: 3,
    conflictCount: 3,
    conflictSuspectedCount: 2,
    confirmedThisMonthCount: 9,
    ...overrides,
  };
}

function makeRow(overrides: Partial<AdminFacilityBookingSummary> = {}): AdminFacilityBookingSummary {
  return {
    bookingId: 1,
    clubId: 10,
    clubName: '두잉동아리',
    facilityId: 100,
    roomName: '세미나실',
    date: '2026-07-20',
    startTime: '10:00',
    endTime: '12:00',
    status: 'PENDING',
    purpose: '정기 모임',
    createdAt: '2026-07-13T09:00:00',
    conflictSuspected: false,
    partiallyMatched: false,
    ...overrides,
  };
}

function makeQueueSuccess(rows: AdminFacilityBookingSummary[]) {
  return {
    data: {
      content: rows,
      page: 0,
      size: 20,
      totalElements: rows.length,
      totalPages: Math.ceil(rows.length / 20),
      hasNext: false,
    },
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
    refetch: mockRefetch,
  };
}

const queueError = {
  data: undefined,
  isLoading: false,
  isSuccess: false,
  isError: true,
  error: new Error('네트워크 오류'),
  refetch: mockRefetch,
};

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('AdminFacilityBookingsPage', () => {
  beforeEach(() => {
    mockRefetch.mockReset();
    mockQueueQuery.mockReset();
    mockSummaryQuery.mockReset();
    mockUsageQuery.mockReset();
    mockSummaryQuery.mockReturnValue({ data: makeCounts() });
    mockUsageQuery.mockReturnValue({ data: undefined });
    mockQueueQuery.mockReturnValue(makeQueueSuccess([]));
  });

  it('요약 카드 4장이 렌더되고 충돌 카드는 충돌+의심 합산(5)을 보여준다', () => {
    render(<AdminFacilityBookingsPage />);

    const cards = screen.getAllByRole('button').filter((button) => button.hasAttribute('aria-pressed'));
    expect(cards).toHaveLength(4);

    const conflictCard = screen.getByRole('button', { name: /충돌·의심/ });
    expect(within(conflictCard).getByText('5')).toBeInTheDocument();
    expect(within(conflictCard).getByText('충돌 3 · 의심 2')).toBeInTheDocument();

    const pendingCard = screen.getByRole('button', { name: /오늘 접수/ });
    expect(within(pendingCard).getByText('7')).toBeInTheDocument();
  });

  it('충돌 카드 클릭 시 해당 탭으로 전환되고 큐 훅이 status:CONFLICT 로 호출된다', () => {
    render(<AdminFacilityBookingsPage />);

    fireEvent.click(screen.getByRole('button', { name: /충돌·의심/ }));

    expect(screen.getByRole('button', { name: /충돌·의심/ })).toHaveAttribute('aria-pressed', 'true');
    expect(mockQueueQuery).toHaveBeenCalledWith(expect.objectContaining({ status: 'CONFLICT' }));
  });

  it('APPROVED 행에 D+N·충돌 의심·부분 반영 배지가 렌더된다', () => {
    mockQueueQuery.mockReturnValue(
      makeQueueSuccess([
        makeRow({
          bookingId: 55,
          status: 'APPROVED',
          approvedWaitingDays: 8,
          conflictSuspected: true,
          partiallyMatched: true,
        }),
      ]),
    );

    render(<AdminFacilityBookingsPage />);

    expect(screen.getByText('학교 반영 대기 D+8')).toBeInTheDocument();
    expect(screen.getByText('충돌 의심')).toBeInTheDocument();
    expect(screen.getByText('부분 반영')).toBeInTheDocument();
    expect(screen.getByText('승인됨')).toBeInTheDocument();
  });

  it('결과가 없으면 빈 상태 문구, 에러면 안내와 다시 시도 버튼(→refetch)이 보인다', () => {
    const { unmount } = render(<AdminFacilityBookingsPage />);
    expect(screen.getByText('해당 조건의 신청이 없어요.')).toBeInTheDocument();
    unmount();

    mockQueueQuery.mockReturnValue(queueError);
    render(<AdminFacilityBookingsPage />);

    expect(screen.getByText('큐를 불러오지 못했어요. 잠시 후 다시 시도해주세요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(mockRefetch).toHaveBeenCalled();
  });
});
