import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { BookingDayAvailability } from '@duing/types';
import { FacilityChips } from '@/app/facilities/_components/booking/FacilityChips';
import { BookingCalendar } from '@/app/facilities/_components/booking/BookingCalendar';
import { DaySlotList } from '@/app/facilities/_components/booking/DaySlotList';
import { BookingSuccess } from '@/app/facilities/_components/booking/BookingSuccess';

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
