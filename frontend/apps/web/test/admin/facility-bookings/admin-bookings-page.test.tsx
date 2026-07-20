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

const mockBatchesListQuery = vi.fn();

// 큐 테이블이 쓰는 formatDateTimeKst 등 순수 유틸은 실제 구현을 유지한다(batches-tab 테스트 동일 패턴).
vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useAdminFacilityBookingQueueQuery: (...args: unknown[]) => mockQueueQuery(...args),
  useAdminFacilityBookingSummaryQuery: () => mockSummaryQuery(),
  useFacilityUsageQuery: () => mockUsageQuery(),
  // prepare 탭(SubmissionPrepareTab)이 마운트되면 호출되는 훅 — 기본 탭 테스트에선 미사용이나 모킹을 채워둔다.
  useSubmissionCandidatesQuery: () => ({ data: undefined, isLoading: false, isSuccess: false, isError: false, refetch: vi.fn() }),
  useCreateSubmissionBatchMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // batches 탭·셸 건수 조회가 호출하는 훅 — 인자를 스파이로 남기고 빈 목록 성공을 돌려준다.
  useSubmissionBatchesQuery: (...args: unknown[]) => {
    mockBatchesListQuery(...args);
    return {
      data: { content: [], page: 0, size: 10, totalElements: 0, totalPages: 0, hasNext: false },
      isLoading: false,
      isSuccess: true,
      isError: false,
      refetch: vi.fn(),
    };
  },
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

