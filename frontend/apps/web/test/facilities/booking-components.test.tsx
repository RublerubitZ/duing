import { render, screen, fireEvent, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { BookingAvailabilitySlot, BookingDayAvailability, FacilityItem } from '@duing/types';
import { FacilityContextBar } from '@/app/facilities/_components/booking/FacilityContextBar';
import { BookingCalendar } from '@/app/facilities/_components/booking/BookingCalendar';
import { BookingViewHeader } from '@/app/facilities/_components/booking/BookingViewHeader';
import { WeekTimetable } from '@/app/facilities/_components/booking/WeekTimetable';
import { WeekBlockSheet } from '@/app/facilities/_components/booking/WeekBlockSheet';
import { MobileDaySheet } from '@/app/facilities/_components/booking/MobileDaySheet';
import { DaySlotList } from '@/app/facilities/_components/booking/DaySlotList';
import { DayBookingOverview } from '@/app/facilities/_components/booking/DayBookingOverview';
import { BookingPanel } from '@/app/facilities/_components/booking/BookingPanel';
import { BookingSuccess } from '@/app/facilities/_components/booking/BookingSuccess';
import { PanelSummaryCard } from '@/app/facilities/_components/booking/PanelSummaryCard';
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

it('콘텍스트 바는 선택 시설 카드·다른 시설 퀵 칩·전체 보기를 렌더하고 콜백을 부른다', () => {
  const onSelect = vi.fn();
  const onGoHome = vi.fn();
  render(
    <FacilityContextBar
      facilities={[
        { id: 1, roomName: '커뮤니티룸(1)', location: '학생회관 2층' },
        { id: 2, roomName: '공동연습실(1)', location: null },
      ]}
      selectedId={1}
      onSelect={onSelect}
      onGoHome={onGoHome}
    />,
  );
  // 선택 시설 카드(위치 노출) — 클릭 시 홈 복귀
  expect(screen.getByText('학생회관 2층')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '커뮤니티룸(1) — 다른 시설 보기' }));
  expect(onGoHome).toHaveBeenCalledTimes(1);
  // 다른 시설 퀵 칩 — 클릭 시 onSelect
  fireEvent.click(screen.getByRole('button', { name: '공동연습실(1)' }));
  expect(onSelect).toHaveBeenCalledWith(2);
  // 전체 보기 — 클릭 시 홈 복귀
  fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));
  expect(onGoHome).toHaveBeenCalledTimes(2);
});

it('캘린더 셀은 레벨 라벨(여유/마감)·창 배지를 표시하고 창 이전 과거는 비활성이다', () => {
  const day = makeDay(); // availableSlotCount 11 → 여유
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
      onOutOfWindowSelect={vi.fn()}
      windowLabel="7.13 ~ 8.31"
    />,
  );
  // 셀 접근성 이름은 '레벨 + 남은 칸수'를 포함한다(카드형 셀). FULL 셀도 창내라 클릭 가능(현황 확인).
  expect(screen.getByRole('button', { name: '20일 여유, 남은 11칸' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '21일 마감, 남은 0칸' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '12일' })).toBeDisabled(); // bookableFrom 이전
  expect(screen.getByText('예약 가능 기간 7.13 ~ 8.31')).toBeInTheDocument();

  // 월요일 시작 — 요일 헤더 첫 칸이 '월', 마지막이 '일'.
  const weekdayHeaders = screen.getAllByText(/^[월화수목금토일]$/);
  expect(weekdayHeaders).toHaveLength(7);
  const [firstWeekday] = weekdayHeaders;
  expect(firstWeekday).toHaveTextContent('월');
});

it('캘린더는 ranges 전달 시 구간 칩 2개와 다음 구간 시작일 셀 오픈 마커를 렌더한다', () => {
  const currentDay = makeDay({ date: '2026-07-13', availableSlotCount: 11 });
  const openDay = makeDay({ date: '2026-07-21', availableSlotCount: 13 });
  render(
    <BookingCalendar
      yearMonth="2026-07"
      daysByIso={new Map([[currentDay.date, currentDay], [openDay.date, openDay]])}
      bookableFrom="2026-07-13"
      bookableUntil="2026-07-31"
      todayIso="2026-07-13"
      selectedDate={null}
      onSelectDate={vi.fn()}
      onOutOfWindowSelect={vi.fn()}
      windowLabel="7.13 ~ 7.31"
      ranges={[
        { startDate: '2026-07-13', endDate: '2026-07-20', label: '현재 예약 가능' },
        { startDate: '2026-07-21', endDate: '2026-07-31', label: '다음 예약 가능' },
      ]}
    />,
  );
  // 구간 칩 2개(라벨 + M.d ~ M.d). 단일 배지는 폴백이므로 렌더되지 않는다.
  expect(screen.getByText('현재 예약 가능 7.13 ~ 7.20')).toBeInTheDocument();
  expect(screen.getByText('다음 예약 가능 7.21 ~ 7.31')).toBeInTheDocument();
  expect(screen.queryByText('예약 가능 기간 7.13 ~ 7.31')).not.toBeInTheDocument();
  // 다음 구간 시작일(21일) 셀 = 오픈 마커(aria '예약 오픈일' + 시각 텍스트 '오픈').
  const openCell = screen.getByRole('button', { name: '21일 여유, 남은 13칸 예약 오픈일' });
  expect(openCell).toHaveTextContent('오픈');
});

it('다음 구간이 익월이면(두 달 스팬 창) 표시 중인 달에는 오픈 마커가 렌더되지 않는다', () => {
  const currentDay = makeDay({ date: '2026-07-20', availableSlotCount: 11 });
  render(
    <BookingCalendar
      yearMonth="2026-07"
      daysByIso={new Map([[currentDay.date, currentDay]])}
      bookableFrom="2026-07-16"
      bookableUntil="2026-08-15"
      todayIso="2026-07-16"
      selectedDate={null}
      onSelectDate={vi.fn()}
      onOutOfWindowSelect={vi.fn()}
      windowLabel="7.16 ~ 8.15"
      ranges={[
        { startDate: '2026-07-16', endDate: '2026-07-31', label: '현재 예약 가능' },
        { startDate: '2026-08-01', endDate: '2026-08-15', label: '다음 예약 가능' },
      ]}
    />,
  );
  // 칩은 익월 구간까지 표기하지만, 오픈 마커(8/1)는 7월 그리드에 없다.
  expect(screen.getByText('다음 예약 가능 8.1 ~ 8.15')).toBeInTheDocument();
  expect(screen.queryByText('오픈')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /예약 오픈일/ })).not.toBeInTheDocument();
});

