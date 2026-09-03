import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { BookingConfirmDialog } from '@/app/facilities/_components/booking/BookingConfirmDialog';
import { BookingSuccess } from '@/app/facilities/_components/booking/BookingSuccess';
import { FacilityHomeCard } from '@/app/facilities/_components/booking/FacilityHomeCard';
import type { DayLevel } from '@/app/facilities/_lib/bookingCalendar';
import { DAY_LEVEL_META } from '@/app/facilities/_lib/bookingCalendar';
import { seoulDateIso } from '@/app/facilities/_lib/facilityTimeline';

// FacilityHomeCard 는 내부에서 new Date() 로 오늘을 계산하므로 시스템 시각을 고정한다.
// 픽스처는 오프셋 명시 인스턴트 — 집계가 KST 라 로컬 Date 는 UTC 러너에서 어긋난다(P2-18).
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
    // 확보 시간 비차단 정보(스펙 §3 복원) — BE 가 BASIC_SECURED_TIME 슬라이스에서 채운다.
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

it('콘텍스트 바는 시설 선택 드롭다운·전체 보기를 렌더하고 항목 선택 시 onSelect 를 부른다', async () => {
  const user = userEvent.setup();
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
  // 트리거 = 현재 선택 시설이 선택값으로 표시(위치 포함)
  const trigger = screen.getByRole('button', { name: '시설 선택 — 현재 커뮤니티룸(1)' });
  expect(screen.getByText('학생회관 2층')).toBeInTheDocument();
  // 드롭다운 열기 → 다른 시설 항목 선택 시 즉시 onSelect
  await user.click(trigger);
  await user.click(await screen.findByRole('menuitem', { name: /공동연습실\(1\)/ }));
  expect(onSelect).toHaveBeenCalledWith(2);
  // 전체 보기 — 클릭 시 홈 복귀
  fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));
  expect(onGoHome).toHaveBeenCalledTimes(1);
});

it('드롭다운에서 현재 시설 재선택은 onSelect 를 부르지 않는다(불필요 캘린더 리셋 방지)', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(
    <FacilityContextBar
      facilities={[
        { id: 1, roomName: '커뮤니티룸(1)', location: '학생회관 2층' },
        { id: 2, roomName: '공동연습실(1)', location: null },
      ]}
      selectedId={1}
      onSelect={onSelect}
      onGoHome={vi.fn()}
    />,
  );
  await user.click(screen.getByRole('button', { name: '시설 선택 — 현재 커뮤니티룸(1)' }));
  await user.click(await screen.findByRole('menuitem', { name: /커뮤니티룸\(1\)/ }));
  expect(onSelect).not.toHaveBeenCalled();
});

it('시설 드롭다운은 개수 캡 없이 전 시설을 나열한다(6번째 이후 시설도 즉시 선택 가능)', async () => {
  const user = userEvent.setup();
  const manyFacilities = Array.from({ length: 8 }, (_, index) => ({
    id: index + 1,
    roomName: `연습실(${index + 1})`,
    location: null,
  }));
  render(
    <FacilityContextBar facilities={manyFacilities} selectedId={1} onSelect={vi.fn()} onGoHome={vi.fn()} />,
  );
  await user.click(screen.getByRole('button', { name: '시설 선택 — 현재 연습실(1)' }));
  // 구 스크롤 탭의 slice(0,5) 캡이면 연습실(7)·(8)이 사라진다 — 드롭다운은 전부 나열.
  expect(await screen.findByRole('menuitem', { name: /연습실\(7\)/ })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /연습실\(8\)/ })).toBeInTheDocument();
});

it('캘린더 셀은 레벨 라벨(여유/마감)을 표시하고 창 이전 과거는 비활성이다', () => {
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
    />,
  );
  // 셀 접근성 이름은 '레벨 + 남은 칸수'를 포함한다(카드형 셀). FULL 셀도 창내라 클릭 가능(현황 확인).
  expect(screen.getByRole('button', { name: '20일 여유, 남은 11칸' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '21일 마감, 남은 0칸' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '12일' })).toBeDisabled(); // bookableFrom 이전

  // 월요일 시작 — 요일 헤더 첫 칸이 '월', 마지막이 '일'.
  const weekdayHeaders = screen.getAllByText(/^[월화수목금토일]$/);
  expect(weekdayHeaders).toHaveLength(7);
  const [firstWeekday] = weekdayHeaders;
  expect(firstWeekday).toHaveTextContent('월');
});

