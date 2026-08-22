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
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

import { FacilityBookingsView } from '@/app/manage/clubs/[clubId]/facility-bookings/_components/FacilityBookingsView';

// KST(Asia/Seoul) 오늘 기준 상대 날짜 — 뷰의 seoulTodayIso 와 동일 계산으로, 절대날짜 하드코딩을 피한다.
const KST_TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
function shiftIso(baseIso: string, deltaDays: number): string {
  const [year, month, day] = baseIso.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + deltaDays))
    .toISOString()
    .slice(0, 10);
}
const FUTURE = shiftIso(KST_TODAY, 1);
const PAST = shiftIso(KST_TODAY, -1);

function makeBooking(overrides: Partial<FacilityBookingSummary>): FacilityBookingSummary {
  return {
    bookingId: 1,
    facilityId: 1,
    roomName: '커뮤니티룸(1)',
    date: FUTURE,
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
  it('카드에 아이콘·시설·일시·상태 배지·목적·상태 노트를 표시한다', () => {
    mockBookingsQuery.current.data = [makeBooking({})];
    render(<FacilityBookingsView clubId={7} />);
    expect(screen.getByText('🛋')).toBeInTheDocument(); // 시설 아이콘(커뮤니티룸)
    expect(screen.getByText('커뮤니티룸(1)')).toBeInTheDocument();
    expect(screen.getByText(/18:00~20:00/)).toBeInTheDocument();
    expect(screen.getByText('승인 대기')).toBeInTheDocument(); // 상태 배지
    expect(screen.getByText(/정기 합주/)).toBeInTheDocument(); // 목적
    expect(screen.getByText(/관리자 검토 중/)).toBeInTheDocument(); // PENDING 상태 노트
  });

  it('APPROVED·CONFIRMED 카드에 상태 노트를 표시한다', () => {
    mockBookingsQuery.current.data = [
      makeBooking({ bookingId: 1, status: 'APPROVED', purpose: '승인건' }),
      makeBooking({ bookingId: 2, status: 'CONFIRMED', date: FUTURE, purpose: '확정건' }),
    ];
    render(<FacilityBookingsView clubId={7} />);
    expect(screen.getByText(/승인됨 · 학교 반영 대기/)).toBeInTheDocument(); // APPROVED 상태 노트
    expect(screen.getByText(/예약 확정/)).toBeInTheDocument(); // CONFIRMED 상태 노트
  });

  it('2탭이 진행중/지난 예약으로 분류한다 — 진행중=PENDING·CONFLICT·미래 CONFIRMED, 지난=과거 CONFIRMED·CANCELLED', () => {
    mockBookingsQuery.current.data = [
      makeBooking({ bookingId: 1, status: 'CONFLICT', purpose: '충돌건' }),
      makeBooking({ bookingId: 2, status: 'CONFIRMED', date: FUTURE, purpose: '미래확정' }),
      makeBooking({ bookingId: 3, status: 'CONFIRMED', date: PAST, purpose: '과거확정' }),
      makeBooking({ bookingId: 4, status: 'CANCELLED', date: PAST, purpose: '취소건' }),
    ];
    render(<FacilityBookingsView clubId={7} />);

    // 기본 진행중 탭
    expect(screen.getByText(/충돌건/)).toBeInTheDocument();
    expect(screen.getByText(/미래확정/)).toBeInTheDocument();
    expect(screen.queryByText(/과거확정/)).not.toBeInTheDocument();
    expect(screen.queryByText(/취소건/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /지난 예약/ }));
    expect(screen.getByText(/과거확정/)).toBeInTheDocument();
    expect(screen.getByText(/취소건/)).toBeInTheDocument();
    expect(screen.queryByText(/미래확정/)).not.toBeInTheDocument();
  });

  it('탭에 진행중/지난 예약 카운트 뱃지를 표시한다', () => {
    mockBookingsQuery.current.data = [
      makeBooking({ bookingId: 1, status: 'PENDING' }),
      makeBooking({ bookingId: 2, status: 'CONFLICT' }),
      makeBooking({ bookingId: 3, status: 'CANCELLED', date: PAST }),
    ];
    render(<FacilityBookingsView clubId={7} />);
    expect(screen.getByRole('tab', { name: /진행중/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /지난 예약/ })).toHaveTextContent('1');
  });

  it('CONFLICT 카드에 충돌 경고와 시설로 향하는 다시 신청 링크를 표시한다', () => {
    mockBookingsQuery.current.data = [makeBooking({ status: 'CONFLICT', facilityId: 42 })];
    render(<FacilityBookingsView clubId={7} />);
    expect(screen.getByText(/승인 후 학교 예약과 겹쳐/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '다시 신청' })).toHaveAttribute(
      'href',
      '/facilities?facilityId=42',
    );
  });

  it('진행중 항목이 없으면 탭별 빈 문구를 보여주고 예약 홈 CTA 는 감춘다', () => {
    mockBookingsQuery.current.data = [makeBooking({ status: 'CANCELLED', date: PAST })];
    render(<FacilityBookingsView clubId={7} />);
    expect(screen.getByText('진행중인 예약 신청이 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '예약하러 가기' })).not.toBeInTheDocument();
  });

  it('예약이 전혀 없으면 안내 문구와 예약 홈 CTA 를, 에러면 재시도를 표시한다', () => {
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
