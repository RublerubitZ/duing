import type { ClubSummary } from '@duing/types';

import { recruitmentDaysLeft } from './recruitmentDisplay';

/** 마감 임박 노출 윈도우 — 마감 D-7 부터 D-Day 까지만 노출(D-8 이상·마감 완료·상시모집 제외). */
export const CLOSING_SOON_WINDOW_DAYS = 7;

export type ClosingSoonEmphasis = 'danger' | 'warning' | 'default';

export type ClosingSoonItem = {
  id: number;
  name: string;
  daysLeft: number;
  label: string;
  emphasis: ClosingSoonEmphasis;
};

/** 강조 규칙: D-day·D-1 = 위험(danger), D-2·D-3 = 경고(warning), D-4~D-7 = 기본(default). */
export function closingSoonEmphasis(daysLeft: number): ClosingSoonEmphasis {
  if (daysLeft <= 1) return 'danger';
  if (daysLeft <= 3) return 'warning';
  return 'default';
}

/**
 * 모집중 동아리 목록에서 마감 D-7 ~ D-Day 인 항목만 골라 티커 배지용 데이터로 변환한다.
 * 상시모집(endDate=null), 마감 완료(D+N), D-8 이상은 제외하며, 입력 정렬(마감 임박순)은 보존한다.
 */
export function selectClosingSoonClubs(clubs: ClubSummary[], today: Date): ClosingSoonItem[] {
  const items: ClosingSoonItem[] = [];
  for (const club of clubs) {
    const daysLeft = recruitmentDaysLeft(club.activeRecruitment?.endDate ?? null, today);
    if (daysLeft === null || daysLeft < 0 || daysLeft > CLOSING_SOON_WINDOW_DAYS) {
      continue;
    }
    items.push({
      id: club.id,
      name: club.name,
      daysLeft,
      label: daysLeft === 0 ? 'D-day' : `D-${daysLeft}`,
      emphasis: closingSoonEmphasis(daysLeft),
    });
  }
  return items;
}