it('캘린더의 데이터 있는 지난 날짜 셀은 열람용으로 활성이고(레벨 라벨 없음) 클릭 시 onSelectDate 를 부르며, 데이터 없는 셀은 비활성이다', () => {
  const onSelectDate = vi.fn();
  const pastDay = makeDay({
    date: '2026-07-10',
    dayStatus: 'PAST',
    availableSlotCount: 0,
    slots: makeDay().slots.map((slot) => (slot.status === 'AVAILABLE' ? { ...slot, status: 'PAST' as const } : slot)),
  });
  render(
    <BookingCalendar
      yearMonth="2026-07"
      daysByIso={new Map([[pastDay.date, pastDay], ['2026-07-20', makeDay()]])}
      bookableFrom="2026-07-13"
      bookableUntil="2026-08-31"
      todayIso="2026-07-13"
      selectedDate={null}
      onSelectDate={onSelectDate}
      onOutOfWindowSelect={vi.fn()}
    />,
  );
  const pastCell = screen.getByRole('button', { name: '10일 지난 날짜' });
  expect(pastCell).toBeEnabled();
  expect(pastCell).not.toHaveAttribute('aria-disabled');
  expect(within(pastCell).queryByText(/여유|보통|혼잡|마감/)).toBeNull();
  fireEvent.click(pastCell);
  expect(onSelectDate).toHaveBeenCalledWith('2026-07-10');
  // 데이터 없는 지난 날짜(12일)는 여전히 비활성 — 열람할 기록이 없다.
  expect(screen.getByRole('button', { name: '12일' })).toBeDisabled();
});

it('모바일 캘린더 셀은 가로 3단계 게이지로 표기하고 상태 텍스트를 줄바꿈 없이 유지한다', () => {
  // 여유(11/13)·보통(5/13)·혼잡(2/13)·마감(0) — dayLevelOf 경계 그대로.
  const days = [
    makeDay({ date: '2026-07-20', availableSlotCount: 11 }),
    makeDay({ date: '2026-07-21', availableSlotCount: 5 }),
    makeDay({ date: '2026-07-22', availableSlotCount: 2 }),
    makeDay({ date: '2026-07-23', dayStatus: 'FULL', availableSlotCount: 0 }),
  ];
  render(
    <BookingCalendar
      yearMonth="2026-07"
      daysByIso={new Map(days.map((day) => [day.date, day]))}
      bookableFrom="2026-07-13"
      bookableUntil="2026-08-31"
      todayIso="2026-07-13"
      selectedDate={null}
      onSelectDate={vi.fn()}
      onOutOfWindowSelect={vi.fn()}
    />,
  );
  // 채워진 칸 수 = 잔여 여유량 — 색만이 아니라 칸 수 자체가 신호다.
  // 많이 찰수록 여유 = sm 이상 8칸 히트맵 바와 같은 방향(기기마다 반대로 읽히면 안 된다).
  // 빈 칸 색은 선택 여부에 따라 bg-line/bg-cream 으로 갈리므로, 레벨 색으로 세야 오측정이 없다.
  const filledStepsOf = (label: string, level: DayLevel) => {
    const gauge = within(screen.getByRole('button', { name: label })).getByTestId('level-gauge');
    return Array.from(gauge.children).filter((bar) => bar.className.includes(DAY_LEVEL_META[level].barClass)).length;
  };
  expect(filledStepsOf('20일 여유, 남은 11칸', 'HIGH')).toBe(3);
  expect(filledStepsOf('21일 보통, 남은 5칸', 'MID')).toBe(2);
  expect(filledStepsOf('22일 혼잡, 남은 2칸', 'LOW')).toBe(1);
  // 마감은 0단계 — 빈 게이지가 아니라 대시(자식 막대 없음)로 구분한다.
  const fullGauge = within(screen.getByRole('button', { name: '23일 마감, 남은 0칸' })).getByTestId('level-gauge');
  expect(fullGauge.dataset.level).toBe('FULL');
  expect(fullGauge.children).toHaveLength(0);
  // 좁은 모바일에서 "여/유" 로 분해되던 회귀 가드 — 상태 텍스트는 남기되 절대 줄바꿈되지 않는다.
  expect(screen.getByText('여유')).toHaveClass('max-sm:whitespace-nowrap');
  // PC 표기(8칸 히트맵 바)는 그대로 — 모바일에서만 숨고, 3단계 게이지가 그 자리를 대신한다.
  const highCell = screen.getByRole('button', { name: '20일 여유, 남은 11칸' });
  const heatBar = highCell.querySelector('.sm\\:flex');
  expect(heatBar).toHaveClass('hidden');
  expect(heatBar?.children).toHaveLength(8);
  // 역방향 가드 — 3단계 게이지는 sm 이상에서 반드시 숨는다. 없으면 PC 에 두 표기가 겹쳐 나온다.
  expect(within(highCell).getByTestId('level-gauge').parentElement).toHaveClass('sm:hidden');
});

