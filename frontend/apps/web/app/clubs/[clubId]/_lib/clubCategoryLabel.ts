import type { ClubCategory } from '@duing/types';

const LABELS: Record<ClubCategory, string> = {
  ACADEMIC: '학술',
  CREATION: '창작',
  ART: '예술',
  SPORTS: '운동',
  VOLUNTEER: '봉사',
  RELIGION: '종교',
  HOBBY: '취미',
  OTHER: '기타',
};

export function clubCategoryLabel(category: ClubCategory): string {
  return LABELS[category];
}
