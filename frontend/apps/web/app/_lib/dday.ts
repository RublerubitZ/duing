import { daysUntilKst, parseKstInstant } from '@duing/hooks/datetime';

/**
 * 남은 일수 → D-day 라벨. 모집 표면(홈 티커·탐색·클럽 상세·운영 대시보드) 공용 SSOT —
 * 마감 당일은 항상 'D-day' 다. 'D-0'·'D-DAY' 같은 표면별 변형을 다시 만들지 말 것
 * (화면마다 표기가 갈라졌던 드리프트의 재발 방지).
 */
export function ddayLabel(daysLeft: number): string {
  if (daysLeft === 0) return 'D-day';
  if (daysLeft > 0) return `D-${daysLeft}`;
  return `D+${Math.abs(daysLeft)}`;
}

/** YYYY-MM-DD 형식 endDate 와 today 의 d-Day 표기. KST 캘린더 기준. 파싱 불가 입력은 원문 반환. */
export function computeDday(endDate: string, today: Date): string {
  if (Number.isNaN(parseKstInstant(endDate).getTime())) return endDate;
  return ddayLabel(daysUntilKst(endDate, today));
}