it('캘린더 상단 기간 표기·오픈 마커는 렌더되지 않는다 (미니멀 정리 회귀 가드)', () => {
  const currentDay = makeDay({ date: '2026-07-13', availableSlotCount: 11 });
  const nextStartDay = makeDay({ date: '2026-07-21', availableSlotCount: 13 });
  render(
    <BookingCalendar
      yearMonth="2026-07"
      daysByIso={new Map([[currentDay.date, currentDay], [nextStartDay.date, nextStartDay]])}
      bookableFrom="2026-07-13"
      bookableUntil="2026-07-31"
      todayIso="2026-07-13"
      selectedDate={null}
      onSelectDate={vi.fn()}
      onOutOfWindowSelect={vi.fn()}
    />,
  );
  expect(screen.queryByText(/예약 가능/)).not.toBeInTheDocument();
  // 구간 시작일 셀도 일반 셀과 동일하게 렌더된다(오픈 마커 없음).
  expect(screen.getByRole('button', { name: '21일 여유, 남은 13칸' })).toBeInTheDocument();
  expect(screen.queryByText('오픈')).not.toBeInTheDocument();
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
    />,
  );
  const outsideCell = screen.getByRole('button', { name: '25일 예약 기간 아님' });
  expect(outsideCell).toHaveAttribute('aria-disabled', 'true');
  // 시각 문구는 제거됨 — 날짜만 남고 비활성 배경으로 구분한다.
  expect(outsideCell).not.toHaveTextContent('기간 외');
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

// 확보 시간 비차단 정보 표시 복원(2026-08-27 스펙 §3) — 설명 접이식 박스는 DaySlotList 내부 <details>.
it('운영행이 있는 날은 기본 확보 시간 안내를 아코디언으로 렌더한다 — 단체·시간은 항상, 긴 설명은 기본 접힘', () => {
  const day = makeDay({
    operatingNotes: [
      { organization: '고정관념', start: '09:00', end: '20:00' },
      { organization: '두잉밴드', start: '10:00', end: '12:00' },
    ],
  });
  const { container } = render(<DaySlotList day={day} selection={null} onToggleSlot={vi.fn()} />);
  // 제목·단체·시간 나열은 summary 로 항상 노출
  expect(screen.getByText('기본 확보 시간')).toBeInTheDocument();
  expect(screen.getByText('고정관념 09:00~20:00 · 두잉밴드 10:00~12:00')).toBeInTheDocument();
  // 긴 정책 설명은 <details> 본문 — 기본 접힘(open 속성 없음), 토글로 펼침. "설명 보기" 라벨이 어포던스.
  const accordion = container.querySelector('details');
  expect(accordion).not.toBeNull();
  expect(accordion).not.toHaveAttribute('open');
  expect(screen.getByText('설명 보기')).toBeInTheDocument();
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

it('운영행이 없는 날은 기본 확보 시간 안내 박스를 렌더하지 않는다(구응답 fail-soft)', () => {
  render(<DaySlotList day={makeDay({ operatingNotes: [] })} selection={null} onToggleSlot={vi.fn()} />);
  expect(screen.queryByText('기본 확보 시간')).not.toBeInTheDocument();
});

it('차단 슬롯 버튼은 비활성이다', () => {
  render(<DaySlotList day={makeDay()} selection={null} onToggleSlot={vi.fn()} />);
  expect(screen.getByRole('button', { name: /17:00~18:00/ })).toBeDisabled();
});

// 신청 마감(2026-09-03): 서버가 빈 슬롯을 DEADLINE_PASSED 로 내린 날 — 점유·대기 슬롯은 상태를 유지한다.
function makeClosedDay(): BookingDayAvailability {
  return makeDay({
    availableSlotCount: 0,
    dayStatus: 'FULL',
    slots: makeDay().slots.map((slot) => (slot.status === 'AVAILABLE' ? { ...slot, status: 'DEADLINE_PASSED' as const } : slot)),
  });
}

it('마감된 날의 슬롯 리스트: 빈 슬롯은 "신청 마감" muted 행으로 비활성이고 점유 슬롯의 단체명은 그대로 보인다', () => {
  render(<DaySlotList day={makeClosedDay()} selection={null} onToggleSlot={vi.fn()} />);
  const closedRow = screen.getByRole('button', { name: /09:00~10:00.*신청 마감/ });
  expect(closedRow).toBeDisabled();
  expect(closedRow).toHaveClass('bg-graysoft/60');
  expect(screen.queryByText('예약 가능')).not.toBeInTheDocument();
  // 점유 정보 보존 — SCHOOL 단체명·INTERNAL 폴백은 마감 표시로 덮이지 않는다.
  expect(screen.getByRole('button', { name: /17:00~18:00.*비호응원단/ })).toBeDisabled();
  expect(screen.getByText('예약됨')).toBeInTheDocument();
  // 날짜 단위 안내 1줄(role=note).
  expect(screen.getByRole('note')).toHaveTextContent('신청이 마감된 날짜예요. 시설 사용일 전날 12:00까지만 신청할 수 있어요.');
});

it('마감된 날의 승인 대기 행은 "승인 대기" 라벨을 유지하되 비활성이라 탭해도 onToggleSlot 을 부르지 않는다', () => {
  const onToggleSlot = vi.fn();
  render(<DaySlotList day={makeClosedDay()} selection={null} onToggleSlot={onToggleSlot} />);
  const pendingRow = screen.getByRole('button', { name: /20:00~21:00.*승인 대기/ });
  expect(pendingRow).toBeDisabled();
  fireEvent.click(pendingRow);
  expect(onToggleSlot).not.toHaveBeenCalled();
});

it('마감이 아닌 날은 안내 note 가 없고 승인 대기 행이 여전히 활성이다(무회귀)', () => {
  render(<DaySlotList day={makeDay()} selection={null} onToggleSlot={vi.fn()} />);
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /20:00~21:00.*승인 대기/ })).toBeEnabled();
});

