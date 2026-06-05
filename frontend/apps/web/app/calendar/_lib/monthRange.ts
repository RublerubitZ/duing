// yearMonth: "YYYY-MM" → { from: "YYYY-MM-01", to: "YYYY-MM-<lastDay>" }
export function monthRange(yearMonth: string): { from: string; to: string } {
  const parts = yearMonth.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    throw new Error(`invalid yearMonth: ${yearMonth}`);
  }
  const lastDay = new Date(year, month, 0).getDate();
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

export function spanDays(startAt: string, endAt: string): number {
  const startDay = new Date(startAt.slice(0, 10));
  const endDay = new Date(endAt.slice(0, 10));
  const diffMs = endDay.getTime() - startDay.getTime();
  return Math.max(1, Math.round(diffMs / 86_400_000) + 1);
}

export function formatRange(startAt: string, endAt: string): string {
  const startTime = startAt.slice(11, 16);
  const endTime = endAt.slice(11, 16);
  if (startTime === endTime) return startTime;
  return `${startTime}–${endTime}`;
}
