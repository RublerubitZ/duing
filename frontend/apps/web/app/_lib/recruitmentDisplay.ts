import { daysUntilKst, parseKstInstant } from '@duing/hooks/datetime';
import type { RecruitmentDisplayStatus } from '@duing/types';

export function displayStatusLabel(status: RecruitmentDisplayStatus): string {
  switch (status) {
    case 'UPCOMING':
      return '모집예정';
    case 'OPEN':
      return '모집중';
    case 'ALWAYS_OPEN':
      return '상시모집';
    case 'CLOSED':
      return '모집마감';
  }
}

export function recruitmentPeriodLabel(
  startDate: string,
  endDate: string | null,
): string {
  if (endDate === null) {
    return '상시모집';
  }
  return `${startDate} ~ ${endDate}`;
}

/** KST 캘린더 기준 마감까지 남은 일수. endDate 가 null 이거나 파싱 불가면 null. */
export function recruitmentDaysLeft(
  endDate: string | null,
  today: Date = new Date(),
): number | null {
  if (endDate === null) {
    return null;
  }
  if (Number.isNaN(parseKstInstant(endDate).getTime())) {
    return null;
  }
  return daysUntilKst(endDate, today);
}