it('서버 applicationClosed=true 인 날은 빈 슬롯이 없어도(전부 점유·대기) 대기 행이 잠기고 안내 note 가 뜬다 — 잔여 한계 해소', () => {
  const onToggleSlot = vi.fn();
  const fullyOccupiedClosedDay = makeDay({
    availableSlotCount: 0,
    dayStatus: 'FULL',
    applicationClosed: true,
    slots: makeDay().slots.map((slot, index) =>
      slot.status === 'AVAILABLE'
        ? index % 2 === 0
          ? { ...slot, status: 'BLOCKED' as const, blockedBy: 'SCHOOL' as const, organization: '총학생회' }
          : { ...slot, status: 'PENDING_HOLD' as const }
        : slot,
    ),
  });
  render(<DaySlotList day={fullyOccupiedClosedDay} selection={null} onToggleSlot={onToggleSlot} />);
  expect(screen.queryByText('신청 마감')).not.toBeInTheDocument();
  expect(screen.getByRole('note')).toBeInTheDocument();
  const pendingRow = screen.getByRole('button', { name: /10:00~11:00.*승인 대기/ });
  expect(pendingRow).toBeDisabled();
  fireEvent.click(pendingRow);
  expect(onToggleSlot).not.toHaveBeenCalled();
});

it('예약 패널 CTA 는 신청 가능한 슬롯이 없는 날(마감·지난 날)엔 "신청 가능한 시간이 없어요" 로 비활성이다', () => {
  render(
    <BookingPanel
      facility={{ id: 1, roomName: '커뮤니티룸(1)' }}
      day={makeClosedDay()}
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
  expect(screen.getByRole('button', { name: '신청 가능한 시간이 없어요' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: '시간을 선택해주세요' })).not.toBeInTheDocument();
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

it('통합 예약 현황 카드는 날짜 없는 제목 아래 사용 중 행·예약 가능 구간·기간 분포를 순서대로 렌더한다', () => {
  // makeDay(): 확보 고정관념 09~20(operatingNotes) · SCHOOL 비호응원단 17~18 · INTERNAL 18~19 · PENDING 20~21
  const { container } = render(<DayBookingOverview day={makeDay()} />);
  // 제목에 날짜 없음 — 날짜는 상단 캘린더/헤더 담당(중복 금지)
  expect(screen.getByText('예약 현황')).toBeInTheDocument();
  expect(screen.queryByText(/7월 20일/)).not.toBeInTheDocument();
  // 사용 중 행: 기본 확보는 자르지 않은 통짜(09~20) — sage 도트 + 단체명 + muted "(기본 확보)"
  expect(screen.getByText('고정관념')).toBeInTheDocument();
  expect(screen.getByText('(기본 확보)')).toBeInTheDocument();
  const operatingRow = screen.getByText('09:00~20:00').closest('li');
  expect(operatingRow?.querySelector('span[aria-hidden]')).toHaveClass('bg-sage');
  // 예약 건 행: SCHOOL 단체명 / INTERNAL "예약됨" / PENDING warm 도트
  expect(screen.getByText('17:00~18:00')).toBeInTheDocument();
  expect(screen.getByText('비호응원단')).toBeInTheDocument();
  expect(screen.getByText('18:00~19:00')).toBeInTheDocument();
  expect(screen.getByText('예약됨')).toBeInTheDocument();
  const pendingRow = screen.getByText('승인 대기').closest('li');
  expect(pendingRow?.querySelector('span[aria-hidden]')).toHaveClass('bg-warm');
  // 예약 가능 구간: 하루 전체 축 기준(기본 확보 시간 포함) — 09~17(8타임)·19~20(1타임)·21~22(1타임)
  const availableRow = screen.getByText('09:00~17:00').closest('li');
  expect(availableRow).toHaveTextContent('예약 가능');
  expect(availableRow).toHaveTextContent('(8타임)');
  expect(screen.getByText('19:00~20:00')).toBeInTheDocument();
  expect(screen.getByText('21:00~22:00')).toBeInTheDocument();
  // 기간 분포 통합(오전 3/3 · 오후 5/6 · 저녁 2/4) — 확보 창은 차단이 아니라 오전이 온전하다
  expect(screen.getByText('오전')).toBeInTheDocument();
  expect(screen.getByText('3/3')).toBeInTheDocument();
  expect(screen.getByText('5/6')).toBeInTheDocument();
  expect(screen.getByText('2/4')).toBeInTheDocument();
  // 제거된 요약 정보: 선택한 날짜·레벨 뱃지·이용 가능 시간(캘린더 상단·현황 행과 중복)
  expect(screen.queryByText('선택한 날짜')).not.toBeInTheDocument();
  expect(screen.queryByText('여유')).not.toBeInTheDocument();
  expect(screen.queryByText(/이용 가능 시간/)).not.toBeInTheDocument();
  // 금지어(§10.2): "운영 시간"·"운영 중" 부재.
  expect(container).not.toHaveTextContent(/운영 시간/);
  expect(container).not.toHaveTextContent(/운영 중/);
});

it('예약 건이 없으면 기본 확보 통짜 행과 하루 전체 예약 가능 구간(기본 확보 미제외)을 렌더한다', () => {
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
  expect(screen.getByText('09:00~20:00')).toBeInTheDocument();
  expect(screen.getByText('(기본 확보)')).toBeInTheDocument();
  // 예약 가능은 기본 확보를 빼고 계산하지 않는다 — 전체 축 09~22 를 한 구간(13타임)으로
  const availableRow = screen.getByText('09:00~22:00').closest('li');
  expect(availableRow).toHaveTextContent('예약 가능');
  expect(availableRow).toHaveTextContent('(13타임)');
});

it('예약 건도 운영행도 없어도 카드를 렌더한다 — 예약 가능 구간·기간 분포는 항상 표시', () => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const emptyDay = makeDay({
    slots: Array.from({ length: 13 }, (_, index) => ({
      start: `${pad(9 + index)}:00`,
      end: `${pad(10 + index)}:00`,
      status: 'AVAILABLE' as const,
    })),
    operatingNotes: [],
  });
  render(<DayBookingOverview day={emptyDay} />);
  expect(screen.getByText('예약 현황')).toBeInTheDocument();
  const availableRow = screen.getByText('09:00~22:00').closest('li');
  expect(availableRow).toHaveTextContent('(13타임)');
  expect(screen.getByText('오전')).toBeInTheDocument();
});


it('예약 패널(일간 콘텐츠 전용)은 통합 예약 현황 카드·시간 선택 순서로 렌더하고 뷰 토글은 없다', () => {
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
  const overview = screen.getByText('예약 현황'); // DayBookingOverview(통합 카드)
  const slotList = screen.getByRole('list', { name: '시간대 선택' }); // DaySlotList
  // 예약 현황 → 시간 선택 순서(DOCUMENT_POSITION_FOLLOWING = 4)
  expect(overview.compareDocumentPosition(slotList) & 4).toBeTruthy();
  // 모바일(<md) 주간: CTA 바는 BottomNav(60px+safe-area) 위 fixed — 탭바에 가려지던 회귀 방지. 스페이서 동반.
  const ctaBar = screen.getByRole('button', { name: '시간을 선택해주세요' }).closest('div');
  expect(ctaBar).toHaveClass('max-md:fixed');
  expect(ctaBar).toHaveClass('max-md:bottom-[calc(60px_+_env(safe-area-inset-bottom))]');
  // 다크 요약 카드는 통합으로 제거 — "선택한 날짜" 미렌더.
  expect(screen.queryByText('선택한 날짜')).not.toBeInTheDocument();
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
  // 월간 스와치는 모바일=셀과 같은 3단계 게이지 / sm 이상=기존 색 사각형 두 벌이다.
  // 셀에서 텍스트가 사라져도 범례로 단계 의미를 읽을 수 있어야 하고, PC 스와치는 그대로여야 한다.
  const monthSwatches = screen.getAllByTestId('level-gauge');
  expect(monthSwatches.map((swatch) => swatch.dataset.level)).toEqual(['HIGH', 'MID', 'LOW', 'FULL']);
  expect(container.querySelectorAll('.h-2\\.5.hidden.sm\\:block')).toHaveLength(4);

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
  // 주간 범례(가능/예약됨/기본 확보 시간/대기) — 확보 가이드 레이어 = sage 점선 스와치(스펙 §3 복원).
  expect(screen.getByText('가능')).toBeInTheDocument();
  expect(screen.getByText('예약됨')).toBeInTheDocument();
  expect(screen.getByText('기본 확보 시간')).toBeInTheDocument();
  expect(screen.getByText('대기')).toBeInTheDocument();
  // 주간 스와치는 게이지 없이 색 견본만 — 월간 전용 표기가 주간으로 새지 않는다.
  expect(screen.queryAllByTestId('level-gauge')).toHaveLength(0);
  // 금지어(§10.2): 범례에 "운영 중"·"운영 시간" 부재.
  expect(container).not.toHaveTextContent(/운영 중/);
  expect(container).not.toHaveTextContent(/운영 시간/);
});

it('홈 카드는 아이콘·위치·예약 가능 라벨을 렌더하고 영업 종료 후엔 "오늘 마감"을 표시하며 탭 시 onSelect 를 부른다', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-20T23:30:00+09:00')); // KST 23:30 → 영업(09~22) 종료 후
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
  const now = new Date('2026-07-20T09:00:00+09:00'); // KST 09:00 → 09~22 전 구간이 후보
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const todayIso = seoulDateIso(now);
  const otherDayIso = seoulDateIso(new Date('2026-07-21T09:00:00+09:00'));
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

it('주간 그리드: DEADLINE_PASSED 셀은 "신청 마감" aria·"마감" 텍스트로 비활성이고, 점유 블록은 그대로다(2026-09-03)', () => {
  const daysByIso = makeWeekDaysByIso();
  daysByIso.set('2026-07-21', {
    date: '2026-07-21',
    dayStatus: 'AVAILABLE',
    availableSlotCount: 11,
    operatingNotes: [],
    slots: makeWeekSlots({ 3: { status: 'DEADLINE_PASSED' }, 4: { status: 'BLOCKED', blockedBy: 'SCHOOL', organization: '총학생회' } }),
  });
  const { onTapSlot } = renderWeek({ daysByIso });
  const closedCell = screen.getByRole('button', { name: '화요일 21일 12:00 신청 마감' });
  expect(closedCell).toBeDisabled();
  expect(within(closedCell).getByText('마감')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '화요일 21일 13:00~14:00 총학생회 예약됨' })).toBeDisabled();
  // 마감 셀은 선택 가능 셀이 아니다 — 탭해도 onTapSlot 이 불리지 않는다.
  fireEvent.click(closedCell);
  expect(onTapSlot).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '화요일 21일 14:00 가능' })).toBeEnabled();
});

