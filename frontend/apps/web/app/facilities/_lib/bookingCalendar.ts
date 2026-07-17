// 예약 홈의 순수 계산 — 시각/날짜 문자열('HH:mm'·'yyyy-MM-dd')은 사전순 비교가 시간순과 일치한다.
// Date 파싱은 로컬 필드 생성만 사용한다(new Date('yyyy-MM-dd') 는 UTC 자정 함정).
import type { BookingAvailabilitySlot, BookingOperatingNote } from '@duing/types';

export type CalendarCell = { iso: string; day: number; inMonth: boolean };
export type SlotRange = { start: string; end: string };

const pad2 = (value: number) => String(value).padStart(2, '0');

const toIso = (year: number, monthIndex: number, day: number) =>
  `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** 6×7(월요일 시작 — 주간 타임라인과 일관) 월 그리드 — calendar 페이지 buildMonth 전례 이식. */
export function buildMonthCells(yearMonth: string): CalendarCell[] {
  const [year, month] = yearMonth.split('-').map(Number);
  const monthIndex = (month ?? 1) - 1;
  const startCol = (new Date(year ?? 1970, monthIndex, 1).getDay() + 6) % 7; // 월=0 … 일=6
  const daysInMonth = new Date(year ?? 1970, monthIndex + 1, 0).getDate();
  const prevDays = new Date(year ?? 1970, monthIndex, 0).getDate();
  const cells: CalendarCell[] = [];
  for (let index = 0; index < 42; index += 1) {
    const offset = index - startCol;
    let day: number;
    let cellMonth = monthIndex;
    let cellYear = year ?? 1970;
    let inMonth = true;
    if (offset < 0) {
      day = prevDays + offset + 1;
      cellMonth = monthIndex - 1;
      inMonth = false;
    } else if (offset >= daysInMonth) {
      day = offset - daysInMonth + 1;
      cellMonth = monthIndex + 1;
      inMonth = false;
    } else {
      day = offset + 1;
    }
    if (cellMonth < 0) {
      cellMonth = 11;
      cellYear -= 1;
    }
    if (cellMonth > 11) {
      cellMonth = 0;
      cellYear += 1;
    }
    cells.push({ iso: toIso(cellYear, cellMonth, day), day, inMonth });
  }
  return cells;
}

export function isWithinBookable(iso: string, bookableFrom: string, bookableUntil: string): boolean {
  return iso >= bookableFrom && iso <= bookableUntil;
}

export function isSelectableSlot(slot: BookingAvailabilitySlot): boolean {
  return slot.status === 'AVAILABLE' || slot.status === 'PENDING_HOLD';
}

export function slotInRange(slot: BookingAvailabilitySlot, range: SlotRange): boolean {
  return slot.start >= range.start && slot.end <= range.end;
}

/**
 * 연속 슬롯 선택(§9.4): 첫 탭=단일, 둘째 탭=사이 전부 선택 가능이면 범위 확장, 아니면 재시작,
 * 선택 범위 내부 슬롯 재탭=그 슬롯부터 끝까지 해제(첫 슬롯이면 전체 해제). 선택 불가 슬롯 탭은 무시.
 */
export function toggleSlotSelection(
  current: SlotRange | null,
  tapped: BookingAvailabilitySlot,
  slots: BookingAvailabilitySlot[],
): SlotRange | null {
  if (!isSelectableSlot(tapped)) {
    return current;
  }
  const single: SlotRange = { start: tapped.start, end: tapped.end };
  if (!current) {
    return single;
  }
  if (slotInRange(tapped, current)) {
    // 선택된 슬롯 재탭 = 그 슬롯부터 끝까지 해제(첫 슬롯이면 전체 해제) — 연속 범위 계약 유지
    return tapped.start === current.start ? null : { start: current.start, end: tapped.start };
  }
  const start = current.start < single.start ? current.start : single.start;
  const end = current.end > single.end ? current.end : single.end;
  const span = slots.filter((candidate) => slotInRange(candidate, { start, end }));
  const hourCount = Number(end.slice(0, 2)) - Number(start.slice(0, 2));
  if (span.length === hourCount && span.every(isSelectableSlot)) {
    return { start, end };
  }
  return single;
}

export function rangeContainsPendingHold(
  slots: BookingAvailabilitySlot[],
  range: SlotRange,
): boolean {
  return slots.some((slot) => slotInRange(slot, range) && slot.status === 'PENDING_HOLD');
}

export function rangeLabel(range: SlotRange): string {
  return `${range.start}~${range.end}`;
}

/** ISO 날짜(yyyy-MM-dd)에 일수를 더한 ISO. 월·연 경계 안전(로컬 파싱 — UTC 자정 함정 회피). */
export function shiftDateByDays(iso: string, deltaDays: number): string {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + deltaDays);
  return toIso(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * 주 시작(월요일 ISO)을 "M월 D일 – D일" 로 표기한다(§2). 주 끝(=월+6)이 다음 달이면
 * 끝 날짜 앞에 월을 함께 표기한다: "7월 28일 – 8월 3일". 입력은 그 주의 월요일 ISO.
 */
export function weekRangeLabel(mondayIso: string): string {
  const monday = parseIsoDate(mondayIso);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const startMonth = monday.getMonth() + 1;
  const startDay = monday.getDate();
  const endMonth = sunday.getMonth() + 1;
  const endDay = sunday.getDate();
  if (startMonth === endMonth) {
    return `${startMonth}월 ${startDay}일 – ${endDay}일`;
  }
  return `${startMonth}월 ${startDay}일 – ${endMonth}월 ${endDay}일`;
}

/** 선택일이 속한 주(월~일) 7일 — 월 경계를 넘을 수 있다(범위 밖 날짜는 호출부가 데이터 없음 처리). */
export function weekDatesOf(iso: string): string[] {
  const base = parseIsoDate(iso);
  const dayOfWeek = base.getDay();
  const mondayOffset = (dayOfWeek + 6) % 7; // 일=0→6, 월=1→0, … 토=6→5
  const monday = new Date(base);
  monday.setDate(base.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + offset);
    return toIso(date.getFullYear(), date.getMonth(), date.getDate());
  });
}

// ── 예약 홈 히트맵·패널 요약 파생(§2.2) — 하루 13칸(09~22시) 기준 ─────────────

export type DayLevel = 'HIGH' | 'MID' | 'LOW' | 'FULL';

export const TOTAL_SLOTS = 13;

export function dayLevelOf(availableSlotCount: number): DayLevel {
  const ratio = availableSlotCount / TOTAL_SLOTS;
  if (ratio >= 0.6) return 'HIGH';
  if (ratio >= 0.3) return 'MID';
  if (availableSlotCount > 0) return 'LOW';
  return 'FULL';
}

export const DAY_LEVEL_META: Record<DayLevel, { label: string; barClass: string; textClass: string }> = {
  HIGH: { label: '여유', barClass: 'bg-sage', textClass: 'text-ink' },
  MID: { label: '보통', barClass: 'bg-warm', textClass: 'text-[#8E6620]' },
  LOW: { label: '혼잡', barClass: 'bg-coral', textClass: 'text-coral' },
  FULL: { label: '마감', barClass: 'bg-line', textClass: 'text-charcoal-3' },
};

export type PeriodDistribution = {
  key: 'MORNING' | 'AFTERNOON' | 'EVENING';
  label: string;
  range: string;
  free: number;
  total: number;
};

export function periodDistribution(slots: BookingAvailabilitySlot[]): PeriodDistribution[] {
  const periods: { key: PeriodDistribution['key']; label: string; range: string; fromHour: number; toHour: number }[] = [
    { key: 'MORNING', label: '오전', range: '09–12', fromHour: 9, toHour: 12 },
    { key: 'AFTERNOON', label: '오후', range: '12–18', fromHour: 12, toHour: 18 },
    { key: 'EVENING', label: '저녁', range: '18–22', fromHour: 18, toHour: 22 },
  ];
  return periods.map(({ key, label, range, fromHour, toHour }) => {
    const inPeriod = slots.filter((slot) => {
      const hour = Number(slot.start.slice(0, 2));
      return fromHour <= hour && hour < toHour;
    });
    return {
      key, label, range,
      free: inPeriod.filter((slot) => slot.status === 'AVAILABLE').length,
      total: inPeriod.length,
    };
  });
}

export type SlotStatusCounts = { available: number; pendingHold: number; blocked: number; past: number };

export function slotStatusCounts(slots: BookingAvailabilitySlot[]): SlotStatusCounts {
  const counts: SlotStatusCounts = { available: 0, pendingHold: 0, blocked: 0, past: 0 };
  for (const slot of slots) {
    switch (slot.status) {
      case 'AVAILABLE': counts.available += 1; break;
      case 'PENDING_HOLD': counts.pendingHold += 1; break;
      case 'BLOCKED': counts.blocked += 1; break;
      case 'PAST': counts.past += 1; break;
      default: {
        // 새 상태가 유니온에 추가되면 여기서 컴파일 에러 — "지난 시간" 오분류(암묵 폴백) 방지
        const unhandledStatus: never = slot.status;
        void unhandledStatus;
      }
    }
  }
  return counts;
}

// ── 예약 건별 현황 파생(§4‴.2) — BLOCKED·PENDING_HOLD 만 건 단위로 추출·병합 ─────

export type DayBookingEntryKind = 'SCHOOL' | 'INTERNAL' | 'PENDING';
export type DayBookingEntry = { start: string; end: string; label: string; kind: DayBookingEntryKind };

// 슬롯 → 예약 건(라벨·종류). AVAILABLE·PAST 는 현황 카드에 포함하지 않으므로 null.
function bookingEntryOf(slot: BookingAvailabilitySlot): Pick<DayBookingEntry, 'label' | 'kind'> | null {
  if (slot.status === 'BLOCKED') {
    // organization 이 오면 소스(SCHOOL/INTERNAL) 무관 동아리명 노출(§4⁗.1 정책 반전), 없으면 "예약됨"
    // 폴백 — 구 백엔드 응답에서도 동작(fail-open). kind 는 소스 구분을 그대로 유지한다.
    const kind: DayBookingEntryKind = slot.blockedBy === 'SCHOOL' && slot.organization ? 'SCHOOL' : 'INTERNAL';
    // ||: 빈 문자열 organization(계약상 퇴화 입력)도 폴백 — kind 판정(truthy)과 기준 일치
    return { label: slot.organization || '예약됨', kind };
  }
  if (slot.status === 'PENDING_HOLD') {
    return { label: '승인 대기', kind: 'PENDING' };
  }
  return null;
}

/**
 * 예약 건별 현황(§4‴.2): BLOCKED·PENDING_HOLD 슬롯만 건으로 추출하고, 인접(prev.end == next.start)하며
 * 같은 종류·같은 표기면 한 건으로 병합한다(시간순). AVAILABLE·PAST 는 제외한다.
 */
export function dayBookingEntries(slots: BookingAvailabilitySlot[]): DayBookingEntry[] {
  const entries: DayBookingEntry[] = [];
  for (const slot of slots) {
    const derived = bookingEntryOf(slot);
    if (!derived) continue;
    const last = entries[entries.length - 1];
    if (last && last.end === slot.start && last.kind === derived.kind && last.label === derived.label) {
      last.end = slot.end; // 인접·동종·동표기 → 앞 건에 흡수
      continue;
    }
    entries.push({ start: slot.start, end: slot.end, label: derived.label, kind: derived.kind });
  }
  return entries;
}

// ── 운영행 분할 타임라인 파생(§5.1) — 예약 건이 차지한 구간을 운영행에서 잘라 조각으로 ─────

export type DayOverviewTimelineKind = DayBookingEntryKind | 'OPERATING';
export type DayOverviewTimelineItem = { start: string; end: string; label: string; kind: DayOverviewTimelineKind };

/**
 * 현황 카드 타임라인(§5.1): 운영 노트(BookingOperatingNote)를 예약 건(BLOCKED·PENDING 병합)으로 시간순
 * 절단해 앞/뒤 운영 조각을 만들고, 예약 건과 함께 시작 시각순으로 합친다. 운영 조각은 예약 가능 구간이다.
 *
 * - 노트별 커서 절단: 커서=노트 시작 → 겹치는 예약 건마다 `[커서, 예약.start)` 조각 후 커서=max(커서, 예약.end)
 *   → 마지막에 `[커서, 노트 끝)` 조각. 겹침 판정 `예약.start < 노트.end && 예약.end > 노트.start`.
 * - 예약이 노트 경계와 정확히 일치하면 해당 방향 조각은 만들지 않는다(`커서 < 조각 끝` 가드로 빈 구간 금지).
 * - 노트가 여러 개면 각각 독립 분할하고, 정렬은 시작 시각순(동률이면 예약 건을 운영 조각보다 앞에 둔다).
 */
export function dayOverviewTimeline(
  slots: BookingAvailabilitySlot[],
  operatingNotes: BookingOperatingNote[],
): DayOverviewTimelineItem[] {
  const bookings = dayBookingEntries(slots);
  const timeline: DayOverviewTimelineItem[] = [...bookings];
  for (const note of operatingNotes) {
    const overlapping = bookings.filter((booking) => booking.start < note.end && booking.end > note.start);
    let cursor = note.start;
    for (const booking of overlapping) {
      if (cursor < booking.start) {
        timeline.push({ start: cursor, end: booking.start, label: note.organization, kind: 'OPERATING' });
      }
      if (booking.end > cursor) cursor = booking.end;
    }
    if (cursor < note.end) {
      timeline.push({ start: cursor, end: note.end, label: note.organization, kind: 'OPERATING' });
    }
  }
  return timeline.sort((left, right) => {
    if (left.start !== right.start) return left.start < right.start ? -1 : 1;
    // 시작 동률은 예약 건을 먼저(§5.1) — 운영 조각(OPERATING)을 뒤로 민다.
    // 예약 vs 조각 동률은 구조적으로 불가(조각 시작점의 예약은 노트와 겹쳐 커서에 흡수됨);
    // 실제 동률은 서로 겹치는 노트 2개의 조각끼리뿐이며 stable sort 로 노트 입력순이 유지된다.
    const leftOperating = left.kind === 'OPERATING' ? 1 : 0;
    const rightOperating = right.kind === 'OPERATING' ? 1 : 0;
    return leftOperating - rightOperating;
  });
}
