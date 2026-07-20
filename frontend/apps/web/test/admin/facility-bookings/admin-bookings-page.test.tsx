import { render, screen, fireEvent, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AdminBookingQueueParams,
  AdminFacilityBookingCounts,
  AdminFacilityBookingSummary,
} from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockRefetch = vi.fn();
const mockSummaryRefetch = vi.fn();
const mockQueueQuery = vi.fn();
const mockSummaryQuery = vi.fn();
const mockUsageQuery = vi.fn();
const mockReplace = vi.fn();
let mockTabParam: string | null = null;

vi.mock('@duing/hooks', () => ({
  useAdminFacilityBookingQueueQuery: (...args: unknown[]) => mockQueueQuery(...args),
  useAdminFacilityBookingSummaryQuery: () => mockSummaryQuery(),
  useFacilityUsageQuery: () => mockUsageQuery(),
  // prepare 탭(SubmissionPrepareTab)이 마운트되면 호출되는 훅 — 기본 탭 테스트에선 미사용이나 모킹을 채워둔다.
  useSubmissionCandidatesQuery: () => ({ data: undefined, isLoading: false, isSuccess: false, isError: false, refetch: vi.fn() }),
  useCreateSubmissionBatchMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // batches 탭(SubmissionBatchesTab)이 마운트되면 호출되는 훅 — 기본은 빈 목록 성공으로 채운다.
  useSubmissionBatchesQuery: () => ({
    data: { content: [], page: 0, size: 10, totalElements: 0, totalPages: 0, hasNext: false },
    isLoading: false,
    isSuccess: true,
    isError: false,
    refetch: vi.fn(),
  }),
  useCancelSubmissionBatchMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDownloadSubmissionCsvMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCompleteSubmissionBatchMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// 탭 셸은 URL(?tab=)로 상태를 관리한다 — searchParams 로 상태 주입, 탭 전환은 replace 호출 인자로 단언(ClubExplorePage 계약).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(mockTabParam === null ? '' : `tab=${mockTabParam}`),
}));

