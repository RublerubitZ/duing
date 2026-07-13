import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FacilityBookingSummary } from '@duing/types';

const mockBookingsQuery = vi.hoisted(() => ({
  current: {
    data: undefined as FacilityBookingSummary[] | undefined,
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  },
}));

vi.mock('@duing/hooks', () => ({
  useClubFacilityBookingsQuery: () => mockBookingsQuery.current,
  useFacilityBookingDetailQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useCancelFacilityBookingMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FacilityBookingsView } from '@/app/manage/clubs/[clubId]/facility-bookings/_components/FacilityBookingsView';

function makeBooking(overrides: Partial<FacilityBookingSummary>): FacilityBookingSummary {
  return {
    bookingId: 1,
    facilityId: 1,
    roomName: '커뮤니티룸(1)',
    date: '2026-07-20',
    startTime: '18:00',
    endTime: '20:00',
    status: 'PENDING',
    purpose: '정기 합주',
    createdAt: '2026-07-13T19:30:00',
    ...overrides,
  };
}

beforeEach(() => {
  mockBookingsQuery.current = {
    data: undefined,
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  };
});

describe('FacilityBookingsView', () => {
  it('행에 시설·일시·상태 배지·목적을 표시한다', () => {
    mockBookingsQuery.current.data = [makeBooking({})];
    render(<FacilityBookingsView clubId={7} />);
    expect(screen.getByText(/커뮤니티룸\(1\) · 7월 20일 \(월\) 18:00~20:00/)).toBeInTheDocument();
    expect(screen.getByText('승인 대기')).toBeInTheDocument();
    expect(screen.getByText('정기 합주')).toBeInTheDocument();
  });

  it('탭이 상태 그룹으로 필터한다 — 진행 중 탭엔 CONFLICT 포함, 종료 탭엔 CANCELLED', () => {
    mockBookingsQuery.current.data = [
      makeBooking({ bookingId: 1, status: 'CONFLICT', purpose: '충돌건' }),
      makeBooking({ bookingId: 2, status: 'CANCELLED', purpose: '취소건' }),
      makeBooking({ bookingId: 3, status: 'CONFIRMED', purpose: '확정건' }),
    ];
    render(<FacilityBookingsView clubId={7} />);
    fireEvent.click(screen.getByRole('tab', { name: '진행 중' }));
    expect(screen.getByText('충돌건')).toBeInTheDocument();
    expect(screen.queryByText('취소건')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '종료' }));
    expect(screen.getByText('취소건')).toBeInTheDocument();
    expect(screen.queryByText('확정건')).not.toBeInTheDocument();
  });

  it('빈 상태·에러 상태를 표시한다', () => {
    mockBookingsQuery.current.data = [];
    const { unmount } = render(<FacilityBookingsView clubId={7} />);
    expect(screen.getByText('아직 신청한 예약이 없어요.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '예약하러 가기' })).toHaveAttribute('href', '/facilities');
    unmount();

    mockBookingsQuery.current = {
      data: undefined, isLoading: false, isError: true, isSuccess: false, refetch: vi.fn(),
    };
    render(<FacilityBookingsView clubId={7} />);
    expect(screen.getByRole('alert')).toHaveTextContent('예약 내역을 불러오지 못했어요');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(mockBookingsQuery.current.refetch).toHaveBeenCalled();
  });
});
