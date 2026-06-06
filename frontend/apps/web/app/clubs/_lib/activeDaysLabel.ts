import type { ClubDayOfWeek } from '@duing/types';

const LABELS: Record<ClubDayOfWeek, string> = {
  MONDAY: '월',
  TUESDAY: '화',
  WEDNESDAY: '수',
  THURSDAY: '목',
  FRIDAY: '금',
  SATURDAY: '토',
  SUNDAY: '일',
};

const ORDER: ClubDayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

export function dayLabel(day: ClubDayOfWeek): string {
  return LABELS[day];
}

export function activityScheduleLabel(
  frequency: number | null,
  activeDays: ClubDayOfWeek[],
): string | null {
  const sorted = [...activeDays].sort(
    (left, right) => ORDER.indexOf(left) - ORDER.indexOf(right),
  );
  const daysPart = sorted.map(dayLabel).join('·');

  if (frequency !== null && daysPart) return `주 ${frequency}회 (${daysPart})`;
  if (frequency !== null) return `주 ${frequency}회`;
  if (daysPart) return daysPart;
  return null;
}