it('주간 그리드: 지난 날짜는 창 밖이어도 빈 셀이 "지난" 이고 점유 블록이 렌더되며 헤더가 열람용으로 활성이다(직전 월 기록 열람)', () => {
  // 오늘=7/22, 창=[7/22..7/24] → 월20·화21 은 지난 날짜(창 밖). 월20 의 10시 BLOCKED 블록이 보여야 한다.
  renderWeek({ todayIso: '2026-07-22', bookableFrom: '2026-07-22', bookableUntil: '2026-07-24' });
  expect(screen.getByRole('button', { name: '월요일 20일 10:00~11:00 예약됨' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '월요일 20일 12:00 지난' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: '월요일 20일 12:00 예약 기간 아님' })).toBeNull();
  expect(screen.getByRole('button', { name: '월요일 20일 · 선택' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '화요일 21일' })).toBeEnabled();
  // 창 이후 미래(토25)는 기존대로 헤더·빈 셀 비활성.
  expect(screen.getByRole('button', { name: '토요일 25일' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '토요일 25일 09:00 예약 기간 아님' })).toBeDisabled();
});

it('주간 그리드: 창 이후 미래 날짜도 점유 블록은 렌더하되 빈 셀은 "예약 기간 아님" 으로 남는다', () => {
  const daysByIso = makeWeekDaysByIso();
  daysByIso.set('2026-07-25', {
    date: '2026-07-25',
    dayStatus: 'AVAILABLE',
    availableSlotCount: 12,
    operatingNotes: [],
    slots: makeWeekSlots({ 2: { status: 'BLOCKED', blockedBy: 'SCHOOL', organization: '총학생회' } }),
  });
  renderWeek({ daysByIso });
  expect(screen.getByRole('button', { name: '토요일 25일 11:00~12:00 총학생회 예약됨' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '토요일 25일 09:00 예약 기간 아님' })).toBeDisabled();
});

