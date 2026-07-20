import { daysUntilKst, parseKstInstant } from '@duing/hooks/datetime';

/** YYYY-MM-DD 형식 endDate 와 today 의 d-Day 표기. KST 캘린더 기준. 파싱 불가 입력은 원문 반환. */
export function computeDday(endDate: string, today: Date): string {
  if (Number.isNaN(parseKstInstant(endDate).getTime())) return endDate;
  const diff = daysUntilKst(endDate, today);
  if (diff === 0) return 'D-day';
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}