// 큐 → 모달 통합 경로(클릭 시 올바른 bookingId·이웃 스냅샷 전달) 검증용 스텁 —
// 모달 내부는 admin-booking-detail-modal.test 가 격리 검증한다(NoticeRichEditorLazy mock 전례).
vi.mock('@/app/admin/facility-bookings/_components/AdminBookingDetailModal', () => ({
  AdminBookingDetailModal: ({
    bookingId,
    neighborIds,
  }: {
    bookingId: number;
    neighborIds?: { previous: number | null; next: number | null };
  }) => (
    <div>
      <span>검토 모달 {bookingId}</span>
      <span>{`이웃 prev:${neighborIds?.previous ?? '-'} next:${neighborIds?.next ?? '-'}`}</span>
    </div>
  ),
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

  it('워크플로 탭 4개가 렌더되고 기본은 예약 검토, 검토 탭에 대기 건수가 붙는다', () => {
    render(<AdminFacilityBookingsPage />);

    expect(screen.getByRole('tab', { name: /예약 검토/ })).toHaveAttribute('aria-selected', 'true');
    // 검토 탭 건수 = summary.pendingCount(7). 경고 점은 aria-hidden 장식이라 이름에 합류하지 않는다.
    expect(screen.getByRole('tab', { name: /예약 검토 7/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /제출 준비/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /제출 대기/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /제출 이력/ })).toBeInTheDocument();
    // 제출 대기 건수는 REVIEWING size-1 조회의 totalElements 를 쓴다(개편 스펙 §1).
    expect(mockBatchesListQuery).toHaveBeenCalledWith({ page: 0, size: 1, status: 'REVIEWING' });
    // 기본 탭 = 기존 관리 화면(요약 카드 렌더) — '오늘 접수'는 승인 대기 카드에만 있어 큐 필터 탭 라벨과 겹치지 않는다.
    expect(screen.getByRole('button', { name: /오늘 접수/ })).toBeInTheDocument();
  });

  it('탭 클릭은 URL 을 replace 로 동기화한다', () => {
    render(<AdminFacilityBookingsPage />);

    fireEvent.click(screen.getByRole('tab', { name: /제출 준비/ }));
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('/admin/facility-bookings?tab=prepare'),
      expect.objectContaining({ scroll: false }),
    );
  });

  it('구 URL(tab=batches)은 제출 대기 탭으로, tab=pending 은 예약 검토 탭으로 흡수된다', () => {
    mockTabParam = 'batches';
    const { unmount } = render(<AdminFacilityBookingsPage />);

    expect(screen.getByRole('tab', { name: /제출 대기/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('진행 중인 제출 목록이 없어요')).toBeInTheDocument();
    expect(screen.queryByText('승인 대기')).not.toBeInTheDocument();
    unmount();

    mockTabParam = 'pending';
    render(<AdminFacilityBookingsPage />);
    expect(screen.getByRole('tab', { name: /예약 검토/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('프로토타입 상속 키(tab=constructor)는 별칭으로 오인되지 않고 기본 탭으로 폴백한다', () => {
    mockTabParam = 'constructor';
    render(<AdminFacilityBookingsPage />);

    expect(screen.getByRole('tab', { name: /예약 검토/ })).toHaveAttribute('aria-selected', 'true');
    // 기본 탭 콘텐츠(검토 화면)가 실제로 렌더된다 — 빈 워크플로 영역 회귀 방지.
    expect(screen.getByRole('button', { name: /오늘 접수/ })).toBeInTheDocument();
  });

  it('summary 에 수집 시각이 있으면 헤더에 크롤 신선도 칩이 보인다', () => {
    // 절대 날짜 하드코딩 금지(타임밤) — 5분 전 시각을 만들어 신선 상태를 검증한다.
    mockSummaryQuery.mockReturnValue({
      data: makeCounts({ crawledAt: new Date(Date.now() - 5 * 60_000).toISOString() }),
      isError: false,
      refetch: mockSummaryRefetch,
    });
    render(<AdminFacilityBookingsPage />);

    expect(screen.getByText(/학교 데이터 마지막 수집 5분 전/)).toBeInTheDocument();
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

    // 큐 필터 칩에도 건수가 병기된다(승인 대기·반영 대기·충돌·의심만 — 확정은 이달 기준이라 미표기).
    expect(screen.getByRole('tab', { name: '승인 대기 7' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '반영 대기 4' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '충돌·의심 5' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '확정' })).toBeInTheDocument();
  });

  it('충돌 카드 클릭 시 해당 탭으로 전환되고 큐 훅이 status:CONFLICT 로 호출된다', () => {
    render(<AdminFacilityBookingsPage />);

    fireEvent.click(screen.getByRole('button', { name: /충돌·의심/ }));

    expect(screen.getByRole('button', { name: /충돌·의심/ })).toHaveAttribute('aria-pressed', 'true');
    expect(mockQueueQuery).toHaveBeenCalledWith(expect.objectContaining({ status: 'CONFLICT' }));
  });

  it('APPROVED 행에 번호·D+N·충돌 의심·부분 반영 배지·검토 버튼이 렌더된다', () => {
    mockQueueQuery.mockReturnValue(
      makeQueueSuccess([
        makeRow({
          bookingId: 55,
          status: 'APPROVED',
          attendeeCount: 120,
          approvedWaitingDays: 8,
          conflictSuspected: true,
          partiallyMatched: true,
        }),
      ]),
    );

    render(<AdminFacilityBookingsPage />);

    expect(screen.getByText('#55')).toBeInTheDocument();
    expect(screen.getByText('120명')).toBeInTheDocument();
    expect(screen.getByText('학교 반영 대기 D+8')).toBeInTheDocument();
    expect(screen.getByText('충돌 의심')).toBeInTheDocument();
    expect(screen.getByText('부분 반영')).toBeInTheDocument();
    expect(screen.getByText('승인됨')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#55 검토' })).toBeInTheDocument();
  });

  it('행 클릭·검토 버튼 클릭 모두 해당 예약의 검토 모달을 연다', () => {
    mockQueueQuery.mockReturnValue(makeQueueSuccess([makeRow({ bookingId: 55 })]));
    const { unmount } = render(<AdminFacilityBookingsPage />);

    // 행 내부 셀 클릭 → tr onClick 버블링으로 모달 오픈
    fireEvent.click(screen.getByText('두잉동아리'));
    expect(screen.getByText('검토 모달 55')).toBeInTheDocument();
    unmount();

    // 검토 버튼 클릭도 동일 bookingId 로 오픈(stopPropagation 회귀 방지)
    mockQueueQuery.mockReturnValue(makeQueueSuccess([makeRow({ bookingId: 56 })]));
    render(<AdminFacilityBookingsPage />);
    fireEvent.click(screen.getByRole('button', { name: '#56 검토' }));
    expect(screen.getByText('검토 모달 56')).toBeInTheDocument();
  });

  it('모달 이웃은 열람 시점 큐 기준 스냅샷이라, 액션 후 행이 빠져도 이전/다음 탐색이 유지된다', () => {
    mockQueueQuery.mockReturnValue(
      makeQueueSuccess([
        makeRow({ bookingId: 55, clubName: '가동아리' }),
        makeRow({ bookingId: 56, clubName: '나동아리' }),
        makeRow({ bookingId: 57, clubName: '다동아리' }),
      ]),
    );
    const { rerender } = render(<AdminFacilityBookingsPage />);

    fireEvent.click(screen.getByText('나동아리'));
    expect(screen.getByText('이웃 prev:55 next:57')).toBeInTheDocument();

    // 승인 성공 → refetch 로 56 이 큐에서 빠진 상황 — 파생 계산이면 이 시점에 탐색이 죽는다.
    mockQueueQuery.mockReturnValue(
      makeQueueSuccess([
        makeRow({ bookingId: 55, clubName: '가동아리' }),
        makeRow({ bookingId: 57, clubName: '다동아리' }),
      ]),
    );
    rerender(<AdminFacilityBookingsPage />);
    expect(screen.getByText('이웃 prev:55 next:57')).toBeInTheDocument();
  });

  it('PENDING 행 서브라인에 신청 시각·경과가 렌더된다', () => {
    // 절대 날짜 하드코딩은 시간이 지나면 단언이 어긋난다(타임밤) — 항상 2일 전 시각을 만들어 사용.
    const twoDaysAgoIso = new Date(Date.now() - 2 * 86_400_000).toISOString();
    mockQueueQuery.mockReturnValue(
      makeQueueSuccess([makeRow({ bookingId: 77, createdAt: twoDaysAgoIso })]),
    );

    render(<AdminFacilityBookingsPage />);

    expect(screen.getByText(/신청 .* · 2일 경과/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('tab', { name: /충돌·의심/ }));

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
    fireEvent.click(screen.getByRole('tab', { name: /충돌·의심/ }));

    fireEvent.click(screen.getByRole('button', { name: '2' }));

    // 클램프가 page 를 0 으로 되돌리지 않고 두 쿼리 모두 2페이지째를 조회해야 한다.
    expect(mockQueueQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1 }),
      expect.anything(),
    );
  });

  it('결과가 없으면 빈 상태 문구, 에러면 안내와 다시 시도 버튼(→refetch)이 보인다', () => {
    const { unmount } = render(<AdminFacilityBookingsPage />);
    expect(screen.getByText('해당 조건의 신청이 없어요')).toBeInTheDocument();
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

    // 페이지네이션 좌측에 현재 범위(1–20 / 60건)가 표기된다(개편 스펙 §2).
    expect(screen.getByText('1–20 / 60건')).toBeInTheDocument();

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
