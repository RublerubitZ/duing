// Asia/Seoul 기준 오늘 날짜(YYYY-MM-DD).
export function seoulDateIso(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const read = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

// YYYY-MM 의 일수.
export function daysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(year ?? 1970, month ?? 1, 0).getDate();
}

// 'YYYY-MM' → 0000년 1월 기준 연속 개월 인덱스(월 이동·경계 계산용 내부 헬퍼).
function yearMonthIndex(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  return (year ?? 0) * 12 + ((month ?? 1) - 1);
}

// 두 'YYYY-MM' 사이 개월 차(to - from). 예: ('2026-07', '2026-08') → 1, ('2026-07', '2025-07') → -12.
export function monthDiff(fromYearMonth: string, toYearMonth: string): number {
  return yearMonthIndex(toYearMonth) - yearMonthIndex(fromYearMonth);
}

// 'YYYY-MM' 에 개월을 더한 'YYYY-MM'. 연 경계·음수 delta 모두 안전.
export function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  const index = yearMonthIndex(yearMonth) + deltaMonths;
  const year = Math.floor(index / 12);
  const month = ((index % 12) + 12) % 12 + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

// 'YYYY-MM' → 'YYYY년 M월' 표시 라벨.
export function yearMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  return `${year}년 ${month}월`;
}

// lastUpdatedAt(+09:00 ISO)를 'YYYY-MM-DD HH:mm'(KST)로 표시. 콜드/미수집(null) 은 빈 문자열.
export function formatLastUpdated(iso: string | null): string {
  if (!iso) return ''; // null/빈 값: new Date(null)=epoch(0) 은 NaN 이 아니라 1970 이 되므로 먼저 차단
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const read = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')} ${read('hour')}:${read('minute')}`;
}
