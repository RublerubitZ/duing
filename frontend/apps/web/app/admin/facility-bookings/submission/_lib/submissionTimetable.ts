import type { SubmissionCandidateBooking } from '@duing/types';

// 09:00~22:00 — 칸 i = [9+i시, 10+i시). facilitybooking 도메인 슬롯 규칙과 동일 축.
export const SUBMISSION_HOURS = Array.from({ length: 13 }, (_, index) => 9 + index);

export type SubmissionPlanBlock = {
  type: 'block';
  booking: SubmissionCandidateBooking;
  colSpan: number;
};
export type SubmissionPlanEntry = SubmissionPlanBlock | { type: 'empty' } | { type: 'covered' };

export type SubmissionTimetableRow = {
  dateIso: string;
  entries: SubmissionPlanEntry[];
};

const hourIndexOf = (time: string) => Number(time.slice(0, 2)) - 9;

/**
 * 세로=날짜 · 가로=시간 시간표의 행 렌더 계획(스펙 §7) — WeekTimetable 의 rowSpan 병합 계획을 colSpan 으로 전치.
 * 예약이 있는 날짜만 행이 되고, 겹치는 뒤 블록(PENDING vs APPROVED 공존 가능)은 남은 빈 구간에 축소 배치한다
 * — 완전히 덮이면 시간표에선 생략되지만 목록 뷰가 전 건을 보여주므로 정보 손실은 없다.
 */
export function buildSubmissionRows(bookings: SubmissionCandidateBooking[]): SubmissionTimetableRow[] {
  const byDate = new Map<string, SubmissionCandidateBooking[]>();
  for (const booking of bookings) {
    const dayBookings = byDate.get(booking.reservationDate) ?? [];
    dayBookings.push(booking);
    byDate.set(booking.reservationDate, dayBookings);
  }
  return [...byDate.entries()]
    .sort(([leftIso], [rightIso]) => leftIso.localeCompare(rightIso))
    .map(([dateIso, dayBookings]) => ({ dateIso, entries: buildRowEntries(dayBookings) }));
}

function buildRowEntries(dayBookings: SubmissionCandidateBooking[]): SubmissionPlanEntry[] {
  const entries = new Array<SubmissionPlanEntry | undefined>(SUBMISSION_HOURS.length).fill(undefined);
  const ordered = [...dayBookings].sort(
    (left, right) => left.startTime.localeCompare(right.startTime) || left.bookingId - right.bookingId,
  );
  for (const booking of ordered) {
    const start = Math.max(0, hourIndexOf(booking.startTime));
    const end = Math.min(SUBMISSION_HOURS.length, hourIndexOf(booking.endTime));
    // 선점된 칸을 피해 첫 빈 칸부터 다음 점유 칸 직전까지 축소 배치.
    let placeStart = start;
    while (placeStart < end && entries[placeStart] !== undefined) placeStart += 1;
    if (placeStart >= end) continue;
    let placeEnd = placeStart;
    while (placeEnd < end && entries[placeEnd] === undefined) placeEnd += 1;
    entries[placeStart] = { type: 'block', booking, colSpan: placeEnd - placeStart };
    for (let index = placeStart + 1; index < placeEnd; index += 1) entries[index] = { type: 'covered' };
  }
  return SUBMISSION_HOURS.map((_, index) => entries[index] ?? { type: 'empty' });
}

// 상태 라벨의 단일 출처 — SubmissionDetailSheet(dl 상태 행)·SubmissionTimetable(블록 aria-label) 공유.
export const SUBMISSION_STATUS_LABELS: Record<SubmissionCandidateBooking['status'], string> = {
  PENDING: '승인 대기',
  APPROVED: '승인 완료',
  CONFIRMED: '학교 등록 완료',
  CONFLICT: '충돌',
  CANCELLED: '취소됨',
};

type BlockVisual = {
  container: string;
  nameClass: string;
  badge: string | null;
};

/** 상태 색 맵의 단일 출처(스펙 §7) — 시간표 블록·목록 상태 배지가 공유한다. */
export function submissionBlockVisual(booking: SubmissionCandidateBooking): BlockVisual {
  if (booking.status === 'CANCELLED') {
    return { container: 'border-coral/40 bg-coral/10 opacity-70', nameClass: 'text-coral line-through', badge: null };
  }
  if (booking.status === 'CONFLICT') {
    return { container: 'border-warm/60 bg-warm/20', nameClass: 'text-[#8E6620]', badge: '충돌' };
  }
  if (booking.status === 'CONFIRMED') {
    return { container: 'border-sage bg-sage/30', nameClass: 'text-ink-deep', badge: '등록완료' };
  }
  if (booking.submitted) {
    return { container: 'border-sage-soft bg-sage-mist', nameClass: 'text-ink-deep', badge: null };
  }
  if (booking.selectable) {
    return { container: 'border-ink bg-paper hover:bg-sage-mist', nameClass: 'text-ink-deep', badge: null };
  }
  // PENDING(승인 대기) — 회색.
  return { container: 'border-line bg-graysoft/60', nameClass: 'text-charcoal-3', badge: null };
}
