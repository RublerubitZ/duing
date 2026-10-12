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

/** 백엔드가 먼저 배포한 새 분류 값이면 빈칸 대신 '기타'(#1410 스타일 폴백과 같은 값). */
export function clubCategoryLabel(category: ClubCategory): string {
  return LABELS[category] ?? LABELS.OTHER;
}
