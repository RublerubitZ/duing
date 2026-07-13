import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { BookingDayAvailability, FacilityItem } from '@duing/types';
import { FacilityChips } from '@/app/facilities/_components/booking/FacilityChips';
import { BookingCalendar } from '@/app/facilities/_components/booking/BookingCalendar';
import { DaySlotList } from '@/app/facilities/_components/booking/DaySlotList';
import { BookingSuccess } from '@/app/facilities/_components/booking/BookingSuccess';
import { FacilityHomeCard } from '@/app/facilities/_components/booking/FacilityHomeCard';
import { seoulDateIso } from '@/app/facilities/_lib/facilityTimeline';

// FacilityHomeCard 는 내부에서 new Date() 로 오늘을 계산하므로 시스템 시각을 고정한다.
afterEach(() => vi.useRealTimers());

function makeFacility(overrides?: Partial<FacilityItem>): FacilityItem {
  return {
    id: 1,
    roomName: '커뮤니티룸(1)',
    location: '학생회관 2층',
    isUsingNow: false,
    currentReservation: null,
    nextReservation: null,
    reservations: [],
    ...overrides,
  };
}

function makeDay(overrides?: Partial<BookingDayAvailability>): BookingDayAvailability {
  return {
    date: '2026-07-20',
    dayStatus: 'AVAILABLE',
    availableSlotCount: 11,
    operatingNotes: [{ organization: '고정관념', start: '09:00', end: '20:00' }],
    slots: Array.from({ length: 13 }, (_, index) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const start = `${pad(9 + index)}:00`;
      const end = `${pad(10 + index)}:00`;
      if (index === 8) return { start, end, status: 'BLOCKED' as const, blockedBy: 'SCHOOL' as const, organization: '비호응원단' };
      if (index === 9) return { start, end, status: 'BLOCKED' as const, blockedBy: 'INTERNAL' as const };
      if (index === 11) return { start, end, status: 'PENDING_HOLD' as const };
      return { start, end, status: 'AVAILABLE' as const };
    }),
    ...overrides,
  };
}

it('칩은 선택 상태와 사용중 도트를 표시하고 탭 시 onSelect 를 부른다', () => {
  const onSelect = vi.fn();
  render(
    <FacilityChips
      facilities={[
        { id: 1, roomName: '커뮤니티룸(1)', isUsingNow: true },
        { id: 2, roomName: '공동연습실(1)', isUsingNow: false },
      ]}
      selectedId={1}
      onSelect={onSelect}
    />,
  );
  fireEvent.click(screen.getByRole('tab', { name: '공동연습실(1)' }));
  expect(onSelect).toHaveBeenCalledWith(2);
});

it('캘린더 셀은 가능 칸 수와 마감을 표시하고 범위 밖은 비활성이다', () => {
  const day = makeDay();
  const fullDay = makeDay({ date: '2026-07-21', dayStatus: 'FULL', availableSlotCount: 0 });
  render(
    <BookingCalendar
      yearMonth="2026-07"
      daysByIso={new Map([[day.date, day], [fullDay.date, fullDay]])}
      bookableFrom="2026-07-13"
      bookableUntil="2026-08-31"
      todayIso="2026-07-13"
      selectedDate={null}
      onSelectDate={vi.fn()}
      onPrevMonth={vi.fn()}
      onNextMonth={vi.fn()}
      canPrev={false}
      canNext
    />,
  );
  expect(screen.getByRole('button', { name: '20일' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '21일 마감' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '12일' })).toBeDisabled(); // bookableFrom 이전
});

it('슬롯 리스트는 SCHOOL 단체명·INTERNAL "예약됨"·승인 대기중을 구분 표시한다', () => {
  render(<DaySlotList day={makeDay()} selection={null} onToggleSlot={vi.fn()} />);
  expect(screen.getByText('비호응원단')).toBeInTheDocument();
  expect(screen.getByText('예약됨')).toBeInTheDocument();
  expect(screen.getByText('승인 대기중')).toBeInTheDocument();
  expect(screen.getByText(/운영: 고정관념 09:00~20:00/)).toBeInTheDocument();
});

it('차단 슬롯 버튼은 비활성이다', () => {
  render(<DaySlotList day={makeDay()} selection={null} onToggleSlot={vi.fn()} />);
  expect(screen.getByRole('button', { name: /17:00~18:00/ })).toBeDisabled();
});

it('예약 성공 화면은 manageHref 전달 시 "내 예약에서 확인" 링크를 관리 목록으로 노출한다', () => {
  render(
    <BookingSuccess
      facilityName="커뮤니티룸(1)"
      date="2026-07-20"
      range={{ start: '18:00', end: '19:00' }}
      overlappingPendingCount={0}
      manageHref="/manage/clubs/7/facility-bookings"
      onClose={vi.fn()}
    />,
  );
  const manageLink = screen.getByRole('link', { name: '내 예약에서 확인' });
  expect(manageLink).toHaveAttribute('href', '/manage/clubs/7/facility-bookings');
});

it('예약 성공 화면은 manageHref 미전달 시 확인 링크를 렌더하지 않는다', () => {
  render(
    <BookingSuccess
      facilityName="커뮤니티룸(1)"
      date="2026-07-20"
      range={{ start: '18:00', end: '19:00' }}
      overlappingPendingCount={0}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByRole('link', { name: '내 예약에서 확인' })).not.toBeInTheDocument();
});

it('홈 카드는 아이콘·위치·예약 가능 라벨을 렌더하고 영업 종료 후엔 "오늘 마감"을 표시하며 탭 시 onSelect 를 부른다', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 20, 23, 30)); // 로컬 23:30 → 영업(09~22) 종료 후
  const onSelect = vi.fn();
  render(<FacilityHomeCard facility={makeFacility()} windowLabel="7.14 ~ 8.31" onSelect={onSelect} />);

  expect(screen.getByText('🛋')).toBeInTheDocument(); // 커뮤니티룸 아이콘
  expect(screen.getByText('학생회관 2층')).toBeInTheDocument();
  expect(screen.getByText('7.14 ~ 8.31')).toBeInTheDocument();
  expect(screen.getByText('오늘 마감')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button'));
  expect(onSelect).toHaveBeenCalledWith(1);
});

it('홈 카드는 오늘 예약만 반영해 남은 칸 수를 계산한다(다른 날 예약은 무시)', () => {
  const now = new Date(2026, 6, 20, 9, 0); // 로컬 09:00 → 09~22 전 구간이 후보
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const todayIso = seoulDateIso(now);
  const otherDayIso = seoulDateIso(new Date(2026, 6, 21, 9, 0));
  render(
    <FacilityHomeCard
      facility={makeFacility({
        id: 2,
        roomName: '공동연습실(1)',
        location: null,
        isUsingNow: true,
        reservations: [
          { date: todayIso, start: '09:00', end: '12:00', organization: '고정관념', status: 'FINISHED' },
          { date: otherDayIso, start: '09:00', end: '22:00', organization: '비호응원단', status: 'UPCOMING' },
        ],
      })}
      windowLabel={null}
      onSelect={vi.fn()}
    />,
  );

  // 오늘 09~12(3칸)만 차감 → 13 - 3 = 10칸. 다른 날 종일 예약은 필터로 무시된다.
  expect(screen.getByText('10칸')).toBeInTheDocument();
  expect(screen.getByText('지금 사용중')).toBeInTheDocument();
});