it('창 밖 미래 셀은 aria-disabled 이고 클릭 시 onSelectDate 대신 onOutOfWindowSelect 를 부른다', () => {
  const onSelectDate = vi.fn();
  const onOutOfWindowSelect = vi.fn();
  const outsideDay = makeDay({ date: '2026-07-25', availableSlotCount: 11 });
  render(
    <BookingCalendar
      yearMonth="2026-07"
      daysByIso={new Map([[outsideDay.date, outsideDay]])}
      bookableFrom="2026-07-13"
      bookableUntil="2026-07-20" // 25일은 창 밖(미래)
      todayIso="2026-07-13"
      selectedDate={null}
      onSelectDate={onSelectDate}
      onOutOfWindowSelect={onOutOfWindowSelect}
      windowLabel="7.13 ~ 7.20"
    />,
  );
  const outsideCell = screen.getByRole('button', { name: '25일 예약 기간 아님' });
  expect(outsideCell).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(outsideCell);
  expect(onOutOfWindowSelect).toHaveBeenCalledWith('2026-07-25');
  expect(onSelectDate).not.toHaveBeenCalled();
});

it('슬롯 리스트는 흰 바탕 행으로 SCHOOL 단체명·INTERNAL "예약됨" 폴백·승인 대기(coral)를 구분 표시한다', () => {
  render(<DaySlotList day={makeDay()} selection={null} onToggleSlot={vi.fn()} />);
  // AVAILABLE 행: "예약 가능" 라벨 + 흰 바탕(§4⁗.2 복원 — 상태색 배경 부재)
  const availableRow = screen.getByRole('button', { name: /09:00~10:00.*예약 가능/ });
  expect(availableRow).toHaveClass('bg-paper');
  expect(availableRow).not.toHaveClass('bg-sage-mist');
  // BLOCKED: SCHOOL 단체명 / organization 없는 INTERNAL 은 "예약됨" 폴백. 선택 불가 행은 muted(bg-graysoft/60)
  expect(screen.getByText('비호응원단')).toBeInTheDocument();
  expect(screen.getByText('예약됨')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /17:00~18:00.*비호응원단/ })).toHaveClass('bg-graysoft/60');
  // PENDING_HOLD 라벨은 "승인 대기"(coral 텍스트 강조), 구 "승인 대기중"·"신청 가능" 라벨은 사라진다
  const pendingLabel = screen.getByText('승인 대기');
  expect(pendingLabel).toBeInTheDocument();
  expect(pendingLabel).toHaveClass('text-coral');
  expect(screen.queryByText('승인 대기중')).not.toBeInTheDocument();
  expect(screen.queryByText('신청 가능')).not.toBeInTheDocument();
  expect(screen.getByText(/고정관념 09:00~20:00/)).toBeInTheDocument();
});

it('슬롯 리스트는 organization 이 실린 INTERNAL 차단 슬롯을 소스 무관 동아리명으로 표기한다', () => {
  const namedInternalDay = makeDay({
    slots: makeDay().slots.map((slot) =>
      slot.start === '18:00' ? { ...slot, organization: '두잉밴드' } : slot,
    ),
  });
  render(<DaySlotList day={namedInternalDay} selection={null} onToggleSlot={vi.fn()} />);
  // 18:00 은 blockedBy=INTERNAL 이지만 organization 이 오면 동아리명 노출(정책 반전), "예약됨" 폴백 아님
  expect(screen.getByText('두잉밴드')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /18:00~19:00.*두잉밴드/ })).toHaveClass('bg-graysoft/60');
});

it('승인 대기 슬롯은 여전히 클릭 가능하고, 선택 행은 ink 배경·✓ 로 표기된다', () => {
  const onToggleSlot = vi.fn();
  const { rerender } = render(<DaySlotList day={makeDay()} selection={null} onToggleSlot={onToggleSlot} />);
  // HOLD(20:00~21:00) 행은 disabled 아님 → 탭 시 onToggleSlot 호출
  const pendingRow = screen.getByRole('button', { name: /20:00~21:00.*승인 대기/ });
  expect(pendingRow).toBeEnabled();
  fireEvent.click(pendingRow);
  expect(onToggleSlot).toHaveBeenCalledWith('20:00');
  // 선택 행(09:00~10:00)은 ink 배경 + aria-pressed + ✓ 표기(기존 유지)
  rerender(<DaySlotList day={makeDay()} selection={{ start: '09:00', end: '10:00' }} onToggleSlot={onToggleSlot} />);
  const selectedRow = screen.getByRole('button', { name: /09:00~10:00.*예약 가능/ });
  expect(selectedRow).toHaveClass('bg-ink');
  expect(selectedRow).toHaveAttribute('aria-pressed', 'true');
  expect(selectedRow).toHaveTextContent('✓');
});

it('승인 대기 행은 흰 바탕 + coral 라벨이고, 선택되면 라벨이 cream 으로 반전된다', () => {
  const { rerender } = render(<DaySlotList day={makeDay()} selection={null} onToggleSlot={vi.fn()} />);
  const pendingRow = () => screen.getByRole('button', { name: /20:00~21:00.*승인 대기/ });
  expect(pendingRow()).toHaveClass('bg-paper');
  expect(within(pendingRow()).getByText('승인 대기')).toHaveClass('text-coral');

  rerender(<DaySlotList day={makeDay()} selection={{ start: '20:00', end: '21:00' }} onToggleSlot={vi.fn()} />);
  expect(pendingRow()).toHaveClass('bg-ink');
  expect(within(pendingRow()).getByText(/승인 대기/)).toHaveClass('text-cream/85');
});

