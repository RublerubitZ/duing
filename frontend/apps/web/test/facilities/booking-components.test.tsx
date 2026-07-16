import { render, screen, fireEvent, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { BookingDayAvailability, FacilityItem } from '@duing/types';
import { FacilityContextBar } from '@/app/facilities/_components/booking/FacilityContextBar';
import { BookingCalendar } from '@/app/facilities/_components/booking/BookingCalendar';
import { DaySlotList } from '@/app/facilities/_components/booking/DaySlotList';
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
      onPrevMonth={vi.fn()}
      onNextMonth={vi.fn()}
      canPrev={false}
      canNext
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
      onPrevMonth={vi.fn()}
      onNextMonth={vi.fn()}
      canPrev={false}
      canNext
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
      onPrevMonth={vi.fn()}
      onNextMonth={vi.fn()}
      canPrev={false}
      canNext
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
      onPrevMonth={vi.fn()}
      onNextMonth={vi.fn()}
      canPrev={false}
      canNext
    />,
  );
  const outsideCell = screen.getByRole('button', { name: '25일 예약 기간 아님' });
  expect(outsideCell).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(outsideCell);
  expect(onOutOfWindowSelect).toHaveBeenCalledWith('2026-07-25');
  expect(onSelectDate).not.toHaveBeenCalled();
});

it('슬롯 행은 By 중심 세로 스택으로 시간→주 정보→SCHOOL 배지를 렌더한다', () => {
  render(<DaySlotList day={makeDay()} selection={null} onToggleSlot={vi.fn()} />);

  // (d) AVAILABLE 행: 시간이 별도 행(font-mono), 주 정보 "예약 가능"(text-sm font-bold), 행 배경 sage-mist 유지
  const availableRow = screen.getByRole('button', { name: /09:00~10:00.*예약 가능/ });
  expect(availableRow).toHaveClass('bg-sage-mist');
  expect(within(availableRow).getByText('09:00~10:00')).toHaveClass('font-mono');
  expect(within(availableRow).getByText('예약 가능')).toHaveClass('text-sm', 'font-bold');

  // (a) SCHOOL 행(17:00~18:00): 단체명이 주 정보(text-sm font-bold) + "예약됨" pill 배지 존재
  const schoolRow = screen.getByRole('button', { name: /17:00~18:00/ });
  expect(within(schoolRow).getByText('비호응원단')).toHaveClass('text-sm', 'font-bold');
  expect(within(schoolRow).getByText('예약됨')).toHaveClass('rounded-full');

  // (b) INTERNAL 행(18:00~19:00): 주 정보 "예약됨", 배지 없음(중복 금지) → "예약됨" 은 딱 하나
  const internalRow = screen.getByRole('button', { name: /18:00~19:00/ });
  expect(within(internalRow).getByText('예약됨')).toHaveClass('text-sm', 'font-bold');
  expect(within(internalRow).getAllByText('예약됨')).toHaveLength(1);

  // (c) PENDING_HOLD 행(20:00~21:00): 주 정보 "승인 대기", 배지 없음
  const pendingRow = screen.getByRole('button', { name: /20:00~21:00/ });
  expect(within(pendingRow).getByText('승인 대기')).toHaveClass('text-sm', 'font-bold');
  expect(within(pendingRow).queryByText('예약됨')).not.toBeInTheDocument();

  // 구 라벨은 사라진다 + 운영 안내 박스는 유지
  expect(screen.queryByText('승인 대기중')).not.toBeInTheDocument();
  expect(screen.queryByText('신청 가능')).not.toBeInTheDocument();
  expect(screen.getByText(/고정관념 09:00~20:00/)).toBeInTheDocument();
});

it('승인 대기 슬롯은 여전히 클릭 가능하고, 선택 행은 ink 배경·✓·aria-label 순서로 표기된다', () => {
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
  // (e) aria-label 은 "HH:MM~HH:MM 주정보" 순(SR 정보 순서) — ✓·배지는 라벨에 미포함
  expect(selectedRow).toHaveAttribute('aria-label', '09:00~10:00 예약 가능');
});

it('운영행이 있는 날은 운영 시간 안내 박스에 단체·시간 나열과 고정 정책 문구를 렌더한다', () => {
  const day = makeDay({
    operatingNotes: [
      { organization: '고정관념', start: '09:00', end: '20:00' },
      { organization: '두잉밴드', start: '10:00', end: '12:00' },
    ],
  });
  render(<DaySlotList day={day} selection={null} onToggleSlot={vi.fn()} />);
  expect(screen.getByText('운영 시간 안내')).toBeInTheDocument();
  expect(screen.getByText('고정관념 09:00~20:00 · 두잉밴드 10:00~12:00')).toBeInTheDocument();
  expect(
    screen.getByText(
      '시간 범위가 함께 표시된 일정은 운영상 확보된 시간 안내예요. 이 시간에도 예약을 신청할 수 있고, 관리자 승인 후 학교 반영 절차를 거쳐 확정돼요.',
    ),
  ).toBeInTheDocument();
  // 승인 주체는 "관리자"로 통일 — "총동연" 비노출 정책
  expect(screen.queryByText(/총동연/)).not.toBeInTheDocument();
});

it('운영행이 없는 날은 운영 시간 안내 박스를 렌더하지 않는다', () => {
  render(<DaySlotList day={makeDay({ operatingNotes: [] })} selection={null} onToggleSlot={vi.fn()} />);
  expect(screen.queryByText('운영 시간 안내')).not.toBeInTheDocument();
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

it('패널 요약 카드는 상태별 집계 행과 슬롯 파생 운영 시간을 노출하고 0건 상태는 숨긴다', () => {
  // makeDay(): AVAILABLE 10 · PENDING_HOLD 1 · BLOCKED 2 · PAST 0
  render(<PanelSummaryCard day={makeDay()} />);
  expect(screen.getByText('예약 가능')).toBeInTheDocument();
  expect(screen.getByText('10칸')).toBeInTheDocument();
  expect(screen.getByText('승인 대기')).toBeInTheDocument();
  expect(screen.getByText('1칸')).toBeInTheDocument();
  expect(screen.getByText('예약됨')).toBeInTheDocument();
  expect(screen.getByText('2칸')).toBeInTheDocument();
  // 0건인 지난 시간은 렌더하지 않는다
  expect(screen.queryByText('지난 시간')).not.toBeInTheDocument();
  // 운영 시간은 슬롯[0].start~슬롯[마지막].end 파생(FE 상수 하드코딩 금지)
  expect(screen.getByText('운영 시간 09:00~22:00 · 13칸')).toBeInTheDocument();
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
