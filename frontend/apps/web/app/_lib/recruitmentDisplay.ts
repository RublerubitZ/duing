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

export function recruitmentDaysLeft(
  endDate: string | null,
  today: Date = new Date(),
): number | null {
  if (endDate === null) {
    return null;
  }
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const parts = endDate.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (y === undefined || m === undefined || d === undefined) {
    return null;
  }
  const endUtc = Date.UTC(y, m - 1, d);
  return Math.round((endUtc - todayUtc) / 86_400_000);
}
