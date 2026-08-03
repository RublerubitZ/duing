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