it('주간 그리드는 선택일 컬럼을 ink 원형 숫자·(PC) sage tint 프레임으로만 강조하고 "선택" 텍스트는 없다', () => {
  renderWeek();
  // 선택일(월20) 헤더: 숫자 ink 원형 반전(모바일·PC 공통). "· 선택"은 aria-label 전용 — 시각 텍스트 제거.
  const selectedHeader = screen.getByRole('button', { name: '월요일 20일 · 선택' });
  expect(within(selectedHeader).getByText('20')).toHaveClass('bg-ink');
  expect(within(selectedHeader).queryByText(/선택/)).toBeNull();
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
  expect(pendingBlock).toHaveClass('bg-warm/20'); // Amber(warm) 고정색 — /20 대비 보강
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

it('주간 그리드는 좌측 시간 라벨의 PC 표기를 자릿수 고정 HH:00 으로 유지하고, 셀 행 높이를 모바일 압축(h-7)·PC(sm:h-10)로 둔다', () => {
  renderWeek();
  // PC 시간 라벨(HH:00)은 자릿수가 흔들리면 행마다 폭이 달라진다 — 모노 서체를 없앤 뒤로는
  // tabular-nums 가 그 역할을 한다. 모바일은 HH 만 노출하는 별도 span(§9.1).
  const nineLabel = screen.getByText('09:00');
  expect(nineLabel).toHaveClass('tabular-nums');
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
  // PC 도 table-fixed 유지(§격자 균일) — sm:table-auto 로 되돌리면 블록 텍스트 길이에 열 너비가 흔들린다.
  expect(table).toHaveClass('table-fixed');
  expect(table).not.toHaveClass('sm:table-auto');
  expect(table).not.toHaveClass('min-w-[480px]');
  expect(table).toHaveClass('sm:min-w-[480px]'); // PC 최소 폭은 유지(격자 압착 방지)
  // 시간열은 모바일 w-8, PC sm:w-12. 09시는 모바일 'HH' 표기(09)도 노출된다.
  expect(screen.getByText('09')).toBeInTheDocument();
});

it('모바일 압축(§9.2): 확정 블록은 2자 약칭만 노출하고 풀네임·시간은 PC(sm) 전용이다', () => {
  renderBlockWeek();
  const block = screen.getByRole('button', { name: '월요일 20일 13:00~15:00 비호응원단 예약됨' });
  // 모바일 약칭 '비호'(sm:hidden) — 라벨 앞 2자.
  const abbrev = within(block).getByText('비호');
  expect(abbrev).toHaveClass('sm:hidden');
  // PC 상세는 네이티브 hover 툴팁(title) — 블록 내부는 이름·시간 2단계만 유지.
  expect(block).toHaveAttribute('title', '비호응원단 13:00~15:00');
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

// ── 주간 그리드 예약 블록화 + 색상 정책(§8) — 확정·대기 블록 + 확보 구간 점선 셀·파스텔 순환 ─────
// 창=07-20~07-26(모두 창 안·비과거, 오늘=07-20). 월20(선택일): 확보 고정관념 09~11(점선 셀 구간) +
// 비호응원단 13~15(연속 2칸) + 승인 대기 15~16 + 나머지 가능. 화21: 비호응원단 09~11(같은 동아리 다른 날).
// 수22: 트레몰로 09~10 + 확보 고정관념 13:30~15:00(부분 겹침 판정용 반시각 경계).
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
        makeWeekSlots({
          4: school('비호응원단'),
          5: school('비호응원단'),
          6: { status: 'PENDING_HOLD' },
        }),
        [{ organization: '고정관념', start: '09:00', end: '11:00' }],
      ),
    ],
    ['2026-07-21', day('2026-07-21', makeWeekSlots({ 0: school('비호응원단'), 1: school('비호응원단') }))],
    [
      '2026-07-22',
      day('2026-07-22', makeWeekSlots({ 0: school('트레몰로') }), [
        { organization: '고정관념', start: '13:30', end: '15:00' },
      ]),
    ],
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

// 확보 시간 비차단 정보 표시 복원(2026-08-27 스펙 §3): 확보 구간의 AVAILABLE 셀은 점선 가이드 오버레이 —
// 장식일 뿐 선택·신청은 일반 가용 셀과 완전 동일하다(status 단독 판정 무변경).
it('주간 그리드의 기본 확보 시간 가용 셀은 점선 가이드 셀이다 — 블록 아님·단체명 미표기·탭 가능', () => {
  const { onTapSlot } = renderBlockWeek();
  // 확보(고정관념 09~11) 구간의 AVAILABLE 셀 = 점선 가이드 셀. 동작은 일반 가용 셀과 동일(탭 = onTapSlot).
  const operatingCell = screen.getByRole('button', { name: '월요일 20일 09:00 기본 확보 시간 · 예약 신청 가능' });
  expect(operatingCell).toBeEnabled();
  // 가이드 레이어: 색은 일반 가용 셀과 동일(sage), 점선 보더만 차이.
  expect(operatingCell).toHaveClass('bg-sage-mist');
  expect(operatingCell).toHaveClass('border-dashed');
  expect(operatingCell).toHaveClass('border-sage-soft');
  fireEvent.click(operatingCell);
  expect(onTapSlot).toHaveBeenCalledWith('2026-07-20', '09:00');
  // 확보 단체명·"(기본 확보)" 는 그리드에 없다(사이드바 현황 카드·기본 확보 시간 안내 박스가 담당).
  expect(screen.queryByText('고정관념')).toBeNull();
  expect(screen.queryByText('(기본 확보)')).toBeNull();
  // 금지어(§10.2): aria-label 에 "운영 중" 부재.
  expect(screen.queryByRole('button', { name: /운영 중/ })).toBeNull();
  // 확보 구간 밖 가능 셀(12:00)은 sage 유지.
  expect(screen.getByRole('button', { name: '월요일 20일 12:00 가능' })).toHaveClass('bg-sage-mist');
});

it('확보 노트에 완전 포함된 슬롯만 점선 셀이다 — 부분 겹침 슬롯은 일반 가용 셀', () => {
  renderBlockWeek();
  // 수22 노트 13:30~15:00 — 13:00~14:00 슬롯은 부분 겹침(start 13:00 < 13:30)이라 일반 '가능' 셀.
  const partialCell = screen.getByRole('button', { name: '수요일 22일 13:00 가능' });
  expect(partialCell).not.toHaveClass('border-dashed');
  // 14:00~15:00 슬롯은 완전 포함 → 점선 가이드 셀.
  const containedCell = screen.getByRole('button', { name: '수요일 22일 14:00 기본 확보 시간 · 예약 신청 가능' });
  expect(containedCell).toBeEnabled();
  expect(containedCell).toHaveClass('border-dashed');
  // 노트 끝(15:00) 경계 밖(15:00~16:00)은 일반 '가능' 셀.
  expect(screen.getByRole('button', { name: '수요일 22일 15:00 가능' })).toBeInTheDocument();
});

it('기본 확보 시간 점선 셀도 선택되면 ink 배경·✓·aria-pressed=true 로 표기된다', () => {
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
    dateIso: '2026-07-20',
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
  const sheetCta = within(dialog).getByRole('button', { name: '시간을 선택해주세요' });
  expect(sheetCta).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: '시간표로 보기' })).toBeInTheDocument();
  // sticky 푸터가 safe-area 하단 패딩을 자체 보유 — 컨테이너 pb 가 푸터 아래 여백으로 노출되던 회귀 방지.
  expect(sheetCta.closest('div')).toHaveClass('pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]');
  expect(dialog).toHaveClass('pb-0'); // 컨테이너는 pb 0 — 복원되면 푸터 아래 여백 재발.
  // 통합 예약 현황 카드는 시트에 없다(§11.1 — 그 역할은 주간 뷰).
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

it('빠른 예약 시트: 신청 가능한 슬롯이 없는 날은 CTA 가 "신청 가능한 시간이 없어요" 로 비활성이다', () => {
  renderMobileSheet({ day: makeClosedDay() });
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('button', { name: '신청 가능한 시간이 없어요' })).toBeDisabled();
  expect(within(dialog).getByRole('note')).toBeInTheDocument();
});