it('운영행이 있는 날은 기본 확보 시간 안내 박스에 단체·시간 나열과 고정 정책 문구를 렌더한다', () => {
  const day = makeDay({
    operatingNotes: [
      { organization: '고정관념', start: '09:00', end: '20:00' },
      { organization: '두잉밴드', start: '10:00', end: '12:00' },
    ],
  });
  const { container } = render(<DaySlotList day={day} selection={null} onToggleSlot={vi.fn()} />);
  expect(screen.getByText('기본 확보 시간')).toBeInTheDocument();
  expect(screen.getByText('고정관념 09:00~20:00 · 두잉밴드 10:00~12:00')).toBeInTheDocument();
  expect(
    screen.getByText(
      '학교와 협의되어 기본적으로 이 동아리가 사용하는 시간이에요. 다른 동아리도 같은 시간에 예약을 신청할 수 있고, 관리자 승인 후 일정 조정을 거쳐 이용할 수 있어요.',
    ),
  ).toBeInTheDocument();
  // 승인 주체는 "관리자"로 통일 — "총동연" 비노출 정책
  expect(screen.queryByText(/총동연/)).not.toBeInTheDocument();
  // 금지어(§10.2): 렌더 출력에 "운영 시간"·"운영 중" 부재.
  expect(container).not.toHaveTextContent(/운영 시간/);
  expect(container).not.toHaveTextContent(/운영 중/);
});

it('운영행이 없는 날은 기본 확보 시간 안내 박스를 렌더하지 않는다', () => {
  render(<DaySlotList day={makeDay({ operatingNotes: [] })} selection={null} onToggleSlot={vi.fn()} />);
  expect(screen.queryByText('기본 확보 시간')).not.toBeInTheDocument();
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
      submittedAt="7월 20일 14:05"
      manageHref="/manage/clubs/7/facility-bookings"
      onExploreOther={vi.fn()}
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
      submittedAt="7월 20일 14:05"
      onExploreOther={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByRole('link', { name: '내 예약에서 확인' })).not.toBeInTheDocument();
});

it('예약 성공 화면은 세로 타임라인·통일 승인 문구·CTA 3종을 렌더하고 예상 시간을 암시하지 않는다', () => {
  const onExploreOther = vi.fn();
  const onClose = vi.fn();
  render(
    <BookingSuccess
      facilityName="커뮤니티룸(1)"
      date="2026-07-20"
      range={{ start: '18:00', end: '20:00' }}
      overlappingPendingCount={2}
      submittedAt="7월 20일 14:05"
      manageHref="/manage/clubs/7/facility-bookings"
      onExploreOther={onExploreOther}
      onClose={onClose}
    />,
  );
  // 타임라인 단계 + 통일 승인 문구(시간/기관명 없음)
  expect(screen.getByText('신청 접수')).toBeInTheDocument();
  expect(screen.getByText('관리자 승인 대기')).toBeInTheDocument();
  expect(screen.getByText('관리자 승인 후 학교 반영 절차가 진행됩니다.')).toBeInTheDocument();
  expect(screen.getByText('7월 20일 14:05 접수')).toBeInTheDocument();
  expect(screen.getByText(/2건이 함께 대기/)).toBeInTheDocument();
  // 예상 시간·기관명 혼용 문구 부재
  expect(screen.queryByText(/1~2일/)).not.toBeInTheDocument();
  expect(screen.queryByText(/총동연/)).not.toBeInTheDocument();
  // CTA 3종 — 관리 링크 + 다른 시설 예약 + 닫기
  expect(screen.getByRole('link', { name: '내 예약에서 확인' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다른 시설 예약하기' }));
  expect(onExploreOther).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '닫기' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('패널 요약 카드는 레벨 뱃지·기간 분포를 렌더하고 바로 신청 퀵 칩은 렌더하지 않는다', () => {
  render(<PanelSummaryCard day={makeDay()} />);
  // availableSlotCount 11/13 → HIGH(여유)
  expect(screen.getByText('여유')).toBeInTheDocument();
  // 기간 분포 라벨(오전·오후·저녁)
  expect(screen.getByText('오전')).toBeInTheDocument();
  expect(screen.getByText('오후')).toBeInTheDocument();
  expect(screen.getByText('저녁')).toBeInTheDocument();
  // 퀵칩 섹션 제거 — "바로 신청 가능한 시간" 미렌더, 시각 칩 버튼 없음
  expect(screen.queryByText('바로 신청 가능한 시간')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '09:00' })).not.toBeInTheDocument();
});

it('패널 요약 카드는 상태별 집계 행과 슬롯 파생 이용 가능 시간을 노출하고 0건 상태는 숨긴다', () => {
  // makeDay(): AVAILABLE 10 · PENDING_HOLD 1 · BLOCKED 2 · PAST 0
  const { container } = render(<PanelSummaryCard day={makeDay()} />);
  expect(screen.getByText('예약 가능')).toBeInTheDocument();
  expect(screen.getByText('10칸')).toBeInTheDocument();
  expect(screen.getByText('승인 대기')).toBeInTheDocument();
  expect(screen.getByText('1칸')).toBeInTheDocument();
  expect(screen.getByText('예약됨')).toBeInTheDocument();
  expect(screen.getByText('2칸')).toBeInTheDocument();
  // 0건인 지난 시간은 렌더하지 않는다
  expect(screen.queryByText('지난 시간')).not.toBeInTheDocument();
  // 이용 가능 시간은 슬롯[0].start~슬롯[마지막].end 파생(FE 상수 하드코딩 금지)
  expect(screen.getByText('이용 가능 시간 09:00~22:00 · 13칸')).toBeInTheDocument();
  // 금지어(§10.2): "운영 시간"·"운영 중" 부재.
  expect(container).not.toHaveTextContent(/운영 시간/);
  expect(container).not.toHaveTextContent(/운영 중/);
});

it('예약 현황 카드는 운영행을 예약 건으로 잘라 운영 조각·예약 건·그 외 시간 행을 렌더한다', () => {
  // makeDay(): 운영 고정관념 09~20 · SCHOOL 비호응원단 17~18 · INTERNAL 18~19 · PENDING 20~21
  // → 타임라인: 운영 09~17 / 비호응원단 17~18 / 예약됨 18~19 / 운영 19~20 / 승인 대기 20~21
  const { container } = render(<DayBookingOverview day={makeDay()} />);
  // 제목은 bookingDateLabel 재사용(2026-07-20 = 월요일)
  expect(screen.getByText('7월 20일 (월) 예약 현황')).toBeInTheDocument();
  // 운영 조각 2개(09~17·19~20): sage 도트 + 단체명 + muted "(기본 확보)" 접미
  expect(screen.getByText('09:00~17:00')).toBeInTheDocument();
  expect(screen.getByText('19:00~20:00')).toBeInTheDocument();
  expect(screen.getAllByText('고정관념')).toHaveLength(2);
  expect(screen.getAllByText('(기본 확보)')).toHaveLength(2);
  const operatingRow = screen.getByText('09:00~17:00').closest('li');
  expect(operatingRow?.querySelector('span[aria-hidden]')).toHaveClass('bg-sage');
  // 예약 건 행: 시간 범위 + 이름(SCHOOL 단체명 / INTERNAL "예약됨")
  expect(screen.getByText('17:00~18:00')).toBeInTheDocument();
  expect(screen.getByText('비호응원단')).toBeInTheDocument();
  expect(screen.getByText('18:00~19:00')).toBeInTheDocument();
  expect(screen.getByText('예약됨')).toBeInTheDocument();
  // PENDING 행: warm 도트 + "승인 대기"(대기 pill 은 이름과 중복이라 생략)
  const pendingRow = screen.getByText('승인 대기').closest('li');
  expect(pendingRow).not.toBeNull();
  expect(pendingRow?.querySelector('span[aria-hidden]')).toHaveClass('bg-warm');
  // 그 외 행: 운영 구간(09~20) 밖 AVAILABLE(21시) 1개만 — 운영 구간 내 AVAILABLE 은 운영 조각이 담당
  expect(screen.getByText('그 외 시간')).toBeInTheDocument();
  expect(screen.getByText('예약 가능 · 1개 시간')).toBeInTheDocument();
  const availableRow = screen.getByText('예약 가능 · 1개 시간').closest('li');
  expect(availableRow?.querySelector('span[aria-hidden]')).toHaveClass('bg-sage');
  // 금지어(§10.2): "운영 시간"·"운영 중" 부재.
  expect(container).not.toHaveTextContent(/운영 시간/);
  expect(container).not.toHaveTextContent(/운영 중/);
});

it('예약 건이 없어도 운영행이 있으면 통짜 운영 조각 1행으로 카드를 렌더한다', () => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const operatingOnlyDay = makeDay({
    slots: Array.from({ length: 13 }, (_, index) => ({
      start: `${pad(9 + index)}:00`,
      end: `${pad(10 + index)}:00`,
      status: 'AVAILABLE' as const,
    })),
    operatingNotes: [{ organization: '고정관념', start: '09:00', end: '20:00' }],
  });
  render(<DayBookingOverview day={operatingOnlyDay} />);
  expect(screen.getByText('7월 20일 (월) 예약 현황')).toBeInTheDocument();
  // 예약이 없으니 운영행 전체가 통짜 운영 조각 1행
  expect(screen.getByText('09:00~20:00')).toBeInTheDocument();
  expect(screen.getByText('고정관념')).toBeInTheDocument();
  expect(screen.getByText('(기본 확보)')).toBeInTheDocument();
  // 운영 구간(09~20) 밖 AVAILABLE(20·21시) 2개 → 그 외 행
  expect(screen.getByText('예약 가능 · 2개 시간')).toBeInTheDocument();
});

it('예약 건도 운영행도 없으면(타임라인 0건) 예약 현황 카드를 렌더하지 않는다', () => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const emptyDay = makeDay({
    slots: Array.from({ length: 13 }, (_, index) => ({
      start: `${pad(9 + index)}:00`,
      end: `${pad(10 + index)}:00`,
      status: 'AVAILABLE' as const,
    })),
    operatingNotes: [],
  });
  const { container } = render(<DayBookingOverview day={emptyDay} />);
  expect(container.firstChild).toBeNull();
  expect(screen.queryByText(/예약 현황/)).not.toBeInTheDocument();
});

it('예약 패널(일간 콘텐츠 전용)은 요약 카드·예약 현황·시간 선택 순서로 렌더하고 뷰 토글은 없다', () => {
  render(
    <BookingPanel
      facility={{ id: 1, roomName: '커뮤니티룸(1)' }}
      day={makeDay()}
      selection={null}
      onToggleSlot={vi.fn()}
      step="slots"
      onProceedToForm={vi.fn()}
      onBackToSlots={vi.fn()}
      submittedResult={null}
      submittedClubId={null}
      submittedAt={null}
      onSubmitted={vi.fn()}
      onExploreOther={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  const summary = screen.getByText('선택한 날짜'); // PanelSummaryCard
  const overview = screen.getByText('7월 20일 (월) 예약 현황'); // DayBookingOverview
  const slotList = screen.getByRole('list', { name: '시간대 선택' }); // DaySlotList
  // 요약 → 예약 현황 → 시간 선택 순서(DOCUMENT_POSITION_FOLLOWING = 4)
  expect(summary.compareDocumentPosition(overview) & 4).toBeTruthy();
  expect(overview.compareDocumentPosition(slotList) & 4).toBeTruthy();
  // 일간/주간 뷰 토글은 공용 헤더(BookingViewHeader)로 이관 — 패널 내부 tablist·주간 그리드는 없다.
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '주간' })).not.toBeInTheDocument();
});

