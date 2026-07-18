// 예약 홈의 순수 계산 — 시각/날짜 문자열('HH:mm'·'yyyy-MM-dd')은 사전순 비교가 시간순과 일치한다.
// Date 파싱은 로컬 필드 생성만 사용한다(new Date('yyyy-MM-dd') 는 UTC 자정 함정).
import type { BookingAvailabilitySlot, BookingOperatingNote } from '@duing/types';
import { seoulDateIso, seoulTimeHHmm } from './facilityTimeline';

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
 * 신청 마감 사전 판정 — 사용일 전날 12:01(KST)부터 마감(서버 BookingDeadlinePolicy 와 동일 경계, 분 단위).
 * 표시용 힌트 전용: 최종 판단은 서버(FACILITY_BOOKING_DEADLINE_PASSED)가 한다 — 클라 시계를 신뢰하지 않는다.
 */
export function isApplicationDeadlinePassed(dateIso: string, now: Date): boolean {
  const deadlineDateIso = shiftDateByDays(dateIso, -1);
  const seoulTodayIso = seoulDateIso(now);
  if (seoulTodayIso !== deadlineDateIso) return seoulTodayIso > deadlineDateIso;
  return seoulTimeHHmm(now) > '12:00';
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

/**
 * 표시 주(월~일)에 포함된 서로 다른 월(yyyy-MM) 목록(§12.1) — 월 경계를 넘으면 2개, 아니면 1개를 오름차순으로.
 * weekDatesOf 가 오름차순이라 등장 순서 그대로가 오름차순이다(연 경계도 안전 — 월 문자열 사전순).
 */
export function weekMonthsOf(iso: string): string[] {
  const months: string[] = [];
  for (const date of weekDatesOf(iso)) {
    const month = date.slice(0, 7);
    if (!months.includes(month)) months.push(month);
  }
  return months;
}

/**
 * 주간 이월(§12.1) 시 함께 조회할 두 번째 월을 파생한다. 표시 주가 두 달에 걸치면 조회 월(queryMonth)이 아닌
 * 다른 월을 반환하되, 그 월이 허용 범위(당월·익월)일 때만 반환한다 — availability API 는 당월·익월만 허용하므로,
 * 밖이면 조회하지 않는다(그 날짜들은 창⊆당월∪익월 불변식상 어차피 창 밖 → 비활성이 정답, 400 방지).
 * 이월이 아니거나(한 달 주) 다른 월이 범위 밖이면 undefined.
 */
export function adjacentMonthToFetch(
  selectedDate: string,
  queryMonth: string,
  allowedMonths: readonly string[],
): string | undefined {
  const otherMonth = weekMonthsOf(selectedDate).find((month) => month !== queryMonth);
  if (otherMonth === undefined) return undefined;
  return allowedMonths.includes(otherMonth) ? otherMonth : undefined;
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

// ── 통합 예약 현황 파생 — 사용 중 행(기본 확보·예약 건)과 예약 가능 구간을 계층으로 표시 ─────

export type DayUsageEntry = { start: string; end: string; label: string; kind: DayBookingEntryKind | 'OPERATING' };

/**
 * 사용 중 행: 운영 노트(기본 확보)는 자르지 않고 통짜 그대로, 예약 건(BLOCKED·PENDING 병합)과 함께
 * 시작 시각순으로 합친다(동률이면 기본 확보를 앞에 — 담는 창을 먼저 읽는다). 구간 겹침은 허용 —
 * 카드가 "기본 확보 창 안의 예약"이라는 계층으로 읽히는 구조라 절단하지 않는다.
 */
export function dayUsageEntries(
  slots: BookingAvailabilitySlot[],
  operatingNotes: BookingOperatingNote[],
): DayUsageEntry[] {
  const noteEntries: DayUsageEntry[] = operatingNotes.map((note) => ({
    start: note.start,
    end: note.end,
    label: note.organization,
    kind: 'OPERATING',
  }));
  return [...noteEntries, ...dayBookingEntries(slots)].sort((left, right) => {
    if (left.start !== right.start) return left.start < right.start ? -1 : 1;
    return (left.kind === 'OPERATING' ? 0 : 1) - (right.kind === 'OPERATING' ? 0 : 1);
  });
}

export type AvailableRun = { start: string; end: string; slotCount: number };

/**
 * 예약 가능 구간: 하루 전체 시간축 기준으로 AVAILABLE 슬롯을 인접 병합한다 — 기본 확보(운영 노트)
 * 여부와 무관하다(기본 확보 시간도 예약 가능 시간이다). BLOCKED·PENDING_HOLD·PAST 는 구간을 끊는다.
 */
export function availableRuns(slots: BookingAvailabilitySlot[]): AvailableRun[] {
  const runs: AvailableRun[] = [];
  for (const slot of slots) {
    if (slot.status !== 'AVAILABLE') continue;
    const previousRun = runs[runs.length - 1];
    if (previousRun && previousRun.end === slot.start) {
      previousRun.end = slot.end; // 인접 AVAILABLE → 앞 구간에 흡수
      previousRun.slotCount += 1;
    } else {
      runs.push({ start: slot.start, end: slot.end, slotCount: 1 });
    }
  }
  return runs;
}

// ── 확정 예약 블록 파스텔 배정(§8.3) — 주간 화면 라벨 첫 등장 순 팔레트 인덱스 순환 ─────

/** 파스텔 팔레트 색상 수(§8.3): mint·lemon·coral·lavender·beige·rose 6색. */
export const PASTEL_PALETTE_SIZE = 6;

/**
 * 확정(BLOCKED) 블록 라벨(동아리명)을 현재 주간 화면의 첫 등장 순서로 파스텔 팔레트 인덱스에 순환 배정한다(§8.3).
 * 같은 라벨은 화면 내내 같은 인덱스(한 동아리가 한 화면에서 두 색이 되는 혼란 방지), 7번째 라벨부터 0 으로 재순환.
 * 순수 함수 — 입력은 등장 순서대로 나열된 라벨 목록(중복 포함), 출력은 라벨→인덱스 맵.
 */
export function pastelIndexByLabel(labels: string[]): Map<string, number> {
  const indexByLabel = new Map<string, number>();
  for (const label of labels) {
    if (!indexByLabel.has(label)) {
      indexByLabel.set(label, indexByLabel.size % PASTEL_PALETTE_SIZE);
    }
  }
  return indexByLabel;
}
