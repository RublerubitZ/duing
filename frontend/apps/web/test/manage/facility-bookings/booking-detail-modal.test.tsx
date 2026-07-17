import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FacilityBookingDetail } from '@duing/types';

const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {}
  return { MockApiError };
});

const mockDetailQuery = vi.hoisted(() => ({
  current: { data: undefined as FacilityBookingDetail | undefined, isLoading: false, isError: false },
}));
const mockCancelMutate = vi.hoisted(() => vi.fn());
const mockCancelPending = vi.hoisted(() => ({ current: false }));

vi.mock('@duing/api', () => ({ ApiError: MockApiError }));
vi.mock('@duing/hooks', () => ({
  useFacilityBookingDetailQuery: () => mockDetailQuery.current,
  useCancelFacilityBookingMutation: () => ({ mutate: mockCancelMutate, isPending: mockCancelPending.current }),
}));
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

import { BookingDetailModal } from '@/app/manage/clubs/[clubId]/facility-bookings/_components/BookingDetailModal';

function makeDetail(overrides: Partial<FacilityBookingDetail>): FacilityBookingDetail {
  return {
    bookingId: 31,
    facilityId: 1,
    roomName: '커뮤니티룸(1)',
    date: '2026-07-20',
    startTime: '18:00',
    endTime: '20:00',
    status: 'PENDING',
    purpose: '정기 합주',
    contactPhone: null,
    history: [
      { previousStatus: null, newStatus: 'PENDING', reason: null, changedAt: '2026-07-13T19:30:00' },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  mockDetailQuery.current = { data: undefined, isLoading: false, isError: false };
  mockCancelMutate.mockReset();
  mockCancelPending.current = false;
});

describe('BookingDetailModal', () => {
  it('PENDING 상세: 스텝퍼 1단계 활성 + 취소 버튼 + 이력', () => {
    mockDetailQuery.current.data = makeDetail({});
    render(<BookingDetailModal clubId={7} bookingId={31} onClose={vi.fn()} />);
    expect(screen.getByLabelText('예약 진행 단계')).toBeInTheDocument();
    expect(screen.getByText('신청 접수')).toBeInTheDocument();
    expect(screen.getByText('관리자 승인')).toBeInTheDocument();
    expect(screen.getByText('학교 반영 확정')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '신청 취소' })).toBeInTheDocument();
    expect(screen.getByText(/7월 13일 \(월\) 19:30/)).toBeInTheDocument();
  });

  it('취소 버튼 → 확인 다이얼로그 → 확정 시 mutate 호출', () => {
    mockDetailQuery.current.data = makeDetail({});
    render(<BookingDetailModal clubId={7} bookingId={31} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '신청 취소' }));
    expect(screen.getByText('예약 신청을 취소할까요?')).toBeInTheDocument();
    // Radix Dialog 중첩으로 두 dialog 가 동시에 DOM 에 있다 — 확인 다이얼로그가 열리면 배경(상세) dialog 는
    // aria-hidden 처리되므로 hidden:true 로 둘 다 조회한다. 확인 다이얼로그의 파괴 버튼은 두 번째
    // '신청 취소' 버튼(뒤에 포털된다 — 인덱스 접근 + 가드, bill-list 전례. `as` 단언 금지).
    const confirmButtons = screen.getAllByRole('button', { name: '신청 취소', hidden: true });
    expect(confirmButtons).toHaveLength(2);
    const destructiveButton = confirmButtons[1];
    if (!destructiveButton) throw new Error('확인 다이얼로그 버튼을 찾지 못했습니다');
    fireEvent.click(destructiveButton);
    expect(mockCancelMutate).toHaveBeenCalledWith(
      { clubId: 7, bookingId: 31 },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('대표 연락처: 값이 있으면 노출하고, 없으면(null) "—" 로 표기한다(§2.3)', () => {
    mockDetailQuery.current.data = makeDetail({ contactPhone: '010-1234-5678' });
    const { rerender } = render(<BookingDetailModal clubId={7} bookingId={31} onClose={vi.fn()} />);
    expect(screen.getByText('대표 연락처')).toBeInTheDocument();
    expect(screen.getByText('010-1234-5678')).toBeInTheDocument();

    mockDetailQuery.current = { data: makeDetail({ contactPhone: null }), isLoading: false, isError: false };
    rerender(<BookingDetailModal clubId={7} bookingId={31} onClose={vi.fn()} />);
    expect(screen.getByText('대표 연락처')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('APPROVED: 취소 버튼 없이 관리자 문의 안내 + 서브라벨', () => {
    mockDetailQuery.current.data = makeDetail({ status: 'APPROVED' });
    render(<BookingDetailModal clubId={7} bookingId={31} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '신청 취소' })).not.toBeInTheDocument();
    expect(screen.getByText('승인된 신청의 취소는 관리자에게 문의해주세요.')).toBeInTheDocument();
  });

  it('REJECTED: 스텝퍼 대신 거절 사유 안내', () => {
    mockDetailQuery.current.data = makeDetail({ status: 'REJECTED', rejectReason: '중복 신청' });
    render(<BookingDetailModal clubId={7} bookingId={31} onClose={vi.fn()} />);
    expect(screen.queryByLabelText('예약 진행 단계')).not.toBeInTheDocument();
    expect(screen.getByText(/거절됨 — 중복 신청/)).toBeInTheDocument();
  });

  it('취소 진행 중: 파괴 버튼 취소 중… + disabled, 돌아가기도 disabled', () => {
    // pending 은 열기 버튼을 막지 않으므로(모달 '신청 취소' 는 항상 활성) 열기 클릭 →
    // 리렌더 시점에 확인 다이얼로그가 isPending 을 읽어 파괴 버튼이 '취소 중…' + disabled 로 렌더된다.
    mockCancelPending.current = true;
    mockDetailQuery.current.data = makeDetail({});
    render(<BookingDetailModal clubId={7} bookingId={31} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '신청 취소' }));
    // 파괴 버튼 라벨이 '취소 중…' 으로 바뀌어 모달 열기 버튼('신청 취소')과 이름이 겹치지 않는다.
    const destructiveButton = screen.getByRole('button', { name: '취소 중…', hidden: true });
    expect(destructiveButton).toBeDisabled();
    expect(screen.getByRole('button', { name: '돌아가기', hidden: true })).toBeDisabled();
  });
});