it('BookingViewHeader 는 [월|주] 토글·기간 라벨·이동 화살표·범례를 렌더하고 콜백을 부른다', () => {
  const onChangeView = vi.fn();
  const onPrev = vi.fn();
  const onNext = vi.fn();
  const { rerender, container } = render(
    <BookingViewHeader
      view="month"
      onChangeView={onChangeView}
      periodLabel="2026년 7월"
      onPrev={onPrev}
      onNext={onNext}
      canPrev={false}
      canNext
    />,
  );
  // 세그먼트 토글은 tablist — 월 활성, 주 비활성.
  const tablist = screen.getByRole('tablist', { name: '월/주 보기 전환' });
  const monthTab = within(tablist).getByRole('tab', { name: '월' });
  const weekTab = within(tablist).getByRole('tab', { name: '주' });
  expect(monthTab).toHaveAttribute('aria-selected', 'true');
  expect(weekTab).toHaveAttribute('aria-selected', 'false');
  fireEvent.click(weekTab);
  expect(onChangeView).toHaveBeenCalledWith('week');

  // 기간 라벨 + 월간 화살표(이전 달 비활성, 다음 달 활성).
  expect(screen.getByRole('heading', { level: 2, name: '2026년 7월' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '이전 달' })).toBeDisabled();
  const nextMonth = screen.getByRole('button', { name: '다음 달' });
  expect(nextMonth).toBeEnabled();
  fireEvent.click(nextMonth);
  expect(onNext).toHaveBeenCalledTimes(1);
  // 월간 범례
  expect(screen.getByText('여유')).toBeInTheDocument();
  expect(screen.getByText('마감')).toBeInTheDocument();

  // 주간으로 전환 — 라벨/화살표 aria/범례가 주간용으로 바뀐다.
  rerender(
    <BookingViewHeader
      view="week"
      onChangeView={onChangeView}
      periodLabel="7월 20일 – 26일"
      onPrev={onPrev}
      onNext={onNext}
      canPrev
      canNext={false}
    />,
  );
  expect(screen.getByRole('heading', { level: 2, name: '7월 20일 – 26일' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '이전 주' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '다음 주' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '이전 주' }));
  expect(onPrev).toHaveBeenCalledTimes(1);
  // 주간 범례(가능/예약됨/기본 확보 시간/대기) — 9차 요구(§10.1): 운영행 가이드 레이어 = sky 점선 스와치.
  expect(screen.getByText('가능')).toBeInTheDocument();
  expect(screen.getByText('예약됨')).toBeInTheDocument();
  expect(screen.getByText('기본 확보 시간')).toBeInTheDocument();
  expect(screen.getByText('대기')).toBeInTheDocument();
  // 금지어(§10.2): 범례에 "운영 중"·"운영 시간" 부재.
  expect(container).not.toHaveTextContent(/운영 중/);
  expect(container).not.toHaveTextContent(/운영 시간/);
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

// ── 주간 타임테이블(WeekTimetable) — 목업 F3(§4): 셀 시간 선택·선택일 컬럼 강조 ─────
// 2026-07-20 = 월요일 → weekDatesOf 는 [월20 … 일26]. 창=07-20~07-24(토25는 창 밖, 일26은 데이터 없음).
const WEEK_SELECTED_DATE = '2026-07-20';

// 13칸(09~21시) 슬롯. overrides 로 특정 시각의 상태를 바꾼다(기본 AVAILABLE).
function makeWeekSlots(overrides: Record<number, Partial<BookingAvailabilitySlot>> = {}): BookingAvailabilitySlot[] {
  const pad = (value: number) => String(value).padStart(2, '0');
  return Array.from({ length: 13 }, (_, index) => {
    const base: BookingAvailabilitySlot = { start: `${pad(9 + index)}:00`, end: `${pad(10 + index)}:00`, status: 'AVAILABLE' };
    return { ...base, ...overrides[index] };
  });
}

function makeWeekDaysByIso(): Map<string, BookingDayAvailability> {
  const day = (date: string, slots: BookingAvailabilitySlot[]): BookingDayAvailability => ({
    date,
    dayStatus: 'AVAILABLE',
    availableSlotCount: 13,
    operatingNotes: [],
    slots,
  });
  return new Map<string, BookingDayAvailability>([
    // 선택일(월20): 09시=지난·10시=예약됨·11시=대기, 나머지 가능
    [
      WEEK_SELECTED_DATE,
      day(WEEK_SELECTED_DATE, makeWeekSlots({ 0: { status: 'PAST' }, 1: { status: 'BLOCKED', blockedBy: 'INTERNAL' }, 2: { status: 'PENDING_HOLD' } })),
    ],
    ['2026-07-21', day('2026-07-21', makeWeekSlots())], // 화(창 안) — 다른 요일 탭 검증
    ['2026-07-25', day('2026-07-25', makeWeekSlots())], // 토(창 밖 — bookableUntil 07-24 초과)
    // 2026-07-26(일)은 의도적으로 누락 → 데이터 없음
  ]);
}

function renderWeek(props?: Partial<Parameters<typeof WeekTimetable>[0]>) {
  const onSelectDate = vi.fn();
  const onTapSlot = vi.fn();
  render(
    <WeekTimetable
      selectedDate={WEEK_SELECTED_DATE}
      daysByIso={makeWeekDaysByIso()}
      bookableFrom="2026-07-20"
      bookableUntil="2026-07-24"
      todayIso="2026-07-20"
      selection={null}
      onSelectDate={onSelectDate}
      onTapSlot={onTapSlot}
      {...props}
    />,
  );
  return { onSelectDate, onTapSlot };
}

it('주간 그리드는 선택일 컬럼을 "· 선택" 접미·ink 원형 숫자·(PC) sage tint 프레임으로 강조한다', () => {
  renderWeek();
  // 선택일(월20) 헤더: "· 선택" 접미 + 숫자 ink 원형 반전(모바일·PC 공통 유지).
  const selectedHeader = screen.getByRole('button', { name: '월요일 20일 · 선택' });
  expect(within(selectedHeader).getByText('20')).toHaveClass('bg-ink');
  // 컬럼 프레임(sage tint·ink 보더)은 PC 전용(§9.2) — sm: 프리픽스라 모바일엔 미적용.
  const selectedCell = screen.getByRole('button', { name: '월요일 20일 18:00 가능' });
  expect(selectedCell.closest('td')).toHaveClass('sm:bg-sage/20');
  expect(selectedCell.closest('td')).not.toHaveClass('bg-sage/20');
  // 다른 요일 헤더엔 "· 선택" 접미가 없다.
  expect(screen.getByRole('button', { name: '화요일 21일' })).toBeInTheDocument();
});

it('주간 그리드는 가능 셀 탭 시 onTapSlot(iso, start) 를 부른다(선택일·다른 요일 모두)', () => {
  const { onTapSlot } = renderWeek();
  // 선택일의 가능 셀
  fireEvent.click(screen.getByRole('button', { name: '월요일 20일 18:00 가능' }));
  expect(onTapSlot).toHaveBeenNthCalledWith(1, '2026-07-20', '18:00');
  // 다른 요일(화21)의 가능 셀
  fireEvent.click(screen.getByRole('button', { name: '화요일 21일 12:00 가능' }));
  expect(onTapSlot).toHaveBeenNthCalledWith(2, '2026-07-21', '12:00');
});

it('주간 그리드는 지난 셀·차단 블록·창 밖 셀을 비활성화하고 데이터 없는 요일 셀은 버튼을 렌더하지 않는다', () => {
  renderWeek();
  expect(screen.getByRole('button', { name: '월요일 20일 09:00 지난' })).toBeDisabled(); // PAST 셀
  // BLOCKED(10시)는 단일칸이라도 예약 건 블록(HH:MM~HH:MM)으로 렌더되고 PC 에서 비인터랙티브다.
  expect(screen.getByRole('button', { name: '월요일 20일 10:00~11:00 예약됨' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '토요일 25일 09:00 예약 기간 아님' })).toBeDisabled(); // 창 밖
  // 07-26(일)은 daysByIso 에 없음 → 시각 셀 버튼 자체가 없다.
  expect(screen.queryByRole('button', { name: /26일 09:00/ })).toBeNull();
});

it('주간 그리드의 대기(PENDING_HOLD) 구간은 이름 없는 "승인 대기" 블록으로 렌더되고 PC 에서 비인터랙티브다', () => {
  renderWeek();
  // 비노출 정책: 이름 없이 "승인 대기"만. PC 에서 확정/대기 블록은 disabled(§8.1).
  const pendingBlock = screen.getByRole('button', { name: '월요일 20일 11:00~12:00 승인 대기' });
  expect(pendingBlock).toBeDisabled();
  expect(pendingBlock).toHaveClass('bg-warm/15'); // Amber(warm) 고정색
  expect(within(pendingBlock).getByText('승인 대기')).toBeInTheDocument();
});

it('주간 그리드의 선택 범위 셀은 ink 배경·✓·aria-pressed=true 로 표기된다', () => {
  renderWeek({ selection: { start: '18:00', end: '20:00' } });
  const rangeStart = screen.getByRole('button', { name: '월요일 20일 18:00 가능' });
  expect(rangeStart).toHaveClass('bg-ink');
  expect(rangeStart).toHaveAttribute('aria-pressed', 'true');
  expect(rangeStart).toHaveTextContent('✓');
  // 범위 내 두 번째 슬롯도 선택.
  expect(screen.getByRole('button', { name: '월요일 20일 19:00 가능' })).toHaveAttribute('aria-pressed', 'true');
  // 범위 밖 가능 셀은 aria-pressed=false.
  expect(screen.getByRole('button', { name: '월요일 20일 12:00 가능' })).toHaveAttribute('aria-pressed', 'false');
});

it('주간 그리드는 좌측 시간 라벨의 PC 표기를 mono HH:00 으로 유지하고, 셀 행 높이를 모바일 압축(h-7)·PC(sm:h-10)로 둔다', () => {
  renderWeek();
  // PC 시간 라벨(HH:00)은 mono 유지 — 모바일은 HH 만 노출하는 별도 span(§9.1).
  const nineLabel = screen.getByText('09:00');
  expect(nineLabel).toHaveClass('font-mono');
  expect(screen.getByText('21:00')).toBeInTheDocument(); // 13행(09~21시)
  // 셀 행 높이 — 모바일 h-7(28px)로 압축, PC sm:h-10(40px).
  const cell = screen.getByRole('button', { name: '월요일 20일 18:00 가능' });
  expect(cell).toHaveClass('h-7');
  expect(cell).toHaveClass('sm:h-10');
});

it('모바일 압축(§9.1): 그리드는 table-fixed·시간열 w-8 이고 min-w 가로 스크롤 래퍼가 없다', () => {
  renderWeek();
  const table = screen.getByRole('table');
  // 7컬럼 균등(table-fixed) + 모바일 min-w 미적용(sm:min-w-[480px] 으로만) → 가로 스크롤 제거.
  expect(table).toHaveClass('table-fixed');
  expect(table).not.toHaveClass('min-w-[480px]');
  // 시간열은 모바일 w-8, PC sm:w-12. 09시는 모바일 'HH' 표기(09)도 노출된다.
  expect(screen.getByText('09')).toBeInTheDocument();
});

it('모바일 압축(§9.2): 확정 블록은 2자 약칭만 노출하고 풀네임·시간은 PC(sm) 전용이다', () => {
  renderBlockWeek();
  const block = screen.getByRole('button', { name: '월요일 20일 13:00~15:00 비호응원단 예약됨' });
  // 모바일 약칭 '비호'(sm:hidden) — 라벨 앞 2자.
  const abbrev = within(block).getByText('비호');
  expect(abbrev).toHaveClass('sm:hidden');
  // PC 풀네임(hidden sm:block)·시간(hidden sm:block)은 모바일에서 숨김.
  const fullName = within(block).getByText('비호응원단');
  expect(fullName).toHaveClass('hidden');
  expect(fullName).toHaveClass('sm:block');
  expect(within(block).getByText('13:00~15:00')).toHaveClass('hidden');
});

it('모바일 압축(§9.2): 대기 블록은 "대기" 약칭만 노출하고 PC 는 "승인 대기"를 유지한다', () => {
  renderBlockWeek();
  const pending = screen.getByRole('button', { name: '월요일 20일 15:00~16:00 승인 대기' });
  expect(within(pending).getByText('대기')).toHaveClass('sm:hidden');
  const pendingFull = within(pending).getByText('승인 대기');
  expect(pendingFull).toHaveClass('hidden');
  expect(pendingFull).toHaveClass('sm:block');
});

it('블록 인터랙션 게이트(§9.3): blocksInteractive 면 확정·대기 블록이 탭 가능하고 onTapBlock(라벨·시간·kind) 을 부른다', () => {
  const onTapBlock = vi.fn();
  renderBlockWeek({ blocksInteractive: true, onTapBlock });
  const block = screen.getByRole('button', { name: '월요일 20일 13:00~15:00 비호응원단 예약됨' });
  expect(block).toBeEnabled();
  fireEvent.click(block);
  expect(onTapBlock).toHaveBeenCalledWith({ kind: 'BLOCKED', label: '비호응원단', start: '13:00', end: '15:00' });

  const pending = screen.getByRole('button', { name: '월요일 20일 15:00~16:00 승인 대기' });
  fireEvent.click(pending);
  // PENDING 은 이름 비노출 — 라벨은 "승인 대기".
  expect(onTapBlock).toHaveBeenCalledWith({ kind: 'PENDING', label: '승인 대기', start: '15:00', end: '16:00' });
});

it('블록 인터랙션 게이트(§9.3): blocksInteractive 없이(PC)는 블록이 disabled 이고 탭해도 onTapBlock 을 부르지 않는다', () => {
  const onTapBlock = vi.fn();
  renderBlockWeek({ onTapBlock });
  const block = screen.getByRole('button', { name: '월요일 20일 13:00~15:00 비호응원단 예약됨' });
  expect(block).toBeDisabled();
  fireEvent.click(block);
  expect(onTapBlock).not.toHaveBeenCalled();
});

// ── 주간 그리드 예약 블록화 + 색상 정책(§8) — 확정·대기 블록 + 운영 구간 sky 셀·파스텔 순환 ─────
// 창=07-20~07-26(모두 창 안·비과거, 오늘=07-20). 월20(선택일): 운영 고정관념 09~11(sky 셀 구간) +
// 비호응원단 13~15(연속 2칸) + 승인 대기 15~16 + 나머지 가능. 화21: 비호응원단 09~11(같은 동아리 다른 날).
// 수22: 트레몰로 09~10.
function makeBlockWeekDaysByIso(): Map<string, BookingDayAvailability> {
  const day = (
    date: string,
    slots: BookingAvailabilitySlot[],
    operatingNotes: BookingDayAvailability['operatingNotes'] = [],
  ): BookingDayAvailability => ({ date, dayStatus: 'AVAILABLE', availableSlotCount: 13, operatingNotes, slots });
  const school = (organization: string) => ({ status: 'BLOCKED' as const, blockedBy: 'SCHOOL' as const, organization });
  return new Map<string, BookingDayAvailability>([
    [
      '2026-07-20',
      day(
        '2026-07-20',
        makeWeekSlots({ 4: school('비호응원단'), 5: school('비호응원단'), 6: { status: 'PENDING_HOLD' } }),
        [{ organization: '고정관념', start: '09:00', end: '11:00' }],
      ),
    ],
    ['2026-07-21', day('2026-07-21', makeWeekSlots({ 0: school('비호응원단'), 1: school('비호응원단') }))],
    ['2026-07-22', day('2026-07-22', makeWeekSlots({ 0: school('트레몰로') }))],
  ]);
}

function renderBlockWeek(props?: Partial<Parameters<typeof WeekTimetable>[0]>) {
  const onSelectDate = vi.fn();
  const onTapSlot = vi.fn();
  render(
    <WeekTimetable
      selectedDate="2026-07-20"
      daysByIso={makeBlockWeekDaysByIso()}
      bookableFrom="2026-07-20"
      bookableUntil="2026-07-26"
      todayIso="2026-07-20"
      selection={null}
      onSelectDate={onSelectDate}
      onTapSlot={onTapSlot}
      {...props}
    />,
  );
  return { onSelectDate, onTapSlot };
}

it('주간 그리드는 연속 BLOCKED 를 rowSpan 병합 블록(이름 Bold·시간 secondary·accent 보더)으로 렌더한다', () => {
  renderBlockWeek();
  // 비호응원단 13~15 = 병합 블록 1개(중간 14시 별도 블록 없음).
  const block = screen.getByRole('button', { name: '월요일 20일 13:00~15:00 비호응원단 예약됨' });
  expect(screen.queryByRole('button', { name: /14:00~15:00 비호응원단/ })).toBeNull();
  // rowSpan=2(2칸 병합), 이름 Bold + 시간 범위.
  expect(block.closest('td')).toHaveAttribute('rowspan', '2');
  expect(within(block).getByText('비호응원단')).toHaveClass('font-bold');
  expect(within(block).getByText('13:00~15:00')).toBeInTheDocument();
  // 좌측 accent 보더(같은 계열 진한 톤).
  expect(block).toHaveClass('border-l-pastel-mint-accent');
  // PC 에서 확정 블록은 비인터랙티브.
  expect(block).toBeDisabled();
});

it('주간 그리드의 기본 확보 시간 가용 셀은 sky 점선 가이드 셀이다 — 블록 아님·단체명 미표기(§8.1·§10.1)', () => {
  const { onTapSlot } = renderBlockWeek();
  // 운영(고정관념 09~11) 구간의 AVAILABLE 셀 = sky 점선 가이드 셀. 동작은 일반 가용 셀과 동일(탭 = onTapSlot).
  const operatingCell = screen.getByRole('button', { name: '월요일 20일 09:00 기본 확보 시간 · 예약 신청 가능' });
  expect(operatingCell).toBeEnabled();
  // §10.1 가이드 레이어: 색은 일반 가용 셀과 동일(sage), 점선 보더만 차이(사용자 조정 2026-07-17).
  expect(operatingCell).toHaveClass('bg-sage-mist');
  expect(operatingCell).toHaveClass('border-dashed');
  expect(operatingCell).toHaveClass('border-sage-soft');
  fireEvent.click(operatingCell);
  expect(onTapSlot).toHaveBeenCalledWith('2026-07-20', '09:00');
  // 운영 단체명·"(운영)" 은 그리드에 없다(사이드바 현황 카드·기본 확보 시간 안내 박스가 담당).
  expect(screen.queryByText('고정관념')).toBeNull();
  expect(screen.queryByText('(운영)')).toBeNull();
  // 금지어(§10.2): aria-label 에 "운영 중" 부재.
  expect(screen.queryByRole('button', { name: /운영 중/ })).toBeNull();
  // 운영 구간 밖 가능 셀(12:00)은 sage 유지.
  expect(screen.getByRole('button', { name: '월요일 20일 12:00 가능' })).toHaveClass('bg-sage-mist');
});

it('기본 확보 시간 sky 셀도 선택되면 ink 배경·✓·aria-pressed=true 로 표기된다', () => {
  renderBlockWeek({ selection: { start: '09:00', end: '11:00' } });
  const selectedCell = screen.getByRole('button', { name: '월요일 20일 09:00 기본 확보 시간 · 예약 신청 가능' });
  expect(selectedCell).toHaveClass('bg-ink');
  expect(selectedCell).toHaveAttribute('aria-pressed', 'true');
  expect(selectedCell).toHaveTextContent('✓');
  // 범위 내 두 번째 기본 확보 시간 셀도 선택 표기.
  expect(screen.getByRole('button', { name: '월요일 20일 10:00 기본 확보 시간 · 예약 신청 가능' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

it('주간 그리드는 확정 블록에 라벨 첫 등장 순 파스텔을 배정한다(동일 동아리=동일 색·다른 동아리=다른 색)', () => {
  renderBlockWeek();
  // 첫 등장 순서(월→일, 시간순): 비호응원단(월20 13시) → 비호응원단(화21) → 트레몰로(수22).
  const monday = screen.getByRole('button', { name: '월요일 20일 13:00~15:00 비호응원단 예약됨' });
  const tuesday = screen.getByRole('button', { name: '화요일 21일 09:00~11:00 비호응원단 예약됨' });
  const wednesday = screen.getByRole('button', { name: '수요일 22일 09:00~10:00 트레몰로 예약됨' });
  // 같은 동아리(비호응원단)는 화면 내내 같은 파스텔(mint = 첫 라벨).
  expect(monday).toHaveClass('bg-pastel-mint');
  expect(tuesday).toHaveClass('bg-pastel-mint');
  // 다른 동아리(트레몰로)는 다른 파스텔(lemon = 두 번째 라벨).
  expect(wednesday).toHaveClass('bg-pastel-lemon');
  expect(wednesday).not.toHaveClass('bg-pastel-mint');
});

// ── 블록 상세 바텀시트(WeekBlockSheet) — §9.3 모바일 블록 탭 상세 ─────
it('블록 상세 시트(§9.3): 확정 블록은 동아리명·시간 범위·"예약됨" 배지를 노출한다', () => {
  render(<WeekBlockSheet block={{ kind: 'BLOCKED', label: '비호응원단', start: '13:00', end: '15:00' }} onClose={vi.fn()} />);
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText('비호응원단')).toBeInTheDocument();
  expect(within(dialog).getByText('13:00~15:00')).toBeInTheDocument();
  expect(within(dialog).getByText('예약됨')).toBeInTheDocument();
});

it('블록 상세 시트(§9.3): 대기 블록은 이름 없이 "승인 대기" 라벨·배지와 시간만 노출한다', () => {
  render(<WeekBlockSheet block={{ kind: 'PENDING', label: '승인 대기', start: '15:00', end: '16:00' }} onClose={vi.fn()} />);
  const dialog = screen.getByRole('dialog');
  // 라벨·배지 모두 "승인 대기"(이름 비노출 정책 유지) → 2회 등장.
  expect(within(dialog).getAllByText('승인 대기').length).toBeGreaterThanOrEqual(2);
  expect(within(dialog).getByText('15:00~16:00')).toBeInTheDocument();
  // 확정 배지는 없다.
  expect(within(dialog).queryByText('예약됨')).not.toBeInTheDocument();
});

it('블록 상세 시트(§9.3): block 이 null 이면 시트를 열지 않는다', () => {
  render(<WeekBlockSheet block={null} onClose={vi.fn()} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

// ── 모바일 빠른 예약 바텀시트(MobileDaySheet) — §11.1 월간 날짜 탭 = 빠른 시간 선택 ─────
function renderMobileSheet(overrides?: Partial<Parameters<typeof MobileDaySheet>[0]>) {
  const props = {
    open: true,
    facility: { id: 1, roomName: '커뮤니티룸(1)' },
    day: makeDay(),
    selection: null,
    onToggleSlot: vi.fn(),
    step: 'slots' as const,
    onProceedToForm: vi.fn(),
    onBackToSlots: vi.fn(),
    submittedResult: null,
    submittedClubId: null,
    submittedAt: null,
    onSubmitted: vi.fn(),
    onExploreOther: vi.fn(),
    onClose: vi.fn(),
    onViewTimetable: vi.fn(),
    ...overrides,
  };
  render(<MobileDaySheet {...props} />);
  return props;
}

it('빠른 예약 시트(§11.1): slots 스텝은 날짜 제목·스텝 인디케이터·슬롯 리스트·기본 확보 안내·CTA·시간표로 보기를 렌더하고 요약/현황 카드는 없다', () => {
  renderMobileSheet();
  const dialog = screen.getByRole('dialog');
  // 헤더 날짜 제목 = bookingDateLabel(2026-07-20) = "7월 20일 (월)".
  expect(within(dialog).getByText('7월 20일 (월)')).toBeInTheDocument();
  expect(within(dialog).getByLabelText('예약 진행 단계')).toBeInTheDocument();
  expect(within(dialog).getByRole('list', { name: '시간대 선택' })).toBeInTheDocument();
  // 슬롯 리스트에 기본 확보 시간 안내 박스가 함께 온다(DaySlotList 재사용).
  expect(within(dialog).getByText('기본 확보 시간')).toBeInTheDocument();
  // 선택 전 CTA 비활성 + 보조 버튼 "시간표로 보기" 노출(slots 스텝).
  expect(within(dialog).getByRole('button', { name: '시간을 선택해주세요' })).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: '시간표로 보기' })).toBeInTheDocument();
  // 다크 요약 카드·예약 현황 카드는 시트에 없다(§11.1 — 그 역할은 주간 뷰).
  expect(within(dialog).queryByText('선택한 날짜')).not.toBeInTheDocument();
  expect(within(dialog).queryByText(/예약 현황/)).not.toBeInTheDocument();
});

it('빠른 예약 시트(§11.1): 선택이 있으면 범위 요약 칩·활성 CTA 를 렌더하고 CTA·시간표로 보기 콜백을 부른다', () => {
  const props = renderMobileSheet({ selection: { start: '18:00', end: '20:00' } });
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText('18:00~20:00')).toBeInTheDocument();
  const cta = within(dialog).getByRole('button', { name: '18:00~20:00 예약 신청' });
  expect(cta).toBeEnabled();
  fireEvent.click(cta);
  expect(props.onProceedToForm).toHaveBeenCalledTimes(1);
  fireEvent.click(within(dialog).getByRole('button', { name: '시간표로 보기' }));
  expect(props.onViewTimetable).toHaveBeenCalledTimes(1);
});

it('빠른 예약 시트(§11.1): 슬롯 탭은 onToggleSlot(start) 을 부른다', () => {
  const props = renderMobileSheet();
  const slotList = within(screen.getByRole('dialog')).getByRole('list', { name: '시간대 선택' });
  fireEvent.click(within(slotList).getByRole('button', { name: /09:00~10:00/ }));
  expect(props.onToggleSlot).toHaveBeenCalledWith('09:00');
});

it('빠른 예약 시트(§11.1): success 스텝은 승인 타임라인을 렌더하고 시간표로 보기는 숨는다', () => {
  renderMobileSheet({
    step: 'success',
    selection: { start: '18:00', end: '19:00' },
    submittedAt: '7월 20일 14:05',
    submittedClubId: 7,
    submittedResult: { bookingId: 1, status: 'PENDING', overlappingPendingCount: 0 },
  });
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByLabelText('승인 진행 타임라인')).toBeInTheDocument();
  expect(within(dialog).getByRole('link', { name: '내 예약에서 확인' })).toHaveAttribute(
    'href',
    '/manage/clubs/7/facility-bookings',
  );
  // 시간표로 보기는 slots 스텝 전용 — 성공 화면엔 없다.
  expect(within(dialog).queryByRole('button', { name: '시간표로 보기' })).not.toBeInTheDocument();
});

it('빠른 예약 시트(§11.1): open=false 면 시트를 열지 않는다', () => {
  renderMobileSheet({ open: false, day: null, facility: null });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
