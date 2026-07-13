import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminFacilityBookingDetail } from '@duing/types';

/* ── ApiError 스텁 — status/code/payload 를 실 ApiError 와 동일 순서로 보관 ── */
const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    payload?: unknown;
    code?: string;
    constructor(status: number, message: string, payload?: unknown, code?: string) {
      super(message);
      this.status = status;
      this.payload = payload;
      this.code = code;
      this.name = 'ApiError';
    }
  }
  return { MockApiError };
});

/* ── 훅 모킹 ─────────────────────────────────────────────────── */
const mockDetailQuery = vi.hoisted(() => ({
  current: { data: undefined as AdminFacilityBookingDetail | undefined, isLoading: false, isError: false },
}));
const mockApproveMutate = vi.hoisted(() => vi.fn());
const mockRejectMutate = vi.hoisted(() => vi.fn());
const mockConfirmMutate = vi.hoisted(() => vi.fn());
const mockMarkConflictMutate = vi.hoisted(() => vi.fn());
const mockCancelMutate = vi.hoisted(() => vi.fn());
const mockAddToast = vi.hoisted(() => vi.fn());

vi.mock('@duing/api', () => ({ ApiError: MockApiError }));
vi.mock('@duing/hooks', () => ({
  useAdminFacilityBookingDetailQuery: () => mockDetailQuery.current,
  useApproveFacilityBookingMutation: () => ({ mutate: mockApproveMutate, isPending: false }),
  useRejectFacilityBookingMutation: () => ({ mutate: mockRejectMutate, isPending: false }),
  useConfirmFacilityBookingMutation: () => ({ mutate: mockConfirmMutate, isPending: false }),
  useMarkConflictFacilityBookingMutation: () => ({ mutate: mockMarkConflictMutate, isPending: false }),
  useCancelFacilityBookingAdminMutation: () => ({ mutate: mockCancelMutate, isPending: false }),
}));
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

/* ── 대상 ───────────────────────────────────────────────────── */
import { AdminBookingDetailModal } from '@/app/admin/facility-bookings/_components/AdminBookingDetailModal';

/* ── 테스트 데이터 ───────────────────────────────────────────── */
function makeDetail(overrides: Partial<AdminFacilityBookingDetail> = {}): AdminFacilityBookingDetail {
  return {
    bookingId: 42,
    clubId: 10,
    clubName: '재즈동아리',
    facilityId: 100,
    roomName: '세미나실',
    date: '2026-07-20',
    startTime: '18:00',
    endTime: '20:00',
    status: 'PENDING',
    purpose: '정기 합주',
    crawlBasisAt: '2026-07-13T18:00:00',
    stale: false,
    overlaps: [],
    overlappingPendingCount: 0,
    history: [{ previousStatus: null, newStatus: 'PENDING', reason: null, changedAt: '2026-07-13T19:30:00' }],
    ...overrides,
  };
}

beforeEach(() => {
  mockDetailQuery.current = { data: undefined, isLoading: false, isError: false };
  mockApproveMutate.mockReset();
  mockRejectMutate.mockReset();
  mockConfirmMutate.mockReset();
  mockMarkConflictMutate.mockReset();
  mockCancelMutate.mockReset();
  mockAddToast.mockReset();
});

describe('AdminBookingDetailModal', () => {
  it('PENDING: 승인·거절 버튼만 노출하고 신선도 라벨·슬롯 스트립·이력을 렌더한다', () => {
    mockDetailQuery.current.data = makeDetail({ status: 'PENDING' });
    render(<AdminBookingDetailModal bookingId={42} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: '승인' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '거절' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수동 확정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '충돌 전환' })).not.toBeInTheDocument();

    expect(screen.getByText(/마지막 수집/)).toBeInTheDocument();
    expect(screen.getByLabelText('검증 컨텍스트 타임라인')).toBeInTheDocument();
    expect(screen.getByText('이력')).toBeInTheDocument();
    expect(screen.getByText(/7월 13일 \(월\) 19:30/)).toBeInTheDocument();
  });

  it('APPROVED: 수동 확정·충돌 전환·취소 버튼을 노출한다', () => {
    mockDetailQuery.current.data = makeDetail({ status: 'APPROVED' });
    render(<AdminBookingDetailModal bookingId={42} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: '수동 확정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '충돌 전환' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '승인' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '거절' })).not.toBeInTheDocument();
  });

  it('CONFLICT: 재승인·취소 버튼을 노출한다', () => {
    mockDetailQuery.current.data = makeDetail({ status: 'CONFLICT' });
    render(<AdminBookingDetailModal bookingId={42} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: '재승인' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '승인' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수동 확정' })).not.toBeInTheDocument();
  });

  it('거절 → 사유 다이얼로그: 빈 사유는 확정 버튼 disabled, 사유 입력 후 mutate 인자를 전달한다', () => {
    mockDetailQuery.current.data = makeDetail({ status: 'PENDING' });
    render(<AdminBookingDetailModal bookingId={42} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '거절' }));

    const reasonInput = screen.getByLabelText('거절 사유');
    // 액션 다이얼로그가 열리면 모달(뒤 배경) 은 aria-hidden 처리되므로 hidden:true 로 둘 다 조회한다.
    // '거절' 버튼은 모달 트리거(index 0, hidden) + 액션 다이얼로그 확정(index 1) 두 개다.
    const rejectButtons = screen.getAllByRole('button', { name: '거절', hidden: true });
    expect(rejectButtons).toHaveLength(2);
    const confirmButton = rejectButtons[1];
    if (!confirmButton) throw new Error('확정 버튼을 찾지 못했습니다');
    expect(confirmButton).toBeDisabled();

    fireEvent.change(reasonInput, { target: { value: '중복 신청' } });
    expect(confirmButton).not.toBeDisabled();

    fireEvent.click(confirmButton);
    expect(mockRejectMutate).toHaveBeenCalledWith(
      { bookingId: 42, reason: '중복 신청' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('승인 실패(학교 충돌 409) 시 충돌 패널에 학교 예약 정보를 노출한다', () => {
    mockDetailQuery.current.data = makeDetail({ status: 'PENDING' });
    mockApproveMutate.mockImplementation((_vars: unknown, callbacks?: { onError?: (error: unknown) => void }) => {
      callbacks?.onError?.(
        new MockApiError(
          409,
          '학교 예약과 충돌합니다.',
          {
            conflicts: [{ source: 'SCHOOL', organization: '문화팀', start: '18:00', end: '19:00' }],
            crawlBasisAt: '2026-07-13T08:00:00+09:00',
          },
          'FACILITY_BOOKING_SCHOOL_CONFLICT',
        ),
      );
    });
    render(<AdminBookingDetailModal bookingId={42} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    // 승인은 사유 없이 확인만 — 액션 다이얼로그 확정 버튼(index 1)을 누른다.
    const approveButtons = screen.getAllByRole('button', { name: '승인', hidden: true });
    const confirmButton = approveButtons[1];
    if (!confirmButton) throw new Error('확정 버튼을 찾지 못했습니다');
    fireEvent.click(confirmButton);

    expect(screen.getByText('학교 예약과 시간이 충돌하여 승인할 수 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('문화팀 · 18:00~19:00')).toBeInTheDocument();
    expect(mockAddToast).not.toHaveBeenCalled();
  });
});