// ── 신청 확인 Dialog(BookingConfirmDialog) — §2.2 ─────────────────────────────
it('신청 확인 Dialog(§2.2): 시설·일시·동아리·목적·인원·연락처·고정 안내를 렌더하고 취소/신청 콜백을 부른다', () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <BookingConfirmDialog
      open
      facilityName="커뮤니티룸(1)"
      date="2026-07-28" // 화요일
      range={{ start: '14:00', end: '16:00' }}
      clubName="밴드부"
      purpose="정기 합주"
      attendeeCount={undefined}
      contactPhone="010-1234-5678"
      isSubmitting={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  const dialog = screen.getByRole('dialog', { name: '예약을 신청하시겠어요?' });
  expect(within(dialog).getByText('아래 내용을 다시 한번 확인해주세요.')).toBeInTheDocument();
  // 항목: 시설 · 예약 일시(YYYY.MM.DD (요일) + HH:mm ~ HH:mm (N시간)) · 동아리 · 목적 · 연락처
  expect(within(dialog).getByText('커뮤니티룸(1)')).toBeInTheDocument();
  expect(within(dialog).getByText('2026.07.28 (화)')).toBeInTheDocument();
  expect(within(dialog).getByText('14:00 ~ 16:00 (2시간)')).toBeInTheDocument();
  expect(within(dialog).getByText('밴드부')).toBeInTheDocument();
  expect(within(dialog).getByText('정기 합주')).toBeInTheDocument();
  expect(within(dialog).getByText('010-1234-5678')).toBeInTheDocument();
  // 사용 인원 미입력 → "—"
  expect(within(dialog).getByText('—')).toBeInTheDocument();
  // 고정 안내(승인 주체 "관리자"·예상 시간 암시 금지)
  expect(
    within(dialog).getByText('예약 신청 후 관리자 승인과 학교 반영 절차를 거쳐 최종 예약이 확정됩니다.'),
  ).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  fireEvent.click(within(dialog).getByRole('button', { name: '예약 신청' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it('신청 확인 Dialog(§2.2): 사용 인원이 있으면 "N명" 을 노출하고 제출 중이면 신청 버튼이 비활성된다', () => {
  render(
    <BookingConfirmDialog
      open
      facilityName="커뮤니티룸(1)"
      date="2026-07-28"
      range={{ start: '18:00', end: '20:00' }}
      clubName="밴드부"
      purpose="정기 합주"
      attendeeCount={15}
      contactPhone="01012345678"
      isSubmitting
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  const dialog = screen.getByRole('dialog', { name: '예약을 신청하시겠어요?' });
  expect(within(dialog).getByText('15명')).toBeInTheDocument();
  // 제출 중: 신청 버튼 비활성 — 라벨은 유지하고 ButtonSpinner 만 붙는다(중복 제출 방지 + 폭 고정)
  const submitButton = within(dialog).getByRole('button', { name: '예약 신청' });
  expect(submitButton).toBeDisabled();
});

it('신청 확인 Dialog(§2.2): open=false 면 다이얼로그를 열지 않는다', () => {
  render(
    <BookingConfirmDialog
      open={false}
      facilityName="커뮤니티룸(1)"
      date="2026-07-28"
      range={{ start: '18:00', end: '20:00' }}
      clubName="밴드부"
      purpose="정기 합주"
      contactPhone="010-1234-5678"
      isSubmitting={false}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