// useGuardedRouter 가 ToastProvider 컨텍스트를 물어 스텁한다(faq-page.test 패턴).
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: vi.fn() }),
  useOptionalToast: () => vi.fn(),
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
    mockTabParam = null;
    mockReplace.mockReset();
    mockRefetch.mockReset();
    mockSummaryRefetch.mockReset();
    mockQueueQuery.mockReset();
    mockSummaryQuery.mockReset();
    mockUsageQuery.mockReset();
    mockSummaryQuery.mockReturnValue({ data: makeCounts(), isError: false, refetch: mockSummaryRefetch });
    mockUsageQuery.mockReturnValue({ data: undefined });
    mockQueueQuery.mockReturnValue(makeQueueSuccess([]));
  });

  it('업무 단계 탭 3개가 렌더되고 기본은 예약 관리다', () => {
    render(<AdminFacilityBookingsPage />);

    expect(screen.getByRole('tab', { name: '예약 관리' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '학교 제출 준비' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '제출 목록' })).toBeInTheDocument();
    // 기본 탭 = 기존 관리 화면(요약 카드 렌더) — '오늘 접수'는 승인 대기 카드에만 있어 큐 필터 탭 라벨과 겹치지 않는다.
    expect(screen.getByRole('button', { name: /오늘 접수/ })).toBeInTheDocument();
  });

  it('탭 클릭은 URL 을 replace 로 동기화한다', () => {
    render(<AdminFacilityBookingsPage />);

    fireEvent.click(screen.getByRole('tab', { name: '학교 제출 준비' }));
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('/admin/facility-bookings?tab=prepare'),
      expect.objectContaining({ scroll: false }),
    );
  });

  it('tab=batches 로 진입하면 제출 목록 탭이 마운트되어 빈 목록 안내가 보인다', () => {
    mockTabParam = 'batches';
    render(<AdminFacilityBookingsPage />);

    expect(screen.getByText(/아직 만든 제출 목록이 없어요/)).toBeInTheDocument();
    expect(screen.queryByText('승인 대기')).not.toBeInTheDocument();
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

  it('충돌·의심 탭: CONFLICT 큐와 conflictSuspected APPROVED 행을 병합하고, 의심 아닌 APPROVED 는 제외한다', () => {
    mockQueueQuery.mockImplementation((params: AdminBookingQueueParams) => {
      if (params.status === 'CONFLICT') {
        return makeQueueSuccess([
          makeRow({ bookingId: 71, clubName: '충돌동아리', status: 'CONFLICT', purpose: '충돌 모임' }),
        ]);
      }
      if (params.status === 'APPROVED') {
        return makeQueueSuccess([
          makeRow({
            bookingId: 72,
            clubName: '의심동아리',
            status: 'APPROVED',
            conflictSuspected: true,
            purpose: '의심 모임',
          }),
          makeRow({
            bookingId: 73,
            clubName: '정상동아리',
            status: 'APPROVED',
            conflictSuspected: false,
            purpose: '정상 모임',
          }),
        ]);
      }
      return makeQueueSuccess([]);
    });

    render(<AdminFacilityBookingsPage />);
    fireEvent.click(screen.getByRole('tab', { name: '충돌·의심' }));

    expect(screen.getByText('충돌 모임')).toBeInTheDocument();
    expect(screen.getByText('의심 모임')).toBeInTheDocument();
    expect(screen.queryByText('정상 모임')).not.toBeInTheDocument();
  });

  it('충돌·의심 탭: CONFLICT 가 0건이어도 의심(APPROVED) 쪽 페이지네이션으로 다음 장에 갈 수 있다', () => {
    // 두 쿼리를 같은 page 로 병합하므로 페이지 수는 둘 중 큰 값이어야 한다.
    // CONFLICT 쪽만 보면 여기서 totalPages 가 0 이 되어 의심 예약 2페이지째가 통째로 도달 불가가 된다.
    mockQueueQuery.mockImplementation((params: AdminBookingQueueParams) => {
      if (params.status === 'CONFLICT') return makeQueueSuccess([]);
      if (params.status === 'APPROVED') {
        const approvedPage = makeQueueSuccess([
          makeRow({ bookingId: 81, status: 'APPROVED', conflictSuspected: true, purpose: '의심 모임' }),
        ]);
        return { ...approvedPage, data: { ...approvedPage.data, totalElements: 25, totalPages: 2, hasNext: true } };
      }
      return makeQueueSuccess([]);
    });

    render(<AdminFacilityBookingsPage />);
    fireEvent.click(screen.getByRole('tab', { name: '충돌·의심' }));

    fireEvent.click(screen.getByRole('button', { name: '2' }));

    // 클램프가 page 를 0 으로 되돌리지 않고 두 쿼리 모두 2페이지째를 조회해야 한다.
    expect(mockQueueQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1 }),
      expect.anything(),
    );
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

  it('summary 실패 시 안내와 다시 시도 버튼이 보이고, 클릭하면 summary refetch 를 호출한다', () => {
    mockSummaryQuery.mockReturnValue({ data: undefined, isError: true, refetch: mockSummaryRefetch });
    render(<AdminFacilityBookingsPage />);

    expect(screen.getByText('대시보드 수치를 불러오지 못했어요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(mockSummaryRefetch).toHaveBeenCalledTimes(1);
  });

  it('마지막 페이지의 항목이 사라져 totalPages 가 줄면 현재 page 를 마지막 페이지로 클램프한다', () => {
    const queueWithPages = (totalPages: number) => ({
      data: {
        content: [makeRow()],
        page: 0,
        size: 20,
        totalElements: totalPages * 20,
        totalPages,
        hasNext: false,
      },
      isLoading: false,
      isSuccess: true,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    mockQueueQuery.mockReturnValue(queueWithPages(3));
    const { rerender } = render(<AdminFacilityBookingsPage />);

    // 3페이지 중 마지막 페이지(index 2)로 이동
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(mockQueueQuery).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING', page: 2 }));

    // 액션 후 refetch 결과 totalPages 가 1 로 줄어든 상태를 시뮬레이션
    mockQueueQuery.mockClear();
    mockQueueQuery.mockReturnValue(queueWithPages(1));
    rerender(<AdminFacilityBookingsPage />);

    // page 가 마지막 페이지(0)로 클램프되어 큐 훅이 page:0 으로 재호출된다
    expect(mockQueueQuery).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING', page: 0 }));
  });
});
